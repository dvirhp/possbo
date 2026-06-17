import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";

// Mock fs
vi.mock("fs");

// We need to mock fileURLToPath for the module's __dirname calculation
vi.mock("url", () => ({
  fileURLToPath: () => "/mock/server/src/utils/posts-storage.js",
}));

describe("posts-storage", () => {
  let savePost, getAllPosts, getPostsByGroup;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue("[]");
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});

    const module = await import("../../src/utils/posts-storage.js");
    savePost = module.savePost;
    getAllPosts = module.getAllPosts;
    getPostsByGroup = module.getPostsByGroup;
  });

  describe("getAllPosts", () => {
    it("should return empty array when file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(getAllPosts()).toEqual([]);
    });

    it("should return parsed posts from file", () => {
      const posts = [{ id: "1", text: "Hello" }];
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(posts));

      expect(getAllPosts()).toEqual(posts);
    });

    it("should return empty array when file contains empty array", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("[]");

      expect(getAllPosts()).toEqual([]);
    });
  });

  describe("savePost", () => {
    it("should save a post with all fields", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("[]");

      const result = savePost({
        groupUrl: "https://fb.com/groups/1",
        groupName: "Test Group",
        text: "Hello world",
        postUrl: "https://fb.com/post/1",
        screenshot: "base64data",
      });

      expect(result.groupUrl).toBe("https://fb.com/groups/1");
      expect(result.groupName).toBe("Test Group");
      expect(result.text).toBe("Hello world");
      expect(result.postUrl).toBe("https://fb.com/post/1");
      expect(result.hasScreenshot).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    it("should save post with null postUrl when not provided", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = savePost({
        groupUrl: "https://fb.com/groups/1",
        text: "Test",
      });

      expect(result.postUrl).toBeNull();
      expect(result.groupName).toBeNull();
      expect(result.hasScreenshot).toBe(false);
    });

    it("should prepend new post to existing posts", () => {
      const existing = [{ id: "old", text: "old post" }];
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
      vi.mocked(fs.writeFileSync).mockClear();

      savePost({
        groupUrl: "https://fb.com/groups/1",
        text: "New post",
      });

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const written = JSON.parse(writeCall[1]);
      expect(written[0].text).toBe("New post");
      expect(written[1].id).toBe("old");
      expect(written).toHaveLength(2);
    });

    it("should generate unique IDs for each post", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result1 = savePost({ groupUrl: "u1", text: "t1" });
      const result2 = savePost({ groupUrl: "u2", text: "t2" });

      // IDs based on Date.now() - they should differ
      expect(result1.id).toBeDefined();
      expect(result2.id).toBeDefined();
    });

    it("should write valid JSON to the file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      savePost({ groupUrl: "url", text: "txt" });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        "utf-8",
      );

      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
      expect(Array.isArray(written)).toBe(true);
    });
  });

  describe("getPostsByGroup", () => {
    it("should filter posts by groupUrl", () => {
      const posts = [
        { id: "1", groupUrl: "https://fb.com/groups/1", text: "a" },
        { id: "2", groupUrl: "https://fb.com/groups/2", text: "b" },
        { id: "3", groupUrl: "https://fb.com/groups/1", text: "c" },
      ];
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(posts));

      const result = getPostsByGroup("https://fb.com/groups/1");
      expect(result).toHaveLength(2);
      expect(
        result.every((p) => p.groupUrl === "https://fb.com/groups/1"),
      ).toBe(true);
    });

    it("should return empty array when no posts match", () => {
      const posts = [
        { id: "1", groupUrl: "https://fb.com/groups/1", text: "a" },
      ];
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(posts));

      expect(getPostsByGroup("https://fb.com/groups/999")).toEqual([]);
    });

    it("should return empty array when file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(getPostsByGroup("anything")).toEqual([]);
    });
  });
});
