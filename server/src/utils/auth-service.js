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
import { fileURLToPath } from "url";
import prisma from "../config/prisma.js";
import { generateAccessToken, generateRefreshToken } from "./jwt.js";

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");

function validImageUrl(value) {
  if (!value) return null;
  if (!value.startsWith("/uploads/")) return value;
  const localPath = path.join(uploadsDir, value.replace(/^\/uploads\/+/, ""));
  return fs.existsSync(localPath) ? value : null;
}

function findLatestUploadedAvatar(userId) {
  if (!userId || !fs.existsSync(uploadsDir)) return null;
  const prefix = `avatar-${userId}-`;
  const latest = fs
    .readdirSync(uploadsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => ({
      name: entry.name,
      modifiedAt: fs.statSync(path.join(uploadsDir, entry.name)).mtimeMs,
    }))
    .sort((a, b) => b.modifiedAt - a.modifiedAt)[0];
  return latest ? `/uploads/${latest.name}` : null;
}

export async function ensureStoredProfileImage(user) {
  if (!user) return user;
  const storedProfileImage = validImageUrl(user.profileImage);
  if (storedProfileImage) {
    return storedProfileImage === user.profileImage
      ? user
      : { ...user, profileImage: storedProfileImage };
  }

  const recoveredProfileImage = findLatestUploadedAvatar(user.id);
  if (!recoveredProfileImage) return { ...user, profileImage: null };

  await prisma.user.update({
    where: { id: user.id },
    data: { profileImage: recoveredProfileImage },
  });
  return { ...user, profileImage: recoveredProfileImage };
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
  const recoveredProfileImage =
    validImageUrl(user.profileImage) || findLatestUploadedAvatar(user.id);
  return {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    name: user.name,
    isAdmin: user.isAdmin === true,
    profileImage: recoveredProfileImage,
    avatarUrl: validImageUrl(user.avatarUrl),
    fbSessionValid: user.fbSessionValid || false,
    whatsappNumber: user.whatsappNumber || null,
    whatsappMessage: user.whatsappMessage || null,
    whatsappSessionConnected: user.whatsappSessionConnected || false,
    whatsappSessionPhone: user.whatsappSessionPhone || null,
    notificationSettings: user.notificationSettings || null,
    createdAt: user.createdAt,
    // Explicit launch-mode entitlement. This bypasses the paywall without
    // fabricating a paid subscription or payment record.
    billingRequired: process.env.BILLING_REQUIRED !== "false",
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
  user = await ensureStoredProfileImage(user);
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
