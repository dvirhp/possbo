import express from "express";
import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAdmin } from "../utils/auth-middleware.js";
import { getBrowserResourceStats } from "../utils/browser-factory.js";

const router = express.Router();
router.use(requireAdmin);

const percent = (part, total) => total ? Math.round((part / total) * 1000) / 10 : 0;
const change = (current, previous) => previous ? Math.round(((current - previous) / previous) * 1000) / 10 : current ? 100 : 0;

router.get("/health-metrics", asyncHandler(async (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 168);
  const since = new Date(Date.now() - hours * 3600000);
  const [latencyRows, queueRows, platforms, statuses, heartbeat] = await Promise.all([
    prisma.$queryRaw`SELECT COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::float AS p95, COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms), 0)::float AS p99 FROM operational_events WHERE module = 'http' AND duration_ms IS NOT NULL AND timestamp >= ${since}`,
    prisma.$queryRaw`SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS scheduled_pending, COUNT(*) FILTER (WHERE status = 'PENDING' AND scheduled_at <= NOW())::int AS due_pending, COALESCE(EXTRACT(EPOCH FROM (NOW() - (MIN(scheduled_at) FILTER (WHERE status = 'PENDING' AND scheduled_at <= NOW())))), 0)::float AS oldest_due_seconds, COALESCE(AVG(EXTRACT(EPOCH FROM (started_at - scheduled_at))) FILTER (WHERE started_at IS NOT NULL), 0)::float AS avg_wait_seconds, COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (started_at - scheduled_at))) FILTER (WHERE started_at IS NOT NULL), 0)::float AS p95_wait_seconds FROM publication_jobs WHERE created_at >= ${since}`,
    prisma.publicationHistory.groupBy({ by: ["platform", "status"], where: { publishedAt: { gte: since } }, _count: { _all: true } }),
    prisma.publicationJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.operationalEvent.findFirst({ where: { event: "worker_heartbeat" }, orderBy: { timestamp: "desc" } }),
  ]);
  const byPlatform = Object.values(platforms.reduce((acc, row) => {
    const item = acc[row.platform] ||= { platform: row.platform, total: 0, success: 0, failed: 0 };
    item.total += row._count._all;
    if (row.status === "SUCCESS") item.success += row._count._all;
    if (row.status === "FAILED") item.failed += row._count._all;
    return acc;
  }, {})).map((item) => ({ ...item, successRate: percent(item.success, item.total) }));
  const heartbeatAgeSeconds = heartbeat ? Math.round((Date.now() - heartbeat.timestamp.getTime()) / 1000) : null;
  res.json({ windowHours: hours, http: { p95Ms: Math.round(latencyRows[0]?.p95 || 0), p99Ms: Math.round(latencyRows[0]?.p99 || 0) }, queue: queueRows[0] || {}, jobs: statuses, platforms: byPlatform, worker: { healthy: heartbeatAgeSeconds != null && heartbeatAgeSeconds < 180, heartbeatAgeSeconds }, chromium: getBrowserResourceStats(), process: { rssMb: Math.round(process.memoryUsage().rss / 1048576), cpu: process.cpuUsage() } });
}));

router.get("/insights", asyncHandler(async (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 720);
  const now = new Date();
  const since = new Date(now.getTime() - hours * 3600000);
  const previousSince = new Date(since.getTime() - hours * 3600000);
  const currentWindow = { gte: since, lt: now };
  const previousWindow = { gte: previousSince, lt: since };
  const [requests, previousRequests, errors, previousErrors, affectedUsers, durations, publications, previousPublications, platformRows, failedPublications, jobRows, connectedRows, whatsappConnected, totalUsers, activeUsers, newUsers, posts, postCreators, aiEvents, aiFailures] = await Promise.all([
    prisma.operationalEvent.count({ where: { module: "http", timestamp: currentWindow } }),
    prisma.operationalEvent.count({ where: { module: "http", timestamp: previousWindow } }),
    prisma.operationalEvent.count({ where: { module: "http", level: "error", timestamp: currentWindow } }),
    prisma.operationalEvent.count({ where: { module: "http", level: "error", timestamp: previousWindow } }),
    prisma.operationalEvent.groupBy({ by: ["userId"], where: { level: "error", userId: { not: null }, timestamp: currentWindow } }),
    prisma.operationalEvent.aggregate({ where: { module: "http", timestamp: currentWindow, durationMs: { not: null } }, _avg: { durationMs: true }, _max: { durationMs: true } }),
    prisma.publicationHistory.groupBy({ by: ["status"], where: { publishedAt: currentWindow }, _count: { _all: true } }),
    prisma.publicationHistory.groupBy({ by: ["status"], where: { publishedAt: previousWindow }, _count: { _all: true } }),
    prisma.publicationHistory.groupBy({ by: ["platform", "status"], where: { publishedAt: currentWindow }, _count: { _all: true } }),
    prisma.publicationHistory.findMany({ where: { status: "FAILED", publishedAt: currentWindow }, select: { id: true, platform: true, errorMessage: true, publishedAt: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { publishedAt: "desc" }, take: 8 }),
    prisma.publicationJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.connectedAccount.groupBy({ by: ["provider", "status"], _count: { _all: true } }),
    prisma.user.count({ where: { whatsappSessionConnected: true, deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, lastLoginAt: currentWindow } }),
    prisma.user.count({ where: { deletedAt: null, createdAt: currentWindow } }),
    prisma.post.count({ where: { createdAt: currentWindow } }),
    prisma.post.groupBy({ by: ["userId"], where: { createdAt: currentWindow } }),
    prisma.operationalEvent.findMany({ where: { module: "ai", event: "ai_generation_completed", timestamp: currentWindow }, select: { userId: true, durationMs: true, metadata: true } }),
    prisma.operationalEvent.count({ where: { module: "ai", level: "error", timestamp: currentWindow } }),
  ]);
  const statusCount = (rows, status) => rows.find(row => row.status === status)?._count?._all || 0;
  const publicationTotal = publications.reduce((sum, row) => sum + row._count._all, 0);
  const previousPublicationTotal = previousPublications.reduce((sum, row) => sum + row._count._all, 0);
  const publicationSuccess = statusCount(publications, "SUCCESS");
  const previousPublicationSuccess = statusCount(previousPublications, "SUCCESS");
  const aiUsers = new Set(aiEvents.map(event => event.userId).filter(Boolean)).size;
  const aiTokens = aiEvents.reduce((sum, event) => sum + Number(event.metadata?.totalTokens || 0), 0);
  res.json({ hours, system: { requests, requestChange: change(requests, previousRequests), errors, errorChange: change(errors, previousErrors), affectedUsers: affectedUsers.length, errorRate: percent(errors, requests), avgLatencyMs: Math.round(durations._avg.durationMs || 0), maxLatencyMs: durations._max.durationMs || 0 }, publishing: { total: publicationTotal, totalChange: change(publicationTotal, previousPublicationTotal), success: publicationSuccess, failed: statusCount(publications, "FAILED"), successRate: percent(publicationSuccess, publicationTotal), successRateChange: Math.round((percent(publicationSuccess, publicationTotal) - percent(previousPublicationSuccess, previousPublicationTotal)) * 10) / 10, byPlatform: platformRows, jobs: jobRows, recentFailures: failedPublications }, integrations: { accounts: connectedRows, whatsappConnected }, business: { totalUsers, activeUsers, newUsers, postsCreated: posts, creators: postCreators.length }, ai: { requests: aiEvents.length, users: aiUsers, failures: aiFailures, successRate: percent(aiEvents.length, aiEvents.length + aiFailures), totalTokens: aiTokens, avgLatencyMs: aiEvents.length ? Math.round(aiEvents.reduce((sum, event) => sum + (event.durationMs || 0), 0) / aiEvents.length) : 0 } });
}));

router.get("/summary", asyncHandler(async (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 720);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const where = { timestamp: { gte: since } };
  const [total, levels, modules, recentErrors, slowRequests, jobStatuses, heartbeat] = await Promise.all([
    prisma.operationalEvent.count({ where }),
    prisma.operationalEvent.groupBy({ by: ["level"], where, _count: { _all: true } }),
    prisma.operationalEvent.groupBy({ by: ["module"], where, _count: { _all: true }, orderBy: { _count: { module: "desc" } }, take: 10 }),
    prisma.operationalEvent.findMany({ where: { ...where, level: "error" }, orderBy: { timestamp: "desc" }, take: 10 }),
    prisma.operationalEvent.findMany({ where: { ...where, durationMs: { not: null } }, orderBy: { durationMs: "desc" }, take: 10 }),
    prisma.publicationJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.operationalEvent.findFirst({ where: { event: "worker_heartbeat" }, orderBy: { timestamp: "desc" } }),
  ]);
  const heartbeatAgeMs = heartbeat ? Date.now() - heartbeat.timestamp.getTime() : null;
  res.json({ total, hours, levels, modules, recentErrors, slowRequests, jobStatuses, heartbeat, workerHealthy: heartbeatAgeMs != null && heartbeatAgeMs < 180000 });
}));

router.get("/events", asyncHandler(async (req, res) => {
  const take = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const cursor = req.query.cursor || undefined;
  const where = {};
  if (["info", "warn", "error"].includes(req.query.level)) where.level = req.query.level;
  if (req.query.module) where.module = String(req.query.module).slice(0, 80);
  if (req.query.requestId) where.requestId = String(req.query.requestId).slice(0, 100);
  if (req.query.search) where.OR = ["message", "event", "module"].map(field => ({ [field]: { contains: String(req.query.search).slice(0, 100), mode: "insensitive" } }));
  const events = await prisma.operationalEvent.findMany({ where, orderBy: [{ timestamp: "desc" }, { id: "desc" }], take: take + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
  const hasMore = events.length > take;
  if (hasMore) events.pop();
  const userIds = [...new Set(events.map(item => item.userId).filter(Boolean))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } }) : [];
  const usersById = new Map(users.map(user => [user.id, user]));
  res.json({ events: events.map(item => ({ ...item, user: item.userId ? usersById.get(item.userId) || null : null })), nextCursor: hasMore ? events.at(-1)?.id : null });
}));

export default router;
