import prisma from "../config/prisma.js";
import { addTransport } from "./logger.js";

const queue = [];
let timer;
let cleanupTimer;
let flushing = false;

function eventName(message) {
  return String(message || "event").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 100) || "event";
}

export async function flushOperationalEvents() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0, 100);
  try {
    await prisma.operationalEvent.createMany({ data: batch });
  } catch (error) {
    process.stderr.write(`[operational-events] persistence failed: ${error?.message || error}\n`);
  } finally {
    flushing = false;
    if (queue.length) globalThis.queueMicrotask(flushOperationalEvents);
  }
}

export function initializeOperationalEvents({ service = "api" } = {}) {
  addTransport((entry) => {
    if (entry.level === "debug") return;
    const meta = entry.meta || {};
    queue.push({
      level: entry.level,
      service,
      module: entry.module,
      event: String(meta.event || eventName(entry.message)),
      message: String(entry.message || "").slice(0, 500),
      requestId: meta.requestId || null,
      userId: meta.userId || null,
      traceId: meta.traceId || null,
      entityType: meta.entityType || null,
      entityId: meta.entityId || meta.jobId || meta.postId || null,
      statusCode: Number.isInteger(meta.statusCode) ? meta.statusCode : null,
      durationMs: Number.isFinite(meta.durationMs) ? Math.round(meta.durationMs) : null,
      errorCode: entry.error?.code ? String(entry.error.code).slice(0, 120) : null,
      errorStack: entry.error?.stack ? String(entry.error.stack).slice(0, 12000) : null,
      metadata: { ...meta, ...(entry.error ? { error: { name: entry.error.name, message: entry.error.message, code: entry.error.code } } : {}) },
    });
    if (queue.length >= 25) void flushOperationalEvents();
  });
  timer = setInterval(() => void flushOperationalEvents(), 2000);
  timer.unref?.();
  const retentionDays = Math.max(Number(process.env.LOG_RETENTION_DAYS || 30), 1);
  const cleanup = () => prisma.operationalEvent.deleteMany({ where: { timestamp: { lt: new Date(Date.now() - retentionDays * 86400000) } } }).catch(() => {});
  void cleanup();
  cleanupTimer = setInterval(cleanup, 6 * 60 * 60 * 1000);
  cleanupTimer.unref?.();
}

export async function stopOperationalEvents() {
  if (timer) clearInterval(timer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  timer = undefined;
  cleanupTimer = undefined;
  await flushOperationalEvents();
}
