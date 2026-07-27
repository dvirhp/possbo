import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { createLogger } from "./logger.js";

const screenshotsDir = "./screenshots";
const log = createLogger("puppeteer");

// Create screenshots directory if it doesn't exist
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

export async function captureGroupScreenshot(groupName, _accessToken) {
  let browser = null;
  try {
    log.info("Starting group screenshot capture", { groupName });

    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });

    // Navigate to Facebook search page for groups
    log.debug("Navigating to Facebook groups search");
    await page.goto(
      `https://www.facebook.com/search/groups/?q=${encodeURIComponent(groupName)}`,
      {
        waitUntil: "networkidle2",
        timeout: 30000,
      },
    );

    // Wait for search results to load
    log.debug("Waiting for search results");
    await page.waitForTimeout(3000);

    // Try to find and click on the first matching group
    const firstGroup = await page.$('a[role="link"]');

    if (firstGroup) {
      log.debug("Clicking first group result");
      await firstGroup.click();
      await page.waitForTimeout(4000);
    }

    // Take screenshot
    const timestamp = Date.now();
    const filename = `group_${timestamp}.png`;
    const filepath = path.join(screenshotsDir, filename);

    log.debug("Taking screenshot", { filename });
    await page.screenshot({ path: filepath, fullPage: false });

    // Read the screenshot as base64
    const screenshotBase64 = fs.readFileSync(filepath, "base64");
    const screenshotDataUrl = `data:image/png;base64,${screenshotBase64}`;

    log.info("Screenshot captured successfully", { filename });

    return {
      success: true,
      screenshot: screenshotDataUrl,
      filename: filename,
      groupName: groupName,
    };
  } catch (error) {
    log.error("Browser automation error", error);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
