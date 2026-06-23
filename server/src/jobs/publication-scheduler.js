import { PrismaClient } from "@prisma/client";
import { publishToGroup } from "../utils/facebook-automation.js";
import { createLogger } from "../utils/logger.js";

const prisma = new PrismaClient();
const log = createLogger("pub-scheduler");

/**
 * Process pending publication jobs.
 * Finds jobs that are due (scheduledAt <= now) and not yet running,
 * locks them to prevent double-processing, then publishes.
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
    take: 10, // Process in batches
  });

  if (pendingJobs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  log.info("Found pending jobs to process", { count: pendingJobs.length });

  let succeeded = 0;
  let failed = 0;

  for (const job of pendingJobs) {
    // Try to lock the job (optimistic locking)
    const locked = await prisma.publicationJob.updateMany({
      where: {
        id: job.id,
        status: "PENDING",
        lockedAt: null,
      },
      data: {
        status: "RUNNING",
        lockedAt: now,
        lockedBy: workerId,
        startedAt: now,
        attempts: { increment: 1 },
      },
    });

    if (locked.count === 0) {
      // Another worker grabbed it
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
      });

      // Delay between publications to avoid Facebook rate limiting
      await new Promise((r) => setTimeout(r, 10000));
    } catch (error) {
      const errorMsg = error.message || "Unknown error";
      failed++;
      log.error("Publication job failed", error, {
        jobId: job.id,
        attempt: newAttempts,
        maxAttempts: job.maxAttempts,
      });

      const newAttempts = job.attempts + 1;
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

        // Cancel all other pending jobs for this user — no point retrying without a session
        await prisma.publicationJob.updateMany({
          where: {
            status: "PENDING",
            postGroup: { userId: user.id },
            id: { not: job.id },
          },
          data: { status: "CANCELLED", lastError: "Session expired — reconnect Facebook" },
        });
        log.warn("Cancelled all pending jobs for user due to session error", { userId: user.id });
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
      } else {
        // Still has retries — back to pending with exponential backoff
        const backoffMinutes = Math.pow(2, newAttempts) * 5; // 10, 20, 40 min...
        const nextAttemptAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

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

  log.info("Publication batch completed", {
    processed: pendingJobs.length,
    succeeded,
    failed,
  });

  return { processed: pendingJobs.length, succeeded, failed };
}

/**
 * Generate publication jobs from active schedules.
 * Checks PostGroupSchedule records where nextRunAt <= now,
 * creates PublicationJob entries, and advances nextRunAt.
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
    // Create a publication job
    await prisma.publicationJob.create({
      data: {
        postGroupId: schedule.postGroupId,
        scheduledAt: schedule.nextRunAt || now,
      },
    });
    created++;

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
