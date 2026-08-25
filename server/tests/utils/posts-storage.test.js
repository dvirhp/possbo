import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGroup = { id: "group-1", name: "Test Group", url: "https://fb.com/groups/1" };
const mockPost = {
  id: "post-1",
  content: "Hello world",
  isAnonymous: false,
  location: null,
  createdAt: new Date("2025-01-01"),
};
const mockPostGroup = { id: "pg-1", postId: "post-1", groupId: "group-1", userId: "user-1" };

const prismaInstance = {
  group: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(mockGroup),
  },
  post: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(mockPost),
  },
  postGroup: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(mockPostGroup),
  },
  publicationHistory: {
    create: vi.fn().mockResolvedValue({ id: "pub-1" }),
  },
};

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaInstance),
}));

describe("posts-storage", () => {
  let savePost, getAllPosts, getPostsByGroup;

  beforeEach(async () => {
    // Reset all mock call counts but keep implementations
    Object.values(prismaInstance).forEach((model) => {
      Object.values(model).forEach((fn) => {
        if (typeof fn.mockClear === "function") fn.mockClear();
      });
    });
    // Reset defaults
    prismaInstance.group.findFirst.mockResolvedValue(null);
    prismaInstance.post.findMany.mockResolvedValue([]);
    prismaInstance.postGroup.findMany.mockResolvedValue([]);

    vi.resetModules();
    vi.mock("@prisma/client", () => ({
      PrismaClient: vi.fn(() => prismaInstance),
    }));

    const mod = await import("../../src/utils/posts-storage.js");
    savePost = mod.savePost;
    getAllPosts = mod.getAllPosts;
    getPostsByGroup = mod.getPostsByGroup;
  });

  describe("savePost", () => {
    it("should create group, post, postGroup and publication", async () => {
      const result = await savePost({
        userId: "user-1",
        groupUrl: "https://fb.com/groups/1",
        groupName: "Test Group",
        text: "Hello world",
        postUrl: "https://fb.com/post/1",
        screenshot: "base64data",
        anonymous: false,
        location: null,
      });

      expect(prismaInstance.group.findFirst).toHaveBeenCalledWith({
        where: { url: "https://fb.com/groups/1" },
      });
      expect(prismaInstance.group.create).toHaveBeenCalled();
      expect(prismaInstance.post.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          content: "Hello world",
          status: "ACTIVE",
          isAnonymous: false,
        }),
      });
      expect(prismaInstance.postGroup.create).toHaveBeenCalled();
      expect(prismaInstance.publicationHistory.create).toHaveBeenCalled();

      expect(result.id).toBe("post-1");
      expect(result.groupUrl).toBe("https://fb.com/groups/1");
      expect(result.postUrl).toBe("https://fb.com/post/1");
      expect(result.hasScreenshot).toBe(true);
    });

    it("should use existing group if found", async () => {
      prismaInstance.group.findFirst.mockResolvedValue(mockGroup);

      await savePost({
        userId: "user-1",
        groupUrl: "https://fb.com/groups/1",
        text: "Test",
      });

      expect(prismaInstance.group.create).not.toHaveBeenCalled();
    });

    it("should save anonymous and location fields", async () => {
      await savePost({
        userId: "user-1",
        groupUrl: "https://fb.com/groups/1",
        text: "Test",
        anonymous: true,
        location: "Tel Aviv",
      });

      expect(prismaInstance.post.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isAnonymous: true,
          location: "Tel Aviv",
        }),
      });
    });

    it("should handle missing postUrl", async () => {
      const result = await savePost({
        userId: "user-1",
        groupUrl: "https://fb.com/groups/1",
        text: "Test",
      });

      expect(result.postUrl).toBeNull();
      expect(result.hasScreenshot).toBe(false);
    });
  });

  describe("getAllPosts", () => {
    it("should return empty array when no posts", async () => {
      const result = await getAllPosts("user-1");
      expect(result).toEqual([]);
    });

    it("should return formatted posts with group info", async () => {
      prismaInstance.post.findMany.mockResolvedValue([
        {
          id: "post-1",
          content: "Hello",
          location: "TLV",
          isAnonymous: false,
          createdAt: new Date("2025-01-01"),
          postGroups: [
            {
              group: { name: "Test Group", url: "https://fb.com/groups/1" },
              publications: [{ externalPostUrl: "https://fb.com/post/1", screenshotUrl: "stored" }],
            },
          ],
        },
      ]);

      const result = await getAllPosts("user-1");
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("Hello");
      expect(result[0].groupName).toBe("Test Group");
      expect(result[0].postUrl).toBe("https://fb.com/post/1");
      expect(result[0].hasScreenshot).toBe(true);
    });
  });

  describe("getPostsByGroup", () => {
    it("should return empty array when group not found", async () => {
      const result = await getPostsByGroup("https://fb.com/groups/999");
      expect(result).toEqual([]);
    });

    it("should return posts for a specific group", async () => {
      prismaInstance.group.findFirst.mockResolvedValue(mockGroup);
      prismaInstance.postGroup.findMany.mockResolvedValue([
        {
          post: {
            id: "post-1",
            content: "Test",
            location: null,
            isAnonymous: false,
            createdAt: new Date("2025-01-01"),
          },
          publications: [{ externalPostUrl: null, screenshotUrl: null }],
        },
      ]);

      const result = await getPostsByGroup("https://fb.com/groups/1");
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("Test");
    });
  });
});
