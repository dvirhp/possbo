import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import {
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
router.get("/refresh-screenshot", requireAuth, async (req, res) => {
  const { groupName = "פשפשוק - רכב" } = req.query;
  try {
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
  } catch (error) {
    console.error("Refresh screenshot error:", error.message);
    if (error.message === "FACEBOOK_SESSION_REQUIRED") {
      return res.status(428).json({
        success: false,
        error: "FACEBOOK_SESSION_REQUIRED",
        message:
          "Facebook browser session is not initialized. Run session bootstrap first.",
      });
    }
    res
      .status(500)
      .json({
        success: false,
        error: error.message || "Failed to refresh screenshot",
      });
  }
});

// One-time session bootstrap: instructs user to run setup script
router.post("/session/bootstrap", async (_req, res) => {
  // __dirname = server/src/routes -> go up to server/
  const STORAGE_STATE_PATH = path.join(
    __dirname,
    "..",
    "..",
    ".facebook-storage-state.json",
  );

  // Check if session already exists
  if (fs.existsSync(STORAGE_STATE_PATH)) {
    return res.json({
      success: true,
      message: "Facebook session already initialized",
      sessionExists: true,
    });
  }

  // Guide user to run the setup script
  res.status(428).json({
    success: false,
    error: "FACEBOOK_SESSION_REQUIRED",
    message:
      'Run "npm run bootstrap-session" in the server folder to initialize Facebook session',
    instruction: "בטרמינל בתיקיית server, הרץ: npm run bootstrap-session",
  });
});

// Scrape user's groups from Facebook using Playwright
router.get("/scrape-my-groups", async (req, res) => {
  try {
    const groups = await scrapeMyGroups();

    // Save scraped groups to DB if user is authenticated
    if (req.user) {
      for (const g of groups) {
        if (g.id && g.name) {
          await prisma.facebookGroup.upsert({
            where: {
              userId_groupId: { userId: req.user.id, groupId: g.id },
            },
            update: {
              groupName: g.name,
              groupImage: g.image || null,
            },
            create: {
              userId: req.user.id,
              groupId: g.id,
              groupName: g.name,
              groupImage: g.image || null,
            },
          });
        }
      }
    }

    res.json({ success: true, groups });
  } catch (error) {
    console.error("Scrape my groups error:", error.message);
    if (error.message === "FACEBOOK_SESSION_REQUIRED") {
      return res.status(428).json({
        success: false,
        error: "FACEBOOK_SESSION_REQUIRED",
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user's Facebook groups
router.get("/my-groups", requireAuth, async (req, res) => {
  try {
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
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// Get saved groups from database
router.get("/saved", requireAuth, async (req, res) => {
  try {
    const groups = await prisma.facebookGroup.findMany({
      where: { userId: req.user.id },
    });
    res.json(groups);
  } catch (error) {
    console.error("Error fetching saved groups:", error);
    res.status(500).json({ error: "Failed to fetch saved groups" });
  }
});

// Take screenshot of Facebook group using Playwright with saved session
router.get("/facebook-screenshot", async (req, res) => {
  const { groupName = "פשפשוק - רכב" } = req.query;
  try {
    // If groupName is a URL, validate and pass it as targetUrl directly
    const isUrl = groupName.startsWith("http");
    if (isUrl && !isAllowedUrl(groupName)) {
      return res
        .status(400)
        .json({ success: false, error: "Only Facebook URLs are allowed" });
    }
    const targetUrl = isUrl ? groupName : null;
    const screenshot = await captureGroupScreenshot(groupName, null, targetUrl);
    res.json({
      success: true,
      screenshot,
      groupName,
    });
  } catch (error) {
    console.error("Facebook screenshot error:", error.message);
    if (error.message === "FACEBOOK_SESSION_REQUIRED") {
      return res.status(428).json({
        success: false,
        error: "FACEBOOK_SESSION_REQUIRED",
        message:
          "Facebook browser session is not initialized. Run session bootstrap first.",
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Publish a post to a Facebook group
router.post("/publish", requireAuth, upload.single("image"), async (req, res) => {
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
  } catch (error) {
    console.error("Publish error:", error.message);
    if (error.message === "FACEBOOK_SESSION_REQUIRED") {
      return res
        .status(428)
        .json({ success: false, error: "FACEBOOK_SESSION_REQUIRED" });
    }
    res.status(500).json({ success: false, error: error.message });
  } finally {
    // Clean up uploaded file
    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }
});

export default router;
