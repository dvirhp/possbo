import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-chars-long";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-that-is-at-least-32-chars";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";

const mockUserFindFirst = vi.fn();
const mockUserCreate = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => ({
    user: {
      findFirst: mockUserFindFirst,
      create: mockUserCreate,
      update: mockUserUpdate,
    },
  })),
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(async (pw) => `hashed_${pw}`),
    compare: vi.fn(async () => true),
  },
}));

vi.mock("../../src/utils/jwt.js", () => ({
  generateAccessToken: vi.fn(() => "access-token-123"),
  generateRefreshToken: vi.fn(() => "refresh-token-123"),
}));

vi.mock("../../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock google-auth-library
const mockVerifyIdToken = vi.fn();
vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

// Mock global fetch for Facebook
const mockFetch = vi.fn();
global.fetch = mockFetch;

let app;

beforeEach(async () => {
  vi.clearAllMocks();
  mockUserUpdate.mockResolvedValue({ id: "user-1", email: "a@b.com", name: "Test" });

  const oauthModule = await import("../../src/routes/oauth.js");
  app = express();
  app.use(express.json());
  app.use("/api/oauth", oauthModule.default);
});

describe("OAuth routes", () => {
  describe("POST /api/oauth/google", () => {
    it("returns 400 when credential is missing", async () => {
      const res = await request(app)
        .post("/api/oauth/google")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing Google credential");
    });

    it("logs in existing Google user", async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: "google-123",
          email: "user@gmail.com",
          name: "Google User",
          picture: "https://pic.url",
        }),
      });
      mockUserFindFirst.mockResolvedValue({
        id: "user-1",
        email: "user@gmail.com",
        name: "Google User",
        googleId: "google-123",
        avatarUrl: null,
      });

      const res = await request(app)
        .post("/api/oauth/google")
        .send({ credential: "valid-token", mode: "login" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBe("access-token-123");
    });

    it("registers new Google user", async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: "google-new",
          email: "new@gmail.com",
          name: "New User",
          picture: "https://pic.url",
        }),
      });
      mockUserFindFirst.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({
        id: "user-new",
        email: "new@gmail.com",
        name: "New User",
        avatarUrl: "https://pic.url",
      });

      const res = await request(app)
        .post("/api/oauth/google")
        .send({ credential: "valid-token", mode: "register" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("returns 409 if Google user already exists on register", async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: "google-123",
          email: "exists@gmail.com",
          name: "Exists",
          picture: null,
        }),
      });
      mockUserFindFirst.mockResolvedValue({
        id: "user-1",
        googleId: "google-123",
        email: "exists@gmail.com",
      });

      const res = await request(app)
        .post("/api/oauth/google")
        .send({ credential: "valid-token", mode: "register" });

      expect(res.status).toBe(409);
    });

    it("returns 401 for unregistered user on login", async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: "google-unknown",
          email: "unknown@gmail.com",
          name: "Unknown",
          picture: null,
        }),
      });
      mockUserFindFirst.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/oauth/google")
        .send({ credential: "valid-token", mode: "login" });

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/oauth/facebook", () => {
    it("returns 400 when token is missing", async () => {
      const res = await request(app)
        .post("/api/oauth/facebook")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing Facebook token");
    });

    it("returns 401 for invalid Facebook token", async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ error: { message: "Invalid token" } }),
      });

      const res = await request(app)
        .post("/api/oauth/facebook")
        .send({ accessToken: "bad-token" });

      expect(res.status).toBe(401);
    });

    it("logs in existing Facebook user", async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({
          id: "fb-123",
          email: "fb@user.com",
          name: "FB User",
          picture: { data: { url: "https://fbpic.url" } },
        }),
      });
      mockUserFindFirst.mockResolvedValue({
        id: "user-1",
        email: "fb@user.com",
        facebookOAuthId: "fb-123",
        avatarUrl: null,
      });

      const res = await request(app)
        .post("/api/oauth/facebook")
        .send({ accessToken: "valid-fb-token", mode: "login" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBe("access-token-123");
    });

    it("returns 400 when Facebook doesn't provide email", async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({
          id: "fb-456",
          name: "No Email",
          picture: { data: { url: "https://pic.url" } },
        }),
      });

      const res = await request(app)
        .post("/api/oauth/facebook")
        .send({ accessToken: "valid-token", mode: "login" });

      expect(res.status).toBe(400);
    });
  });
});
