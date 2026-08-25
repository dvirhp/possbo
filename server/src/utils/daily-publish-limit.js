import prisma from "../config/prisma.js";
import { createLogger } from "./logger.js";

const log = createLogger("daily-publish-limit");

export const DAILY_PUBLISH_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.DAILY_PUBLISH_LIMIT || "70", 10),
);

export const DAILY_LIMIT_ERROR_CODE = "DAILY_PUBLISH_LIMIT_REACHED";
export const PUBLISH_TIMEZONE = process.env.PUBLISH_TIMEZONE || "Asia/Jerusalem";

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

function zonedMidnightUtc(year, month, day, timeZone) {
  let candidate = new Date(Date.UTC(year, month - 1, day));
  // Recalculate twice so DST transitions around the candidate are handled.
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = zonedParts(candidate, timeZone);
    const representedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    candidate = new Date(candidate.getTime() - (representedUtc - Date.UTC(year, month - 1, day)));
  }
  return candidate;
}

export function getServerDayRange(now = new Date(), timeZone = PUBLISH_TIMEZONE) {
  const parts = zonedParts(now, timeZone);
  const start = zonedMidnightUtc(parts.year, parts.month, parts.day, timeZone);
  const nextLocalNoon = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, 12));
  const nextParts = zonedParts(nextLocalNoon, timeZone);
  const end = zonedMidnightUtc(nextParts.year, nextParts.month, nextParts.day, timeZone);
  return { start, end, timeZone };
}

export async function getDailyPublishUsage(
  userId,
  now = new Date(),
  { includeQueued = false, db = prisma } = {},
) {
  const { start, end, timeZone } = getServerDayRange(now);
  const [published, queued] = await Promise.all([
    db.publicationHistory.count({
      where: { userId, status: "SUCCESS", publishedAt: { gte: start, lt: end } },
    }),
    includeQueued
      ? db.publicationJob.count({
          where: {
            status: { in: ["PENDING", "RUNNING"] },
            scheduledAt: { gte: start, lt: end },
            OR: [{ post: { userId } }, { postGroup: { userId } }],
          },
        })
      : 0,
  ]);
  const used = published + queued;
  return {
    used,
    published,
    queued,
    limit: DAILY_PUBLISH_LIMIT,
    remaining: Math.max(0, DAILY_PUBLISH_LIMIT - used),
    reached: used >= DAILY_PUBLISH_LIMIT,
    resetsAt: end,
    timeZone,
  };
}

export function createDailyLimitError(usage) {
  const error = new Error(DAILY_LIMIT_ERROR_CODE);
  error.code = DAILY_LIMIT_ERROR_CODE;
  error.dailyLimit = usage;
  return error;
}

export function dailyLimitResponse(usage) {
  return {
    success: false,
    code: DAILY_LIMIT_ERROR_CODE,
    error: `הגעת למכסת הפרסום היומית של ${usage.limit} פרסומים. פרסומים נוספים יוכלו לצאת לאחר איפוס המכסה מחר.`,
    dailyLimit: usage,
  };
}

export async function notifyDailyLimitReached(userId, usage, now = new Date()) {
  const { start, end } = getServerDayRange(now);
  const type = "DAILY_PUBLISH_LIMIT_REACHED";
  const existing = await prisma.notification.findFirst({
    where: { userId, type, createdAt: { gte: start, lt: end } },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.notification.create({
    data: {
      userId,
      type,
      title: "הגעת למכסת הפרסום היומית",
      message: `השלמת ${usage.used} מתוך ${usage.limit} פרסומים להיום. פרסומים נוספים נשמרו וימתינו לאיפוס המכסה מחר.`,
    },
  });
  log.info("Daily publication limit notification created", {
    userId,
    used: usage.used,
    limit: usage.limit,
  });
  return true;
}
