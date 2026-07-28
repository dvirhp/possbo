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
      log.error(`${req.method} ${req.originalUrl}`, error);

      if (error.message === "FACEBOOK_SESSION_REQUIRED") {
        return res.status(428).json({
          success: false,
          error: "FACEBOOK_SESSION_REQUIRED",
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
