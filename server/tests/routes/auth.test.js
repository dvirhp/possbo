import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock passport and dependencies
vi.mock("../../src/config/passport.js", () => ({}));

vi.mock("../../src/utils/facebook-automation.js", () => ({
  captureGroupScreenshot: vi.fn(),
}));

vi.mock("@prisma/client", () => {
  const mockFindFirst = vi.fn();
  const mockUpsert = vi.fn().mockResolvedValue({});
  return {
    PrismaClient: vi.fn(() => ({
      facebookGroup: {
        upsert: mockUpsert,
        findFirst: mockFindFirst,
      },
    })),
    __mockFindFirst: mockFindFirst,
    __mockUpsert: mockUpsert,
  };
});

vi.mock("passport", () => ({
  default: {
    authenticate: vi.fn((strategy, options) => {
      if (strategy === "facebook" && options?.failureRedirect) {
        // Callback route - simulate success
        return (req, res, next) => {
          req.user = { id: "user-1", facebookAccessToken: "mock-token" };
          next();
        };
      }
      // Initial redirect - simulate redirect
      return (_req, res) => res.redirect("https://facebook.com/oauth");
    }),
  },
}));

let app;

beforeEach(async () => {
  vi.resetModules();
  const authModule = await import("../../src/routes/auth.js");

  app = express();
  app.use(express.json());
  // Simulate session for some routes
  app.use((req, _res, next) => {
    req.user = { id: "user-1", facebookAccessToken: "mock-token" };
    req.logout = (cb) => cb(null);
    next();
  });
  app.use("/api/auth", authModule.default);
});

describe("GET /api/auth/me", () => {
  it("should return user when authenticated", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("user-1");
  });

  it("should return 401 when not authenticated", async () => {
    const authModule = await import("../../src/routes/auth.js");
    const noAuthApp = express();
    noAuthApp.use(express.json());
    noAuthApp.use((req, _res, next) => {
      req.user = null;
      next();
    });
    noAuthApp.use("/api/auth", authModule.default);

    const res = await request(noAuthApp).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Not authenticated");
  });
});

describe("GET /api/auth/screenshot", () => {
  it("should return 401 when not authenticated", async () => {
    const authModule = await import("../../src/routes/auth.js");
    const noAuthApp = express();
    noAuthApp.use(express.json());
    noAuthApp.use((req, _res, next) => {
      req.user = null;
      next();
    });
    noAuthApp.use("/api/auth", authModule.default);

    const res = await request(noAuthApp).get("/api/auth/screenshot");
    expect(res.status).toBe(401);
  });

  it("should return 404 when no screenshot found", async () => {
    const { __mockFindFirst } = await import("@prisma/client");
    vi.mocked(__mockFindFirst).mockResolvedValue(null);

    const res = await request(app).get("/api/auth/screenshot");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/auth/logout", () => {
  it("should logout successfully", async () => {
    const res = await request(app).get("/api/auth/logout");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Logged out successfully");
  });

  it("should return 500 when logout fails", async () => {
    const authModule = await import("../../src/routes/auth.js");
    const failApp = express();
    failApp.use(express.json());
    failApp.use((req, _res, next) => {
      req.user = { id: "user-1" };
      req.logout = (cb) => cb(new Error("Session error"));
      next();
    });
    failApp.use("/api/auth", authModule.default);

    const res = await request(failApp).get("/api/auth/logout");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Logout failed");
  });
});

describe("GET /api/auth/facebook/callback", () => {
  it("should redirect to dashboard on successful auth", async () => {
    process.env.CLIENT_URL = "http://localhost:3000";
    const { captureGroupScreenshot } = await import(
      "../../src/utils/facebook-automation.js"
    );
    vi.mocked(captureGroupScreenshot).mockResolvedValue("base64screenshot");

    const res = await request(app).get("/api/auth/facebook/callback");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:3000/dashboard");
  });

  it("should handle automation error gracefully", async () => {
    process.env.CLIENT_URL = "http://localhost:3000";
    const { captureGroupScreenshot } = await import(
      "../../src/utils/facebook-automation.js"
    );
    vi.mocked(captureGroupScreenshot).mockRejectedValue(
      new Error("Browser crashed"),
    );

    const res = await request(app).get("/api/auth/facebook/callback");

    // Should still redirect to dashboard even if automation fails
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:3000/dashboard");
  });
});

describe("GET /api/auth/screenshot", () => {
  it("should return screenshot data when found", async () => {
    const { __mockFindFirst } = await import("@prisma/client");
    vi.mocked(__mockFindFirst).mockResolvedValue({
      screenshot: "base64data",
      groupName: "Test Group",
      createdAt: new Date("2025-01-01"),
    });

    const res = await request(app).get("/api/auth/screenshot");
    expect(res.status).toBe(200);
    expect(res.body.screenshot).toBe("base64data");
    expect(res.body.groupName).toBe("Test Group");
  });

  it("should return 500 on database error", async () => {
    const { __mockFindFirst } = await import("@prisma/client");
    vi.mocked(__mockFindFirst).mockRejectedValue(new Error("DB error"));

    const res = await request(app).get("/api/auth/screenshot");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch screenshot");
  });
});
