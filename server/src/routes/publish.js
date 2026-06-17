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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e6) + ext);
  },
});
const upload = multer({ storage });

const router = express.Router();

// Publish a post to a Facebook group
router.post("/", upload.single("image"), async (req, res) => {
  const { groupUrl, groupName, text, anonymous, location } = req.body;
  if (!groupUrl || !text) {
    return res
      .status(400)
      .json({ success: false, error: "groupUrl and text are required" });
  }
  const imagePath = req.file ? req.file.path : null;
  const isAnonymous = anonymous === "true";
  try {
    const result = await publishToGroup(groupUrl, text, imagePath, {
      anonymous: isAnonymous,
      location,
    });

    // Save post to storage
    const saved = savePost({
      groupUrl,
      groupName,
      text,
      postUrl: result.postUrl,
      screenshot: result.screenshot,
      anonymous: isAnonymous,
      location: location || null,
    });
    console.log(
      "[publish] Post saved with id:",
      saved.id,
      "postUrl:",
      saved.postUrl,
    );

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
    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }
});

// Get all published posts history
router.get("/history", async (req, res) => {
  const { groupUrl } = req.query;
  const posts = groupUrl ? getPostsByGroup(groupUrl) : getAllPosts();
  res.json({ success: true, posts });
});

export default router;
