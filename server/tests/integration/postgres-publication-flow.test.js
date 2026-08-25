import { afterAll, describe, expect, it } from "vitest";
import prisma from "../../src/config/prisma.js";
import { queueImmediateFacebookPublication } from "../../src/utils/immediate-publication.js";

const runWithPostgres = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const createdUserIds = [];

runWithPostgres("PostgreSQL publication flow", () => {
  afterAll(async () => {
    if (createdUserIds.length) {
      await prisma.publicationHistory.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("persists a campaign, atomically claims its job, and enforces idempotency", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const user = await prisma.user.create({ data: { email: `e2e-${suffix}@example.test`, name: "E2E User" } });
    createdUserIds.push(user.id);

    const post = await prisma.post.create({
      data: { userId: user.id, title: "Integration campaign", content: "Real PostgreSQL flow" },
    });
    const scheduledAt = new Date(Date.now() - 1000);
    const idempotencyKey = `e2e-${suffix}`;
    const job = await prisma.publicationJob.create({
      data: { postId: post.id, targetType: "PROFILE", platform: "FACEBOOK", scheduledAt, idempotencyKey },
    });

    const claimed = await prisma.$transaction(async (tx) => {
      const updated = await tx.publicationJob.updateMany({
        where: { id: job.id, status: "PENDING", lockedAt: null },
        data: { status: "RUNNING", lockedAt: new Date(), lockedBy: "integration-worker" },
      });
      expect(updated.count).toBe(1);
      return tx.publicationJob.findUnique({ where: { id: job.id } });
    });

    expect(claimed).toMatchObject({ status: "RUNNING", lockedBy: "integration-worker", attempts: 0 });
    await expect(prisma.publicationJob.create({
      data: { postId: post.id, targetType: "PROFILE", platform: "FACEBOOK", scheduledAt, idempotencyKey },
    })).rejects.toMatchObject({ code: "P2002" });
  });

  it("serializes concurrent quota reservations at the 70 publication boundary", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const user = await prisma.user.create({
      data: { email: `quota-${suffix}@example.test`, name: "Quota User" },
    });
    createdUserIds.push(user.id);
    const sourcePost = await prisma.post.create({
      data: { userId: user.id, content: "Published quota fixture" },
    });
    const now = new Date();
    await prisma.publicationHistory.createMany({
      data: Array.from({ length: 69 }, (_, index) => ({
        postId: sourcePost.id,
        userId: user.id,
        targetType: "PROFILE",
        platform: "FACEBOOK",
        publishedAt: new Date(now.getTime() - index * 1000),
        status: "SUCCESS",
      })),
    });

    const results = await Promise.allSettled([
      queueImmediateFacebookPublication({
        userId: user.id,
        targetType: "PROFILE",
        text: "Reservation A",
        idempotencyKey: `quota-a-${suffix}`,
      }),
      queueImmediateFacebookPublication({
        userId: user.id,
        targetType: "PROFILE",
        text: "Reservation B",
        idempotencyKey: `quota-b-${suffix}`,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({
      code: "DAILY_PUBLISH_LIMIT_REACHED",
    });
    expect(await prisma.publicationJob.count({
      where: {
        OR: [{ post: { userId: user.id } }, { postGroup: { userId: user.id } }],
        status: { in: ["PENDING", "RUNNING"] },
      },
    })).toBe(1);
  });
});
