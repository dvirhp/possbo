/**
 * Shared authentication service — token issuance, cookie management,
 * and user response formatting.
 *
 * Extracted from auth.js + oauth.js to eliminate duplication and ensure
 * consistent security behaviour across all auth flows.
 */
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import prisma from "../config/prisma.js";
import { generateAccessToken, generateRefreshToken } from "./jwt.js";

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function validImageUrl(value) {
  if (!value) return null;
  if (!value.startsWith("/uploads/")) return value;
  const localPath = path.join(process.cwd(), value.replace(/^\/+/, ""));
  return fs.existsSync(localPath) ? value : null;
}

/**
 * Set the refresh-token cookie with secure defaults.
 * Detects HTTPS via req.protocol so the same code works in dev and prod.
 */
export function setRefreshCookie(res, token, req) {
  const isSecure =
    process.env.NODE_ENV === "production" || req?.protocol === "https";
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? "none" : "lax",
    maxAge: REFRESH_TOKEN_MAX_AGE,
    path: "/api/auth",
  });
}

/**
 * Canonical user-response shape.
 * Every auth endpoint should return this structure to keep the frontend simple.
 */
export function formatUserResponse(user, extras = {}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    profileImage: validImageUrl(user.profileImage),
    avatarUrl: validImageUrl(user.avatarUrl),
    fbSessionValid: user.fbSessionValid || false,
    whatsappNumber: user.whatsappNumber || null,
    whatsappMessage: user.whatsappMessage || null,
    whatsappSessionConnected: user.whatsappSessionConnected || false,
    whatsappSessionPhone: user.whatsappSessionPhone || null,
    notificationSettings: user.notificationSettings || null,
    createdAt: user.createdAt,
    ...extras,
  };
}

/**
 * Issue access + refresh tokens, persist hashed refresh in DB,
 * set the httpOnly cookie, and return the canonical response payload.
 *
 * Options:
 *  - includeSubscription {boolean} — look up active subscription
 *  - includeInstagram    {boolean} — look up connected Instagram account
 *  - extraUserFields     {object}  — extra fields merged into user response
 */
export async function issueTokens(res, user, req, opts = {}) {
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);
  const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: refreshTokenHash, lastLoginAt: new Date() },
  });

  setRefreshCookie(res, refreshToken, req);

  // Build extra fields from DB lookups
  const extras = { ...opts.extraUserFields };

  if (opts.includeSubscription) {
    const sub = await prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ["ACTIVE", "CANCELLED"] } },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });
    extras.subscription = sub
      ? { status: sub.status, planName: sub.plan?.name, endsAt: sub.endsAt }
      : null;
  }

  if (opts.includeInstagram) {
    const ig = await prisma.connectedAccount.findFirst({
      where: { userId: user.id, provider: "INSTAGRAM", status: "ACTIVE" },
      select: { providerUserName: true },
    });
    extras.instagramConnected = !!ig;
    extras.instagramUsername = ig?.providerUserName || null;
  }

  return {
    success: true,
    accessToken,
    user: formatUserResponse(user, extras),
  };
}

/**
 * Normalize an email address: trim whitespace and lowercase.
 */
export function normalizeEmail(email) {
  return email?.trim().toLowerCase() || "";
}
