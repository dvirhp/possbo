import "dotenv/config";
import prisma from "../src/config/prisma.js";

const count = Math.min(Math.max(Number(process.env.JOB_COUNT || 5000), 1), 50000);
const sourceId = process.env.SOURCE_JOB_ID;
if (!sourceId) throw new Error("SOURCE_JOB_ID is required");
if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_LOAD_SEED !== "true") {
  throw new Error("Refusing to seed production without ALLOW_PRODUCTION_LOAD_SEED=true");
}
const source = await prisma.publicationJob.findUnique({ where: { id: sourceId } });
if (!source) throw new Error("Source job not found");

const batchSize = 500;
for (let offset = 0; offset < count; offset += batchSize) {
  const size = Math.min(batchSize, count - offset);
  await prisma.publicationJob.createMany({ data: Array.from({ length: size }, (_, index) => ({
    postGroupId: source.postGroupId,
    postId: source.postId,
    targetType: source.targetType,
    platform: source.platform,
    igPublishType: source.igPublishType,
    scheduledAt: new Date(Date.now() + 86400000),
    idempotencyKey: `load:${Date.now()}:${offset + index}`,
  })) });
  process.stdout.write(`\rSeeded ${Math.min(offset + size, count)}/${count}`);
}
process.stdout.write("\n");
await prisma.$disconnect();
