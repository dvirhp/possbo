import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPost = vi.fn();
const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock("../../services/http.js", () => ({
  default: {
    post: mockPost,
    get: mockGet,
    patch: mockPatch,
    delete: mockDelete,
  },
}));

describe("groupsService", () => {
  let groupsService;

  beforeEach(async () => {
    mockPost.mockClear();
    mockGet.mockClear();
    mockPatch.mockClear();
    mockDelete.mockClear();

    const module = await import("../../services/groupsService.js");
    groupsService = module.groupsService;
  });

  describe("scrapeMyGroups", () => {
    it("should call GET /groups/scrape-my-groups", async () => {
      mockGet.mockResolvedValue({ data: { success: true, groups: [] } });

      await groupsService.scrapeMyGroups();

      expect(mockGet).toHaveBeenCalledWith("/groups/scrape-my-groups", { timeout: 120000 });
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
    it("should call POST /groups/session/bootstrap with timeout", async () => {
      mockPost.mockResolvedValue({ data: { success: true } });

      await groupsService.bootstrapSession();

      expect(mockPost).toHaveBeenCalledWith(
        "/groups/session/bootstrap",
        {},
        { timeout: 360000 },
      );
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

  describe("getPublicationHistory", () => {
    it("should call GET /scheduler/history", async () => {
      mockGet.mockResolvedValue({ data: { success: true, history: [] } });

      await groupsService.getPublicationHistory();

      expect(mockGet).toHaveBeenCalledWith("/scheduler/history");
    });
  });

  describe("getJobs", () => {
    it("should call GET /scheduler/jobs", async () => {
      mockGet.mockResolvedValue({ data: { success: true, jobs: [] } });

      await groupsService.getJobs();

      expect(mockGet).toHaveBeenCalledWith("/scheduler/jobs");
    });
  });

  describe("getCampaigns", () => {
    it("should call GET /scheduler/campaigns", async () => {
      mockGet.mockResolvedValue({ data: { success: true, campaigns: [] } });

      await groupsService.getCampaigns();

      expect(mockGet).toHaveBeenCalledWith("/scheduler/campaigns");
    });
  });

  describe("createCampaign", () => {
    it("should call POST /scheduler/campaigns with data", async () => {
      const campaignData = { content: "test", groups: ["g1"] };
      mockPost.mockResolvedValue({ data: { success: true } });

      await groupsService.createCampaign(campaignData);

      expect(mockPost).toHaveBeenCalledWith(
        "/scheduler/campaigns",
        campaignData,
      );
    });
  });

  describe("togglePause", () => {
    it("should call PATCH /scheduler/campaigns/:id/pause", async () => {
      mockPatch.mockResolvedValue({ data: { success: true } });

      await groupsService.togglePause("post-1");

      expect(mockPatch).toHaveBeenCalledWith(
        "/scheduler/campaigns/post-1/pause",
      );
    });
  });

  describe("schedulePost", () => {
    it("should call POST /scheduler/schedule with data", async () => {
      const scheduleData = { postId: "p1", scheduledAt: "2026-01-01" };
      mockPost.mockResolvedValue({ data: { success: true } });

      await groupsService.schedulePost(scheduleData);

      expect(mockPost).toHaveBeenCalledWith(
        "/scheduler/schedule",
        scheduleData,
      );
    });
  });

  describe("cancelJob", () => {
    it("should call DELETE /scheduler/jobs/:id", async () => {
      mockDelete.mockResolvedValue({ data: { success: true } });

      await groupsService.cancelJob("job-1");

      expect(mockDelete).toHaveBeenCalledWith("/scheduler/jobs/job-1");
    });
  });

  describe("getNotifications", () => {
    it("should call GET /scheduler/notifications", async () => {
      mockGet.mockResolvedValue({ data: { notifications: [] } });

      await groupsService.getNotifications();

      expect(mockGet).toHaveBeenCalledWith("/scheduler/notifications");
    });
  });

  describe("markNotificationsRead", () => {
    it("should call PATCH /scheduler/notifications/read", async () => {
      mockPatch.mockResolvedValue({ data: { success: true } });

      await groupsService.markNotificationsRead();

      expect(mockPatch).toHaveBeenCalledWith("/scheduler/notifications/read");
    });
  });

  describe("getSessionStatus", () => {
    it("should call GET /scheduler/session-status", async () => {
      mockGet.mockResolvedValue({ data: { active: true } });

      await groupsService.getSessionStatus();

      expect(mockGet).toHaveBeenCalledWith("/scheduler/session-status");
    });
  });

  describe("getStats", () => {
    it("should call GET /scheduler/stats with params", async () => {
      mockGet.mockResolvedValue({ data: { stats: {} } });

      await groupsService.getStats({ from: "2026-01-01" });

      expect(mockGet).toHaveBeenCalledWith("/scheduler/stats", {
        params: { from: "2026-01-01" },
      });
    });

    it("should work without params", async () => {
      mockGet.mockResolvedValue({ data: { stats: {} } });

      await groupsService.getStats();

      expect(mockGet).toHaveBeenCalledWith("/scheduler/stats", {
        params: undefined,
      });
    });
  });
});
