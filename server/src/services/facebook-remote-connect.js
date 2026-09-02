import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright";
import prisma from "../config/prisma.js";
import { encrypt } from "../utils/encryption.js";
import { createLogger } from "../utils/logger.js";
import { withUserPublishLock } from "../utils/user-publish-lock.js";

const log = createLogger("facebook-remote-connect");
const SESSION_TIMEOUT_SECONDS = 15 * 60;
const LOCK_LEASE_MS = 16 * 60 * 1000;
const FACEBOOK_LOGIN_URL =
  process.env.FACEBOOK_LOGIN_URL || "https://m.facebook.com/login.php";
const sessions = new Map();

function getClient() {
  if (!process.env.BROWSERBASE_API_KEY) {
    throw new Error("FACEBOOK_REMOTE_CONNECT_NOT_CONFIGURED");
  }
  return new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
}

async function releaseRemoteSession(client, sessionId) {
  if (!sessionId) return;
  await client.sessions
    .update(sessionId, {
      status: "REQUEST_RELEASE",
      projectId: process.env.BROWSERBASE_PROJECT_ID || undefined,
    })
    .catch((error) =>
      log.warn("Failed to release remote browser session", {
        sessionId,
        reason: error.message,
      }),
    );
}

function publicStatus(entry) {
  if (!entry) return { status: "idle" };
  return {
    status: entry.status,
    liveUrl: entry.status === "waiting" ? entry.liveUrl : undefined,
    expiresAt: entry.expiresAt,
    error: entry.error,
    hint: entry.hint,
  };
}

async function createRemoteSession(client, userId) {
  const useProxy = process.env.BROWSERBASE_USE_PROXY !== "false";
  const basePayload = {
    projectId: process.env.BROWSERBASE_PROJECT_ID || undefined,
    region: "eu-central-1",
    api_timeout: SESSION_TIMEOUT_SECONDS,
    userMetadata: { purpose: "facebook-connect", userId },
  };

  const privacySettings = {
    viewport: { width: 430, height: 860 },
    blockAds: false,
    solveCaptchas: true,
    // Login sessions may contain passwords and 2FA codes. These settings
    // must be preserved even when the selected plan rejects proxy access.
    recordSession: false,
    logSession: false,
  };

  try {
    const session = await client.sessions.create({
      ...basePayload,
      // Proxy mode is configurable because some accounts are more stable with
      // a direct datacenter egress while others prefer managed proxy routing.
      proxies: useProxy,
      browserSettings: privacySettings,
    });
    return { session, proxyActive: useProxy };
  } catch (error) {
    if (!useProxy) throw error;
    log.warn("Browserbase proxy rejected, retrying without proxy", {
      reason: error.message,
      userId,
    });
    const session = await client.sessions.create({
      ...basePayload,
      proxies: false,
      browserSettings: privacySettings,
    });
    return { session, proxyActive: false };
  }
}

export async function startFacebookRemoteConnect(userId) {
  const existing = sessions.get(userId);
  if (existing?.status === "starting" || existing?.status === "waiting") {
    return publicStatus(existing);
  }

  const entry = {
    status: "starting",
    liveUrl: null,
    sessionId: null,
    expiresAt: new Date(Date.now() + SESSION_TIMEOUT_SECONDS * 1000),
    error: null,
    hint: null,
    browser: null,
  };
  sessions.set(userId, entry);

  let signalReady;
  const ready = new Promise((resolve) => {
    signalReady = resolve;
  });

  void withUserPublishLock(
    userId,
    async () => {
      const client = getClient();
      try {
        const remoteResult = await createRemoteSession(client, userId);
        const remote = remoteResult.session;
        if (!remoteResult.proxyActive) {
          entry.hint = "proxy_unavailable";
          log.warn("Facebook login is using direct datacenter egress", { userId });
        }
        entry.sessionId = remote.id;
        entry.browser = await chromium.connectOverCDP(remote.connectUrl);
        const context = entry.browser.contexts()[0];
        const page = context.pages()[0] || (await context.newPage());
        await page.goto(FACEBOOK_LOGIN_URL, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        await page
          .waitForSelector('input[name="email"], input[name="pass"]', {
            timeout: 15000,
          })
          .catch(() => {});

        const live = await client.sessions.debug(remote.id);
        const pageLiveUrl =
          live.pages.find((candidate) => /facebook\.com/i.test(candidate.url))
            ?.debuggerFullscreenUrl || live.debuggerFullscreenUrl;
        entry.liveUrl = `${pageLiveUrl}${pageLiveUrl.includes("?") ? "&" : "?"}navbar=false`;
        entry.status = "waiting";
        signalReady();

        let previousWasLogin = true;
        let loginReturnCount = 0;

        while (Date.now() < entry.expiresAt.getTime()) {
          if (entry.status === "cancelled") return;

          const currentUrl = page.url() || "";
          const normalizedUrl = currentUrl.toLowerCase();
          const isLoginPage =
            normalizedUrl.includes("facebook.com/login") ||
            normalizedUrl.includes("m.facebook.com/login") ||
            normalizedUrl.includes("mbasic.facebook.com/login") ||
            normalizedUrl.includes("/login.php");
          const isCheckpointPage =
            normalizedUrl.includes("checkpoint") ||
            normalizedUrl.includes("two_step_verification") ||
            normalizedUrl.includes("approvals");
          const isCaptchaPage =
            normalizedUrl.includes("captcha") ||
            normalizedUrl.includes("recaptcha");

          if (!previousWasLogin && isLoginPage && !isCheckpointPage) {
            loginReturnCount += 1;
            // Meta often returns to the login form after a CAPTCHA and expects
            // the user to submit once more. Keep the session alive instead of
            // terminating the only window where that challenge can finish.
            entry.hint = "facebook_security_retry";
            log.info("Facebook returned to login after a security check", {
              userId,
              loginReturnCount,
            });
          } else if (isCaptchaPage) {
            entry.hint = "facebook_security_check";
          }
          previousWasLogin = isLoginPage;

          const cookies = await context.cookies("https://www.facebook.com");
          const names = new Set(cookies.map((cookie) => cookie.name));
          if (names.has("c_user") && names.has("xs")) {
            const storageState = await context.storageState();
            await prisma.user.update({
              where: { id: userId },
              data: {
                facebookStorageState: encrypt(JSON.stringify(storageState)),
                fbSessionValid: true,
              },
            });
            entry.status = "connected";
            log.info("Facebook remote connection completed", { userId });
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        entry.status = "expired";
      } catch (error) {
        entry.status = "error";
        entry.error =
          error.message === "FACEBOOK_REMOTE_CONNECT_NOT_CONFIGURED"
            ? "not_configured"
            : "connection_failed";
        log.error("Facebook remote connection failed", error, { userId });
        signalReady();
      } finally {
        await entry.browser?.close().catch(() => {});
        entry.browser = null;
        await releaseRemoteSession(client, entry.sessionId);
        setTimeout(() => {
          if (sessions.get(userId) === entry) sessions.delete(userId);
        }, 60_000).unref?.();
      }
    },
    { leaseMs: LOCK_LEASE_MS },
  ).then((result) => {
    if (!result.acquired) {
      entry.status = "busy";
      entry.error = "facebook_operation_in_progress";
      signalReady();
    }
  });

  await Promise.race([
    ready,
    new Promise((resolve) => setTimeout(resolve, 30_000)),
  ]);
  return publicStatus(entry);
}

export function getFacebookRemoteConnectStatus(userId) {
  return publicStatus(sessions.get(userId));
}

export async function cancelFacebookRemoteConnect(userId) {
  const entry = sessions.get(userId);
  if (!entry) return { status: "idle" };
  entry.status = "cancelled";
  await entry.browser?.close().catch(() => {});
  return { status: "cancelled" };
}

