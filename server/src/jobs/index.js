import { runSessionKeepAlive } from "./session-keepalive.js";
import {
  processPublicationJobs,
  generateScheduledJobs,
  recoverStaleJobs,
} from "./publication-scheduler.js";
import { runDailyGroupMetadataRefresh } from "./group-metadata-refresh.js";
import {
  startMetricsScheduler,
  stopMetricsScheduler,
  collectRecentInstagramStoryMetrics,
} from "./metrics-collector.js";
import { refreshExpiringInstagramTokens } from "./instagram-token-refresh.js";
import { createLogger } from "../utils/logger.js";
import prisma from "../config/prisma.js";
import { runRetentionCleanup } from "./retention-cleanup.js";
import { sendExternalAlert } from "../utils/external-alerts.js";

const log = createLogger("scheduler");

const INTERVALS = {
  // Check for pending publication jobs every 60 seconds
  PROCESS_JOBS: 60 * 1000,
  // Materialize recurring occurrences every minute to keep schedule drift low.
  GENERATE_JOBS: 60 * 1000,
  // Keep-alive check every 7.5 hours
  SESSION_KEEPALIVE: 7.5 * 60 * 60 * 1000,
  // Refresh group metadata once a day
  GROUP_METADATA: 24 * 60 * 60 * 1000,
  // Scan daily; each token refreshes only inside its 30-day expiry window.
  INSTAGRAM_TOKEN_REFRESH: 24 * 60 * 60 * 1000,
  INSTAGRAM_STORY_METRICS: 60 * 60 * 1000,
  HEARTBEAT: 60 * 1000,
  RETENTION: 24 * 60 * 60 * 1000,
};

let timers = [];
const runningTasks = new Set();

async function runExclusive(name, task) {
  if (runningTasks.has(name)) {
    log.warn("Skipping overlapping background task", { task: name });
    return;
  }
  runningTasks.add(name);
  try {
    return await task();
  } finally {
    runningTasks.delete(name);
  }
}

/**
 * Start all background jobs.
 * Called from index.js after server starts.
 */
export function startScheduler() {
  log.info("Starting background job scheduler");

  const heartbeat = setInterval(async () => {
    try {
      const [pending, running, failed] = await Promise.all([
        prisma.publicationJob.count({ where: { status: "PENDING", scheduledAt: { lte: new Date() } } }),
        prisma.publicationJob.count({ where: { status: "RUNNING" } }),
        prisma.publicationJob.count({ where: { status: "FAILED", updatedAt: { gte: new Date(Date.now() - 3600000) } } }),
      ]);
      const meta = { event: "worker_heartbeat", pendingJobs: pending, runningJobs: running, failedJobsLastHour: failed, runningTasks: [...runningTasks], memoryMb: Math.round(process.memoryUsage().rss / 1048576) };
      if (failed >= Number(process.env.ALERT_FAILED_JOBS_PER_HOUR || 5)) {
        log.warn("Worker failure threshold exceeded", { ...meta, event: "worker_failure_threshold" });
        void sendExternalAlert("worker_failure_threshold", meta);
      }
      if (pending >= Number(process.env.ALERT_QUEUE_DEPTH || 1000)) {
        log.warn("Publication queue depth threshold exceeded", { ...meta, event: "queue_depth_threshold" });
        void sendExternalAlert("queue_depth_threshold", meta);
      }
      else log.info("Worker heartbeat", meta);
    } catch (error) { log.error("Worker heartbeat failed", error, { event: "worker_heartbeat_failed" }); }
  }, INTERVALS.HEARTBEAT);
  heartbeat.unref?.();
  timers.push(heartbeat);

  // Process pending publication jobs every minute
  const jobProcessor = setInterval(async () => {
    try {
      await runExclusive("publication-jobs", processPublicationJobs);
    } catch (error) {
      log.error("Error processing publication jobs", error);
    }
  }, INTERVALS.PROCESS_JOBS);
  timers.push(jobProcessor);

  // Generate new jobs from schedules every 5 minutes
  const jobGenerator = setInterval(async () => {
    try {
      await runExclusive("stale-job-recovery", recoverStaleJobs);
      await runExclusive("schedule-generator", generateScheduledJobs);
    } catch (error) {
      log.error("Error generating scheduled jobs", error);
    }
  }, INTERVALS.GENERATE_JOBS);
  timers.push(jobGenerator);

  // Session keep-alive every 7.5 hours
  const keepAlive = setInterval(async () => {
    try {
      await runExclusive("session-keepalive", runSessionKeepAlive);
    } catch (error) {
      log.error("Error in session keep-alive", error);
    }
  }, INTERVALS.SESSION_KEEPALIVE);
  timers.push(keepAlive);

  // Group metadata refresh once a day
  const groupMeta = setInterval(async () => {
    try {
      await runExclusive("group-metadata", runDailyGroupMetadataRefresh);
    } catch (error) {
      log.error("Error in group metadata refresh", error);
    }
  }, INTERVALS.GROUP_METADATA);
  timers.push(groupMeta);

  const instagramTokenRefresh = setInterval(async () => {
    try {
      await runExclusive(
        "instagram-token-refresh",
        refreshExpiringInstagramTokens,
      );
    } catch (error) {
      log.error("Error refreshing Instagram tokens", error);
    }
  }, INTERVALS.INSTAGRAM_TOKEN_REFRESH);
  timers.push(instagramTokenRefresh);

  const instagramStoryMetrics = setInterval(async () => {
    try {
      await runExclusive(
        "instagram-story-metrics",
        collectRecentInstagramStoryMetrics,
      );
    } catch (error) {
      log.error("Error collecting Instagram story metrics", error);
    }
  }, INTERVALS.INSTAGRAM_STORY_METRICS);
  timers.push(instagramStoryMetrics);

  const retention = setInterval(() => {
    runExclusive("retention-cleanup", runRetentionCleanup).catch((error) =>
      log.error("Retention cleanup failed", error),
    );
  }, INTERVALS.RETENTION);
  retention.unref?.();
  timers.push(retention);

  // Run job generator immediately on startup to catch any missed schedules
  setTimeout(async () => {
    try {
      await runExclusive("stale-job-recovery", recoverStaleJobs);
      await runExclusive("schedule-generator", generateScheduledJobs);
      await runExclusive("publication-jobs", processPublicationJobs);
      await runExclusive(
        "instagram-token-refresh",
        refreshExpiringInstagramTokens,
      );
      await runExclusive(
        "instagram-story-metrics",
        collectRecentInstagramStoryMetrics,
      );
      await runExclusive("retention-cleanup", runRetentionCleanup);
    } catch (error) {
      log.error("Error on startup run", error);
    }
  }, 5000);

  // Start metrics collection (2x daily: nightly + random daytime)
  startMetricsScheduler();

  log.info("Background jobs started", {
    processJobs: `${INTERVALS.PROCESS_JOBS / 1000}s`,
    generateJobs: `${INTERVALS.GENERATE_JOBS / 1000}s`,
    keepAlive: `${INTERVALS.SESSION_KEEPALIVE / 3600000} hours`,
    instagramTokenRefresh: "daily scan; refresh within 30 days of expiry",
    metricsCollection: "2x daily (02:00 + random 08:00-20:00)",
    instagramStoryMetrics: "hourly for the first 26 hours",
  });
}

/**
 * Stop all background jobs (for graceful shutdown).
 */
export function stopScheduler() {
  log.info("Stopping background jobs");
  timers.forEach((t) => clearInterval(t));
  timers = [];
  runningTasks.clear();
  stopMetricsScheduler();
}

/**
 * Trigger immediate processing of pending publication jobs.
 * Used when "now" mode campaigns are created.
 */
export function triggerImmediateProcess() {
  if (process.env.RUN_SCHEDULER === "false") {
    log.debug("Immediate processing delegated to the worker");
    return;
  }
  setTimeout(async () => {
    try {
      await runExclusive("publication-jobs", processPublicationJobs);
    } catch (error) {
      log.error("Error in immediate job processing", error);
    }
  }, 2000);
}
