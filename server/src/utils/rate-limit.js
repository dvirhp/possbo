import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { createLogger } from "./logger.js";
import { createClient } from "redis";
import { RedisStore } from "rate-limit-redis";

const log = createLogger("rate-limit");
let redisClient;
if (process.env.REDIS_URL) {
  try {
    const redis = createClient({ url: process.env.REDIS_URL });
    redis.on("error", (error) => log.error("Redis rate-limit error", error));
    await redis.connect();
    redisClient = redis;
    log.info("Distributed Redis rate limiting enabled");
  } catch (error) {
    log.error("Redis unavailable; using in-process rate limits", error, { event: "redis_rate_limit_fallback" });
  }
}
const storeOptions = (name) => redisClient ? { store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args), prefix: `possbo:rl:${name}:` }) } : {};

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
  ...storeOptions("general"),
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
  ...storeOptions("auth"),
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
  ...storeOptions("refresh"),
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
  ...storeOptions("publish"),
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req) =>
    req.user?.id ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "הגעת למגבלת הפרסום. נסה שוב בעוד שעה." },
  handler: rateLimitHandler({ error: "הגעת למגבלת הפרסום. נסה שוב בעוד שעה." }),
});
