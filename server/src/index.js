import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "./config/prisma.js";
import { verifyAccessToken } from "./utils/jwt.js";
import { startScheduler, stopScheduler } from "./jobs/index.js";
import { createLogger } from "./utils/logger.js";
import {
  generalLimiter,
  authLimiter,
  refreshLimiter,
  publishLimiter,
} from "./utils/rate-limit.js";

// Initialize environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Express
const app = express();
const PORT = process.env.PORT || 5000;
const log = createLogger("server");

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

// Import routes
import authRoutes from "./routes/auth.js";
import oauthRoutes from "./routes/oauth.js";
import groupRoutes from "./routes/groups.js";
import screenshotRoutes from "./routes/screenshot.js";
import publishRoutes from "./routes/publish.js";
import schedulerRoutes from "./routes/scheduler.js";
import templateRoutes from "./routes/templates.js";

// Use routes
app.use("/api/auth/refresh", refreshLimiter);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/oauth", authLimiter, oauthRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/screenshot", screenshotRoutes);
app.use("/api/publish", publishLimiter, publishRoutes);
app.use("/api/scheduler", schedulerRoutes);
app.use("/api/templates", templateRoutes);

// Basic route
app.get("/", (req, res) => {
  res.json({ message: "PostIt API is running", user: req.user });
});

// Error handling middleware
app.use((err, req, res, _next) => {
  log.error(`${req.method} ${req.originalUrl} unhandled error`, err);

  // Multer file size errors
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "הקובץ גדול מדי (מקסימום 50MB)" });
  }

  res.status(500).json({ error: "Internal server error" });
});

// Start server
const server = app.listen(PORT, () => {
  log.info("Server started", { port: PORT, url: `http://localhost:${PORT}` });
  startScheduler();
});

// Allow long-running requests (FB bootstrap takes up to 5 min)
server.keepAliveTimeout = 360_000; // 6 minutes
server.headersTimeout = 365_000; // must be > keepAliveTimeout

// Graceful shutdown
process.on("SIGINT", async () => {
  log.info("Shutting down gracefully...");
  stopScheduler();
  server.close(() => {
    log.info("HTTP server closed");
  });
  await prisma.$disconnect();
  process.exit(0);
});
