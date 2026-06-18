import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { publishToGroup } from "../utils/facebook-automation.js";
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
    const imagePath = req.file ? req.file.path : null;
    const isAnonymous = anonymous === "true";
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
      console.log(
        "[publish] Post saved with id:",
        saved.id,
        "postUrl:",
        saved.postUrl,
      );

      res.json({ ...result, savedPost: saved });
    } finally {
      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
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

export default router;
