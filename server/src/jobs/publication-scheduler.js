import prisma from "../config/prisma.js";
import { Prisma } from "@prisma/client";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import sharp from "sharp";
import {
  publishToGroup,
  publishToProfile,
} from "../utils/facebook-automation.js";
import { decrypt } from "../utils/encryption.js";
import {
  getPublicMediaUrl,
  materializeUploadPath,
  resolveUploadPath,
} from "../utils/media-upload.js";
import { sendInstagramReconnectEmail } from "../utils/mailer.js";
import { dispatchPublicationNotification } from "../utils/notification-service.js";
import { createLogger } from "../utils/logger.js";
import { withUserPublishLock } from "../utils/user-publish-lock.js";
import {
  DAILY_PUBLISH_LIMIT,
  getDailyPublishUsage,
  notifyDailyLimitReached,
} from "../utils/daily-publish-limit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");
const log = createLogger("pub-scheduler");

const JOB_CLAIM_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.PUBLICATION_CLAIM_LIMIT || "10", 10),
);
const USER_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.PUBLICATION_USER_CONCURRENCY || "10", 10),
);
const JOB_LEASE_HEARTBEAT_MS = Math.max(
  5_000,
  Number.parseInt(process.env.PUBLICATION_JOB_HEARTBEAT_MS || "30000", 10),
);

function startJobLeaseHeartbeat(jobId, workerId) {
  let stopped = false;
  let pending = Promise.resolve();
  const refresh = () => {
    pending = prisma.publicationJob
      .updateMany({
        where: { id: jobId, status: "RUNNING", lockedBy: workerId },
        data: { lockedAt: new Date() },
      })
      .catch((error) => {
        log.error("Publication job lease heartbeat failed", error, {
          jobId,
          workerId,
        });
      });
  };
  const timer = setInterval(refresh, JOB_LEASE_HEARTBEAT_MS);
  timer.unref?.();

  return async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  }

  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, items.length) }, () =>
      runNext(),
    ),
  );
  const failedWorker = settled.find((result) => result.status === "rejected");
  if (failedWorker) throw failedWorker.reason;
  return results;
}

async function claimDuePublicationJobs(now, workerId) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw(
      Prisma.sql`
        SELECT id
        FROM "publication_jobs"
        WHERE status = 'PENDING'::"JobStatus"
          AND "scheduled_at" <= ${now}
          AND "locked_at" IS NULL
        ORDER BY "scheduled_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${JOB_CLAIM_LIMIT}
      `,
    );
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return [];

    await tx.publicationJob.updateMany({
      where: {
        id: { in: ids },
        status: "PENDING",
        lockedAt: null,
      },
      data: {
        status: "RUNNING",
        lockedAt: now,
        lockedBy: workerId,
        startedAt: now,
      },
    });
    return ids;
  });
}

// ─── Anti-Detection Configuration ─────────────────────────
const ANTI_DETECT = {
  // Daily jitter range for recurring schedules (seconds)
  DAILY_JITTER_MIN: -180, // -3 minutes
  DAILY_JITTER_MAX: 180, // +3 minutes

  // Delay between consecutive publications for same user (ms)
  DELAY_BASE_MIN: 25_000, // 25 seconds minimum
  DELAY_BASE_MAX: 55_000, // 55 seconds maximum
  DELAY_VARIANCE_MAX: 90_000, // Up to 90s extra variance
  // "Human break" — 20% chance of a longer pause (simulates distraction)
  BREAK_CHANCE: 0.2,
  BREAK_MIN: 120_000, // 2 minutes
  BREAK_MAX: 600_000, // 10 minutes

  // Max delay cap (user requested max 20 min total)
  MAX_DELAY: 20 * 60 * 1000, // 20 minutes

  // Daily publication limit per user
  DAILY_LIMIT: DAILY_PUBLISH_LIMIT,

  // Max concurrent jobs per user in a single batch
  USER_BATCH_SIZE: 1,
};

// ─── Delay Utilities ──────────────────────────────────────

/**
 * Generate a non-linear, human-like delay between publications.
 * Uses weighted randomness — NOT uniform distribution.
 */
function generateHumanDelay() {
  // Base delay (25-55s)
  const base =
    ANTI_DETECT.DELAY_BASE_MIN +
    Math.random() * (ANTI_DETECT.DELAY_BASE_MAX - ANTI_DETECT.DELAY_BASE_MIN);

  // Non-linear variance: squared distribution biases toward shorter delays
  // but occasionally produces longer ones (like a real human)
  const varianceRaw = Math.random();
  const varianceShaped = varianceRaw * varianceRaw; // quadratic — mostly small, sometimes big
  const variance = varianceShaped * ANTI_DETECT.DELAY_VARIANCE_MAX;

  // Human break (20% chance of 2-10 min pause)
  let breakDelay = 0;
  if (Math.random() < ANTI_DETECT.BREAK_CHANCE) {
    breakDelay =
      ANTI_DETECT.BREAK_MIN +
      Math.random() * (ANTI_DETECT.BREAK_MAX - ANTI_DETECT.BREAK_MIN);
  }

  const total = Math.min(base + variance + breakDelay, ANTI_DETECT.MAX_DELAY);

  return Math.round(total);
}

/**
 * Generate daily jitter offset (±1-3 minutes) for recurring schedules.
 * Each day the publication time shifts slightly, mimicking human inconsistency.
 */
function generateDailyJitter() {
  const range = ANTI_DETECT.DAILY_JITTER_MAX - ANTI_DETECT.DAILY_JITTER_MIN;
  return (
    Math.round(ANTI_DETECT.DAILY_JITTER_MIN + Math.random() * range) * 1000
  );
}

/**
 * Check how many publications a user has made today.
 */
async function getUserDailyCount(userId) {
  return (await getDailyPublishUsage(userId)).used;
}

// ─── Instagram Publishing ─────────────────────────────────

// Instagram aspect ratio limits
const IG_MIN_RATIO = 4 / 5; // 0.8 (portrait)
const IG_MAX_RATIO = 1.91; // landscape
const IG_TARGET_SIZE = 1080; // Instagram's standard width

/**
 * Preprocess an image for Instagram:
 * - Ensures aspect ratio is between 4:5 and 1.91:1
 * - Resizes to IG-optimal dimensions (1080px width)
 * - Returns path to a temporary processed file
 */
async function preprocessImageForInstagram(imagePath) {
  const absolutePath = path.join(uploadsDir, path.basename(imagePath));
  if (!fs.existsSync(absolutePath)) return imagePath; // fallback to original

  const metadata = await sharp(absolutePath).metadata();
  const { width, height } = metadata;
  const ratio = width / height;

  // If aspect ratio is valid and width is reasonable, no processing needed
  if (ratio >= IG_MIN_RATIO && ratio <= IG_MAX_RATIO && width <= 1440) {
    return imagePath;
  }

  log.info("Preprocessing image for Instagram", {
    original: `${width}x${height}`,
    ratio: ratio.toFixed(2),
    needsCrop: ratio < IG_MIN_RATIO || ratio > IG_MAX_RATIO,
  });

  let targetWidth = Math.min(width, IG_TARGET_SIZE);
  let targetHeight;

  if (ratio > IG_MAX_RATIO) {
    // Too wide — crop to 1.91:1 (center crop)
    targetHeight = Math.round(targetWidth / IG_MAX_RATIO);
  } else if (ratio < IG_MIN_RATIO) {
    // Too tall — crop to 4:5 (center crop)
    targetHeight = Math.round(targetWidth / IG_MIN_RATIO);
  } else {
    // Ratio is fine, just resize
    targetHeight = Math.round(targetWidth / ratio);
  }

  const processedFileName = `ig_${Date.now()}_${path.basename(imagePath)}`;
  const processedPath = path.join(uploadsDir, processedFileName);

  await sharp(absolutePath)
    .resize(targetWidth, targetHeight, { fit: "cover", position: "center" })
    .jpeg({ quality: 90 })
    .toFile(processedPath);

  log.info("Image preprocessed for Instagram", {
    result: `${targetWidth}x${targetHeight}`,
    file: processedFileName,
  });

  return `/uploads/${processedFileName}`;
}

/**
 * Create a Story image with text overlay.
 * Instagram Stories don't support captions via the API,
 * so we burn the text onto the image.
 * Returns path to the story-ready file.
 */
async function createStoryImageWithText(imagePath, text) {
  if (!text || !text.trim()) return imagePath;

  const absolutePath = path.join(uploadsDir, path.basename(imagePath));
  if (!fs.existsSync(absolutePath)) return imagePath;

  // Story dimensions: 1080x1920 (9:16)
  const STORY_W = 1080;
  const STORY_H = 1920;

  // Truncate text to reasonable length for story
  const storyText = text.length > 200 ? text.substring(0, 200) + "..." : text;

  // Escape XML special characters for SVG
  const escapeXml = (s) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  // Split text into lines (max ~30 chars per line for readability)
  const words = storyText.split(/\s+/);
  const lines = [];
  let currentLine = "";
  for (const word of words) {
    if ((currentLine + " " + word).trim().length > 30) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += " " + word;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  const fontSize = 42;
  const lineHeight = 56;
  const textBlockHeight = lines.length * lineHeight + 40;
  const yStart = STORY_H - textBlockHeight - 120; // Near bottom

  // Build SVG text overlay with semi-transparent background
  const svgLines = lines
    .map(
      (line, i) =>
        `<text x="540" y="${yStart + 40 + i * lineHeight}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle" direction="rtl">${escapeXml(line)}</text>`,
    )
    .join("\n");

  const svgOverlay = `<svg width="${STORY_W}" height="${STORY_H}">
    <rect x="40" y="${yStart - 20}" width="${STORY_W - 80}" height="${textBlockHeight + 20}" rx="16" fill="rgba(0,0,0,0.55)"/>
    ${svgLines}
  </svg>`;

  const processedFileName = `ig_story_${Date.now()}_${path.basename(imagePath, path.extname(imagePath))}.jpg`;
  const processedPath = path.join(uploadsDir, processedFileName);

  await sharp(absolutePath)
    .resize(STORY_W, STORY_H, { fit: "cover", position: "center" })
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toFile(processedPath);

  log.info("Story image created with text overlay", {
    file: processedFileName,
    textLines: lines.length,
  });

  return `/uploads/${processedFileName}`;
}

/**
 * Publish content to Instagram via the Graph API.
 * Requires a publicly accessible media URL.
 */
async function publishToInstagram(post, user, jobIgPublishType) {
  const account = await prisma.connectedAccount.findFirst({
    where: { userId: user.id, provider: "INSTAGRAM", status: "ACTIVE" },
  });

  if (!account) {
    throw new Error("INSTAGRAM_NOT_CONNECTED");
  }

  if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: { status: "EXPIRED" },
    });
    throw new Error("INSTAGRAM_TOKEN_EXPIRED");
  }

  let accessToken;
  try {
    accessToken = decrypt(account.accessTokenEncrypted);
  } catch (error) {
    // A changed encryption key makes an existing token impossible to recover.
    // Treat this as a permanent auth error instead of retrying the publication
    // for several minutes with a cryptic crypto exception.
    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: { status: "EXPIRED" },
    });
    log.warn("Instagram token can no longer be decrypted", {
      userId: user.id,
      accountId: account.id,
      error: error.message,
    });
    throw new Error("INSTAGRAM_TOKEN_INVALID");
  }

  // Use 'me' instead of numeric ID to avoid JS Number precision issues with large IDs
  const igPath = "me";

  // Determine publish types — if job specifies a specific type, only do that one
  const publishTypes = jobIgPublishType
    ? [jobIgPublishType]
    : post.instagramPublishType
      ? post.instagramPublishType.split(",").map((t) => t.trim())
      : ["FEED"];

  // Strip WhatsApp links from content for Instagram captions
  const baseCaption =
    (post.content || "").replace(/\n*https?:\/\/wa\.me\/[^\s]*/gi, "").trim() ||
    null;
  // Instagram Login does not receive the campaign's free-text location
  // automatically. Preserve it visibly in the caption instead of silently
  // dropping it.
  const igCaption = [baseCaption, post.location ? `📍 ${post.location}` : null]
    .filter(Boolean)
    .join("\n\n") || null;

  // Get media — need publicly accessible URLs for Instagram API
  const allMedia = [...(post.media || [])].sort(
    (a, b) => (a.orderIndex || 0) - (b.orderIndex || 0),
  );

  // Per-story captions (array of strings, one per image)
  const storyCaptions = Array.isArray(post.storyCaptions)
    ? post.storyCaptions
    : [];

  const results = [];

  for (const publishType of publishTypes) {
    // Prefer media uploaded specifically for this Instagram destination.
    // Fall back to campaign-wide media only when no override exists.
    const typeMedia = allMedia.filter((media) => media.igType === publishType);
    const globalMedia = allMedia.filter((media) => !media.igType);
    const mediaPaths = (typeMedia.length ? typeMedia : globalMedia).map(
      (media) => media.url,
    );

    if (!mediaPaths[0]) {
      log.warn("Instagram publish skipped — no media", {
        postId: post.id,
        publishType,
      });
      continue;
    }

    if (publishType === "STORY") {
      // ─── STORIES: Support multiple images ─────────────────
      const storyMode = post.storyMediaMode || "first";
      let storyImages;

      if (storyMode === "all") {
        storyImages = mediaPaths;
      } else if (storyMode === "pick" && post.storyPickedIndex != null) {
        storyImages = [mediaPaths[post.storyPickedIndex] || mediaPaths[0]];
      } else {
        storyImages = [mediaPaths[0]];
      }

      for (let si = 0; si < storyImages.length; si++) {
        let mediaPath = storyImages[si];
        // Determine caption for this story: per-image caption or fallback to post content
        const storyCaption = storyCaptions[si] || igCaption || "";

        if (!mediaPath.match(/\.(mp4|mov|webm)$/i) && storyCaption) {
          mediaPath = await createStoryImageWithText(mediaPath, storyCaption);
        }

        const mediaUrl = await getPublicMediaUrl(mediaPath);
        const containerBody = {
          access_token: accessToken,
          media_type: "STORIES",
        };
        if (mediaUrl.match(/\.(mp4|mov|webm)$/i)) {
          containerBody.video_url = mediaUrl;
        } else {
          containerBody.image_url = mediaUrl;
        }

        const storyResult = await publishContainer(
          igPath,
          containerBody,
          accessToken,
          "STORY",
        );
        results.push(storyResult);
        log.info("Instagram story publish success", {
          userId: user.id,
          storyIndex: si + 1,
          totalStories: storyImages.length,
          mediaId: storyResult.mediaId,
        });

        // Small delay between multiple stories
        if (si < storyImages.length - 1) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    } else if (publishType === "FEED" && mediaPaths.length > 1) {
      // ─── CAROUSEL: Multiple images for feed ───────────────
      const childIds = [];

      for (const mp of mediaPaths) {
        let mediaPath = mp;
        if (!mediaPath.match(/\.(mp4|mov|webm)$/i)) {
          mediaPath = await preprocessImageForInstagram(mediaPath);
        }
        const mediaUrl = await getPublicMediaUrl(mediaPath);

        const childBody = {
          access_token: accessToken,
          is_carousel_item: true,
        };
        if (mediaUrl.match(/\.(mp4|mov|webm)$/i)) {
          childBody.video_url = mediaUrl;
          childBody.media_type = "VIDEO";
        } else {
          childBody.image_url = mediaUrl;
        }

        const childRes = await fetch(
          `https://graph.instagram.com/v21.0/${igPath}/media`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(childBody),
          },
        );
        const childData = await childRes.json();
        if (childData.error) {
          throw new Error(
            childData.error.message || "Carousel item creation failed",
          );
        }

        // Wait for child to be ready
        await waitForContainer(childData.id, accessToken, 15);
        childIds.push(childData.id);
      }

      // Create carousel container
      const carouselBody = {
        access_token: accessToken,
        media_type: "CAROUSEL",
        children: childIds.join(","),
      };
      if (igCaption) carouselBody.caption = igCaption;

      const carouselRes = await fetch(
        `https://graph.instagram.com/v21.0/${igPath}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(carouselBody),
        },
      );
      const carouselData = await carouselRes.json();
      if (carouselData.error) {
        throw new Error(
          carouselData.error.message || "Carousel creation failed",
        );
      }

      await waitForContainer(carouselData.id, accessToken, 30);

      // Publish carousel
      const publishRes = await fetch(
        `https://graph.instagram.com/v21.0/${igPath}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: carouselData.id,
            access_token: accessToken,
          }),
        },
      );
      const publishData = await publishRes.json();
      if (publishData.error) {
        throw new Error(publishData.error.message || "Carousel publish failed");
      }

      let permalink = null;
      try {
        const mediaRes = await fetch(
          `https://graph.instagram.com/v21.0/${publishData.id}?fields=permalink&access_token=${accessToken}`,
        );
        const mediaData = await mediaRes.json();
        if (mediaData.permalink) permalink = mediaData.permalink;
      } catch {
        /* non-critical */
      }

      results.push({
        publishType: "FEED",
        mediaId: publishData.id,
        postUrl: permalink,
      });
      log.info("Instagram carousel publish success", {
        userId: user.id,
        mediaId: publishData.id,
        imageCount: mediaPaths.length,
        permalink,
      });
    } else {
      // ─── SINGLE FEED or REEL ──────────────────────────────
      let mediaPath = mediaPaths[0];
      if (!mediaPath.match(/\.(mp4|mov|webm)$/i)) {
        mediaPath = await preprocessImageForInstagram(mediaPath);
      }

      const mediaUrl = await getPublicMediaUrl(mediaPath);
      const containerBody = { access_token: accessToken };

      if (publishType === "REEL") {
        containerBody.media_type = "REELS";
        containerBody.video_url = mediaUrl;
        if (igCaption) containerBody.caption = igCaption;
      } else {
        // A single Feed item can be either an image or a video. Sending an MP4
        // as image_url can produce a published black/invalid post.
        if (mediaUrl.match(/\.(mp4|mov|webm)(?:\?|$)/i)) {
          containerBody.media_type = "VIDEO";
          containerBody.video_url = mediaUrl;
        } else {
          containerBody.image_url = mediaUrl;
        }
        if (igCaption) containerBody.caption = igCaption;
      }

      const singleResult = await publishContainer(
        igPath,
        containerBody,
        accessToken,
        publishType,
      );
      results.push(singleResult);
      log.info("Instagram publish success", {
        userId: user.id,
        publishType,
        mediaId: singleResult.mediaId,
        permalink: singleResult.postUrl,
      });
    }
  }

  return results;
}

/**
 * Helper: Create container, wait for it, publish, and return result.
 */
async function publishContainer(
  igPath,
  containerBody,
  accessToken,
  publishType,
) {
  const containerRes = await fetch(
    `https://graph.instagram.com/v21.0/${igPath}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(containerBody),
    },
  );
  const containerData = await containerRes.json();
  if (containerData.error) {
    throw new Error(
      containerData.error.message || "Instagram container creation failed",
    );
  }

  const maxPolls = publishType === "REEL" ? 60 : 15;
  await waitForContainer(containerData.id, accessToken, maxPolls);

  // Publish
  const publishRes = await fetch(
    `https://graph.instagram.com/v21.0/${igPath}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerData.id,
        access_token: accessToken,
      }),
    },
  );
  const publishData = await publishRes.json();
  if (publishData.error) {
    throw new Error(publishData.error.message || "Instagram publish failed");
  }

  // Fetch permalink
  let permalink = null;
  try {
    const mediaRes = await fetch(
      `https://graph.instagram.com/v21.0/${publishData.id}?fields=permalink&access_token=${accessToken}`,
    );
    const mediaData = await mediaRes.json();
    if (mediaData.permalink) permalink = mediaData.permalink;
  } catch {
    /* non-critical */
  }

  return { publishType, mediaId: publishData.id, postUrl: permalink };
}

/**
 * Helper: Poll container status until FINISHED.
 */
async function waitForContainer(containerId, accessToken, maxPolls = 15) {
  for (let i = 0; i < maxPolls; i++) {
    const statusRes = await fetch(
      `https://graph.instagram.com/v21.0/${containerId}?fields=status_code&access_token=${accessToken}`,
    );
    const statusData = await statusRes.json();
    if (statusData.status_code === "FINISHED") return;
    if (statusData.status_code === "ERROR") {
      throw new Error("Instagram media processing failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Instagram media processing timed out");
}

// ─── Main Job Processor ───────────────────────────────────

/**
 * Process pending publication jobs.
 * Groups jobs by user and processes them with human-like delays.
 * Enforces daily limit and anti-detection spacing.
 */
export async function processPublicationJobs() {
  const now = new Date();
  const workerId = `worker-${process.pid}-${Date.now()}`;

  log.debug("Checking for pending publication jobs");

  const claimedIds = await claimDuePublicationJobs(now, workerId);
  if (claimedIds.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  // Load full relations only after this worker owns the jobs.
  const pendingJobs = await prisma.publicationJob.findMany({
    where: {
      id: { in: claimedIds },
      status: "RUNNING",
      lockedBy: workerId,
    },
    include: {
      postGroup: {
        include: {
          post: {
            include: { media: true, user: true },
          },
          group: true,
          user: true,
        },
      },
      post: { select: { id: true, title: true, userId: true } },
      post: {
        include: { media: true, user: true },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  if (pendingJobs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  log.info("Found pending jobs to process", { count: pendingJobs.length });

  // Group jobs by user for per-user queue management
  const jobsByUser = new Map();
  const orphanJobIds = [];
  for (const job of pendingJobs) {
    const userId = job.postGroup?.user?.id || job.post?.user?.id;
    if (!userId) {
      orphanJobIds.push(job.id);
      continue;
    }
    if (!jobsByUser.has(userId)) jobsByUser.set(userId, []);
    jobsByUser.get(userId).push(job);
  }
  if (orphanJobIds.length > 0) {
    await prisma.publicationJob.updateMany({
      where: { id: { in: orphanJobIds }, lockedBy: workerId },
      data: {
        status: "FAILED",
        lastError: "Missing post or user data",
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  let succeeded = 0;
  let failed = 0;
  let skippedLimit = 0;

  // Preserve ordering for each user, but do not let one user's queue block
  // unrelated users that requested the same publication time.
  await mapWithConcurrency(
    [...jobsByUser.entries()],
    USER_CONCURRENCY,
    async ([userId, userJobs]) => {
    const userLock = await withUserPublishLock(
      userId,
      async () => {
    // Check daily limit
    const todayCount = await getUserDailyCount(userId);
    if (todayCount >= ANTI_DETECT.DAILY_LIMIT) {
      log.warn("User hit daily publication limit", {
        userId,
        count: todayCount,
        limit: ANTI_DETECT.DAILY_LIMIT,
      });

      await notifyDailyLimitReached(userId, {
        used: todayCount,
        limit: ANTI_DETECT.DAILY_LIMIT,
        remaining: 0,
        reached: true,
      });

      // Reschedule remaining jobs to tomorrow with jitter
      for (const job of userJobs) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(
          tomorrow.getHours(),
          tomorrow.getMinutes() + Math.floor(Math.random() * 30),
          0,
          0,
        );

        await prisma.publicationJob.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            scheduledAt: tomorrow,
            lockedAt: null,
            lockedBy: null,
          },
        });
      }
      skippedLimit += userJobs.length;
      return;
    }

    // Process up to USER_BATCH_SIZE jobs for this user in this cycle
    const remainingQuota = ANTI_DETECT.DAILY_LIMIT - todayCount;
    const batch = userJobs.slice(
      0,
      Math.min(ANTI_DETECT.USER_BATCH_SIZE, remainingQuota),
    );

    // If there are more jobs beyond the batch, defer them with spacing
    const deferred = userJobs.slice(batch.length);
    if (deferred.length > 0) {
      let deferOffset = 0;
      for (const dJob of deferred) {
        deferOffset += generateHumanDelay();
        const deferredTime = new Date(Date.now() + deferOffset);
        await prisma.publicationJob.update({
          where: { id: dJob.id },
          data: {
            status: "PENDING",
            scheduledAt: deferredTime,
            lockedAt: null,
            lockedBy: null,
          },
        });
      }
      log.info("Deferred excess jobs for user", {
        userId,
        deferred: deferred.length,
        nextRunIn: `${Math.round(deferOffset / 1000)}s`,
      });
    }

    // Process this user's batch
    for (let i = 0; i < batch.length; i++) {
      const job = batch[i];

      // Human-like delay between publications (skip for first one)
      if (i > 0) {
        const delay = generateHumanDelay();
        log.debug("Anti-detection delay", {
          userId,
          delayMs: delay,
          delaySec: Math.round(delay / 1000),
        });
        await new Promise((r) => setTimeout(r, delay));
      }

      // Get post data from postGroup relation or direct post relation (profile jobs)
      const postGroup = job.postGroup;
      const post = postGroup?.post || job.post;
      const group = postGroup?.group;
      const user = postGroup?.user || job.post?.user;
      const isInstagramJob = job.targetType === "INSTAGRAM";
      const isWhatsAppJob = job.targetType === "WHATSAPP";
      const isProfileJob =
        !isInstagramJob &&
        !isWhatsAppJob &&
        (job.targetType === "PROFILE" || !group);

      if (!post || !user) {
        await prisma.publicationJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            lastError: "Missing post or user data",
            completedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
          },
        });
        failed++;
        continue;
      }

      let stopJobLeaseHeartbeat = async () => {};
      try {
        // A claim is not an attempt. Consume retry budget only when this job
        // is about to call the external publishing system.
        const claimedAttempt = await prisma.publicationJob.update({
          where: { id: job.id },
          data: { attempts: { increment: 1 }, lockedAt: new Date() },
          select: { attempts: true },
        });
        job.attempts = claimedAttempt.attempts;
        stopJobLeaseHeartbeat = startJobLeaseHeartbeat(job.id, workerId);
        let result;

        if (isInstagramJob) {
          // ─── Instagram Publishing ───────────────────────
          const igResults = await publishToInstagram(
            post,
            user,
            job.igPublishType,
          );
          result = {
            mediaIds: igResults.map((r) => r.mediaId),
            postUrl: igResults[0]?.postUrl || null,
          };
        } else if (isWhatsAppJob) {
          // ─── WhatsApp Publishing ────────────────────────
          const secret = process.env.INTERNAL_WORKER_SECRET;
          const baseUrl = String(process.env.CLIENT_URL || "").replace(/\/$/, "");
          const response = await fetch(`${baseUrl}/api/whatsapp/internal/publish`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-internal-worker-secret": secret || "",
            },
            body: JSON.stringify({ userId: user.id, postId: post.id }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || "WHATSAPP_SEND_FAILED");
          result = payload;

          let sent = 0;
          let sendFailed = 0;
          for (const target of waTargets) {
            try {
              let message;
              if (imagePath) {
                message = { image: { url: imagePath }, caption: waContent };
              } else {
                message = { text: waContent };
              }

              if (target.type === "broadcast") {
                // Send to all members of the broadcast list
                const list = await prisma.whatsAppBroadcastList.findFirst({
                  where: {
                    id: String(target.id || "").replace(/^broadcast_/, ""),
                    userId: user.id,
                  },
                });
                if (list?.members?.length) {
                  for (const member of list.members) {
                    let phone = String(member.phone).replace(/[^0-9]/g, "");
                    if (!phone) continue;
                    // Normalize local Israeli numbers (0xx → 972xx)
                    if (phone.startsWith("0") && phone.length === 10) {
                      phone = "972" + phone.slice(1);
                    }
                    try {
                      await sendWithTimeout(`${phone}@s.whatsapp.net`, message);
                      sent++;
                    } catch {
                      sendFailed++;
                    }
                    await new Promise((r) => setTimeout(r, 1000));
                  }
                }
              } else {
                // Send to group
                await sendWithTimeout(target.id, message);
                sent++;
              }
            } catch (err) {
              log.warn("WA target send failed", {
                target: target.id,
                error: err.message,
              });
              sendFailed++;
            }
          }

          if (sent === 0 && sendFailed > 0)
            throw new Error("ALL_WHATSAPP_SENDS_FAILED");
          result = { sent, failed: sendFailed };
        } else {
          // ─── Facebook Publishing ────────────────────────
          // Check if user has valid Facebook session
          if (!user.facebookStorageState) {
            throw new Error("SESSION_EXPIRED");
          }

          // Get image paths — convert relative URLs to absolute filesystem paths
          const mediaUrls = (post.media || [])
            .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
            .map((m) => m.url);
          const mediaPaths = await Promise.all(
            mediaUrls.map((url) => materializeUploadPath(url)),
          );
          const imagePath = mediaPaths[0] || null;

          if (isProfileJob) {
            // Publish to user's personal profile
            result = await publishToProfile(post.content, imagePath, {
              userId: user.id,
              location: post.location,
            });
          } else {
            // Get the group URL
            const groupUrl =
              group.url ||
              `https://www.facebook.com/groups/${group.externalId}`;

            // Publish to group
            result = await publishToGroup(groupUrl, post.content, imagePath, {
              userId: user.id,
              anonymous: post.isAnonymous,
              location: post.location,
              images: mediaPaths,
            });
          }
        }

        // Mark as success
        await prisma.publicationJob.update({
          where: { id: job.id },
          data: {
            status: "SUCCESS",
            completedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
          },
        });

        // Record in publication history
        await prisma.publicationHistory.create({
          data: {
            postId: post.id,
            groupId: group?.id || null,
            userId: user.id,
            postGroupId: postGroup?.id || null,
            publicationJobId: job.id,
            targetType: isInstagramJob
              ? "INSTAGRAM"
              : isWhatsAppJob
                ? "WHATSAPP"
                : isProfileJob
                  ? "PROFILE"
                  : "GROUP",
            platform: isInstagramJob
              ? "INSTAGRAM"
              : isWhatsAppJob
                ? "WHATSAPP"
                : undefined,
            publishedAt: new Date(),
            status: "SUCCESS",
            externalPostUrl: result?.postUrl || null,
            externalPostId: isInstagramJob
              ? result?.mediaIds?.[0] || null
              : isWhatsAppJob
                ? null
                : result?.externalPostId || null,
            screenshotUrl: result?.screenshot || null,
          },
        });

        await dispatchPublicationNotification({
          userId: user.id,
          event: "success",
          postTitle: post.title || post.content?.slice(0, 80),
          targetType: isInstagramJob
            ? "INSTAGRAM"
            : isWhatsAppJob
              ? "WHATSAPP"
              : isProfileJob
                ? "PROFILE"
                : "GROUP",
          platform: isInstagramJob
            ? "INSTAGRAM"
            : isWhatsAppJob
              ? "WHATSAPP"
              : "FACEBOOK",
          target: group?.name || "",
          scheduledAt: job.scheduledAt,
        }).catch((notificationError) => {
          log.error("Success notification failed", notificationError, {
            jobId: job.id,
            userId: user.id,
          });
        });

        succeeded++;
        log.info("Post published successfully", {
          postId: post.id,
          groupId: group?.id || (isWhatsAppJob ? "WHATSAPP" : "PROFILE"),
          jobId: job.id,
          userDailyTotal: todayCount + i + 1,
        });

        // Track exposure - add group's member count to daily exposure
        let groupMemberCount = group?.memberCount || 0;
        // Fallback: look up from FacebookGroup if Group table doesn't have memberCount
        if (!groupMemberCount && group) {
          const fbGroupId =
            group.url?.match(/groups\/([^/?]+)/)?.[1] || group.externalGroupId;
          if (fbGroupId) {
            const fbGroup = await prisma.facebookGroup.findFirst({
              where: { userId: user.id, groupId: fbGroupId },
              select: { memberCount: true },
            });
            if (fbGroup?.memberCount) {
              groupMemberCount = fbGroup.memberCount;
              // Sync to Group table for future use
              await prisma.group
                .update({
                  where: { id: group.id },
                  data: { memberCount: groupMemberCount },
                })
                .catch(() => {});
            }
          }
        }
        if (groupMemberCount > 0) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          await prisma.dailyExposure
            .upsert({
              where: { userId_date: { userId: user.id, date: today } },
              update: {
                exposureCount: { increment: groupMemberCount },
                postsPublished: { increment: 1 },
              },
              create: {
                userId: user.id,
                date: today,
                exposureCount: groupMemberCount,
                postsPublished: 1,
              },
            })
            .catch((e) => log.debug("Exposure tracking error", e.message));
        }
      } catch (error) {
        const errorMsg = error.message || "Unknown error";
        // Attempts are incremented only immediately before the external call.
        const newAttempts = job.attempts;
        failed++;
        log.error("Publication job failed", error, {
          jobId: job.id,
          attempt: newAttempts,
          maxAttempts: job.maxAttempts,
        });

        const isSessionError =
          !isInstagramJob &&
          (errorMsg === "SESSION_EXPIRED" ||
            errorMsg === "FACEBOOK_SESSION_REQUIRED" ||
            errorMsg === "POST_COMPOSER_NOT_FOUND");

        const isInstagramAuthError =
          isInstagramJob &&
          (errorMsg === "INSTAGRAM_NOT_CONNECTED" ||
            errorMsg === "INSTAGRAM_TOKEN_EXPIRED" ||
            errorMsg === "INSTAGRAM_TOKEN_INVALID");

        // Content errors from Instagram that won't be fixed by retrying
        const isInstagramContentError =
          isInstagramJob &&
          (errorMsg.includes("aspect ratio") ||
            errorMsg.includes("not supported") ||
            errorMsg.includes("media type") ||
            errorMsg.includes("media processing failed") ||
            errorMsg.includes("Media file not found"));

        const isWhatsAppAuthError =
          isWhatsAppJob && errorMsg === "NO_WHATSAPP_TARGETS";

        if (isSessionError) {
          // Mark user's session as invalid
          await prisma.user.update({
            where: { id: user.id },
            data: { fbSessionValid: false, facebookStorageState: null },
          });

          // Cancel all other pending Facebook jobs for this user
          await prisma.publicationJob.updateMany({
            where: {
              status: "PENDING",
              postGroup: { userId: user.id },
              id: { not: job.id },
              targetType: { not: "INSTAGRAM" },
            },
            data: {
              status: "CANCELLED",
              lastError: "Session expired — reconnect Facebook",
            },
          });
          log.warn("Cancelled all pending jobs for user due to session error", {
            userId: user.id,
          });
        }

        if (
          newAttempts >= job.maxAttempts ||
          isSessionError ||
          isInstagramAuthError ||
          isInstagramContentError ||
          isWhatsAppAuthError
        ) {
          // Max retries reached or non-retryable error — mark as failed
          await prisma.publicationJob.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              lastError: errorMsg,
              completedAt: new Date(),
              lockedAt: null,
              lockedBy: null,
            },
          });

          // Record failed publication
          await prisma.publicationHistory.create({
            data: {
              postId: post.id,
              groupId: group?.id || null,
              userId: user.id,
              postGroupId: postGroup?.id || null,
              publicationJobId: job.id,
              targetType: isInstagramJob
                ? "INSTAGRAM"
                : isWhatsAppJob
                  ? "WHATSAPP"
                  : isProfileJob
                    ? "PROFILE"
                    : "GROUP",
              platform: isInstagramJob
                ? "INSTAGRAM"
                : isWhatsAppJob
                  ? "WHATSAPP"
                  : undefined,
              publishedAt: new Date(),
              status: "FAILED",
              errorMessage: errorMsg,
            },
          });

          // Notify user
          const notificationMsg = isSessionError
            ? "החיבור לפייסבוק פג. אנא התחבר מחדש."
            : isInstagramAuthError
              ? "חיבור האינסטגרם פג תוקף. אנא התחבר מחדש."
              : isInstagramContentError
                ? `פרסום לאינסטגרם נכשל — בעיה בתמונה: ${errorMsg}`
                : `הפרסום נכשל אחרי ${newAttempts} ניסיונות: ${errorMsg}`;

          await dispatchPublicationNotification({
            userId: user.id,
            event: "failure",
            postTitle: post.title || post.content?.slice(0, 80),
            targetType: isInstagramJob
              ? "INSTAGRAM"
              : isWhatsAppJob
                ? "WHATSAPP"
                : isProfileJob
                  ? "PROFILE"
                  : "GROUP",
            platform: isInstagramJob
              ? "INSTAGRAM"
              : isWhatsAppJob
                ? "WHATSAPP"
                : "FACEBOOK",
            target: group?.name || "",
            scheduledAt: job.scheduledAt,
            errorMessage: notificationMsg,
          }).catch((notificationError) => {
            log.error("Failure notification failed", notificationError, {
              jobId: job.id,
              userId: user.id,
            });
          });

          if (isInstagramAuthError) {
            const notificationType = "INSTAGRAM_RECONNECT_REQUIRED";
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const alreadyNotified = await prisma.notification.findFirst({
              where: {
                userId: user.id,
                type: notificationType,
                createdAt: { gte: since },
              },
              select: { id: true },
            });

            log.error(
              "Instagram publication blocked: reconnect required",
              new Error(errorMsg),
              {
                userId: user.id,
                postId: post.id,
                jobId: job.id,
                publishType: job.igPublishType,
                notificationAlreadySent: Boolean(alreadyNotified),
              },
            );

            if (!alreadyNotified) {
              await prisma.notification.create({
                data: {
                  userId: user.id,
                  type: notificationType,
                  title: "נדרש חיבור מחדש ל־Instagram",
                  message:
                    "הפרסום ב־Instagram לא בוצע. יש לחבר מחדש את חשבון Instagram בהגדרות החשבון.",
                },
              });

              const emailSent = await sendInstagramReconnectEmail(
                user.email,
                user.name,
              );
              log.info("Instagram reconnect notification dispatched", {
                userId: user.id,
                postId: post.id,
                inAppNotification: true,
                emailSent,
              });
            }
          }

          // If session error, stop processing this user's batch
          if (isSessionError) break;
        } else {
          // Still has retries — back to pending with exponential backoff
          const backoffMinutes = Math.pow(2, newAttempts) * 5; // 10, 20, 40 min...
          const nextAttemptAt = new Date(
            Date.now() + backoffMinutes * 60 * 1000,
          );

          await prisma.publicationJob.update({
            where: { id: job.id },
            data: {
              status: "PENDING",
              scheduledAt: nextAttemptAt,
              lastError: errorMsg,
              lockedAt: null,
              lockedBy: null,
            },
          });

          log.info("Job scheduled for retry", {
            jobId: job.id,
            nextAttempt: nextAttemptAt.toISOString(),
            backoffMin: backoffMinutes,
          });
        }
      } finally {
        await stopJobLeaseHeartbeat();
      }
    }
      },
      { ownerToken: `${workerId}:${userId}` },
    );

    if (!userLock.acquired) {
      const retryAt = new Date(Date.now() + 30_000);
      await prisma.publicationJob.updateMany({
        where: {
          id: { in: userJobs.map((job) => job.id) },
          status: "RUNNING",
          lockedBy: workerId,
        },
        data: {
          status: "PENDING",
          scheduledAt: retryAt,
          lockedAt: null,
          lockedBy: null,
          lastError: "Waiting for another publication by this user",
        },
      });
      log.debug("Deferred jobs because user publish lock is held", {
        userId,
        count: userJobs.length,
      });
    }
  });

  log.info("Publication batch completed", {
    processed: pendingJobs.length,
    succeeded,
    failed,
    skippedLimit,
  });

  return { processed: pendingJobs.length, succeeded, failed };
}

// ─── Recover Stale Jobs on Startup ────────────────────────

/**
 * Recover jobs that were in RUNNING state when the server crashed.
 * Jobs locked for more than 10 minutes are considered stale.
 * - If max retries exceeded → mark FAILED and create history entry
 * - Otherwise → reset to PENDING for retry
 */
export async function recoverStaleJobs() {
  // A legitimate per-user anti-detection pause can last up to 20 minutes.
  const staleThreshold = new Date(Date.now() - 30 * 60 * 1000);

  const staleJobs = await prisma.publicationJob.findMany({
    where: {
      status: "RUNNING",
      lockedAt: { lt: staleThreshold },
    },
    include: {
      postGroup: {
        include: {
          post: { select: { id: true, title: true } },
          group: { select: { id: true, name: true } },
          user: { select: { id: true } },
        },
      },
      post: { select: { id: true, title: true, userId: true } },
    },
  });

  if (staleJobs.length === 0) return;

  log.warn("Recovering stale RUNNING jobs from server crash", {
    count: staleJobs.length,
  });

  for (const job of staleJobs) {
    const userId = job.postGroup?.user?.id || job.post?.userId;
    // The interrupted run was already counted when it was claimed.
    const newAttempts = job.attempts;

    const uncertainFacebookAttempt =
      job.platform === "FACEBOOK" && newAttempts > 0;

    if (uncertainFacebookAttempt) {
      await prisma.publicationJob.update({
        where: { id: job.id },
        data: {
          status: "UNKNOWN",
          lastError:
            "ה-worker נקטע לאחר תחילת הפרסום. ייתכן שהפרסום פורסם ולכן לא יבוצע retry אוטומטי.",
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });
      if (userId) {
        await prisma.notification.create({
          data: {
            userId,
            type: "PUBLICATION_STATUS_UNKNOWN",
            title: "נדרשת בדיקת פרסום",
            message:
              "השרת נקטע בזמן הפרסום. כדי למנוע פרסום כפול לא בוצע ניסיון חוזר אוטומטי. יש לבדוק אם הפוסט פורסם לפני הפעלה ידנית.",
          },
        });
      }
      log.warn("Stale Facebook job moved to UNKNOWN", {
        jobId: job.id,
        attempt: newAttempts,
      });
    } else if (newAttempts >= job.maxAttempts) {
      // Max retries exceeded — mark as FAILED
      await prisma.publicationJob.update({
        where: { id: job.id },
        data: {
          status: "DEAD",
          lastError: "השרת קרס במהלך הפרסום — נוצלו כל הניסיונות החוזרים",
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });

      // Create failure history entry
      if (userId) {
        await prisma.publicationHistory.create({
          data: {
            postId: job.postGroup?.post?.id || job.post?.id,
            groupId: job.postGroup?.group?.id || null,
            userId,
            postGroupId: job.postGroupId,
            publicationJobId: job.id,
            publishedAt: new Date(),
            status: "FAILED",
            errorMessage: "השרת קרס במהלך הפרסום - הפרסום לא הושלם",
          },
        });

        await dispatchPublicationNotification({
          userId,
          event: "failure",
          postTitle: job.postGroup?.post?.title || job.post?.title || "",
          targetType: job.targetType || "GROUP",
          platform: job.platform || "FACEBOOK",
          target: job.postGroup?.group?.name || "",
          scheduledAt: job.scheduledAt,
          errorMessage: "הפרסום לא הושלם לאחר התאוששות מתקלה בשרת",
        }).catch((notificationError) => {
          log.error("Stale job notification failed", notificationError, {
            jobId: job.id,
            userId,
          });
        });
      }

      log.info("Stale job moved to DEAD", { jobId: job.id });
    } else {
      // Reset to PENDING for retry
      await prisma.publicationJob.update({
        where: { id: job.id },
        data: {
          status: "PENDING",
          attempts: newAttempts,
          lastError: "השרת קרס — ממתין לניסיון חוזר",
          lockedAt: null,
          lockedBy: null,
        },
      });

      log.info("Stale job reset to PENDING", {
        jobId: job.id,
        attempt: newAttempts,
      });
    }
  }
}

// ─── Schedule Job Generator ───────────────────────────────

/**
 * Generate publication jobs from active schedules.
 * Applies daily jitter to recurring schedules so publication times
 * shift ±1-3 minutes each day (anti-detection).
 */
export async function generateScheduledJobs() {
  const now = new Date();

  const dueSchedules = await prisma.postGroupSchedule.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now },
      OR: [{ endAt: null }, { endAt: { gt: now } }],
    },
    include: {
      postGroup: {
        include: { post: true },
      },
      post: true,
    },
  });

  if (dueSchedules.length === 0) return 0;

  log.info("Generating jobs from due schedules", {
    count: dueSchedules.length,
  });

  let created = 0;

  for (const schedule of dueSchedules) {
    // Skip if the parent post is paused
    const parentPost = schedule.postGroup?.post || schedule.post;
    if (parentPost?.isPaused) {
      continue;
    }

    // Apply daily jitter to the job's actual execution time
    const occurrenceAt = schedule.nextRunAt || now;
    const jitterMs = generateDailyJitter();
    const jitteredTime = new Date(
      occurrenceAt.getTime() + jitterMs,
    );

    // Don't schedule in the past — use now if jitter pushed it back
    const scheduledAt = jitteredTime > now ? jitteredTime : now;

    const isGroupSchedule = !!schedule.postGroupId;

    if (isGroupSchedule) {
      // Group-based schedule (Facebook groups) — existing behavior
      await prisma.publicationJob.upsert({
        where: {
          scheduleId_occurrenceAt: {
            scheduleId: schedule.id,
            occurrenceAt,
          },
        },
        update: {},
        create: {
          scheduleId: schedule.id,
          occurrenceAt,
          postGroupId: schedule.postGroupId,
          scheduledAt,
        },
      });
    } else {
      // Non-group schedule (Profile, Instagram, or WhatsApp)
      await prisma.publicationJob.upsert({
        where: {
          scheduleId_occurrenceAt: {
            scheduleId: schedule.id,
            occurrenceAt,
          },
        },
        update: {},
        create: {
          scheduleId: schedule.id,
          occurrenceAt,
          postId: schedule.postId,
          scheduledAt,
          targetType: schedule.targetType || "PROFILE",
          platform: schedule.platform || "FACEBOOK",
          igPublishType: schedule.igPublishType || null,
        },
      });
    }
    created++;

    log.debug("Job created with jitter", {
      scheduleId: schedule.id,
      targetType: schedule.targetType || "GROUP",
      igPublishType: schedule.igPublishType || null,
      originalTime: schedule.nextRunAt?.toISOString(),
      jitteredTime: scheduledAt.toISOString(),
      jitterSec: Math.round(jitterMs / 1000),
    });

    // Calculate next run time
    const nextRun = calculateNextRun(schedule);

    if (nextRun && (!schedule.endAt || nextRun <= schedule.endAt)) {
      await prisma.postGroupSchedule.update({
        where: { id: schedule.id },
        data: { nextRunAt: nextRun },
      });
    } else {
      // No more runs — deactivate schedule
      await prisma.postGroupSchedule.update({
        where: { id: schedule.id },
        data: { isActive: false, nextRunAt: null },
      });
    }
  }

  log.info("Scheduled jobs generated", { created });
  return created;
}

// ─── Next Run Calculator ──────────────────────────────────

/**
 * Calculate the next run time based on schedule frequency.
 */
function calculateNextRun(schedule) {
  const base = schedule.nextRunAt || new Date();

  switch (schedule.frequencyType) {
    case "ONCE":
      return null; // One-time, no next run

    case "DAILY":
      return new Date(base.getTime() + 24 * 60 * 60 * 1000);

    case "WEEKLY":
      return new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);

    case "MONTHLY": {
      const next = new Date(base);
      next.setMonth(next.getMonth() + 1);
      return next;
    }

    case "CUSTOM": {
      if (!schedule.intervalValue || !schedule.intervalUnit) return null;

      const multipliers = {
        MINUTES: 60 * 1000,
        HOURS: 60 * 60 * 1000,
        DAYS: 24 * 60 * 60 * 1000,
        WEEKS: 7 * 24 * 60 * 60 * 1000,
      };

      const ms =
        schedule.intervalValue * (multipliers[schedule.intervalUnit] || 0);
      return ms > 0 ? new Date(base.getTime() + ms) : null;
    }

    default:
      return null;
  }
}
