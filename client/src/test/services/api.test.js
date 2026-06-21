import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock http module
vi.mock("../../services/http.js", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
}));

// Mock axios for refresh endpoint
vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
    })),
    post: vi.fn(),
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
    it("should expose register method", () => {
      expect(typeof authAPI.register).toBe("function");
    });

    it("should expose login method", () => {
      expect(typeof authAPI.login).toBe("function");
    });

    it("should expose getMe method", () => {
      expect(typeof authAPI.getMe).toBe("function");
    });

    it("should expose refresh method", () => {
      expect(typeof authAPI.refresh).toBe("function");
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

    it("should expose publishToGroup method", () => {
      expect(typeof groupsAPI.publishToGroup).toBe("function");
    });
  });
});
