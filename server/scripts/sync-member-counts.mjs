import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Backfill dailyExposure from publicationHistory
  const pubs = await prisma.publicationHistory.findMany({
    where: { status: "SUCCESS" },
    include: { group: true },
  });

  console.log(`Found ${pubs.length} successful publications`);

  for (const pub of pubs) {
    const memberCount = pub.group?.memberCount || 0;
    if (memberCount <= 0) {
      console.log(
        `Skipping pub ${pub.id} - no memberCount for group ${pub.group?.name}`,
      );
      continue;
    }

    const pubDate = new Date(pub.publishedAt);
    pubDate.setHours(0, 0, 0, 0);

    await prisma.dailyExposure.upsert({
      where: { userId_date: { userId: pub.userId, date: pubDate } },
      update: {
        exposureCount: { increment: memberCount },
        postsPublished: { increment: 1 },
      },
      create: {
        userId: pub.userId,
        date: pubDate,
        exposureCount: memberCount,
        postsPublished: 1,
      },
    });
    console.log(
      `Created/updated exposure: ${pubDate.toISOString().slice(0, 10)} +${memberCount}`,
    );
  }

  // Also sync FacebookGroup memberCounts to Group table
  const fbGroups = await prisma.facebookGroup.findMany({
    where: { memberCount: { not: null } },
    select: { groupId: true, memberCount: true, privacyType: true },
  });

  let synced = 0;
  for (const fg of fbGroups) {
    const url = `https://www.facebook.com/groups/${fg.groupId}`;
    const r = await prisma.group.updateMany({
      where: { url },
      data: { memberCount: fg.memberCount, privacyType: fg.privacyType },
    });
    if (r.count > 0) synced++;
  }

  console.log(`Synced ${synced} of ${fbGroups.length} groups to Group table`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
