import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../utils/async-handler.js";
import { imageFileFilter, MAX_FILE_SIZE } from "../utils/security.js";
import {
  refreshSinglePublicationMetrics,
  scrapeUserPublicationMetrics,
  savePublicationMetrics,
} from "../utils/metrics-scraper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e6) + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: imageFileFilter,
});

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
        post: {
          select: {
            id: true,
            title: true,
            content: true,
            media: { orderBy: { orderIndex: "asc" }, select: { url: true } },
          },
        },
        group: { select: { id: true, name: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 50,
    });

    // Include screenshot info and post images
    const cleaned = history.map((h) => ({
      ...h,
      postUrl: h.externalPostUrl || null,
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
  upload.array("images", 10),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    let {
      title,
      text,
      groupIds,
      anonymous,
      location,
      scheduleMode,
      scheduleDate,
      scheduleTime,
      recurringDays,
      recurringTime,
      recurringTimes,
      dayTimes,
      recurringStartDate,
      recurringEndDate,
      campaignType,
      publishToProfile,
    } = req.body;

    // Parse stringified arrays from FormData
    if (typeof groupIds === "string") groupIds = JSON.parse(groupIds);
    if (typeof recurringDays === "string")
      recurringDays = JSON.parse(recurringDays);
    if (typeof recurringTimes === "string")
      recurringTimes = JSON.parse(recurringTimes);
    if (typeof dayTimes === "string") dayTimes = JSON.parse(dayTimes);
    if (anonymous === "true") anonymous = true;
    if (anonymous === "false") anonymous = false;
    if (publishToProfile === "true") publishToProfile = true;
    if (publishToProfile === "false") publishToProfile = false;

    if (!text) {
      return res.status(400).json({ error: "text is required" });
    }

    // Allow saving without groups (draft only) — unless publishing to profile
    if (
      !groupIds?.length &&
      !publishToProfile &&
      scheduleMode &&
      scheduleMode !== "draft"
    ) {
      return res
        .status(400)
        .json({ error: "groupIds are required for scheduled campaigns" });
    }

    // Determine scheduled datetime
    let scheduledAt = null;
    if (scheduleMode === "scheduled" && scheduleDate && scheduleTime) {
      scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);
      if (scheduledAt <= new Date()) {
        return res.status(400).json({ error: "תאריך התזמון חייב להיות בעתיד" });
      }
    } else if (scheduleMode === "recurring") {
      // Use the first available time from recurringTimes array or fallback to recurringTime
      const effectiveTime =
        (recurringTimes?.length && recurringTimes[0]) || recurringTime;
      if (!effectiveTime) {
        return res.status(400).json({ error: "יש לבחור שעת פרסום" });
      }

      const [hours, minutes] = effectiveTime.split(":").map(Number);

      // If recurringStartDate is provided, use it; otherwise compute next occurrence
      if (recurringStartDate) {
        const startDate = new Date(`${recurringStartDate}T${effectiveTime}:00`);
        if (startDate > new Date()) {
          scheduledAt = startDate;
        } else {
          // Start date is today or past — find next occurrence from today
          const now = new Date();
          const today = now.getDay();
          const sortedDays = [...(recurringDays || [])].sort((a, b) => a - b);
          let nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
          let daysUntil =
            nextDay > today ? nextDay - today : 7 - today + nextDay;
          if (nextDay === today) {
            const todayTime = new Date();
            todayTime.setHours(hours, minutes, 0, 0);
            if (todayTime > now) daysUntil = 0;
            else {
              nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
              daysUntil =
                nextDay > today ? nextDay - today : 7 - today + nextDay;
              if (daysUntil === 0) daysUntil = 7;
            }
          }
          scheduledAt = new Date(now);
          scheduledAt.setDate(scheduledAt.getDate() + daysUntil);
          scheduledAt.setHours(hours, minutes, 0, 0);
        }
      } else {
        // No start date — compute next occurrence from now
        const now = new Date();
        const today = now.getDay();
        const sortedDays = [...(recurringDays || [])].sort((a, b) => a - b);
        let nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
        let daysUntil = nextDay > today ? nextDay - today : 7 - today + nextDay;
        if (nextDay === today) {
          const todayTime = new Date();
          todayTime.setHours(hours, minutes, 0, 0);
          if (todayTime > now) daysUntil = 0;
          else {
            nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
            daysUntil = nextDay > today ? nextDay - today : 7 - today + nextDay;
            if (daysUntil === 0) daysUntil = 7;
          }
        }
        scheduledAt = new Date(now);
        scheduledAt.setDate(scheduledAt.getDate() + daysUntil);
        scheduledAt.setHours(hours, minutes, 0, 0);
      }
    }

    // Create the Post
    const post = await prisma.post.create({
      data: {
        userId,
        title: title || null,
        content: text,
        status: scheduledAt ? "ACTIVE" : "DRAFT",
        isAnonymous: anonymous || false,
        location: location || null,
        publishToProfile: publishToProfile || false,
        campaignType: campaignType || "ONE_TIME",
        recurringDays: recurringDays || [],
        recurringTime: recurringTime || recurringTimes?.[0] || null,
        recurringTimes: recurringTimes || [],
        dayTimes: dayTimes || null,
        recurringStart: recurringStartDate
          ? new Date(`${recurringStartDate}T00:00:00`)
          : null,
        recurringEnd: recurringEndDate
          ? new Date(`${recurringEndDate}T23:59:59`)
          : null,
        imageUrl: req.files?.length
          ? `/uploads/${req.files[0].filename}`
          : null,
      },
    });

    // Save uploaded images as PostMedia
    if (req.files?.length) {
      for (let i = 0; i < req.files.length; i++) {
        await prisma.postMedia.create({
          data: {
            postId: post.id,
            mediaType: "IMAGE",
            url: `/uploads/${req.files[i].filename}`,
            orderIndex: i,
          },
        });
      }
    }

    // Create PostGroup + Schedule + Job for each group
    const results = [];
    for (const groupId of groupIds || []) {
      // Find the Group record (groupId here is the facebook group slug)
      let group = await prisma.group.findFirst({
        where: { url: { contains: groupId } },
      });
      if (!group) {
        // Look up memberCount/privacyType from FacebookGroup
        const fbGroup = await prisma.facebookGroup.findFirst({
          where: { userId, groupId },
          select: { memberCount: true, privacyType: true, groupName: true },
        });
        group = await prisma.group.create({
          data: {
            name: fbGroup?.groupName || groupId,
            url: `https://www.facebook.com/groups/${groupId}`,
            memberCount: fbGroup?.memberCount || null,
            privacyType: fbGroup?.privacyType || null,
          },
        });
      } else if (!group.memberCount) {
        // Sync memberCount from FacebookGroup if missing
        const fbGroup = await prisma.facebookGroup.findFirst({
          where: { userId, groupId },
          select: { memberCount: true, privacyType: true },
        });
        if (fbGroup?.memberCount) {
          group = await prisma.group.update({
            where: { id: group.id },
            data: {
              memberCount: fbGroup.memberCount,
              privacyType: fbGroup.privacyType || group.privacyType,
            },
          });
        }
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
        const frequencyType = campaignType === "RECURRING" ? "WEEKLY" : "ONCE";
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

    // Create a profile publication job if publishToProfile is true
    if (publishToProfile && scheduledAt) {
      await prisma.publicationJob.create({
        data: {
          postId: post.id,
          scheduledAt,
          targetType: "PROFILE",
        },
      });
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

// ─── Get recent drafts and history for restore ──────────

router.get(
  "/campaigns/recent",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Get drafts (incomplete campaigns)
    const drafts = await prisma.post.findMany({
      where: { userId, status: "DRAFT" },
      include: {
        media: { orderBy: { orderIndex: "asc" } },
        postGroups: {
          include: {
            group: {
              select: { id: true, name: true, url: true, pictureUrl: true },
            },
            schedules: { where: { isActive: true }, take: 1 },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });

    // Get last 10 completed/active campaigns for "restore from history"
    const history = await prisma.post.findMany({
      where: { userId, status: { in: ["ACTIVE", "ARCHIVED"] } },
      include: {
        media: { orderBy: { orderIndex: "asc" } },
        postGroups: {
          include: {
            group: {
              select: { id: true, name: true, url: true, pictureUrl: true },
            },
            schedules: { where: { isActive: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const mapPost = (p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      imageUrl: p.media?.[0]?.url || p.imageUrl || null,
      images: p.media?.map((m) => m.url) || [],
      status: p.status,
      isAnonymous: p.isAnonymous,
      location: p.location,
      groups:
        p.postGroups
          ?.map((pg) => ({
            id: pg.group?.id,
            name: pg.group?.name,
            url: pg.group?.url,
            pictureUrl: pg.group?.pictureUrl,
            externalId:
              pg.group?.url?.split("/groups/")?.[1]?.replace(/\/$/, "") ||
              pg.group?.id,
          }))
          .filter((g) => g.name) || [],
      groupNames:
        p.postGroups?.map((pg) => pg.group?.name).filter(Boolean) || [],
      groupCount: p.postGroups?.length || 0,
      campaignType: p.campaignType,
      recurringDays: p.recurringDays || [],
      recurringTime: p.recurringTime,
      recurringTimes: p.recurringTimes || [],
      dayTimes: p.dayTimes || null,
      recurringStart: p.recurringStart,
      recurringEnd: p.recurringEnd,
      scheduleMode:
        p.campaignType === "RECURRING"
          ? "recurring"
          : p.postGroups?.some((pg) => pg.schedules?.length > 0)
            ? "scheduled"
            : "now",
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });

    res.json({
      success: true,
      drafts: drafts.map(mapPost),
      history: history.map(mapPost),
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
            group: {
              select: {
                id: true,
                name: true,
                memberCount: true,
                pictureUrl: true,
              },
            },
            schedules: {
              where: { isActive: true },
              take: 1,
              select: { nextRunAt: true },
            },
            jobs: {
              where: { status: { in: ["PENDING", "RUNNING"] } },
              take: 1,
              select: { scheduledAt: true },
            },
            publicationHistory: {
              orderBy: { publishedAt: "desc" },
              take: 1,
              select: { externalPostUrl: true, status: true },
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
      const hasPublished = post.postGroups.some(
        (pg) => pg.publicationHistory?.[0]?.status === "SUCCESS",
      );

      let displayStatus;
      if (post.isPaused) displayStatus = "paused";
      else if (post.status === "DRAFT") displayStatus = "draft";
      else if (post.campaignType === "RECURRING") displayStatus = "recurring";
      else if (hasPendingJob || hasActiveSchedule) displayStatus = "scheduled";
      else if (hasPublished) displayStatus = "published";
      else if (post.status === "ACTIVE") displayStatus = "active";
      else displayStatus = "one-time";

      return {
        id: post.id,
        title: post.title,
        content: post.content,
        imageUrl: post.imageUrl || post.media?.[0]?.url || null,
        imageCount: post.media?.length || (post.imageUrl ? 1 : 0),
        images:
          post.media?.map((m) => m.url) ||
          (post.imageUrl ? [post.imageUrl] : []),
        campaignType: post.campaignType,
        status: displayStatus,
        isPaused: post.isPaused,
        isAnonymous: post.isAnonymous,
        location: post.location,
        recurringDays: post.recurringDays,
        recurringTime: post.recurringTime,
        groupCount: post.postGroups.length,
        groupNames,
        groups: post.postGroups.map((pg) => ({
          id: pg.group?.id,
          name: pg.group?.name,
          memberCount: pg.group?.memberCount || 0,
          image: pg.group?.pictureUrl || null,
        })),
        totalExposure: post.postGroups.reduce(
          (sum, pg) => sum + (pg.group?.memberCount || 0),
          0,
        ),
        publishedCount: post.postGroups.filter(
          (pg) => pg.publicationHistory?.[0]?.status === "SUCCESS",
        ).length,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        scheduledAt:
          post.postGroups
            .map(
              (pg) => pg.jobs?.[0]?.scheduledAt || pg.schedules?.[0]?.nextRunAt,
            )
            .filter(Boolean)
            .sort((a, b) => new Date(a) - new Date(b))[0] || null,
        postUrl:
          post.postGroups
            .map((pg) => pg.publicationHistory?.[0]?.externalPostUrl)
            .find((u) => u) || null,
      };
    });

    res.json({ success: true, campaigns });
  }),
);

// ─── Get single campaign with publication history ────────

router.get(
  "/campaigns/:postId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await prisma.post.findFirst({
      where: { id: postId, userId },
      include: {
        media: { orderBy: { orderIndex: "asc" } },
        postGroups: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
                memberCount: true,
                pictureUrl: true,
              },
            },
            publicationHistory: {
              orderBy: { publishedAt: "desc" },
              select: {
                id: true,
                status: true,
                publishedAt: true,
                externalPostUrl: true,
                groupId: true,
                metrics: {
                  orderBy: { collectedAt: "desc" },
                  take: 1,
                  select: { likesCount: true, commentsCount: true },
                },
              },
            },
          },
        },
      },
    });

    if (!post) return res.status(404).json({ error: "Post not found" });

    // Build publication history grouped by group
    const publicationHistory = post.postGroups.flatMap((pg) =>
      pg.publicationHistory.map((h) => ({
        id: h.id,
        groupId: pg.group?.id,
        groupName: pg.group?.name || "",
        groupImage: pg.group?.pictureUrl || null,
        status: h.status,
        publishedAt: h.publishedAt,
        postUrl: h.externalPostUrl || null,
        likes: h.metrics?.[0]?.likesCount || 0,
        comments: h.metrics?.[0]?.commentsCount || 0,
      })),
    );

    const campaign = {
      id: post.id,
      title: post.title,
      content: post.content,
      images:
        post.media?.map((m) => m.url) || (post.imageUrl ? [post.imageUrl] : []),
      groups: post.postGroups.map((pg) => ({
        id: pg.group?.id,
        name: pg.group?.name,
        memberCount: pg.group?.memberCount || 0,
        image: pg.group?.pictureUrl || null,
      })),
      publicationHistory,
    };

    res.json({ success: true, campaign });
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
// ─── Update campaign ─────────────────────────────────────

router.put(
  "/campaigns/:postId",
  requireAuth,
  upload.array("images", 10),
  asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await prisma.post.findFirst({
      where: { id: postId, userId },
      include: { postGroups: true },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const {
      text,
      title,
      location,
      campaignType,
      recurringTime,
      scheduleMode,
      scheduleDate,
      scheduleTime,
    } = req.body;
    let { anonymous, groupIds, recurringDays } = req.body;

    // Parse stringified arrays from FormData
    if (typeof groupIds === "string") groupIds = JSON.parse(groupIds);
    if (typeof recurringDays === "string")
      recurringDays = JSON.parse(recurringDays);
    if (anonymous === "true") anonymous = true;
    if (anonymous === "false") anonymous = false;

    // Update post fields
    const updateData = {};
    if (text !== undefined) updateData.content = text;
    if (title !== undefined) updateData.title = title;
    if (anonymous !== undefined) updateData.isAnonymous = anonymous;
    if (location !== undefined) updateData.location = location || null;
    if (campaignType !== undefined) updateData.campaignType = campaignType;
    if (recurringDays !== undefined) updateData.recurringDays = recurringDays;
    if (recurringTime !== undefined)
      updateData.recurringTime = recurringTime || null;

    await prisma.post.update({ where: { id: postId }, data: updateData });

    // If new images uploaded, replace existing media
    if (req.files?.length) {
      await prisma.postMedia.deleteMany({ where: { postId } });
      await prisma.post.update({
        where: { id: postId },
        data: { imageUrl: `/uploads/${req.files[0].filename}` },
      });
      for (let i = 0; i < req.files.length; i++) {
        await prisma.postMedia.create({
          data: {
            postId,
            mediaType: "IMAGE",
            url: `/uploads/${req.files[i].filename}`,
            orderIndex: i,
          },
        });
      }
    }

    // If groupIds provided, sync post groups
    if (groupIds?.length) {
      const existingGroupIds = post.postGroups.map((pg) => pg.groupId);
      const toAdd = groupIds.filter((gid) => !existingGroupIds.includes(gid));
      const toRemove = existingGroupIds.filter(
        (gid) => !groupIds.includes(gid),
      );

      // Remove old groups (cascade deletes schedules + jobs)
      if (toRemove.length) {
        await prisma.postGroup.deleteMany({
          where: { postId, groupId: { in: toRemove } },
        });
      }

      // Add new groups
      for (const groupId of toAdd) {
        await prisma.postGroup.create({
          data: { postId, groupId, userId },
        });
      }

      // Re-schedule if schedule info provided
      if (scheduleMode && scheduleMode !== "now") {
        let scheduledAt = null;
        if (scheduleMode === "scheduled" && scheduleDate && scheduleTime) {
          scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);
        } else if (scheduleMode === "recurring" && recurringTime) {
          const now = new Date();
          const [hours, minutes] = recurringTime.split(":").map(Number);
          const today = now.getDay();
          const sortedDays = [...(recurringDays || [])].sort((a, b) => a - b);
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
              daysUntil =
                nextDay > today ? nextDay - today : 7 - today + nextDay;
              if (daysUntil === 0) daysUntil = 7;
            }
          }
          scheduledAt = new Date(now);
          scheduledAt.setDate(scheduledAt.getDate() + daysUntil);
          scheduledAt.setHours(hours, minutes, 0, 0);
        }

        if (scheduledAt) {
          // Cancel old pending jobs
          await prisma.publicationJob.updateMany({
            where: {
              postGroup: { postId, userId },
              status: "PENDING",
            },
            data: { status: "CANCELLED", completedAt: new Date() },
          });

          // Create new jobs for all current groups
          const currentPostGroups = await prisma.postGroup.findMany({
            where: { postId },
          });
          for (const pg of currentPostGroups) {
            await prisma.publicationJob.create({
              data: { postGroupId: pg.id, scheduledAt },
            });
            await prisma.postGroupSchedule.create({
              data: {
                postGroupId: pg.id,
                frequencyType: campaignType === "RECURRING" ? "WEEKLY" : "ONCE",
                startAt: scheduledAt,
                nextRunAt: scheduledAt,
                isActive: true,
              },
            });
          }

          await prisma.post.update({
            where: { id: postId },
            data: { status: "ACTIVE", isPaused: false },
          });
        }
      }
    }

    res.json({ success: true, message: "הקמפיין עודכן בהצלחה" });
  }),
);

// ─── Delete campaign ─────────────────────────────────────

router.delete(
  "/campaigns/:postId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { postId } = req.params;

    const post = await prisma.post.findFirst({
      where: { id: postId, userId: req.user.id },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    // Cascade delete handles postGroups, schedules, jobs
    await prisma.post.delete({ where: { id: postId } });

    res.json({ success: true, message: "הקמפיין נמחק" });
  }),
);

// ─── Duplicate campaign ──────────────────────────────────

router.post(
  "/campaigns/:postId/duplicate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;

    const original = await prisma.post.findFirst({
      where: { id: postId, userId },
      include: {
        postGroups: { select: { groupId: true } },
        media: { orderBy: { orderIndex: "asc" } },
      },
    });
    if (!original) return res.status(404).json({ error: "Post not found" });

    const newPost = await prisma.post.create({
      data: {
        userId,
        title: original.title ? `${original.title} (עותק)` : null,
        content: original.content,
        status: "DRAFT",
        isAnonymous: original.isAnonymous,
        location: original.location,
        campaignType: original.campaignType,
        recurringDays: original.recurringDays,
        recurringTime: original.recurringTime,
        imageUrl: original.imageUrl,
      },
    });

    // Duplicate media
    for (const m of original.media) {
      await prisma.postMedia.create({
        data: {
          postId: newPost.id,
          url: m.url,
          mediaType: m.mediaType,
          orderIndex: m.orderIndex,
        },
      });
    }

    // Duplicate post groups (without schedules/jobs — user needs to reschedule)
    for (const pg of original.postGroups) {
      await prisma.postGroup.create({
        data: { postId: newPost.id, groupId: pg.groupId, userId },
      });
    }

    res.json({
      success: true,
      postId: newPost.id,
      message: "הקמפיין שוכפל — יש לתזמן אותו מחדש",
    });
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

// ─── Get campaign details for editing ────────────────────

router.get(
  "/campaigns/:postId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { postId } = req.params;

    const post = await prisma.post.findFirst({
      where: { id: postId, userId: req.user.id },
      include: {
        media: { orderBy: { orderIndex: "asc" } },
        postGroups: {
          include: {
            group: { select: { id: true, name: true } },
            schedules: { where: { isActive: true }, take: 1 },
          },
        },
      },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    res.json({
      success: true,
      campaign: {
        id: post.id,
        title: post.title,
        content: post.content,
        isAnonymous: post.isAnonymous,
        location: post.location,
        campaignType: post.campaignType,
        recurringDays: post.recurringDays,
        recurringTime: post.recurringTime,
        isPaused: post.isPaused,
        imageUrl: post.imageUrl,
        media: post.media,
        groups: post.postGroups.map((pg) => ({
          id: pg.group.id,
          name: pg.group.name,
        })),
      },
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
            metrics: {
              orderBy: { collectedAt: "desc" },
              take: 1,
              select: { likesCount: true, commentsCount: true },
            },
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

    // Hourly engagement aggregation for best posting times
    const hourlyEngagement = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, "0")}:00`,
      likes: 0,
      comments: 0,
      posts: 0,
    }));
    for (const item of history) {
      if (!item.publishedAt) continue;
      const h = new Date(item.publishedAt).getHours();
      const m = item.metrics?.[0];
      hourlyEngagement[h].posts += 1;
      hourlyEngagement[h].likes += m?.likesCount || 0;
      hourlyEngagement[h].comments += m?.commentsCount || 0;
    }
    const hourlyData = hourlyEngagement
      .filter((h) => h.posts > 0)
      .map((h) => ({
        ...h,
        avgLikes: Math.round(h.likes / h.posts),
        avgComments: Math.round(h.comments / h.posts),
      }));

    res.json({
      success: true,
      stats: {
        scheduledCount,
        groupsCount,
        publishedCount,
        groupStats: Object.values(groupStats).sort((a, b) => b.count - a.count),
        hourlyEngagement: hourlyData,
      },
    });
  }),
);

// ─── Exposure stats ──────────────────────────────────────

router.get(
  "/exposure",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { from, to } = req.query;

    // Default: last 30 days
    const endDate = to ? new Date(to) : new Date();
    const startDate = from
      ? new Date(from)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel
    const periodLength = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - periodLength);
    const prevEnd = new Date(startDate.getTime() - 1);

    const [exposureData, prevExposureData, topGroups, totalReach] =
      await Promise.all([
        prisma.dailyExposure.findMany({
          where: { userId, date: { gte: startDate, lte: endDate } },
          orderBy: { date: "asc" },
        }),
        prisma.dailyExposure.findMany({
          where: { userId, date: { gte: prevStart, lte: prevEnd } },
        }),
        prisma.facebookGroup.findMany({
          where: { userId, memberCount: { not: null } },
          orderBy: { memberCount: "desc" },
          take: 7,
          select: {
            groupId: true,
            groupName: true,
            memberCount: true,
            groupImage: true,
            privacyType: true,
          },
        }),
        prisma.facebookGroup.aggregate({
          where: { userId, memberCount: { not: null } },
          _sum: { memberCount: true },
        }),
      ]);

    const currentTotal = exposureData.reduce(
      (sum, d) => sum + d.exposureCount,
      0,
    );
    const prevTotal = prevExposureData.reduce(
      (sum, d) => sum + d.exposureCount,
      0,
    );
    const currentPosts = exposureData.reduce(
      (sum, d) => sum + d.postsPublished,
      0,
    );
    const prevPosts = prevExposureData.reduce(
      (sum, d) => sum + d.postsPublished,
      0,
    );

    const changePercent =
      prevTotal > 0
        ? Math.round(((currentTotal - prevTotal) / prevTotal) * 100)
        : currentTotal > 0
          ? 100
          : 0;

    res.json({
      success: true,
      exposure: {
        data: exposureData.map((d) => ({
          date: d.date,
          exposure: d.exposureCount,
          posts: d.postsPublished,
        })),
        currentTotal,
        prevTotal,
        changePercent,
        currentPosts,
        prevPosts,
        totalPotentialReach: totalReach._sum.memberCount || 0,
        topGroups: topGroups.map((g, i) => ({
          id: g.groupId,
          name: g.groupName,
          memberCount: g.memberCount,
          image: g.groupImage,
          privacyType: g.privacyType,
          rank: i + 1,
        })),
      },
    });
  }),
);

// ─── Dashboard KPI stats with period comparison ──────────

router.get(
  "/dashboard-kpis",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { from, to } = req.query;

    const endDate = to ? new Date(to + "T23:59:59") : new Date();
    const startDate = from
      ? new Date(from)
      : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Previous period (same length before startDate)
    const periodMs = endDate.getTime() - startDate.getTime();
    const prevEnd = new Date(startDate.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodMs);

    // Current period: always query live data
    // For posts/published/exposure: sum across the period

    // Always query live data - snapshots are for comparison only
    const [
      currentGroups,
      currentScheduled,
      currentPublishedCount,
      currentPostsCount,
      currentExposureAgg,
      currentLikesAgg,
      currentCommentsAgg,
    ] = await Promise.all([
      prisma.facebookGroup.count({ where: { userId } }),
      prisma.post.count({
        where: {
          userId,
          status: "ACTIVE",
          campaignType: { in: ["RECURRING", "SCHEDULED"] },
        },
      }),
      prisma.publicationHistory.count({
        where: {
          userId,
          status: "SUCCESS",
          publishedAt: { gte: startDate, lte: endDate },
        },
      }),
      prisma.post.count({ where: { userId } }),
      prisma.dailyExposure.aggregate({
        where: { userId, date: { gte: startDate, lte: endDate } },
        _sum: { exposureCount: true },
      }),
      prisma.publicationMetric.aggregate({
        where: {
          publicationHistory: { userId, status: "SUCCESS" },
          collectedAt: { gte: startDate, lte: endDate },
        },
        _sum: { likesCount: true },
      }),
      prisma.publicationMetric.aggregate({
        where: {
          publicationHistory: { userId, status: "SUCCESS" },
          collectedAt: { gte: startDate, lte: endDate },
        },
        _sum: { commentsCount: true },
      }),
    ]);

    const currentPosts = currentPostsCount;
    const currentPublished = currentPublishedCount;
    const currentExposure = currentExposureAgg._sum.exposureCount || 0;
    const currentLikes = currentLikesAgg._sum.likesCount || 0;
    const currentComments = currentCommentsAgg._sum.commentsCount || 0;

    // Previous period
    const [
      prevGroupsSnapshot,
      prevPublishedCount,
      prevPostsCount,
      prevExposureAgg,
      prevLikesAgg,
      prevCommentsAgg,
    ] = await Promise.all([
      prisma.dailyStats.findFirst({
        where: { userId, date: { lte: prevEnd } },
        orderBy: { date: "desc" },
        select: { groupsCount: true, postsCount: true },
      }),
      prisma.publicationHistory.count({
        where: {
          userId,
          status: "SUCCESS",
          publishedAt: { gte: prevStart, lte: prevEnd },
        },
      }),
      prisma.post.count({ where: { userId, createdAt: { lte: prevEnd } } }),
      prisma.dailyExposure.aggregate({
        where: { userId, date: { gte: prevStart, lte: prevEnd } },
        _sum: { exposureCount: true },
      }),
      prisma.publicationMetric.aggregate({
        where: {
          publicationHistory: { userId, status: "SUCCESS" },
          collectedAt: { gte: prevStart, lte: prevEnd },
        },
        _sum: { likesCount: true },
      }),
      prisma.publicationMetric.aggregate({
        where: {
          publicationHistory: { userId, status: "SUCCESS" },
          collectedAt: { gte: prevStart, lte: prevEnd },
        },
        _sum: { commentsCount: true },
      }),
    ]);

    const prevGroupsCount = prevGroupsSnapshot?.groupsCount || currentGroups;
    const prevPosts = prevGroupsSnapshot?.postsCount || prevPostsCount;
    const prevPublished = prevPublishedCount;
    const prevExposure = prevExposureAgg._sum.exposureCount || 0;
    const prevLikes = prevLikesAgg._sum.likesCount || 0;
    const prevComments = prevCommentsAgg._sum.commentsCount || 0;

    const calcChange = (current, prev) => {
      if (!prev || prev === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - prev) / prev) * 100);
    };

    // Save today's snapshot (upsert)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStats = {
      groupsCount: currentGroups,
      postsCount: currentPosts,
      scheduledCount: currentScheduled,
      publishedCount: currentPublished,
      exposureCount: currentExposure,
    };
    await prisma.dailyStats
      .upsert({
        where: { userId_date: { userId, date: today } },
        update: todayStats,
        create: { userId, date: today, ...todayStats },
      })
      .catch(() => {});

    res.json({
      success: true,
      kpis: {
        groups: {
          value: currentGroups,
          change: calcChange(currentGroups, prevGroupsCount),
        },
        posts: {
          value: currentPosts,
          change: calcChange(currentPosts, prevPosts),
        },
        scheduled: { value: currentScheduled, change: 0 },
        published: {
          value: currentPublished,
          change: calcChange(currentPublished, prevPublished),
        },
        exposure: {
          value: currentExposure,
          change: calcChange(currentExposure, prevExposure),
        },
        likes: {
          value: currentLikes,
          change: calcChange(currentLikes, prevLikes),
        },
        comments: {
          value: currentComments,
          change: calcChange(currentComments, prevComments),
        },
      },
    });
  }),
);

// ─── Refresh metrics for a single publication ────────────

router.post(
  "/publications/:publicationId/refresh-metrics",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { publicationId } = req.params;
    const userId = req.user.id;

    // Verify publication belongs to user and has a URL
    const pub = await prisma.publicationHistory.findFirst({
      where: { id: publicationId, userId },
      select: { id: true, externalPostUrl: true },
    });

    if (!pub) {
      return res.status(404).json({ error: "Publication not found" });
    }

    if (!pub.externalPostUrl) {
      return res
        .status(400)
        .json({ error: "Publication has no external URL to scrape" });
    }

    const metrics = await refreshSinglePublicationMetrics(
      userId,
      publicationId,
    );

    res.json({
      success: true,
      metrics: {
        likes: metrics?.likes ?? 0,
        comments: metrics?.comments ?? 0,
      },
    });
  }),
);

// ─── Top posts by engagement (likes / comments) ─────────

router.get(
  "/top-posts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { sort = "likes", limit = "10", from, to } = req.query;

    // Build date filter for publishedAt
    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to + "T23:59:59");

    // Get the latest metric per publication, then rank
    const publications = await prisma.publicationHistory.findMany({
      where: {
        userId,
        status: "SUCCESS",
        metrics: { some: {} },
        ...(from || to ? { publishedAt: dateFilter } : {}),
      },
      include: {
        post: {
          select: { id: true, title: true, content: true },
        },
        group: {
          select: { id: true, name: true },
        },
        metrics: {
          orderBy: { collectedAt: "desc" },
          take: 1,
          select: {
            likesCount: true,
            commentsCount: true,
            collectedAt: true,
          },
        },
      },
    });

    // Flatten to get latest metric per publication and sort
    const withMetrics = publications
      .map((pub) => {
        const m = pub.metrics[0];
        if (!m) return null;
        return {
          id: pub.id,
          postId: pub.post?.id,
          title: pub.post?.title || pub.post?.content?.slice(0, 60) || "",
          groupName: pub.group?.name || "",
          publishedAt: pub.publishedAt,
          externalPostUrl: pub.externalPostUrl,
          likes: m.likesCount,
          comments: m.commentsCount,
          collectedAt: m.collectedAt,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const field = sort === "comments" ? "comments" : "likes";
        return b[field] - a[field];
      })
      .slice(0, parseInt(limit, 10) || 10);

    res.json({ success: true, posts: withMetrics });
  }),
);

// ─── Batch refresh metrics for recent publications ───────

router.post(
  "/refresh-all-metrics",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Get publications from the last 30 days that have external URLs
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const publications = await prisma.publicationHistory.findMany({
      where: {
        userId,
        status: "SUCCESS",
        externalPostUrl: { not: null },
        publishedAt: { gte: thirtyDaysAgo },
      },
      select: { id: true, externalPostUrl: true },
    });

    if (publications.length === 0) {
      return res.json({ success: true, refreshed: 0 });
    }

    const results = await scrapeUserPublicationMetrics(userId, publications);

    // Save all results
    for (const r of results) {
      await savePublicationMetrics(r.publicationId, r.likes, r.comments);
    }

    res.json({ success: true, refreshed: results.length });
  }),
);

export default router;
