import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";

// Mock all external dependencies
vi.mock("../../src/utils/facebook-automation.js", () => ({
  bootstrapFacebookSession: vi.fn(),
  captureGroupScreenshot: vi.fn(),
  scrapeMyGroups: vi.fn(),
  publishToGroup: vi.fn(),
}));

vi.mock("axios", () => ({
  default: { get: vi.fn() },
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => ({
    facebookGroup: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({}),
    },
    group: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    postGroup: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    publicationHistory: {
      deleteMany: vi.fn().mockResolvedValue({}),
    },
  })),
}));

vi.mock("../../src/utils/posts-storage.js", () => ({
  savePost: vi.fn(async (data) => ({
    id: "mock-id-123",
    ...data,
    createdAt: "2024-01-01T00:00:00.000Z",
    hasScreenshot: false,
  })),
}));

// We need to spy on fs.existsSync at the module level
vi.spyOn(fs, "existsSync").mockReturnValue(false);
vi.spyOn(fs, "unlinkSync").mockImplementation(() => {});

// Mock multer - parse multipart fields manually
vi.mock("multer", () => {
  const multer = () => ({
    single: () => (req, res, next) => {
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
  const groupsModule = await import("../../src/routes/groups.js");

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  // Simulate authenticated user for requireAuth routes
  app.use((req, _res, next) => {
    req.user = {
      id: "user-1",
      facebookAccessToken: "mock-token",
    };
    next();
  });
  app.use("/api/groups", groupsModule.default);
});

describe("POST /api/groups/session/bootstrap", () => {
  it("should return success when bootstrap completes", async () => {
    const { bootstrapFacebookSession } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(bootstrapFacebookSession).mockResolvedValue({ ok: true });

    const res = await request(app).post("/api/groups/session/bootstrap");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(bootstrapFacebookSession).toHaveBeenCalledWith("user-1");
  });

  it("should return 500 when bootstrap fails", async () => {
    const { bootstrapFacebookSession } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(bootstrapFacebookSession).mockRejectedValue(
      new Error("FACEBOOK_SESSION_NOT_COMPLETED"),
    );

    const res = await request(app).post("/api/groups/session/bootstrap");

    expect(res.status).toBe(500);
  });
});

describe("GET /api/groups/scrape-my-groups", () => {
  it("should return groups on success", async () => {
    const { scrapeMyGroups } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(scrapeMyGroups).mockResolvedValue([
      { id: "1", name: "Group A", url: "https://fb.com/groups/a" },
      { id: "2", name: "Group B", url: "https://fb.com/groups/b" },
    ]);

    const res = await request(app).get("/api/groups/scrape-my-groups");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.groups).toHaveLength(2);
  });

  it("should return 428 when session is required", async () => {
    const { scrapeMyGroups } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(scrapeMyGroups).mockRejectedValue(
      new Error("FACEBOOK_SESSION_REQUIRED"),
    );

    const res = await request(app).get("/api/groups/scrape-my-groups");

    expect(res.status).toBe(428);
    expect(res.body.error).toBe("FACEBOOK_SESSION_REQUIRED");
  });

  it("should return 500 on generic error", async () => {
    const { scrapeMyGroups } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(scrapeMyGroups).mockRejectedValue(new Error("Network failure"));

    const res = await request(app).get("/api/groups/scrape-my-groups");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Network failure");
  });
});

describe("GET /api/groups/facebook-screenshot", () => {
  it("should capture screenshot with groupName", async () => {
    const { captureGroupScreenshot } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(captureGroupScreenshot).mockResolvedValue("base64data");

    const res = await request(app)
      .get("/api/groups/facebook-screenshot")
      .query({ groupName: "Test Group" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.screenshot).toBe("base64data");
    expect(captureGroupScreenshot).toHaveBeenCalledWith(
      "Test Group",
      null,
      null,
      "user-1",
    );
  });

  it("should pass URL directly as targetUrl when groupName is a URL", async () => {
    const { captureGroupScreenshot } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(captureGroupScreenshot).mockResolvedValue("base64data");

    const res = await request(app)
      .get("/api/groups/facebook-screenshot")
      .query({ groupName: "https://facebook.com/groups/123" });

    expect(res.status).toBe(200);
    expect(captureGroupScreenshot).toHaveBeenCalledWith(
      "https://facebook.com/groups/123",
      null,
      "https://facebook.com/groups/123",
      "user-1",
    );
  });

  it("should return 428 when session required", async () => {
    const { captureGroupScreenshot } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(captureGroupScreenshot).mockRejectedValue(
      new Error("FACEBOOK_SESSION_REQUIRED"),
    );

    const res = await request(app)
      .get("/api/groups/facebook-screenshot")
      .query({ groupName: "Test" });

    expect(res.status).toBe(428);
    expect(res.body.error).toBe("FACEBOOK_SESSION_REQUIRED");
  });

  it("should return 500 on unexpected error", async () => {
    const { captureGroupScreenshot } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(captureGroupScreenshot).mockRejectedValue(new Error("Crashed"));

    const res = await request(app)
      .get("/api/groups/facebook-screenshot")
      .query({ groupName: "Test" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Crashed");
  });
});

describe("POST /api/groups/publish", () => {
  it("should return 400 when groupUrl missing", async () => {
    const res = await request(app)
      .post("/api/groups/publish")
      .field("text", "Hello");

    expect(res.status).toBe(400);
  });

  it("should return 400 when text missing", async () => {
    const res = await request(app)
      .post("/api/groups/publish")
      .field("groupUrl", "https://fb.com/groups/1");

    expect(res.status).toBe(400);
  });

  it("should publish and return result on success", async () => {
    const { publishToGroup } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(publishToGroup).mockResolvedValue({
      success: true,
      postUrl: "url",
    });

    const res = await request(app)
      .post("/api/groups/publish")
      .field("groupUrl", "https://fb.com/groups/1")
      .field("text", "Post text");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should return 428 on session required", async () => {
    const { publishToGroup } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(publishToGroup).mockRejectedValue(
      new Error("FACEBOOK_SESSION_REQUIRED"),
    );

    const res = await request(app)
      .post("/api/groups/publish")
      .field("groupUrl", "https://fb.com/groups/1")
      .field("text", "Post text");

    expect(res.status).toBe(428);
  });
});

describe("GET /api/groups/my-groups", () => {
  it("should return groups from Facebook API", async () => {
    const axios = (await import("axios")).default;
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        data: [
          { id: "1", name: "G1" },
          { id: "2", name: "G2" },
        ],
      },
    });

    const res = await request(app).get("/api/groups/my-groups");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("should return 400 when no access token", async () => {
    // Override to user without token
    const groupsModule = await import("../../src/routes/groups.js");
    const noTokenApp = express();
    noTokenApp.use(express.json());
    noTokenApp.use((req, _res, next) => {
      req.user = { id: "u1", facebookAccessToken: null };
      next();
    });
    noTokenApp.use("/api/groups", groupsModule.default);

    const res = await request(noTokenApp).get("/api/groups/my-groups");
    expect(res.status).toBe(400);
  });

  it("should return 500 on API error", async () => {
    const axios = (await import("axios")).default;
    vi.mocked(axios.get).mockRejectedValue(new Error("API failed"));

    const res = await request(app).get("/api/groups/my-groups");
    expect(res.status).toBe(500);
  });
});

describe("GET /api/groups/saved", () => {
  it("should return saved groups from database", async () => {
    const res = await request(app).get("/api/groups/saved");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.groups)).toBe(true);
  });
});

describe("GET /api/groups/:groupId/posts", () => {
  it("should return empty posts when group not found", async () => {
    const res = await request(app).get("/api/groups/123/posts");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.posts).toEqual([]);
  });
});

describe("requireAuth middleware", () => {
  it("should return 401 when no user", async () => {
    const groupsModule = await import("../../src/routes/groups.js");
    const noAuthApp = express();
    noAuthApp.use(express.json());
    // Don't set req.user
    noAuthApp.use("/api/groups", groupsModule.default);

    const res = await request(noAuthApp).get("/api/groups/my-groups");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Not authenticated");
  });
});
