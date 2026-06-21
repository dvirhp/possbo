import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPost = vi.fn();
const mockGet = vi.fn();

vi.mock("../../services/http.js", () => ({
  default: {
    post: mockPost,
    get: mockGet,
  },
}));

describe("groupsService", () => {
  let groupsService;

  beforeEach(async () => {
    mockPost.mockClear();
    mockGet.mockClear();

    const module = await import("../../services/groupsService.js");
    groupsService = module.groupsService;
  });

  describe("scrapeMyGroups", () => {
    it("should call GET /groups/scrape-my-groups", async () => {
      mockGet.mockResolvedValue({ data: { success: true, groups: [] } });

      await groupsService.scrapeMyGroups();

      expect(mockGet).toHaveBeenCalledWith("/groups/scrape-my-groups");
    });

    it("should return the response data", async () => {
      const mockData = {
        data: { success: true, groups: [{ id: "1", name: "G" }] },
      };
      mockGet.mockResolvedValue(mockData);

      const result = await groupsService.scrapeMyGroups();

      expect(result).toEqual(mockData);
    });

    it("should propagate errors", async () => {
      mockGet.mockRejectedValue(new Error("Network error"));

      await expect(groupsService.scrapeMyGroups()).rejects.toThrow(
        "Network error",
      );
    });
  });

  describe("bootstrapSession", () => {
    it("should call POST /groups/session/bootstrap", async () => {
      mockPost.mockResolvedValue({ data: { success: true } });

      await groupsService.bootstrapSession();

      expect(mockPost).toHaveBeenCalledWith("/groups/session/bootstrap");
    });

    it("should return the response data", async () => {
      const mockData = { data: { success: true, sessionExists: true } };
      mockPost.mockResolvedValue(mockData);

      const result = await groupsService.bootstrapSession();

      expect(result).toEqual(mockData);
    });

    it("should propagate errors", async () => {
      mockPost.mockRejectedValue({
        response: { data: { error: "FACEBOOK_SESSION_REQUIRED" } },
      });

      await expect(groupsService.bootstrapSession()).rejects.toEqual(
        expect.objectContaining({
          response: { data: { error: "FACEBOOK_SESSION_REQUIRED" } },
        }),
      );
    });
  });

  describe("getSavedGroups", () => {
    it("should call GET /groups/saved", async () => {
      mockGet.mockResolvedValue({ data: { success: true, groups: [] } });

      await groupsService.getSavedGroups();

      expect(mockGet).toHaveBeenCalledWith("/groups/saved");
    });
  });

  describe("getGroupPosts", () => {
    it("should call GET /groups/:groupId/posts", async () => {
      mockGet.mockResolvedValue({ data: { success: true, posts: [] } });

      await groupsService.getGroupPosts("123");

      expect(mockGet).toHaveBeenCalledWith("/groups/123/posts");
    });
  });
});
