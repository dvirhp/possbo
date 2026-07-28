import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock the facebook-automation module
vi.mock("../../src/utils/facebook-automation.js", () => ({
  publishToGroup: vi.fn(),
  captureGroupScreenshot: vi.fn(),
  scrapeMyGroups: vi.fn(),
  bootstrapFacebookSession: vi.fn(),
}));

// Mock the posts-storage module
vi.mock("../../src/utils/posts-storage.js", () => ({
  savePost: vi.fn(async (data) => ({
    id: "mock-id-123",
    ...data,
    createdAt: "2024-01-01T00:00:00.000Z",
    hasScreenshot: !!data.screenshot,
  })),
  getAllPosts: vi.fn(async () => []),
  getPostsByGroup: vi.fn(async () => []),
}));

const mockGroupFindFirst = vi.fn();
const mockGroupCreate = vi.fn();
const mockPostCreate = vi.fn();
const mockPostGroupCreate = vi.fn();
const mockPublicationHistoryCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../../src/config/prisma.js", () => ({
  default: {
    group: {
      findFirst: mockGroupFindFirst,
      create: mockGroupCreate,
    },
    post: {
      create: mockPostCreate,
    },
    postGroup: {
      create: mockPostGroupCreate,
    },
    publicationHistory: {
      create: mockPublicationHistoryCreate,
    },
    $transaction: mockTransaction,
  },
}));

// Mock multer - just pass through, let express parse body
vi.mock("multer", () => {
  const passthrough = (req, res, next) => next();
  const multer = () => ({
    single: () => passthrough,
    array: () => passthrough,
  });
  multer.diskStorage = () => ({});
  return { default: multer };
});

let app;

beforeEach(async () => {
  vi.resetModules();
  const { publishToGroup } =
    await import("../../src/utils/facebook-automation.js");
  const { savePost } = await import("../../src/utils/posts-storage.js");
  vi.mocked(publishToGroup).mockReset();
  vi.mocked(savePost)
    .mockReset()
    .mockImplementation(async (data) => ({
      id: "mock-id-123",
      ...data,
      createdAt: "2024-01-01T00:00:00.000Z",
      hasScreenshot: !!data.screenshot,
    }));
  mockGroupFindFirst.mockReset().mockResolvedValue({
    id: "group-1",
    url: "https://facebook.com/groups/123",
  });
  mockGroupCreate.mockReset().mockResolvedValue({ id: "group-1" });
  mockPostCreate.mockReset().mockResolvedValue({ id: "post-1" });
  mockPostGroupCreate.mockReset().mockResolvedValue({ id: "post-group-1" });
  mockPublicationHistoryCreate.mockReset().mockResolvedValue({ id: "history-1" });
  mockTransaction.mockReset().mockImplementation(async (callback) => callback({
    post: { create: mockPostCreate },
    postGroup: { create: mockPostGroupCreate },
    publicationHistory: { create: mockPublicationHistoryCreate },
  }));
  const publishModule = await import("../../src/routes/publish.js");

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  // Inject mock user for auth
  app.use((req, _res, next) => {
    req.user = { id: "test-user-id", name: "Test User" };
    next();
  });
  app.use("/api/publish", publishModule.default);
});

describe("POST /api/publish", () => {
  it("should return 400 when groupUrl is missing", async () => {
    const res = await request(app)
      .post("/api/publish")
      .send({ text: "Hello world" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("groupUrl");
  });

  it("should return 400 when text is missing", async () => {
    const res = await request(app)
      .post("/api/publish")
      .send({ groupUrl: "https://facebook.com/groups/123" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("text");
  });

  it("should return 400 when both groupUrl and text are missing", async () => {
    const res = await request(app).post("/api/publish").send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return 428 when Facebook session is required", async () => {
    const { publishToGroup } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(publishToGroup).mockRejectedValue(
      new Error("FACEBOOK_SESSION_REQUIRED"),
    );

    const res = await request(app)
      .post("/api/publish")
      .send({ groupUrl: "https://facebook.com/groups/123", text: "Hello" });

    expect(res.status).toBe(428);
    expect(res.body.error).toBe("FACEBOOK_SESSION_REQUIRED");
  });

  it("should return 500 when publish fails with unknown error", async () => {
    const { publishToGroup } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(publishToGroup).mockRejectedValue(new Error("TIMEOUT"));

    const res = await request(app)
      .post("/api/publish")
      .send({ groupUrl: "https://facebook.com/groups/123", text: "Hello" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe(
      "לא הצלחנו להשלים את הפעולה כרגע. נסו שוב מאוחר יותר.",
    );
    expect(res.body.code).toBe("INTERNAL_ERROR");
  });

  it("should call publishToGroup with correct args and save post on success", async () => {
    const { publishToGroup } =
      await import("../../src/utils/facebook-automation.js");
    const { savePost } = await import("../../src/utils/posts-storage.js");
    vi.mocked(publishToGroup).mockResolvedValue({
      success: true,
      postUrl: "http://fb.com/post/1",
      screenshot: null,
    });

    const res = await request(app).post("/api/publish").send({
      groupUrl: "https://facebook.com/groups/123",
      text: "Test post",
      groupName: "My Group",
    });

    expect(res.status).toBe(200);
    expect(publishToGroup).toHaveBeenCalledWith(
      "https://facebook.com/groups/123",
      "Test post",
      null,
      { anonymous: false, location: null, images: [], userId: "test-user-id" },
    );
    expect(savePost).toHaveBeenCalled();
  });

  it("should pass anonymous=true and location to publishToGroup", async () => {
    const { publishToGroup } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(publishToGroup).mockResolvedValue({
      success: true,
      postUrl: null,
      screenshot: null,
    });

    const res = await request(app).post("/api/publish").send({
      groupUrl: "https://facebook.com/groups/123",
      text: "Anon post",
      anonymous: "true",
      location: "Tel Aviv",
    });

    expect(res.status).toBe(200);
    expect(publishToGroup).toHaveBeenCalledWith(
      "https://facebook.com/groups/123",
      "Anon post",
      null,
      {
        anonymous: true,
        location: "Tel Aviv",
        images: [],
        userId: "test-user-id",
      },
    );
  });

  it("should include savedPost in response", async () => {
    const { publishToGroup } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(publishToGroup).mockResolvedValue({
      success: true,
      postUrl: null,
      screenshot: null,
    });

    const res = await request(app)
      .post("/api/publish")
      .send({ groupUrl: "https://facebook.com/groups/123", text: "Post" });

    expect(res.body.savedPost).toBeDefined();
    expect(res.body.savedPost.id).toBe("mock-id-123");
  });
});

describe("GET /api/publish/history", () => {
  it("should return all posts when no groupUrl param", async () => {
    const { getAllPosts } = await import("../../src/utils/posts-storage.js");
    vi.mocked(getAllPosts).mockResolvedValue([
      { id: "1", text: "Post 1", groupUrl: "url1" },
      { id: "2", text: "Post 2", groupUrl: "url2" },
    ]);

    const res = await request(app).get("/api/publish/history");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.posts).toHaveLength(2);
  });

  it("should filter posts by groupUrl when param provided", async () => {
    const { getPostsByGroup } =
      await import("../../src/utils/posts-storage.js");
    vi.mocked(getPostsByGroup).mockResolvedValue([
      { id: "1", text: "Post 1", groupUrl: "https://fb.com/groups/1" },
    ]);

    const res = await request(app)
      .get("/api/publish/history")
      .query({ groupUrl: "https://fb.com/groups/1" });

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(getPostsByGroup).toHaveBeenCalledWith("https://fb.com/groups/1");
  });

  it("should return empty array when no posts exist", async () => {
    const { getAllPosts } = await import("../../src/utils/posts-storage.js");
    vi.mocked(getAllPosts).mockResolvedValue([]);

    const res = await request(app).get("/api/publish/history");

    expect(res.body.posts).toEqual([]);
  });
});

describe("POST /api/publish — edge cases", () => {
  it("should return 400 when groupUrl is empty string", async () => {
    const res = await request(app)
      .post("/api/publish")
      .send({ groupUrl: "", text: "Hello" });

    expect(res.status).toBe(400);
  });

  it("should return 400 when text is empty string", async () => {
    const res = await request(app)
      .post("/api/publish")
      .send({ groupUrl: "https://facebook.com/groups/123", text: "" });

    expect(res.status).toBe(400);
  });

  it("should return 400 when text is whitespace only", async () => {
    const res = await request(app)
      .post("/api/publish")
      .send({ groupUrl: "https://facebook.com/groups/123", text: "   " });

    expect(res.status).toBe(400);
  });

  it("should handle publish with anonymous as string 'false'", async () => {
    const { publishToGroup } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(publishToGroup).mockResolvedValue({
      success: true,
      postUrl: null,
      screenshot: null,
    });

    const res = await request(app).post("/api/publish").send({
      groupUrl: "https://facebook.com/groups/123",
      text: "Test post",
      anonymous: "false",
    });

    expect(res.status).toBe(200);
    expect(publishToGroup).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      null,
      expect.objectContaining({ anonymous: false }),
    );
  });

  it("should handle null location", async () => {
    const { publishToGroup } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(publishToGroup).mockResolvedValue({
      success: true,
      postUrl: null,
      screenshot: null,
    });

    const res = await request(app).post("/api/publish").send({
      groupUrl: "https://facebook.com/groups/123",
      text: "Test",
      location: null,
    });

    expect(res.status).toBe(200);
    expect(publishToGroup).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      null,
      expect.objectContaining({ location: null }),
    );
  });

  it("should return 401 when not authenticated", async () => {
    const publishModule = await import("../../src/routes/publish.js");
    const noAuthApp = express();
    noAuthApp.use(express.json());
    noAuthApp.use((req, _res, next) => {
      req.user = null;
      next();
    });
    noAuthApp.use("/api/publish", publishModule.default);

    const res = await request(noAuthApp)
      .post("/api/publish")
      .send({ groupUrl: "https://facebook.com/groups/123", text: "test" });

    expect(res.status).toBe(401);
  });
});
