import { describe, it, expect } from "vitest";
import {
  isAllowedUrl,
  isValidFacebookGroupUrl,
  sanitizeText,
  isValidGroupName,
  imageFileFilter,
  MAX_FILE_SIZE,
} from "../../src/utils/security.js";

describe("isAllowedUrl", () => {
  it("should allow valid Facebook HTTPS URLs", () => {
    expect(isAllowedUrl("https://www.facebook.com/groups/12345")).toBe(true);
    expect(isAllowedUrl("https://facebook.com/groups/12345")).toBe(true);
    expect(isAllowedUrl("https://m.facebook.com/groups/12345")).toBe(true);
    expect(isAllowedUrl("https://web.facebook.com/groups/12345")).toBe(true);
  });

  it("should reject HTTP (non-HTTPS) URLs", () => {
    expect(isAllowedUrl("http://www.facebook.com/groups/12345")).toBe(false);
  });

  it("should reject non-Facebook domains", () => {
    expect(isAllowedUrl("https://google.com")).toBe(false);
    expect(isAllowedUrl("https://evil.com")).toBe(false);
    expect(isAllowedUrl("https://fakefacebook.com/groups/1")).toBe(false);
  });

  it("should reject internal/SSRF attack URLs", () => {
    expect(isAllowedUrl("http://localhost:3000")).toBe(false);
    expect(isAllowedUrl("http://127.0.0.1")).toBe(false);
    expect(isAllowedUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedUrl("http://192.168.1.1")).toBe(false);
    expect(isAllowedUrl("file:///etc/passwd")).toBe(false);
  });

  it("should reject null, undefined, empty, and non-string inputs", () => {
    expect(isAllowedUrl(null)).toBe(false);
    expect(isAllowedUrl(undefined)).toBe(false);
    expect(isAllowedUrl("")).toBe(false);
    expect(isAllowedUrl(123)).toBe(false);
  });

  it("should reject URLs that are too long", () => {
    const longUrl = "https://facebook.com/" + "a".repeat(2100);
    expect(isAllowedUrl(longUrl)).toBe(false);
  });

  it("should reject malformed URLs", () => {
    expect(isAllowedUrl("not-a-url")).toBe(false);
    expect(isAllowedUrl("://facebook.com")).toBe(false);
  });
});

describe("isValidFacebookGroupUrl", () => {
  it("should accept valid Facebook group URLs", () => {
    expect(
      isValidFacebookGroupUrl("https://www.facebook.com/groups/12345"),
    ).toBe(true);
    expect(
      isValidFacebookGroupUrl("https://facebook.com/groups/mygroup"),
    ).toBe(true);
  });

  it("should reject non-group Facebook URLs", () => {
    expect(
      isValidFacebookGroupUrl("https://www.facebook.com/profile/123"),
    ).toBe(false);
    expect(isValidFacebookGroupUrl("https://www.facebook.com/")).toBe(false);
  });

  it("should reject non-Facebook URLs", () => {
    expect(isValidFacebookGroupUrl("https://google.com/groups/12345")).toBe(
      false,
    );
  });
});

describe("sanitizeText", () => {
  it("should trim and return valid text", () => {
    expect(sanitizeText("  hello world  ")).toBe("hello world");
  });

  it("should return null for empty or whitespace-only strings", () => {
    expect(sanitizeText("")).toBe(null);
    expect(sanitizeText("   ")).toBe(null);
  });

  it("should return null for non-string inputs", () => {
    expect(sanitizeText(null)).toBe(null);
    expect(sanitizeText(undefined)).toBe(null);
    expect(sanitizeText(123)).toBe(null);
  });

  it("should return null for text exceeding max length", () => {
    const longText = "a".repeat(5001);
    expect(sanitizeText(longText)).toBe(null);
  });

  it("should accept text at exactly max length", () => {
    const text = "a".repeat(5000);
    expect(sanitizeText(text)).toBe(text);
  });

  it("should respect custom max length", () => {
    expect(sanitizeText("hello", 3)).toBe(null);
    expect(sanitizeText("hi", 3)).toBe("hi");
  });
});

describe("isValidGroupName", () => {
  it("should accept valid group names", () => {
    expect(isValidGroupName("פשפשוק - רכב")).toBe(true);
    expect(isValidGroupName("My Group")).toBe(true);
  });

  it("should reject empty or invalid names", () => {
    expect(isValidGroupName("")).toBe(false);
    expect(isValidGroupName("   ")).toBe(false);
    expect(isValidGroupName(null)).toBe(false);
    expect(isValidGroupName(undefined)).toBe(false);
  });

  it("should reject names longer than 200 chars", () => {
    expect(isValidGroupName("a".repeat(201))).toBe(false);
    expect(isValidGroupName("a".repeat(200))).toBe(true);
  });
});

describe("imageFileFilter", () => {
  it("should accept valid image MIME types", () => {
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    validTypes.forEach((mimetype) => {
      const cb = (err, result) => {
        expect(err).toBeNull();
        expect(result).toBe(true);
      };
      imageFileFilter(null, { mimetype }, cb);
    });
  });

  it("should reject non-image MIME types", () => {
    const invalidTypes = [
      "application/pdf",
      "text/html",
      "application/javascript",
      "image/svg+xml",
    ];
    invalidTypes.forEach((mimetype) => {
      const cb = (err, result) => {
        expect(err).toBeInstanceOf(Error);
        expect(result).toBe(false);
      };
      imageFileFilter(null, { mimetype }, cb);
    });
  });
});

describe("MAX_FILE_SIZE", () => {
  it("should be 5MB", () => {
    expect(MAX_FILE_SIZE).toBe(5 * 1024 * 1024);
  });
});
