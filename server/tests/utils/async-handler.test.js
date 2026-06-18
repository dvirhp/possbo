import { describe, it, expect, vi } from "vitest";
import { asyncHandler } from "../../src/utils/async-handler.js";

describe("asyncHandler", () => {
  const mockRes = () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    return res;
  };

  it("should call the handler function", async () => {
    const handler = vi.fn(async (_req, res) => res.json({ ok: true }));
    const wrapped = asyncHandler(handler);
    const req = { method: "GET", originalUrl: "/test" };
    const res = mockRes();

    await wrapped(req, res);

    expect(handler).toHaveBeenCalledWith(req, res, undefined);
  });

  it("should catch errors and return 500", async () => {
    const handler = async () => {
      throw new Error("Something broke");
    };
    const wrapped = asyncHandler(handler);
    const req = { method: "GET", originalUrl: "/test" };
    const res = mockRes();

    await wrapped(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Something broke",
    });
  });

  it("should return 428 for FACEBOOK_SESSION_REQUIRED", async () => {
    const handler = async () => {
      throw new Error("FACEBOOK_SESSION_REQUIRED");
    };
    const wrapped = asyncHandler(handler);
    const req = { method: "GET", originalUrl: "/test" };
    const res = mockRes();

    await wrapped(req, res);

    expect(res.status).toHaveBeenCalledWith(428);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "FACEBOOK_SESSION_REQUIRED",
    });
  });

  it("should pass next to the handler", async () => {
    const next = vi.fn();
    const handler = vi.fn(async (_req, _res, next) => next());
    const wrapped = asyncHandler(handler);
    const req = { method: "GET", originalUrl: "/test" };
    const res = mockRes();

    await wrapped(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
