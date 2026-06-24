import express from "express";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { encrypt, decrypt } from "../utils/encryption.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import { createLogger } from "../utils/logger.js";

const router = express.Router();
const prisma = new PrismaClient();
const log = createLogger("auth");
const SALT_ROUNDS = 12;

const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function setRefreshCookie(res, token) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_TOKEN_MAX_AGE,
    path: "/api/auth",
  });
}

// Register with email + password + Facebook App credentials
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, gender, phone } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // Hash password (bcrypt includes salt automatically)
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name || null,
        gender: gender || null,
        phone: phone || null,
      },
    });

    // Generate JWT tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Store refresh token hash in DB
    const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshTokenHash },
    });

    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      success: true,
      accessToken,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    log.error("Registration failed", error, { email: req.body?.email });
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login with email + password
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate JWT tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Store refresh token hash in DB
    const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshTokenHash, lastLoginAt: new Date() },
    });

    setRefreshCookie(res, refreshToken);

    res.json({
      success: true,
      accessToken,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    log.error("Login failed", error, { email: req.body?.email });
    res.status(500).json({ error: "Login failed" });
  }
});

// Refresh access token using refresh token from cookie
router.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ error: "No refresh token" });
    }

    // Verify JWT signature and expiry
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    // Verify token matches what's stored in DB
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });
    if (!user || !user.refreshToken) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const tokenValid = await bcrypt.compare(token, user.refreshToken);
    if (!tokenValid) {
      // Token reuse detected - invalidate all tokens (security measure)
      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: null },
      });
      return res.status(401).json({ error: "Token reuse detected" });
    }

    // Rotate: issue new tokens
    const newAccessToken = generateAccessToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);

    const newRefreshHash = await bcrypt.hash(newRefreshToken, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshHash },
    });

    setRefreshCookie(res, newRefreshToken);

    res.json({ success: true, accessToken: newAccessToken });
  } catch (error) {
    log.error("Token refresh failed", error);
    res.status(500).json({ error: "Token refresh failed" });
  }
});

// Get current user (requires valid access token via middleware)
router.get("/me", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  res.json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    profileImage: req.user.profileImage,
    fbSessionValid: req.user.fbSessionValid || false,
  });
});

// Get decrypted Facebook credentials (internal use / for automation)
router.get("/facebook-credentials", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!req.user.facebookAppId || !req.user.facebookAppSecret) {
    return res
      .status(404)
      .json({ error: "No Facebook credentials configured" });
  }

  try {
    const appId = decrypt(req.user.facebookAppId);
    const appSecret = decrypt(req.user.facebookAppSecret);
    res.json({
      success: true,
      facebookAppId: appId,
      facebookAppSecret: appSecret,
    });
  } catch {
    res.status(500).json({ error: "Failed to decrypt credentials" });
  }
});

// Logout - invalidate refresh token
router.post("/logout", async (req, res) => {
  try {
    // Clear refresh token from DB if user is authenticated
    if (req.user) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { refreshToken: null },
      });
    }

    res.clearCookie("refreshToken", { path: "/api/auth" });
    res.json({ success: true, message: "Logged out successfully" });
  } catch {
    res.clearCookie("refreshToken", { path: "/api/auth" });
    res.json({ success: true, message: "Logged out" });
  }
});

export default router;
