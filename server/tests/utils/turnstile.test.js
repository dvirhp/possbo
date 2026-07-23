import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

let verifyTurnstile;
let originalEnv;

beforeEach(async () => {
  vi.resetModules();
  originalEnv = process.env.NODE_ENV;
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  process.env.NODE_ENV = "test";

  const mod = await import("../../src/utils/turnstile.js");
  verifyTurnstile = mod.verifyTurnstile;
});

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

describe("verifyTurnstile", () => {
  it("returns false when token is empty", async () => {
    const result = await verifyTurnstile("", "127.0.0.1");
    expect(result).toBe(false);
  });

  it("returns false when token is null", async () => {
    const result = await verifyTurnstile(null, "127.0.0.1");
    expect(result).toBe(false);
  });

  it("returns false when token is undefined", async () => {
    const result = await verifyTurnstile(undefined, "127.0.0.1");
    expect(result).toBe(false);
  });

  it("allows bypass token in non-production", async () => {
    const result = await verifyTurnstile("bypass", "127.0.0.1");
    expect(result).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns true on successful verification", async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: true }),
    });

    const result = await verifyTurnstile("valid-token", "1.2.3.4");
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns false on failed verification", async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({
        success: false,
        "error-codes": ["invalid-input-response"],
      }),
    });

    const result = await verifyTurnstile("bad-token", "1.2.3.4");
    expect(result).toBe(false);
  });

  it("fails open in non-production when fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await verifyTurnstile("any-token", "1.2.3.4");
    // In non-production, fails open
    expect(result).toBe(true);
  });

  it("sends correct payload to Cloudflare API", async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: true }),
    });

    await verifyTurnstile("test-token", "203.0.113.1");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/x-www-form-urlencoded",
        }),
      }),
    );

    const callBody = mockFetch.mock.lastCall[1].body;
    expect(callBody).toBeInstanceOf(URLSearchParams);
    expect(callBody.get("secret")).toBe("test-secret");
    expect(callBody.get("response")).toBe("test-token");
    expect(callBody.get("remoteip")).toBe("203.0.113.1");
  });

  it("returns false when Cloudflare returns multiple error codes", async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({
        success: false,
        "error-codes": ["invalid-input-response", "timeout-or-duplicate"],
      }),
    });

    const result = await verifyTurnstile("bad-token", "1.2.3.4");
    expect(result).toBe(false);
  });

  it("handles non-JSON response gracefully", async () => {
    mockFetch.mockResolvedValue({
      json: async () => {
        throw new Error("Invalid JSON");
      },
    });

    const result = await verifyTurnstile("token", "1.2.3.4");
    // Should not crash, fails open in test
    expect(typeof result).toBe("boolean");
  });
});
