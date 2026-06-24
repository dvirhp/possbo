import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../utils/async-handler.js";
import { imageFileFilter, MAX_FILE_SIZE } from "../utils/security.js";

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

    // Override any legacy FAILED statuses and include screenshot info
    const cleaned = history.map((h) => ({
      ...h,
      post: h.post
        ? {
            ...h.post,
            images: h.post.media?.map((m) => m.url) || [],
          }
        : h.post,
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
  upload.array("images", 10),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    let {
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

    // Parse stringified arrays from FormData
    if (typeof groupIds === "string") groupIds = JSON.parse(groupIds);
    if (typeof recurringDays === "string")
      recurringDays = JSON.parse(recurringDays);
    if (anonymous === "true") anonymous = true;
    if (anonymous === "false") anonymous = false;

    if (!text || !groupIds?.length) {
      return res.status(400).json({ error: "text and groupIds are required" });
    }

    // Determine scheduled datetime
    let scheduledAt = null;
    if (scheduleMode === "scheduled" && scheduleDate && scheduleTime) {
      scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);
      if (scheduledAt <= new Date()) {
        return res.status(400).json({ error: "תאריך התזמון חייב להיות בעתיד" });
      }
    } else if (scheduleMode === "recurring" && recurringTime) {
      // For recurring, compute next occurrence
      const now = new Date();
      const [hours, minutes] = recurringTime.split(":").map(Number);
      const today = now.getDay();
      const sortedDays = [...(recurringDays || [])].sort((a, b) => a - b);

      // Find next day that's in the future
      let nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
      let daysUntil = nextDay > today ? nextDay - today : 7 - today + nextDay;
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
        })),
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
        groupStats: Object.values(groupStats).sort((a, b) => b.count - a.count),
      },
    });
  }),
);

export default router;
