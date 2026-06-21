import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { verifyAccessToken } from "./utils/jwt.js";

// Initialize environment variables
dotenv.config();

// Initialize Express and Prisma
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

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
import groupRoutes from "./routes/groups.js";
import screenshotRoutes from "./routes/screenshot.js";
import publishRoutes from "./routes/publish.js";

// Use routes
app.use("/api/auth", authRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/screenshot", screenshotRoutes);
app.use("/api/publish", publishRoutes);

// Basic route
app.get("/", (req, res) => {
  res.json({ message: "PostIt API is running", user: req.user });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
