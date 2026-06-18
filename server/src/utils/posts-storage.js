import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function savePost({
  userId,
  groupUrl,
  groupName,
  text,
  postUrl,
  screenshot,
  anonymous,
  location,
}) {
  // Find or create a Group record for the groupUrl
  let group = await prisma.group.findFirst({
    where: { url: groupUrl },
  });
  if (!group) {
    group = await prisma.group.create({
      data: {
        name: groupName || groupUrl,
        url: groupUrl,
      },
    });
  }

  // Create the Post
  const post = await prisma.post.create({
    data: {
      userId,
      content: text,
      status: "ACTIVE",
      isAnonymous: anonymous || false,
      location: location || null,
    },
  });

  // Link post to group via PostGroup
  const postGroup = await prisma.postGroup.create({
    data: {
      postId: post.id,
      groupId: group.id,
      userId,
    },
  });

  // Create publication history record
  await prisma.publicationHistory.create({
    data: {
      postId: post.id,
      groupId: group.id,
      userId,
      postGroupId: postGroup.id,
      publishedAt: new Date(),
      externalPostUrl: postUrl || null,
      screenshotUrl: screenshot ? "stored" : null,
      status: postUrl ? "SUCCESS" : "FAILED",
    },
  });

  return {
    id: post.id,
    groupUrl,
    groupName: groupName || null,
    text,
    postUrl: postUrl || null,
    createdAt: post.createdAt.toISOString(),
    hasScreenshot: !!screenshot,
  };
}

export async function getAllPosts(userId) {
  const posts = await prisma.post.findMany({
    where: userId ? { userId } : {},
    include: {
      postGroups: {
        include: {
          group: true,
          publications: {
            orderBy: { publishedAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return posts.map((p) => ({
    id: p.id,
    text: p.content,
    location: p.location,
    anonymous: p.isAnonymous,
    createdAt: p.createdAt.toISOString(),
    groupName: p.postGroups[0]?.group?.name || null,
    groupUrl: p.postGroups[0]?.group?.url || null,
    postUrl: p.postGroups[0]?.publications[0]?.externalPostUrl || null,
    hasScreenshot: !!p.postGroups[0]?.publications[0]?.screenshotUrl,
  }));
}

export async function getPostsByGroup(groupUrl) {
  const group = await prisma.group.findFirst({
    where: { url: groupUrl },
  });
  if (!group) return [];

  const postGroups = await prisma.postGroup.findMany({
    where: { groupId: group.id },
    include: {
      post: true,
      publications: {
        orderBy: { publishedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return postGroups.map((pg) => ({
    id: pg.post.id,
    text: pg.post.content,
    location: pg.post.location,
    anonymous: pg.post.isAnonymous,
    createdAt: pg.post.createdAt.toISOString(),
    groupName: null,
    groupUrl,
    postUrl: pg.publications[0]?.externalPostUrl || null,
    hasScreenshot: !!pg.publications[0]?.screenshotUrl,
  }));
}
