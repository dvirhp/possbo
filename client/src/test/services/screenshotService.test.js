import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();

vi.mock("../../services/http.js", () => ({
  default: {
    get: mockGet,
  },
}));

describe("screenshotService", () => {
  let screenshotService;

  beforeEach(async () => {
    mockGet.mockClear();

    const module = await import("../../services/screenshotService.js");
    screenshotService = module.screenshotService;
  });

  describe("capture", () => {
    it("should call GET /screenshot with encoded url param", async () => {
      mockGet.mockResolvedValue({
        data: { success: true, screenshot: "base64" },
      });

      await screenshotService.capture("https://facebook.com/groups/123");

      expect(mockGet).toHaveBeenCalledWith(
        "/screenshot?url=https%3A%2F%2Ffacebook.com%2Fgroups%2F123",
        { timeout: 120000 },
      );
    });

    it("should handle URLs with special characters", async () => {
      mockGet.mockResolvedValue({ data: { success: true } });

      await screenshotService.capture("https://fb.com/groups/hello world&x=1");

      expect(mockGet).toHaveBeenCalledWith(
        "/screenshot?url=https%3A%2F%2Ffb.com%2Fgroups%2Fhello%20world%26x%3D1",
        { timeout: 120000 },
      );
    });

    it("should set timeout to 120000ms", async () => {
      mockGet.mockResolvedValue({ data: {} });

      await screenshotService.capture("url");

      expect(mockGet.mock.calls[0][1]).toEqual({ timeout: 120000 });
    });

    it("should return the API response", async () => {
      const mockResponse = { data: { success: true, screenshot: "abc123" } };
      mockGet.mockResolvedValue(mockResponse);

      const result = await screenshotService.capture("url");

      expect(result).toEqual(mockResponse);
    });

    it("should propagate errors", async () => {
      mockGet.mockRejectedValue(new Error("timeout"));

      await expect(screenshotService.capture("url")).rejects.toThrow("timeout");
    });
  });
});
