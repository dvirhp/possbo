import express from "express";
import fs from "fs";
import path from "path";
import axios from "axios";
import prisma from "../config/prisma.js";
import {
  bootstrapFacebookSession,
  captureGroupScreenshot,
  scrapeMyGroups,
} from "../utils/facebook-automation.js";
import {
  startFacebookRemoteConnect,
  getFacebookRemoteConnectStatus,
  cancelFacebookRemoteConnect,
} from "../services/facebook-remote-connect.js";
import { queueImmediateFacebookPublication } from "../utils/immediate-publication.js";
import { createLogger } from "../utils/logger.js";
import {
  refreshGroupsMetadataForUser,
  isRefreshInProgress,
  getRefreshProgress,
} from "../jobs/group-metadata-refresh.js";
import { isAllowedUrl, sanitizeText } from "../utils/security.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../utils/auth-middleware.js";
import { uploadSingle, uploadsDir } from "../utils/upload-service.js";
import { persistUpload } from "../services/object-storage.js";
import { withUserPublishLock } from "../utils/user-publish-lock.js";
import { reconcileFacebookGroupHierarchy } from "../services/facebook-group-hierarchy.js";

const router = express.Router();
const log = createLogger("groups");

const groupImagesDir = path.join(uploadsDir, "groups");

/**
 * Download a Facebook group image and save locally.
 * Returns the local path (e.g. /uploads/groups/abc123.jpg) or null on failure.
 */
async function downloadGroupImage(fbImageUrl, groupId) {
  if (!fbImageUrl || !fbImageUrl.startsWith("http")) return null;

  try {
    if (!fs.existsSync(groupImagesDir)) {
      fs.mkdirSync(groupImagesDir, { recursive: true });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(fbImageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36",
        Referer: "https://www.facebook.com/",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    const ext = contentType.includes("png")
      ? ".png"
      : contentType.includes("webp")
        ? ".webp"
        : ".jpg";

    const filename = `${groupId.replace(/[^a-zA-Z0-9_-]/g, "_")}${ext}`;
    const filePath = path.join(groupImagesDir, filename);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    await persistUpload(filePath, `groups/${filename}`, contentType);

    return `/uploads/groups/${filename}`;
  } catch (error) {
    log.warn("Could not persist Facebook group image", {
      groupId,
      error: error.message,
    });
    return null;
  }
}

// Search for Facebook group
router.post("/search", requireAuth, async (req, res) => {
  try {
    const { groupName } = req.body;
    const user = req.user;

    if (!user.facebookAccessToken) {
      return res.status(400).json({ error: "No Facebook access token" });
    }

    // Search for groups using Facebook Graph API
    await axios.get(`https://graph.facebook.com/v18.0/search`, {
      params: {
        q: groupName,
        type: "group",
        access_token: user.facebookAccessToken,
      },
    });

    // Get user's groups to find matches
    const userGroupsResponse = await axios.get(
      `https://graph.facebook.com/v18.0/me/groups`,
      {
        params: {
          fields: "id,name,picture",
          access_token: user.facebookAccessToken,
        },
      },
    );

    const userGroups = userGroupsResponse.data.data || [];
    const matchedGroup = userGroups.find(
      (g) => g.name.toLowerCase() === groupName.toLowerCase(),
    );

    if (matchedGroup) {
      // Save to database
      await prisma.facebookGroup.upsert({
        where: {
          userId_groupId: { userId: user.id, groupId: matchedGroup.id },
        },
        update: { groupImage: matchedGroup.picture?.data?.url },
        create: {
          userId: user.id,
          groupId: matchedGroup.id,
          groupName: matchedGroup.name,
          groupImage: matchedGroup.picture?.data?.url,
        },
      });

      return res.json({
        success: true,
        group: matchedGroup,
        message: `Found group: ${matchedGroup.name}`,
      });
    }

    res.json({ success: false, message: "Group not found in your groups" });
  } catch (error) {
    createLogger("groups").error("Error searching groups", error);
    // Graph API can fail for non-approved permissions or account restrictions.
    // Return a controlled response so UI doesn't break on repeated searches.
    res.status(200).json({
      success: false,
      message: "Facebook Graph search unavailable for this account/app mode",
    });
  }
});

// Refresh screenshot by running authenticated automation and persisting result
router.get(
  "/refresh-screenshot",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { groupName = "פשפשוק - רכב" } = req.query;
    if (!req.user?.facebookAccessToken) {
      return res
        .status(400)
        .json({ success: false, error: "No Facebook access token" });
    }

    let targetUrl = null;
    try {
      const groupsRes = await axios.get(
        "https://graph.facebook.com/v18.0/me/groups",
        {
          params: {
            fields: "id,name",
            access_token: req.user.facebookAccessToken,
          },
        },
      );
      const groups = groupsRes.data?.data || [];
      const normalized = String(groupName).trim().toLowerCase();
      const matched =
        groups.find(
          (g) =>
            String(g.name || "")
              .trim()
              .toLowerCase() === normalized,
        ) ||
        groups.find((g) =>
          String(g.name || "")
            .toLowerCase()
            .includes(normalized),
        );
      if (matched?.id) {
        targetUrl = `https://www.facebook.com/groups/${matched.id}`;
      }
    } catch (lookupError) {
      createLogger("groups").warn(
        "Group lookup failed, falling back to search URL",
        { error: lookupError.message },
      );
    }

    const screenshot = await captureGroupScreenshot(
      groupName,
      req.user.facebookAccessToken,
      targetUrl,
      req.user.id,
    );

    await prisma.facebookGroup.upsert({
      where: {
        userId_groupId: {
          userId: req.user.id,
          groupId: "pshpshuk-rehev-auto",
        },
      },
      update: {
        groupName,
        screenshot,
      },
      create: {
        userId: req.user.id,
        groupId: "pshpshuk-rehev-auto",
        groupName,
        screenshot,
      },
    });

    res.json({
      success: true,
      groupName,
      screenshot,
    });
  }),
);

// Bootstrap Facebook session for the logged-in user
router.post(
  "/session/remote/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await startFacebookRemoteConnect(req.user.id);
    if (result.status === "busy") {
      return res.status(409).json(result);
    }
    return res.status(result.status === "waiting" ? 201 : 202).json(result);
  }),
);

router.get(
  "/session/remote/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(getFacebookRemoteConnectStatus(req.user.id));
  }),
);

router.delete(
  "/session/remote",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await cancelFacebookRemoteConnect(req.user.id));
  }),
);

router.post(
  "/session/bootstrap",
  requireAuth,
  asyncHandler(async (req, res) => {
    const lockResult = await withUserPublishLock(
      req.user.id,
      () => bootstrapFacebookSession(req.user.id),
      { leaseMs: 6 * 60 * 1000 },
    );
    if (!lockResult.acquired) {
      return res.status(409).json({ error: "FACEBOOK_OPERATION_IN_PROGRESS" });
    }
    res.json({
      success: true,
      message: "Facebook session saved successfully",
    });
  }),
);

// Scrape user's groups from Facebook using Playwright
router.get(
  "/scrape-my-groups",
  requireAuth,
  asyncHandler(async (req, res) => {
    const lockResult = await withUserPublishLock(req.user.id, async () =>
      scrapeMyGroups(req.user.id),
    );
    if (!lockResult.acquired) {
      return res.status(409).json({ error: "FACEBOOK_OPERATION_IN_PROGRESS" });
    }
    const groups = lockResult.value;
    let previousCount = 0;

    // Smart sync: compare old vs new, preserve posts for groups that still exist
    if (req.user) {
      const userId = req.user.id;
      const newGroupIds = new Set(
        groups.filter((g) => g.id && g.name).map((g) => g.id),
      );

      // Get existing groups from DB
      const existingGroups = await prisma.facebookGroup.findMany({
        where: { userId },
      });
      previousCount = existingGroups.length;
      // Delete groups that no longer exist (and their related data)
      // A transient Facebook scroll/network failure can return a partial list.
      // Never interpret a sharply smaller scrape as hundreds of group removals.
      const scrapeLooksComplete =
        existingGroups.length === 0 ||
        newGroupIds.size >= Math.floor(existingGroups.length * 0.8);
      const groupsToDelete = scrapeLooksComplete
        ? existingGroups.filter((g) => !newGroupIds.has(g.groupId))
        : [];
      if (!scrapeLooksComplete) {
        log.warn("Skipping Facebook group removals after partial scrape", {
          userId,
          previousCount: existingGroups.length,
          scrapedCount: newGroupIds.size,
        });
      }
      for (const g of groupsToDelete) {
        // Find Group record by URL pattern for this facebook group
        const dbGroup = await prisma.group.findFirst({
          where: {
            OR: [
              { url: `https://www.facebook.com/groups/${g.groupId}` },
              { url: `https://www.facebook.com/groups/${g.groupId}/` },
            ],
          },
        });
        if (dbGroup) {
          // Delete publication history, post groups, and posts for this group+user
          const postGroups = await prisma.postGroup.findMany({
            where: { groupId: dbGroup.id, userId },
          });
          for (const pg of postGroups) {
            await prisma.publicationHistory.deleteMany({
              where: { postGroupId: pg.id },
            });
          }
          await prisma.postGroup.deleteMany({
            where: { groupId: dbGroup.id, userId },
          });
          // Remove only this user's canonical membership. The Group row may
          // still be shared by other users and must not be deleted here.
          await prisma.userGroup.deleteMany({
            where: { groupId: dbGroup.id, userId },
          });
        }
        // Delete the FacebookGroup record
        await prisma.facebookGroup.deleteMany({ where: { id: g.id } });
      }

      // Upsert in small concurrent batches. Doing three sequential DB round
      // trips for hundreds of groups kept Chromium and the HTTP request alive
      // for minutes on production and could exhaust the Starter container.
      const validGroups = groups.filter((g) => g.id && g.name);
      const batchSize = 10;
      for (let offset = 0; offset < validGroups.length; offset += batchSize) {
        const batch = validGroups.slice(offset, offset + batchSize);
        await Promise.all(batch.map(async (g) => {
          // On update: only overwrite memberCount/privacyType if we have new values
          const updateData = {
            groupName: g.name,
            ...(g.image && { groupImage: g.image }),
          };
          if (g.memberCount) updateData.memberCount = g.memberCount;
          if (g.privacyType) updateData.privacyType = g.privacyType;

          await prisma.facebookGroup.upsert({
            where: {
              userId_groupId: { userId, groupId: g.id },
            },
            update: updateData,
            create: {
              userId,
              groupId: g.id,
              groupName: g.name,
              groupImage: g.image || null,
              memberCount: g.memberCount || null,
              privacyType: g.privacyType || null,
            },
          });

          if (!prisma.group?.upsert || !prisma.userGroup?.upsert) return;
          const canonicalGroup = await prisma.group.upsert({
            where: { externalGroupId: g.id },
            update: {
              name: g.name,
              url: `https://www.facebook.com/groups/${g.id}`,
              ...(g.memberCount && { memberCount: g.memberCount }),
              ...(g.privacyType && { privacyType: g.privacyType }),
            },
            create: {
              name: g.name,
              url: `https://www.facebook.com/groups/${g.id}`,
              externalGroupId: g.id,
              memberCount: g.memberCount || null,
              privacyType: g.privacyType || null,
            },
          });
          await prisma.userGroup.upsert({
            where: {
              userId_groupId: { userId, groupId: canonicalGroup.id },
            },
            update: {},
            create: { userId, groupId: canonicalGroup.id },
          });
        }));
      }

      // Download images in background (don't block the response)
      const groupsToDownload = groups.filter(
        (g) => g.image && g.image.includes("fbcdn.net"),
      );
      if (groupsToDownload.length > 0) {
        log.info(
          `Downloading ${groupsToDownload.length} group images in background...`,
        );
        (async () => {
          for (const g of groupsToDownload) {
            try {
              const localPath = await downloadGroupImage(g.image, g.id);
              if (localPath) {
                await prisma.facebookGroup.updateMany({
                  where: { userId, groupId: g.id },
                  data: { groupImage: localPath },
                });
              }
            } catch {
              /* skip */
            }
          }
          log.info("Group images download complete");
        })();
      }
      await reconcileFacebookGroupHierarchy(userId);
    }

    if (prisma.groupSyncHistory?.create) {
      await prisma.groupSyncHistory.create({ data: { userId: req.user.id, groupsFound: groups.length, groupsAdded: Math.max(0, groups.length - previousCount), groupsRemoved: Math.max(0, previousCount - groups.length), status: "SUCCESS" } });
    }
    res.json({ success: true, groups });
  }),
);

// Get user's Facebook groups
router.get(
  "/my-groups",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user;

    if (!user.facebookAccessToken) {
      return res.status(400).json({ error: "No Facebook access token" });
    }

    const response = await axios.get(
      `https://graph.facebook.com/v18.0/me/groups`,
      {
        params: {
          fields: "id,name,picture,icon",
          access_token: user.facebookAccessToken,
        },
      },
    );

    res.json(response.data.data || []);
  }),
);

// Get saved groups from database
router.get(
  "/saved",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const groups = await prisma.facebookGroup.findMany({
      where: { userId },
      select: {
        groupId: true,
        groupName: true,
        groupImage: true,
        memberCount: true,
        privacyType: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Get publication/scheduled counts per group in parallel using count queries
    const groupUrls = groups.map(
      (g) => `https://www.facebook.com/groups/${g.groupId}`,
    );

    const linkedGroups = await prisma.group.findMany({
      where: { url: { in: groupUrls } },
      select: {
        url: true,
        _count: {
          select: {
            publicationHistory: { where: { userId, status: "SUCCESS" } },
          },
        },
        postGroups: {
          where: {
            userId,
            post: {
              status: "ACTIVE",
              campaignType: { in: ["RECURRING", "SCHEDULED"] },
            },
          },
          select: { id: true },
        },
      },
    });

    // Build lookup: groupId → { postsCount, scheduledCount }
    const statsMap = {};
    for (const lg of linkedGroups) {
      const match = lg.url?.match(/groups\/([^/]+)/);
      if (!match) continue;
      const gId = match[1];
      statsMap[gId] = {
        postsCount: lg._count.publicationHistory,
        scheduledCount: lg.postGroups.length,
      };
    }

    // Format to match the scrape response shape the client expects
    const formatted = groups.map((g) => ({
      id: g.groupId,
      name: g.groupName,
      image: g.groupImage,
      url: `https://www.facebook.com/groups/${g.groupId}`,
      memberCount: g.memberCount || null,
      privacyType: g.privacyType || null,
      postsCount: statsMap[g.groupId]?.postsCount || 0,
      scheduledCount: statsMap[g.groupId]?.scheduledCount || 0,
    }));
    res.json({ success: true, groups: formatted });
  }),
);

// Refresh group metadata (member count + privacy type) — runs in background
router.post(
  "/refresh-metadata",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // If already running, return current progress
    if (isRefreshInProgress(userId)) {
      const progress = getRefreshProgress(userId);
      return res.json({ success: true, status: "in_progress", progress });
    }

    // Start in background, return immediately
    refreshGroupsMetadataForUser(userId, { refreshExisting: true }).catch((err) => {
      log.error("Background metadata refresh failed", {
        userId,
        error: err.message,
      });
    });

    res.status(202).json({ success: true, status: "started" });
  }),
);

// Get progress of metadata refresh
router.get(
  "/refresh-metadata/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const progress = getRefreshProgress(userId);
    if (progress) {
      res.json({ success: true, status: "in_progress", progress });
    } else {
      res.json({ success: true, status: "idle" });
    }
  }),
);

// Sync memberCount from FacebookGroup → Group table (one-time fix)
router.post(
  "/sync-member-counts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const fbGroups = await prisma.facebookGroup.findMany({
      where: { userId, memberCount: { not: null } },
      select: { groupId: true, memberCount: true, privacyType: true },
    });

    let synced = 0;
    for (const fg of fbGroups) {
      const url = `https://www.facebook.com/groups/${fg.groupId}`;
      const r = await prisma.group.updateMany({
        where: { url },
        data: { memberCount: fg.memberCount, privacyType: fg.privacyType },
      });
      if (r.count > 0) synced++;
    }

    res.json({ success: true, synced, total: fbGroups.length });
  }),
);

// Get posts for a specific group
router.get(
  "/:groupId/posts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;

    // Find the Group record by exact URL match
    const group = await prisma.group.findFirst({
      where: {
        OR: [
          { url: `https://www.facebook.com/groups/${groupId}` },
          { url: `https://www.facebook.com/groups/${groupId}/` },
        ],
      },
    });

    if (!group) {
      return res.json({ success: true, posts: [] });
    }

    // Get posts for this group by this user
    const postGroups = await prisma.postGroup.findMany({
      where: { groupId: group.id, userId },
      include: {
        post: true,
        publications: {
          orderBy: { publishedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const posts = postGroups.map((pg) => ({
      id: pg.post.id,
      name:
        pg.post.content.substring(0, 80) +
        (pg.post.content.length > 80 ? "..." : ""),
      subtitle: new Date(pg.post.createdAt).toLocaleString("he-IL"),
      url: pg.publications[0]?.externalPostUrl || null,
      text: pg.post.content,
      location: pg.post.location,
      anonymous: pg.post.isAnonymous,
      createdAt: pg.post.createdAt,
      postUrl: pg.publications[0]?.externalPostUrl || null,
      hasScreenshot: !!pg.publications[0]?.screenshotUrl,
    }));

    res.json({ success: true, posts });
  }),
);

// Take screenshot of Facebook group using Playwright with saved session
router.get(
  "/facebook-screenshot",
  asyncHandler(async (req, res) => {
    const { groupName = "פשפשוק - רכב" } = req.query;
    const isUrl = groupName.startsWith("http");
    if (isUrl && !isAllowedUrl(groupName)) {
      return res
        .status(400)
        .json({ success: false, error: "Only Facebook URLs are allowed" });
    }
    const targetUrl = isUrl ? groupName : null;
    const screenshot = await captureGroupScreenshot(
      groupName,
      null,
      targetUrl,
      req.user?.id,
    );
    res.json({
      success: true,
      screenshot,
      groupName,
    });
  }),
);

// Publish a post to a Facebook group
router.post(
  "/publish",
  requireAuth,
  uploadSingle("", "image"),
  asyncHandler(async (req, res) => {
    const { groupUrl, groupName, text, anonymous, location } = req.body;
    if (!groupUrl || !text) {
      return res
        .status(400)
        .json({ success: false, error: "groupUrl and text are required" });
    }
    const sanitizedText = sanitizeText(text);
    if (!sanitizedText) {
      return res
        .status(400)
        .json({ success: false, error: "Text is invalid or too long" });
    }
    const sanitizedLocation = location ? sanitizeText(location, 200) : null;
    const isAnonymous = anonymous === "true";
    const imagePath = req.file ? req.file.path : null;
    const queued = await queueImmediateFacebookPublication({
        userId: req.user.id,
        targetType: "GROUP",
        groupUrl,
        groupName,
        text: sanitizedText,
        anonymous: isAnonymous,
        location: sanitizedLocation,
        imagePaths: imagePath ? [imagePath] : [],
        idempotencyKey: req.get("Idempotency-Key"),
      });
    res.status(202).json({
      success: true,
      queued: true,
      duplicate: queued.duplicate,
      jobId: queued.job.id,
      postId: queued.postId,
      status: queued.job.status,
    });
  }),
);

// Search Facebook Places (for location autocomplete)
router.get(
  "/places",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const user = req.user;

    // Try Facebook Graph API first (if user has access token)
    if (user.facebookAccessToken) {
      try {
        const response = await axios.get(
          `https://graph.facebook.com/v18.0/search`,
          {
            params: {
              q,
              type: "place",
              fields: "name,location,id",
              limit: 10,
              access_token: user.facebookAccessToken,
            },
          },
        );

        const places = (response.data.data || []).map((place) => ({
          id: place.id,
          name: place.name,
          city: place.location?.city || "",
          country: place.location?.country || "",
        }));

        if (places.length > 0) {
          return res.json(places);
        }
      } catch {
        // Fall through to Photon
      }
    }

    // Fallback: Photon geocoder (fast, OSM-based, supports streets + cities)
    try {
      const photonRes = await axios.get("https://photon.komoot.io/api/", {
        params: {
          q,
          limit: 8,
          lat: 32.08,
          lon: 34.78,
        },
        timeout: 5000,
      });

      const features = photonRes.data.features || [];
      const places = features
        .filter((f) => {
          const val = f.properties?.osm_value || "";
          return val !== "construction" && val !== "footway";
        })
        .map((f) => {
          const p = f.properties || {};
          const name = p.name || "";
          const city = p.city || "";
          const state = p.state || "";
          const country = p.country || "";
          const detail = city || state || country;
          return {
            id: String(p.osm_id || Math.random()),
            name,
            city: detail,
            country: city ? country : "",
          };
        });

      // Deduplicate by name+city
      const seen = new Set();
      const unique = places.filter((p) => {
        const key = `${p.name}|${p.city}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      res.json(unique.slice(0, 8));
    } catch {
      res.json([]);
    }
  }),
);

export default router;
