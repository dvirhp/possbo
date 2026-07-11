import { PrismaClient } from "@prisma/client";
import { scrapeGroupsMetadata } from "../utils/facebook-automation.js";
import { createLogger } from "../utils/logger.js";

const prisma = new PrismaClient();
const log = createLogger("group-meta");

/**
 * Refresh metadata (member count + privacy type) for all groups of a specific user.
 * Called on-demand (refresh button, new registration) or by daily job.
 */
export async function refreshGroupsMetadataForUser(userId) {
  const groups = await prisma.facebookGroup.findMany({
    where: { userId },
    select: { groupId: true },
  });

  if (groups.length === 0) {
    log.debug("No groups to refresh for user", { userId });
    return { updated: 0 };
  }

  const groupsToScrape = groups.map((g) => ({
    groupId: g.groupId,
    groupUrl: `https://www.facebook.com/groups/${g.groupId}/`,
  }));

  log.info("Refreshing group metadata", { userId, count: groupsToScrape.length });

  const results = await scrapeGroupsMetadata(userId, groupsToScrape);

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
      updated++;
    }
  }

  log.info("Group metadata refresh complete", { userId, updated, total: groups.length });
  return { updated, total: groups.length };
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
      const result = await refreshGroupsMetadataForUser(user.id);
      totalUpdated += result.updated;
    } catch (err) {
      log.error("Failed to refresh metadata for user", { userId: user.id, error: err.message });
    }
    // Delay between users to avoid rate limiting
    await new Promise((r) => setTimeout(r, 10000));
  }

  log.info("Daily group metadata refresh complete", { users: users.length, totalUpdated });
}
