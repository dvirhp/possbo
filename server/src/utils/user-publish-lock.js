import crypto from "crypto";
import prisma from "../config/prisma.js";
import { createLogger } from "./logger.js";

const log = createLogger("user-publish-lock");
const DEFAULT_LEASE_MS = Math.max(
  60_000,
  Number.parseInt(process.env.USER_PUBLISH_LOCK_LEASE_MS || "300000", 10),
);
const DEFAULT_HEARTBEAT_MS = Math.max(
  10_000,
  Number.parseInt(process.env.USER_PUBLISH_LOCK_HEARTBEAT_MS || "30000", 10),
);

export async function acquireUserPublishLock(
  userId,
  { ownerToken = crypto.randomUUID(), leaseMs = DEFAULT_LEASE_MS } = {},
) {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + leaseMs);

  const rows = await prisma.$queryRaw`
    INSERT INTO "user_publish_locks"
      ("user_id", "owner_token", "locked_until", "heartbeat_at", "created_at", "updated_at")
    VALUES
      (${userId}, ${ownerToken}, ${lockedUntil}, ${now}, ${now}, ${now})
    ON CONFLICT ("user_id") DO UPDATE SET
      "owner_token" = EXCLUDED."owner_token",
      "locked_until" = EXCLUDED."locked_until",
      "heartbeat_at" = EXCLUDED."heartbeat_at",
      "updated_at" = EXCLUDED."updated_at"
    WHERE "user_publish_locks"."locked_until" <= ${now}
    RETURNING "owner_token"
  `;

  return {
    acquired: rows.length === 1 && rows[0].owner_token === ownerToken,
    ownerToken,
    lockedUntil,
  };
}

export async function refreshUserPublishLock(
  userId,
  ownerToken,
  leaseMs = DEFAULT_LEASE_MS,
) {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + leaseMs);
  const result = await prisma.userPublishLock.updateMany({
    where: { userId, ownerToken },
    data: { heartbeatAt: now, lockedUntil },
  });
  return result.count === 1;
}

export async function releaseUserPublishLock(userId, ownerToken) {
  const result = await prisma.userPublishLock.deleteMany({
    where: { userId, ownerToken },
  });
  return result.count === 1;
}

export async function withUserPublishLock(
  userId,
  callback,
  { ownerToken = crypto.randomUUID(), leaseMs = DEFAULT_LEASE_MS } = {},
) {
  const lock = await acquireUserPublishLock(userId, { ownerToken, leaseMs });
  if (!lock.acquired) return { acquired: false };

  let heartbeatLost = false;
  const heartbeat = async () => {
    const refreshed = await refreshUserPublishLock(
      userId,
      ownerToken,
      leaseMs,
    );
    if (!refreshed) heartbeatLost = true;
    return refreshed;
  };
  const timer = setInterval(() => {
    heartbeat().catch((error) => {
      heartbeatLost = true;
      log.error("Publish lock heartbeat failed", error, { userId });
    });
  }, Math.min(DEFAULT_HEARTBEAT_MS, Math.floor(leaseMs / 3)));
  timer.unref?.();

  try {
    const value = await callback({ heartbeat, ownerToken });
    if (heartbeatLost) {
      throw new Error("USER_PUBLISH_LOCK_LOST");
    }
    return { acquired: true, value };
  } finally {
    clearInterval(timer);
    await releaseUserPublishLock(userId, ownerToken).catch((error) => {
      log.error("Failed to release publish lock", error, { userId });
    });
  }
}

export { DEFAULT_LEASE_MS, DEFAULT_HEARTBEAT_MS };
