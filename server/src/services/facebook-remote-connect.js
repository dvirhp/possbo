import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright";
import prisma from "../config/prisma.js";
import { encrypt } from "../utils/encryption.js";
import { createLogger } from "../utils/logger.js";
import { withUserPublishLock } from "../utils/user-publish-lock.js";

const log = createLogger("facebook-remote-connect");
const SESSION_TIMEOUT_SECONDS = 15 * 60;
const LOCK_LEASE_MS = 16 * 60 * 1000;
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
  };
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
        const remote = await client.sessions.create({
          projectId: process.env.BROWSERBASE_PROJECT_ID || undefined,
          region: "eu-central-1",
          // Facebook commonly rejects cloud datacenter IPs during an
          // interactive login. Browserbase's managed proxy provides a more
          // appropriate egress path for this user-initiated session.
          proxies: true,
          api_timeout: SESSION_TIMEOUT_SECONDS,
          browserSettings: {
            viewport: { width: 1024, height: 720 },
            os: "windows",
            blockAds: true,
            // Login sessions may contain passwords and 2FA codes. They must
            // never appear in Browserbase recordings or session logs.
            recordSession: false,
            logSession: false,
          },
          userMetadata: { purpose: "facebook-connect", userId },
        });
        entry.sessionId = remote.id;
        entry.browser = await chromium.connectOverCDP(remote.connectUrl);
        const context = entry.browser.contexts()[0];
        const page = context.pages()[0] || (await context.newPage());
        await page.goto("https://www.facebook.com/login", {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });

        const live = await client.sessions.debug(remote.id);
        const pageLiveUrl =
          live.pages.find((candidate) => /facebook\.com/i.test(candidate.url))
            ?.debuggerFullscreenUrl || live.debuggerFullscreenUrl;
        entry.liveUrl = `${pageLiveUrl}${pageLiveUrl.includes("?") ? "&" : "?"}navbar=false`;
        entry.status = "waiting";
        signalReady();

        while (Date.now() < entry.expiresAt.getTime()) {
          if (entry.status === "cancelled") return;
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

