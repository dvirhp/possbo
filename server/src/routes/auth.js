import express from "express";
import passport from "passport";
import "../config/passport.js";
import { captureGroupScreenshot } from "../utils/facebook-automation.js";
import { PrismaClient } from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();

// Facebook authentication
router.get(
  "/facebook",
  passport.authenticate("facebook", { scope: ["email", "public_profile"] }),
);

// Facebook callback
router.get(
  "/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/login" }),
  async (req, res) => {
    try {
      // Successful authentication - redirect to dashboard
      res.redirect(`${process.env.CLIENT_URL}/dashboard`);

      // Run automation in background (non-blocking)
      if (req.user && req.user.facebookAccessToken) {
        console.log("Starting automated Facebook group search...");

        try {
          const screenshot = await captureGroupScreenshot(
            "פשפשוק - רכב",
            req.user.facebookAccessToken,
          );

          // Save to database
          await prisma.facebookGroup.upsert({
            where: {
              userId_groupId: {
                userId: req.user.id,
                groupId: "pshpshuk-rehev-auto",
              },
            },
            update: {
              groupName: "פשפשוק - רכב",
              screenshot: screenshot,
            },
            create: {
              userId: req.user.id,
              groupId: "pshpshuk-rehev-auto",
              groupName: "פשפשוק - רכב",
              screenshot: screenshot,
            },
          });

          console.log("Screenshot saved successfully");
        } catch (automationError) {
          console.error("Automation error:", automationError.message);
          // Don't fail the whole auth flow if automation fails
        }
      }
    } catch (error) {
      console.error("Callback error:", error);
      res.redirect(`${process.env.CLIENT_URL}/login?error=callback_failed`);
    }
  },
);

// Get current user
router.get("/me", (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json(req.user);
});

// Get captured screenshot from Facebook automation
router.get("/screenshot", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const group = await prisma.facebookGroup.findFirst({
      where: {
        userId: req.user.id,
        groupId: "pshpshuk-rehev-auto",
      },
    });

    if (!group || !group.screenshot) {
      return res.status(404).json({ error: "Screenshot not found yet" });
    }

    res.json({
      screenshot: group.screenshot,
      groupName: group.groupName,
      capturedAt: group.createdAt,
    });
  } catch (error) {
    console.error("Screenshot fetch error:", error);
    res.status(500).json({ error: "Failed to fetch screenshot" });
  }
});

// Logout
router.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.json({ message: "Logged out successfully" });
  });
});

export default router;
