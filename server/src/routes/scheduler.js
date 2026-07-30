import express from "express";
import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../utils/auth-middleware.js";
import { uploadFields } from "../utils/upload-service.js";
import campaignsRouter from "./campaigns.js";
import analyticsRouter from "./analytics.js";
import { dispatchPublicationNotification } from "../utils/notification-service.js";

const router = express.Router();

// Mount sub-routers
router.use(campaignsRouter);
router.use(analyticsRouter);

const campaignUpload = uploadFields("", [
  { name: "images", maxCount: 10 },
  { name: "igMedia_FEED", maxCount: 5 },
  { name: "igMedia_STORY", maxCount: 5 },
  { name: "igMedia_REEL", maxCount: 5 },
]);

// ─── Schedule a post for publishing ──────────────────────

/**
 * POST /api/scheduler/schedule
 * Body: { postId, groupIds, scheduledAt, frequency?, intervalValue?, intervalUnit? }
 *
 * Creates PostGroup + PostGroupSchedule + PublicationJob entries.
 */
router.post(
  "/schedule",
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      postId,
      groupIds,
      scheduledAt,
      frequency,
      intervalValue,
      intervalUnit,
      campaignType,
      recurringDays,
      recurringTime,
    } = req.body;

    if (!postId || !groupIds?.length || !scheduledAt) {
      return res.status(400).json({
        error: "postId, groupIds, and scheduledAt are required",
      });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: "scheduledAt is not a valid date" });
    }
    if (scheduledDate <= new Date()) {
      return res
        .status(400)
        .json({ error: "scheduledAt must be in the future" });
    }

    // Verify post belongs to user
    const post = await prisma.post.findFirst({
      where: { id: postId, userId: req.user.id },
    });
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Verify user has active Facebook session
    if (!req.user.facebookStorageState) {
      return res.status(400).json({
        error: "NO_FACEBOOK_SESSION",
        message: "נדרשת התחברות לפייסבוק לפני תזמון פוסטים",
      });
    }

    const frequencyType = frequency || "ONCE";
    const results = [];

    for (const groupId of groupIds) {
      // Create or get PostGroup
      const postGroup = await prisma.postGroup.upsert({
        where: { postId_groupId: { postId, groupId } },
        create: {
          postId,
          groupId,
          userId: req.user.id,
        },
        update: { isEnabled: true },
      });

      // Create schedule
      const schedule = await prisma.postGroupSchedule.create({
        data: {
          postGroupId: postGroup.id,
          frequencyType,
          intervalValue: intervalValue || null,
          intervalUnit: intervalUnit || null,
          startAt: scheduledDate,
          nextRunAt: scheduledDate,
          isActive: true,
        },
      });

      // Create immediate publication job
      const job = await prisma.publicationJob.create({
        data: {
          postGroupId: postGroup.id,
          scheduledAt: scheduledDate,
        },
      });

      results.push({
        postGroupId: postGroup.id,
        scheduleId: schedule.id,
        jobId: job.id,
      });
    }

    // Update post status and campaign fields
    await prisma.post.update({
      where: { id: postId },
      data: {
        status: "ACTIVE",
        ...(campaignType && { campaignType }),
        ...(recurringDays && { recurringDays }),
        ...(recurringTime && { recurringTime }),
      },
    });

    await dispatchPublicationNotification({
      userId: req.user.id,
      event: "schedule",
      postTitle: post.title || post.content?.slice(0, 80),
      platform: "FACEBOOK",
      scheduledAt: scheduledDate,
    }).catch(() => {});

    res.json({
      success: true,
      message: `תוזמנו ${results.length} פרסומים`,
      scheduled: results,
    });
  }),
);

// ─── Get user's scheduled jobs ───────────────────────────

router.get(
  "/jobs",
  requireAuth,
  asyncHandler(async (req, res) => {
    const jobs = await prisma.publicationJob.findMany({
      where: {
        postGroup: { userId: req.user.id },
        status: { in: ["PENDING", "RUNNING"] },
      },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        lastError: true,
        targetType: true,
        platform: true,
        postGroup: {
          select: {
            id: true,
            post: { select: { id: true, title: true, content: true } },
            group: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
    });

    res.json({ success: true, jobs });
  }),
);

// ─── Get publication history ─────────────────────────────

router.get(
  "/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const history = await prisma.publicationHistory.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        postId: true,
        groupId: true,
        publishedAt: true,
        externalPostUrl: true,
        screenshotUrl: true,
        status: true,
        errorMessage: true,
        targetType: true,
        platform: true,
        post: {
          select: {
            id: true,
            title: true,
            content: true,
            media: { orderBy: { orderIndex: "asc" }, select: { url: true } },
          },
        },
        group: { select: { id: true, name: true, memberCount: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 50,
    });

    // Include screenshot info and post images
    const cleaned = history.map((h) => ({
      ...h,
      postUrl: h.externalPostUrl || null,
      groupMemberCount: h.group?.memberCount || 0,
      post: h.post
        ? {
            ...h.post,
            images: h.post.media?.map((m) => m.url) || [],
          }
        : h.post,
      hasScreenshot: !!h.screenshotUrl && h.screenshotUrl !== "stored",
    }));

    res.json({ success: true, history: cleaned });
  }),
);

// ─── Get single publication by ID ────────────────────────

router.get(
  "/history/:pubId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const pub = await prisma.publicationHistory.findFirst({
      where: { id: req.params.pubId, userId: req.user.id },
      include: {
        post: {
          select: {
            id: true,
            title: true,
            content: true,
            isAnonymous: true,
            location: true,
            media: { orderBy: { orderIndex: "asc" }, select: { url: true } },
          },
        },
        group: { select: { id: true, name: true } },
      },
    });

    if (!pub) return res.status(404).json({ error: "Publication not found" });

    const publication = {
      ...pub,
      postUrl: pub.externalPostUrl || null,
      post: pub.post
        ? { ...pub.post, images: pub.post.media?.map((m) => m.url) || [] }
        : pub.post,
      status: "SUCCESS",
      hasScreenshot: !!pub.screenshotUrl && pub.screenshotUrl !== "stored",
    };

    res.json({ success: true, publication });
  }),
);

// ─── Delete publication history entry ────────────────────

router.delete(
  "/history/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const entry = await prisma.publicationHistory.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    await prisma.publicationHistory.delete({ where: { id } });

    res.json({ success: true, message: "הרשומה נמחקה" });
  }),
);

// ─── Cancel a scheduled job ──────────────────────────────

router.delete(
  "/jobs/:jobId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const job = await prisma.publicationJob.findFirst({
      where: {
        id: jobId,
        postGroup: { userId: req.user.id },
      },
    });

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (job.status !== "PENDING") {
      return res
        .status(400)
        .json({ error: "Only pending jobs can be cancelled" });
    }

    await prisma.publicationJob.update({
      where: { id: jobId },
      data: { status: "CANCELLED", completedAt: new Date() },
    });

    res.json({ success: true, message: "Job cancelled" });
  }),
);

// ─── Get user notifications ──────────────────────────────

router.get(
  "/notifications",
  requireAuth,
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({ success: true, notifications });
  }),
);

// ─── Mark notifications as read ──────────────────────────

router.patch(
  "/notifications/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });

    res.json({ success: true });
  }),
);

// ─── Get session status ──────────────────────────────────

router.get(
  "/session-status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const hasSession = !!req.user.facebookStorageState;

    res.json({
      success: true,
      hasActiveSession: hasSession,
      message: hasSession
        ? "חיבור פייסבוק פעיל"
        : "נדרשת התחברות מחדש לפייסבוק",
    });
  }),
);

export default router;
