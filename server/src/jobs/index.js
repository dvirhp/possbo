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

const log = createLogger("scheduler");

const INTERVALS = {
  // Check for pending publication jobs every 60 seconds
  PROCESS_JOBS: 60 * 1000,
  // Generate new jobs from schedules every 5 minutes
  GENERATE_JOBS: 5 * 60 * 1000,
  // Keep-alive check every 7.5 hours
  SESSION_KEEPALIVE: 7.5 * 60 * 60 * 1000,
  // Refresh group metadata once a day
  GROUP_METADATA: 24 * 60 * 60 * 1000,
  // Scan daily; each token refreshes only inside its 30-day expiry window.
  INSTAGRAM_TOKEN_REFRESH: 24 * 60 * 60 * 1000,
  INSTAGRAM_STORY_METRICS: 60 * 60 * 1000,
};

let timers = [];

/**
 * Start all background jobs.
 * Called from index.js after server starts.
 */
export function startScheduler() {
  log.info("Starting background job scheduler");

  // Process pending publication jobs every minute
  const jobProcessor = setInterval(async () => {
    try {
      await processPublicationJobs();
    } catch (error) {
      log.error("Error processing publication jobs", error);
    }
  }, INTERVALS.PROCESS_JOBS);
  timers.push(jobProcessor);

  // Generate new jobs from schedules every 5 minutes
  const jobGenerator = setInterval(async () => {
    try {
      await generateScheduledJobs();
    } catch (error) {
      log.error("Error generating scheduled jobs", error);
    }
  }, INTERVALS.GENERATE_JOBS);
  timers.push(jobGenerator);

  // Session keep-alive every 7.5 hours
  const keepAlive = setInterval(async () => {
    try {
      await runSessionKeepAlive();
    } catch (error) {
      log.error("Error in session keep-alive", error);
    }
  }, INTERVALS.SESSION_KEEPALIVE);
  timers.push(keepAlive);

  // Group metadata refresh once a day
  const groupMeta = setInterval(async () => {
    try {
      await runDailyGroupMetadataRefresh();
    } catch (error) {
      log.error("Error in group metadata refresh", error);
    }
  }, INTERVALS.GROUP_METADATA);
  timers.push(groupMeta);

  const instagramTokenRefresh = setInterval(async () => {
    try {
      await refreshExpiringInstagramTokens();
    } catch (error) {
      log.error("Error refreshing Instagram tokens", error);
    }
  }, INTERVALS.INSTAGRAM_TOKEN_REFRESH);
  timers.push(instagramTokenRefresh);

  const instagramStoryMetrics = setInterval(async () => {
    try {
      await collectRecentInstagramStoryMetrics();
    } catch (error) {
      log.error("Error collecting Instagram story metrics", error);
    }
  }, INTERVALS.INSTAGRAM_STORY_METRICS);
  timers.push(instagramStoryMetrics);

  // Run job generator immediately on startup to catch any missed schedules
  setTimeout(async () => {
    try {
      await recoverStaleJobs();
      await generateScheduledJobs();
      await processPublicationJobs();
      await refreshExpiringInstagramTokens();
      await collectRecentInstagramStoryMetrics();
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
  stopMetricsScheduler();
}

/**
 * Trigger immediate processing of pending publication jobs.
 * Used when "now" mode campaigns are created.
 */
export function triggerImmediateProcess() {
  setTimeout(async () => {
    try {
      await processPublicationJobs();
    } catch (error) {
      log.error("Error in immediate job processing", error);
    }
  }, 2000);
}
