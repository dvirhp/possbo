import prisma from "../config/prisma.js";
import { decrypt, encrypt } from "../utils/encryption.js";
import { createLogger } from "../utils/logger.js";
import {
  launchBrowser,
  createBrowserContext,
} from "../utils/browser-factory.js";

const log = createLogger("keep-alive");

/**
 * Check if a Facebook session (storage state) is still valid.
 * Opens a headless browser, loads cookies, visits Facebook, checks login status.
 * Returns { valid: boolean, newState?: object }
 */
async function checkAndRefreshSession(storageState, userId) {
  const browser = await launchBrowser();

  try {
    const context = await createBrowserContext(browser, {
      userId,
      storageState,
    });

    const page = await context.newPage();
    await page.goto("https://www.facebook.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait a bit for page to settle
    await page.waitForTimeout(3000);

    // Scroll down and back up to simulate real user activity, then reload
    // so Facebook refreshes session cookies before we capture them
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    // Check if we're still logged in by looking for login cookies
    const cookies = await context.cookies("https://www.facebook.com");
    const cookieNames = new Set(cookies.map((c) => c.name));
    const isLoggedIn = cookieNames.has("c_user") && cookieNames.has("xs");

    if (isLoggedIn) {
      // Session is valid — save refreshed state (cookies may have been updated)
      const newState = await context.storageState();
      return { valid: true, newState };
    }

    return { valid: false };
  } finally {
    await browser.close();
  }
}

/**
 * Run session keep-alive for all users that have a stored Facebook session.
 * - Checks each user's session validity
 * - Updates storage state if refreshed
 * - Notifies user if session expired
 */
export async function runSessionKeepAlive() {
  log.info("Starting session keep-alive job");

  const users = await prisma.user.findMany({
    where: {
      facebookStorageState: { not: null },
      status: "ACTIVE",
    },
    select: {
      id: true,
      email: true,
      facebookStorageState: true,
    },
  });

  log.info("Found users with active sessions", { count: users.length });

  let refreshed = 0;
  let expired = 0;
  let errors = 0;

  for (const user of users) {
    try {
      // Decrypt stored state
      const storageState = JSON.parse(decrypt(user.facebookStorageState));

      const result = await checkAndRefreshSession(storageState, user.id);

      if (result.valid) {
        // Update with refreshed cookies
        const encryptedState = encrypt(JSON.stringify(result.newState));
        await prisma.user.update({
          where: { id: user.id },
          data: { facebookStorageState: encryptedState, fbSessionValid: true },
        });
        refreshed++;
        log.info("Session refreshed successfully", { userId: user.id });
      } else {
        // Session expired — notify user
        expired++;
        log.warn("Session expired", { userId: user.id });

        await prisma.notification.create({
          data: {
            userId: user.id,
            type: "SESSION_EXPIRED",
            title: "חיבור הפייסבוק פג תוקף",
            message:
              "ה-session של פייסבוק שלך פג. אנא התחבר מחדש כדי שפוסטים מתוזמנים ימשיכו לפעול.",
          },
        });

        // Mark user's storage state as null so system knows it's expired
        await prisma.user.update({
          where: { id: user.id },
          data: { facebookStorageState: null, fbSessionValid: false },
        });
      }

      // Small delay between users to avoid rate limiting
      await new Promise((r) => setTimeout(r, 5000));
    } catch (error) {
      errors++;
      log.error("Error checking session for user", error, { userId: user.id });
    }
  }

  log.info("Session keep-alive completed", {
    refreshed,
    expired,
    errors,
    total: users.length,
  });

  return { refreshed, expired, errors, total: users.length };
}
