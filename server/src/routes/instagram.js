import express from "express";
import prisma from "../config/prisma.js";
import { encrypt, decrypt } from "../utils/encryption.js";
import { createLogger } from "../utils/logger.js";

const router = express.Router();
const log = createLogger("instagram");

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ─── GET /instagram/status — Check Instagram connection status ──────
router.get("/status", requireAuth, async (req, res) => {
  try {
    const account = await prisma.connectedAccount.findFirst({
      where: { userId: req.user.id, provider: "INSTAGRAM", status: "ACTIVE" },
      select: {
        id: true,
        providerUserName: true,
        tokenExpiresAt: true,
        status: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      connected: !!account,
      account: account
        ? {
            id: account.id,
            username: account.providerUserName,
            tokenExpiresAt: account.tokenExpiresAt,
            status: account.status,
            connectedAt: account.createdAt,
          }
        : null,
    });
  } catch (err) {
    log.error("Failed to check Instagram status", err);
    res.status(500).json({ error: "שגיאה בבדיקת חיבור אינסטגרם" });
  }
});

// ─── GET /instagram/auth-url — Generate Instagram OAuth URL ─────────
router.get("/auth-url", requireAuth, (req, res) => {
  const appId = process.env.INSTAGRAM_APP_ID;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

  if (!appId || !redirectUri) {
    return res.status(500).json({ error: "Instagram API not configured" });
  }

  const scope = "instagram_business_basic,instagram_business_content_publish";
  const authUrl =
    `https://www.instagram.com/oauth/authorize` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scope}` +
    `&response_type=code` +
    `&state=${req.user.id}`;

  res.json({ success: true, authUrl });
});

// ─── GET /instagram/callback — Handle OAuth callback ────────────────
router.get("/callback", async (req, res) => {
  try {
    const { code, state: userId } = req.query;

    if (!code || !userId) {
      return res.redirect(
        `${process.env.CLIENT_URL}/dashboard?tab=settings&ig=error&msg=missing_params`,
      );
    }

    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

    // Exchange code for short-lived token
    const tokenRes = await fetch(
      "https://api.instagram.com/oauth/access_token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        }),
      },
    );

    const tokenData = await tokenRes.json();

    if (tokenData.error_message) {
      log.error("Instagram token exchange failed", tokenData);
      return res.redirect(
        `${process.env.CLIENT_URL}/dashboard?tab=settings&ig=error&msg=token_failed`,
      );
    }

    const { access_token: shortToken, user_id: igUserId } = tokenData;

    // Exchange for long-lived token (60 days)
    const longTokenRes = await fetch(
      `https://graph.instagram.com/access_token` +
        `?grant_type=ig_exchange_token` +
        `&client_secret=${appSecret}` +
        `&access_token=${shortToken}`,
    );

    const longTokenData = await longTokenRes.json();

    if (longTokenData.error) {
      log.error("Instagram long-lived token exchange failed", longTokenData);
      return res.redirect(
        `${process.env.CLIENT_URL}/dashboard?tab=settings&ig=error&msg=long_token_failed`,
      );
    }

    const longToken = longTokenData.access_token;
    const expiresIn = longTokenData.expires_in || 5184000; // 60 days default

    // Get Instagram username
    const profileRes = await fetch(
      `https://graph.instagram.com/me?fields=username&access_token=${longToken}`,
    );
    const profileData = await profileRes.json();
    const username = profileData.username || igUserId;

    // Save or update connected account
    const encryptedToken = encrypt(longToken);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    await prisma.connectedAccount.upsert({
      where: {
        provider_providerUserId: {
          provider: "INSTAGRAM",
          providerUserId: String(igUserId),
        },
      },
      create: {
        userId,
        provider: "INSTAGRAM",
        providerUserId: String(igUserId),
        providerUserName: username,
        accessTokenEncrypted: encryptedToken,
        tokenExpiresAt,
        status: "ACTIVE",
      },
      update: {
        userId,
        providerUserName: username,
        accessTokenEncrypted: encryptedToken,
        tokenExpiresAt,
        status: "ACTIVE",
      },
    });

    log.info("Instagram connected", { userId, igUserId, username });

    res.redirect(`${process.env.CLIENT_URL}/dashboard?tab=settings&ig=success`);
  } catch (err) {
    log.error("Instagram callback error", err);
    res.redirect(
      `${process.env.CLIENT_URL}/dashboard?tab=settings&ig=error&msg=server_error`,
    );
  }
});

// ─── POST /instagram/disconnect — Disconnect Instagram ──────────────
router.post("/disconnect", requireAuth, async (req, res) => {
  try {
    await prisma.connectedAccount.updateMany({
      where: { userId: req.user.id, provider: "INSTAGRAM" },
      data: { status: "DISCONNECTED" },
    });

    res.json({ success: true });
  } catch (err) {
    log.error("Failed to disconnect Instagram", err);
    res.status(500).json({ error: "שגיאה בניתוק אינסטגרם" });
  }
});

// ─── POST /instagram/publish — Publish to Instagram ─────────────────
router.post("/publish", requireAuth, async (req, res) => {
  try {
    const { postId, publishType, caption, mediaUrl } = req.body;

    if (!publishType || !mediaUrl) {
      return res
        .status(400)
        .json({ error: "Missing required fields: publishType, mediaUrl" });
    }

    const account = await prisma.connectedAccount.findFirst({
      where: { userId: req.user.id, provider: "INSTAGRAM", status: "ACTIVE" },
    });

    if (!account) {
      return res.status(400).json({ error: "חשבון אינסטגרם לא מחובר" });
    }

    // Check token expiry
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      await prisma.connectedAccount.update({
        where: { id: account.id },
        data: { status: "EXPIRED" },
      });
      return res
        .status(400)
        .json({ error: "טוקן אינסטגרם פג תוקף, יש להתחבר מחדש" });
    }

    const accessToken = decrypt(account.accessTokenEncrypted);
    const igUserId = account.providerUserId;

    // Step 1: Create media container
    const containerBody = { access_token: accessToken };

    if (publishType === "STORY") {
      containerBody.media_type = "STORIES";
      if (mediaUrl.match(/\.(mp4|mov|webm)$/i)) {
        containerBody.video_url = mediaUrl;
      } else {
        containerBody.image_url = mediaUrl;
      }
    } else if (publishType === "REEL") {
      containerBody.media_type = "REELS";
      containerBody.video_url = mediaUrl;
      if (caption) containerBody.caption = caption;
    } else {
      // FEED
      containerBody.image_url = mediaUrl;
      if (caption) containerBody.caption = caption;
    }

    const containerRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(containerBody),
      },
    );

    const containerData = await containerRes.json();

    if (containerData.error) {
      log.error("Instagram container creation failed", containerData.error);
      return res
        .status(400)
        .json({ error: containerData.error.message || "שגיאה ביצירת מדיה" });
    }

    const containerId = containerData.id;

    // Step 2: Poll container status (for videos)
    if (
      publishType === "REEL" ||
      (publishType === "STORY" && mediaUrl.match(/\.(mp4|mov|webm)$/i))
    ) {
      let ready = false;
      for (let i = 0; i < 30; i++) {
        const statusRes = await fetch(
          `https://graph.instagram.com/v21.0/${containerId}?fields=status_code&access_token=${accessToken}`,
        );
        const statusData = await statusRes.json();

        if (statusData.status_code === "FINISHED") {
          ready = true;
          break;
        }
        if (statusData.status_code === "ERROR") {
          return res.status(400).json({ error: "עיבוד המדיה נכשל אצל Meta" });
        }
        // Wait 2 seconds before next check
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!ready) {
        return res
          .status(408)
          .json({ error: "עיבוד המדיה ב-Meta נמשך יותר מדי זמן" });
      }
    }

    // Step 3: Publish
    const publishRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: accessToken,
        }),
      },
    );

    const publishData = await publishRes.json();

    if (publishData.error) {
      log.error("Instagram publish failed", publishData.error);
      return res
        .status(400)
        .json({ error: publishData.error.message || "שגיאה בפרסום" });
    }

    // Record in publication history
    if (postId) {
      await prisma.publicationHistory.create({
        data: {
          postId,
          userId: req.user.id,
          targetType: "INSTAGRAM",
          platform: "INSTAGRAM",
          publishedAt: new Date(),
          externalPostId: publishData.id,
          status: "SUCCESS",
        },
      });
    }

    log.info("Instagram publish success", {
      userId: req.user.id,
      publishType,
      mediaId: publishData.id,
    });

    res.json({
      success: true,
      mediaId: publishData.id,
      publishType,
    });
  } catch (err) {
    log.error("Instagram publish error", err);
    res.status(500).json({ error: "שגיאה בפרסום לאינסטגרם" });
  }
});

export default router;
