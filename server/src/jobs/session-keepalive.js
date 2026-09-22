import prisma from "../config/prisma.js";
import { clearFacebookConnectionData } from "../services/platform-connection-cleanup.js";
import { decrypt, encrypt } from "../utils/encryption.js";
import { createLogger } from "../utils/logger.js";
import {
  launchBrowser,
  createBrowserContext,
} from "../utils/browser-factory.js";
import { withUserPublishLock } from "../utils/user-publish-lock.js";

const log = createLogger("keep-alive");

async function checkAndRefreshSession(storageState, userId) {
  const browser = await launchBrowser();
  try {
    const context = await createBrowserContext(browser, { userId, storageState });
    const page = await context.newPage();
    await page.goto("https://www.facebook.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    const cookies = await context.cookies("https://www.facebook.com");
    const cookieNames = new Set(cookies.map((cookie) => cookie.name));
    if (!cookieNames.has("c_user") || !cookieNames.has("xs")) {
      return { valid: false };
    }
    return { valid: true, newState: await context.storageState() };
  } finally {
    await browser.close();
  }
}

export async function runSessionKeepAlive() {
  log.info("Starting session keep-alive job");
  const users = await prisma.user.findMany({
    where: { facebookStorageState: { not: null }, status: "ACTIVE" },
    select: { id: true },
  });

  // Randomize account order to avoid a uniform access pattern on each run.
  users.sort(() => Math.random() - 0.5);
  log.info("Found users with active sessions", { count: users.length });

  let refreshed = 0;
  let expired = 0;
  let errors = 0;
  let locked = 0;

  for (const user of users) {
    try {
      const lockResult = await withUserPublishLock(user.id, async () => {
        // Re-read after acquiring the same distributed lock used by publishing.
        // This prevents keep-alive from overwriting a newer publication session.
        const current = await prisma.user.findUnique({
          where: { id: user.id },
          select: { facebookStorageState: true },
        });
        if (!current?.facebookStorageState) return { status: "missing" };

        const storageState = JSON.parse(decrypt(current.facebookStorageState));
        const result = await checkAndRefreshSession(storageState, user.id);
        if (result.valid) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              facebookStorageState: encrypt(JSON.stringify(result.newState)),
              fbSessionValid: true,
            },
          });
          return { status: "refreshed" };
        }

        await clearFacebookConnectionData(user.id);
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: "SESSION_EXPIRED",
            title: "חיבור Facebook פג תוקף",
            message:
              "החיבור שלך ל-Facebook פג. יש להתחבר מחדש כדי שהפרסומים המתוזמנים ימשיכו לפעול.",
          },
        });
        return { status: "expired" };
      });

      if (!lockResult.acquired) {
        locked++;
        log.info("Skipping session refresh while user is publishing", {
          userId: user.id,
        });
      } else if (lockResult.value.status === "refreshed") {
        refreshed++;
        log.info("Session refreshed successfully", { userId: user.id });
      } else if (lockResult.value.status === "expired") {
        expired++;
        log.warn("Session expired", { userId: user.id });
      }

      // Jitter prevents request bursts and identical timing across accounts.
      await new Promise((resolve) =>
        setTimeout(resolve, 2000 + Math.random() * 6000),
      );
    } catch (error) {
      errors++;
      log.error("Error checking session for user", error, { userId: user.id });
    }
  }

  const summary = { refreshed, expired, errors, locked, total: users.length };
  log.info("Session keep-alive completed", summary);
  return summary;
}
