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

      // Never expose raw error messages to client in production
      const isProduction = process.env.NODE_ENV === "production";
      res.status(500).json({
        success: false,
        error: isProduction
          ? "Internal server error"
          : error.message || "Internal server error",
      });
    });
  };
}
