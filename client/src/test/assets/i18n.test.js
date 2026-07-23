import { describe, it, expect } from "vitest";
import locale, { t } from "../../assets/i18n/index.js";

describe("i18n", () => {
  describe("default export (locale object)", () => {
    it("should export Hebrew locale as default", () => {
      expect(locale).toBeDefined();
      expect(locale.appName).toBe("Possbo");
    });

    it("should have login section", () => {
      expect(locale.login).toBeDefined();
      expect(locale.login.title).toBe("Possbo");
    });

    it("should have dashboard section", () => {
      expect(locale.dashboard).toBeDefined();
      expect(locale.dashboard.title).toBeDefined();
    });

    it("should have groupsFound as a function", () => {
      expect(typeof locale.dashboard.groupsFound).toBe("function");
      expect(locale.dashboard.groupsFound(5)).toContain("5");
    });

    it("should have publish section", () => {
      expect(locale.publish).toBeDefined();
      expect(locale.publish.title).toBeDefined();
    });

    it("should have errors section", () => {
      expect(locale.errors).toBeDefined();
      expect(locale.errors.generic).toBeDefined();
    });
  });

  describe("t() function", () => {
    it("should resolve dot-notation path", () => {
      expect(t("login.title")).toBe("Possbo");
    });

    it("should return the path string when key not found", () => {
      expect(t("nonexistent.key")).toBe("nonexistent.key");
    });

    it("should handle single-level keys", () => {
      expect(t("appName")).toBe("Possbo");
    });

    it("should handle deeply nested paths", () => {
      expect(t("groupDetails.backToList")).toBeDefined();
    });

    it("should return path when intermediate key is null", () => {
      expect(t("foo.bar.baz")).toBe("foo.bar.baz");
    });
  });
});
