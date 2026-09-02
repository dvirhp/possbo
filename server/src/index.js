import "dotenv/config";
import { validateEnvironment } from "./config/validate-env.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "path";
import https from "https";
import fs from "fs";
import { fileURLToPath } from "url";
import prisma from "./config/prisma.js";
import { verifyAccessToken } from "./utils/jwt.js";
import { startScheduler, stopScheduler } from "./jobs/index.js";
import { createLogger } from "./utils/logger.js";
import { initializeOperationalEvents, stopOperationalEvents } from "./utils/operational-events.js";
import {
  generalLimiter,
  authLimiter,
  refreshLimiter,
  publishLimiter,
} from "./utils/rate-limit.js";
import {
  attachRequestContext,
  logRequestCompletion,
  auditMutations,
} from "./middleware/request-logging.js";
import billingWebhookRoutes from "./routes/billing-webhook.js";
import { publicObjectUrl, storageDriver } from "./services/object-storage.js";

validateEnvironment();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistDir = path.join(__dirname, "..", "..", "client", "dist");

// Initialize Express
const app = express();
const PORT = process.env.PORT || 5000;
const log = createLogger("server");
initializeOperationalEvents({ service: "api" });

// Stripe requires the exact raw bytes for signature verification. This must
// remain before express.json(), authentication and global API rate limiting.
app.use("/webhooks/billing", express.raw({ type: "application/json", limit: "256kb" }), billingWebhookRoutes);

// Hosting platforms terminate TLS at a reverse proxy. This keeps req.ip,
// rate-limiting and secure-cookie detection correct behind one trusted hop.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  }),
);

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(attachRequestContext);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// Global rate limiter
app.use("/api/", generalLimiter);

// Serve uploaded files (cross-origin allowed for client on different port)
app.use(
  "/uploads",
  (_req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "..", "uploads")),
);
app.get("/uploads/*", async (req, res, next) => {
  if (storageDriver() !== "s3") return next();
  try {
    res.redirect(302, await publicObjectUrl(req.params[0]));
  } catch (error) {
    log.warn("Could not resolve object-storage media", { key: req.params[0], error: error.message });
    res.status(404).json({ error: "Media not found" });
  }
});

// JWT-based user loader - extracts user from Authorization header
app.use(async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });
      if (user) {
        req.user = user;
      }
    } catch {
      // Invalid/expired token - continue without user
    }
  }
  next();
});
app.use(logRequestCompletion);
app.use(auditMutations);

// Import routes
import authRoutes from "./routes/auth.js";
import oauthRoutes from "./routes/oauth.js";
import groupRoutes from "./routes/groups.js";
import screenshotRoutes from "./routes/screenshot.js";
import publishRoutes from "./routes/publish.js";
import schedulerRoutes from "./routes/scheduler.js";
import templateRoutes from "./routes/templates.js";
import subscriptionRoutes from "./routes/subscription.js";
import aiRoutes from "./routes/ai.js";
import feedbackRoutes from "./routes/feedback.js";
import contactRoutes from "./routes/contact.js";
import clientLogRoutes from "./routes/client-logs.js";
import instagramRoutes from "./routes/instagram.js";
import whatsappRoutes from "./routes/whatsapp.js";
import whatsappBotRoutes from "./routes/whatsapp-bot.js";
import operationsRoutes from "./routes/operations.js";
import importRoutes from "./routes/imports.js";
import pushRoutes from "./routes/push.js";
import {
  restoreWhatsAppSessions,
  closeAllWhatsAppSessions,
} from "./routes/whatsapp.js";

// Use routes
app.use("/api/auth/refresh", refreshLimiter);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/oauth", authLimiter, oauthRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/screenshot", screenshotRoutes);
app.use("/api/publish", publishLimiter, publishRoutes);
app.use("/api/scheduler", schedulerRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/client-logs", clientLogRoutes);
app.use("/api/instagram", instagramRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/operations", operationsRoutes);
app.use("/api/imports", importRoutes);
app.use("/api/push", pushRoutes);
app.use("/webhooks/whatsapp", whatsappBotRoutes);

// Public, token-protected WhatsApp target selector UI.
app.use("/assets", express.static(path.join(clientDistDir, "assets")));
app.get("/bot-targets/:token", (_req, res, next) => {
  const indexFile = path.join(clientDistDir, "index.html");
  if (!fs.existsSync(indexFile)) return next();
  res.sendFile(indexFile);
});

// Liveness does not depend on external services and is safe for process probes.
app.get("/health/live", (_req, res) => {
  res.json({ status: "ok" });
});

// Readiness verifies the dependency required by every authenticated workflow.
app.get("/health/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready" });
  } catch (error) {
    log.error("Readiness check failed", error);
    res.status(503).json({ status: "not_ready" });
  }
});

// Minimal unauthenticated signal intended for an infrastructure autoscaler.
app.get("/health/scaling", async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw`SELECT COUNT(*)::int AS scheduled_queue_depth, COUNT(*) FILTER (WHERE scheduled_at <= NOW())::int AS due_queue_depth, COALESCE(EXTRACT(EPOCH FROM (NOW() - (MIN(scheduled_at) FILTER (WHERE scheduled_at <= NOW())))), 0)::float AS oldest_due_seconds FROM publication_jobs WHERE status = 'PENDING'`;
    res.json(rows[0] || { scheduled_queue_depth: 0, due_queue_depth: 0, oldest_due_seconds: 0 });
  } catch {
    res.status(503).json({ error: "metrics_unavailable" });
  }
});

// Serve the production client from the same origin as the API. Static assets
// are resolved first; client-side routes then fall back to React's index.html.
// Unknown API/webhook paths must remain real 404s instead of returning HTML.
app.use(express.static(clientDistDir));
app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/webhooks/") ||
    req.path.startsWith("/uploads/") ||
    req.path.startsWith("/health/")
  ) {
    return next();
  }
  const indexFile = path.join(clientDistDir, "index.html");
  if (!fs.existsSync(indexFile)) return next();
  res.sendFile(indexFile);
});

// Error handling middleware
app.use((err, req, res, _next) => {
  log.error(`${req.method} ${req.originalUrl} unhandled error`, err, { event: "unhandled_request_error", requestId: req.requestId, userId: req.user?.id || null, method: req.method, path: req.originalUrl?.split("?")[0] });

  // Multer file size errors
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "הקובץ גדול מדי (מקסימום 50MB)" });
  }

  res.status(500).json({ error: "Internal server error" });
});

// Start server
const server = app.listen(PORT, () => {
  log.info("Server started", { port: PORT, url: `http://localhost:${PORT}` });
  if (process.env.RUN_SCHEDULER !== "false") {
    startScheduler();
  } else {
    log.info("Background scheduler disabled for this process");
  }
  restoreWhatsAppSessions().catch((err) =>
    log.error("Failed to restore WhatsApp sessions", { error: err.message }),
  );
});

// Start HTTPS server for Instagram OAuth callback
try {
  const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
  const certPath = path.join(__dirname2, "..", "certs", "cert.pem");
  const keyPath = path.join(__dirname2, "..", "certs", "key.pem");
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const httpsServer = https.createServer(
      {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      },
      app,
    );
    const HTTPS_PORT = 8443;
    httpsServer.listen(HTTPS_PORT, () => {
      log.info("HTTPS server started", {
        port: HTTPS_PORT,
        url: `https://localhost:${HTTPS_PORT}`,
      });
    });
  }
} catch (err) {
  log.warn("HTTPS server not started (no certs)", err.message);
}

// Allow long-running requests (FB bootstrap takes up to 5 min)
server.keepAliveTimeout = 360_000; // 6 minutes
server.headersTimeout = 365_000; // must be > keepAliveTimeout

// Graceful shutdown
async function gracefulShutdown(signal) {
  log.info(`${signal} received, shutting down gracefully...`);
  stopScheduler();
  await closeAllWhatsAppSessions();
  await stopOperationalEvents();
  server.close(() => {
    log.info("HTTP server closed");
  });
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
