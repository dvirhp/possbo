import express from "express";
import { captureGroupScreenshot } from "../utils/facebook-automation.js";
import { isAllowedUrl } from "../utils/security.js";
import { asyncHandler } from "../utils/async-handler.js";

const router = express.Router();

// Take screenshot of a Facebook group
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ success: false, error: "url is required" });
    }
    if (!isAllowedUrl(url)) {
      return res
        .status(400)
        .json({ success: false, error: "Only Facebook URLs are allowed" });
    }
    const screenshot = await captureGroupScreenshot(null, null, url);
    res.json({ success: true, screenshot });
  }),
);

export default router;
