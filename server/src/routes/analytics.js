import express from "express";
import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../utils/auth-middleware.js";
import {
  refreshSinglePublicationMetrics,
  scrapeUserPublicationMetrics,
  savePublicationMetrics,
  refreshInstagramMetrics,
} from "../utils/metrics-scraper.js";

const router = express.Router();

// ─── Combined dashboard data (single request for all dashboard data) ─────
const dashboardCache = new Map(); // userId → { data, ts }
const CACHE_TTL = 30_000; // 30 seconds

export function invalidateDashboardCache(userId) {
  dashboardCache.delete(userId);
}

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
      recentDraftPosts,
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
          igPublishType: true,
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
          post: { select: { whatsappTargets: true } },
          publicationJob: { select: { igPublishType: true } },
          metrics: {
            orderBy: { collectedAt: "desc" },
            take: 1,
            select: {
              likesCount: true,
              commentsCount: true,
              sharesCount: true,
              reachCount: true,
              impressionsCount: true,
              viewsCount: true,
              savesCount: true,
              repliesCount: true,
              collectedAt: true,
              totalInteractionsCount: true,
            },
          },
        },
        orderBy: { publishedAt: "desc" },
        take: 500,
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
          whatsappEnabled: true,
          whatsappTargets: true,
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
      // Continue-where-I-left-off must not depend on the general campaign
      // query's 30-row window.
      prisma.post.findMany({
        where: { userId, status: "DRAFT" },
        include: {
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
        },
        orderBy: { updatedAt: "desc" },
        take: 4,
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
          publicationJob: { select: { igPublishType: true } },
          metrics: {
            orderBy: { collectedAt: "desc" },
            take: 1,
            select: {
              likesCount: true,
              commentsCount: true,
              sharesCount: true,
              reachCount: true,
              impressionsCount: true,
              viewsCount: true,
              savesCount: true,
              repliesCount: true,
              collectedAt: true,
              totalInteractionsCount: true,
            },
          },
        },
        orderBy: { publishedAt: "desc" },
      }),
      // Per-post published counts (all statuses, so history always shows)
      prisma.publicationHistory.groupBy({
        by: ["postId"],
        where: { userId },
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
      const igType = h.publicationJob?.igPublishType || null;
      const isActiveStory =
        igType === "STORY" &&
        Date.now() - new Date(h.publishedAt).getTime() < 24 * 60 * 60 * 1000;
      const metric = h.metrics?.[0];
      return {
        ...h,
        postUrl: igType === "STORY" && !isActiveStory ? null : h.externalPostUrl || null,
        igType,
        storyActive: igType === "STORY" ? isActiveStory : null,
        storyExpiresAt:
          igType === "STORY"
            ? new Date(new Date(h.publishedAt).getTime() + 24 * 60 * 60 * 1000)
            : null,
        likes: metric?.likesCount || 0,
        comments: metric?.commentsCount || 0,
        shares: metric?.sharesCount || 0,
        reach: metric?.reachCount || 0,
        views: metric?.viewsCount || metric?.impressionsCount || 0,
        saves: metric?.savesCount || 0,
        replies: metric?.repliesCount || 0,
        interactions: metric?.totalInteractionsCount || 0,
        lastSyncedAt: metric?.collectedAt || null,
        whatsappTargets: Array.isArray(h.post?.whatsappTargets)
          ? h.post.whatsappTargets
          : [],
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
        whatsappEnabled: post.whatsappEnabled || false,
        whatsappTargets: Array.isArray(post.whatsappTargets)
          ? post.whatsappTargets
          : [],
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
      draftData: p.draftData || null,
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
    const drafts = recentDraftPosts;
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
          const publishType =
            pub.publicationJob?.igPublishType ||
            pub.post?.instagramPublishType ||
            "";
          if (
            publishType.includes("REEL") ||
            pub.externalPostUrl?.includes("/reel/")
          )
            igType = "REEL";
          else if (publishType.includes("STORY")) igType = "STORY";
          else igType = "FEED";
        }
        const platform =
          pub.targetType === "WHATSAPP"
            ? "WHATSAPP"
            : pub.targetType === "INSTAGRAM"
              ? "INSTAGRAM"
              : pub.platform || "FACEBOOK";

        return {
          id: pub.id,
          postId: pub.post?.id,
          title: pub.post?.title || pub.post?.content?.slice(0, 60) || "",
          groupName: pub.group?.name || "",
          publishedAt: pub.publishedAt,
          likes: m?.likesCount || 0,
          comments: m?.commentsCount || 0,
          shares: m?.sharesCount || 0,
          reach: m?.reachCount || 0,
          views: m?.viewsCount || m?.impressionsCount || 0,
          saves: m?.savesCount || 0,
          replies: m?.repliesCount || 0,
          interactions: m?.totalInteractionsCount || 0,
          lastSyncedAt: m?.collectedAt || null,
          platform,
          targetType: pub.targetType || "GROUP",
          igType,
          postUrl:
            igType === "STORY" &&
            Date.now() - new Date(pub.publishedAt).getTime() >= 24 * 60 * 60 * 1000
              ? null
              : pub.externalPostUrl || null,
          storyActive:
            igType === "STORY"
              ? Date.now() - new Date(pub.publishedAt).getTime() < 24 * 60 * 60 * 1000
              : null,
        };
      })
      .filter(Boolean);

    // Keep the dashboard payload small while retaining every item the UI can
    // need: WhatsApp is chronological, while Facebook and Instagram are
    // ranked independently by either likes or comments.
    const byPublishedAt = (a, b) =>
      new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
    const byMetric = (field) => (a, b) =>
      (b[field] || 0) - (a[field] || 0) ||
      (b[field === "likes" ? "comments" : "likes"] || 0) -
        (a[field === "likes" ? "comments" : "likes"] || 0) ||
      byPublishedAt(a, b);

    const dashboardTopPosts = [];
    const includedTopPostIds = new Set();
    const addTopPosts = (items) => {
      for (const item of items) {
        if (includedTopPostIds.has(item.id)) continue;
        includedTopPostIds.add(item.id);
        dashboardTopPosts.push(item);
      }
    };

    addTopPosts(
      formattedTopPosts
        .filter((post) => post.platform === "WHATSAPP")
        .sort(byPublishedAt)
        .slice(0, 4),
    );

    for (const platform of ["FACEBOOK", "INSTAGRAM"]) {
      const platformPosts = formattedTopPosts.filter(
        (post) => post.platform === platform,
      );
      addTopPosts([...platformPosts].sort(byMetric("likes")).slice(0, 4));
      addTopPosts([...platformPosts].sort(byMetric("comments")).slice(0, 4));
      addTopPosts([...platformPosts].sort(byMetric("shares")).slice(0, 4));
      addTopPosts([...platformPosts].sort(byMetric("views")).slice(0, 4));
    }

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
      topPosts: dashboardTopPosts,
    };

    // Cache for subsequent requests
    dashboardCache.set(userId, { data: responseData, ts: Date.now() });

    res.json(responseData);
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
  "/whatsapp-stats",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { from, to } = req.query;
    const publishedAt = {};
    if (from) publishedAt.gte = new Date(`${from}T00:00:00`);
    if (to) publishedAt.lte = new Date(`${to}T23:59:59.999`);

    const publications = await prisma.publicationHistory.findMany({
      where: {
        userId,
        status: "SUCCESS",
        ...(from || to ? { publishedAt } : {}),
      },
      select: {
        platform: true,
        targetType: true,
        post: {
          select: {
            whatsappTargets: true,
            instagramPublishType: true,
          },
        },
        group: { select: { memberCount: true } },
        publicationJob: { select: { igPublishType: true } },
        metrics: {
          orderBy: { collectedAt: "desc" },
          take: 1,
          select: {
            likesCount: true,
            commentsCount: true,
            sharesCount: true,
            reachCount: true,
            viewsCount: true,
            impressionsCount: true,
            repliesCount: true,
            totalInteractionsCount: true,
          },
        },
      },
    });

    const platformOf = (publication) =>
      publication.platform ||
      (publication.targetType === "INSTAGRAM"
        ? "INSTAGRAM"
        : publication.targetType === "WHATSAPP"
          ? "WHATSAPP"
          : "FACEBOOK");
    const whatsappPublications = publications.filter(
      (publication) => platformOf(publication) === "WHATSAPP",
    );
    const targetsByPublication = whatsappPublications.map((publication) =>
      Array.isArray(publication.post?.whatsappTargets)
        ? publication.post.whatsappTargets
        : [],
    );
    const allTargets = targetsByPublication.flat();
    const groupIds = [
      ...new Set(
        allTargets
          .filter((target) => target?.type === "group" && target.id)
          .map((target) => target.id),
      ),
    ];
    const broadcastIds = [
      ...new Set(
        allTargets
          .filter((target) => target?.type === "broadcast" && target.id)
          .map((target) => target.id),
      ),
    ];

    const [groups, broadcasts] = await Promise.all([
      groupIds.length
        ? prisma.whatsAppContact.findMany({
            where: { userId, waId: { in: groupIds }, isGroup: true },
            select: { waId: true, participantCount: true },
          })
        : [],
      broadcastIds.length
        ? prisma.whatsAppBroadcastList.findMany({
            where: { userId, id: { in: broadcastIds } },
            select: { id: true, members: true },
          })
        : [],
    ]);

    const groupAudience = new Map(
      groups.map((group) => [group.waId, group.participantCount || 0]),
    );
    const broadcastMembers = new Map(
      broadcasts.map((list) => [
        list.id,
        Array.isArray(list.members) ? list.members : [],
      ]),
    );
    const directRecipientKeys = new Set();
    for (const target of allTargets) {
      if (target?.type === "broadcast") {
        for (const member of broadcastMembers.get(target.id) || []) {
          const key = String(member?.phone || member?.waId || "").replace(
            /[^0-9]/g,
            "",
          );
          if (key) directRecipientKeys.add(key);
        }
      } else if (target?.type !== "group") {
        const key = String(target?.phone || target?.id || "")
          .replace(/@s\.whatsapp\.net$/i, "")
          .replace(/[^0-9]/g, "");
        if (key) directRecipientKeys.add(key);
      }
    }

    const uniqueGroupAudience = groupIds.reduce(
      (sum, id) => sum + (groupAudience.get(id) || 0),
      0,
    );
    const totalDistribution = targetsByPublication.reduce(
      (total, targets) =>
        total +
        targets.reduce((sum, target) => {
          if (target?.type === "group")
            return sum + (groupAudience.get(target.id) || 0);
          if (target?.type === "broadcast")
            return sum + (broadcastMembers.get(target.id)?.length || 0);
          return sum + (target?.id || target?.phone ? 1 : 0);
        }, 0),
      0,
    );
    const metricTotal = (rows, field) =>
      rows.reduce((sum, publication) => {
        const metrics = publication.metrics[0];
        return sum + Number(metrics?.[field] || 0);
      }, 0);
    const instagramPublications = publications.filter(
      (publication) => platformOf(publication) === "INSTAGRAM",
    );
    const facebookPublications = publications.filter(
      (publication) => platformOf(publication) === "FACEBOOK",
    );
    const formats = ["FEED", "REEL", "STORY"].map((type) => {
      const rows = instagramPublications.filter((publication) => {
        const publishType =
          publication.publicationJob?.igPublishType ||
          publication.post?.instagramPublishType ||
          "FEED";
        return publishType.includes(type);
      });
      return {
        type,
        count: rows.length,
        views:
          metricTotal(rows, "viewsCount") ||
          metricTotal(rows, "impressionsCount"),
        interactions: rows.reduce((sum, publication) => {
          const metrics = publication.metrics[0];
          return (
            sum +
            Number(
              metrics?.totalInteractionsCount ||
                (metrics?.likesCount || 0) +
                  (metrics?.commentsCount || 0) +
                  (metrics?.sharesCount || 0) +
                  (metrics?.repliesCount || 0),
            )
          );
        }, 0),
      };
    });

    res.json({
      success: true,
      instagram: {
        count: instagramPublications.length,
        likes: metricTotal(instagramPublications, "likesCount"),
        comments: metricTotal(instagramPublications, "commentsCount"),
        shares: metricTotal(instagramPublications, "sharesCount"),
        views:
          metricTotal(instagramPublications, "viewsCount") ||
          metricTotal(instagramPublications, "impressionsCount"),
        reach: metricTotal(instagramPublications, "reachCount"),
        formats,
      },
      facebook: {
        count: facebookPublications.length,
        likes: metricTotal(facebookPublications, "likesCount"),
        comments: metricTotal(facebookPublications, "commentsCount"),
        exposure: facebookPublications.reduce(
          (sum, publication) =>
            sum + Number(publication.group?.memberCount || 0),
          0,
        ),
      },
      whatsapp: {
        postsSent: whatsappPublications.length,
        groupsReached: groupIds.length,
        peopleReached: uniqueGroupAudience + directRecipientKeys.size,
        totalDistribution,
      },
    });
  }),
);

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

    if (
      pub.platform === "INSTAGRAM" &&
      !pub.externalPostUrl &&
      !pub.externalPostId
    ) {
      return res.status(400).json({
        error: "Publication has no external URL or ID to fetch metrics",
      });
    }

    const metrics = await refreshSinglePublicationMetrics(
      userId,
      publicationId,
    );

    if (!metrics) {
      return res.status(422).json({
        success: false,
        error: "לא ניתן היה לאמת שהקישור מוביל לפוסט הפייסבוק הנכון",
      });
    }

    res.json({
      success: true,
      metrics: {
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares || 0,
        views: metrics.views || 0,
        reach: metrics.reach || 0,
        saves: metrics.saved || 0,
        replies: metrics.replies || 0,
        lastSyncedAt: metrics.lastSyncedAt || new Date(),
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
    } else if (platform === "WHATSAPP") {
      platformFilter.platform = "WHATSAPP";
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
        publicationJob: { select: { igPublishType: true } },
      },
    });

    if (publications.length === 0) {
      return res.json({ success: true, refreshed: 0 });
    }

    // Split into FB (scrape) and IG (Graph API)
    const fbPubs = publications.filter(
      (p) => p.platform !== "INSTAGRAM" && p.externalPostUrl,
    );
    const igPubs = publications
      .filter((p) => p.platform === "INSTAGRAM" && p.externalPostId)
      .map((p) => ({
        ...p,
        igMediaType: p.publicationJob?.igPublishType || "FEED",
      }));

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
        await savePublicationMetrics(
          r.publicationId,
          r.likes,
          r.comments,
          r.shares || 0,
          r.reach || 0,
          r.impressions || 0,
        );
      }
      totalRefreshed += igResults.length;
    }

    res.json({
      success: true,
      refreshed: totalRefreshed,
      lastSyncedAt: totalRefreshed > 0 ? new Date() : null,
    });
  }),
);

export default router;
