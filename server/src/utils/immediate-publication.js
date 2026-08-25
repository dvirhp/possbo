import crypto from "crypto";
import prisma from "../config/prisma.js";
import {
  createDailyLimitError,
  getDailyPublishUsage,
} from "./daily-publish-limit.js";

function uploadUrl(filePath) {
  const filename = String(filePath || "").split(/[\\/]/).pop();
  return filename ? `/uploads/${filename}` : null;
}

async function findOrCreateGroup(tx, groupUrl, groupName) {
  const existing = await tx.group.findFirst({ where: { url: groupUrl } });
  if (existing) return existing;

  const externalGroupId =
    groupUrl.match(/facebook\.com\/groups\/([^/?#]+)/i)?.[1] || null;
  if (externalGroupId) {
    return tx.group.upsert({
      where: { externalGroupId },
      update: { url: groupUrl, ...(groupName ? { name: groupName } : {}) },
      create: {
        externalGroupId,
        name: groupName || groupUrl,
        url: groupUrl,
      },
    });
  }
  return tx.group.create({
    data: { name: groupName || groupUrl, url: groupUrl },
  });
}

export async function queueImmediateFacebookPublication({
  userId,
  targetType,
  groupUrl = null,
  groupName = null,
  text,
  title = null,
  anonymous = false,
  location = null,
  imagePaths = [],
  idempotencyKey = null,
}) {
  const normalizedKey = idempotencyKey
    ? `${userId}:${String(idempotencyKey).slice(0, 180)}`
    : `${userId}:immediate:${crypto.randomUUID()}`;

  const existing = await prisma.publicationJob.findUnique({
    where: { idempotencyKey: normalizedKey },
  });
  if (existing) {
    return { job: existing, postId: existing.postId, duplicate: true };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Serialize immediate reservations for this user. This closes the race
      // where two API instances both observe the same remaining daily quota.
      await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
      const usage = await getDailyPublishUsage(userId, new Date(), {
        includeQueued: true,
        db: tx,
      });
      if (usage.reached) throw createDailyLimitError(usage);

      const post = await tx.post.create({
        data: {
          userId,
          title,
          content: text,
          status: "ACTIVE",
          isAnonymous: anonymous,
          location,
          publishToProfile: targetType === "PROFILE",
          imageUrl: uploadUrl(imagePaths[0]),
          media: {
            create: imagePaths.map((filePath, orderIndex) => ({
              mediaType: "IMAGE",
              url: uploadUrl(filePath),
              orderIndex,
            })),
          },
        },
      });

      let postGroupId = null;
      if (targetType === "GROUP") {
        const group = await findOrCreateGroup(tx, groupUrl, groupName);
        const postGroup = await tx.postGroup.create({
          data: { postId: post.id, groupId: group.id, userId },
        });
        postGroupId = postGroup.id;
      }

      const job = await tx.publicationJob.create({
        data: {
          postId: post.id,
          postGroupId,
          targetType,
          platform: "FACEBOOK",
          scheduledAt: new Date(),
          idempotencyKey: normalizedKey,
        },
      });
      return { job, postId: post.id, duplicate: false };
    });
  } catch (error) {
    if (error?.code === "P2002") {
      const duplicate = await prisma.publicationJob.findUnique({
        where: { idempotencyKey: normalizedKey },
      });
      if (duplicate) {
        return { job: duplicate, postId: duplicate.postId, duplicate: true };
      }
    }
    throw error;
  }
}
