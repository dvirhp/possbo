import { createLogger } from "./logger.js";

const log = createLogger("handler");

/**
 * Wraps an async route handler to catch errors automatically.
 * Handles common error patterns (FACEBOOK_SESSION_REQUIRED, validation).
 *
 * Usage:
 *   router.get("/path", asyncHandler(async (req, res) => { ... }));
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      log.error(`${req.method} ${req.originalUrl}`, error, {
        event: "request_handler_error",
        requestId: req.requestId,
        userId: req.user?.id || null,
        method: req.method,
        path: req.originalUrl?.split("?")[0],
      });

      if (error.message === "FACEBOOK_SESSION_REQUIRED") {
        return res.status(428).json({
          success: false,
          error: "FACEBOOK_SESSION_REQUIRED",
        });
      }

      if (error.code === "DAILY_PUBLISH_LIMIT_REACHED") {
        const usage = error.dailyLimit || { limit: 70, remaining: 0 };
        return res.status(429).json({
          success: false,
          code: error.code,
          error: `הגעת למכסת הפרסום היומית של ${usage.limit} פרסומים. ניתן לפרסם שוב לאחר איפוס המכסה מחר.`,
          dailyLimit: usage,
        });
      }

      // Technical exceptions can contain schema details, queries, filesystem
      // paths and identifiers. Keep them in the server log in every
      // environment and return only a stable, user-safe response.
      res.status(500).json({
        success: false,
        error: "לא הצלחנו להשלים את הפעולה כרגע. נסו שוב מאוחר יותר.",
        code: "INTERNAL_ERROR",
      });
    });
  };
}
