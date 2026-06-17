import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock axios
vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
    })),
  },
}));

describe("api (client/src/services/api.js)", () => {
  let authAPI, groupsAPI;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import("../../services/api.js");
    authAPI = module.authAPI;
    groupsAPI = module.groupsAPI;
  });

  describe("authAPI", () => {
    it("should have loginWithFacebook that redirects window", () => {
      // Mock window.location
      const originalHref = window.location.href;
      delete window.location;
      window.location = { href: "" };

      authAPI.loginWithFacebook();

      expect(window.location.href).toContain("/auth/facebook");
      window.location = { href: originalHref };
    });

    it("should expose getMe method", () => {
      expect(typeof authAPI.getMe).toBe("function");
    });

    it("should expose getAutoScreenshot method", () => {
      expect(typeof authAPI.getAutoScreenshot).toBe("function");
    });

    it("should expose logout method", () => {
      expect(typeof authAPI.logout).toBe("function");
    });
  });

  describe("groupsAPI", () => {
    it("should expose searchGroup method", () => {
      expect(typeof groupsAPI.searchGroup).toBe("function");
    });

    it("should expose getFacebookScreenshot method", () => {
      expect(typeof groupsAPI.getFacebookScreenshot).toBe("function");
    });

    it("should expose refreshScreenshot method", () => {
      expect(typeof groupsAPI.refreshScreenshot).toBe("function");
    });

    it("should expose bootstrapSession method", () => {
      expect(typeof groupsAPI.bootstrapSession).toBe("function");
    });

    it("should expose scrapeMyGroups method", () => {
      expect(typeof groupsAPI.scrapeMyGroups).toBe("function");
    });

    it("should expose getMyGroups method", () => {
      expect(typeof groupsAPI.getMyGroups).toBe("function");
    });

    it("should expose getSavedGroups method", () => {
      expect(typeof groupsAPI.getSavedGroups).toBe("function");
    });

    it("should expose publishToGroup method", () => {
      expect(typeof groupsAPI.publishToGroup).toBe("function");
    });
  });
});
