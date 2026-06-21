import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import {
  bootstrapFacebookSession,
  captureGroupScreenshot,
  scrapeMyGroups,
  publishToGroup,
} from "../utils/facebook-automation.js";
import { savePost } from "../utils/posts-storage.js";
import {
  isAllowedUrl,
  isValidGroupName,
  sanitizeText,
  imageFileFilter,
  MAX_FILE_SIZE,
} from "../utils/security.js";
import { asyncHandler } from "../utils/async-handler.js";

const uploadsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "uploads",
);
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
};

// Search for Facebook group
router.post("/search", requireAuth, async (req, res) => {
  try {
    const { groupName } = req.body;
    const user = req.user;

    if (!user.facebookAccessToken) {
      return res.status(400).json({ error: "No Facebook access token" });
    }

    // Search for groups using Facebook Graph API
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/search`,
      {
        params: {
          q: groupName,
          type: "group",
          access_token: user.facebookAccessToken,
        },
      },
    );

    const groups = response.data.data || [];

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
    console.error("Error searching groups:", error);
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
      console.warn(
        "Group lookup failed, falling back to search URL:",
        lookupError.message,
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
  "/session/bootstrap",
  requireAuth,
  asyncHandler(async (req, res) => {
    await bootstrapFacebookSession(req.user.id);
    res.json({
      success: true,
      message: "Facebook session saved successfully",
    });
  }),
);

// Scrape user's groups from Facebook using Playwright
router.get(
  "/scrape-my-groups",
  asyncHandler(async (req, res) => {
    const groups = await scrapeMyGroups(req.user?.id);

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
      const existingGroupIds = new Set(existingGroups.map((g) => g.groupId));

      // Delete groups that no longer exist (and their related data)
      const groupsToDelete = existingGroups.filter(
        (g) => !newGroupIds.has(g.groupId),
      );
      for (const g of groupsToDelete) {
        // Find Group record by URL pattern for this facebook group
        const dbGroup = await prisma.group.findFirst({
          where: {
            url: { contains: g.groupId },
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
        }
        // Delete the FacebookGroup record
        await prisma.facebookGroup.delete({ where: { id: g.id } });
      }

      // Upsert groups that exist in the new list
      for (const g of groups) {
        if (g.id && g.name) {
          await prisma.facebookGroup.upsert({
            where: {
              userId_groupId: { userId, groupId: g.id },
            },
            update: {
              groupName: g.name,
              groupImage: g.image || null,
            },
            create: {
              userId,
              groupId: g.id,
              groupName: g.name,
              groupImage: g.image || null,
            },
          });
        }
      }
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
    const groups = await prisma.facebookGroup.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });
    // Format to match the scrape response shape the client expects
    const formatted = groups.map((g) => ({
      id: g.groupId,
      name: g.groupName,
      image: g.groupImage,
      url: `https://www.facebook.com/groups/${g.groupId}`,
    }));
    res.json({ success: true, groups: formatted });
  }),
);

// Get posts for a specific group
router.get(
  "/:groupId/posts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;

    // Find the Group record by URL containing groupId
    const group = await prisma.group.findFirst({
      where: {
        url: { contains: groupId },
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
      name: pg.post.content.substring(0, 80) + (pg.post.content.length > 80 ? "..." : ""),
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
    const screenshot = await captureGroupScreenshot(groupName, null, targetUrl, req.user?.id);
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
  upload.single("image"),
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
  try {
    const result = await publishToGroup(groupUrl, sanitizedText, imagePath, {
      anonymous: isAnonymous,
      location: sanitizedLocation,
      userId: req.user.id,
    });

    const saved = await savePost({
      userId: req.user.id,
      groupUrl,
      groupName,
      text: sanitizedText,
      postUrl: result.postUrl,
      screenshot: result.screenshot,
      anonymous: isAnonymous,
      location: sanitizedLocation,
    });

    res.json({ ...result, savedPost: saved });
    } finally {
      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
  }),
);

export default router;
