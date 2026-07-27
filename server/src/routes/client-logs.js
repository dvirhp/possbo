import express from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { createLogger } from "../utils/logger.js";

const router = express.Router();
const log = createLogger("client");

const ALLOWED_LEVELS = new Set(["info", "warn", "error"]);
const MAX_TEXT_LENGTH = 500;

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_TEXT_LENGTH);
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const level = ALLOWED_LEVELS.has(req.body?.level) ? req.body.level : "error";
    const event = cleanText(req.body?.event || "client_event");
    const message = cleanText(req.body?.message);
    const source = cleanText(req.body?.source);
    const path = cleanText(req.body?.path);
    const componentStack = cleanText(req.body?.componentStack);
    const statusCode = Number.isFinite(Number(req.body?.statusCode))
      ? Number(req.body.statusCode)
      : undefined;

    const meta = {
      requestId: req.requestId,
      userId: req.user?.id || null,
      event,
      message,
      source,
      path,
      statusCode,
      componentStack,
      userAgent: cleanText(req.get("user-agent")),
    };

    if (level === "info") log.info("Client event", meta);
    else if (level === "warn") log.warn("Client warning", meta);
    else log.error("Client error", meta);

    res.status(202).json({ success: true });
  }),
);

export default router;
