import { PrismaClient } from "@prisma/client";
import {
  scrapeUserPublicationMetrics,
  savePublicationMetrics,
} from "../utils/metrics-scraper.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("metrics-job");
const prisma = new PrismaClient();

/**
 * Collect engagement metrics for all publications from the last 30 days
 * across all users with valid Facebook sessions.
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

  if (users.length === 0) {
    log.info("No users with valid sessions, skipping metrics collection");
    return;
  }

  let totalScraped = 0;
  let totalSaved = 0;

  for (const user of users) {
    try {
      // Get publications from last 30 days with a valid URL
      const publications = await prisma.publicationHistory.findMany({
        where: {
          userId: user.id,
          status: "SUCCESS",
          externalPostUrl: { not: null },
          publishedAt: { gte: thirtyDaysAgo },
        },
        select: { id: true, externalPostUrl: true },
        orderBy: { publishedAt: "desc" },
      });

      if (publications.length === 0) {
        log.debug(`User ${user.id}: no recent publications to scrape`);
        continue;
      }

      log.info(
        `User ${user.id}: scraping metrics for ${publications.length} publications`,
      );

      const results = await scrapeUserPublicationMetrics(user.id, publications);

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

      // Delay between users to avoid rate limiting
      if (users.indexOf(user) < users.length - 1) {
        await new Promise((r) => setTimeout(r, 10000 + Math.random() * 5000));
      }
    } catch (err) {
      log.error(`Error collecting metrics for user ${user.id}:`, err.message);
    }
  }

  log.info(
    `Metrics collection done: scraped ${totalScraped}, saved ${totalSaved} new entries`,
  );
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
