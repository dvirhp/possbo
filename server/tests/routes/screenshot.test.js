import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock the facebook-automation module
vi.mock("../../src/utils/facebook-automation.js", () => ({
  captureGroupScreenshot: vi.fn(),
}));

let app;

beforeEach(async () => {
  vi.resetModules();
  const screenshotModule = await import("../../src/routes/screenshot.js");

  app = express();
  app.use(express.json());
  app.use("/api/screenshot", screenshotModule.default);
});

describe("GET /api/screenshot", () => {
  it("should return 400 when url is missing", async () => {
    const res = await request(app).get("/api/screenshot");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("url is required");
  });

  it("should return screenshot on success", async () => {
    const { captureGroupScreenshot } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(captureGroupScreenshot).mockResolvedValue("base64screenshotdata");

    const res = await request(app)
      .get("/api/screenshot")
      .query({ url: "https://facebook.com/groups/123" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.screenshot).toBe("base64screenshotdata");
    expect(captureGroupScreenshot).toHaveBeenCalledWith(
      null,
      null,
      "https://facebook.com/groups/123",
    );
  });

  it("should return 428 when session is required", async () => {
    const { captureGroupScreenshot } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(captureGroupScreenshot).mockRejectedValue(
      new Error("FACEBOOK_SESSION_REQUIRED"),
    );

    const res = await request(app)
      .get("/api/screenshot")
      .query({ url: "https://facebook.com/groups/123" });

    expect(res.status).toBe(428);
    expect(res.body.error).toBe("FACEBOOK_SESSION_REQUIRED");
  });

  it("should return 500 on unexpected error", async () => {
    const { captureGroupScreenshot } =
      await import("../../src/utils/facebook-automation.js");
    vi.mocked(captureGroupScreenshot).mockRejectedValue(
      new Error("Browser crashed"),
    );

    const res = await request(app)
      .get("/api/screenshot")
      .query({ url: "https://facebook.com/groups/123" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Browser crashed");
  });

  it("should handle empty url parameter", async () => {
    const res = await request(app).get("/api/screenshot").query({ url: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("url is required");
  });

  it("should reject non-Facebook URLs (SSRF protection)", async () => {
    const res = await request(app)
      .get("/api/screenshot")
      .query({ url: "http://169.254.169.254/latest/meta-data" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Only Facebook URLs are allowed");
  });

  it("should reject non-HTTPS Facebook URLs", async () => {
    const res = await request(app)
      .get("/api/screenshot")
      .query({ url: "http://facebook.com/groups/123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Only Facebook URLs are allowed");
  });

  it("should reject internal network URLs", async () => {
    const res = await request(app)
      .get("/api/screenshot")
      .query({ url: "http://localhost:3000" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Only Facebook URLs are allowed");
  });
});
