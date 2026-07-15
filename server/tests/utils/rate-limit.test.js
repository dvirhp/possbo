import { describe, it, expect } from "vitest";
import {
  generalLimiter,
  authLimiter,
  publishLimiter,
} from "../../src/utils/rate-limit.js";

describe("rate-limit", () => {
  it("should export generalLimiter as middleware function", () => {
    expect(typeof generalLimiter).toBe("function");
  });

  it("should export authLimiter as middleware function", () => {
    expect(typeof authLimiter).toBe("function");
  });

  it("should export publishLimiter as middleware function", () => {
    expect(typeof publishLimiter).toBe("function");
  });
});
