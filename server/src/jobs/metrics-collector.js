import prisma from "../config/prisma.js";
import {
  scrapeUserPublicationMetrics,
  savePublicationMetrics,
  refreshInstagramMetrics,
} from "../utils/metrics-scraper.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("metrics-job");

/**
 * Collect engagement metrics for all publications from the last 30 days
 * across all users with valid Facebook sessions or Instagram connections.
 */
export async function collectAllMetrics() {
  log.info("Starting metrics collection job");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Find all users with valid sessions
  const users = await prisma.user.findMany({
    where: { fbSessionValid: true },
    select: { id: true },
  });

  // Also find users with active IG connections (might not have FB session)
  const igUsers = await prisma.connectedAccount.findMany({
    where: { provider: "INSTAGRAM", status: "ACTIVE" },
    select: { userId: true },
    distinct: ["userId"],
  });
  const allUserIds = new Set([
    ...users.map((u) => u.id),
    ...igUsers.map((u) => u.userId),
  ]);

  if (allUserIds.size === 0) {
    log.info("No users with valid sessions, skipping metrics collection");
    return;
  }

  let totalScraped = 0;
  let totalSaved = 0;

  for (const userId of allUserIds) {
    try {
      // Get FB publications from last 30 days with a valid URL
      const fbPublications = await prisma.publicationHistory.findMany({
        where: {
          userId,
          status: "SUCCESS",
          platform: "FACEBOOK",
          externalPostUrl: { not: null },
          publishedAt: { gte: thirtyDaysAgo },
        },
        select: { id: true, externalPostUrl: true },
        orderBy: { publishedAt: "desc" },
      });

      // Get IG publications from last 30 days with externalPostId
      const igPublicationsRaw = await prisma.publicationHistory.findMany({
        where: {
          userId,
          status: "SUCCESS",
          platform: "INSTAGRAM",
          externalPostId: { not: null },
          publishedAt: { gte: thirtyDaysAgo },
        },
        select: {
          id: true,
          externalPostId: true,
          publicationJob: { select: { igPublishType: true } },
        },
        orderBy: { publishedAt: "desc" },
      });
      const igPublications = igPublicationsRaw.map((p) => ({
        ...p,
        igMediaType: p.publicationJob?.igPublishType || "FEED",
      }));

      if (fbPublications.length === 0 && igPublications.length === 0) {
        log.debug(`User ${userId}: no recent publications to scrape`);
        continue;
      }

      // Facebook metrics via Playwright scraping
      if (fbPublications.length > 0) {
        log.info(
          `User ${userId}: scraping FB metrics for ${fbPublications.length} publications`,
        );
        const results = await scrapeUserPublicationMetrics(
          userId,
          fbPublications,
        );
        for (const result of results) {
          if (result.likes > 0 || result.comments > 0) {
            await savePublicationMetrics(
              result.publicationId,
              result.likes,
              result.comments,
            );
            totalSaved++;
          }
        }
        totalScraped += results.length;
      }

      // Instagram metrics via Graph API
      if (igPublications.length > 0) {
        log.info(
          `User ${userId}: fetching IG metrics for ${igPublications.length} publications`,
        );
        const igResults = await refreshInstagramMetrics(userId, igPublications);
        for (const result of igResults) {
          await savePublicationMetrics(
            result.publicationId,
            result.likes,
            result.comments,
            result.shares || 0,
            result.reach || 0,
            result.impressions || 0,
            result.views || 0,
            result.saved || 0,
            result.replies || 0,
            result.totalInteractions || 0,
          );
          totalSaved++;
        }
        totalScraped += igResults.length;
      }

      // Delay between users to avoid rate limiting
      await new Promise((r) => setTimeout(r, 5000 + Math.random() * 5000));
    } catch (err) {
      log.error(`Error collecting metrics for user ${userId}:`, err.message);
    }
  }

  log.info(
    `Metrics collection done: scraped ${totalScraped}, saved ${totalSaved} new entries`,
  );
}

/**
 * Stories are short-lived, so collect them much more frequently than regular
 * media. The saved snapshots remain available after Instagram expires the
 * public story and its link.
 */
export async function collectRecentInstagramStoryMetrics() {
  const cutoff = new Date(Date.now() - 26 * 60 * 60 * 1000);
  const stories = await prisma.publicationHistory.findMany({
    where: {
      status: "SUCCESS",
      platform: "INSTAGRAM",
      externalPostId: { not: null },
      publishedAt: { gte: cutoff },
      publicationJob: { igPublishType: "STORY" },
    },
    select: {
      id: true,
      userId: true,
      externalPostId: true,
      publicationJob: { select: { igPublishType: true } },
    },
  });

  const byUser = new Map();
  for (const story of stories) {
    if (!byUser.has(story.userId)) byUser.set(story.userId, []);
    byUser.get(story.userId).push({ ...story, igMediaType: "STORY" });
  }

  let saved = 0;
  for (const [userId, publications] of byUser) {
    const results = await refreshInstagramMetrics(userId, publications);
    for (const result of results) {
      await savePublicationMetrics(
        result.publicationId,
        result.likes,
        result.comments,
        result.shares || 0,
        result.reach || 0,
        result.impressions || 0,
        result.views || 0,
        result.saved || 0,
        result.replies || 0,
        result.totalInteractions || 0,
      );
      saved++;
    }
  }
  log.info(`Instagram story metrics collection done: ${saved} snapshots saved`);
  return saved;
}

/**
 * Schedule the next random daytime run.
 * Returns a timeout that fires at a random hour between 8:00-20:00.
 */
function scheduleRandomRun(callback) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Pick a random hour 8-20 and random minute
  const randomHour = 8 + Math.floor(Math.random() * 12);
  const randomMinute = Math.floor(Math.random() * 60);
  const targetTime = new Date(today);
  targetTime.setHours(randomHour, randomMinute, 0, 0);

  // If we've already passed this time today, schedule for tomorrow
  if (targetTime <= now) {
    targetTime.setDate(targetTime.getDate() + 1);
  }

  const delay = targetTime.getTime() - now.getTime();
  log.info(
    `Next random metrics run scheduled for ${targetTime.toISOString()} (in ${Math.round(delay / 60000)} minutes)`,
  );

  return setTimeout(async () => {
    try {
      await callback();
    } catch (err) {
      log.error("Error in random metrics run:", err.message);
    }
    // Schedule the next random run for tomorrow
    scheduleRandomRun(callback);
  }, delay);
}

/**
 * Schedule the nightly run at 02:00.
 */
function scheduleNightlyRun(callback) {
  const now = new Date();
  const tonight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    2,
    0,
    0,
  );

  // If past 02:00 today, schedule for tomorrow
  if (tonight <= now) {
    tonight.setDate(tonight.getDate() + 1);
  }

  const delay = tonight.getTime() - now.getTime();
  log.info(
    `Next nightly metrics run scheduled for ${tonight.toISOString()} (in ${Math.round(delay / 60000)} minutes)`,
  );

  return setTimeout(async () => {
    try {
      await callback();
    } catch (err) {
      log.error("Error in nightly metrics run:", err.message);
    }
    // Schedule next nightly run (24h from now, roughly)
    scheduleNightlyRun(callback);
  }, delay);
}

let nightlyTimer = null;
let randomTimer = null;

/**
 * Start the metrics collection scheduler.
 * Runs twice daily: once at 02:00 and once at a random hour (8-20).
 */
export function startMetricsScheduler() {
  log.info("Starting metrics scheduler (2x daily: nightly + random daytime)");

  nightlyTimer = scheduleNightlyRun(collectAllMetrics);
  randomTimer = scheduleRandomRun(collectAllMetrics);
}

/**
 * Stop the metrics scheduler.
 */
export function stopMetricsScheduler() {
  if (nightlyTimer) {
    clearTimeout(nightlyTimer);
    nightlyTimer = null;
  }
  if (randomTimer) {
    clearTimeout(randomTimer);
    randomTimer = null;
  }
  log.info("Metrics scheduler stopped");
}
