import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock logger
vi.mock("../../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

let app;

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env.GEMINI_API_KEY;

  app = express();
  app.use(express.json());

  // Simulate authenticated user middleware
  app.use((req, _res, next) => {
    if (req.headers["x-skip-auth"]) {
      // Don't set req.user — test unauthenticated
    } else {
      req.user = { id: "user-1", email: "test@test.com" };
    }
    next();
  });

  const { default: aiRouter } = await import("../../src/routes/ai.js");
  app.use("/api/ai", aiRouter);
});

describe("POST /api/ai/generate-post", () => {
  it("should return 401 when not authenticated", async () => {
    const res = await request(app)
      .post("/api/ai/generate-post")
      .set("x-skip-auth", "true")
      .send({ postType: "sell_product", topic: "tech", productOrService: "app" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it("should return 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({ postType: "sell_product" });

    expect(res.status).toBe(400);
  });

  it("should return 400 when postType is other but otherType is missing", async () => {
    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({ postType: "other", topic: "tech", productOrService: "app" });

    expect(res.status).toBe(400);
  });

  it("should return 500 when GEMINI_API_KEY is not set", async () => {
    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({ postType: "sell_product", topic: "tech", productOrService: "app" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  it("should return 502 when Gemini API returns error", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: false,
      text: async () => "API error",
    });

    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({ postType: "sell_product", topic: "tech", productOrService: "app" });

    expect(res.status).toBe(502);
  });

  it("should return 502 when Gemini returns empty response", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] }),
    });

    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({ postType: "sell_product", topic: "tech", productOrService: "app" });

    expect(res.status).toBe(502);
  });

  it("should return generated post on success", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Generated post content" }] } }],
      }),
    });

    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({ postType: "sell_product", topic: "tech", productOrService: "app" });

    expect(res.status).toBe(200);
    expect(res.body.post).toBe("Generated post content");
  });

  it("should handle all optional fields", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Full post" }] } }],
      }),
    });

    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({
        postType: "other",
        otherType: "custom type",
        topic: "tech",
        productOrService: "app",
        audience: "developers",
        uniqueValue: "best price",
        tone: "professional",
        cta: "Buy now",
        useEmojis: true,
        referencePost: "Some reference",
        extraDetails: "Extra info",
        tags: { price: "100", location: "TLV" },
        contactWhatsapp: true,
        contactPhone: true,
        contactEmail: true,
        whatsappNum: "0501234567",
        whatsappMsg: "Hi",
        phone: "0501234567",
        email: "test@test.com",
      });

    expect(res.status).toBe(200);
    expect(res.body.post).toBe("Full post");
    // Verify fetch was called with prompt containing the fields
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const prompt = fetchBody.contents[0].parts[0].text;
    expect(prompt).toContain("developers");
    expect(prompt).toContain("best price");
    expect(prompt).toContain("0501234567");
  });

  it("should return 500 on unexpected error", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch.mockRejectedValue(new Error("Network error"));

    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({ postType: "sell_product", topic: "tech", productOrService: "app" });

    expect(res.status).toBe(500);
  });

  it("should handle useEmojis false", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "No emoji post" }] } }],
      }),
    });

    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({
        postType: "sell_product",
        topic: "tech",
        productOrService: "app",
        useEmojis: false,
      });

    expect(res.status).toBe(200);
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const prompt = fetchBody.contents[0].parts[0].text;
    expect(prompt).toContain("אל תשתמש באימוג׳ים");
  });

  it("should return 400 when topic is empty string", async () => {
    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({ postType: "sell_product", topic: "", productOrService: "app" });

    expect(res.status).toBe(400);
  });

  it("should return 400 when productOrService is empty string", async () => {
    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({ postType: "sell_product", topic: "tech", productOrService: "" });

    expect(res.status).toBe(400);
  });

  it("should return 400 when postType is missing", async () => {
    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({ topic: "tech", productOrService: "app" });

    expect(res.status).toBe(400);
  });

  it("should handle Gemini response with missing candidates field", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}), // No candidates field at all
    });

    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({ postType: "sell_product", topic: "tech", productOrService: "app" });

    expect(res.status).toBe(502);
  });

  it("should handle Gemini response with null candidates", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: null }),
    });

    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({ postType: "sell_product", topic: "tech", productOrService: "app" });

    expect(res.status).toBe(502);
  });

  it("should handle valid otherType postType", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Other type post" }] } }],
      }),
    });

    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({
        postType: "other",
        otherType: "survey",
        topic: "tech",
        productOrService: "app",
      });

    expect(res.status).toBe(200);
    expect(res.body.post).toBe("Other type post");
  });

  it("should handle referencePost field in prompt", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Referenced post" }] } }],
      }),
    });

    const res = await request(app)
      .post("/api/ai/generate-post")
      .send({
        postType: "sell_product",
        topic: "tech",
        productOrService: "app",
        referencePost: "This is a reference post example",
      });

    expect(res.status).toBe(200);
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const prompt = fetchBody.contents[0].parts[0].text;
    expect(prompt).toContain("This is a reference post example");
  });
});

describe("POST /api/ai/transform-post", () => {
  it("validates text and operation", async () => {
    const missingText = await request(app).post("/api/ai/transform-post").send({ operation: "rewrite" });
    expect(missingText.status).toBe(400);
    const invalidOperation = await request(app).post("/api/ai/transform-post").send({ text: "פוסט", operation: "delete" });
    expect(invalidOperation.status).toBe(400);
  });

  it("transforms an existing post", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "פוסט קצר ומשופר" }] } }] }),
    });
    const res = await request(app).post("/api/ai/transform-post").send({
      text: "זהו טקסט ארוך שצריך לשפר",
      operation: "shorten",
      platform: "instagram",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ post: "פוסט קצר ומשופר", operation: "shorten", platform: "instagram" });
    const prompt = JSON.parse(mockFetch.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("<source_text>");
    expect(prompt).toContain("instagram");
  });

  it("rejects oversized input", async () => {
    const res = await request(app).post("/api/ai/transform-post").send({
      text: "א".repeat(12001),
      operation: "rewrite",
    });
    expect(res.status).toBe(413);
  });
});
