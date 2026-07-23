import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../config/prisma.js";
import { encrypt, decrypt } from "./encryption.js";
import { createLogger } from "./logger.js";
import { launchBrowser, createBrowserContext } from "./browser-factory.js";

const log = createLogger("fb-auto");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_STORAGE_STATE_PATH = path.join(
  __dirname,
  "..",
  "..",
  ".facebook-storage-state.json",
);

// ─── Per-user storage state helpers ───────────────────────

/**
 * Load storage state for a user from DB.
 * Returns parsed JSON object or null if not found.
 */
async function loadUserStorageState(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { facebookStorageState: true },
  });

  if (!user?.facebookStorageState) {
    return null;
  }

  try {
    const decrypted = decrypt(user.facebookStorageState);
    return JSON.parse(decrypted);
  } catch (e) {
    log.error("Failed to decrypt storage state for user:", userId, e.message);
    return null;
  }
}

/**
 * Save storage state for a user to DB (encrypted).
 */
async function saveUserStorageState(userId, storageState) {
  const json = JSON.stringify(storageState);
  const encrypted = encrypt(json);

  await prisma.user.update({
    where: { id: userId },
    data: { facebookStorageState: encrypted },
  });
}

/**
 * Get storage state - from DB (per user) only.
 * Returns the storage state object or throws FACEBOOK_SESSION_REQUIRED.
 */
async function getStorageState(userId) {
  if (userId) {
    const state = await loadUserStorageState(userId);
    if (state) return state;
  }

  throw new Error("FACEBOOK_SESSION_REQUIRED");
}

// ─── Utility functions ────────────────────────────────────

function isLikelyLoggedOut(text) {
  const markers = [
    /log in/i,
    /sign in/i,
    /you must log in/i,
    /כניסה/i,
    /התחבר/i,
  ];
  return markers.some((p) => p.test(text));
}

function isBlockedPage(text) {
  const blockedPatterns = [
    /not found/i,
    /page isn't available/i,
    /content isn't available/i,
    /תוכן זה אינו זמין/i,
  ];
  return blockedPatterns.some((p) => p.test(text));
}

async function hasFacebookLoginCookies(context) {
  const cookies = await context.cookies("https://www.facebook.com");
  const names = new Set(cookies.map((cookie) => cookie.name));
  return names.has("c_user") && names.has("xs");
}

// ─── Bootstrap session ────────────────────────────────────

export async function bootstrapFacebookSession(userId) {
  const browser = await launchBrowser({ headless: false });

  try {
    const context = await createBrowserContext(browser, { userId });
    const page = await context.newPage();
    await page.goto("https://www.facebook.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const maxWaitMs = 300000; // 5 minutes for checkpoint/2FA
    const startedAt = Date.now();
    let loggedIn = false;

    while (Date.now() - startedAt < maxWaitMs) {
      try {
        await page.waitForTimeout(3000);
      } catch {
        // Browser/page was closed by the user — check cookies before giving up
        try {
          if (await hasFacebookLoginCookies(context)) {
            loggedIn = true;
          }
        } catch {
          // Context also closed
        }
        break;
      }

      try {
        if (await hasFacebookLoginCookies(context)) {
          loggedIn = true;
          break;
        }

        const currentPages = context.pages();
        for (const currentPage of currentPages) {
          try {
            const url = currentPage.url();
            if (/facebook\.com/i.test(url) && !/login|checkpoint/i.test(url)) {
              if (await hasFacebookLoginCookies(context)) {
                loggedIn = true;
                break;
              }
            }
          } catch {
            // Page may have been closed/navigated — skip
          }
        }
      } catch {
        // Context still alive, just retry
      }

      if (loggedIn) break;
    }

    if (!loggedIn) {
      throw new Error("FACEBOOK_SESSION_NOT_COMPLETED");
    }

    // Save storage state
    let storageState;
    try {
      storageState = await context.storageState();
    } catch {
      // Browser already closed — can't save state
      log.warn("Browser closed before storage state could be saved");
      throw new Error("FACEBOOK_SESSION_NOT_COMPLETED");
    }

    if (userId) {
      // Save to DB per user (encrypted)
      await saveUserStorageState(userId, storageState);
      // Mark session as valid
      await prisma.user.update({
        where: { id: userId },
        data: { fbSessionValid: true },
      });
      log.info("Storage state saved to DB for user:", userId);
    }

    // Also save to legacy file for backward compat
    await context.storageState({ path: LEGACY_STORAGE_STATE_PATH });

    return { ok: true };
  } finally {
    await browser.close();
  }
}

// ─── Scrape groups ────────────────────────────────────────

/**
 * Scrape list of groups the user is a member of from Facebook.
 * Returns array of { name, url, id, image }
 */
export async function scrapeMyGroups(userId) {
  const storageState = await getStorageState(userId);

  const browser = await launchBrowser();

  try {
    const context = await createBrowserContext(browser, {
      userId,
      storageState,
    });
    const page = await context.newPage();

    // Go to user's groups page
    log.debug("Navigating to your groups page...");
    await page.goto(
      "https://www.facebook.com/groups/joins/?nav_source=tab&ordering=viewer_added",
      {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      },
    );
    await page.waitForTimeout(5000);

    // Check if logged in - both URL-based and content-based detection
    if (/login|checkpoint/i.test(page.url())) {
      throw new Error("FACEBOOK_SESSION_REQUIRED");
    }

    // Also check page content for login form (FB sometimes shows login on the same URL)
    const isLoginPage = await page.evaluate(() => {
      const text = document.body.innerText || "";
      return (
        /שכחת את החשבון|Forgot account|Log in|Sign in|התחברות|הירשם/i.test(
          text,
        ) &&
        document.querySelector('input[name="email"], input[name="pass"]') !==
          null
      );
    });
    if (isLoginPage) {
      log.warn("Facebook session expired — login page detected");
      // Mark session as invalid in DB
      if (userId) {
        await prisma.user
          .update({
            where: { id: userId },
            data: { fbSessionValid: false, facebookStorageState: null },
          })
          .catch(() => {});
      }
      throw new Error("FACEBOOK_SESSION_REQUIRED");
    }

    // Scroll down until no more new content loads
    let previousHeight = 0;
    let noChangeCount = 0;
    const maxScrollAttempts = 150;
    for (let i = 0; i < maxScrollAttempts; i++) {
      const currentHeight = await page.evaluate(
        () => document.body.scrollHeight,
      );
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);

      if (currentHeight === previousHeight) {
        noChangeCount++;
        if (noChangeCount >= 4) {
          log.debug(`Reached bottom after ${i + 1} scrolls`);
          break;
        }
      } else {
        noChangeCount = 0;
      }
      previousHeight = currentHeight;
    }

    // Now extract all groups from the fully loaded page
    log.debug("Extracting group names...");
    const groups = await page.evaluate(() => {
      const results = [];
      const seen = new Set();
      const skipPaths = new Set([
        "joins",
        "feed",
        "discover",
        "notifications",
        "settings",
        "create",
        "search",
        "explore",
        "highlights",
        "suggested",
      ]);
      const links = document.querySelectorAll('a[href*="/groups/"]');

      for (const link of links) {
        const href = link.getAttribute("href") || "";
        const match = href.match(/\/groups\/([A-Za-z0-9._-]+)\/?/);
        if (!match) continue;

        const groupSlug = match[1];
        if (skipPaths.has(groupSlug.toLowerCase())) continue;
        if (seen.has(groupSlug)) continue;
        seen.add(groupSlug);

        let name = "";
        let image = null;

        // Try to find group image - look for img near this link
        const container =
          link.closest('[role="listitem"]') ||
          link.parentElement?.parentElement?.parentElement;
        if (container) {
          const img =
            container.querySelector("image[*|href]") ||
            container.querySelector('img[src*="scontent"]') ||
            container.querySelector('img[src*="fbcdn"]');
          if (img) {
            image =
              img.getAttribute("xlink:href") || img.getAttribute("src") || null;
          }
          // Also check SVG image elements
          if (!image) {
            const svgImg = container.querySelector("image");
            if (svgImg) {
              image =
                svgImg.getAttribute("xlink:href") ||
                svgImg.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
                null;
            }
          }
        }
        // Fallback: check for img inside or adjacent to the link
        if (!image) {
          const nearbyImg =
            link.querySelector("img") ||
            link.parentElement?.querySelector("img");
          if (
            nearbyImg &&
            nearbyImg.src &&
            (nearbyImg.src.includes("scontent") ||
              nearbyImg.src.includes("fbcdn"))
          ) {
            image = nearbyImg.src;
          }
        }

        // 1. aria-label on the link itself
        name = link.getAttribute("aria-label") || "";

        // 2. Check spans inside the link
        if (!name || name.length < 2) {
          const spans = link.querySelectorAll("span");
          for (const span of spans) {
            const text = span.textContent?.trim() || "";
            if (text.length >= 2 && text.length < 150) {
              name = text;
              break;
            }
          }
        }

        // 3. Walk up to parent/grandparent
        if (!name || name.length < 2) {
          let container = link.parentElement;
          for (let depth = 0; depth < 5 && container; depth++) {
            const siblingSpans = container.querySelectorAll("span");
            for (const span of siblingSpans) {
              const text = span.textContent?.trim() || "";
              if (
                text.length >= 2 &&
                text.length < 150 &&
                !text.includes("\n")
              ) {
                name = text;
                break;
              }
            }
            if (name && name.length >= 2) break;
            container = container.parentElement;
          }
        }

        // 4. Last resort: first line of innerText
        if (!name || name.length < 2) {
          const firstLine = (link.innerText || "").split("\n")[0]?.trim() || "";
          if (firstLine.length >= 2 && firstLine.length < 150) {
            name = firstLine;
          }
        }

        if (!name || name.length < 2) {
          name = `קבוצה: ${groupSlug}`;
        }

        // Try to extract member count and privacy type from nearby text
        let memberCount = null;
        let privacyType = null;
        if (container) {
          const allText = container.innerText || "";

          // Try multiple patterns for member count
          // English: "1,234 members", "1.2K members", "1.2M members"
          // Hebrew: "1,234 חברים", "1.2 אלף חברים", "12K חברים", "1 חבר"
          // Facebook compact: "12K", "1.2M", "1,234"
          const patterns = [
            {
              re: /(\d[\d,.]*)\s*(?:M|m|מיליון)\s*(?:members?|חבר[יו]?[ם]?[ת]?|חברות)/i,
              mult: 1000000,
            },
            {
              re: /(\d[\d,.]*)\s*(?:K|k|אלף)\s*(?:members?|חבר[יו]?[ם]?[ת]?|חברות)/i,
              mult: 1000,
            },
            {
              re: /(\d[\d,.]*)\s*(?:members?|חבר[יו]?[ם]?[ת]?|חברות)/i,
              mult: 1,
            },
            {
              re: /(?:members?|חבר[יו]?[ם]?[ת]?|חברות)\s*[:\s]*(\d[\d,.]*)\s*(?:M|m|מיליון)/i,
              mult: 1000000,
            },
            {
              re: /(?:members?|חבר[יו]?[ם]?[ת]?|חברות)\s*[:\s]*(\d[\d,.]*)\s*(?:K|k|אלף)/i,
              mult: 1000,
            },
            {
              re: /(?:members?|חבר[יו]?[ם]?[ת]?|חברות)\s*[:\s]*(\d[\d,.]*)/i,
              mult: 1,
            },
            // Patterns without the word "members" - look for number + K/M near group context
            { re: /(\d[\d,.]*)\s*(?:M)\s/, mult: 1000000 },
            { re: /(\d[\d,.]*)\s*(?:K)\s/, mult: 1000 },
            // Hebrew: "חברים: 1,234" or just "1,234 חברים" or "1 חבר"
            { re: /(\d[\d,.]*)\s*חבר[יו]?[ם]?[ת]?/, mult: 1 },
            { re: /חבר[יו]?[ם]?[ת]?\s*(\d[\d,.]*)/, mult: 1 },
            // Participant patterns (משתתפים/משתתף)
            {
              re: /(\d[\d,.]*)\s*(?:משתתפ[יו]?[ם]?[ת]?|participants?)/i,
              mult: 1,
            },
            {
              re: /(?:משתתפ[יו]?[ם]?[ת]?|participants?)\s*(\d[\d,.]*)/i,
              mult: 1,
            },
          ];

          // Helper: normalize number string handling comma-as-decimal (e.g. "98,8" → 98.8)
          const parseNum = (raw, mult) => {
            let str = raw;
            if (mult > 1 && /^\d+,\d{1,2}$/.test(str)) {
              // Comma is decimal separator (e.g. "98,8K" means 98.8K)
              str = str.replace(",", ".");
            } else {
              str = str.replace(/,/g, "");
            }
            return Math.round(parseFloat(str) * mult);
          };

          for (const { re, mult } of patterns) {
            const m = allText.match(re);
            if (m) {
              const parsed = parseNum(m[1], mult);
              if (parsed > 0) {
                memberCount = parsed;
                break;
              }
            }
          }

          // Also look in span elements for structured member count text
          if (!memberCount) {
            const spans = container.querySelectorAll("span");
            for (const span of spans) {
              const spanText = span.textContent?.trim() || "";
              if (/member|חבר/i.test(spanText) && /\d/.test(spanText)) {
                const numMatch = spanText.match(
                  /([\d,.]+)\s*(?:K|k|M|m|אלף|מיליון)?/,
                );
                if (numMatch) {
                  let mult = 1;
                  if (/\dM|\dm|מיליון/i.test(spanText)) mult = 1000000;
                  else if (/\dK|\dk|אלף/i.test(spanText)) mult = 1000;
                  const parsed = parseNum(numMatch[1], mult);
                  if (parsed > 0) {
                    memberCount = parsed;
                    break;
                  }
                }
              }
            }
          }

          // Check privacy
          if (/private|פרטית|סגורה/i.test(allText)) {
            privacyType = "private";
          } else if (/public|ציבורית|פתוחה/i.test(allText)) {
            privacyType = "public";
          }
        }

        results.push({
          id: groupSlug,
          name,
          image: image || null,
          url: `https://www.facebook.com/groups/${groupSlug}/`,
          memberCount,
          privacyType,
        });
      }

      return results;
    });

    log.info(`Total groups found: ${groups.length}`);

    // NOTE: Member count / privacy type enrichment is handled separately
    // by the refreshGroupsMetadata job (runs in background, not blocking sync)

    // Save updated storage state back to DB
    const updatedState = await context.storageState();
    if (userId) {
      await saveUserStorageState(userId, updatedState);
    }
    // Also update legacy file
    await context.storageState({ path: LEGACY_STORAGE_STATE_PATH });

    return groups;
  } finally {
    await browser.close();
  }
}

// ─── Screenshot ───────────────────────────────────────────

export async function captureGroupScreenshot(
  groupName,
  _accessToken,
  targetUrl,
  userId,
) {
  const storageState = await getStorageState(userId);
  const headless = process.env.FB_AUTOMATION_HEADLESS === "true";

  const browser = await launchBrowser({ headless });

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
    await page.waitForTimeout(1500);
    const currentUrl = page.url();
    log.debug("Facebook home URL:", currentUrl);

    if (/login|checkpoint/i.test(currentUrl)) {
      log.debug("Not logged in - redirected to login page");
      throw new Error("FACEBOOK_SESSION_REQUIRED");
    }

    if (targetUrl) {
      log.debug("Navigating to target URL:", targetUrl);
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      log.debug("Arrived at:", page.url());
      await page.waitForTimeout(3000);
    } else {
      const searchQuery = encodeURIComponent(groupName);
      const groupSearchUrl = `https://www.facebook.com/search/groups/?q=${searchQuery}`;
      log.debug(`Navigating to groups search: ${groupSearchUrl}`);
      await page.goto(groupSearchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(4000);

      const allLinks = page.locator('a[href*="/groups/"]');
      const totalLinks = await allLinks.count();
      log.debug(`Found ${totalLinks} total links with /groups/ in href`);

      let clicked = false;
      for (let i = 0; i < totalLinks; i++) {
        const href = await allLinks.nth(i).getAttribute("href");
        if (href && /\/groups\/\d+/.test(href)) {
          log.debug(`Clicking group link: ${href}`);
          await allLinks.nth(i).click();
          clicked = true;
          await page.waitForTimeout(4000);
          break;
        }
      }

      if (!clicked) {
        log.debug(
          "No numeric group link found, taking screenshot of search results page",
        );
      }
    }

    const bodyText = ((await page.textContent("body")) || "").trim();
    if (isBlockedPage(bodyText)) {
      throw new Error("FACEBOOK_BLOCKED_OR_NOT_AVAILABLE");
    }

    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(1000);

    log.debug("Taking screenshot...");
    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    log.debug("Screenshot taken, size:", screenshot.length, "bytes");

    // Save updated storage state
    if (userId) {
      const updatedState = await context.storageState();
      await saveUserStorageState(userId, updatedState);
    }

    return screenshot.toString("base64");
  } finally {
    await browser.close();
  }
}

// ─── Publish to group ─────────────────────────────────────

export async function publishToGroup(groupUrl, text, imagePath, options = {}) {
  const { anonymous = false, location = "", userId, images = [] } = options;
  // Use images array if provided, otherwise fall back to single imagePath
  const allImagePaths =
    images.length > 0 ? images : imagePath ? [imagePath] : [];
  const storageState = await getStorageState(userId);

  const browser = await launchBrowser();

  try {
    const context = await createBrowserContext(browser, {
      userId,
      storageState,
    });
    const page = await context.newPage();

    // Go to Facebook first to verify login
    await page.goto("https://www.facebook.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(1500);
    const currentUrl = page.url();
    log.debug("Facebook home URL:", currentUrl);

    if (/login|checkpoint/i.test(currentUrl)) {
      throw new Error("FACEBOOK_SESSION_REQUIRED");
    }

    // Navigate to the group
    log.debug("Navigating to group:", groupUrl);
    await page.goto(groupUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    log.debug("Arrived at:", page.url());

    // Click on the "Write something..." post composer box
    const composerSelectors = [
      'div[role="button"] span:has-text("כתב/י משהו")',
      'div[role="button"] span:has-text("כתוב משהו")',
      'div[role="button"] span:has-text("Write something")',
      'div[role="button"] span:has-text("מה חדש")',
      'div[role="button"] span:has-text("What\'s on your mind")',
    ];

    let composerClicked = false;
    for (const selector of composerSelectors) {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        log.debug("Found composer with selector:", selector);
        await el.click();
        composerClicked = true;
        break;
      }
    }

    if (!composerClicked) {
      const fallback = page
        .locator('[role="button"]')
        .filter({ hasText: /כתב|משהו|Write|what's/i })
        .first();
      if (await fallback.isVisible({ timeout: 2000 }).catch(() => false)) {
        log.debug("Found composer via fallback");
        await fallback.click();
        composerClicked = true;
      }
    }

    if (!composerClicked) {
      throw new Error("POST_COMPOSER_NOT_FOUND");
    }

    await page.waitForTimeout(2000);

    // Handle anonymous posting toggle
    if (anonymous) {
      log.debug("Attempting to enable anonymous posting...");
      const anonToggleSelectors = [
        'div[role="dialog"] div[role="switch"][aria-label*="אנונימי"]',
        'div[role="dialog"] div[role="switch"][aria-label*="anonymous"]',
        'div[role="dialog"] div[role="switch"][aria-label*="Anonymous"]',
        'div[role="dialog"] input[type="checkbox"]',
        'div[role="dialog"] div[role="switch"]',
      ];
      let anonEnabled = false;
      for (const selector of anonToggleSelectors) {
        const toggle = page.locator(selector).first();
        if (await toggle.isVisible({ timeout: 2000 }).catch(() => false)) {
          const checked = await toggle
            .getAttribute("aria-checked")
            .catch(() => null);
          if (checked !== "true") {
            await toggle.click();
            log.debug("Anonymous toggle clicked");
          }
          anonEnabled = true;
          break;
        }
      }

      if (anonEnabled) {
        await page.waitForTimeout(1500);
        const confirmSelectors = [
          'div[role="dialog"] div[role="button"]:has-text("Got it")',
          'div[role="dialog"] div[role="button"]:has-text("הבנתי")',
          'div[role="dialog"] div[role="button"][aria-label="Got it"]',
          'div[role="dialog"] div[role="button"][aria-label="הבנתי"]',
        ];
        for (const selector of confirmSelectors) {
          const btn = page.locator(selector).first();
          if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await btn.click();
            log.debug('Anonymous confirmation "Got it" clicked');
            break;
          }
        }
        await page.waitForTimeout(1000);
      }
    }

    // Type the text into the composer
    const editor = page
      .locator('div[role="dialog"] div[role="textbox"][contenteditable="true"]')
      .first();
    await editor.waitFor({ state: "visible", timeout: 10000 });
    log.debug("Typing text...");
    await editor.click();
    await editor.fill(text);
    await page.waitForTimeout(1000);

    // If image provided, upload it
    const existingImages = allImagePaths.filter((p) => fs.existsSync(p));
    if (existingImages.length > 0) {
      log.debug("Uploading images:", existingImages);

      const photoButtonSelectors = [
        'div[role="dialog"] div[role="button"] span:has-text("תמונה/סרטון")',
        'div[role="dialog"] div[role="button"] span:has-text("Photo/video")',
        'div[role="dialog"] div[role="button"] span:has-text("Photo/Video")',
      ];

      let photoClicked = false;
      for (const selector of photoButtonSelectors) {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await btn.click();
          photoClicked = true;
          log.debug("Clicked photo button");
          break;
        }
      }

      if (!photoClicked) {
        const iconBtn = page
          .locator(
            'div[role="dialog"] [aria-label*="תמונה"], div[role="dialog"] [aria-label*="Photo"], div[role="dialog"] [aria-label*="photo"]',
          )
          .first();
        if (await iconBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await iconBtn.click();
          photoClicked = true;
          log.debug("Clicked photo icon button");
        }
      }

      await page.waitForTimeout(1000);
      const fileInput = page
        .locator('div[role="dialog"] input[type="file"]')
        .first();
      await fileInput.setInputFiles(
        existingImages.length === 1 ? existingImages[0] : existingImages,
      );
      log.debug("Image file(s) sent to input");

      try {
        await page
          .locator(
            'div[role="dialog"] img[src*="blob:"], div[role="dialog"] img[alt], div[role="dialog"] div[role="img"]',
          )
          .first()
          .waitFor({ state: "visible", timeout: 15000 });
        log.debug("Image preview appeared");
      } catch {
        log.debug("Image preview not detected, waiting extra time...");
      }
      await page.waitForTimeout(3000);
      log.debug("Image uploaded");
    }

    // Handle location if provided
    if (location) {
      log.debug("Adding location:", location);
      try {
        const locationBtnSelectors = [
          'div[role="dialog"] [aria-label*="צ\'ק אין"]',
          'div[role="dialog"] [aria-label*="Check in"]',
          'div[role="dialog"] [aria-label*="check in"]',
          'div[role="dialog"] [aria-label*="מיקום"]',
          'div[role="dialog"] [aria-label*="location"]',
          'div[role="dialog"] [aria-label*="Location"]',
        ];
        let locationClicked = false;
        for (const selector of locationBtnSelectors) {
          const btn = page.locator(selector).first();
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await btn.click();
            locationClicked = true;
            log.debug("Clicked location button");
            break;
          }
        }

        if (locationClicked) {
          await page.waitForTimeout(2000);

          const locationInputSelectors = [
            'input[placeholder*="Where"]',
            'input[placeholder*="where"]',
            'input[placeholder*="איפה"]',
            'input[placeholder*="מיקום"]',
            'input[type="search"]',
            'input[role="combobox"]',
          ];

          let locationInput = null;
          for (const selector of locationInputSelectors) {
            const inp = page.locator(selector).first();
            if (await inp.isVisible({ timeout: 2000 }).catch(() => false)) {
              locationInput = inp;
              log.debug("Found location input:", selector);
              break;
            }
          }

          if (locationInput) {
            await locationInput.click();
            await locationInput.fill(location);
            log.debug("Typed location:", location);

            await page.waitForTimeout(3000);

            const resultSelectors = [
              'div[role="listbox"] div[role="option"]',
              'ul[role="listbox"] li',
              'div[role="dialog"] div[role="option"]',
              'div[role="dialog"] li[role="option"]',
            ];

            let resultClicked = false;
            const locationLower = location.toLowerCase();

            for (const selector of resultSelectors) {
              const results = page.locator(selector);
              const rCount = await results.count().catch(() => 0);
              if (rCount === 0) continue;

              let firstResult = null;
              for (let ri = 0; ri < Math.min(rCount, 7); ri++) {
                const resultEl = results.nth(ri);
                const resultText = (
                  await resultEl.innerText().catch(() => "")
                ).toLowerCase();
                log.debug(
                  `  location result[${ri}]: "${resultText.substring(0, 80)}"`,
                );

                if (!firstResult) firstResult = resultEl;

                if (resultText.includes(locationLower)) {
                  await resultEl.click();
                  resultClicked = true;
                  log.debug(
                    "Location matched and selected:",
                    resultText.substring(0, 60),
                  );
                  break;
                }
              }

              // If no exact match, select the first result (Facebook's best match)
              if (!resultClicked && firstResult) {
                await firstResult.click();
                resultClicked = true;
                log.debug(
                  "No exact match — selected first Facebook suggestion",
                );
              }

              if (resultClicked) break;
            }

            if (!resultClicked) {
              log.debug(
                "No location results found, going back without location",
              );
              const backBtnSelectors = [
                'div[role="dialog"] [aria-label*="Back"]',
                'div[role="dialog"] [aria-label*="חזרה"]',
                'div[role="dialog"] [aria-label*="back"]',
                'div[role="dialog"] [aria-label*="Close"]',
                'div[role="dialog"] [aria-label*="סגור"]',
              ];
              for (const selector of backBtnSelectors) {
                const backBtn = page.locator(selector).first();
                if (
                  await backBtn.isVisible({ timeout: 1500 }).catch(() => false)
                ) {
                  await backBtn.click();
                  log.debug("Clicked back from location screen");
                  break;
                }
              }
            }

            await page.waitForTimeout(2000);
          } else {
            log.debug("Location input not found");
          }
        } else {
          log.debug("Location button not found, skipping");
        }
      } catch (e) {
        log.debug("Location error (non-fatal):", e.message);
      }
    }

    // Click the submit/post button
    let posted = false;

    const postButtonTexts = [
      "post",
      "publish",
      "submit",
      "send",
      "פרסם",
      "פרסום",
      "שלח",
      "publier",
      "publié",
      "publicar",
      "veröffentlichen",
      "pubblicare",
      "pubblica",
      "опубликовать",
      "نشر",
      "yayınla",
      "opublikuj",
      "publiceren",
      "plaatsen",
      "פאָרלייגן",
    ];
    const postTextRegex = new RegExp(`^(${postButtonTexts.join("|")})$`, "i");

    // Strategy 1: aria-label match
    for (const label of postButtonTexts) {
      const selector = `div[role="dialog"] div[role="button"][aria-label="${label}" i]`;
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        log.debug("Clicking post button (aria-label):", label);
        await btn.click();
        posted = true;
        break;
      }
    }

    // Strategy 2: scan div[role="button"] for exact text match
    if (!posted) {
      const allButtons = page.locator('div[role="dialog"] div[role="button"]');
      const count = await allButtons.count();
      log.debug("Scanning", count, "dialog buttons...");
      for (let i = count - 1; i >= 0; i--) {
        const btn = allButtons.nth(i);
        const text = (await btn.innerText().catch(() => "")).trim();
        if (text) log.debug(`  button[${i}]: "${text.substring(0, 50)}"`);
        if (postTextRegex.test(text)) {
          log.debug("Found post button at index", i, ":", text);
          await btn.click();
          posted = true;
          break;
        }
      }
    }

    // Strategy 3: native <button> elements
    if (!posted) {
      const nativeButtons = page.locator('div[role="dialog"] button');
      const nbCount = await nativeButtons.count();
      log.debug("Checking", nbCount, "native <button> elements...");
      for (let i = nbCount - 1; i >= 0; i--) {
        const btn = nativeButtons.nth(i);
        const text = (await btn.innerText().catch(() => "")).trim();
        const label = (
          (await btn.getAttribute("aria-label").catch(() => "")) || ""
        ).trim();
        if (text || label)
          log.debug(
            `  <button>[${i}]: text="${text.substring(0, 50)}" label="${label}"`,
          );
        if (postTextRegex.test(text) || postTextRegex.test(label)) {
          log.debug("Found native post button at index", i);
          await btn.click();
          posted = true;
          break;
        }
      }
    }

    if (!posted) {
      throw new Error("POST_BUTTON_NOT_FOUND");
    }

    // Set up a listener for post creation responses BEFORE waiting
    let postUrl = null;
    const postIdPromise = new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 12000);
      page.on("response", async (response) => {
        try {
          const url = response.url();
          // Facebook GraphQL mutation responses contain the new post ID
          if (
            response.status() === 200 &&
            (url.includes("/api/graphql") || url.includes("/graphql"))
          ) {
            const text = await response.text().catch(() => "");
            // Look for story/post IDs in GraphQL responses
            const storyMatch = text.match(/"story_id"\s*:\s*"(\d+)"/);
            const postIdMatch = text.match(/"post_id"\s*:\s*"(\d+)"/);
            const composerMatch = text.match(
              /"id"\s*:\s*"(\d{10,})".*?"__typename"\s*:\s*"Story"/,
            );
            const foundId =
              storyMatch?.[1] || postIdMatch?.[1] || composerMatch?.[1];
            if (foundId) {
              clearTimeout(timeout);
              resolve(foundId);
            }
          }
        } catch {
          /* ignore */
        }
      });
    });

    // Wait for the post to be submitted
    log.debug("Waiting for post to be submitted...");
    await page.waitForTimeout(6000);

    // Try to get the post ID from the GraphQL response
    const postIdFromResponse = await postIdPromise;
    const groupId = groupUrl.match(/groups\/([^/]+)/)?.[1] || "";

    if (postIdFromResponse) {
      postUrl = `https://www.facebook.com/groups/${groupId}/posts/${postIdFromResponse}`;
      log.info("Post URL captured from GraphQL response:", postUrl);
    }

    // Fallback: navigate to group page and scrape
    if (!postUrl) {
      try {
        const groupFeedUrl = groupUrl.replace(/\/$/, "");
        await page.goto(groupFeedUrl, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        await page.waitForTimeout(4000);

        // Collect ALL links on page that could be post permalinks
        const allPostLinks = await page.evaluate((gid) => {
          const links = Array.from(document.querySelectorAll("a[href]"));
          return links
            .map((a) => ({ href: a.href }))
            .filter(
              (l) =>
                l.href.includes("/posts/") ||
                l.href.includes("/permalink/") ||
                l.href.includes("story_fbid"),
            )
            .slice(0, 20);
        }, groupId);
        log.info("Fallback: post-like links found:", allPostLinks.length);

        const groupLink = allPostLinks.find((l) =>
          l.href.includes(`/groups/${groupId}/`),
        );
        if (groupLink) {
          postUrl = groupLink.href;
        } else if (allPostLinks.length > 0) {
          postUrl = allPostLinks[0].href;
        }

        // Ensure full URL and clean tracking params
        if (postUrl && !postUrl.startsWith("http")) {
          postUrl = `https://www.facebook.com${postUrl}`;
        }
        if (postUrl) {
          try {
            const u = new URL(postUrl);
            u.search = "";
            postUrl = u.toString();
          } catch {
            /* keep as-is */
          }
        }
      } catch (e) {
        log.debug("Fallback URL detection error (non-fatal):", e.message);
      }
    }

    if (!postUrl) {
      log.debug("Could not find post URL");
    }

    // Take a screenshot of the result
    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    log.debug(
      "Post published successfully! Screenshot size:",
      screenshot.length,
    );

    // Save updated storage state
    if (userId) {
      const updatedState = await context.storageState();
      await saveUserStorageState(userId, updatedState);
    }

    return {
      success: true,
      screenshot: screenshot.toString("base64"),
      postUrl,
    };
  } finally {
    await browser.close();
  }
}

// ─── Publish to user's personal profile ───────────────────

export async function publishToProfile(text, imagePath, options = {}) {
  const { location = "", userId } = options;
  const storageState = await getStorageState(userId);

  const browser = await launchBrowser();

  try {
    const context = await createBrowserContext(browser, {
      userId,
      storageState,
    });
    const page = await context.newPage();

    // Navigate to profile page
    await page.goto("https://www.facebook.com/profile", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    log.debug("Profile page URL:", currentUrl);

    if (/login|checkpoint/i.test(currentUrl)) {
      throw new Error("FACEBOOK_SESSION_REQUIRED");
    }

    // Click on "What's on your mind?" composer
    const composerSelectors = [
      'div[role="button"] span:has-text("What\'s on your mind")',
      'div[role="button"] span:has-text("מה חדש אצלך")',
      'div[role="button"] span:has-text("על מה את/ה חושב")',
      'div[role="button"] span:has-text("מה עובר עליך")',
      'div[role="button"] span:has-text("מה נשמע")',
      'div[role="button"] span:has-text("במה את/ה חושב/ת")',
    ];

    let composerClicked = false;
    for (const selector of composerSelectors) {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        log.debug("Found profile composer with selector:", selector);
        await el.click();
        composerClicked = true;
        break;
      }
    }

    if (!composerClicked) {
      const fallback = page
        .locator('[role="button"]')
        .filter({ hasText: /mind|חדש|חושב|עובר|נשמע/i })
        .first();
      if (await fallback.isVisible({ timeout: 2000 }).catch(() => false)) {
        log.debug("Found profile composer via fallback");
        await fallback.click();
        composerClicked = true;
      }
    }

    if (!composerClicked) {
      throw new Error("PROFILE_COMPOSER_NOT_FOUND");
    }

    await page.waitForTimeout(2000);

    // Type text into the composer dialog
    const editor = page
      .locator('div[role="dialog"] div[role="textbox"][contenteditable="true"]')
      .first();
    await editor.waitFor({ state: "visible", timeout: 10000 });
    log.debug("Typing text into profile composer...");
    await editor.click();
    await editor.fill(text);
    await page.waitForTimeout(1000);

    // Upload image if provided
    if (imagePath && fs.existsSync(imagePath)) {
      log.debug("Uploading image to profile post:", imagePath);

      const photoButtonSelectors = [
        'div[role="dialog"] div[role="button"] span:has-text("Photo/video")',
        'div[role="dialog"] div[role="button"] span:has-text("Photo/Video")',
        'div[role="dialog"] div[role="button"] span:has-text("תמונה/סרטון")',
      ];

      let photoClicked = false;
      for (const selector of photoButtonSelectors) {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await btn.click();
          photoClicked = true;
          log.debug("Clicked photo button");
          break;
        }
      }

      if (!photoClicked) {
        const iconBtn = page
          .locator(
            'div[role="dialog"] [aria-label*="Photo"], div[role="dialog"] [aria-label*="תמונה"]',
          )
          .first();
        if (await iconBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await iconBtn.click();
          photoClicked = true;
        }
      }

      await page.waitForTimeout(1000);
      const fileInput = page
        .locator('div[role="dialog"] input[type="file"]')
        .first();
      await fileInput.setInputFiles(imagePath);
      log.debug("Image file sent to input");

      try {
        await page
          .locator(
            'div[role="dialog"] img[src*="blob:"], div[role="dialog"] img[alt], div[role="dialog"] div[role="img"]',
          )
          .first()
          .waitFor({ state: "visible", timeout: 15000 });
        log.debug("Image preview appeared");
      } catch {
        log.debug("Image preview not detected, waiting extra time...");
      }
      await page.waitForTimeout(3000);
    }

    // Handle location if provided
    if (location) {
      log.debug("Adding location to profile post:", location);
      try {
        const locationBtnSelectors = [
          'div[role="dialog"] [aria-label*="Check in"]',
          'div[role="dialog"] [aria-label*="צ\'ק אין"]',
          'div[role="dialog"] [aria-label*="מיקום"]',
          'div[role="dialog"] [aria-label*="location"]',
        ];
        let locationClicked = false;
        for (const selector of locationBtnSelectors) {
          const btn = page.locator(selector).first();
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await btn.click();
            locationClicked = true;
            break;
          }
        }
        if (locationClicked) {
          await page.waitForTimeout(2000);
          const locationInput = page
            .locator('input[type="search"], input[role="combobox"]')
            .first();
          if (
            await locationInput.isVisible({ timeout: 2000 }).catch(() => false)
          ) {
            await locationInput.click();
            await locationInput.fill(location);
            await page.waitForTimeout(3000);
            const firstResult = page
              .locator('div[role="option"], li[role="option"]')
              .first();
            if (
              await firstResult.isVisible({ timeout: 3000 }).catch(() => false)
            ) {
              await firstResult.click();
              await page.waitForTimeout(1000);
            }
          }
        }
      } catch (e) {
        log.debug("Profile location error (non-fatal):", e.message);
      }
    }

    // Click "Next" button if it appears (profile posts have a 2-step flow)
    const nextSelectors = [
      'div[role="dialog"] div[role="button"]:has-text("Next")',
      'div[role="dialog"] div[role="button"]:has-text("הבא")',
      'div[role="dialog"] button:has-text("Next")',
      'div[role="dialog"] button:has-text("הבא")',
    ];
    for (const selector of nextSelectors) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        log.debug("Clicking 'Next' button in profile composer");
        await btn.click();
        await page.waitForTimeout(2000);
        break;
      }
    }

    // Click Post/Publish button
    let posted = false;
    const postButtonTexts = ["post", "publish", "פרסם", "פרסום", "שלח"];
    const postTextRegex = new RegExp(`^(${postButtonTexts.join("|")})$`, "i");

    // Strategy 1: aria-label match
    for (const label of postButtonTexts) {
      const selector = `div[role="dialog"] div[role="button"][aria-label="${label}" i]`;
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        log.debug("Clicking profile post button (aria-label):", label);
        await btn.click();
        posted = true;
        break;
      }
    }

    // Strategy 2: scan buttons for text match
    if (!posted) {
      const allButtons = page.locator('div[role="dialog"] div[role="button"]');
      const count = await allButtons.count();
      for (let i = count - 1; i >= 0; i--) {
        const btn = allButtons.nth(i);
        const btnText = (await btn.innerText().catch(() => "")).trim();
        if (postTextRegex.test(btnText)) {
          log.debug("Found profile post button:", btnText);
          await btn.click();
          posted = true;
          break;
        }
      }
    }

    // Strategy 3: native buttons
    if (!posted) {
      const nativeButtons = page.locator('div[role="dialog"] button');
      const nbCount = await nativeButtons.count();
      for (let i = nbCount - 1; i >= 0; i--) {
        const btn = nativeButtons.nth(i);
        const btnText = (await btn.innerText().catch(() => "")).trim();
        if (postTextRegex.test(btnText)) {
          await btn.click();
          posted = true;
          break;
        }
      }
    }

    if (!posted) {
      throw new Error("PROFILE_POST_BUTTON_NOT_FOUND");
    }

    // Wait for post to be submitted
    log.debug("Waiting for profile post to be submitted...");
    await page.waitForTimeout(6000);

    // Try to capture post URL from GraphQL response
    let postUrl = null;
    try {
      await page.goto("https://www.facebook.com/profile", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      await page.waitForTimeout(3000);

      const topPostLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a[href]"));
        const postLink = links.find(
          (l) => l.href.includes("/posts/") || l.href.includes("/permalink/"),
        );
        return postLink?.href || null;
      });
      if (topPostLink) {
        postUrl = topPostLink;
        try {
          const u = new URL(postUrl);
          u.search = "";
          postUrl = u.toString();
        } catch {
          /* keep as-is */
        }
      }
    } catch (e) {
      log.debug("Profile post URL detection error (non-fatal):", e.message);
    }

    // Take screenshot
    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    log.debug("Profile post published! Screenshot size:", screenshot.length);

    // Save updated storage state
    if (userId) {
      const updatedState = await context.storageState();
      await saveUserStorageState(userId, updatedState);
    }

    return {
      success: true,
      screenshot: screenshot.toString("base64"),
      postUrl,
    };
  } finally {
    await browser.close();
  }
}

// ─── Scrape group metadata (member count + privacy) ───────

/**
 * Visit each group page and extract member count and privacy type.
 * Uses the header area text which shows e.g. "Private group · 88.7K members"
 * @param {string} userId - user whose session to use
 * @param {Array<{groupId: string, groupUrl: string}>} groups - groups to scrape
 * @returns {Array<{groupId: string, memberCount: number|null, privacyType: string|null}>}
 */
export async function scrapeGroupsMetadata(userId, groups) {
  const storageState = await getStorageState(userId);

  const browser = await launchBrowser();

  const results = [];
  const CONCURRENCY = 3; // Number of parallel tabs

  try {
    const context = await createBrowserContext(browser, {
      userId,
      storageState,
    });

    // Verify we're logged in with a temp page
    const checkPage = await context.newPage();
    await checkPage.goto("https://www.facebook.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await checkPage.waitForTimeout(2000);
    if (!(await hasFacebookLoginCookies(context))) {
      await checkPage.close();
      throw new Error("FACEBOOK_SESSION_REQUIRED");
    }
    await checkPage.close();

    // Process groups in parallel batches
    for (let i = 0; i < groups.length; i += CONCURRENCY) {
      const batch = groups.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (group) => {
          const page = await context.newPage();
          try {
            const url =
              group.groupUrl ||
              `https://www.facebook.com/groups/${group.groupId}/`;
            await page.goto(url, {
              waitUntil: "domcontentloaded",
              timeout: 20000,
            });
            await page.waitForTimeout(2500);

            const metadata = await page.evaluate(() => {
              let memberCount = null;
              let privacyType = null;

              const allSpans = document.querySelectorAll("span, a");

              const memberPatterns = [
                {
                  re: /([\d,.]+)\s*K\s*(?:members?|חבר[יו]?[ם]?[ת]?|חברות)/i,
                  mult: 1000,
                },
                {
                  re: /([\d,.]+)\s*M\s*(?:members?|חבר[יו]?[ם]?[ת]?|חברות)/i,
                  mult: 1000000,
                },
                {
                  re: /([\d,.]+)\s*(?:אלף)\s*(?:חבר[יו]?[ם]?[ת]?|חברות|members?)/i,
                  mult: 1000,
                },
                {
                  re: /([\d,.]+)\s*(?:מיליון)\s*(?:חבר[יו]?[ם]?[ת]?|חברות|members?)/i,
                  mult: 1000000,
                },
                {
                  re: /([\d,.]+)\s*(?:members?|חבר[יו]?[ם]?[ת]?|חברות)/i,
                  mult: 1,
                },
                {
                  re: /(?:members?|חבר[יו]?[ם]?[ת]?|חברות)\s*[·•:]\s*([\d,.]+)\s*K/i,
                  mult: 1000,
                },
                {
                  re: /(?:members?|חבר[יו]?[ם]?[ת]?|חברות)\s*[·•:]\s*([\d,.]+)\s*M/i,
                  mult: 1000000,
                },
                {
                  re: /(?:members?|חבר[יו]?[ם]?[ת]?|חברות)\s*[·•:]\s*([\d,.]+)/i,
                  mult: 1,
                },
                // Word-first patterns WITHOUT separator (e.g. "חבר 1", "members 5")
                {
                  re: /(?:members?|חבר[יו]?[ם]?[ת]?|חברות)\s+([\d,.]+)\s*K/i,
                  mult: 1000,
                },
                {
                  re: /(?:members?|חבר[יו]?[ם]?[ת]?|חברות)\s+([\d,.]+)\s*M/i,
                  mult: 1000000,
                },
                {
                  re: /(?:members?|חבר[יו]?[ם]?[ת]?|חברות)\s+([\d,.]+)/i,
                  mult: 1,
                },
                // Participant patterns (משתתפים/משתתף)
                {
                  re: /([\d,.]+)\s*(?:משתתפ[יו]?[ם]?[ת]?|משתתפות|participants?)/i,
                  mult: 1,
                },
                {
                  re: /(?:משתתפ[יו]?[ם]?[ת]?|משתתפות|participants?)\s*[·•:\s]\s*([\d,.]+)/i,
                  mult: 1,
                },
              ];

              // Handle comma-as-decimal (e.g. "98,8K" → 98.8)
              const parseNum = (raw, mult) => {
                let str = raw;
                if (mult > 1 && /^\d+,\d{1,2}$/.test(str)) {
                  str = str.replace(",", ".");
                } else {
                  str = str.replace(/,/g, "");
                }
                return Math.round(parseFloat(str) * mult);
              };

              for (const el of allSpans) {
                const text = el.textContent?.trim() || "";
                if (text.length < 1 || text.length > 100) continue;

                if (!memberCount) {
                  for (const { re, mult } of memberPatterns) {
                    const m = text.match(re);
                    if (m) {
                      const parsed = parseNum(m[1], mult);
                      if (parsed > 0) {
                        memberCount = parsed;
                        break;
                      }
                    }
                  }
                }

                if (!privacyType) {
                  if (
                    /private group|קבוצה פרטית|קבוצה סגורה|פרטית/i.test(text)
                  ) {
                    privacyType = "private";
                  } else if (
                    /public group|קבוצה ציבורית|קבוצה פתוחה|ציבורית/i.test(text)
                  ) {
                    privacyType = "public";
                  }
                }

                if (memberCount && privacyType) break;
              }

              if (!memberCount || !privacyType) {
                const bodyText =
                  document.body.innerText?.substring(0, 3000) || "";

                if (!memberCount) {
                  const bodyPatterns = [
                    {
                      re: /([\d,.]+)\s*K\s*(?:members?|חבר[יו]?[ם]?[ת]?|חברות)/i,
                      mult: 1000,
                    },
                    {
                      re: /([\d,.]+)\s*M\s*(?:members?|חבר[יו]?[ם]?[ת]?|חברות)/i,
                      mult: 1000000,
                    },
                    {
                      re: /([\d,.]+)\s*(?:אלף)\s*(?:חבר[יו]?[ם]?[ת]?|חברות|members?)/i,
                      mult: 1000,
                    },
                    {
                      re: /([\d,.]+)\s*(?:מיליון)\s*(?:חבר[יו]?[ם]?[ת]?|חברות|members?)/i,
                      mult: 1000000,
                    },
                    {
                      re: /([\d,.]+)\s*(?:members?|חבר[יו]?[ם]?[ת]?|חברות)/i,
                      mult: 1,
                    },
                    // Word-first patterns (e.g. "חבר 1", "members 5")
                    {
                      re: /(?:members?|חבר[יו]?[ם]?[ת]?|חברות)\s+([\d,.]+)/i,
                      mult: 1,
                    },
                    // Participant patterns (משתתפים/משתתף)
                    {
                      re: /([\d,.]+)\s*(?:משתתפ[יו]?[ם]?[ת]?|participants?)/i,
                      mult: 1,
                    },
                    {
                      re: /(?:משתתפ[יו]?[ם]?[ת]?|participants?)\s*[·•:\s]\s*([\d,.]+)/i,
                      mult: 1,
                    },
                  ];
                  for (const { re, mult } of bodyPatterns) {
                    const m = bodyText.match(re);
                    if (m) {
                      const parsed = parseNum(m[1], mult);
                      if (parsed > 0) {
                        memberCount = parsed;
                        break;
                      }
                    }
                  }
                }

                if (!privacyType) {
                  if (/private group|קבוצה פרטית|סגורה/i.test(bodyText)) {
                    privacyType = "private";
                  } else if (
                    /public group|קבוצה ציבורית|פתוחה/i.test(bodyText)
                  ) {
                    privacyType = "public";
                  }
                }
              }

              return { memberCount, privacyType };
            });

            log.debug("Group metadata scraped", {
              groupId: group.groupId,
              memberCount: metadata.memberCount,
              privacyType: metadata.privacyType,
            });

            return {
              groupId: group.groupId,
              memberCount: metadata.memberCount,
              privacyType: metadata.privacyType,
            };
          } catch (err) {
            log.debug(
              `Failed to scrape metadata for group ${group.groupId}: ${err.message}`,
            );
            return {
              groupId: group.groupId,
              memberCount: null,
              privacyType: null,
            };
          } finally {
            await page.close();
          }
        }),
      );

      results.push(...batchResults);

      // Small delay between batches to avoid rate limiting
      if (i + CONCURRENCY < groups.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Save updated storage state
    const updatedState = await context.storageState();
    if (userId) {
      await saveUserStorageState(userId, updatedState);
    }

    return results;
  } finally {
    await browser.close();
  }
}
