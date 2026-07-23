import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import {
  generalLimiter,
  authLimiter,
  publishLimiter,
  refreshLimiter,
} from "../../src/utils/rate-limit.js";

describe("rate-limit", () => {
  it("should export generalLimiter as middleware function", () => {
    expect(typeof generalLimiter).toBe("function");
  });

  it("should export authLimiter as middleware function", () => {
    expect(typeof authLimiter).toBe("function");
  });

  it("should export publishLimiter as middleware function", () => {
    expect(typeof publishLimiter).toBe("function");
  });

  it("should export refreshLimiter as middleware function", () => {
    expect(typeof refreshLimiter).toBe("function");
  });

  describe("generalLimiter integration", () => {
    let app;

    beforeEach(() => {
      app = express();
      app.use(generalLimiter);
      app.get("/test", (_req, res) => res.json({ ok: true }));
    });

    it("should allow requests under the limit", async () => {
      const res = await request(app).get("/test");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("should include rate limit headers in response", async () => {
      const res = await request(app).get("/test");
      expect(res.headers).toHaveProperty("ratelimit-limit");
      expect(res.headers).toHaveProperty("ratelimit-remaining");
    });
  });

  describe("authLimiter integration", () => {
    let app;

    beforeEach(() => {
      app = express();
      app.use(authLimiter);
      app.post("/login", (_req, res) => res.json({ ok: true }));
      app.post("/refresh", (_req, res) => res.json({ ok: true }));
      app.post("/logout", (_req, res) => res.json({ ok: true }));
      app.get("/me", (_req, res) => res.json({ ok: true }));
    });

    it("should allow requests under the limit", async () => {
      const res = await request(app).post("/login");
      expect(res.status).toBe(200);
    });

    it("should skip rate limiting for /refresh", async () => {
      // /refresh is in the skip list, should always pass
      for (let i = 0; i < 12; i++) {
        const res = await request(app).post("/refresh");
        expect(res.status).toBe(200);
      }
    });

    it("should skip rate limiting for /logout", async () => {
      for (let i = 0; i < 12; i++) {
        const res = await request(app).post("/logout");
        expect(res.status).toBe(200);
      }
    });

    it("should skip rate limiting for /me", async () => {
      for (let i = 0; i < 12; i++) {
        const res = await request(app).get("/me");
        expect(res.status).toBe(200);
      }
    });

    it("should enforce limit on non-skipped paths after max attempts", async () => {
      // Send 10 requests (the limit)
      for (let i = 0; i < 10; i++) {
        await request(app).post("/login");
      }
      // 11th should be rate limited
      const res = await request(app).post("/login");
      expect(res.status).toBe(429);
      expect(res.body.error).toBeDefined();
    });
  });

  describe("publishLimiter integration", () => {
    let app;

    beforeEach(() => {
      app = express();
      app.use(publishLimiter);
      app.post("/publish", (_req, res) => res.json({ ok: true }));
    });

    it("should allow requests under the limit", async () => {
      const res = await request(app).post("/publish");
      expect(res.status).toBe(200);
    });

    it("should return Hebrew error message when rate limited", async () => {
      for (let i = 0; i < 30; i++) {
        await request(app).post("/publish");
      }
      const res = await request(app).post("/publish");
      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/מגבלת הפרסום|מדי בקשות/);
    });
  });
});
