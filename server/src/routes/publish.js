import express from "express";
import { getAllPosts, getPostsByGroup } from "../utils/posts-storage.js";
import { sanitizeText } from "../utils/security.js";
import { asyncHandler } from "../utils/async-handler.js";
import { createLogger } from "../utils/logger.js";
import { requireAuth } from "../utils/auth-middleware.js";
import { uploadImages } from "../utils/upload-service.js";
import { queueImmediateFacebookPublication } from "../utils/immediate-publication.js";
import {
  dailyLimitResponse,
  getDailyPublishUsage,
  notifyDailyLimitReached,
} from "../utils/daily-publish-limit.js";

const log = createLogger("publish");
const router = express.Router();

function queuedResponse(queued) {
  return {
    success: true,
    queued: true,
    duplicate: queued.duplicate,
    jobId: queued.job.id,
    postId: queued.postId,
    status: queued.job.status,
  };
}

async function rejectWhenDailyLimitReached(req, res, next) {
  const usage = await getDailyPublishUsage(req.user.id, new Date(), {
    includeQueued: true,
  });
  if (!usage.reached) return next();
  await notifyDailyLimitReached(req.user.id, usage);
  return res.status(429).json(dailyLimitResponse(usage));
}

router.post(
  "/",
  requireAuth,
  asyncHandler(rejectWhenDailyLimitReached),
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

    const imagePaths = req.files?.map((file) => file.path) || [];
    if (req.file) imagePaths.push(req.file.path);
    const queued = await queueImmediateFacebookPublication({
      userId: req.user.id,
      targetType: "GROUP",
      groupUrl,
      groupName,
      text: sanitizedText,
      title: title || null,
      anonymous: anonymous === "true",
      location: location ? sanitizeText(location, 200) : null,
      imagePaths,
      idempotencyKey: req.get("Idempotency-Key"),
    });

    log.info("Immediate group publication queued", {
      jobId: queued.job.id,
      postId: queued.postId,
      duplicate: queued.duplicate,
    });
    return res.status(202).json(queuedResponse(queued));
  }),
);

router.get("/history", requireAuth, async (req, res) => {
  const { groupUrl } = req.query;
  const posts = groupUrl
    ? await getPostsByGroup(groupUrl)
    : await getAllPosts(req.user.id);
  res.json({ success: true, posts });
});

router.post(
  "/profile",
  requireAuth,
  asyncHandler(rejectWhenDailyLimitReached),
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

    const imagePaths = req.files?.map((file) => file.path) || [];
    const queued = await queueImmediateFacebookPublication({
      userId: req.user.id,
      targetType: "PROFILE",
      text: sanitizedText,
      title: title || null,
      location: location ? sanitizeText(location, 200) : null,
      imagePaths,
      idempotencyKey: req.get("Idempotency-Key"),
    });

    log.info("Immediate profile publication queued", {
      jobId: queued.job.id,
      postId: queued.postId,
      duplicate: queued.duplicate,
    });
    return res.status(202).json(queuedResponse(queued));
  }),
);

export default router;
