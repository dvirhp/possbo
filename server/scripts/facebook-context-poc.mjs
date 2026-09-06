import "dotenv/config";
import { spawn } from "node:child_process";
import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright";

const LOGIN_TIMEOUT_MS = 12 * 60 * 1000;
const FACEBOOK_URL = "https://www.facebook.com/";

function assertConfiguration() {
  for (const key of ["BROWSERBASE_API_KEY", "BROWSERBASE_PROJECT_ID"]) {
    if (!process.env[key]) throw new Error(`Missing ${key}`);
  }
}

function openLocally(url) {
  const child =
    process.platform === "win32"
      ? spawn("powershell.exe", ["-NoProfile", "-Command", "Start-Process", url], {
          detached: true,
          stdio: "ignore",
        })
      : process.platform === "darwin"
        ? spawn("open", [url], { detached: true, stdio: "ignore" })
        : spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  child.unref();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function facebookCookies(context) {
  const cookies = await context.cookies(FACEBOOK_URL);
  const names = new Set(cookies.map(({ name }) => name));
  return {
    authenticated: names.has("c_user") && names.has("xs"),
    cookieNames: [...names].sort(),
  };
}

async function createSession(bb, contextId, phase) {
  // This POC deliberately has no direct-IP fallback. A rejected proxy means
  // the test is inconclusive, not that we should repeat the known-bad setup.
  return bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    region: "eu-central-1",
    proxies: true,
    api_timeout: 15 * 60,
    userMetadata: { purpose: "facebook-context-poc", phase },
    browserSettings: {
      context: { id: contextId, persist: true },
      viewport: { width: 430, height: 860 },
      solveCaptchas: true,
      blockAds: false,
      recordSession: false,
      logSession: false,
    },
  });
}

async function liveUrl(bb, sessionId) {
  const debug = await bb.sessions.debug(sessionId);
  const page = debug.pages.find(({ url }) => /facebook\.com/i.test(url));
  const url = page?.debuggerFullscreenUrl || debug.debuggerFullscreenUrl;
  return `${url}${url.includes("?") ? "&" : "?"}navbar=false`;
}

async function release(bb, browser, sessionId) {
  await browser?.close().catch(() => {});
  if (!sessionId) return;
  await bb.sessions
    .update(sessionId, {
      status: "REQUEST_RELEASE",
      projectId: process.env.BROWSERBASE_PROJECT_ID,
    })
    .catch(() => {});
}

async function run() {
  assertConfiguration();
  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
  const context = await bb.contexts.create();
  let firstSession;
  let firstBrowser;
  let secondSession;
  let secondBrowser;

  console.log("POC: persistent Browserbase Context created.");
  try {
    firstSession = await createSession(bb, context.id, "initial-login");
    firstBrowser = await chromium.connectOverCDP(firstSession.connectUrl);
    const firstContext = firstBrowser.contexts()[0];
    const firstPage = firstContext.pages()[0] || (await firstContext.newPage());
    await firstPage.goto("https://m.facebook.com/login.php", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    const url = await liveUrl(bb, firstSession.id);
    openLocally(url);
    console.log(
      "POC: Facebook opened. Complete login/2FA in that window; credentials are not read or stored by this script.",
    );

    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    let firstResult = await facebookCookies(firstContext);
    while (!firstResult.authenticated && Date.now() < deadline) {
      await sleep(1500);
      firstResult = await facebookCookies(firstContext);
    }
    if (!firstResult.authenticated) {
      throw new Error("LOGIN_NOT_COMPLETED_WITHIN_12_MINUTES");
    }

    console.log("POC: first login authenticated; persisting Context.");
    await release(bb, firstBrowser, firstSession.id);
    firstBrowser = null;
    firstSession = null;
    await sleep(12_000);

    secondSession = await createSession(bb, context.id, "persistence-check");
    secondBrowser = await chromium.connectOverCDP(secondSession.connectUrl);
    const secondContext = secondBrowser.contexts()[0];
    const secondPage = secondContext.pages()[0] || (await secondContext.newPage());
    await secondPage.goto(FACEBOOK_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    const secondResult = await facebookCookies(secondContext);

    if (!secondResult.authenticated) {
      throw new Error("CONTEXT_DID_NOT_PERSIST_FACEBOOK_LOGIN");
    }
    console.log("POC_RESULT=SUCCESS");
    console.log("POC: the second isolated session remained authenticated.");
  } finally {
    await release(bb, firstBrowser, firstSession?.id);
    await release(bb, secondBrowser, secondSession?.id);
    await bb.contexts.delete(context.id).catch(() => {});
    console.log("POC: temporary Context deleted.");
  }
}

run().catch((error) => {
  console.error(`POC_RESULT=FAILED:${error.message}`);
  process.exitCode = 1;
});
