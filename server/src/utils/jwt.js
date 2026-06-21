import jwt from "jsonwebtoken";
import crypto from "crypto";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters long");
  }
  return secret;
}

function getRefreshSecret() {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_REFRESH_SECRET must be set and at least 32 characters long",
    );
  }
  return secret;
}

/**
 * Generate an access token (short-lived, 15 minutes)
 */
export function generateAccessToken(userId) {
  return jwt.sign({ userId, type: "access" }, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

/**
 * Generate a refresh token (long-lived, 7 days)
 * Returns both the token and its hash (hash is stored in DB)
 */
export function generateRefreshToken(userId) {
  const token = jwt.sign(
    { userId, type: "refresh", jti: crypto.randomUUID() },
    getRefreshSecret(),
    { expiresIn: REFRESH_TOKEN_EXPIRY },
  );
  return token;
}

/**
 * Verify an access token and return the payload
 */
export function verifyAccessToken(token) {
  const payload = jwt.verify(token, getJwtSecret());
  if (payload.type !== "access") {
    throw new Error("Invalid token type");
  }
  return payload;
}

/**
 * Verify a refresh token and return the payload
 */
export function verifyRefreshToken(token) {
  const payload = jwt.verify(token, getRefreshSecret());
  if (payload.type !== "refresh") {
    throw new Error("Invalid token type");
  }
  return payload;
}
