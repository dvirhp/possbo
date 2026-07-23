/* eslint-disable no-undef */
import prisma from "../config/prisma.js";
import { decrypt } from "./encryption.js";
import { createLogger } from "./logger.js";
import { launchBrowser, createBrowserContext } from "./browser-factory.js";

const log = createLogger("metrics-scraper");

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

  // Pattern: "Name and Name" / "Name ו Name" — named people with no count
  // e.g. "You and John" → 2, "A, B and C" → 3, "Name ו Name" → 2
  if (
    /\band\b/i.test(str) &&
    !/\band\s+[\d.,KkMm]/i.test(str) &&
    !/\bothers?\b/i.test(str)
  ) {
    return countNamedPeople(str);
  }
  if (
    /\sו[-–]?\s/.test(str) &&
    !/ו[-–]?\s*[\d.,KkMm]/i.test(str) &&
    !/(?:אחרי[ם]?|נוספי[ם]?|אחר)\b/i.test(str)
  ) {
    return countNamedPeople(str);
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
 * Count named people in a text like "A and B" or "A, B and C" or "A ו B".
 */
function countNamedPeople(text) {
  const commaParts = text.split(/\s*,\s*/);
  let count = 0;
  for (const part of commaParts) {
    if (/\band\b/i.test(part)) {
      count += part.split(/\band\b/i).filter((s) => s.trim()).length;
    } else if (/\sו[-–]?\s/.test(part)) {
      count += part.split(/\sו[-–]?\s/).filter((s) => s.trim()).length;
    } else if (part.trim()) {
      count += 1;
    }
  }
  return Math.max(count, 1);
}

/**
 * Extract comments count from text.
 * Handles: "5 comments" / "5 תגובות" / "1 comment" / "1 תגובה"
 */
function parseCommentsFromText(text) {
  if (!text) return null;
  const str = text.trim();

  const commentsMatch = str.match(
    /([\d.,KkMm\s]+(?:אלף|מיליון)?)\s*(?:comments?|תגובות?|תגובה)/i,
  );
  if (commentsMatch) {
    return parseEngagementCount(commentsMatch[1]);
  }

  const reverseComments = str.match(
    /(?:comments?|תגובות?|תגובה)\s+([\d.,KkMm\s]+(?:אלף|מיליון)?)/i,
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

      // ─── SCOPE: Find the target post container ───
      // Facebook shows post URLs in different layouts:
      //  1. Dialog/modal overlay containing the post (div[role="dialog"])
      //  2. Main feed with the post (div[role="main"])
      //  3. Entire document as fallback
      // We must scope to the correct container to avoid picking up
      // metrics from OTHER posts visible on the page.
      let postRoot = null;

      // Priority 1: Dialog — FB often opens post links in a dialog overlay
      // But only use it if it actually contains post-like content (reactions area)
      // and is not just a notifications panel or other UI dialog
      const dialogs = document.querySelectorAll('div[role="dialog"]');
      for (const dialog of dialogs) {
        const dialogText = dialog.textContent || "";
        // A post dialog typically has "Like" / "Comment" / "Share" buttons
        // and/or reaction content — not just notification text
        if (
          (/\bLike\b/.test(dialogText) && /\bComment\b/.test(dialogText)) ||
          (/\bלייק\b/.test(dialogText) && /\bתגובה\b/.test(dialogText)) ||
          dialog.querySelector(
            'div[aria-label*="reaction"], div[aria-label*="like" i]',
          )
        ) {
          postRoot = dialog;
          debugInfo.strategies.push("SCOPE: post-dialog");
          break;
        }
      }

      // Priority 2: Main content area
      if (!postRoot) {
        const main = document.querySelector('div[role="main"]');
        if (main) {
          postRoot = main;
          debugInfo.strategies.push("SCOPE: main");
        }
      }

      // Fallback: entire document
      if (!postRoot) {
        postRoot = document;
        debugInfo.strategies.push("SCOPE: document (fallback)");
      }

      const allElements = postRoot.querySelectorAll(
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
        const ariaEls = postRoot.querySelectorAll("[aria-label]");
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
      // Strategy L0: "All reactions:N ..." — Facebook's accessibility text
      // This is the most reliable source when present (e.g. "All reactions:2 You and Name")
      for (const el of allElements) {
        if (el.closest("header, nav, [role='banner']")) continue;
        const text = el.textContent?.trim() || "";
        const arLabel = el.getAttribute?.("aria-label") || "";
        // Check both text content and aria-label
        for (const candidate of [text, arLabel]) {
          if (!candidate) continue;
          const allReactionsMatch = candidate.match(
            /All reactions:\s*([\d.,KkMm]+)/i,
          );
          if (allReactionsMatch) {
            likes = allReactionsMatch[1];
            debugInfo.strategies.push(
              `L0: "${candidate}" → ${allReactionsMatch[1]}`,
            );
            break;
          }
        }
        if (likes !== null) break;
      }

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

          // "Name and Name" — multiple named people, no count
          if (
            text.length <= 80 &&
            !/\d/.test(text) &&
            /\band\b/i.test(text) &&
            !/\bothers?\b/i.test(text) &&
            !/\b(?:comment|share|send|reply|like|post)\b/i.test(text) &&
            !/(?:תגובה|שיתוף|שליחה|לייק|כתוב)/i.test(text)
          ) {
            if (el.tagName === "A" || el.closest('[role="button"]')) {
              likes = text;
              debugInfo.strategies.push(`L1-names: "${text}"`);
              break;
            }
          }
          // Hebrew: "Name ו Name" — multiple named people, no count
          if (
            text.length <= 80 &&
            !/\d/.test(text) &&
            /\sו[-–]?\s/.test(text) &&
            !/(?:אחרי[ם]?|נוספי[ם]?|אחר)\b/i.test(text) &&
            !/\b(?:comment|share|send|reply|like|post)\b/i.test(text) &&
            !/(?:תגובה|שיתוף|שליחה|לייק|כתוב)/i.test(text)
          ) {
            if (el.tagName === "A" || el.closest('[role="button"]')) {
              likes = text;
              debugInfo.strategies.push(`L1-names-he: "${text}"`);
              break;
            }
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
        const reactionImgs = postRoot.querySelectorAll(
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

          // Multiple named people: "Name and Name" or "Name ו Name" (no digits)
          if (
            containerText.length >= 2 &&
            containerText.length <= 100 &&
            !/\d/.test(containerText) &&
            (/\band\b/i.test(containerText) || /\sו[-–]?\s/.test(containerText))
          ) {
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
              ].some((w) => lowerText === w || lowerText === w + "s")
            ) {
              likes = containerText;
              debugInfo.strategies.push(`L3-names: "${containerText}"`);
              break;
            }
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
        const ariaEls = postRoot.querySelectorAll("[aria-label]");
        for (const el of ariaEls) {
          const label = el.getAttribute("aria-label") || "";
          // Skip action buttons like "Change Like reaction", "Remove reaction"
          if (/^(Change|Remove|Add)\b/i.test(label)) continue;
          // "1 reaction" / "5 reactions" / "Like: 3" / "All reactions:5"
          if (/(?:reactions?|people reacted|אנשים הגיבו)/i.test(label)) {
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

  const browser = await launchBrowser();

  const results = [];
  const CONCURRENCY = 3;

  try {
    const context = await createBrowserContext(browser, {
      userId,
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
export async function savePublicationMetrics(
  publicationId,
  likes,
  comments,
  shares = 0,
  reach = 0,
  impressions = 0,
) {
  await prisma.publicationMetric.create({
    data: {
      publicationHistoryId: publicationId,
      likesCount: likes,
      commentsCount: comments,
      sharesCount: shares,
      reachCount: reach,
      impressionsCount: impressions,
    },
  });
}

/**
 * Scrape & save metrics for a single publication (used by manual refresh).
 */
export async function refreshSinglePublicationMetrics(userId, publicationId) {
  const pubRaw = await prisma.publicationHistory.findFirst({
    where: { id: publicationId, userId },
    select: {
      id: true,
      externalPostUrl: true,
      externalPostId: true,
      platform: true,
      publicationJob: { select: { igPublishType: true } },
    },
  });
  const pub = pubRaw
    ? { ...pubRaw, igMediaType: pubRaw.publicationJob?.igPublishType || "FEED" }
    : null;
  if (!pub) {
    log.warn(`Publication ${publicationId} not found`);
    return null;
  }

  // Instagram — use Graph API
  if (pub.platform === "INSTAGRAM" && pub.externalPostId) {
    log.info(`Refreshing IG metrics for publication ${publicationId}`, {
      externalPostId: pub.externalPostId,
    });
    const results = await refreshInstagramMetrics(userId, [pub]);
    const result = results[0] || {
      likes: 0,
      comments: 0,
      shares: 0,
      reach: 0,
      impressions: 0,
    };
    await savePublicationMetrics(
      publicationId,
      result.likes,
      result.comments,
      result.shares || 0,
      result.reach || 0,
      result.impressions || 0,
    );
    return {
      likes: result.likes,
      comments: result.comments,
      shares: result.shares || 0,
      reach: result.reach || 0,
      impressions: result.impressions || 0,
    };
  }

  // Facebook — use Playwright scraping
  if (!pub.externalPostUrl) {
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

/**
 * Fetch Instagram metrics via Graph API Insights endpoint for publications that have externalPostId.
 * Uses the user's connected IG account token.
 * See: https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights
 */
export async function refreshInstagramMetrics(userId, publications) {
  // Get user's IG token
  const account = await prisma.connectedAccount.findFirst({
    where: { userId, provider: "INSTAGRAM", status: "ACTIVE" },
  });

  if (!account) {
    log.warn(`No active IG account for user ${userId}, skipping IG metrics`);
    return [];
  }

  if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
    // Try to refresh the token before giving up
    try {
      const oldToken = decrypt(account.accessTokenEncrypted);
      const refreshUrl = `https://graph.instagram.com/refresh_access_token?grant_type=ig_exchange_token&access_token=${oldToken}`;
      const refreshResp = await fetch(refreshUrl);
      if (refreshResp.ok) {
        const refreshData = await refreshResp.json();
        if (refreshData.access_token) {
          const { encrypt } = await import("./encryption.js");
          await prisma.connectedAccount.update({
            where: { id: account.id },
            data: {
              accessTokenEncrypted: encrypt(refreshData.access_token),
              tokenExpiresAt: new Date(
                Date.now() + (refreshData.expires_in || 5184000) * 1000,
              ),
            },
          });
          log.info(`IG token refreshed for user ${userId}`);
          // Use the new token
          Object.defineProperty(account, "_refreshedToken", {
            value: refreshData.access_token,
          });
        } else {
          log.warn(
            `IG token refresh failed for user ${userId}: no access_token in response`,
          );
          return [];
        }
      } else {
        log.warn(
          `IG token refresh failed for user ${userId}: HTTP ${refreshResp.status}`,
        );
        return [];
      }
    } catch (err) {
      log.warn(`IG token refresh error for user ${userId}: ${err.message}`);
      return [];
    }
  }

  const accessToken =
    account._refreshedToken || decrypt(account.accessTokenEncrypted);
  const results = [];

  for (const pub of publications) {
    if (!pub.externalPostId) continue;
    try {
      // Use the Insights endpoint with correct metric names per media type
      // Stories only support: impressions, reach, replies, follows, navigation, profile_activity, profile_visits
      // Feed/Reels support: likes, comments, shares, reach, saved, total_interactions, views
      const isStory = pub.igMediaType === "STORY";
      const metrics = isStory
        ? "impressions,reach"
        : "likes,comments,shares,reach,saved";

      const insightsUrl =
        `https://graph.instagram.com/v25.0/${pub.externalPostId}/insights` +
        `?metric=${metrics}&access_token=${accessToken}`;
      const resp = await fetch(insightsUrl);

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        log.debug(
          `IG Insights API error for ${pub.externalPostId}: ${resp.status} ${errBody}`,
        );

        // Fallback to basic media fields if insights endpoint fails
        // (e.g. for media with hidden like counts or insufficient viewers)
        const fallbackResult = await fetchIgMediaFields(
          pub.externalPostId,
          accessToken,
        );
        if (fallbackResult) {
          results.push({ publicationId: pub.id, ...fallbackResult });
        }
        continue;
      }

      const data = await resp.json();
      if (data.error) {
        log.debug(
          `IG Insights returned error for ${pub.externalPostId}: ${data.error.message}`,
        );
        const fallbackResult = await fetchIgMediaFields(
          pub.externalPostId,
          accessToken,
        );
        if (fallbackResult) {
          results.push({ publicationId: pub.id, ...fallbackResult });
        }
        continue;
      }

      // Parse insights response: data[] contains {name, values: [{value}]}
      const metricsMap = {};
      if (data.data && Array.isArray(data.data)) {
        for (const entry of data.data) {
          metricsMap[entry.name] = entry.values?.[0]?.value || 0;
        }
      }

      // If Insights returned 200 but with empty data, fall back to basic media fields
      if (!isStory && Object.keys(metricsMap).length === 0) {
        log.debug(
          `IG Insights returned empty data for ${pub.externalPostId}, trying fallback`,
        );
        const fallbackResult = await fetchIgMediaFields(
          pub.externalPostId,
          accessToken,
        );
        if (fallbackResult) {
          results.push({ publicationId: pub.id, ...fallbackResult });
        }
        continue;
      }

      if (isStory) {
        results.push({
          publicationId: pub.id,
          likes: 0,
          comments: 0,
          shares: 0,
          reach: metricsMap.reach || 0,
          impressions: metricsMap.impressions || 0,
        });
      } else {
        results.push({
          publicationId: pub.id,
          likes: metricsMap.likes || 0,
          comments: metricsMap.comments || 0,
          shares: metricsMap.shares || 0,
          reach: metricsMap.reach || 0,
          impressions: 0,
          saved: metricsMap.saved || 0,
        });
      }
    } catch (err) {
      log.debug(
        `Failed to fetch IG metrics for ${pub.externalPostId}: ${err.message}`,
      );
    }
    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  return results;
}

/**
 * Fallback: fetch basic IG media fields (like_count, comments_count)
 * when the Insights endpoint fails (hidden likes, insufficient viewers, etc.)
 */
async function fetchIgMediaFields(mediaId, accessToken) {
  try {
    const url = `https://graph.instagram.com/v25.0/${mediaId}?fields=like_count,comments_count&access_token=${accessToken}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.error) return null;
    return {
      likes: data.like_count || 0,
      comments: data.comments_count || 0,
      shares: 0,
      reach: 0,
      impressions: 0,
    };
  } catch {
    return null;
  }
}

export { parseEngagementCount, parseLikesFromText, parseCommentsFromText };
