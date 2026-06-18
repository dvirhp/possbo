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

// Mock multer - parse multipart fields manually for supertest
vi.mock("multer", () => {
  const multer = () => ({
    single: (fieldName) => (req, res, next) => {
      const contentType = req.headers["content-type"] || "";
      if (contentType.includes("multipart/form-data")) {
        const boundary = contentType.split("boundary=")[1];
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          req.body = req.body || {};
          const parts = body
            .split("--" + boundary)
            .filter((p) => p.trim() && p.trim() !== "--");
          for (const part of parts) {
            const match = part.match(
              /name="([^"]+)"\r?\n\r?\n([\s\S]*?)(\r?\n)?$/,
            );
            if (match) {
              req.body[match[1]] = match[2].trim();
            }
          }
          next();
        });
      } else {
        next();
      }
    },
  });
  multer.diskStorage = () => ({});
  return { default: multer };
});

let app;

beforeEach(async () => {
  vi.resetModules();
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
      .field("text", "Hello world");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("groupUrl");
  });

  it("should return 400 when text is missing", async () => {
    const res = await request(app)
      .post("/api/publish")
      .field("groupUrl", "https://facebook.com/groups/123");

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
      .field("groupUrl", "https://facebook.com/groups/123")
      .field("text", "Hello");

    expect(res.status).toBe(428);
    expect(res.body.error).toBe("FACEBOOK_SESSION_REQUIRED");
  });

  it("should return 500 when publish fails with unknown error", async () => {
    const { publishToGroup } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(publishToGroup).mockRejectedValue(new Error("TIMEOUT"));

    const res = await request(app)
      .post("/api/publish")
      .field("groupUrl", "https://facebook.com/groups/123")
      .field("text", "Hello");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("TIMEOUT");
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

    const res = await request(app)
      .post("/api/publish")
      .field("groupUrl", "https://facebook.com/groups/123")
      .field("text", "Test post")
      .field("groupName", "My Group");

    expect(res.status).toBe(200);
    expect(publishToGroup).toHaveBeenCalledWith(
      "https://facebook.com/groups/123",
      "Test post",
      null,
      { anonymous: false, location: null },
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

    const res = await request(app)
      .post("/api/publish")
      .field("groupUrl", "https://facebook.com/groups/123")
      .field("text", "Anon post")
      .field("anonymous", "true")
      .field("location", "Tel Aviv");

    expect(res.status).toBe(200);
    expect(publishToGroup).toHaveBeenCalledWith(
      "https://facebook.com/groups/123",
      "Anon post",
      null,
      { anonymous: true, location: "Tel Aviv" },
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
      .field("groupUrl", "https://facebook.com/groups/123")
      .field("text", "Post");

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
