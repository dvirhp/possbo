import { randomUUID } from "crypto";
import { createLogger } from "../utils/logger.js";

const log = createLogger("http");
const SKIP_PATHS = new Set(["/", "/favicon.ico"]);

export function attachRequestContext(req, res, next) {
  const incomingId = req.get("x-request-id");
  req.requestId = incomingId && incomingId.length <= 80 ? incomingId : randomUUID();
  req.startedAt = process.hrtime.bigint();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}

export function logRequestCompletion(req, res, next) {
  res.on("finish", () => {
    if (SKIP_PATHS.has(req.path)) return;

    const durationMs = Number(process.hrtime.bigint() - req.startedAt) / 1_000_000;
    const meta = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl?.split("?")[0] || req.path,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs),
      userId: req.user?.id || null,
      contentLength: res.getHeader("content-length") || null,
    };

    if (res.statusCode >= 500) {
      log.error("API request failed", meta);
    } else if (res.statusCode >= 400) {
      log.warn("API request rejected", meta);
    } else {
      log.info("API request completed", meta);
    }
  });
  next();
}

export function auditMutations(req, res, next) {
  res.on("finish", () => {
    if (!req.user || !["POST", "PUT", "PATCH", "DELETE"].includes(req.method) || res.statusCode >= 400 || req.path.includes("client-logs")) return;
    import("../config/prisma.js").then(({ default: prisma }) => prisma.auditLog.create({ data: {
      userId: req.user.id, action: `${req.method} ${req.originalUrl?.split("?")[0] || req.path}`,
      entityType: req.path.split("/").filter(Boolean)[1] || "api", metadata: { requestId: req.requestId, statusCode: res.statusCode }, ipAddress: req.ip,
    }})).catch(() => {});
  });
  next();
}
