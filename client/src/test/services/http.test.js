import { describe, it, expect, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    })),
  },
}));

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
});
