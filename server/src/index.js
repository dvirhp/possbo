import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { verifyAccessToken } from "./utils/jwt.js";
import { startScheduler, stopScheduler } from "./jobs/index.js";
import { createLogger } from "./utils/logger.js";

// Initialize environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Express and Prisma
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;
const log = createLogger("server");

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

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
app.use("/api/auth", authRoutes);
app.use("/api/oauth", oauthRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/screenshot", screenshotRoutes);
app.use("/api/publish", publishRoutes);
app.use("/api/scheduler", schedulerRoutes);
app.use("/api/templates", templateRoutes);

// Basic route
app.get("/", (req, res) => {
  res.json({ message: "PostIt API is running", user: req.user });
});

// Error handling middleware
app.use((err, req, res, next) => {
  log.error(`${req.method} ${req.originalUrl} unhandled error`, err);
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
  stopScheduler();
  await prisma.$disconnect();
  process.exit(0);
});
