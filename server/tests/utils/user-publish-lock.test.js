import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw, updateMany, deleteMany } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("../../src/config/prisma.js", () => ({
  default: {
    $queryRaw: queryRaw,
    userPublishLock: { updateMany, deleteMany },
  },
}));

describe("user publish lock", () => {
  beforeEach(() => {
    queryRaw.mockReset();
    updateMany.mockReset().mockResolvedValue({ count: 1 });
    deleteMany.mockReset().mockResolvedValue({ count: 1 });
  });

  it("runs the callback and releases an acquired lock", async () => {
    queryRaw.mockResolvedValue([{ owner_token: "owner-1" }]);
    const { withUserPublishLock } =
      await import("../../src/utils/user-publish-lock.js");

    const callback = vi.fn().mockResolvedValue("published");
    const result = await withUserPublishLock("user-1", callback, {
      ownerToken: "owner-1",
      leaseMs: 60_000,
    });

    expect(result).toEqual({ acquired: true, value: "published" });
    expect(callback).toHaveBeenCalledOnce();
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", ownerToken: "owner-1" },
    });
  });

  it("does not run the callback when another worker owns the lock", async () => {
    queryRaw.mockResolvedValue([]);
    const { withUserPublishLock } =
      await import("../../src/utils/user-publish-lock.js");

    const callback = vi.fn();
    const result = await withUserPublishLock("user-1", callback, {
      ownerToken: "owner-2",
    });

    expect(result).toEqual({ acquired: false });
    expect(callback).not.toHaveBeenCalled();
  });
});
