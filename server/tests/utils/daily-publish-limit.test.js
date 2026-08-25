import { beforeEach, describe, expect, it, vi } from "vitest";

const { historyCount, jobCount, notificationFindFirst, notificationCreate } =
  vi.hoisted(() => ({
    historyCount: vi.fn(),
    jobCount: vi.fn(),
    notificationFindFirst: vi.fn(),
    notificationCreate: vi.fn(),
  }));

vi.mock("../../src/config/prisma.js", () => ({
  default: {
    publicationHistory: { count: historyCount },
    publicationJob: { count: jobCount },
    notification: {
      findFirst: notificationFindFirst,
      create: notificationCreate,
    },
  },
}));

describe("daily publication limit", () => {
  beforeEach(() => {
    historyCount.mockReset();
    jobCount.mockReset().mockResolvedValue(0);
    notificationFindFirst.mockReset().mockResolvedValue(null);
    notificationCreate.mockReset().mockResolvedValue({ id: "notification-1" });
  });

  it("uses the configured Jerusalem calendar day instead of server UTC", async () => {
    const { getServerDayRange } = await import(
      "../../src/utils/daily-publish-limit.js"
    );
    const range = getServerDayRange(
      new Date("2026-08-25T12:00:00.000Z"),
      "Asia/Jerusalem",
    );
    expect(range.start.toISOString()).toBe("2026-08-24T21:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-08-25T21:00:00.000Z");
  });

  it("reserves daily capacity for queued and running jobs", async () => {
    historyCount.mockResolvedValue(65);
    jobCount.mockResolvedValue(5);
    const { getDailyPublishUsage } = await import(
      "../../src/utils/daily-publish-limit.js"
    );

    const usage = await getDailyPublishUsage(
      "user-1",
      new Date("2026-08-25T12:00:00.000Z"),
      { includeQueued: true },
    );

    expect(usage).toMatchObject({
      used: 70,
      published: 65,
      queued: 5,
      remaining: 0,
      reached: true,
    });
    expect(jobCount).toHaveBeenCalledOnce();
  });

  it("reports a hard limit of 70 by default", async () => {
    historyCount.mockResolvedValue(70);
    const { getDailyPublishUsage } = await import(
      "../../src/utils/daily-publish-limit.js"
    );

    const usage = await getDailyPublishUsage(
      "user-1",
      new Date("2026-08-25T12:00:00.000Z"),
    );

    expect(usage).toMatchObject({
      used: 70,
      limit: 70,
      remaining: 0,
      reached: true,
    });
    expect(historyCount).toHaveBeenCalledWith({
      where: expect.objectContaining({ userId: "user-1", status: "SUCCESS" }),
    });
  });

  it("creates at most one in-app limit alert per day", async () => {
    const { notifyDailyLimitReached } = await import(
      "../../src/utils/daily-publish-limit.js"
    );
    const usage = { used: 70, limit: 70 };

    await expect(
      notifyDailyLimitReached(
        "user-1",
        usage,
        new Date("2026-08-25T12:00:00.000Z"),
      ),
    ).resolves.toBe(true);
    expect(notificationCreate).toHaveBeenCalledOnce();

    notificationFindFirst.mockResolvedValue({ id: "notification-1" });
    await expect(
      notifyDailyLimitReached(
        "user-1",
        usage,
        new Date("2026-08-25T13:00:00.000Z"),
      ),
    ).resolves.toBe(false);
    expect(notificationCreate).toHaveBeenCalledOnce();
  });
});
