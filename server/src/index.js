import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

// Initialize environment variables
dotenv.config();

// Initialize Express and Prisma
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  }),
);

if (!process.env.SESSION_SECRET) {
  console.warn(
    "WARNING: SESSION_SECRET is not set. Sessions will not work correctly.",
  );
}

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

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
