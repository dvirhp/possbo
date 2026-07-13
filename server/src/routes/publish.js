import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import {
  publishToGroup,
  publishToProfile,
} from "../utils/facebook-automation.js";
import {
  savePost,
  getAllPosts,
  getPostsByGroup,
} from "../utils/posts-storage.js";
import {
  sanitizeText,
  imageFileFilter,
  MAX_FILE_SIZE,
} from "../utils/security.js";
import { asyncHandler } from "../utils/async-handler.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("publish");

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

// Require auth for all publish routes
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
};

// Publish a post to a Facebook group
router.post(
  "/",
  requireAuth,
  upload.array("images", 10),
  asyncHandler(async (req, res) => {
    const { groupUrl, groupName, text, anonymous, location, title } = req.body;
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
    const imagePaths = req.files?.map((f) => f.path) || [];
    // Support legacy single image field
    if (req.file) imagePaths.push(req.file.path);
    const isAnonymous = anonymous === "true";
    try {
      const result = await publishToGroup(
        groupUrl,
        sanitizedText,
        imagePaths[0] || null,
        {
          anonymous: isAnonymous,
          location: sanitizedLocation,
          images: imagePaths,
          userId: req.user.id,
        },
      );

      const saved = await savePost({
        userId: req.user.id,
        groupUrl,
        groupName,
        text: sanitizedText,
        title: title || null,
        postUrl: result.postUrl,
        screenshot: result.screenshot,
        anonymous: isAnonymous,
        location: sanitizedLocation,
        imagePaths,
      });
      log.info("Post saved", { postId: saved.id, postUrl: saved.postUrl });

      res.json({ ...result, savedPost: saved });
    } catch (err) {
      // Only delete images on error - otherwise they're kept for PostMedia records
      for (const p of imagePaths) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      throw err;
    }
  }),
);

// Get all published posts history
router.get("/history", requireAuth, async (req, res) => {
  const { groupUrl } = req.query;
  const posts = groupUrl
    ? await getPostsByGroup(groupUrl)
    : await getAllPosts(req.user.id);
  res.json({ success: true, posts });
});

// Publish to user's personal profile
router.post(
  "/profile",
  requireAuth,
  upload.array("images", 10),
  asyncHandler(async (req, res) => {
    const { text, location, title } = req.body;
    if (!text) {
      return res
        .status(400)
        .json({ success: false, error: "text is required" });
    }
    const sanitizedText = sanitizeText(text);
    if (!sanitizedText) {
      return res
        .status(400)
        .json({ success: false, error: "Text is invalid or too long" });
    }
    const sanitizedLocation = location ? sanitizeText(location, 200) : null;
    const imagePaths = req.files?.map((f) => f.path) || [];

    try {
      const result = await publishToProfile(
        sanitizedText,
        imagePaths[0] || null,
        {
          location: sanitizedLocation,
          userId: req.user.id,
        },
      );

      const saved = await savePost({
        userId: req.user.id,
        groupUrl: "https://www.facebook.com/profile",
        groupName: "פרופיל אישי",
        text: sanitizedText,
        title: title || null,
        postUrl: result.postUrl,
        screenshot: result.screenshot,
        anonymous: false,
        location: sanitizedLocation,
        imagePaths,
      });

      res.json({ ...result, savedPost: saved });
    } catch (err) {
      for (const p of imagePaths) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      throw err;
    }
  }),
);

export default router;
