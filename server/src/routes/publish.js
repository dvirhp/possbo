import express from "express";
import fs from "fs";
import prisma from "../config/prisma.js";
import {
  publishToGroup,
  publishToProfile,
} from "../utils/facebook-automation.js";
import {
  savePost,
  getAllPosts,
  getPostsByGroup,
} from "../utils/posts-storage.js";
import { sanitizeText } from "../utils/security.js";
import { asyncHandler } from "../utils/async-handler.js";
import { createLogger } from "../utils/logger.js";
import { requireAuth } from "../utils/auth-middleware.js";
import { uploadImages } from "../utils/upload-service.js";
const log = createLogger("publish");

const router = express.Router();

// Publish a post to a Facebook group
router.post(
  "/",
  requireAuth,
  uploadImages(),
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
      // Record failed publication in history
      try {
        let group = await prisma.group.findFirst({ where: { url: groupUrl } });
        if (!group) {
          const fbId = groupUrl.match(/groups\/([^/?]+)/)?.[1] || null;
          group = await prisma.group.create({
            data: {
              name: groupName || groupUrl,
              url: groupUrl,
              externalGroupId: fbId,
            },
          });
        }
        // Record the failed attempt inside a transaction
        await prisma.$transaction(async (tx) => {
          const post = await tx.post.create({
            data: {
              userId: req.user.id,
              title: title || null,
              content: sanitizedText,
              status: "DRAFT",
              isAnonymous: isAnonymous,
              location: sanitizedLocation || null,
            },
          });
          const postGroup = await tx.postGroup.create({
            data: { postId: post.id, groupId: group.id, userId: req.user.id },
          });
          await tx.publicationHistory.create({
            data: {
              postId: post.id,
              groupId: group.id,
              userId: req.user.id,
              postGroupId: postGroup.id,
              publishedAt: new Date(),
              status: "FAILED",
              errorMessage: err.message || "Unknown error",
            },
          });
        });
      } catch (dbErr) {
        log.error("Failed to record failed publication", {
          error: dbErr.message,
        });
      }
      // Clean up images
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
  uploadImages(),
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
      // Record failed profile publication
      try {
        let group = await prisma.group.findFirst({
          where: { url: "https://www.facebook.com/profile" },
        });
        if (!group) {
          group = await prisma.group.create({
            data: {
              name: "פרופיל אישי",
              url: "https://www.facebook.com/profile",
            },
          });
        }
        const post = await prisma.post.create({
          data: {
            userId: req.user.id,
            title: title || null,
            content: sanitizedText,
            status: "FAILED",
            isAnonymous: false,
            location: sanitizedLocation || null,
          },
        });
        // Wrap dependent creates in a transaction
        await prisma.$transaction(async (tx) => {
          const postGroup = await tx.postGroup.create({
            data: { postId: post.id, groupId: group.id, userId: req.user.id },
          });
          await tx.publicationHistory.create({
            data: {
              postId: post.id,
              groupId: group.id,
              userId: req.user.id,
              postGroupId: postGroup.id,
              targetType: "PROFILE",
              publishedAt: new Date(),
              status: "FAILED",
              errorMessage: err.message || "Unknown error",
            },
          });
        });
      } catch (dbErr) {
        log.error("Failed to record failed profile publication", {
          error: dbErr.message,
        });
      }
      for (const p of imagePaths) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      throw err;
    }
  }),
);

export default router;
