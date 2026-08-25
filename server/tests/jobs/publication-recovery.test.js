import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const update = vi.fn();
const createHistory = vi.fn();
const createNotification = vi.fn();

vi.mock("../../src/config/prisma.js", () => ({
  default: {
    publicationJob: { findMany: (...args) => findMany(...args), update: (...args) => update(...args) },
    publicationHistory: { create: (...args) => createHistory(...args) },
    notification: { create: (...args) => createNotification(...args) },
  },
}));
vi.mock("../../src/utils/notification-service.js", () => ({ dispatchPublicationNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/utils/logger.js", () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }));

const { recoverStaleJobs } = await import("../../src/jobs/publication-scheduler.js");

const staleJob = (attempts, maxAttempts = 3) => ({
  id: `job-${attempts}`,
  attempts,
  maxAttempts,
  postGroupId: "post-group-1",
  targetType: "GROUP",
  platform: "FACEBOOK",
  scheduledAt: new Date(Date.now() - 3600000),
  postGroup: {
    post: { id: "post-1", title: "Recovery test" },
    group: { id: "group-1", name: "Test group" },
    user: { id: "user-1" },
  },
});

describe("publication crash recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue({});
    createHistory.mockResolvedValue({});
  });

  it("moves an interrupted Facebook attempt to UNKNOWN to prevent a duplicate", async () => {
    findMany.mockResolvedValue([staleJob(1)]);
    await recoverStaleJobs();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job-1" },
      data: expect.objectContaining({ status: "UNKNOWN", lockedAt: null, lockedBy: null }),
    }));
    expect(createHistory).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "PUBLICATION_STATUS_UNKNOWN", userId: "user-1" }),
    }));
  });

  it("dead-letters a retry-safe interrupted job after its final attempt", async () => {
    findMany.mockResolvedValue([{ ...staleJob(3), platform: "INSTAGRAM", targetType: "INSTAGRAM" }]);
    await recoverStaleJobs();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job-3" },
      data: expect.objectContaining({ status: "DEAD", lockedAt: null, lockedBy: null }),
    }));
    expect(createHistory).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ publicationJobId: "job-3", status: "FAILED", userId: "user-1" }),
    }));
  });
});
