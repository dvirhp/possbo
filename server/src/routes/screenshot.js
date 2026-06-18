import express from "express";
import { captureGroupScreenshot } from "../utils/facebook-automation.js";
import { isAllowedUrl } from "../utils/security.js";

const router = express.Router();

// Take screenshot of a Facebook group
router.get("/", async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ success: false, error: "url is required" });
  }
  if (!isAllowedUrl(url)) {
    return res
      .status(400)
      .json({ success: false, error: "Only Facebook URLs are allowed" });
  }
  try {
    const screenshot = await captureGroupScreenshot(null, null, url);
    res.json({ success: true, screenshot });
  } catch (error) {
    console.error("Screenshot error:", error.message);
    if (error.message === "FACEBOOK_SESSION_REQUIRED") {
      return res
        .status(428)
        .json({ success: false, error: "FACEBOOK_SESSION_REQUIRED" });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
