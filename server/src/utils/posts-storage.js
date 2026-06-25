import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function savePost({
  userId,
  groupUrl,
  groupName,
  text,
  title,
  postUrl,
  screenshot,
  anonymous,
  location,
  imagePaths,
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
      title: title || null,
      content: text,
      status: "ACTIVE",
      isAnonymous: anonymous || false,
      location: location || null,
      imageUrl: imagePaths?.[0]
        ? `/uploads/${imagePaths[0].split(/[\\/]/).pop()}`
        : null,
    },
  });

  // Save media records for multiple images
  if (imagePaths?.length > 0) {
    for (let i = 0; i < imagePaths.length; i++) {
      const filename = imagePaths[i].split(/[\\/]/).pop();
      await prisma.postMedia.create({
        data: {
          postId: post.id,
          mediaType: "IMAGE",
          url: `/uploads/${filename}`,
          orderIndex: i,
        },
      });
    }
  }

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
      screenshotUrl: screenshot || null,
      status: "SUCCESS",
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
    imageCount: imagePaths?.length || 0,
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
