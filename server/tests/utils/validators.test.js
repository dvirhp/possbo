import { describe, it, expect } from "vitest";
import {
  isValidUUID,
  areValidUUIDs,
  isFutureDate,
  isValidEmail,
  isValidPassword,
} from "../../src/utils/validators.js";

describe("isValidUUID", () => {
  it("should accept valid UUIDs", () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidUUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(true);
  });

  it("should reject invalid UUIDs", () => {
    expect(isValidUUID("not-a-uuid")).toBe(false);
    expect(isValidUUID("")).toBe(false);
    expect(isValidUUID(null)).toBe(false);
    expect(isValidUUID(undefined)).toBe(false);
    expect(isValidUUID(123)).toBe(false);
    expect(isValidUUID("550e8400-e29b-41d4-a716")).toBe(false);
    // SQL injection attempt
    expect(isValidUUID("'; DROP TABLE users; --")).toBe(false);
  });
});

describe("areValidUUIDs", () => {
  it("should accept array of valid UUIDs", () => {
    expect(
      areValidUUIDs([
        "550e8400-e29b-41d4-a716-446655440000",
        "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      ]),
    ).toBe(true);
  });

  it("should reject empty arrays", () => {
    expect(areValidUUIDs([])).toBe(false);
  });

  it("should reject non-arrays", () => {
    expect(areValidUUIDs("not-an-array")).toBe(false);
    expect(areValidUUIDs(null)).toBe(false);
  });

  it("should reject arrays with invalid UUIDs", () => {
    expect(
      areValidUUIDs(["550e8400-e29b-41d4-a716-446655440000", "invalid"]),
    ).toBe(false);
  });
});

describe("isFutureDate", () => {
  it("should accept future ISO dates", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(isFutureDate(future)).toBe(true);
  });

  it("should reject past dates", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(isFutureDate(past)).toBe(false);
  });

  it("should reject invalid date strings", () => {
    expect(isFutureDate("not-a-date")).toBe(false);
    expect(isFutureDate("")).toBe(false);
    expect(isFutureDate(null)).toBe(false);
    expect(isFutureDate(undefined)).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("should accept valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("  USER@Example.COM  ")).toBe(true);
    expect(isValidEmail("user.name+tag@domain.co.il")).toBe(true);
  });

  it("should reject invalid emails", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("@domain.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("a".repeat(300) + "@test.com")).toBe(false);
  });
});

describe("isValidPassword", () => {
  it("should accept valid passwords", () => {
    expect(isValidPassword("123456")).toBe(true);
    expect(isValidPassword("a-very-long-but-valid-password")).toBe(true);
  });

  it("should reject too short passwords", () => {
    expect(isValidPassword("12345")).toBe(false);
    expect(isValidPassword("")).toBe(false);
  });

  it("should reject too long passwords (DoS protection)", () => {
    expect(isValidPassword("a".repeat(129))).toBe(false);
  });

  it("should reject non-string values", () => {
    expect(isValidPassword(null)).toBe(false);
    expect(isValidPassword(undefined)).toBe(false);
    expect(isValidPassword(123456)).toBe(false);
  });
});
