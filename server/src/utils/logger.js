/**
 * PostIt Logger
 *
 * Centralized structured logger for the entire server.
 * Designed with a transport-ready architecture — currently outputs to console,
 * but can be extended to send logs anywhere (file, cloud, DB) via transports.
 *
 * Usage:
 *   import { createLogger } from "../utils/logger.js";
 *   const log = createLogger("module-name");
 *
 *   log.info("Server started", { port: 5001 });
 *   log.error("Failed to publish", error, { jobId: "abc" });
 *   log.warn("Session expiring soon", { userId: "xyz" });
 *   log.debug("Query result", { rows: 5 });
 */

// ─── Log Levels ──────────────────────────────────────────

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_LABELS = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

const LEVEL_COLORS = {
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

// ─── Configuration ───────────────────────────────────────

const currentLevel =
  LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.debug;

// ─── Transports ──────────────────────────────────────────
// Array of transport functions. Each receives a structured log entry.
// In the future, add file/cloud transports here.

const transports = [];

/**
 * Register a log transport.
 * A transport is a function that receives: { timestamp, level, module, message, meta, error }
 */
export function addTransport(fn) {
  transports.push(fn);
}

// ─── Formatting Helpers ──────────────────────────────────

function formatTimestamp() {
  const now = new Date();
  const time = now.toLocaleTimeString("he-IL", { hour12: false });
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${time}.${ms}`;
}

function formatMeta(meta) {
  if (!meta || Object.keys(meta).length === 0) return "";
  try {
    const parts = Object.entries(meta).map(([k, v]) => {
      if (typeof v === "string") return `${k}="${v}"`;
      return `${k}=${JSON.stringify(v)}`;
    });
    return ` ${DIM}[${parts.join(" ")}]${RESET}`;
  } catch {
    return "";
  }
}

function formatError(error) {
  if (!error) return "";
  if (typeof error === "string") return `\n  → ${error}`;
  const lines = [];
  if (error.message) {
    lines.push(`  → ${error.message}`);
  }
  if (error.code) {
    lines.push(`  code: ${error.code}`);
  }
  if (error.stack) {
    // Show the full real stack trace, skipping the first line (message)
    const stackLines = error.stack.split("\n").slice(1);
    // Keep all stack frames — don't truncate
    lines.push(...stackLines.map((l) => `  ${DIM}${l.trim()}${RESET}`));
  }
  return "\n" + lines.join("\n");
}

// ─── Console Transport (default) ─────────────────────────

function consoleTransport(entry) {
  const color = LEVEL_COLORS[entry.level] || "";
  const label = LEVEL_LABELS[entry.level];
  const ts = `${DIM}${entry.timestamp}${RESET}`;
  const mod = `${BOLD}[${entry.module}]${RESET}`;
  const lvl = `${color}${label}${RESET}`;
  const meta = formatMeta(entry.meta);
  const err = formatError(entry.error);

  const line = `${ts} ${lvl} ${mod} ${entry.message}${meta}${err}`;

  if (entry.level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

// Register console as default transport
transports.push(consoleTransport);

// ─── Logger Factory ──────────────────────────────────────

/**
 * Create a logger scoped to a module/component.
 *
 * @param {string} module - Module name (e.g., "scheduler", "auth", "fb-auto")
 * @returns Logger instance with debug/info/warn/error methods
 */
export function createLogger(module) {
  function emit(level, message, errorOrMeta, meta) {
    if (LEVELS[level] < currentLevel) return;

    // Determine if second arg is an Error or meta
    let error = null;
    let finalMeta = meta || {};

    if (errorOrMeta instanceof Error) {
      error = errorOrMeta;
    } else if (
      errorOrMeta &&
      typeof errorOrMeta === "object" &&
      !Array.isArray(errorOrMeta)
    ) {
      // If no separate meta provided, treat second arg as meta
      if (!meta) {
        finalMeta = errorOrMeta;
      } else {
        // Both provided, second must be error-like
        error = errorOrMeta;
      }
    } else if (typeof errorOrMeta === "string") {
      // String passed as error message
      error = { message: errorOrMeta };
    }

    const entry = {
      timestamp: formatTimestamp(),
      level,
      module,
      message,
      meta: finalMeta,
      error,
    };

    for (const transport of transports) {
      try {
        transport(entry);
      } catch {
        // Never let a transport crash the app
      }
    }
  }

  return {
    debug: (message, metaOrError, meta) =>
      emit("debug", message, metaOrError, meta),
    info: (message, metaOrError, meta) =>
      emit("info", message, metaOrError, meta),
    warn: (message, metaOrError, meta) =>
      emit("warn", message, metaOrError, meta),
    error: (message, metaOrError, meta) =>
      emit("error", message, metaOrError, meta),

    /**
     * Create a child logger with a sub-module prefix.
     * e.g., log.child("publish") → "[fb-auto:publish]"
     */
    child: (subModule) => createLogger(`${module}:${subModule}`),
  };
}

// ─── Global Uncaught Handlers ────────────────────────────

const systemLog = createLogger("system");

process.on("uncaughtException", (error) => {
  systemLog.error("Uncaught exception — process will exit", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  systemLog.error("Unhandled promise rejection", error);
});
