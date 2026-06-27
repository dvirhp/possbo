import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-chars-long";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-that-is-at-least-32-chars";
process.env.ENCRYPTION_KEY = "test-encryption-key-that-is-at-least-32-chars-long";

const mockPostCreate = vi.fn();
const mockPostFindFirst = vi.fn();
const mockPostFindMany = vi.fn();
const mockPostUpdate = vi.fn();
const mockPostGroupCreate = vi.fn();
const mockPostGroupUpsert = vi.fn();
const mockPostGroupScheduleCreate = vi.fn();
const mockPublicationJobCreate = vi.fn();
const mockPublicationJobFindMany = vi.fn();
const mockPublicationJobFindFirst = vi.fn();
const mockPublicationJobUpdate = vi.fn();
const mockNotificationFindMany = vi.fn();
const mockNotificationUpdateMany = vi.fn();
const mockGroupFindFirst = vi.fn();
const mockGroupCreate = vi.fn();
const mockPostMediaCreate = vi.fn();
const mockPublicationHistoryFindMany = vi.fn();

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => ({
    post: {
      create: mockPostCreate,
      findFirst: mockPostFindFirst,
      findMany: mockPostFindMany,
      update: mockPostUpdate,
    },
    postGroup: {
      create: mockPostGroupCreate,
      upsert: mockPostGroupUpsert,
    },
    postGroupSchedule: { create: mockPostGroupScheduleCreate },
    publicationJob: {
      create: mockPublicationJobCreate,
      findMany: mockPublicationJobFindMany,
      findFirst: mockPublicationJobFindFirst,
      update: mockPublicationJobUpdate,
    },
    notification: {
      findMany: mockNotificationFindMany,
      updateMany: mockNotificationUpdateMany,
    },
    group: {
      findFirst: mockGroupFindFirst,
      create: mockGroupCreate,
    },
    postMedia: { create: mockPostMediaCreate },
    publicationHistory: { findMany: mockPublicationHistoryFindMany },
  })),
}));

vi.mock("../../src/utils/security.js", () => ({
  imageFileFilter: (_req, _file, cb) => cb(null, true),
  MAX_FILE_SIZE: 10 * 1024 * 1024,
}));

let app;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();

  mockPostCreate.mockResolvedValue({ id: "post-1" });
  mockPostFindFirst.mockResolvedValue({ id: "post-1", userId: "user-1" });
  mockPostGroupCreate.mockResolvedValue({ id: "pg-1" });
  mockPostGroupUpsert.mockResolvedValue({ id: "pg-1" });
  mockPostGroupScheduleCreate.mockResolvedValue({ id: "sch-1" });
  mockPublicationJobCreate.mockResolvedValue({ id: "job-1" });
  mockPostUpdate.mockResolvedValue({});
  mockGroupFindFirst.mockResolvedValue({ id: "group-1", name: "Test Group" });

  const schedulerModule = await import("../../src/routes/scheduler.js");

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: "user-1",
      email: "test@test.com",
      facebookStorageState: "some-state",
    };
    next();
  });
  app.use("/api/scheduler", schedulerModule.default);
});

describe("Scheduler routes", () => {
  describe("POST /api/scheduler/schedule", () => {
    it("schedules posts for given groups", async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app)
        .post("/api/scheduler/schedule")
        .send({
          postId: "post-1",
          groupIds: ["group-1"],
          scheduledAt: futureDate,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.scheduled).toHaveLength(1);
    });

    it("returns 400 when missing required fields", async () => {
      const res = await request(app)
        .post("/api/scheduler/schedule")
        .send({ postId: "post-1" });

      expect(res.status).toBe(400);
    });

    it("returns 400 when scheduledAt is in the past", async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const res = await request(app)
        .post("/api/scheduler/schedule")
        .send({
          postId: "post-1",
          groupIds: ["group-1"],
          scheduledAt: pastDate,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("future");
    });

    it("returns 404 when post not found", async () => {
      mockPostFindFirst.mockResolvedValueOnce(null);
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app)
        .post("/api/scheduler/schedule")
        .send({
          postId: "missing",
          groupIds: ["group-1"],
          scheduledAt: futureDate,
        });

      expect(res.status).toBe(404);
    });

    it("returns 400 when no facebook session", async () => {
      // Override user to have no FB session
      app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.user = { id: "user-1", facebookStorageState: null };
        next();
      });
      const schedulerModule = await import("../../src/routes/scheduler.js");
      app.use("/api/scheduler", schedulerModule.default);

      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app)
        .post("/api/scheduler/schedule")
        .send({
          postId: "post-1",
          groupIds: ["group-1"],
          scheduledAt: futureDate,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("NO_FACEBOOK_SESSION");
    });
  });

  describe("GET /api/scheduler/jobs", () => {
    it("returns pending jobs for user", async () => {
      mockPublicationJobFindMany.mockResolvedValue([
        {
          id: "job-1",
          scheduledAt: new Date(),
          postGroup: {
            post: { id: "p1", title: "T", content: "C" },
            group: { id: "g1", name: "G" },
          },
        },
      ]);

      const res = await request(app).get("/api/scheduler/jobs");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobs).toHaveLength(1);
    });
  });

  describe("GET /api/scheduler/history", () => {
    it("returns publication history", async () => {
      mockPublicationHistoryFindMany.mockResolvedValue([
        {
          id: "h1",
          status: "SUCCESS",
          publishedAt: new Date(),
          post: { id: "p1", title: "T", content: "C", media: [] },
          group: { id: "g1", name: "G" },
          screenshotUrl: null,
        },
      ]);

      const res = await request(app).get("/api/scheduler/history");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.history).toHaveLength(1);
      expect(res.body.history[0].status).toBe("SUCCESS");
    });
  });

  describe("DELETE /api/scheduler/jobs/:jobId", () => {
    it("cancels a pending job", async () => {
      mockPublicationJobFindFirst.mockResolvedValue({
        id: "job-1",
        status: "PENDING",
      });
      mockPublicationJobUpdate.mockResolvedValue({});

      const res = await request(app).delete("/api/scheduler/jobs/job-1");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("returns 404 for non-existent job", async () => {
      mockPublicationJobFindFirst.mockResolvedValue(null);

      const res = await request(app).delete("/api/scheduler/jobs/fake-id");

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/scheduler/notifications", () => {
    it("returns user notifications", async () => {
      mockNotificationFindMany.mockResolvedValue([
        { id: "n1", message: "Published", isRead: false },
      ]);

      const res = await request(app).get("/api/scheduler/notifications");

      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(1);
    });
  });

  describe("PATCH /api/scheduler/notifications/read", () => {
    it("marks all notifications as read", async () => {
      mockNotificationUpdateMany.mockResolvedValue({ count: 3 });

      const res = await request(app).patch("/api/scheduler/notifications/read");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("GET /api/scheduler/session-status", () => {
    it("returns active session status", async () => {
      const res = await request(app).get("/api/scheduler/session-status");

      expect(res.status).toBe(200);
      expect(res.body.hasActiveSession).toBe(true);
    });
  });

  describe("POST /api/scheduler/campaigns", () => {
    it("creates a draft campaign without groups", async () => {
      const res = await request(app)
        .post("/api/scheduler/campaigns")
        .field("text", "Hello world")
        .field("scheduleMode", "draft");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.postId).toBe("post-1");
    });

    it("returns 400 when text is missing", async () => {
      const res = await request(app)
        .post("/api/scheduler/campaigns")
        .field("title", "No text");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("text");
    });

    it("returns 400 for scheduled without groups", async () => {
      const res = await request(app)
        .post("/api/scheduler/campaigns")
        .field("text", "Hello")
        .field("scheduleMode", "scheduled")
        .field("scheduleDate", "2030-01-01")
        .field("scheduleTime", "10:00");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("groupIds");
    });
  });

  describe("GET /api/scheduler/campaigns/recent", () => {
    it("returns drafts and history", async () => {
      mockPostFindMany.mockResolvedValue([]);

      const res = await request(app).get("/api/scheduler/campaigns/recent");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("Unauthenticated requests", () => {
    it("returns 401 without user", async () => {
      const noAuthApp = express();
      noAuthApp.use(express.json());
      noAuthApp.use((req, _res, next) => {
        req.user = null;
        next();
      });
      const schedulerModule = await import("../../src/routes/scheduler.js");
      noAuthApp.use("/api/scheduler", schedulerModule.default);

      const res = await request(noAuthApp).get("/api/scheduler/jobs");
      expect(res.status).toBe(401);
    });
  });
});
