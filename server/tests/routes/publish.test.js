import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const {
  queueImmediateFacebookPublication,
  getAllPosts,
  getPostsByGroup,
  getDailyPublishUsage,
  notifyDailyLimitReached,
} = vi.hoisted(() => ({
  queueImmediateFacebookPublication: vi.fn(),
  getAllPosts: vi.fn(),
  getPostsByGroup: vi.fn(),
  getDailyPublishUsage: vi.fn(),
  notifyDailyLimitReached: vi.fn(),
}));

vi.mock("../../src/utils/immediate-publication.js", () => ({
  queueImmediateFacebookPublication,
}));
vi.mock("../../src/utils/posts-storage.js", () => ({
  getAllPosts,
  getPostsByGroup,
}));
vi.mock("../../src/utils/daily-publish-limit.js", () => ({
  getDailyPublishUsage,
  notifyDailyLimitReached,
  dailyLimitResponse: (usage) => ({
    success: false,
    code: "DAILY_PUBLISH_LIMIT_REACHED",
    error: `הגעת למכסת הפרסום היומית של ${usage.limit} פרסומים.`,
    dailyLimit: usage,
  }),
}));
vi.mock("multer", () => {
  const passthrough = (req, _res, next) => next();
  const multer = () => ({
    single: () => passthrough,
    array: () => passthrough,
  });
  multer.diskStorage = () => ({});
  return { default: multer };
});

let app;

beforeEach(async () => {
  queueImmediateFacebookPublication.mockReset().mockResolvedValue({
    job: { id: "job-1", status: "PENDING" },
    postId: "post-1",
    duplicate: false,
  });
  getAllPosts.mockReset().mockResolvedValue([]);
  getPostsByGroup.mockReset().mockResolvedValue([]);
  getDailyPublishUsage.mockReset().mockResolvedValue({
    used: 0,
    limit: 70,
    remaining: 70,
    reached: false,
    resetsAt: new Date("2026-08-26T00:00:00.000Z"),
  });
  notifyDailyLimitReached.mockReset().mockResolvedValue(true);

  const publishModule = await import("../../src/routes/publish.js");
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use((req, _res, next) => {
    req.user = { id: "user-1" };
    next();
  });
  app.use("/api/publish", publishModule.default);
});

describe("queued Facebook publication routes", () => {
  it("validates required group fields", async () => {
    const response = await request(app).post("/api/publish").send({ text: "x" });
    expect(response.status).toBe(400);
  });

  it("queues a group publication and returns 202", async () => {
    const response = await request(app)
      .post("/api/publish")
      .set("Idempotency-Key", "request-1")
      .send({
        groupUrl: "https://facebook.com/groups/123",
        groupName: "Group",
        text: "Hello",
        anonymous: "true",
        location: "Tel Aviv",
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      success: true,
      queued: true,
      jobId: "job-1",
      postId: "post-1",
      status: "PENDING",
    });
    expect(queueImmediateFacebookPublication).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        targetType: "GROUP",
        anonymous: true,
        idempotencyKey: "request-1",
      }),
    );
  });

  it("queues a profile publication", async () => {
    const response = await request(app)
      .post("/api/publish/profile")
      .send({ text: "Profile post" });
    expect(response.status).toBe(202);
    expect(queueImmediateFacebookPublication).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "PROFILE", userId: "user-1" }),
    );
  });

  it("rejects and alerts a user who reached 70 publications", async () => {
    getDailyPublishUsage.mockResolvedValue({
      used: 70,
      limit: 70,
      remaining: 0,
      reached: true,
      resetsAt: new Date("2026-08-26T00:00:00.000Z"),
    });

    const response = await request(app).post("/api/publish/profile").send({
      text: "Post number 71",
    });

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({
      success: false,
      code: "DAILY_PUBLISH_LIMIT_REACHED",
      dailyLimit: { used: 70, limit: 70, remaining: 0, reached: true },
    });
    expect(notifyDailyLimitReached).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ used: 70, limit: 70 }),
    );
    expect(queueImmediateFacebookPublication).not.toHaveBeenCalled();
  });

  it("returns publication history", async () => {
    getAllPosts.mockResolvedValue([{ id: "post-1" }]);
    const response = await request(app).get("/api/publish/history");
    expect(response.status).toBe(200);
    expect(response.body.posts).toEqual([{ id: "post-1" }]);
  });
});
