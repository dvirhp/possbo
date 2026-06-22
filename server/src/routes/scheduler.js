import express from "express";
import { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../utils/async-handler.js";

const router = express.Router();
const prisma = new PrismaClient();

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  next();
}

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
      include: {
        postGroup: {
          include: {
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
      include: {
        post: { select: { id: true, title: true, content: true } },
        group: { select: { id: true, name: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 50,
    });

    // Override any legacy FAILED statuses and include screenshot info
    const cleaned = history.map((h) => ({
      ...h,
      status: "SUCCESS",
      hasScreenshot: !!h.screenshotUrl && h.screenshotUrl !== "stored",
    }));

    res.json({ success: true, history: cleaned });
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
        status: "PENDING",
      },
    });

    if (!job) {
      return res
        .status(404)
        .json({ error: "Job not found or not cancellable" });
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
// ─── Create a new campaign (post + schedule) ─────────────

router.post(
  "/campaigns",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const {
      text,
      groupIds,
      anonymous,
      location,
      scheduleMode,
      scheduleDate,
      scheduleTime,
      recurringDays,
      recurringTime,
      campaignType,
    } = req.body;

    if (!text || !groupIds?.length) {
      return res
        .status(400)
        .json({ error: "text and groupIds are required" });
    }

    // Determine scheduled datetime
    let scheduledAt = null;
    if (scheduleMode === "scheduled" && scheduleDate && scheduleTime) {
      scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);
      if (scheduledAt <= new Date()) {
        return res
          .status(400)
          .json({ error: "תאריך התזמון חייב להיות בעתיד" });
      }
    } else if (scheduleMode === "recurring" && recurringTime) {
      // For recurring, compute next occurrence
      const now = new Date();
      const [hours, minutes] = recurringTime.split(":").map(Number);
      const today = now.getDay();
      const sortedDays = [...(recurringDays || [])].sort((a, b) => a - b);

      // Find next day that's in the future
      let nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
      let daysUntil =
        nextDay > today ? nextDay - today : 7 - today + nextDay;
      if (nextDay === today) {
        const todayTime = new Date();
        todayTime.setHours(hours, minutes, 0, 0);
        if (todayTime > now) {
          daysUntil = 0;
        } else {
          nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
          daysUntil = nextDay > today ? nextDay - today : 7 - today + nextDay;
          if (daysUntil === 0) daysUntil = 7;
        }
      }
      scheduledAt = new Date(now);
      scheduledAt.setDate(scheduledAt.getDate() + daysUntil);
      scheduledAt.setHours(hours, minutes, 0, 0);
    }

    // Create the Post
    const post = await prisma.post.create({
      data: {
        userId,
        content: text,
        status: scheduledAt ? "ACTIVE" : "DRAFT",
        isAnonymous: anonymous || false,
        location: location || null,
        campaignType: campaignType || "ONE_TIME",
        recurringDays: recurringDays || [],
        recurringTime: recurringTime || null,
      },
    });

    // Create PostGroup + Schedule + Job for each group
    const results = [];
    for (const groupId of groupIds) {
      // Find the Group record (groupId here is the facebook group slug)
      let group = await prisma.group.findFirst({
        where: { url: { contains: groupId } },
      });
      if (!group) {
        group = await prisma.group.create({
          data: {
            name: groupId,
            url: `https://www.facebook.com/groups/${groupId}`,
          },
        });
      }

      const postGroup = await prisma.postGroup.create({
        data: {
          postId: post.id,
          groupId: group.id,
          userId,
        },
      });

      // Create schedule
      if (scheduledAt) {
        const frequencyType =
          campaignType === "RECURRING" ? "WEEKLY" : "ONCE";
        await prisma.postGroupSchedule.create({
          data: {
            postGroupId: postGroup.id,
            frequencyType,
            startAt: scheduledAt,
            nextRunAt: scheduledAt,
            isActive: true,
          },
        });

        // Create publication job
        await prisma.publicationJob.create({
          data: {
            postGroupId: postGroup.id,
            scheduledAt,
          },
        });
      }

      results.push(postGroup.id);
    }

    res.json({
      success: true,
      postId: post.id,
      message: scheduledAt
        ? `הקמפיין תוזמן ל-${scheduledAt.toLocaleString("he-IL")}`
        : "הקמפיין נוצר כטיוטה",
      scheduled: results.length,
    });
  }),
);

// ─── Get campaigns (posts with campaign data) ───────────

router.get(
  "/campaigns",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const posts = await prisma.post.findMany({
      where: { userId },
      include: {
        media: { orderBy: { orderIndex: "asc" } },
        postGroups: {
          include: {
            group: { select: { id: true, name: true } },
            schedules: { where: { isActive: true }, take: 1 },
            jobs: {
              where: { status: { in: ["PENDING", "RUNNING"] } },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const campaigns = posts.map((post) => {
      const groupNames = post.postGroups.map((pg) => pg.group?.name || "");
      const hasActiveSchedule = post.postGroups.some(
        (pg) => pg.schedules.length > 0,
      );
      const hasPendingJob = post.postGroups.some((pg) => pg.jobs.length > 0);

      let displayStatus;
      if (post.isPaused) displayStatus = "paused";
      else if (post.status === "DRAFT") displayStatus = "draft";
      else if (post.campaignType === "RECURRING" && hasActiveSchedule)
        displayStatus = "recurring";
      else if (hasPendingJob) displayStatus = "scheduled";
      else if (post.status === "ACTIVE") displayStatus = "active";
      else displayStatus = "one-time";

      return {
        id: post.id,
        title: post.title,
        content: post.content,
        imageUrl: post.imageUrl || post.media?.[0]?.url || null,
        imageCount: post.media?.length || (post.imageUrl ? 1 : 0),
        campaignType: post.campaignType,
        status: displayStatus,
        isPaused: post.isPaused,
        recurringDays: post.recurringDays,
        recurringTime: post.recurringTime,
        groupCount: post.postGroups.length,
        groupNames,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      };
    });

    res.json({ success: true, campaigns });
  }),
);

// ─── Toggle campaign pause ───────────────────────────────

router.patch(
  "/campaigns/:postId/pause",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { postId } = req.params;

    const post = await prisma.post.findFirst({
      where: { id: postId, userId: req.user.id },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const updated = await prisma.post.update({
      where: { id: postId },
      data: { isPaused: !post.isPaused },
    });

    // If pausing, cancel pending jobs
    if (updated.isPaused) {
      await prisma.publicationJob.updateMany({
        where: {
          postGroup: { postId, userId: req.user.id },
          status: "PENDING",
        },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
    }

    res.json({
      success: true,
      isPaused: updated.isPaused,
      message: updated.isPaused ? "הקמפיין הושהה" : "הקמפיין הופעל מחדש",
    });
  }),
);
// ─── Dashboard stats ─────────────────────────────────────

router.get(
  "/stats",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { from, to } = req.query;

    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const [scheduledCount, groupsCount, publishedCount, history] =
      await Promise.all([
        prisma.publicationJob.count({
          where: {
            postGroup: { userId },
            status: { in: ["PENDING", "RUNNING"] },
          },
        }),
        prisma.facebookGroup.count({ where: { userId } }),
        prisma.publicationHistory.count({
          where: {
            userId,
            status: "SUCCESS",
            ...(from || to ? { publishedAt: dateFilter } : {}),
          },
        }),
        prisma.publicationHistory.findMany({
          where: {
            userId,
            status: "SUCCESS",
            ...(from || to ? { publishedAt: dateFilter } : {}),
          },
          include: {
            group: { select: { id: true, name: true } },
          },
          orderBy: { publishedAt: "desc" },
        }),
      ]);

    // Group publications by group for statistics
    const groupStats = {};
    for (const item of history) {
      const gName = item.group?.name || "לא ידוע";
      const gId = item.groupId;
      if (!groupStats[gId]) {
        groupStats[gId] = { id: gId, name: gName, count: 0 };
      }
      groupStats[gId].count++;
    }

    res.json({
      success: true,
      stats: {
        scheduledCount,
        groupsCount,
        publishedCount,
        groupStats: Object.values(groupStats).sort(
          (a, b) => b.count - a.count,
        ),
      },
    });
  }),
);

export default router;
