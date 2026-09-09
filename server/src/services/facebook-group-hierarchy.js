import prisma from "../config/prisma.js";

export async function reconcileFacebookGroupHierarchy(userId) {
  const facebookGroups = await prisma.facebookGroup.findMany({
    where: { userId },
    select: {
      groupId: true,
      groupName: true,
      groupImage: true,
      memberCount: true,
      privacyType: true,
    },
  });

  let linked = 0;
  for (let offset = 0; offset < facebookGroups.length; offset += 20) {
    const batch = facebookGroups.slice(offset, offset + 20);
    await Promise.all(batch.map(async (facebookGroup) => {
      const group = await prisma.group.upsert({
        where: { externalGroupId: facebookGroup.groupId },
        update: {
          name: facebookGroup.groupName,
          url: `https://www.facebook.com/groups/${facebookGroup.groupId}`,
          ...(facebookGroup.groupImage && { pictureUrl: facebookGroup.groupImage }),
          ...(facebookGroup.memberCount && { memberCount: facebookGroup.memberCount }),
          ...(facebookGroup.privacyType && { privacyType: facebookGroup.privacyType }),
        },
        create: {
          externalGroupId: facebookGroup.groupId,
          name: facebookGroup.groupName,
          url: `https://www.facebook.com/groups/${facebookGroup.groupId}`,
          pictureUrl: facebookGroup.groupImage,
          memberCount: facebookGroup.memberCount,
          privacyType: facebookGroup.privacyType,
        },
      });
      await prisma.userGroup.upsert({
        where: { userId_groupId: { userId, groupId: group.id } },
        update: { lastSyncedAt: new Date() },
        create: { userId, groupId: group.id, lastSyncedAt: new Date() },
      });
      linked += 1;
    }));
  }

  return { groups: facebookGroups.length, linked };
}
