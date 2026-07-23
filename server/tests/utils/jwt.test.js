import { describe, it, expect, beforeAll } from "vitest";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../../src/utils/jwt.js";

beforeAll(() => {
  process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-chars-long";
  process.env.JWT_REFRESH_SECRET =
    "test-jwt-refresh-secret-that-is-at-least-32-chars";
});

describe("JWT utilities", () => {
  it("should generate and verify an access token", () => {
    const token = generateAccessToken("user-123");
    const payload = verifyAccessToken(token);

    expect(payload.userId).toBe("user-123");
    expect(payload.type).toBe("access");
  });

  it("should generate and verify a refresh token", () => {
    const token = generateRefreshToken("user-456");
    const payload = verifyRefreshToken(token);

    expect(payload.userId).toBe("user-456");
    expect(payload.type).toBe("refresh");
    expect(payload.jti).toBeDefined();
  });

  it("should reject access token when used as refresh", () => {
    const token = generateAccessToken("user-123");

    expect(() => verifyRefreshToken(token)).toThrow();
  });

  it("should reject refresh token when used as access", () => {
    const token = generateRefreshToken("user-123");

    expect(() => verifyAccessToken(token)).toThrow();
  });

  it("should generate unique refresh tokens", () => {
    const t1 = generateRefreshToken("user-123");
    const t2 = generateRefreshToken("user-123");

    expect(t1).not.toBe(t2);
  });

  it("should reject a tampered token payload", () => {
    const token = generateAccessToken("user-123");
    const parts = token.split(".");
    // Tamper the payload to change userId
    const fakePayload = Buffer.from(
      JSON.stringify({ userId: "admin", type: "access" })
    ).toString("base64url");
    const tampered = parts[0] + "." + fakePayload + "." + parts[2];

    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it("should reject a completely invalid token string", () => {
    expect(() => verifyAccessToken("not.a.valid.token")).toThrow();
    expect(() => verifyAccessToken("")).toThrow();
    expect(() => verifyAccessToken("random-garbage")).toThrow();
  });

  it("should include expiration in token payload", () => {
    const token = generateAccessToken("user-123");
    const payload = verifyAccessToken(token);
    expect(payload.exp).toBeDefined();
    expect(payload.iat).toBeDefined();
    // Expiry should be in the future
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("should include unique jti in each refresh token", () => {
    const t1 = generateRefreshToken("user-123");
    const t2 = generateRefreshToken("user-123");
    const p1 = verifyRefreshToken(t1);
    const p2 = verifyRefreshToken(t2);

    expect(p1.jti).toBeDefined();
    expect(p2.jti).toBeDefined();
    expect(p1.jti).not.toBe(p2.jti);
  });

  it("should handle userId with special characters", () => {
    const specialId = "user-with-special_chars.123";
    const token = generateAccessToken(specialId);
    const payload = verifyAccessToken(token);
    expect(payload.userId).toBe(specialId);
  });

  it("should throw when JWT_SECRET is missing", () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => generateAccessToken("user-1")).toThrow("JWT_SECRET");
    process.env.JWT_SECRET = original;
  });

  it("should throw when JWT_SECRET is too short", () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "short";
    expect(() => generateAccessToken("user-1")).toThrow("JWT_SECRET");
    process.env.JWT_SECRET = original;
  });

  it("should throw when JWT_REFRESH_SECRET is missing", () => {
    const original = process.env.JWT_REFRESH_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    expect(() => generateRefreshToken("user-1")).toThrow("JWT_REFRESH_SECRET");
    process.env.JWT_REFRESH_SECRET = original;
  });
});
