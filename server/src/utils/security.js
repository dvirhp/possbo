/**
 * Security utilities for input validation and sanitization.
 */

const FACEBOOK_URL_PATTERN = /^https:\/\/(www\.)?facebook\.com\//i;
const MAX_TEXT_LENGTH = 5000;
const MAX_URL_LENGTH = 2048;

/**
 * Validates that a URL is a safe, allowed Facebook URL.
 * Prevents SSRF by blocking internal/private IPs and non-Facebook domains.
 */
export function isAllowedUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (url.length > MAX_URL_LENGTH) return false;

  try {
    const parsed = new URL(url);

    // Only allow HTTPS
    if (parsed.protocol !== "https:") return false;

    // Only allow facebook.com domains
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname !== "facebook.com" &&
      hostname !== "www.facebook.com" &&
      hostname !== "m.facebook.com" &&
      hostname !== "web.facebook.com"
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that a URL is a valid Facebook group URL.
 */
export function isValidFacebookGroupUrl(url) {
  if (!isAllowedUrl(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.pathname.startsWith("/groups/");
  } catch {
    return false;
  }
}

/**
 * Sanitizes and validates text input.
 * Returns null if invalid, trimmed string if valid.
 */
export function sanitizeText(text, maxLength = MAX_TEXT_LENGTH) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

/**
 * Validates a group name string.
 */
export function isValidGroupName(name) {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 200;
}

/**
 * Multer file filter that only allows image uploads.
 */
export function imageFileFilter(_req, file, cb) {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (JPEG, PNG, GIF, WebP) are allowed"), false);
  }
}

/**
 * Maximum file upload size in bytes (5 MB).
 */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
