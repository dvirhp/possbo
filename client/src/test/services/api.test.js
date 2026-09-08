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

import { authAPI } from "../../services/api.js";
import http, { setAccessToken, clearAccessToken } from "../../services/http.js";
import axios from "axios";

describe("authAPI", () => {
  beforeEach(() => {
    vi.mocked(http.get).mockClear();
    vi.mocked(http.post).mockClear();
    vi.mocked(setAccessToken).mockClear();
    vi.mocked(clearAccessToken).mockClear();
    vi.mocked(axios.post).mockClear();
  });

  describe("register", () => {
    it("should POST /auth/register with user data", async () => {
      vi.mocked(http.post).mockResolvedValue({
        data: { accessToken: "tok", user: { id: "1" } },
      });

      await authAPI.register("a@b.com", "pass123", "Name", "male", "050");

      expect(http.post).toHaveBeenCalledWith("/auth/register", {
        email: "a@b.com",
        password: "pass123",
        name: "Name",
        gender: "male",
        phone: "050",
      });
    });

    it("should set access token from response", async () => {
      vi.mocked(http.post).mockResolvedValue({
        data: { accessToken: "my-token" },
      });

      await authAPI.register("a@b.com", "pass");

      expect(setAccessToken).toHaveBeenCalledWith("my-token");
    });

    it("should not set access token when missing", async () => {
      vi.mocked(http.post).mockResolvedValue({ data: {} });

      await authAPI.register("a@b.com", "pass");

      expect(setAccessToken).not.toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("should POST /auth/login with email and password", async () => {
      vi.mocked(http.post).mockResolvedValue({ data: { accessToken: "tok" } });

      await authAPI.login("a@b.com", "pass123");

      expect(http.post).toHaveBeenCalledWith("/auth/login", {
        email: "a@b.com",
        password: "pass123",
      });
    });

    it("should set access token from response", async () => {
      vi.mocked(http.post).mockResolvedValue({
        data: { accessToken: "login-tok" },
      });

      await authAPI.login("a@b.com", "pass");

      expect(setAccessToken).toHaveBeenCalledWith("login-tok");
    });
  });

  describe("getMe", () => {
    it("should GET /auth/me", async () => {
      vi.mocked(http.get).mockResolvedValue({
        data: { id: "1", email: "a@b.com" },
      });

      const result = await authAPI.getMe();

      expect(http.get).toHaveBeenCalledWith("/auth/me");
      expect(result.data.id).toBe("1");
    });
  });

  describe("refresh", () => {
    it("should POST to /api/auth/refresh with credentials", async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: { accessToken: "new-tok" },
      });

      await authAPI.refresh();

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining("/auth/refresh"),
        {},
        { withCredentials: true, timeout: 15000 },
      );
      expect(setAccessToken).toHaveBeenCalledWith("new-tok");
    });
  });

  describe("logout", () => {
    it("should POST /auth/logout and clear token", async () => {
      vi.mocked(http.post).mockResolvedValue({ data: { success: true } });

      await authAPI.logout();

      expect(http.post).toHaveBeenCalledWith("/auth/logout");
      expect(clearAccessToken).toHaveBeenCalled();
    });
  });
});
