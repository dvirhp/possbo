import { PrismaClient } from "@prisma/client";

/**
 * Shared Prisma client singleton.
 * Prevents multiple PrismaClient instances (which leak DB connections).
 */
const prisma = new PrismaClient();

export default prisma;
