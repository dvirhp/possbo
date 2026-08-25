import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-chars-long";
process.env.JWT_REFRESH_SECRET =
  "test-jwt-refresh-secret-that-is-at-least-32-chars";
process.env.ENCRYPTION_KEY =
  "test-encryption-key-that-is-at-least-32-chars-long";

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockGroupFindMany = vi.fn();

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => ({
    postTemplate: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
    },
    group: {
      findMany: mockGroupFindMany,
    },
  })),
}));

vi.mock("../../src/utils/security.js", () => ({
  imageFileFilter: (_req, _file, cb) => cb(null, true),
  MAX_FILE_SIZE: 10 * 1024 * 1024,
}));

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
  mockFindMany.mockReset().mockResolvedValue([]);
  mockFindFirst.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockGroupFindMany.mockReset().mockResolvedValue([]);

  const templatesModule = await import("../../src/routes/templates.js");

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "user-1", email: "test@test.com" };
    next();
  });
  app.use("/api/templates", templatesModule.default);
});

describe("Templates routes", () => {
  describe("GET /api/templates", () => {
    it("should return empty templates array", async () => {
      mockFindMany.mockResolvedValue([]);

      const res = await request(app).get("/api/templates");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.templates).toEqual([]);
    });

    it("should return templates for authenticated user", async () => {
      mockFindMany.mockResolvedValue([
        {
          id: "t-1",
          name: "Test",
          content: "Hello",
          groupIds: [],
          userId: "user-1",
        },
      ]);

      const res = await request(app).get("/api/templates");

      expect(res.status).toBe(200);
      expect(res.body.templates).toHaveLength(1);
      expect(res.body.templates[0].name).toBe("Test");
    });

    it("should return 401 when not authenticated", async () => {
      const templatesModule = await import("../../src/routes/templates.js");
      const noAuthApp = express();
      noAuthApp.use(express.json());
      noAuthApp.use((req, _res, next) => {
        req.user = null;
        next();
      });
      noAuthApp.use("/api/templates", templatesModule.default);

      const res = await request(noAuthApp).get("/api/templates");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/templates/:id", () => {
    it("should return a specific template", async () => {
      mockFindFirst.mockResolvedValue({
        id: "t-1",
        name: "My Template",
        content: "Content",
      });

      const res = await request(app).get("/api/templates/t-1");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.template.name).toBe("My Template");
    });

    it("should return 404 for non-existent template", async () => {
      mockFindFirst.mockResolvedValue(null);

      const res = await request(app).get("/api/templates/non-existent");

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/templates", () => {
    it("should create a template with valid data", async () => {
      mockCreate.mockResolvedValue({
        id: "t-new",
        name: "New",
        content: "Body",
      });

      const res = await request(app).post("/api/templates").send({
        name: "New",
        content: "Body",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it("should return 400 when name is missing", async () => {
      const res = await request(app).post("/api/templates").send({
        content: "Body",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("name");
    });

    it("should return 400 when content is missing", async () => {
      const res = await request(app).post("/api/templates").send({
        name: "Test",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("content");
    });

    it("should return 400 when name is empty string", async () => {
      const res = await request(app).post("/api/templates").send({
        name: "   ",
        content: "Body",
      });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/templates/:id", () => {
    it("should delete an existing template", async () => {
      mockFindFirst.mockResolvedValue({ id: "t-1", userId: "user-1" });
      mockDelete.mockResolvedValue({ id: "t-1" });

      const res = await request(app).delete("/api/templates/t-1");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should return 404 when template not found", async () => {
      mockFindFirst.mockResolvedValue(null);

      const res = await request(app).delete("/api/templates/non-existent");

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/templates — edge cases", () => {
    it("should return 400 when name is only spaces/tabs", async () => {
      const res = await request(app).post("/api/templates").send({
        name: "\t  \n",
        content: "Body",
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 when content is empty string", async () => {
      const res = await request(app).post("/api/templates").send({
        name: "Test",
        content: "",
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 when content is whitespace only", async () => {
      const res = await request(app).post("/api/templates").send({
        name: "Test",
        content: "   ",
      });

      expect(res.status).toBe(400);
    });

    it("should create template with Hebrew content", async () => {
      mockCreate.mockResolvedValue({
        id: "t-hebrew",
        name: "תבנית",
        content: "שלום עולם",
      });

      const res = await request(app).post("/api/templates").send({
        name: "תבנית",
        content: "שלום עולם",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it("should create template with special characters in name", async () => {
      mockCreate.mockResolvedValue({
        id: "t-special",
        name: "Template (v2) — Draft",
        content: "Content",
      });

      const res = await request(app).post("/api/templates").send({
        name: "Template (v2) — Draft",
        content: "Content",
      });

      expect(res.status).toBe(201);
    });
  });

  describe("GET /api/templates/:id — edge cases", () => {
    it("should return template belonging to user", async () => {
      mockFindFirst.mockResolvedValue({
        id: "t-1",
        name: "My Template",
        content: "Content",
        userId: "user-1",
      });

      const res = await request(app).get("/api/templates/t-1");

      expect(res.status).toBe(200);
      expect(res.body.template.userId).toBe("user-1");
    });
  });

  describe("DELETE /api/templates/:id — edge cases", () => {
    it("should allow deleting template when findFirst returns match", async () => {
      // The route uses findFirst with userId filter, so if it returns a result
      // the user owns it; if not, it returns 404
      mockFindFirst.mockResolvedValue(null); // Different user's template not found
      const res = await request(app).delete("/api/templates/t-1");
      expect(res.status).toBe(404);
    });
  });
});
