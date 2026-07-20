import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  imageFileFilter,
  MAX_FILE_SIZE,
  safeFilename,
} from "../utils/security.js";
import { requireAuth } from "../utils/auth-middleware.js";
import {
  refreshSinglePublicationMetrics,
  scrapeUserPublicationMetrics,
  savePublicationMetrics,
  refreshInstagramMetrics,
} from "../utils/metrics-scraper.js";
import { triggerImmediateProcess } from "../jobs/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => cb(null, safeFilename(file.mimetype)),
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: imageFileFilter,
});

const router = express.Router();

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

// ─── Combined dashboard data (single request for all dashboard data) ─────
const dashboardCache = new Map(); // userId → { data, ts }
const CACHE_TTL = 30_000; // 30 seconds

router.get(
  "/dashboard-data",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Serve from cache if fresh
    const cached = dashboardCache.get(userId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json(cached.data);
    }
    // All data in one request — parallel queries for speed
    const [
      jobs,
      history,
      publishedCount,
      campaigns,
      fbGroups,
      templates,
      topPostsWithMetrics,
      publishedPerPost,
    ] = await Promise.all([
      // Jobs
      prisma.publicationJob.findMany({
        where: {
          postGroup: { userId },
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
      }),
      // History
      prisma.publicationHistory.findMany({
        where: { userId },
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
        },
        orderBy: { publishedAt: "desc" },
        take: 20,
      }),
      // Published count
      prisma.publicationHistory.count({
        where: { userId, status: "SUCCESS" },
      }),
      // Campaigns (recent posts — dashboard shows limited set)
      prisma.post.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          content: true,
          templateName: true,
          imageUrl: true,
          campaignType: true,
          status: true,
          isPaused: true,
          isAnonymous: true,
          location: true,
          recurringDays: true,
          recurringTime: true,
          recurringTimes: true,
          recurringStart: true,
          recurringEnd: true,
          dayTimes: true,
          publishToProfile: true,
          instagramEnabled: true,
          instagramPublishType: true,
          createdAt: true,
          updatedAt: true,
          media: {
            orderBy: { orderIndex: "asc" },
            select: { url: true, igType: true, mediaType: true },
          },
          postGroups: {
            select: {
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
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      // Saved Facebook groups
      prisma.facebookGroup.findMany({
        where: { userId },
        select: {
          groupId: true,
          groupName: true,
          groupImage: true,
          memberCount: true,
          privacyType: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      // Templates
      prisma.postTemplate.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      }),
      // Top posts with metrics (likes/comments) — include all successful publications
      prisma.publicationHistory.findMany({
        where: {
          userId,
          status: "SUCCESS",
          OR: [
            { externalPostUrl: { not: null } },
            { externalPostId: { not: null } },
          ],
        },
        include: {
          post: {
            select: {
              id: true,
              title: true,
              content: true,
              instagramPublishType: true,
            },
          },
          group: { select: { id: true, name: true } },
          metrics: {
            orderBy: { collectedAt: "desc" },
            take: 1,
            select: { likesCount: true, commentsCount: true },
          },
        },
        orderBy: { publishedAt: "desc" },
        take: 50,
      }),
      // Per-post published counts
      prisma.publicationHistory.groupBy({
        by: ["postId"],
        where: { userId, status: "SUCCESS" },
        _count: { id: true },
      }),
    ]);

    // Build per-post published count map
    const publishedCountMap = new Map();
    publishedPerPost.forEach((entry) => {
      publishedCountMap.set(entry.postId, entry._count.id);
    });

    // Stats — scheduledCount from jobs array, groupsCount from fbGroups
    const stats = {
      scheduledCount: jobs.length,
      groupsCount: fbGroups.length,
      publishedCount,
    };

    // Format history — enrich with campaign/group data we already have
    const campaignMap = new Map();
    const groupMap = new Map();
    campaigns.forEach((c) => {
      campaignMap.set(c.id, c);
      c.postGroups.forEach((pg) => {
        if (pg.group) groupMap.set(pg.group.id, pg.group);
      });
    });
    fbGroups.forEach((g) => {
      if (!groupMap.has(g.groupId))
        groupMap.set(g.groupId, {
          id: g.groupId,
          name: g.groupName,
          memberCount: g.memberCount,
        });
    });

    const cleanedHistory = history.map((h) => {
      const post = campaignMap.get(h.postId);
      const group = groupMap.get(h.groupId);
      return {
        ...h,
        postUrl: h.externalPostUrl || null,
        groupName:
          h.targetType === "INSTAGRAM"
            ? "אינסטגרם"
            : h.targetType === "PROFILE"
              ? "פרופיל אישי"
              : group?.name || "",
        groupMemberCount: group?.memberCount || 0,
        post: post
          ? {
              id: post.id,
              title: post.title,
              content: post.content,
              images: post.media?.map((m) => m.url) || [],
            }
          : null,
        group: group
          ? { id: group.id, name: group.name, memberCount: group.memberCount }
          : null,
        hasScreenshot: !!h.screenshotUrl && h.screenshotUrl !== "stored",
      };
    });

    // Format campaigns
    const formattedCampaigns = campaigns.map((post) => {
      const groupNames = post.postGroups.map((pg) => pg.group?.name || "");
      const hasActiveSchedule = post.postGroups.some(
        (pg) => pg.schedules.length > 0,
      );

      let displayStatus;
      if (post.isPaused) displayStatus = "paused";
      else if (post.status === "DRAFT") displayStatus = "draft";
      else if (post.campaignType === "BOTH") displayStatus = "both";
      else if (post.campaignType === "RECURRING") displayStatus = "recurring";
      else if (hasActiveSchedule) displayStatus = "scheduled";
      else displayStatus = "active";

      return {
        id: post.id,
        title: post.title,
        content: post.content,
        templateName: post.templateName || null,
        imageUrl: post.imageUrl || post.media?.[0]?.url || null,
        imageCount:
          post.media?.filter((m) => !m.igType).length ||
          (post.imageUrl ? 1 : 0),
        images:
          post.media?.filter((m) => !m.igType).map((m) => m.url) ||
          (post.imageUrl ? [post.imageUrl] : []),
        igTypeMedia: {
          FEED:
            post.media
              ?.filter((m) => m.igType === "FEED")
              .map((m) => ({ url: m.url, mediaType: m.mediaType })) || [],
          STORY:
            post.media
              ?.filter((m) => m.igType === "STORY")
              .map((m) => ({ url: m.url, mediaType: m.mediaType })) || [],
          REEL:
            post.media
              ?.filter((m) => m.igType === "REEL")
              .map((m) => ({ url: m.url, mediaType: m.mediaType })) || [],
        },
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
        publishToProfile: post.publishToProfile || false,
        instagramEnabled: post.instagramEnabled || false,
        instagramPublishType: post.instagramPublishType || null,
        publishedCount: publishedCountMap.get(post.id) || 0,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        scheduledAt:
          post.postGroups
            .map((pg) => pg.schedules?.[0]?.nextRunAt)
            .filter(Boolean)
            .sort((a, b) => new Date(a) - new Date(b))[0] || null,
        postUrl: null,
      };
    });

    // Derive recentCampaigns from campaigns (no extra queries)
    const mapRecentPost = (p) => ({
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
        p.campaignType === "BOTH"
          ? "both"
          : p.campaignType === "RECURRING"
            ? "recurring"
            : p.postGroups?.some((pg) => pg.schedules?.length > 0)
              ? "scheduled"
              : "now",
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
    const drafts = campaigns.filter((p) => p.status === "DRAFT").slice(0, 10);
    const recentActive = campaigns
      .filter((p) => p.status === "ACTIVE" || p.status === "ARCHIVED")
      .slice(0, 10);

    // Derive group post counts from history we already have
    const groupPostCounts = {};
    for (const h of history) {
      if (h.status === "SUCCESS" && h.group?.id) {
        groupPostCounts[h.group.id] = (groupPostCounts[h.group.id] || 0) + 1;
      }
    }

    // Format saved groups (use fbGroups memberCount for template reach too)
    const fbMemberMap = {};
    const formattedGroups = fbGroups.map((g) => {
      fbMemberMap[g.groupId] = g.memberCount || 0;
      return {
        id: g.groupId,
        name: g.groupName,
        image: g.groupImage,
        url: `https://www.facebook.com/groups/${g.groupId}`,
        memberCount: g.memberCount || null,
        privacyType: g.privacyType || null,
        postsCount: groupPostCounts[g.groupId] || 0,
        scheduledCount: 0,
      };
    });

    // Format templates with reach (use fbGroups memberCount)
    const enrichedTemplates = templates.map((t) => ({
      ...t,
      totalReach: (t.groupIds || []).reduce(
        (sum, id) => sum + (fbMemberMap[id] || 0),
        0,
      ),
    }));

    // Format top posts with metrics
    const formattedTopPosts = topPostsWithMetrics
      .map((pub) => {
        const m = pub.metrics[0];
        // Determine IG type (FEED/STORY/REEL) from post's instagramPublishType or externalPostUrl
        let igType = null;
        if (pub.platform === "INSTAGRAM" || pub.targetType === "INSTAGRAM") {
          const publishType = pub.post?.instagramPublishType || "";
          if (
            publishType.includes("REEL") ||
            pub.externalPostUrl?.includes("/reel/")
          )
            igType = "REEL";
          else if (publishType.includes("STORY")) igType = "STORY";
          else igType = "FEED";
        }
        return {
          id: pub.id,
          postId: pub.post?.id,
          title: pub.post?.title || pub.post?.content?.slice(0, 60) || "",
          groupName: pub.group?.name || "",
          publishedAt: pub.publishedAt,
          likes: m?.likesCount || 0,
          comments: m?.commentsCount || 0,
          platform: pub.platform || "FACEBOOK",
          targetType: pub.targetType || "GROUP",
          igType,
          postUrl: pub.externalPostUrl || null,
        };
      })
      .filter(Boolean);

    const responseData = {
      success: true,
      jobs,
      history: cleanedHistory,
      stats,
      campaigns: formattedCampaigns,
      recentCampaigns: {
        drafts: drafts.map(mapRecentPost),
        history: recentActive.map(mapRecentPost),
      },
      groups: formattedGroups,
      templates: enrichedTemplates,
      topPosts: formattedTopPosts,
    };

    // Cache for subsequent requests
    dashboardCache.set(userId, { data: responseData, ts: Date.now() });

    res.json(responseData);
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
  upload.fields([
    { name: "images", maxCount: 10 },
    { name: "igMedia_FEED", maxCount: 5 },
    { name: "igMedia_STORY", maxCount: 5 },
    { name: "igMedia_REEL", maxCount: 5 },
  ]),
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
      instagramEnabled,
      instagramPublishType,
      instagramPublishTypes,
      igPerTypeSchedules,
      storyMediaMode,
      storyPickedIndex,
      storyCaptions,
      templateName,
    } = req.body;

    // Parse stringified arrays from FormData
    if (typeof groupIds === "string") groupIds = JSON.parse(groupIds);
    if (typeof recurringDays === "string")
      recurringDays = JSON.parse(recurringDays);
    if (typeof recurringTimes === "string")
      recurringTimes = JSON.parse(recurringTimes);
    if (typeof dayTimes === "string") dayTimes = JSON.parse(dayTimes);
    if (typeof instagramPublishTypes === "string")
      instagramPublishTypes = JSON.parse(instagramPublishTypes);
    if (typeof igPerTypeSchedules === "string")
      igPerTypeSchedules = JSON.parse(igPerTypeSchedules);
    if (anonymous === "true") anonymous = true;
    if (anonymous === "false") anonymous = false;
    if (publishToProfile === "true") publishToProfile = true;
    if (publishToProfile === "false") publishToProfile = false;
    if (instagramEnabled === "true") instagramEnabled = true;
    if (instagramEnabled === "false") instagramEnabled = false;
    if (typeof storyPickedIndex === "string")
      storyPickedIndex = parseInt(storyPickedIndex, 10) || 0;
    if (typeof storyCaptions === "string")
      storyCaptions = JSON.parse(storyCaptions);

    // Normalize: prefer instagramPublishTypes (array from client) over singular
    if (!instagramPublishType && instagramPublishTypes) {
      instagramPublishType = Array.isArray(instagramPublishTypes)
        ? instagramPublishTypes.join(",")
        : instagramPublishTypes;
    }

    if (!text) {
      return res.status(400).json({ error: "text is required" });
    }

    // Allow saving without groups (draft only) — unless publishing to profile or Instagram
    if (
      !groupIds?.length &&
      !publishToProfile &&
      !instagramEnabled &&
      scheduleMode &&
      scheduleMode !== "draft"
    ) {
      return res
        .status(400)
        .json({ error: "groupIds are required for scheduled campaigns" });
    }

    // Determine scheduled datetime
    let scheduledAt = null;
    let recurringScheduledAt = null;

    if (
      (scheduleMode === "scheduled" || scheduleMode === "both") &&
      scheduleDate &&
      scheduleTime
    ) {
      scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);
      if (scheduledAt <= new Date()) {
        return res.status(400).json({ error: "תאריך התזמון חייב להיות בעתיד" });
      }
    }

    if (scheduleMode === "recurring" || scheduleMode === "both") {
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
          recurringScheduledAt = startDate;
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
          recurringScheduledAt = new Date(now);
          recurringScheduledAt.setDate(
            recurringScheduledAt.getDate() + daysUntil,
          );
          recurringScheduledAt.setHours(hours, minutes, 0, 0);
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
        recurringScheduledAt = new Date(now);
        recurringScheduledAt.setDate(
          recurringScheduledAt.getDate() + daysUntil,
        );
        recurringScheduledAt.setHours(hours, minutes, 0, 0);
      }

      // For pure recurring mode (not both), use recurringScheduledAt as the primary
      if (scheduleMode === "recurring") {
        scheduledAt = recurringScheduledAt;
      }
    }

    // Create the Post
    const post = await prisma.post.create({
      data: {
        userId,
        title: title || null,
        content: text,
        status:
          scheduledAt || recurringScheduledAt || scheduleMode === "now"
            ? "ACTIVE"
            : "DRAFT",
        isAnonymous: anonymous || false,
        location: location || null,
        publishToProfile: publishToProfile || false,
        instagramEnabled: instagramEnabled || false,
        instagramPublishType: instagramEnabled
          ? instagramPublishType || null
          : null,
        storyMediaMode: instagramEnabled ? storyMediaMode || null : null,
        storyPickedIndex: instagramEnabled ? (storyPickedIndex ?? null) : null,
        storyCaptions:
          instagramEnabled && storyCaptions ? storyCaptions : undefined,
        templateName: templateName || null,
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
        imageUrl: req.files?.images?.length
          ? `/uploads/${req.files.images[0].filename}`
          : null,
      },
    });

    // Save uploaded images as PostMedia (global)
    if (req.files?.images?.length) {
      for (let i = 0; i < req.files.images.length; i++) {
        await prisma.postMedia.create({
          data: {
            postId: post.id,
            mediaType: req.files.images[i].mimetype?.startsWith("video/")
              ? "VIDEO"
              : "IMAGE",
            url: `/uploads/${req.files.images[i].filename}`,
            orderIndex: i,
          },
        });
      }
    }

    // Save per-IG-type media
    for (const igType of ["FEED", "STORY", "REEL"]) {
      const typeFiles = req.files?.[`igMedia_${igType}`];
      if (typeFiles?.length) {
        for (let i = 0; i < typeFiles.length; i++) {
          await prisma.postMedia.create({
            data: {
              postId: post.id,
              mediaType: typeFiles[i].mimetype?.startsWith("video/")
                ? "VIDEO"
                : "IMAGE",
              url: `/uploads/${typeFiles[i].filename}`,
              orderIndex: i,
              igType,
            },
          });
        }
      }
    }

    // Create PostGroup + Schedule + Job for each group
    const results = [];
    for (const groupId of groupIds || []) {
      // Find the Group record (groupId here is the facebook group slug/id)
      let group = await prisma.group.findFirst({
        where: {
          OR: [
            { externalGroupId: groupId },
            { url: `https://www.facebook.com/groups/${groupId}` },
            { url: `https://www.facebook.com/groups/${groupId}/` },
          ],
        },
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
            externalGroupId: groupId,
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
      if (scheduleMode === "now") {
        // Immediate publish — create job scheduled for now
        await prisma.publicationJob.create({
          data: {
            postGroupId: postGroup.id,
            scheduledAt: new Date(),
          },
        });
      } else if (scheduleMode === "both") {
        // Create ONE-TIME schedule + job
        if (scheduledAt) {
          await prisma.postGroupSchedule.create({
            data: {
              postGroupId: postGroup.id,
              frequencyType: "ONCE",
              startAt: scheduledAt,
              nextRunAt: scheduledAt,
              isActive: true,
            },
          });
          await prisma.publicationJob.create({
            data: {
              postGroupId: postGroup.id,
              scheduledAt,
            },
          });
        }

        // Create RECURRING schedule + job
        if (recurringScheduledAt) {
          await prisma.postGroupSchedule.create({
            data: {
              postGroupId: postGroup.id,
              frequencyType: "WEEKLY",
              startAt: recurringScheduledAt,
              nextRunAt: recurringScheduledAt,
              isActive: true,
            },
          });
          await prisma.publicationJob.create({
            data: {
              postGroupId: postGroup.id,
              scheduledAt: recurringScheduledAt,
            },
          });
        }
      } else if (scheduledAt) {
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
    if (publishToProfile) {
      if (scheduleMode === "now") {
        await prisma.publicationJob.create({
          data: {
            postId: post.id,
            scheduledAt: new Date(),
            targetType: "PROFILE",
          },
        });
      } else if (scheduleMode === "both") {
        // One-time profile job
        if (scheduledAt) {
          await prisma.publicationJob.create({
            data: {
              postId: post.id,
              scheduledAt,
              targetType: "PROFILE",
            },
          });
        }
        // Recurring profile job
        if (recurringScheduledAt) {
          await prisma.publicationJob.create({
            data: {
              postId: post.id,
              scheduledAt: recurringScheduledAt,
              targetType: "PROFILE",
            },
          });
        }
      } else if (scheduledAt) {
        await prisma.publicationJob.create({
          data: {
            postId: post.id,
            scheduledAt,
            targetType: "PROFILE",
          },
        });
      }
    }

    // Create Instagram publication jobs if instagramEnabled is true
    if (instagramEnabled) {
      // Verify user has an active Instagram connection
      const igAccount = await prisma.connectedAccount.findFirst({
        where: { userId: req.user.id, provider: "INSTAGRAM", status: "ACTIVE" },
      });
      if (igAccount) {
        const igTypes = Array.isArray(instagramPublishTypes)
          ? instagramPublishTypes
          : instagramPublishType
            ? instagramPublishType.split(",")
            : ["FEED"];

        for (const igType of igTypes) {
          let igScheduledAt = null;
          const typeSchedule = igPerTypeSchedules?.[igType];

          if (typeSchedule && typeSchedule.mode) {
            // Per-type schedule provided
            if (typeSchedule.mode === "now") {
              igScheduledAt = new Date();
            } else if (
              typeSchedule.mode === "scheduled" &&
              typeSchedule.date &&
              typeSchedule.time
            ) {
              igScheduledAt = new Date(
                `${typeSchedule.date}T${typeSchedule.time}:00`,
              );
            } else if (typeSchedule.mode === "recurring") {
              const effectiveTime = Object.values(typeSchedule.dayTimes || {})
                .flat()
                .filter((t) => t?.trim())[0];
              if (effectiveTime && typeSchedule.startDate) {
                igScheduledAt = new Date(
                  `${typeSchedule.startDate}T${effectiveTime}:00`,
                );
              } else if (effectiveTime) {
                igScheduledAt = new Date();
                const [h, m] = effectiveTime.split(":").map(Number);
                igScheduledAt.setHours(h, m, 0, 0);
                if (igScheduledAt <= new Date())
                  igScheduledAt.setDate(igScheduledAt.getDate() + 1);
              }
            }
          } else {
            // Fallback: use global schedule
            igScheduledAt =
              scheduleMode === "now"
                ? new Date()
                : scheduledAt || recurringScheduledAt;
          }

          if (igScheduledAt) {
            await prisma.publicationJob.create({
              data: {
                postId: post.id,
                scheduledAt: igScheduledAt,
                targetType: "INSTAGRAM",
                platform: "INSTAGRAM",
                igPublishType: igType,
              },
            });
          }
        }
      }
    }

    res.json({
      success: true,
      postId: post.id,
      message:
        scheduleMode === "now"
          ? "הפרסום מתבצע כעת..."
          : scheduleMode === "both"
            ? `הקמפיין תוזמן: חד-פעמי ב-${scheduledAt?.toLocaleString("he-IL")} + חוזר`
            : scheduledAt
              ? `הקמפיין תוזמן ל-${scheduledAt.toLocaleString("he-IL")}`
              : "הקמפיין נוצר כטיוטה",
      scheduled: results.length,
    });

    // Trigger immediate processing for "now" mode
    if (scheduleMode === "now") {
      triggerImmediateProcess();
    }
  }),
);

// ─── Get recent drafts and history for restore ──────────

router.get(
  "/campaigns/recent",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const postInclude = {
      media: {
        orderBy: { orderIndex: "asc" },
        select: { url: true, orderIndex: true, igType: true, mediaType: true },
      },
      postGroups: {
        include: {
          group: {
            select: { id: true, name: true, url: true, pictureUrl: true },
          },
          schedules: { where: { isActive: true }, take: 1 },
        },
      },
    };

    // Run both queries in parallel — they are independent
    const [drafts, history] = await Promise.all([
      // Get drafts (incomplete campaigns)
      prisma.post.findMany({
        where: { userId, status: "DRAFT" },
        include: postInclude,
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      // Get last 10 completed/active campaigns for "restore from history"
      prisma.post.findMany({
        where: { userId, status: { in: ["ACTIVE", "ARCHIVED"] } },
        include: postInclude,
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

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
        p.campaignType === "BOTH"
          ? "both"
          : p.campaignType === "RECURRING"
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
      select: {
        id: true,
        title: true,
        content: true,
        templateName: true,
        imageUrl: true,
        campaignType: true,
        status: true,
        isPaused: true,
        isAnonymous: true,
        location: true,
        recurringDays: true,
        recurringTime: true,
        createdAt: true,
        updatedAt: true,
        media: {
          orderBy: { orderIndex: "asc" },
          select: { url: true, igType: true, mediaType: true },
        },
        publicationHistory: {
          where: { status: "SUCCESS" },
          select: { id: true },
        },
        postGroups: {
          select: {
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
      else if (post.campaignType === "BOTH") displayStatus = "both";
      else if (post.campaignType === "RECURRING") displayStatus = "recurring";
      else if (hasPendingJob || hasActiveSchedule) displayStatus = "scheduled";
      else if (hasPublished) displayStatus = "published";
      else displayStatus = "active";

      return {
        id: post.id,
        title: post.title,
        content: post.content,
        templateName: post.templateName || null,
        imageUrl: post.imageUrl || post.media?.[0]?.url || null,
        imageCount:
          post.media?.filter((m) => !m.igType).length ||
          (post.imageUrl ? 1 : 0),
        images:
          post.media?.filter((m) => !m.igType).map((m) => m.url) ||
          (post.imageUrl ? [post.imageUrl] : []),
        igTypeMedia: {
          FEED:
            post.media
              ?.filter((m) => m.igType === "FEED")
              .map((m) => ({ url: m.url, mediaType: m.mediaType })) || [],
          STORY:
            post.media
              ?.filter((m) => m.igType === "STORY")
              .map((m) => ({ url: m.url, mediaType: m.mediaType })) || [],
          REEL:
            post.media
              ?.filter((m) => m.igType === "REEL")
              .map((m) => ({ url: m.url, mediaType: m.mediaType })) || [],
        },
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
        publishedCount: post.publicationHistory?.length || 0,
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
                targetType: true,
                platform: true,
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

    // Fetch Instagram/Profile publication history (not tied to postGroups)
    const directHistory = await prisma.publicationHistory.findMany({
      where: { postId, userId, postGroupId: null },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        status: true,
        publishedAt: true,
        externalPostUrl: true,
        groupId: true,
        targetType: true,
        platform: true,
        metrics: {
          orderBy: { collectedAt: "desc" },
          take: 1,
          select: { likesCount: true, commentsCount: true },
        },
      },
    });

    // Build publication history grouped by group
    const publicationHistory = [
      ...post.postGroups.flatMap((pg) =>
        pg.publicationHistory.map((h) => ({
          id: h.id,
          groupId: pg.group?.id,
          groupName: pg.group?.name || "",
          groupImage: pg.group?.pictureUrl || null,
          status: h.status,
          publishedAt: h.publishedAt,
          postUrl: h.externalPostUrl || null,
          targetType: h.targetType || "GROUP",
          platform: h.platform || "FACEBOOK",
          likes: h.metrics?.[0]?.likesCount || 0,
          comments: h.metrics?.[0]?.commentsCount || 0,
        })),
      ),
      ...directHistory.flatMap((h) => {
        if (
          h.platform === "INSTAGRAM" &&
          post.instagramPublishType?.includes(",")
        ) {
          // Multiple IG types - create separate history entries per type
          const types = post.instagramPublishType.split(",");
          const typeLabels = {
            FEED: "אינסטגרם פוסט",
            STORY: "אינסטגרם סטורי",
            REEL: "אינסטגרם ריל",
          };
          return types.map((type, idx) => ({
            id: `${h.id}_${type}`,
            originalId: h.id,
            groupId: null,
            groupName: typeLabels[type] || "אינסטגרם",
            groupImage: null,
            status: h.status,
            publishedAt: h.publishedAt,
            postUrl: type === "STORY" ? null : h.externalPostUrl || null,
            targetType: "INSTAGRAM",
            platform: "INSTAGRAM",
            igPublishType: type,
            likes: type === "STORY" ? null : h.metrics?.[0]?.likesCount || 0,
            comments:
              type === "STORY" ? null : h.metrics?.[0]?.commentsCount || 0,
          }));
        }
        const igType =
          h.platform === "INSTAGRAM"
            ? post.instagramPublishType || "FEED"
            : null;
        const typeLabels = {
          FEED: "אינסטגרם פוסט",
          STORY: "אינסטגרם סטורי",
          REEL: "אינסטגרם ריל",
        };
        return [
          {
            id: h.id,
            groupId: null,
            groupName:
              h.targetType === "INSTAGRAM"
                ? typeLabels[igType] || "אינסטגרם"
                : h.targetType === "PROFILE"
                  ? "פרופיל אישי"
                  : "",
            groupImage: null,
            status: h.status,
            publishedAt: h.publishedAt,
            postUrl: igType === "STORY" ? null : h.externalPostUrl || null,
            targetType: h.targetType || "INSTAGRAM",
            platform: h.platform || "INSTAGRAM",
            igPublishType: igType,
            likes: igType === "STORY" ? null : h.metrics?.[0]?.likesCount || 0,
            comments:
              igType === "STORY" ? null : h.metrics?.[0]?.commentsCount || 0,
          },
        ];
      }),
    ];

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
      publishToProfile: post.publishToProfile || false,
      instagramEnabled: post.instagramEnabled || false,
      instagramPublishType: post.instagramPublishType || null,
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
  upload.fields([
    { name: "images", maxCount: 10 },
    { name: "igMedia_FEED", maxCount: 5 },
    { name: "igMedia_STORY", maxCount: 5 },
    { name: "igMedia_REEL", maxCount: 5 },
  ]),
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
    const globalFiles = req.files?.images;
    if (globalFiles?.length) {
      await prisma.postMedia.deleteMany({ where: { postId, igType: null } });
      await prisma.post.update({
        where: { id: postId },
        data: { imageUrl: `/uploads/${globalFiles[0].filename}` },
      });
      for (let i = 0; i < globalFiles.length; i++) {
        await prisma.postMedia.create({
          data: {
            postId,
            mediaType: globalFiles[i].mimetype?.startsWith("video/")
              ? "VIDEO"
              : "IMAGE",
            url: `/uploads/${globalFiles[i].filename}`,
            orderIndex: i,
          },
        });
      }
    }

    // Handle per-IG-type media
    for (const igType of ["FEED", "STORY", "REEL"]) {
      const typeFiles = req.files?.[`igMedia_${igType}`];
      if (typeFiles?.length) {
        await prisma.postMedia.deleteMany({ where: { postId, igType } });
        for (let i = 0; i < typeFiles.length; i++) {
          await prisma.postMedia.create({
            data: {
              postId,
              mediaType: typeFiles[i].mimetype?.startsWith("video/")
                ? "VIDEO"
                : "IMAGE",
              url: `/uploads/${typeFiles[i].filename}`,
              orderIndex: i,
              igType,
            },
          });
        }
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
      message: "הקמפיין שוכפל, יש לתזמן אותו מחדש",
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
        publicationHistory: {
          orderBy: { publishedAt: "desc" },
          include: {
            group: { select: { id: true, name: true, pictureUrl: true } },
            metrics: { orderBy: { collectedAt: "desc" }, take: 1 },
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
        images: post.media?.filter((m) => !m.igType).map((m) => m.url) || [],
        igTypeMedia: {
          FEED:
            post.media
              ?.filter((m) => m.igType === "FEED")
              .map((m) => ({ url: m.url, mediaType: m.mediaType })) || [],
          STORY:
            post.media
              ?.filter((m) => m.igType === "STORY")
              .map((m) => ({ url: m.url, mediaType: m.mediaType })) || [],
          REEL:
            post.media
              ?.filter((m) => m.igType === "REEL")
              .map((m) => ({ url: m.url, mediaType: m.mediaType })) || [],
        },
        groups: post.postGroups.map((pg) => ({
          id: pg.group.id,
          name: pg.group.name,
        })),
        publishedCount:
          post.publicationHistory?.filter((h) => h.status === "SUCCESS")
            .length || 0,
        publicationHistory: post.publicationHistory.flatMap((h) => {
          // Instagram with multiple types — split into separate entries
          if (
            h.platform === "INSTAGRAM" &&
            post.instagramPublishType?.includes(",")
          ) {
            const types = post.instagramPublishType.split(",");
            const typeLabels = {
              FEED: "אינסטגרם פוסט",
              STORY: "אינסטגרם סטורי",
              REEL: "אינסטגרם ריל",
            };
            return types.map((type) => ({
              id: `${h.id}_${type}`,
              originalId: h.id,
              status: h.status,
              publishedAt: h.publishedAt,
              groupName: typeLabels[type] || "אינסטגרם",
              groupImage: null,
              platform: "INSTAGRAM",
              targetType: "INSTAGRAM",
              igPublishType: type,
              postUrl: type === "STORY" ? null : h.externalPostUrl || null,
              externalPostId: h.externalPostId || null,
              errorMessage: h.errorMessage || null,
              likes: type === "STORY" ? null : h.metrics?.[0]?.likesCount || 0,
              comments:
                type === "STORY" ? null : h.metrics?.[0]?.commentsCount || 0,
            }));
          }
          // Single IG type or Facebook
          const igType =
            h.platform === "INSTAGRAM"
              ? post.instagramPublishType || "FEED"
              : null;
          const typeLabels = {
            FEED: "אינסטגרם פוסט",
            STORY: "אינסטגרם סטורי",
            REEL: "אינסטגרם ריל",
          };
          return [
            {
              id: h.id,
              status: h.status,
              publishedAt: h.publishedAt,
              groupName:
                h.platform === "INSTAGRAM"
                  ? typeLabels[igType] || "אינסטגרם"
                  : h.targetType === "PROFILE"
                    ? "פרופיל אישי"
                    : h.group?.name || null,
              groupImage: h.group?.pictureUrl || null,
              platform: h.platform || "FACEBOOK",
              targetType: h.targetType || "GROUP",
              igPublishType: igType,
              postUrl: igType === "STORY" ? null : h.externalPostUrl || null,
              externalPostId: h.externalPostId || null,
              errorMessage: h.errorMessage || null,
              likes:
                igType === "STORY" ? null : h.metrics?.[0]?.likesCount || 0,
              comments:
                igType === "STORY" ? null : h.metrics?.[0]?.commentsCount || 0,
            },
          ];
        }),
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

    const pubWhere = {
      userId,
      status: "SUCCESS",
      ...(from || to ? { publishedAt: dateFilter } : {}),
    };

    const [scheduledCount, groupsCount, publishedCount, groupAgg, hourlyRaw] =
      await Promise.all([
        prisma.publicationJob.count({
          where: {
            postGroup: { userId },
            status: { in: ["PENDING", "RUNNING"] },
          },
        }),
        prisma.facebookGroup.count({ where: { userId } }),
        prisma.publicationHistory.count({ where: pubWhere }),
        // Group-level aggregation via Prisma groupBy
        prisma.publicationHistory.groupBy({
          by: ["groupId"],
          where: pubWhere,
          _count: { id: true },
        }),
        // Hourly aggregation via raw SQL for engagement stats
        (() => {
          const params = [userId];
          let dateCondition = "";
          if (from) {
            params.push(new Date(from));
            dateCondition += ` AND ph.published_at >= $${params.length}`;
          }
          if (to) {
            params.push(new Date(to));
            dateCondition += ` AND ph.published_at <= $${params.length}`;
          }
          return prisma.$queryRawUnsafe(
            `SELECT
              EXTRACT(HOUR FROM ph.published_at)::int AS hour,
              COUNT(ph.id)::int AS posts,
              COALESCE(SUM(lm.likes_count), 0)::int AS likes,
              COALESCE(SUM(lm.comments_count), 0)::int AS comments
            FROM publication_history ph
            LEFT JOIN LATERAL (
              SELECT likes_count, comments_count
              FROM publication_metrics pm
              WHERE pm.publication_history_id = ph.id
              ORDER BY pm.collected_at DESC
              LIMIT 1
            ) lm ON true
            WHERE ph.user_id = $1
              AND ph.status = 'SUCCESS'${dateCondition}
            GROUP BY EXTRACT(HOUR FROM ph.published_at)
            ORDER BY hour`,
            ...params,
          );
        })(),
      ]);

    // Resolve group names for group stats (single query for just the names)
    const groupIds = groupAgg.map((g) => g.groupId).filter(Boolean);
    const groupNames =
      groupIds.length > 0
        ? await prisma.group.findMany({
            where: { id: { in: groupIds } },
            select: { id: true, name: true },
          })
        : [];
    const nameMap = Object.fromEntries(groupNames.map((g) => [g.id, g.name]));

    const groupStats = groupAgg
      .map((g) => ({
        id: g.groupId,
        name: nameMap[g.groupId] || "לא ידוע",
        count: g._count.id,
      }))
      .sort((a, b) => b.count - a.count);

    // Format hourly data
    const hourlyData = hourlyRaw
      .filter((h) => h.posts > 0)
      .map((h) => ({
        hour: h.hour,
        label: `${String(h.hour).padStart(2, "0")}:00`,
        likes: h.likes,
        comments: h.comments,
        posts: h.posts,
        avgLikes: Math.round(h.likes / h.posts),
        avgComments: Math.round(h.comments / h.posts),
      }));

    res.json({
      success: true,
      stats: {
        scheduledCount,
        groupsCount,
        publishedCount,
        groupStats,
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

    // Verify publication belongs to user and has a URL or post ID
    const pub = await prisma.publicationHistory.findFirst({
      where: { id: publicationId, userId },
      select: {
        id: true,
        externalPostUrl: true,
        externalPostId: true,
        platform: true,
      },
    });

    if (!pub) {
      return res.status(404).json({ error: "Publication not found" });
    }

    if (!pub.externalPostUrl && !pub.externalPostId) {
      return res
        .status(400)
        .json({
          error: "Publication has no external URL or ID to fetch metrics",
        });
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
    const { sort = "likes", limit = "10", from, to, platform } = req.query;

    // Build date filter for publishedAt
    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to + "T23:59:59");

    // Build platform filter
    const platformFilter = {};
    if (platform === "INSTAGRAM") {
      platformFilter.platform = "INSTAGRAM";
    } else if (platform === "FACEBOOK") {
      platformFilter.platform = "FACEBOOK";
    }

    // Get the latest metric per publication, then rank
    const publications = await prisma.publicationHistory.findMany({
      where: {
        userId,
        status: "SUCCESS",
        OR: [
          { externalPostUrl: { not: null } },
          { externalPostId: { not: null } },
        ],
        ...(from || to ? { publishedAt: dateFilter } : {}),
        ...platformFilter,
      },
      include: {
        post: {
          select: {
            id: true,
            title: true,
            content: true,
            instagramPublishType: true,
          },
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
        let igType = null;
        if (pub.platform === "INSTAGRAM" || pub.targetType === "INSTAGRAM") {
          const publishType = pub.post?.instagramPublishType || "";
          if (
            publishType.includes("REEL") ||
            pub.externalPostUrl?.includes("/reel/")
          )
            igType = "REEL";
          else if (publishType.includes("STORY")) igType = "STORY";
          else igType = "FEED";
        }
        return {
          id: pub.id,
          postId: pub.post?.id,
          title: pub.post?.title || pub.post?.content?.slice(0, 60) || "",
          content: pub.post?.content || "",
          groupName: pub.group?.name || "",
          publishedAt: pub.publishedAt,
          externalPostUrl: pub.externalPostUrl,
          likes: m?.likesCount || 0,
          comments: m?.commentsCount || 0,
          collectedAt: m?.collectedAt || null,
          platform: pub.platform || "FACEBOOK",
          targetType: pub.targetType || "GROUP",
          igType,
          postUrl: pub.externalPostUrl || null,
        };
      })
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
        publishedAt: { gte: thirtyDaysAgo },
        OR: [
          { externalPostUrl: { not: null } },
          { externalPostId: { not: null } },
        ],
      },
      select: {
        id: true,
        externalPostUrl: true,
        externalPostId: true,
        platform: true,
      },
    });

    if (publications.length === 0) {
      return res.json({ success: true, refreshed: 0 });
    }

    // Split into FB (scrape) and IG (Graph API)
    const fbPubs = publications.filter(
      (p) => p.platform !== "INSTAGRAM" && p.externalPostUrl,
    );
    const igPubs = publications.filter(
      (p) => p.platform === "INSTAGRAM" && p.externalPostId,
    );

    let totalRefreshed = 0;

    // Refresh Facebook metrics via Playwright scraping
    if (fbPubs.length > 0) {
      const fbResults = await scrapeUserPublicationMetrics(userId, fbPubs);
      for (const r of fbResults) {
        await savePublicationMetrics(r.publicationId, r.likes, r.comments);
      }
      totalRefreshed += fbResults.length;
    }

    // Refresh Instagram metrics via Graph API
    if (igPubs.length > 0) {
      const igResults = await refreshInstagramMetrics(userId, igPubs);
      for (const r of igResults) {
        await savePublicationMetrics(r.publicationId, r.likes, r.comments);
      }
      totalRefreshed += igResults.length;
    }

    res.json({ success: true, refreshed: totalRefreshed });
  }),
);

export default router;
