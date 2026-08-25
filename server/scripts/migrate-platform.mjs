/**
 * One-time migration: set platform = 'FACEBOOK' for all records where platform is NULL.
 * Also sets platform = 'INSTAGRAM' for records with target_type = 'INSTAGRAM'.
 *
 * Usage: node scripts/migrate-platform.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Update PublicationHistory: Instagram by target_type
  const igHistory = await prisma.$executeRawUnsafe(
    `UPDATE "publication_history" SET "platform" = 'INSTAGRAM' WHERE "platform" IS NULL AND "target_type" = 'INSTAGRAM'`,
  );
  console.log(`PublicationHistory: ${igHistory} records set to INSTAGRAM`);

  // Update PublicationHistory: remaining nulls → FACEBOOK
  const fbHistory = await prisma.$executeRawUnsafe(
    `UPDATE "publication_history" SET "platform" = 'FACEBOOK' WHERE "platform" IS NULL`,
  );
  console.log(`PublicationHistory: ${fbHistory} records set to FACEBOOK`);

  // Update PublicationJob: Instagram by target_type
  const igJobs = await prisma.$executeRawUnsafe(
    `UPDATE "publication_jobs" SET "platform" = 'INSTAGRAM' WHERE "platform" IS NULL AND "target_type" = 'INSTAGRAM'`,
  );
  console.log(`PublicationJob: ${igJobs} records set to INSTAGRAM`);

  // Update PublicationJob: remaining nulls → FACEBOOK
  const fbJobs = await prisma.$executeRawUnsafe(
    `UPDATE "publication_jobs" SET "platform" = 'FACEBOOK' WHERE "platform" IS NULL`,
  );
  console.log(`PublicationJob: ${fbJobs} records set to FACEBOOK`);

  console.log("Done!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
