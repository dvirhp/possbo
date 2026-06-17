import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname = server/src/utils -> go up to server/
const STORAGE_STATE_PATH = path.join(__dirname, '..', '..', '.facebook-storage-state.json');
console.log('Storage state path:', STORAGE_STATE_PATH, 'exists:', fs.existsSync(STORAGE_STATE_PATH));
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function isLikelyLoggedOut(text) {
  const markers = [/log in/i, /sign in/i, /you must log in/i, /כניסה/i, /התחבר/i];
  return markers.some((p) => p.test(text));
}

function isBlockedPage(text) {
  const blockedPatterns = [/not found/i, /page isn't available/i, /content isn't available/i, /תוכן זה אינו זמין/i];
  return blockedPatterns.some((p) => p.test(text));
}

async function hasFacebookLoginCookies(context) {
  const cookies = await context.cookies('https://www.facebook.com');
  const names = new Set(cookies.map((cookie) => cookie.name));
  return names.has('c_user') && names.has('xs');
}

export async function bootstrapFacebookSession() {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: USER_AGENT,
    });
    const page = await context.newPage();
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const maxWaitMs = 180000;
    const startedAt = Date.now();
    let loggedIn = false;

    while (Date.now() - startedAt < maxWaitMs) {
      try {
        await page.waitForTimeout(2000);
      } catch {
        break;
      }

      try {
        if (await hasFacebookLoginCookies(context)) {
          loggedIn = true;
          break;
        }

        const currentPages = context.pages();
        for (const currentPage of currentPages) {
          const url = currentPage.url();
          if (/facebook\.com/i.test(url) && !/login|checkpoint/i.test(url)) {
            const bodyText = ((await currentPage.textContent('body')) || '').trim();
            if (!isLikelyLoggedOut(bodyText)) {
              loggedIn = true;
              break;
            }
          }
        }
      } catch {
        break;
      }

      if (loggedIn) {
        loggedIn = true;
        break;
      }
    }

    if (!loggedIn) {
      throw new Error('FACEBOOK_SESSION_NOT_COMPLETED');
    }

    await context.storageState({ path: STORAGE_STATE_PATH });

    return { ok: true };
  } finally {
    await browser.close();
  }
}

/**
 * Scrape list of groups the user is a member of from Facebook.
 * Returns array of { name, url, id, image }
 */
export async function scrapeMyGroups() {
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    throw new Error('FACEBOOK_SESSION_REQUIRED');
  }

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: USER_AGENT,
      storageState: STORAGE_STATE_PATH,
    });
    const page = await context.newPage();

    // Go to user's groups page
    console.log('Navigating to your groups page...');
    await page.goto('https://www.facebook.com/groups/joins/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // Check if logged in
    if (/login|checkpoint/i.test(page.url())) {
      throw new Error('FACEBOOK_SESSION_REQUIRED');
    }

    // Scroll down until no more new content loads
    let previousHeight = 0;
    let noChangeCount = 0;
    const maxScrollAttempts = 150;
    for (let i = 0; i < maxScrollAttempts; i++) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1200);

      if (currentHeight === previousHeight) {
        noChangeCount++;
        if (noChangeCount >= 3) {
          console.log(`Reached bottom after ${i + 1} scrolls`);
          break;
        }
      } else {
        noChangeCount = 0;
      }
      previousHeight = currentHeight;
    }

    // Now extract all groups from the fully loaded page
    console.log('Extracting group names...');
    const groups = await page.evaluate(() => {
      const results = [];
      const seen = new Set();
      // Skip known non-group paths
      const skipPaths = new Set([
        'joins', 'feed', 'discover', 'notifications', 'settings',
        'create', 'search', 'explore', 'highlights', 'suggested',
      ]);
      const links = document.querySelectorAll('a[href*="/groups/"]');

      for (const link of links) {
        const href = link.getAttribute('href') || '';
        // Match /groups/<id-or-slug> - accept numeric IDs and text slugs
        const match = href.match(/\/groups\/([A-Za-z0-9._-]+)\/?/);
        if (!match) continue;

        const groupSlug = match[1];
        // Skip navigation/utility paths
        if (skipPaths.has(groupSlug.toLowerCase())) continue;
        if (seen.has(groupSlug)) continue;
        seen.add(groupSlug);

        // Strategy: walk up from the link to find a container that holds the group name
        let name = '';

        // 1. aria-label on the link itself
        name = link.getAttribute('aria-label') || '';

        // 2. Check spans inside the link
        if (!name || name.length < 2) {
          const spans = link.querySelectorAll('span');
          for (const span of spans) {
            const text = span.textContent?.trim() || '';
            if (text.length >= 2 && text.length < 150) {
              name = text;
              break;
            }
          }
        }

        // 3. Walk up to parent/grandparent and look for text in sibling elements
        if (!name || name.length < 2) {
          let container = link.parentElement;
          for (let depth = 0; depth < 5 && container; depth++) {
            const siblingSpans = container.querySelectorAll('span');
            for (const span of siblingSpans) {
              const text = span.textContent?.trim() || '';
              if (text.length >= 2 && text.length < 150 && !text.includes('\n')) {
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
          const firstLine = (link.innerText || '').split('\n')[0]?.trim() || '';
          if (firstLine.length >= 2 && firstLine.length < 150) {
            name = firstLine;
          }
        }

        // If no name found, use group slug as fallback
        if (!name || name.length < 2) {
          name = `קבוצה: ${groupSlug}`;
        }

        results.push({
          id: groupSlug,
          name,
          url: `https://www.facebook.com/groups/${groupSlug}/`,
        });
      }

      return results;
    });

    console.log(`Total groups found: ${groups.length}`);

    // Save updated storage state
    await context.storageState({ path: STORAGE_STATE_PATH });

    return groups;
  } finally {
    await browser.close();
  }
}

export async function captureGroupScreenshot(groupName, _accessToken, targetUrl) {
  const headless = process.env.FB_AUTOMATION_HEADLESS === 'true';
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    throw new Error('FACEBOOK_SESSION_REQUIRED');
  }

  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: USER_AGENT,
      storageState: STORAGE_STATE_PATH,
    });
    const page = await context.newPage();

    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    const currentUrl = page.url();
    console.log('Facebook home URL:', currentUrl);

    // Only check login by URL - the text check gives false positives in Hebrew
    if (/login|checkpoint/i.test(currentUrl)) {
      console.log('Not logged in - redirected to login page');
      throw new Error('FACEBOOK_SESSION_REQUIRED');
    }

    if (targetUrl) {
      console.log('Navigating to target URL:', targetUrl);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log('Arrived at:', page.url());
      await page.waitForTimeout(3000);
    } else {
      // Navigate directly to Facebook Groups search URL
      const searchQuery = encodeURIComponent(groupName);
      const groupSearchUrl = `https://www.facebook.com/search/groups/?q=${searchQuery}`;
      console.log(`Navigating to groups search: ${groupSearchUrl}`);
      await page.goto(groupSearchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);

      // Find the first link that points to a specific group (has /groups/ followed by a numeric ID)
      const allLinks = page.locator('a[href*="/groups/"]');
      const totalLinks = await allLinks.count();
      console.log(`Found ${totalLinks} total links with /groups/ in href`);

      let clicked = false;
      for (let i = 0; i < totalLinks; i++) {
        const href = await allLinks.nth(i).getAttribute('href');
        // Match only links to actual groups (numeric ID), skip /groups/feed/, /groups/discover/, etc.
        if (href && /\/groups\/\d+/.test(href)) {
          console.log(`Clicking group link: ${href}`);
          await allLinks.nth(i).click();
          clicked = true;
          await page.waitForTimeout(4000);
          break;
        }
      }

      if (!clicked) {
        console.log('No numeric group link found, taking screenshot of search results page');
      }
    }

    const bodyText = ((await page.textContent('body')) || '').trim();
    if (isBlockedPage(bodyText)) {
      throw new Error('FACEBOOK_BLOCKED_OR_NOT_AVAILABLE');
    }

    // Scroll down a bit to show group content, not just the header
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(1000);

    console.log('Taking screenshot...');
    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    console.log('Screenshot taken, size:', screenshot.length, 'bytes');
    return screenshot.toString('base64');
  } finally {
    await browser.close();
  }
}

export async function publishToGroup(groupUrl, text, imagePath, options = {}) {
  const { anonymous = false, location = '' } = options;
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    throw new Error('FACEBOOK_SESSION_REQUIRED');
  }

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: USER_AGENT,
      storageState: STORAGE_STATE_PATH,
    });
    const page = await context.newPage();

    // Go to Facebook first to verify login
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    const currentUrl = page.url();
    console.log('[publish] Facebook home URL:', currentUrl);

    if (/login|checkpoint/i.test(currentUrl)) {
      throw new Error('FACEBOOK_SESSION_REQUIRED');
    }

    // Navigate to the group
    console.log('[publish] Navigating to group:', groupUrl);
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log('[publish] Arrived at:', page.url());

    // Click on the "Write something..." / "כתוב משהו..." post composer box
    // Facebook uses different selectors - try multiple approaches
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
        console.log('[publish] Found composer with selector:', selector);
        await el.click();
        composerClicked = true;
        break;
      }
    }

    if (!composerClicked) {
      // Fallback: try clicking any element that looks like a post input area
      const fallback = page.locator('[role="button"]').filter({ hasText: /כתב|משהו|Write|what's/i }).first();
      if (await fallback.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[publish] Found composer via fallback');
        await fallback.click();
        composerClicked = true;
      }
    }

    if (!composerClicked) {
      throw new Error('POST_COMPOSER_NOT_FOUND');
    }

    // Wait for the post dialog to open
    await page.waitForTimeout(2000);

    // Handle anonymous posting toggle
    if (anonymous) {
      console.log('[publish] Attempting to enable anonymous posting...');
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
          const checked = await toggle.getAttribute('aria-checked').catch(() => null);
          if (checked !== 'true') {
            await toggle.click();
            console.log('[publish] Anonymous toggle clicked');
          }
          anonEnabled = true;
          break;
        }
      }

      // Facebook shows a confirmation dialog - click "Got it" / "הבנתי"
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
            console.log('[publish] Anonymous confirmation "Got it" clicked');
            break;
          }
        }
        await page.waitForTimeout(1000);
      }
    }

    // Type the text into the composer
    // The active editor is usually a contenteditable div with role="textbox"
    const editor = page.locator('div[role="dialog"] div[role="textbox"][contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    console.log('[publish] Typing text...');
    await editor.click();
    await editor.fill(text);
    await page.waitForTimeout(1000);

    // If image provided, upload it
    if (imagePath && fs.existsSync(imagePath)) {
      console.log('[publish] Uploading image:', imagePath);

      // Click the photo/video button in the post dialog
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
          console.log('[publish] Clicked photo button');
          break;
        }
      }

      if (!photoClicked) {
        // Try the icon-based button (usually has an aria-label)
        const iconBtn = page.locator('div[role="dialog"] [aria-label*="תמונה"], div[role="dialog"] [aria-label*="Photo"], div[role="dialog"] [aria-label*="photo"]').first();
        if (await iconBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await iconBtn.click();
          photoClicked = true;
          console.log('[publish] Clicked photo icon button');
        }
      }

      // Wait for file input and upload
      await page.waitForTimeout(1000);
      const fileInput = page.locator('div[role="dialog"] input[type="file"]').first();
      await fileInput.setInputFiles(imagePath);
      console.log('[publish] Image file sent to input');

      // Wait for image preview to appear in the dialog (Facebook shows a thumbnail)
      try {
        await page.locator('div[role="dialog"] img[src*="blob:"], div[role="dialog"] img[alt], div[role="dialog"] div[role="img"]').first()
          .waitFor({ state: 'visible', timeout: 15000 });
        console.log('[publish] Image preview appeared');
      } catch {
        console.log('[publish] Image preview not detected, waiting extra time...');
      }
      // Extra wait for upload to process
      await page.waitForTimeout(3000);
      console.log('[publish] Image uploaded');
    }

    // Handle location if provided
    if (location) {
      console.log('[publish] Adding location:', location);
      try {
        // Try clicking the location/check-in button in the dialog toolbar
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
            console.log('[publish] Clicked location button');
            break;
          }
        }

        if (locationClicked) {
          // Wait for the location search screen to load
          await page.waitForTimeout(2000);

          // The location search screen has an input with placeholder "Where are you?" / "איפה את/ה?"
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
              console.log('[publish] Found location input:', selector);
              break;
            }
          }

          if (locationInput) {
            await locationInput.click();
            await locationInput.fill(location);
            console.log('[publish] Typed location:', location);

            // Wait for results to appear
            await page.waitForTimeout(3000);

            // Check if any result matches the search text (partial match)
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

              // Check each result for a text match
              for (let ri = 0; ri < Math.min(rCount, 7); ri++) {
                const resultEl = results.nth(ri);
                const resultText = (await resultEl.innerText().catch(() => '')).toLowerCase();
                console.log(`[publish]   location result[${ri}]: "${resultText.substring(0, 80)}"`);

                // Check if any word from the search appears in the result
                const searchWords = locationLower.split(/[\s,،]+/).filter(w => w.length > 1);
                const hasMatch = searchWords.some(word => resultText.includes(word));

                if (hasMatch) {
                  await resultEl.click();
                  resultClicked = true;
                  console.log('[publish] Location matched and selected:', resultText.substring(0, 60));
                  break;
                }
              }
              if (resultClicked) break;
            }

            if (!resultClicked) {
              // No matching result - go back to post dialog without location
              console.log('[publish] No matching location found, going back without location');
              // Try clicking back button
              const backBtnSelectors = [
                'div[role="dialog"] [aria-label*="Back"]',
                'div[role="dialog"] [aria-label*="חזרה"]',
                'div[role="dialog"] [aria-label*="back"]',
                'div[role="dialog"] [aria-label*="Close"]',
                'div[role="dialog"] [aria-label*="סגור"]',
              ];
              for (const selector of backBtnSelectors) {
                const backBtn = page.locator(selector).first();
                if (await backBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
                  await backBtn.click();
                  console.log('[publish] Clicked back from location screen');
                  break;
                }
              }
            }

            // Wait for return to post dialog
            await page.waitForTimeout(2000);
          } else {
            console.log('[publish] Location input not found');
          }
        } else {
          console.log('[publish] Location button not found, skipping');
        }
      } catch (e) {
        console.log('[publish] Location error (non-fatal):', e.message);
      }
    }

    // Click the submit/post button - supports multiple languages
    // Known labels: Post (EN), פרסם/פרסום (HE), Submit, Publier (FR), Publicar (ES/PT),
    // Veröffentlichen (DE), Опубликовать (RU), نشر (AR), Yayınla (TR), etc.
    let posted = false;

    // All known post button texts across languages
    const postButtonTexts = [
      'post', 'publish', 'submit', 'send',               // English
      'פרסם', 'פרסום', 'שלח',                              // Hebrew
      'publier', 'publié',                                  // French
      'publicar',                                           // Spanish / Portuguese
      'veröffentlichen',                                    // German
      'pubblicare', 'pubblica',                             // Italian
      'опубликовать',                                       // Russian
      'نشر',                                                // Arabic
      'yayınla',                                            // Turkish
      'opublikuj',                                          // Polish
      'publiceren', 'plaatsen',                             // Dutch
      'פאָרלייגן',                                            // Yiddish
    ];
    const postTextRegex = new RegExp(`^(${postButtonTexts.join('|')})$`, 'i');

    // Strategy 1: aria-label match
    for (const label of postButtonTexts) {
      const selector = `div[role="dialog"] div[role="button"][aria-label="${label}" i]`;
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log('[publish] Clicking post button (aria-label):', label);
        await btn.click();
        posted = true;
        break;
      }
    }

    // Strategy 2: scan div[role="button"] for exact text match
    if (!posted) {
      const allButtons = page.locator('div[role="dialog"] div[role="button"]');
      const count = await allButtons.count();
      console.log('[publish] Scanning', count, 'dialog buttons...');
      for (let i = count - 1; i >= 0; i--) {
        const btn = allButtons.nth(i);
        const text = (await btn.innerText().catch(() => '')).trim();
        if (text) console.log(`[publish]   button[${i}]: "${text.substring(0, 50)}"`);
        if (postTextRegex.test(text)) {
          console.log('[publish] Found post button at index', i, ':', text);
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
      console.log('[publish] Checking', nbCount, 'native <button> elements...');
      for (let i = nbCount - 1; i >= 0; i--) {
        const btn = nativeButtons.nth(i);
        const text = (await btn.innerText().catch(() => '')).trim();
        const label = (await btn.getAttribute('aria-label').catch(() => '') || '').trim();
        if (text || label) console.log(`[publish]   <button>[${i}]: text="${text.substring(0, 50)}" label="${label}"`);
        if (postTextRegex.test(text) || postTextRegex.test(label)) {
          console.log('[publish] Found native post button at index', i);
          await btn.click();
          posted = true;
          break;
        }
      }
    }

    if (!posted) {
      throw new Error('POST_BUTTON_NOT_FOUND');
    }

    // Wait for the post to be submitted
    console.log('[publish] Waiting for post to be submitted...');
    await page.waitForTimeout(6000);

    // Try to find the URL of the newly published post
    let postUrl = null;
    try {
      // Scroll to top to see the new post
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(2000);

      // Strategy 1: Look for the timestamp/permalink of the most recent post
      // Facebook wraps post time in an <a> that links to the permalink
      // Look for links containing the group ID and /posts/ or /permalink/
      const groupId = groupUrl.match(/groups\/([^/]+)/)?.[1] || '';
      const permalinkSelector = `a[href*="/groups/${groupId}/posts/"], a[href*="/groups/${groupId}/permalink/"]`;
      const permalinks = page.locator(permalinkSelector);
      const plCount = await permalinks.count();
      console.log('[publish] Found', plCount, 'permalink links for this group');
      if (plCount > 0) {
        const href = await permalinks.first().getAttribute('href');
        if (href) {
          postUrl = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
        }
      }

      // Strategy 2: Look for any timestamp link with "Just now" / "עכשיו" / "1m" / "now"
      if (!postUrl) {
        const timeLinks = page.locator('a[role="link"][href*="/posts/"], a[role="link"][href*="/permalink/"]');
        const tlCount = await timeLinks.count();
        console.log('[publish] Found', tlCount, 'time/role links');
        if (tlCount > 0) {
          const href = await timeLinks.first().getAttribute('href');
          if (href) {
            postUrl = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
          }
        }
      }

      // Strategy 3: Use the "three dots" menu on the first post to get share link
      if (!postUrl) {
        // Try to find any link with story_fbid in the page source
        const allLinks = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href]'));
          return links
            .map((a) => a.href)
            .filter((h) => h.includes('/posts/') || h.includes('/permalink/') || h.includes('story_fbid'));
        });
        console.log('[publish] Found', allLinks.length, 'post-like links via evaluate');
        if (allLinks.length > 0) {
          postUrl = allLinks[0];
        }
      }

      if (postUrl) {
        // Clean up URL - remove query params that are tracking
        try {
          const u = new URL(postUrl);
          u.search = '';
          postUrl = u.toString();
        } catch { /* keep as is */ }
        console.log('[publish] Post URL found:', postUrl);
      } else {
        console.log('[publish] Could not find post URL');
      }
    } catch (e) {
      console.log('[publish] Could not extract post URL:', e.message);
    }

    // Take a screenshot as proof
    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    console.log('[publish] Post published successfully! Screenshot size:', screenshot.length);

    return {
      success: true,
      screenshot: screenshot.toString('base64'),
      postUrl,
    };
  } finally {
    await browser.close();
  }
}
