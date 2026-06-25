import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { encrypt, decrypt } from "./encryption.js";
import { createLogger } from "./logger.js";

const log = createLogger("fb-auto");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_STORAGE_STATE_PATH = path.join(
  __dirname,
  "..",
  "..",
  ".facebook-storage-state.json",
);

const prisma = new PrismaClient();

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: USER_AGENT,
    });
    const page = await context.newPage();
    await page.goto("https://www.facebook.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const maxWaitMs = 300000; // 5 minutes for checkpoint/2FA
    const startedAt = Date.now();
    let loggedIn = false;

    while (Date.now() - startedAt < maxWaitMs) {
      await page.waitForTimeout(3000);

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
    const storageState = await context.storageState();

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

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: USER_AGENT,
      storageState,
    });
    const page = await context.newPage();

    // Go to user's groups page
    log.debug("Navigating to your groups page...");
    await page.goto("https://www.facebook.com/groups/joins/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // Check if logged in
    if (/login|checkpoint/i.test(page.url())) {
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
      await page.waitForTimeout(1200);

      if (currentHeight === previousHeight) {
        noChangeCount++;
        if (noChangeCount >= 3) {
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
        const container = link.closest('[role="listitem"]') || link.parentElement?.parentElement?.parentElement;
        if (container) {
          const img = container.querySelector('image[*|href]') || container.querySelector('img[src*="scontent"]') || container.querySelector('img[src*="fbcdn"]');
          if (img) {
            image = img.getAttribute('xlink:href') || img.getAttribute('src') || null;
          }
          // Also check SVG image elements
          if (!image) {
            const svgImg = container.querySelector('image');
            if (svgImg) {
              image = svgImg.getAttribute('xlink:href') || svgImg.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || null;
            }
          }
        }
        // Fallback: check for img inside or adjacent to the link
        if (!image) {
          const nearbyImg = link.querySelector('img') || link.parentElement?.querySelector('img');
          if (nearbyImg && nearbyImg.src && (nearbyImg.src.includes('scontent') || nearbyImg.src.includes('fbcdn'))) {
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
          const allText = container.innerText || '';
          
          // Try multiple patterns for member count
          // English: "1,234 members", "1.2K members", "1.2M members"
          // Hebrew: "1,234 חברים", "1.2 אלף חברים", "12K חברים"
          // Facebook compact: "12K", "1.2M", "1,234"
          const patterns = [
            /(\d[\d,.]*)\s*(?:M|m|מיליון)\s*(?:members|חברי[ם]?|member)/i,
            /(\d[\d,.]*)\s*(?:K|k|אלף)\s*(?:members|חברי[ם]?|member)/i,
            /(\d[\d,.]*)\s*(?:members|חברי[ם]?|member)/i,
            /(?:members|חברי[ם]?|member)\s*[:\s]*(\d[\d,.]*)\s*(?:M|m|מיליון)?/i,
            /(?:members|חברי[ם]?|member)\s*[:\s]*(\d[\d,.]*)\s*(?:K|k|אלף)?/i,
            // Patterns without the word "members" - look for number + K/M near group context
            /(\d[\d,.]*)\s*(?:M)\s/,
            /(\d[\d,.]*)\s*(?:K)\s/,
            // Hebrew: "חברים: 1,234" or just "1,234 חברים"
            /(\d[\d,.]*)\s*חברי[ם]?/,
            /חברי[ם]?\s*(\d[\d,.]*)/,
          ];
          
          for (const pattern of patterns) {
            const m = allText.match(pattern);
            if (m) {
              let num = m[1].replace(/,/g, '');
              const matchedStr = m[0].toLowerCase();
              if (/m|מיליון/.test(matchedStr)) {
                num = parseFloat(num) * 1000000;
              } else if (/k|אלף/.test(matchedStr)) {
                num = parseFloat(num) * 1000;
              }
              const parsed = Math.round(Number(num));
              if (parsed > 0) {
                memberCount = parsed;
                break;
              }
            }
          }
          
          // Also look in span elements for structured member count text
          if (!memberCount) {
            const spans = container.querySelectorAll('span');
            for (const span of spans) {
              const spanText = span.textContent?.trim() || '';
              if (/member|חברי/i.test(spanText) && /\d/.test(spanText)) {
                const numMatch = spanText.match(/([\d,.]+)\s*(?:K|k|M|m|אלף|מיליון)?/);
                if (numMatch) {
                  let num = numMatch[1].replace(/,/g, '');
                  if (/M|m|מיליון/.test(spanText)) num = parseFloat(num) * 1000000;
                  else if (/K|k|אלף/.test(spanText)) num = parseFloat(num) * 1000;
                  const parsed = Math.round(Number(num));
                  if (parsed > 0) { memberCount = parsed; break; }
                }
              }
            }
          }
          
          // Check privacy
          if (/private|פרטית|סגורה/i.test(allText)) {
            privacyType = 'private';
          } else if (/public|ציבורית|פתוחה/i.test(allText)) {
            privacyType = 'public';
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

    // Second pass: visit each group page to get member count if missing
    const groupsNeedingInfo = groups.filter(g => !g.memberCount);
    if (groupsNeedingInfo.length > 0) {
      log.info(`Fetching member count for ${groupsNeedingInfo.length} groups...`);
      for (const group of groupsNeedingInfo) {
        try {
          await page.goto(group.url, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForTimeout(2000);
          const info = await page.evaluate(() => {
            let memberCount = null;
            let privacyType = null;
            const bodyText = document.body.innerText || '';
            
            // Look for member count patterns in the group header area
            // Facebook typically shows "X members" or "X חברים" in group headers
            const memberPatterns = [
              /([\d,.]+)\s*(?:M|מיליון)\s*(?:members|חברי[ם]?|total members|סה"כ חברים)/i,
              /([\d,.]+)\s*(?:K|אלף)\s*(?:members|חברי[ם]?|total members|סה"כ חברים)/i,
              /([\d,.]+)\s*(?:members|חברי[ם]?|total members|סה"כ חברים)/i,
              /(?:members|חברי[ם]?|total members|סה"כ חברים)\s*[·•:\s]*([\d,.]+)\s*(?:K|k|M|m|אלף|מיליון)?/i,
            ];
            
            // Focus on spans and links near the top of the page
            const headerElements = document.querySelectorAll('a[href*="members"], span');
            for (const el of headerElements) {
              const text = el.textContent?.trim() || '';
              if (text.length > 200) continue;
              for (const pattern of memberPatterns) {
                const m = text.match(pattern);
                if (m) {
                  let num = m[1].replace(/,/g, '');
                  if (/M|m|מיליון/i.test(text)) num = parseFloat(num) * 1000000;
                  else if (/K|k|אלף/i.test(text)) num = parseFloat(num) * 1000;
                  const parsed = Math.round(Number(num));
                  if (parsed > 0) { memberCount = parsed; break; }
                }
              }
              if (memberCount) break;
            }
            
            // Fallback: search full page text
            if (!memberCount) {
              for (const pattern of memberPatterns) {
                const m = bodyText.match(pattern);
                if (m) {
                  let num = m[1].replace(/,/g, '');
                  if (/M|m|מיליון/i.test(m[0])) num = parseFloat(num) * 1000000;
                  else if (/K|k|אלף/i.test(m[0])) num = parseFloat(num) * 1000;
                  const parsed = Math.round(Number(num));
                  if (parsed > 0) { memberCount = parsed; break; }
                }
              }
            }
            
            // Privacy from page text
            if (/private group|קבוצה פרטית|סגורה/i.test(bodyText)) {
              privacyType = 'private';
            } else if (/public group|קבוצה ציבורית|פתוחה/i.test(bodyText)) {
              privacyType = 'public';
            }
            
            return { memberCount, privacyType };
          });
          
          if (info.memberCount) group.memberCount = info.memberCount;
          if (info.privacyType && !group.privacyType) group.privacyType = info.privacyType;
        } catch (err) {
          log.debug(`Could not fetch info for ${group.name}: ${err.message}`);
        }
      }
    }

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

  const browser = await chromium.launch({
    headless,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: USER_AGENT,
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
  const { anonymous = false, location = "", userId } = options;
  const storageState = await getStorageState(userId);

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: USER_AGENT,
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
    if (imagePath && fs.existsSync(imagePath)) {
      log.debug("Uploading image:", imagePath);

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

              for (let ri = 0; ri < Math.min(rCount, 7); ri++) {
                const resultEl = results.nth(ri);
                const resultText = (
                  await resultEl.innerText().catch(() => "")
                ).toLowerCase();
                log.debug(
                  `  location result[${ri}]: "${resultText.substring(0, 80)}"`,
                );

                const hasMatch = resultText.includes(locationLower);

                if (hasMatch) {
                  await resultEl.click();
                  resultClicked = true;
                  log.debug(
                    "Location EXACT matched and selected:",
                    resultText.substring(0, 60),
                  );
                  break;
                }
              }
              if (resultClicked) break;
            }

            if (!resultClicked) {
              log.debug(
                "No matching location found, going back without location",
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

    // Wait for the post to be submitted
    log.debug("Waiting for post to be submitted...");
    await page.waitForTimeout(6000);

    // Try to find the URL of the newly published post
    let postUrl = null;
    try {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(2000);

      const groupId = groupUrl.match(/groups\/([^/]+)/)?.[1] || "";
      const permalinkSelector = `a[href*="/groups/${groupId}/posts/"], a[href*="/groups/${groupId}/permalink/"]`;
      const permalinks = page.locator(permalinkSelector);
      const plCount = await permalinks.count();
      log.debug("Found", plCount, "permalink links for this group");
      if (plCount > 0) {
        const href = await permalinks.first().getAttribute("href");
        if (href) {
          postUrl = href.startsWith("http")
            ? href
            : `https://www.facebook.com${href}`;
        }
      }

      if (!postUrl) {
        const timeLinks = page.locator(
          'a[role="link"][href*="/posts/"], a[role="link"][href*="/permalink/"]',
        );
        const tlCount = await timeLinks.count();
        log.debug("Found", tlCount, "time/role links");
        if (tlCount > 0) {
          const href = await timeLinks.first().getAttribute("href");
          if (href) {
            postUrl = href.startsWith("http")
              ? href
              : `https://www.facebook.com${href}`;
          }
        }
      }

      if (!postUrl) {
        const allLinks = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll("a[href]"));
          return links
            .map((a) => a.href)
            .filter(
              (h) =>
                h.includes("/posts/") ||
                h.includes("/permalink/") ||
                h.includes("story_fbid"),
            );
        });
        log.debug("Found", allLinks.length, "post-like links via evaluate");
        if (allLinks.length > 0) {
          postUrl = allLinks[0];
        }
      }
    } catch (e) {
      log.debug("Post URL detection error (non-fatal):", e.message);
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
