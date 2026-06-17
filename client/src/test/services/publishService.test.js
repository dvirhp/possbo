import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPost = vi.fn();
const mockGet = vi.fn();

vi.mock("../../services/http.js", () => ({
  default: {
    post: mockPost,
    get: mockGet,
  },
}));

describe("publishService", () => {
  let publishService;

  beforeEach(async () => {
    mockPost.mockClear();
    mockGet.mockClear();
    mockPost.mockResolvedValue({ data: { success: true } });
    mockGet.mockResolvedValue({ data: { success: true, posts: [] } });

    const module = await import("../../services/publishService.js");
    publishService = module.publishService;
  });

  describe("publish", () => {
    it("should send FormData to /publish endpoint", async () => {
      await publishService.publish(
        "https://fb.com/groups/1",
        "Hello",
        null,
        "Group",
      );

      expect(mockPost).toHaveBeenCalledWith(
        "/publish",
        expect.any(FormData),
        expect.objectContaining({
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120000,
        }),
      );
    });

    it("should include groupUrl and text in FormData", async () => {
      await publishService.publish(
        "https://fb.com/groups/1",
        "Hello",
        null,
        "Group",
      );

      const formData = mockPost.mock.calls[0][1];
      expect(formData.get("groupUrl")).toBe("https://fb.com/groups/1");
      expect(formData.get("text")).toBe("Hello");
    });

    it("should include groupName when provided", async () => {
      await publishService.publish("url", "text", null, "My Group");

      const formData = mockPost.mock.calls[0][1];
      expect(formData.get("groupName")).toBe("My Group");
    });

    it("should not include groupName when falsy", async () => {
      await publishService.publish("url", "text", null, "");

      const formData = mockPost.mock.calls[0][1];
      expect(formData.get("groupName")).toBeNull();
    });

    it("should include anonymous=true when anonymous is true", async () => {
      await publishService.publish("url", "text", null, "name", true, "");

      const formData = mockPost.mock.calls[0][1];
      expect(formData.get("anonymous")).toBe("true");
    });

    it("should not include anonymous when false", async () => {
      await publishService.publish("url", "text", null, "name", false, "");

      const formData = mockPost.mock.calls[0][1];
      expect(formData.get("anonymous")).toBeNull();
    });

    it("should include location when provided", async () => {
      await publishService.publish(
        "url",
        "text",
        null,
        "name",
        false,
        "Tel Aviv",
      );

      const formData = mockPost.mock.calls[0][1];
      expect(formData.get("location")).toBe("Tel Aviv");
    });

    it("should not include location when empty", async () => {
      await publishService.publish("url", "text", null, "name", false, "");

      const formData = mockPost.mock.calls[0][1];
      expect(formData.get("location")).toBeNull();
    });

    it("should include image file when provided", async () => {
      const file = new File(["content"], "photo.png", { type: "image/png" });
      await publishService.publish("url", "text", file, "name");

      const formData = mockPost.mock.calls[0][1];
      expect(formData.get("image")).toBeInstanceOf(File);
    });

    it("should not include image when null", async () => {
      await publishService.publish("url", "text", null, "name");

      const formData = mockPost.mock.calls[0][1];
      expect(formData.get("image")).toBeNull();
    });
  });

  describe("getHistory", () => {
    it("should call /publish/history without params when no groupUrl", async () => {
      await publishService.getHistory();
      expect(mockGet).toHaveBeenCalledWith("/publish/history");
    });

    it("should include encoded groupUrl as query param", async () => {
      await publishService.getHistory("https://fb.com/groups/123");
      expect(mockGet).toHaveBeenCalledWith(
        "/publish/history?groupUrl=https%3A%2F%2Ffb.com%2Fgroups%2F123",
      );
    });

    it("should handle special characters in groupUrl", async () => {
      await publishService.getHistory("https://fb.com/groups/hello world&x=1");
      expect(mockGet).toHaveBeenCalledWith(
        "/publish/history?groupUrl=https%3A%2F%2Ffb.com%2Fgroups%2Fhello%20world%26x%3D1",
      );
    });

    it("should call without query param when empty string", async () => {
      await publishService.getHistory("");
      expect(mockGet).toHaveBeenCalledWith("/publish/history");
    });
  });
});
