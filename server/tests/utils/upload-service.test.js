import { describe, it, expect } from "vitest";
import path from "path";
import { fileURLToPath } from "url";

const { uploadImages, uploadSingle, uploadFields, uploadsDir } =
  await import("../../src/utils/upload-service.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("upload-service", () => {
  describe("uploadsDir", () => {
    it("should point to the uploads folder at server root", () => {
      expect(uploadsDir).toContain("uploads");
      expect(path.isAbsolute(uploadsDir)).toBe(true);
    });
  });

  describe("uploadImages", () => {
    it("should return a middleware function", () => {
      const middleware = uploadImages();
      expect(typeof middleware).toBe("function");
    });

    it("should return a middleware with category subdirectory", () => {
      const middleware = uploadImages("templates");
      expect(typeof middleware).toBe("function");
    });
  });

  describe("uploadSingle", () => {
    it("should return a middleware function", () => {
      const middleware = uploadSingle("", "image");
      expect(typeof middleware).toBe("function");
    });
  });

  describe("uploadFields", () => {
    it("should return a middleware function for multi-field uploads", () => {
      const middleware = uploadFields("", [
        { name: "images", maxCount: 10 },
        { name: "igMedia_FEED", maxCount: 5 },
      ]);
      expect(typeof middleware).toBe("function");
    });
  });
});
