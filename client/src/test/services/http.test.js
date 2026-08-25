import { describe, it, expect, vi, beforeEach } from "vitest";



vi.mock("axios", () => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return {
    default: {
      create: vi.fn(() => instance),
      post: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.resetModules();
});

describe("http (client/src/services/http.js)", () => {
  it("should create axios instance with base URL", async () => {
    const axios = (await import("axios")).default;
    await import("../../services/http.js");

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: expect.stringContaining("/api"),
        withCredentials: true,
      }),
    );
  });

  it("should export the axios instance as default", async () => {
    const module = await import("../../services/http.js");
    expect(module.default).toBeDefined();
    expect(typeof module.default.get).toBe("function");
    expect(typeof module.default.post).toBe("function");
  });

  it("should export token management functions", async () => {
    const module = await import("../../services/http.js");
    expect(typeof module.setAccessToken).toBe("function");
    expect(typeof module.getAccessToken).toBe("function");
    expect(typeof module.clearAccessToken).toBe("function");
  });

  it("should set and get access token", async () => {
    const { setAccessToken, getAccessToken } = await import(
      "../../services/http.js"
    );
    setAccessToken("test-token-123");
    expect(getAccessToken()).toBe("test-token-123");
  });

  it("should clear access token", async () => {
    const { setAccessToken, getAccessToken, clearAccessToken } = await import(
      "../../services/http.js"
    );
    setAccessToken("some-token");
    clearAccessToken();
    expect(getAccessToken()).toBeNull();
  });

  it("should register request interceptor", async () => {
    const axios = (await import("axios")).default;
    const instance = axios.create();
    await import("../../services/http.js");

    expect(instance.interceptors.request.use).toHaveBeenCalled();
  });

  it("should register response interceptor", async () => {
    const axios = (await import("axios")).default;
    const instance = axios.create();
    await import("../../services/http.js");

    expect(instance.interceptors.response.use).toHaveBeenCalled();
  });

  it("should configure timeout", async () => {
    const axios = (await import("axios")).default;
    await import("../../services/http.js");

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: expect.any(Number),
      }),
    );
  });

  it("setAccessToken should handle null value", async () => {
    const { setAccessToken, getAccessToken } = await import(
      "../../services/http.js"
    );
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });
});
