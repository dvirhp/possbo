import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-chars-long";
process.env.JWT_REFRESH_SECRET =
  "test-jwt-refresh-secret-that-is-at-least-32-chars";

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(async (pw) => `hashed_${pw}`),
    compare: vi.fn(async (pw, hash) => hash === `hashed_${pw}`),
  },
}));

const mockUserUpdate = vi.fn();
const mockSubscriptionFindFirst = vi.fn();
const mockConnectedAccountFindFirst = vi.fn();

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => ({
    user: { update: mockUserUpdate },
    subscription: { findFirst: mockSubscriptionFindFirst },
    connectedAccount: { findFirst: mockConnectedAccountFindFirst },
  })),
}));

const { setRefreshCookie, formatUserResponse, issueTokens, normalizeEmail } =
  await import("../../src/utils/auth-service.js");

beforeEach(() => {
  mockUserUpdate.mockReset().mockResolvedValue({});
  mockSubscriptionFindFirst.mockReset().mockResolvedValue(null);
  mockConnectedAccountFindFirst.mockReset().mockResolvedValue(null);
});

// ─── normalizeEmail ─────────────────────────────────────────

describe("normalizeEmail", () => {
  it("should trim and lowercase email", () => {
    expect(normalizeEmail("  Test@EXAMPLE.com  ")).toBe("test@example.com");
  });

  it("should return empty string for null/undefined", () => {
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
  });
});

// ─── formatUserResponse ─────────────────────────────────────

describe("formatUserResponse", () => {
  const baseUser = {
    id: "u1",
    email: "a@b.com",
    name: "Test",
    profileImage: "/img.jpg",
    avatarUrl: null,
    fbSessionValid: true,
    whatsappNumber: "123",
    whatsappMessage: "hi",
    notificationSettings: { enabled: true },
    createdAt: new Date("2024-01-01"),
  };

  it("should return canonical user shape", () => {
    const result = formatUserResponse(baseUser);
    expect(result).toEqual({
      id: "u1",
      email: "a@b.com",
      emailVerified: false,
      isAdmin: false,
      name: "Test",
      profileImage: "/img.jpg",
      avatarUrl: null,
      fbSessionValid: true,
      whatsappNumber: "123",
      whatsappMessage: "hi",
      whatsappSessionConnected: false,
      whatsappSessionPhone: null,
      notificationSettings: { enabled: true },
      createdAt: baseUser.createdAt,
      billingRequired: true,
    });
  });

  it("should merge extras into user response", () => {
    const result = formatUserResponse(baseUser, {
      instagramConnected: true,
      subscription: { status: "ACTIVE" },
    });
    expect(result.instagramConnected).toBe(true);
    expect(result.subscription).toEqual({ status: "ACTIVE" });
  });

  it("should default missing fields to null/false", () => {
    const result = formatUserResponse({ id: "u2", email: "x@y.com" });
    expect(result.profileImage).toBeNull();
    expect(result.avatarUrl).toBeNull();
    expect(result.fbSessionValid).toBe(false);
    expect(result.whatsappNumber).toBeNull();
  });
});

// ─── setRefreshCookie ───────────────────────────────────────

describe("setRefreshCookie", () => {
  it("should set httpOnly cookie with secure flags for HTTPS", () => {
    const res = { cookie: vi.fn() };
    const req = { protocol: "https" };
    setRefreshCookie(res, "mytoken", req);
    expect(res.cookie).toHaveBeenCalledWith(
      "refreshToken",
      "mytoken",
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/api/auth",
      }),
    );
  });

  it("should use lax sameSite for HTTP in dev", () => {
    const res = { cookie: vi.fn() };
    const req = { protocol: "http" };
    setRefreshCookie(res, "mytoken", req);
    expect(res.cookie).toHaveBeenCalledWith(
      "refreshToken",
      "mytoken",
      expect.objectContaining({
        secure: false,
        sameSite: "lax",
      }),
    );
  });
});

// ─── issueTokens ────────────────────────────────────────────

describe("issueTokens", () => {
  const user = {
    id: "u1",
    email: "a@b.com",
    name: "Test",
    createdAt: new Date(),
  };

  it("should return accessToken and formatted user", async () => {
    const res = { cookie: vi.fn() };
    const req = { protocol: "http" };
    const result = await issueTokens(res, user, req);
    expect(result.success).toBe(true);
    expect(result.accessToken).toBeDefined();
    expect(result.user.id).toBe("u1");
    expect(result.user.email).toBe("a@b.com");
  });

  it("should set refresh cookie", async () => {
    const res = { cookie: vi.fn() };
    const req = { protocol: "http" };
    await issueTokens(res, user, req);
    expect(res.cookie).toHaveBeenCalledWith(
      "refreshToken",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("should update user in DB with hashed refresh token", async () => {
    const res = { cookie: vi.fn() };
    const req = { protocol: "http" };
    await issueTokens(res, user, req);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({
        refreshToken: expect.stringContaining("hashed_"),
        lastLoginAt: expect.any(Date),
      }),
    });
  });

  it("should include subscription when requested", async () => {
    mockSubscriptionFindFirst.mockResolvedValue({
      status: "ACTIVE",
      plan: { name: "Pro" },
      endsAt: new Date(),
    });
    const res = { cookie: vi.fn() };
    const req = { protocol: "http" };
    const result = await issueTokens(res, user, req, {
      includeSubscription: true,
    });
    expect(result.user.subscription).toEqual({
      status: "ACTIVE",
      planName: "Pro",
      endsAt: expect.any(Date),
    });
  });

  it("should include instagram when requested", async () => {
    mockConnectedAccountFindFirst.mockResolvedValue({
      providerUserName: "insta_user",
    });
    const res = { cookie: vi.fn() };
    const req = { protocol: "http" };
    const result = await issueTokens(res, user, req, {
      includeInstagram: true,
    });
    expect(result.user.instagramConnected).toBe(true);
    expect(result.user.instagramUsername).toBe("insta_user");
  });
});
