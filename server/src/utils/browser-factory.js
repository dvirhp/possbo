import { chromium } from "playwright";
import { createLogger } from "./logger.js";

const log = createLogger("browser");

// A Chromium process is expensive (typically hundreds of MB under real pages).
// Keep one process-wide budget so unrelated jobs cannot exhaust the container.
const MEMORY_LIMIT_MB = Math.max(256, Number(process.env.WORKER_MEMORY_LIMIT_MB || 1024));
const RESERVED_MEMORY_MB = Math.max(128, Number(process.env.WORKER_RESERVED_MEMORY_MB || 256));
const CHROMIUM_MEMORY_MB = Math.max(128, Number(process.env.CHROMIUM_MEMORY_MB || 350));
const configuredConcurrency = Number(process.env.CHROMIUM_CONCURRENCY || 0);
export const CHROMIUM_CONCURRENCY = Math.max(
  1,
  configuredConcurrency || Math.floor((MEMORY_LIMIT_MB - RESERVED_MEMORY_MB) / CHROMIUM_MEMORY_MB),
);
let activeBrowsers = 0;
const browserWaiters = [];

async function acquireBrowserSlot() {
  if (activeBrowsers >= CHROMIUM_CONCURRENCY) {
    await new Promise((resolve) => browserWaiters.push(resolve));
  }
  activeBrowsers += 1;
}

function releaseBrowserSlot() {
  activeBrowsers = Math.max(0, activeBrowsers - 1);
  browserWaiters.shift()?.();
}

export function getBrowserResourceStats() {
  return { active: activeBrowsers, waiting: browserWaiters.length, limit: CHROMIUM_CONCURRENCY };
}

// ─── Proxy configuration ─────────────────────────────────

const PROXY_URL = process.env.PROXY_URL || ""; // e.g. http://user:pass@gate.brightdata.com:22225
const PROXY_ENABLED = !!PROXY_URL;

/**
 * Build proxy config for Playwright browser context.
 * Supports sticky sessions per userId so the same user always exits
 * through the same residential IP (reduces Facebook suspicion).
 *
 * @param {string} [userId] - optional user ID for sticky session
 * @returns {{ server: string, username?: string, password?: string } | undefined}
 */
function getProxyConfig(userId) {
  if (!PROXY_ENABLED) return undefined;

  try {
    const url = new URL(PROXY_URL);
    const config = {
      server: `${url.protocol}//${url.hostname}:${url.port}`,
    };

    // Build username with sticky session suffix if userId provided
    // Most residential proxy providers support session IDs in the username
    // e.g. "user-session-abc123" keeps the same IP for that session
    let username = decodeURIComponent(url.username);
    if (userId) {
      // Use first 12 chars of userId as session ID for sticky IP
      const sessionId = userId.replace(/-/g, "").slice(0, 12);
      // Append session parameter — works with Bright Data, Oxylabs, SmartProxy
      if (!username.includes("-session-")) {
        username = `${username}-session-${sessionId}`;
      }
    }

    if (username) config.username = username;
    if (url.password) config.password = decodeURIComponent(url.password);

    return config;
  } catch (e) {
    log.error("Invalid PROXY_URL format:", e.message);
    return undefined;
  }
}

// ─── Fingerprint randomization ────────────────────────────

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
];

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1600, height: 900 },
  { width: 1280, height: 800 },
  { width: 1280, height: 1024 },
];

const TIMEZONES = [
  "Asia/Jerusalem",
  "Europe/London",
  "America/New_York",
  "Europe/Berlin",
  "America/Los_Angeles",
  "Europe/Paris",
  "America/Chicago",
];

const LOCALES = ["he-IL", "en-US", "en-GB", "de-DE", "fr-FR"];

/**
 * Generate a consistent fingerprint for a given userId.
 * The same userId always gets the same fingerprint so Facebook sees
 * a stable "device" for each user across sessions.
 *
 * @param {string} [userId] - user ID for deterministic fingerprint selection
 * @returns {{ userAgent: string, viewport: { width: number, height: number }, timezoneId: string, locale: string }}
 */
function generateFingerprint(userId) {
  if (!userId) {
    // Random fingerprint for non-user contexts (e.g. bootstrap)
    return {
      userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
      viewport: VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)],
      timezoneId: TIMEZONES[0],
      locale: LOCALES[0],
    };
  }

  // Deterministic selection based on userId hash
  const hash = simpleHash(userId);
  return {
    userAgent: USER_AGENTS[hash % USER_AGENTS.length],
    viewport:
      VIEWPORTS[Math.floor(hash / USER_AGENTS.length) % VIEWPORTS.length],
    timezoneId:
      TIMEZONES[
        Math.floor(hash / (USER_AGENTS.length * VIEWPORTS.length)) %
          TIMEZONES.length
      ],
    locale:
      LOCALES[
        Math.floor(
          hash / (USER_AGENTS.length * VIEWPORTS.length * TIMEZONES.length),
        ) % LOCALES.length
      ],
  };
}

/**
 * Simple numeric hash from string. Not cryptographic — just for
 * deterministic distribution across arrays.
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// ─── Browser factory ──────────────────────────────────────

const COMMON_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
];

/**
 * Launch a Playwright Chromium browser with optional proxy.
 *
 * @param {{ headless?: boolean }} [options]
 * @returns {Promise<import('playwright').Browser>}
 */
export async function launchBrowser(options = {}) {
  const { headless = true } = options;

  const launchOpts = {
    headless,
    args: [...COMMON_ARGS],
  };

  if (PROXY_ENABLED) {
    log.debug("Launching browser with proxy");
  }

  await acquireBrowserSlot();
  try {
    const browser = await chromium.launch(launchOpts);
    let released = false;
    browser.on("disconnected", () => {
      if (released) return;
      released = true;
      releaseBrowserSlot();
    });
    return browser;
  } catch (error) {
    releaseBrowserSlot();
    throw error;
  }
}

/**
 * Create a new browser context with fingerprint + proxy + optional storage state.
 * This is the single entry point for all Facebook browser contexts.
 *
 * @param {import('playwright').Browser} browser
 * @param {{ userId?: string, storageState?: object, headless?: boolean }} [options]
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export async function createBrowserContext(browser, options = {}) {
  const { userId, storageState } = options;

  const fingerprint = generateFingerprint(userId);
  const proxy = getProxyConfig(userId);

  const contextOpts = {
    viewport: fingerprint.viewport,
    userAgent: fingerprint.userAgent,
    timezoneId: fingerprint.timezoneId,
    locale: fingerprint.locale,
  };

  if (storageState) {
    contextOpts.storageState = storageState;
  }

  if (proxy) {
    contextOpts.proxy = proxy;
  }

  return browser.newContext(contextOpts);
}

// ─── Exports for testing ──────────────────────────────────

export { generateFingerprint, getProxyConfig, simpleHash };
export { PROXY_ENABLED };
