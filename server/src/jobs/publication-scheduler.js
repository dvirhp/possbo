import { PrismaClient } from "@prisma/client";
import { publishToGroup } from "../utils/facebook-automation.js";
import { createLogger } from "../utils/logger.js";

const prisma = new PrismaClient();
const log = createLogger("pub-scheduler");

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
  DAILY_LIMIT: 80,

  // Max concurrent jobs per user in a single batch
  USER_BATCH_SIZE: 5,
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
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return prisma.publicationHistory.count({
    where: {
      userId,
      publishedAt: { gte: todayStart },
      status: "SUCCESS",
    },
  });
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

  // Find pending jobs that are due
  const pendingJobs = await prisma.publicationJob.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: now },
    },
    include: {
      postGroup: {
        include: {
          post: {
            include: { media: true },
          },
          group: true,
          user: true,
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: 20,
  });

  if (pendingJobs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  log.info("Found pending jobs to process", { count: pendingJobs.length });

  // Group jobs by user for per-user queue management
  const jobsByUser = new Map();
  for (const job of pendingJobs) {
    const userId = job.postGroup.user.id;
    if (!jobsByUser.has(userId)) jobsByUser.set(userId, []);
    jobsByUser.get(userId).push(job);
  }

  let succeeded = 0;
  let failed = 0;
  let skippedLimit = 0;

  // Process each user's queue sequentially with delays
  for (const [userId, userJobs] of jobsByUser) {
    // Check daily limit
    const todayCount = await getUserDailyCount(userId);
    if (todayCount >= ANTI_DETECT.DAILY_LIMIT) {
      log.warn("User hit daily publication limit", {
        userId,
        count: todayCount,
        limit: ANTI_DETECT.DAILY_LIMIT,
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
          data: { scheduledAt: tomorrow },
        });
      }
      skippedLimit += userJobs.length;
      continue;
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
          data: { scheduledAt: deferredTime },
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

      // Try to lock the job (optimistic locking)
      const locked = await prisma.publicationJob.updateMany({
        where: {
          id: job.id,
          status: "PENDING",
          lockedAt: null,
        },
        data: {
          status: "RUNNING",
          lockedAt: new Date(),
          lockedBy: workerId,
          startedAt: new Date(),
          attempts: { increment: 1 },
        },
      });

      if (locked.count === 0) {
        continue;
      }

      const { postGroup } = job;
      const { post, group, user } = postGroup;

      try {
        // Check if user has valid Facebook session
        if (!user.facebookStorageState) {
          throw new Error("SESSION_EXPIRED");
        }

        // Get the group URL
        const groupUrl =
          group.url || `https://www.facebook.com/groups/${group.externalId}`;

        // Get image path if there's media
        const imagePath = post.media?.[0]?.url || null;

        // Publish
        const result = await publishToGroup(groupUrl, post.content, imagePath, {
          userId: user.id,
          isAnonymous: post.isAnonymous,
          location: post.location,
        });

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
            groupId: group.id,
            userId: user.id,
            postGroupId: postGroup.id,
            publicationJobId: job.id,
            publishedAt: new Date(),
            status: "SUCCESS",
            externalPostUrl: result?.postUrl || null,
            screenshotUrl: result?.screenshot || null,
          },
        });

        succeeded++;
        log.info("Post published successfully", {
          postId: post.id,
          groupId: group.id,
          jobId: job.id,
          userDailyTotal: todayCount + i + 1,
        });
      } catch (error) {
        const errorMsg = error.message || "Unknown error";
        const newAttempts = job.attempts + 1;
        failed++;
        log.error("Publication job failed", error, {
          jobId: job.id,
          attempt: newAttempts,
          maxAttempts: job.maxAttempts,
        });

        const isSessionError =
          errorMsg === "SESSION_EXPIRED" ||
          errorMsg === "FACEBOOK_SESSION_REQUIRED" ||
          errorMsg === "POST_COMPOSER_NOT_FOUND";

        if (isSessionError) {
          // Mark user's session as invalid
          await prisma.user.update({
            where: { id: user.id },
            data: { fbSessionValid: false, facebookStorageState: null },
          });

          // Cancel all other pending jobs for this user
          await prisma.publicationJob.updateMany({
            where: {
              status: "PENDING",
              postGroup: { userId: user.id },
              id: { not: job.id },
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

        if (newAttempts >= job.maxAttempts || isSessionError) {
          // Max retries reached or session expired — mark as failed
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
              groupId: group.id,
              userId: user.id,
              postGroupId: postGroup.id,
              publicationJobId: job.id,
              publishedAt: new Date(),
              status: "FAILED",
              errorMessage: errorMsg,
            },
          });

          // Notify user
          const notificationMsg = isSessionError
            ? "החיבור לפייסבוק פג. אנא התחבר מחדש."
            : `הפרסום נכשל אחרי ${newAttempts} ניסיונות: ${errorMsg}`;

          await prisma.notification.create({
            data: {
              userId: user.id,
              type: isSessionError ? "SESSION_EXPIRED" : "PUBLICATION_FAILED",
              title: "פרסום נכשל",
              message: notificationMsg,
            },
          });

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
      }
    }
  }

  log.info("Publication batch completed", {
    processed: pendingJobs.length,
    succeeded,
    failed,
    skippedLimit,
  });

  return { processed: pendingJobs.length, succeeded, failed };
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
    },
  });

  if (dueSchedules.length === 0) return 0;

  log.info("Generating jobs from due schedules", {
    count: dueSchedules.length,
  });

  let created = 0;

  for (const schedule of dueSchedules) {
    // Apply daily jitter to the job's actual execution time
    const jitterMs = generateDailyJitter();
    const jitteredTime = new Date(
      (schedule.nextRunAt || now).getTime() + jitterMs,
    );

    // Don't schedule in the past — use now if jitter pushed it back
    const scheduledAt = jitteredTime > now ? jitteredTime : now;

    await prisma.publicationJob.create({
      data: {
        postGroupId: schedule.postGroupId,
        scheduledAt,
      },
    });
    created++;

    log.debug("Job created with jitter", {
      scheduleId: schedule.id,
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
