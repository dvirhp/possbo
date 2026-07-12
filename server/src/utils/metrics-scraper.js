/* eslint-disable no-undef */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { decrypt } from "./encryption.js";
import { createLogger } from "./logger.js";

const log = createLogger("metrics-scraper");
const prisma = new PrismaClient();

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Parse a Facebook engagement count string into a number.
 * Handles:
 *   - "1,234" / "1.234" (thousands separator)
 *   - "1.2K" / "1,2K" / "2.5M"
 *   - "אלף" / "מיליון" Hebrew multipliers
 *   - "K" / "M" English multipliers
 *   - Comma-as-decimal for K/M (e.g. "1,2K" → 1200)
 */
function parseEngagementCount(raw) {
  if (!raw) return 0;

  let str = raw.toString().trim();
  if (!str) return 0;

  // Remove any surrounding whitespace / invisible chars
  str = str.replace(/\u00A0/g, " ").trim();

  // Hebrew multipliers
  if (/אלף/i.test(str)) {
    const numPart = str.replace(/[^\d.,]/g, "");
    return Math.round(parseFloat(numPart.replace(",", ".")) * 1000) || 0;
  }
  if (/מיליון/i.test(str)) {
    const numPart = str.replace(/[^\d.,]/g, "");
    return Math.round(parseFloat(numPart.replace(",", ".")) * 1000000) || 0;
  }

  // K / M multipliers
  const kmMatch = str.match(/([\d.,]+)\s*([KkMm])/);
  if (kmMatch) {
    let num = kmMatch[1];
    const mult = kmMatch[2].toUpperCase() === "K" ? 1000 : 1000000;
    // Handle comma-as-decimal (e.g. "1,2K")
    if (/^\d+,\d{1,2}$/.test(num)) {
      num = num.replace(",", ".");
    } else {
      num = num.replace(/,/g, "");
    }
    return Math.round(parseFloat(num) * mult) || 0;
  }

  // Plain number with possible thousands separators
  // Remove all separators that aren't the last decimal point
  let cleaned = str.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;

  // If has both comma and dot, figure out which is thousands vs decimal
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // "1,234.5" or "1.234,5"
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      // Comma is decimal: "1.234,5"
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // Dot is decimal: "1,234.5"
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (cleaned.includes(",")) {
    // Could be "1,234" (thousands) or "1,2" (decimal for K)
    // If 3 digits after comma, it's thousands
    if (/,\d{3}$/.test(cleaned)) {
      cleaned = cleaned.replace(/,/g, "");
    } else {
      cleaned = cleaned.replace(",", ".");
    }
  }

  return Math.round(parseFloat(cleaned)) || 0;
}

/**
 * Extract likes count from the Facebook post page.
 * Handles many patterns:
 *   - "123 likes" / "123 לייקים" / "123 אהבו"
 *   - "John and 45 others" / "ג'ון ו-45 אחרים"
 *   - "John, Jane and 12 others"
 *   - Just a number near the like icon area
 */
function parseLikesFromText(text) {
  if (!text) return null;
  const str = text.trim();

  // Pattern: "X and Y others" / "X ו-Y אחרים" → count = Y + named people
  // "You, John and 45 others" → 47
  // "John and 45 others" → 46
  const andOthersEn = str.match(
    /\band\s+([\d.,KkMm]+(?:\s*(?:אלף|מיליון))?)\s+others?\b/i,
  );
  if (andOthersEn) {
    const othersCount = parseEngagementCount(andOthersEn[1]);
    // Count named people before "and" (each comma-separated name + 1)
    const beforeAnd = str.split(/\s+and\s+/i)[0];
    const namedCount = (beforeAnd.match(/,/g) || []).length + 1;
    return othersCount + namedCount;
  }

  // Hebrew: "ג'ון ו-45 אחרים" or "אתה ו-45 אחרים" or "ו-1 נוספים"
  const andOthersHe = str.match(
    /ו[-–]?\s*([\d.,KkMm\s]+(?:אלף|מיליון)?)\s+(?:אחרי[ם]?|נוספי[ם]?|אחר)/i,
  );
  if (andOthersHe) {
    const othersCount = parseEngagementCount(andOthersHe[1]);
    const beforeVav = str.split(/\s*ו[-–]?\s*\d/)[0];
    const namedCount = (beforeVav.match(/,/g) || []).length + 1;
    return othersCount + namedCount;
  }

  // Hebrew: "ועוד N" (ve'od N)
  const veOdMatch = str.match(/ועוד\s+([\d.,KkMm]+)/i);
  if (veOdMatch) {
    const othersCount = parseEngagementCount(veOdMatch[1]);
    const beforeVeod = str.split(/ועוד/)[0];
    const namedCount = (beforeVeod.match(/,/g) || []).length + 1;
    return othersCount + namedCount;
  }

  // Pattern: number + likes/like/לייקים/לייק/אהבו/אוהבים
  const likesMatch = str.match(
    /([\d.,KkMm\s]+(?:אלף|מיליון)?)\s*(?:likes?|לייקי?[ם]?|אהבו|אוהבי[ם]?|reactions?|תגובות\s*רגשיות)/i,
  );
  if (likesMatch) {
    return parseEngagementCount(likesMatch[1]);
  }

  // Reverse: "לייקים 123" (Hebrew RTL order sometimes)
  const reverseLikes = str.match(
    /(?:likes?|לייקי?[ם]?|אהבו|אוהבי[ם]?)\s+([\d.,KkMm\s]+(?:אלף|מיליון)?)/i,
  );
  if (reverseLikes) {
    return parseEngagementCount(reverseLikes[1]);
  }

  // Just a number on its own (in the reactions toolbar area)
  const justNumber = str.match(/^([\d.,KkMm]+(?:\s*(?:אלף|מיליון))?)$/);
  if (justNumber) {
    return parseEngagementCount(justNumber[1]);
  }

  return null;
}

/**
 * Extract comments count from text.
 * Handles: "5 comments" / "5 תגובות" / "1 comment" / "1 תגובה"
 */
function parseCommentsFromText(text) {
  if (!text) return null;
  const str = text.trim();

  const commentsMatch = str.match(
    /([\d.,KkMm\s]+(?:אלף|מיליון)?)\s*(?:comments?|תגובות?|comment)/i,
  );
  if (commentsMatch) {
    return parseEngagementCount(commentsMatch[1]);
  }

  const reverseComments = str.match(
    /(?:comments?|תגובות?)\s+([\d.,KkMm\s]+(?:אלף|מיליון)?)/i,
  );
  if (reverseComments) {
    return parseEngagementCount(reverseComments[1]);
  }

  return null;
}

/**
 * Scrape engagement metrics for a single Facebook post using Playwright.
 * @param {import('playwright').BrowserContext} context - Browser context with session
 * @param {string} postUrl - Full Facebook post URL
 * @returns {{ likes: number, comments: number } | null}
 */
async function scrapePostMetrics(context, postUrl) {
  const page = await context.newPage();

  try {
    await page.goto(postUrl, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    // Wait for dynamic content to load
    await page.waitForTimeout(4000 + Math.random() * 2000);

    // Try to scroll slightly to trigger lazy loading
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(1500);

    const metrics = await page.evaluate(() => {
      let likes = null;
      let comments = null;
      const debugInfo = { strategies: [] };

      // Search across the full document — scoping to article is too narrow on post detail pages
      const allElements = document.querySelectorAll(
        "span, a, div[role='button']",
      );

      // ─── COMMENTS ───
      // Strategy C1: Look for "N comment(s)" / "N תגובה/תגובות" — anchored to avoid false matches
      for (const el of allElements) {
        if (el.closest("header, nav, [role='banner']")) continue;
        const text = el.textContent?.trim() || "";
        if (text.length < 1 || text.length > 100) continue;

        if (comments === null) {
          const cmMatch = text.match(
            /^([\d.,KkMm]+(?:\s*(?:אלף|מיליון))?)\s*(?:comments?|תגובו?ת?|תגובה)$/i,
          );
          if (cmMatch) {
            comments = cmMatch[1];
            debugInfo.strategies.push(`C1: "${text}" → ${cmMatch[1]}`);
          }
        }
      }

      // Strategy C2: aria-label with exact "N comments" pattern (anchored)
      if (comments === null) {
        const ariaEls = document.querySelectorAll("[aria-label]");
        for (const el of ariaEls) {
          const label = el.getAttribute("aria-label") || "";
          const cmLabelMatch = label.match(
            /^([\d.,KkMm]+(?:\s*(?:אלף|מיליון))?)\s*(?:comments?|תגובו?ת?|תגובה)$/i,
          );
          if (cmLabelMatch) {
            comments = cmLabelMatch[1];
            debugInfo.strategies.push(
              `C2: aria="${label}" → ${cmLabelMatch[1]}`,
            );
            break;
          }
        }
      }

      // Strategy C3: Broader text scan but only match "N comments" adjacent (no random numbers)
      if (comments === null) {
        for (const el of allElements) {
          if (el.closest("header, nav, [role='banner']")) continue;
          const text = el.textContent?.trim() || "";
          if (text.length < 1 || text.length > 150) continue;
          // Match text that CONTAINS "N comments" / "N תגובות" but isn't just a random number
          const cmLoose = text.match(
            /\b([\d.,KkMm]+)\s*(?:comments?|תגובו?ת?|תגובה)\b/i,
          );
          if (cmLoose) {
            comments = cmLoose[1];
            debugInfo.strategies.push(`C3: "${text}" → ${cmLoose[1]}`);
            break;
          }
        }
      }

      // ─── LIKES / REACTIONS ───
      // Strategy L1: "X and Y others" / "X ו-Y אחרים" (multiple likes with named people)
      for (const el of allElements) {
        if (el.closest("header, nav, [role='banner']")) continue;
        const text = el.textContent?.trim() || "";
        if (text.length < 2 || text.length > 300) continue;

        if (likes === null) {
          // English: "John and 45 others" / "You, John and 45 others"
          const andOthersEn = text.match(
            /and\s+([\d.,KkMm]+(?:\s*(?:אלף|מיליון))?)\s+others?/i,
          );
          if (andOthersEn) {
            likes = text;
            debugInfo.strategies.push(`L1-en: "${text}"`);
            break;
          }
          // Hebrew: "ו-45 אחרים" / "ועוד 3" / "ו-1 נוספים"
          const andOthersHe = text.match(
            /ו[-–]?\s*([\d.,KkMm]+(?:\s*(?:אלף|מיליון))?)\s+(?:אחרי[ם]?|נוספי[ם]?|אחר)/i,
          );
          if (andOthersHe) {
            likes = text;
            debugInfo.strategies.push(`L1-he: "${text}"`);
            break;
          }
          // Hebrew: "ועוד N" (ve'od N)
          const veOd = text.match(/ועוד\s+([\d.,KkMm]+)/i);
          if (veOd) {
            likes = text;
            debugInfo.strategies.push(`L1-veod: "${text}"`);
            break;
          }
        }
      }

      // Strategy L2: "X likes" / "X לייקים" / "X reactions" patterns
      if (likes === null) {
        for (const el of allElements) {
          if (el.closest("header, nav, [role='banner']")) continue;
          const text = el.textContent?.trim() || "";
          if (text.length < 1 || text.length > 100) continue;

          const lkMatch = text.match(
            /^([\d.,KkMm]+(?:\s*(?:אלף|מיליון))?)\s*(?:likes?|לייקי?[ם]?|אהבו|אוהבי[ם]?|reactions?|תגובות\s*רגשיות)$/i,
          );
          if (lkMatch) {
            likes = lkMatch[1];
            debugInfo.strategies.push(`L2: "${text}" → ${lkMatch[1]}`);
            break;
          }
        }
      }

      // Strategy L3: Look for reaction emoji area — when there's just 1 like,
      // Facebook shows a name like "Dvir Haham Pour" next to a reaction icon.
      // The reaction icon is typically an <img> or <i> with specific data attributes
      // inside a link/span that acts as the reaction summary.
      if (likes === null) {
        // Look for elements that contain reaction emoji images
        const reactionImgs = document.querySelectorAll(
          'img[src*="emoji"], img[aria-label*="Like"], img[aria-label*="Love"], img[aria-label*="Haha"], img[aria-label*="Wow"], img[aria-label*="Sad"], img[aria-label*="Angry"], ' +
            'img[alt*="like" i], img[alt*="love" i], img[alt*="haha" i], img[alt*="wow" i], img[alt*="sad" i], img[alt*="angry" i], ' +
            'i[data-visualcompletion="css-img"][style*="background-image"]',
        );

        for (const img of reactionImgs) {
          // Walk up to the parent link/span container
          let container = img.closest(
            "a, span[role='toolbar'], div[role='button']",
          );
          if (!container) container = img.parentElement?.parentElement;
          if (!container) continue;

          const containerText = container.textContent?.trim() || "";
          if (!containerText) continue;

          // If the container text is just a number, that's our like count
          const justNum = containerText.match(
            /^([\d.,KkMm]+(?:\s*(?:אלף|מיליון))?)$/,
          );
          if (justNum) {
            likes = justNum[1];
            break;
          }

          // If the container text has "and X others" — full text
          if (/(?:and\s+\d|ו[-–]?\s*\d)/i.test(containerText)) {
            likes = containerText;
            break;
          }

          // If it's just a person's name (no number) — that's 1 like
          // Names don't have digits, and are typically 2-50 chars
          if (
            containerText.length >= 2 &&
            containerText.length <= 60 &&
            !/\d/.test(containerText)
          ) {
            // Verify it's not a button label like "Like" / "Comment" / "Send"
            const lowerText = containerText.toLowerCase();
            if (
              ![
                "like",
                "comment",
                "send",
                "share",
                "לייק",
                "תגובה",
                "שליחה",
                "שיתוף",
                "most relevant",
                "הכי רלוונטי",
              ].some((word) => lowerText === word || lowerText === word + "s")
            ) {
              likes = "__SINGLE_NAME__";
              debugInfo.strategies.push(`L3-name: "${containerText}"`);
              break;
            }
          }
        }
      }

      // Strategy L4: aria-label approach for reactions
      if (likes === null) {
        const ariaEls = document.querySelectorAll("[aria-label]");
        for (const el of ariaEls) {
          const label = el.getAttribute("aria-label") || "";
          // "1 reaction" / "5 reactions" / "Like: 3"
          if (/(?:reaction|people reacted|אנשים הגיבו)/i.test(label)) {
            const numMatch = label.match(/([\d.,KkMm]+)/);
            if (numMatch) {
              likes = numMatch[1];
              debugInfo.strategies.push(`L4: aria="${label}" → ${numMatch[1]}`);
              break;
            }
          }
        }
      }

      // Strategy L5: Look for standalone number near bottom of post (between content and comments)
      // This handles cases where FB shows just "1" as a clickable reaction count
      if (likes === null) {
        for (const el of allElements) {
          if (el.closest("header, nav, [role='banner']")) continue;
          const text = el.textContent?.trim() || "";

          // Pure number, small element (not a paragraph), near reaction area
          if (/^[\d.,KkMm]+$/.test(text) && text.length <= 10) {
            // Make sure it's not the same element as comments
            const parentText = el.parentElement?.textContent?.trim() || "";
            if (!/comment|תגוב/i.test(parentText)) {
              // Check if there's a reaction image nearby (sibling or cousin)
              const parent = el.closest("div, span");
              if (parent) {
                const nearbyImg = parent.querySelector(
                  'img, i[style*="background-image"]',
                );
                if (nearbyImg) {
                  likes = text;
                  debugInfo.strategies.push(`L5: "${text}"`);
                  break;
                }
              }
            }
          }
        }
      }

      // Debug: collect sample texts that contain numbers (for diagnostics)
      const sampleTexts = [];
      for (const el of allElements) {
        const text = el.textContent?.trim() || "";
        if (text.length >= 1 && text.length <= 120 && /\d/.test(text)) {
          if (!sampleTexts.includes(text) && sampleTexts.length < 30) {
            sampleTexts.push(text);
          }
        }
      }
      debugInfo.sampleTexts = sampleTexts;

      return { likes, comments, debugInfo };
    });

    log.info("Raw scraped metrics", {
      url: postUrl,
      rawLikes: metrics.likes,
      rawComments: metrics.comments,
      strategies: metrics.debugInfo?.strategies,
      sampleTexts: metrics.debugInfo?.sampleTexts,
    });

    // Parse on server side
    let likesCount = 0;
    if (metrics.likes === "__SINGLE_NAME__") {
      // Single person reaction (name shown, no number)
      likesCount = 1;
    } else if (metrics.likes) {
      likesCount =
        parseLikesText(metrics.likes) ?? parseSimpleCount(metrics.likes) ?? 0;
    }

    let commentsCount = 0;
    if (metrics.comments) {
      commentsCount =
        parseCommentsText(metrics.comments) ??
        parseSimpleCount(metrics.comments) ??
        0;
    }

    return { likes: likesCount, comments: commentsCount };
  } catch (err) {
    log.debug(`Failed to scrape metrics for ${postUrl}: ${err.message}`);
    return null;
  } finally {
    await page.close();
  }
}

// These run inside Node (not browser) so we can use the full parse functions
function parseLikesText(raw) {
  if (!raw) return null;
  return parseLikesFromText(raw);
}
function parseCommentsText(raw) {
  if (!raw) return null;
  return parseCommentsFromText(raw);
}
function parseSimpleCount(raw) {
  if (!raw) return null;
  return parseEngagementCount(raw);
}

/**
 * Load the user's decrypted Facebook storage state.
 */
async function loadUserStorageState(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { facebookStorageState: true },
  });
  if (!user?.facebookStorageState) return null;
  try {
    return JSON.parse(decrypt(user.facebookStorageState));
  } catch {
    return null;
  }
}

/**
 * Scrape metrics for multiple publications of a single user.
 * Opens one browser, processes in parallel batches of 3.
 *
 * @param {string} userId
 * @param {Array<{id: string, externalPostUrl: string}>} publications
 * @returns {Array<{publicationId: string, likes: number, comments: number}>}
 */
export async function scrapeUserPublicationMetrics(userId, publications) {
  const storageState = await loadUserStorageState(userId);
  if (!storageState) {
    log.warn(`No valid session for user ${userId}, skipping metrics scrape`);
    return [];
  }

  const validPubs = publications.filter((p) => p.externalPostUrl);
  if (validPubs.length === 0) return [];

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  const results = [];
  const CONCURRENCY = 3;

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: USER_AGENT,
      storageState,
    });

    // Verify session
    const checkPage = await context.newPage();
    await checkPage.goto("https://www.facebook.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await checkPage.waitForTimeout(2000);
    const cookies = await context.cookies("https://www.facebook.com");
    const cookieNames = new Set(cookies.map((c) => c.name));
    if (!cookieNames.has("c_user") || !cookieNames.has("xs")) {
      await checkPage.close();
      log.warn(`Session expired for user ${userId}, skipping metrics scrape`);
      return [];
    }
    await checkPage.close();

    // Process in batches
    for (let i = 0; i < validPubs.length; i += CONCURRENCY) {
      const batch = validPubs.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (pub) => {
          const metrics = await scrapePostMetrics(context, pub.externalPostUrl);
          return {
            publicationId: pub.id,
            likes: metrics?.likes ?? 0,
            comments: metrics?.comments ?? 0,
          };
        }),
      );
      results.push(...batchResults);

      // Human-like delay between batches
      if (i + CONCURRENCY < validPubs.length) {
        await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
      }
    }

    // Save updated storage state
    const updatedState = await context.storageState();
    const json = JSON.stringify(updatedState);
    const { encrypt: enc } = await import("./encryption.js");
    await prisma.user.update({
      where: { id: userId },
      data: { facebookStorageState: enc(json) },
    });
  } finally {
    await browser.close();
  }

  return results;
}

/**
 * Upsert metrics into the database for a publication.
 * Creates a new PublicationMetric entry per collection (time-series).
 */
export async function savePublicationMetrics(publicationId, likes, comments) {
  await prisma.publicationMetric.create({
    data: {
      publicationHistoryId: publicationId,
      likesCount: likes,
      commentsCount: comments,
    },
  });
}

/**
 * Scrape & save metrics for a single publication (used by manual refresh).
 */
export async function refreshSinglePublicationMetrics(userId, publicationId) {
  const pub = await prisma.publicationHistory.findFirst({
    where: { id: publicationId, userId },
    select: { id: true, externalPostUrl: true },
  });
  if (!pub?.externalPostUrl) {
    log.warn(`Publication ${publicationId} has no external URL`);
    return null;
  }

  log.info(`Refreshing metrics for publication ${publicationId}`, {
    url: pub.externalPostUrl,
  });

  const results = await scrapeUserPublicationMetrics(userId, [pub]);
  const result = results[0] || { likes: 0, comments: 0 };

  log.info(`Metrics result for ${publicationId}:`, {
    likes: result.likes,
    comments: result.comments,
  });

  // Always save a new metric entry (time-series data point)
  await savePublicationMetrics(publicationId, result.likes, result.comments);

  return { likes: result.likes, comments: result.comments };
}

export { parseEngagementCount, parseLikesFromText, parseCommentsFromText };
