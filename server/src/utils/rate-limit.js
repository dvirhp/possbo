import rateLimit from "express-rate-limit";
import { createLogger } from "./logger.js";

const log = createLogger("rate-limit");

function rateLimitHandler(message) {
  return (req, res) => {
    log.warn("Rate limit exceeded", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl?.split("?")[0] || req.path,
      ip: req.ip,
      userId: req.user?.id || null,
    });
    res.status(429).json(message);
  };
}

/**
 * General API rate limiter — 300 requests per 15 minutes per IP.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "יותר מדי בקשות. נסה שוב בעוד מספר דקות." },
  handler: rateLimitHandler({ error: "יותר מדי בקשות. נסה שוב בעוד מספר דקות." }),
});

/**
 * Strict limiter for auth endpoints (login, register, forgot-password).
 * 10 attempts per 15 minutes per IP.
 * Skips /refresh, /logout, /me since they have their own protection or are harmless.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => ["/refresh", "/logout", "/me", "/verify-facebook"].includes(req.path),
  message: { error: "יותר מדי ניסיונות. נסה שוב בעוד 15 דקות." },
  handler: rateLimitHandler({ error: "יותר מדי ניסיונות. נסה שוב בעוד 15 דקות." }),
});

/**
 * Refresh-token limiter — 30 requests per 15 minutes per IP.
 * More generous than authLimiter because refresh is cookie-protected.
 */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "יותר מדי בקשות רענון. נסה שוב בעוד מספר דקות." },
  handler: rateLimitHandler({ error: "יותר מדי בקשות רענון. נסה שוב בעוד מספר דקות." }),
});

/**
 * Publish limiter — 30 publishes per hour per IP.
 */
export const publishLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "הגעת למגבלת הפרסום. נסה שוב בעוד שעה." },
  handler: rateLimitHandler({ error: "הגעת למגבלת הפרסום. נסה שוב בעוד שעה." }),
});
