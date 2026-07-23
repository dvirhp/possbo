import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We test the pure functions directly — no Playwright needed
const ORIGINAL_ENV = { ...process.env };

describe("browser-factory", () => {
  beforeEach(() => {
    // Reset module cache so each test gets fresh env reads
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // ─── simpleHash ───────────────────────────────────────

  describe("simpleHash", () => {
    it("should return a consistent number for the same string", async () => {
      const { simpleHash } = await import("../../src/utils/browser-factory.js");
      const hash1 = simpleHash("user-abc-123");
      const hash2 = simpleHash("user-abc-123");
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe("number");
    });

    it("should return different hashes for different strings", async () => {
      const { simpleHash } = await import("../../src/utils/browser-factory.js");
      const hash1 = simpleHash("user-aaa");
      const hash2 = simpleHash("user-bbb");
      expect(hash1).not.toBe(hash2);
    });

    it("should return non-negative numbers", async () => {
      const { simpleHash } = await import("../../src/utils/browser-factory.js");
      // Test a variety of inputs
      const inputs = ["", "a", "test", "long-user-id-with-dashes-1234-5678"];
      for (const input of inputs) {
        expect(simpleHash(input)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ─── generateFingerprint ──────────────────────────────

  describe("generateFingerprint", () => {
    it("should return consistent fingerprint for the same userId", async () => {
      const { generateFingerprint } =
        await import("../../src/utils/browser-factory.js");
      const fp1 = generateFingerprint("user-123-abc");
      const fp2 = generateFingerprint("user-123-abc");

      expect(fp1.userAgent).toBe(fp2.userAgent);
      expect(fp1.viewport).toEqual(fp2.viewport);
      expect(fp1.timezoneId).toBe(fp2.timezoneId);
      expect(fp1.locale).toBe(fp2.locale);
    });

    it("should return different fingerprints for different userIds", async () => {
      const { generateFingerprint } =
        await import("../../src/utils/browser-factory.js");
      const fp1 = generateFingerprint("user-aaa-111");
      const fp2 = generateFingerprint("user-bbb-222");

      // At least one field should differ (statistically almost certain)
      const allSame =
        fp1.userAgent === fp2.userAgent &&
        fp1.viewport.width === fp2.viewport.width &&
        fp1.timezoneId === fp2.timezoneId &&
        fp1.locale === fp2.locale;
      expect(allSame).toBe(false);
    });

    it("should include all required fields", async () => {
      const { generateFingerprint } =
        await import("../../src/utils/browser-factory.js");
      const fp = generateFingerprint("user-test");

      expect(fp).toHaveProperty("userAgent");
      expect(fp).toHaveProperty("viewport");
      expect(fp).toHaveProperty("viewport.width");
      expect(fp).toHaveProperty("viewport.height");
      expect(fp).toHaveProperty("timezoneId");
      expect(fp).toHaveProperty("locale");

      expect(typeof fp.userAgent).toBe("string");
      expect(fp.userAgent.length).toBeGreaterThan(10);
      expect(fp.viewport.width).toBeGreaterThan(0);
      expect(fp.viewport.height).toBeGreaterThan(0);
    });

    it("should return a random fingerprint when no userId is provided", async () => {
      const { generateFingerprint } =
        await import("../../src/utils/browser-factory.js");
      const fp = generateFingerprint();

      expect(fp).toHaveProperty("userAgent");
      expect(fp).toHaveProperty("viewport");
      expect(typeof fp.userAgent).toBe("string");
    });
  });

  // ─── getProxyConfig ───────────────────────────────────

  describe("getProxyConfig", () => {
    it("should return undefined when PROXY_URL is not set", async () => {
      delete process.env.PROXY_URL;
      const { getProxyConfig } =
        await import("../../src/utils/browser-factory.js");
      expect(getProxyConfig("user-123")).toBeUndefined();
    });

    it("should parse proxy URL correctly", async () => {
      process.env.PROXY_URL = "http://myuser:mypass@gate.brightdata.com:22225";
      const { getProxyConfig } =
        await import("../../src/utils/browser-factory.js");
      const config = getProxyConfig();

      expect(config).toBeDefined();
      expect(config.server).toBe("http://gate.brightdata.com:22225");
      expect(config.username).toBe("myuser");
      expect(config.password).toBe("mypass");
    });

    it("should add sticky session suffix when userId is provided", async () => {
      process.env.PROXY_URL = "http://myuser:mypass@gate.brightdata.com:22225";
      const { getProxyConfig } =
        await import("../../src/utils/browser-factory.js");
      const config = getProxyConfig("abcd-1234-efgh-5678");

      expect(config.username).toContain("-session-");
      expect(config.username).toMatch(/^myuser-session-abcd1234efgh$/);
    });

    it("should not duplicate session suffix if already present", async () => {
      process.env.PROXY_URL =
        "http://myuser-session-existing:mypass@gate.brightdata.com:22225";
      const { getProxyConfig } =
        await import("../../src/utils/browser-factory.js");
      const config = getProxyConfig("user-123");

      // Should not add another -session-
      const sessionCount = (config.username.match(/-session-/g) || []).length;
      expect(sessionCount).toBe(1);
    });

    it("should handle URL-encoded credentials", async () => {
      process.env.PROXY_URL =
        "http://user%40domain:p%40ss@proxy.example.com:8080";
      const { getProxyConfig } =
        await import("../../src/utils/browser-factory.js");
      const config = getProxyConfig();

      expect(config.username).toBe("user@domain");
      expect(config.password).toBe("p@ss");
    });

    it("should return undefined for invalid proxy URL", async () => {
      process.env.PROXY_URL = "not-a-valid-url";
      const { getProxyConfig } =
        await import("../../src/utils/browser-factory.js");
      const config = getProxyConfig("user-123");

      expect(config).toBeUndefined();
    });
  });

  // ─── PROXY_ENABLED ───────────────────────────────────

  describe("PROXY_ENABLED", () => {
    it("should be false when PROXY_URL is empty", async () => {
      delete process.env.PROXY_URL;
      const { PROXY_ENABLED } =
        await import("../../src/utils/browser-factory.js");
      expect(PROXY_ENABLED).toBe(false);
    });

    it("should be true when PROXY_URL is set", async () => {
      process.env.PROXY_URL = "http://user:pass@proxy.com:8080";
      const { PROXY_ENABLED } =
        await import("../../src/utils/browser-factory.js");
      expect(PROXY_ENABLED).toBe(true);
    });
  });

  // ─── launchBrowser ────────────────────────────────────

  describe("launchBrowser", () => {
    it("should be exported as a function", async () => {
      const { launchBrowser } =
        await import("../../src/utils/browser-factory.js");
      expect(typeof launchBrowser).toBe("function");
    });
  });

  // ─── createBrowserContext ─────────────────────────────

  describe("createBrowserContext", () => {
    it("should be exported as a function", async () => {
      const { createBrowserContext } =
        await import("../../src/utils/browser-factory.js");
      expect(typeof createBrowserContext).toBe("function");
    });
  });

  // ─── Distribution quality ─────────────────────────────

  describe("fingerprint distribution", () => {
    it("should distribute fingerprints across available user agents", async () => {
      const { generateFingerprint } =
        await import("../../src/utils/browser-factory.js");

      const userAgents = new Set();
      // Generate 100 different userId fingerprints
      for (let i = 0; i < 100; i++) {
        const fp = generateFingerprint(`user-${i}-test-distribution`);
        userAgents.add(fp.userAgent);
      }

      // Should use at least 3 different user agents out of 12
      expect(userAgents.size).toBeGreaterThanOrEqual(3);
    });

    it("should distribute across viewports", async () => {
      const { generateFingerprint } =
        await import("../../src/utils/browser-factory.js");

      const viewports = new Set();
      for (let i = 0; i < 100; i++) {
        const fp = generateFingerprint(`user-${i}-viewport-test`);
        viewports.add(`${fp.viewport.width}x${fp.viewport.height}`);
      }

      expect(viewports.size).toBeGreaterThanOrEqual(3);
    });
  });
});
