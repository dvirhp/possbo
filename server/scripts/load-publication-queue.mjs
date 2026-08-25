import "dotenv/config";
import crypto from "node:crypto";
import prisma from "../src/config/prisma.js";
import { Prisma } from "@prisma/client";

const jobCount = Math.min(Math.max(Number(process.env.JOB_COUNT || 5000), 1), 50000);
const userCount = Math.min(Math.max(Number(process.env.USER_COUNT || 100), 1), jobCount);
const workerCount = Math.min(Math.max(Number(process.env.WORKER_COUNT || 8), 1), 64);
const claimSize = Math.min(Math.max(Number(process.env.CLAIM_SIZE || 25), 1), 250);

if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_LOAD_TEST !== "true") {
  throw new Error("Refusing to run the queue load test in production");
}

const runId = `queue-load-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const userIds = Array.from({ length: userCount }, () => crypto.randomUUID());
const postIds = Array.from({ length: userCount }, () => crypto.randomUUID());
const claimed = new Set();
let duplicateClaims = 0;

async function seed() {
  await prisma.user.createMany({
    data: userIds.map((id, index) => ({
      id,
      email: `${runId}-${index}@example.test`,
      name: `Queue Load ${index}`,
    })),
  });
  await prisma.post.createMany({
    data: postIds.map((id, index) => ({
      id,
      userId: userIds[index],
      content: `Synthetic queue job ${runId}`,
    })),
  });

  const batchSize = 1000;
  const scheduledAt = new Date(Date.now() - 1000);
  for (let offset = 0; offset < jobCount; offset += batchSize) {
    const size = Math.min(batchSize, jobCount - offset);
    await prisma.publicationJob.createMany({
      data: Array.from({ length: size }, (_, index) => {
        const absoluteIndex = offset + index;
        return {
          postId: postIds[absoluteIndex % userCount],
          targetType: "PROFILE",
          platform: "FACEBOOK",
          scheduledAt,
          idempotencyKey: `${runId}:${absoluteIndex}`,
        };
      }),
    });
  }
}

async function claimBatch(workerId) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw(Prisma.sql`
      SELECT j.id
      FROM "publication_jobs" j
      JOIN "posts" p ON p.id = j."post_id"
      WHERE j.status = 'PENDING'::"JobStatus"
        AND j."scheduled_at" <= NOW()
        AND j."locked_at" IS NULL
        AND p.content = ${`Synthetic queue job ${runId}`}
      ORDER BY j."scheduled_at", j.id
      FOR UPDATE OF j SKIP LOCKED
      LIMIT ${claimSize}
    `);
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    await tx.publicationJob.updateMany({
      where: { id: { in: ids }, status: "PENDING", lockedAt: null },
      data: {
        status: "RUNNING",
        lockedAt: new Date(),
        lockedBy: workerId,
        startedAt: new Date(),
      },
    });
    return ids;
  });
}

async function simulatedWorker(index) {
  const workerId = `${runId}:worker:${index}`;
  let processed = 0;
  while (true) {
    const ids = await claimBatch(workerId);
    if (!ids.length) break;
    for (const id of ids) {
      if (claimed.has(id)) duplicateClaims += 1;
      claimed.add(id);
    }
    await prisma.publicationJob.updateMany({
      where: { id: { in: ids }, status: "RUNNING", lockedBy: workerId },
      data: {
        status: "SUCCESS",
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
    processed += ids.length;
  }
  return processed;
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

const startedAt = Date.now();
try {
  await seed();
  const seededAt = Date.now();
  const workerResults = await Promise.all(
    Array.from({ length: workerCount }, (_, index) => simulatedWorker(index)),
  );
  const finishedAt = Date.now();
  const remaining = await prisma.publicationJob.count({
    where: { post: { content: `Synthetic queue job ${runId}` }, status: { in: ["PENDING", "RUNNING"] } },
  });
  const processed = workerResults.reduce((sum, value) => sum + value, 0);
  const processingSeconds = Math.max((finishedAt - seededAt) / 1000, 0.001);

  console.log(JSON.stringify({
    runId,
    jobs: jobCount,
    users: userCount,
    workers: workerCount,
    claimSize,
    seedMs: seededAt - startedAt,
    processMs: finishedAt - seededAt,
    jobsPerSecond: Math.round(processed / processingSeconds),
    processed,
    uniqueClaims: claimed.size,
    duplicateClaims,
    remaining,
  }, null, 2));

  if (processed !== jobCount || claimed.size !== jobCount || duplicateClaims !== 0 || remaining !== 0) {
    process.exitCode = 1;
  }
} finally {
  await cleanup().catch((error) => {
    console.error("Queue load cleanup failed", error);
    process.exitCode = 1;
  });
  await prisma.$disconnect();
}
