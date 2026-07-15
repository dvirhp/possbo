/**
 * Input validation utilities for request bodies.
 * Used alongside security.js for field-specific validation.
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates a UUID string format.
 */
export function isValidUUID(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/**
 * Validates an array of UUIDs.
 */
export function areValidUUIDs(values) {
  return (
    Array.isArray(values) && values.length > 0 && values.every(isValidUUID)
  );
}

/**
 * Validates that a date string is a valid ISO date in the future.
 */
export function isFutureDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime()) && date > new Date();
}

/**
 * Validates an email format (basic check).
 */
export function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Validates a password meets minimum requirements.
 */
export function isValidPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 6 &&
    password.length <= 128
  );
}
