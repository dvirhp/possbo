import prisma from "../config/prisma.js";
import { scrapeGroupsMetadata } from "../utils/facebook-automation.js";
import { createLogger } from "../utils/logger.js";
import { withUserPublishLock } from "../utils/user-publish-lock.js";
const log = createLogger("group-meta");

// Per-user lock to prevent concurrent metadata refreshes
const activeRefreshes = new Map();

/**
 * Check if a metadata refresh is already running for this user.
 */
export function isRefreshInProgress(userId) {
  return activeRefreshes.has(userId);
}

/**
 * Get the current progress of a running refresh.
 */
export function getRefreshProgress(userId) {
  return activeRefreshes.get(userId) || null;
}

/**
 * Refresh metadata (member count + privacy type) for all groups of a specific user.
 * Called on-demand (refresh button, new registration) or by daily job.
 * Uses a per-user lock to prevent duplicate concurrent runs.
 */
export async function refreshGroupsMetadataForUser(userId, { refreshExisting = false } = {}) {
  // Prevent concurrent refreshes for the same user
  if (activeRefreshes.has(userId)) {
    log.info("Metadata refresh already in progress, skipping", { userId });
    return { updated: 0, skipped: true, reason: "already_in_progress" };
  }

  const groups = await prisma.facebookGroup.findMany({
    where: { userId, ...(!refreshExisting && { memberCount: null }) },
    select: { groupId: true, memberCount: true },
  });

  // Resume interrupted large-account refreshes before revisiting values that
  // were already collected successfully.
  groups.sort((a, b) => Number(a.memberCount !== null) - Number(b.memberCount !== null));

  if (groups.length === 0) {
    log.debug("No groups to refresh for user", { userId });
    return { updated: 0 };
  }

  const groupsToScrape = groups.map((g) => ({
    groupId: g.groupId,
    groupUrl: `https://www.facebook.com/groups/${g.groupId}/`,
  }));

  // Set lock with progress tracking
  const progress = {
    total: groupsToScrape.length,
    done: 0,
    updated: 0,
    startedAt: Date.now(),
  };
  activeRefreshes.set(userId, progress);

  log.info("Refreshing group metadata", {
    userId,
    count: groupsToScrape.length,
  });

  try {
    const lockResult = await withUserPublishLock(userId, async () => {
      // Browserbase sessions are intentionally short-lived. Large accounts
      // must rotate sessions or a 300+ group refresh is disconnected before
      // it can finish. Each scraper chunk persists its own batches as it goes.
      const results = [];
      const sessionChunkSize = 100;
      for (let offset = 0; offset < groupsToScrape.length; offset += sessionChunkSize) {
        const chunk = groupsToScrape.slice(offset, offset + sessionChunkSize);
        results.push(...await scrapeGroupsMetadata(userId, chunk));
        if (offset + sessionChunkSize < groupsToScrape.length) {
          await new Promise((resolve) => setTimeout(resolve, 12_000));
        }
      }
      return results;
    });
    if (!lockResult.acquired) {
      return { updated: 0, skipped: true, reason: "facebook_operation_in_progress" };
    }
    const results = lockResult.value;

    let updated = 0;
    for (const result of results) {
      if (result.memberCount || result.privacyType) {
        const data = {};
        if (result.memberCount) data.memberCount = result.memberCount;
        if (result.privacyType) data.privacyType = result.privacyType;

        await prisma.facebookGroup.updateMany({
          where: { userId, groupId: result.groupId },
          data,
        });

        // Also sync memberCount/privacyType to the Group table (used for exposure tracking)
        const groupUrl = `https://www.facebook.com/groups/${result.groupId}`;
        await prisma.group
          .updateMany({
            where: { url: groupUrl },
            data,
          })
          .catch(() => {});

        updated++;
      }
      progress.done++;
      progress.updated = updated;
    }

    log.info("Group metadata refresh complete", {
      userId,
      updated,
      total: groups.length,
    });
    return { updated, total: groups.length };
  } finally {
    activeRefreshes.delete(userId);
  }
}

/**
 * Daily job: refresh metadata for ALL users with valid sessions.
 */
export async function runDailyGroupMetadataRefresh() {
  log.info("Starting daily group metadata refresh");

  const users = await prisma.user.findMany({
    where: {
      fbSessionValid: true,
      facebookStorageState: { not: null },
    },
    select: { id: true, email: true },
  });

  log.info(`Found ${users.length} users with active FB sessions`);

  let totalUpdated = 0;
  for (const user of users) {
    try {
      const result = await refreshGroupsMetadataForUser(user.id, { refreshExisting: true });
      totalUpdated += result.updated;
    } catch (err) {
      log.error("Failed to refresh metadata for user", {
        userId: user.id,
        error: err.message,
      });
    }
    // Delay between users to avoid rate limiting
    await new Promise((r) => setTimeout(r, 10000));
  }

  log.info("Daily group metadata refresh complete", {
    users: users.length,
    totalUpdated,
  });
}
