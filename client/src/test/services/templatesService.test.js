import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

vi.mock("../../services/http.js", () => ({
  default: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
    put: (...args) => mockPut(...args),
    delete: (...args) => mockDelete(...args),
  },
}));

import { templatesService } from "../../services/templatesService.js";

describe("templatesService", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockDelete.mockReset();
  });

  describe("getAll", () => {
    it("should call GET /templates", () => {
      templatesService.getAll();
      expect(mockGet).toHaveBeenCalledWith("/templates");
    });
  });

  describe("get", () => {
    it("should call GET /templates/:id", () => {
      templatesService.get("t-123");
      expect(mockGet).toHaveBeenCalledWith("/templates/t-123");
    });
  });

  describe("create", () => {
    it("should call POST /templates with JSON data when no images", () => {
      const data = { name: "Test", content: "Hello" };
      templatesService.create(data);
      expect(mockPost).toHaveBeenCalledWith("/templates", data);
    });

    it("should call POST /templates with FormData when images present", () => {
      const data = { name: "Test", content: "Hello" };
      const images = [new File(["img"], "test.png", { type: "image/png" })];
      templatesService.create(data, images);
      expect(mockPost).toHaveBeenCalledWith(
        "/templates",
        expect.any(FormData),
        expect.objectContaining({
          headers: { "Content-Type": "multipart/form-data" },
        }),
      );
    });

    it("should not include null/undefined values in FormData", () => {
      const data = { name: "Test", content: "Hello", location: null };
      const images = [new File(["img"], "test.png", { type: "image/png" })];
      templatesService.create(data, images);
      const fd = mockPost.mock.calls[0][1];
      expect(fd.get("name")).toBe("Test");
      expect(fd.get("content")).toBe("Hello");
      expect(fd.has("location")).toBe(false);
    });

    it("should JSON-stringify array values in FormData", () => {
      const data = { name: "Test", content: "Hi", groupIds: ["g1", "g2"] };
      const images = [new File(["img"], "test.png", { type: "image/png" })];
      templatesService.create(data, images);
      const fd = mockPost.mock.calls[0][1];
      expect(fd.get("groupIds")).toBe(JSON.stringify(["g1", "g2"]));
    });
  });

  describe("update", () => {
    it("should call PUT /templates/:id with JSON data when no images", () => {
      const data = { name: "Updated" };
      templatesService.update("t-1", data);
      expect(mockPut).toHaveBeenCalledWith("/templates/t-1", data);
    });

    it("should call PUT /templates/:id with FormData when images present", () => {
      const data = { name: "Updated" };
      const images = [new File(["img"], "pic.jpg", { type: "image/jpeg" })];
      templatesService.update("t-1", data, images);
      expect(mockPut).toHaveBeenCalledWith(
        "/templates/t-1",
        expect.any(FormData),
        expect.objectContaining({
          headers: { "Content-Type": "multipart/form-data" },
        }),
      );
    });
  });

  describe("delete", () => {
    it("should call DELETE /templates/:id", () => {
      templatesService.delete("t-1");
      expect(mockDelete).toHaveBeenCalledWith("/templates/t-1");
    });
  });

  describe("markUsed", () => {
    it("should call POST /templates/:id/use", () => {
      templatesService.markUsed("t-1");
      expect(mockPost).toHaveBeenCalledWith("/templates/t-1/use");
    });
  });
});
