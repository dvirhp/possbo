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
});
