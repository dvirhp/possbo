import express from "express";
import prisma from "../config/prisma.js";
import { encrypt, decrypt } from "../utils/encryption.js";
import { getPublicMediaUrl } from "../utils/media-upload.js";
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
        accessTokenEncrypted: true,
        tokenExpiresAt: true,
        status: true,
        createdAt: true,
      },
    });

    // Backfill avatar from Instagram if user has no profile picture
    let backfilledAvatar = null;
    if (account?.accessTokenEncrypted) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { profileImage: true, avatarUrl: true },
      });
      if (!user.profileImage && !user.avatarUrl) {
        try {
          const token = decrypt(account.accessTokenEncrypted);
          const profileRes = await fetch(
            `https://graph.instagram.com/me?fields=profile_picture_url&access_token=${token}`,
          );
          const profileData = await profileRes.json();
          if (profileData.profile_picture_url) {
            await prisma.user.update({
              where: { id: req.user.id },
              data: { avatarUrl: profileData.profile_picture_url },
            });
            backfilledAvatar = profileData.profile_picture_url;
            log.info("Backfilled avatar from Instagram", {
              userId: req.user.id,
            });
          }
        } catch (e) {
          log.debug("Failed to backfill avatar from Instagram", e.message);
        }
      }
    }

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
      ...(backfilledAvatar && { avatarUrl: backfilledAvatar }),
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

  const scope =
    "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights";
  const authUrl =
    `https://www.instagram.com/oauth/authorize` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scope}` +
    `&response_type=code` +
    `&state=${req.user.id}`;

  res.json({ success: true, authUrl });
});

// ─── POST /instagram/connect — Exchange code for token (popup flow) ─
router.post("/connect", requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    if (!code) {
      return res.status(400).json({ error: "Missing authorization code" });
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

    if (tokenData.error_message || tokenData.error_type) {
      log.error("Instagram token exchange failed", tokenData);
      return res.status(400).json({
        error:
          "שגיאה בחיבור אינסטגרם: " +
          (tokenData.error_message || tokenData.error_type),
      });
    }

    // Instagram API returns data in { data: [{ access_token, user_id, permissions }] }
    // OR in flat format { access_token, user_id } depending on endpoint version
    let shortToken, igUserId;
    if (tokenData.data && Array.isArray(tokenData.data)) {
      shortToken = tokenData.data[0].access_token;
      igUserId = tokenData.data[0].user_id;
    } else {
      shortToken = tokenData.access_token;
      igUserId = tokenData.user_id;
    }

    if (!shortToken || !igUserId) {
      log.error("Instagram token response missing fields", tokenData);
      return res.status(400).json({ error: "תגובה לא תקינה מאינסטגרם" });
    }

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
      return res.status(400).json({ error: "שגיאה בקבלת טוקן ארוך טווח" });
    }

    const longToken = longTokenData.access_token;
    const expiresIn = longTokenData.expires_in || 5184000;

    // Get Instagram username and correct graph ID (token exchange user_id may
    // lose precision for large numbers due to JS Number limitations)
    const profileRes = await fetch(
      `https://graph.instagram.com/me?fields=id,username,profile_picture_url&access_token=${longToken}`,
    );
    const profileData = await profileRes.json();
    const username = profileData.username || igUserId;
    // Use the string ID from /me which is always precise
    const graphUserId = profileData.id || String(igUserId);
    const igProfilePicture = profileData.profile_picture_url || null;

    // Save or update connected account
    const encryptedToken = encrypt(longToken);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Upsert by userId + provider (delete old record if providerUserId changed due to precision fix)
    await prisma.connectedAccount.deleteMany({
      where: { userId, provider: "INSTAGRAM" },
    });
    await prisma.connectedAccount.create({
      data: {
        userId,
        provider: "INSTAGRAM",
        providerUserId: graphUserId,
        providerUserName: username,
        accessTokenEncrypted: encryptedToken,
        tokenExpiresAt,
        status: "ACTIVE",
      },
    });

    // If user has no profile picture, use the Instagram one
    if (igProfilePicture) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { profileImage: true, avatarUrl: true },
      });
      if (!user.profileImage && !user.avatarUrl) {
        await prisma.user.update({
          where: { id: userId },
          data: { avatarUrl: igProfilePicture },
        });
        log.info("Set Instagram profile picture as user avatar", { userId });
      }
    }

    log.info("Instagram connected", {
      userId,
      igUserId: graphUserId,
      username,
    });

    res.json({
      success: true,
      account: { username, connectedAt: new Date() },
      igProfilePicture,
    });
  } catch (err) {
    log.error("Instagram connect error", err);
    res.status(500).json({ error: "שגיאה בחיבור אינסטגרם" });
  }
});

// ─── GET /instagram/callback — Handle OAuth callback, exchange code, redirect ─
router.get("/callback", async (req, res) => {
  const clientUrl = process.env.CLIENT_URL;
  const { code, error, error_description, state } = req.query;

  if (error) {
    return res.redirect(
      `${clientUrl}/oauth/instagram/callback?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(error_description || "")}`,
    );
  }

  if (!code) {
    return res.redirect(
      `${clientUrl}/oauth/instagram/callback?error=missing_code`,
    );
  }

  // state contains the userId (set in auth-url generation)
  const userId = state;
  if (!userId) {
    return res.redirect(
      `${clientUrl}/oauth/instagram/callback?error=missing_state`,
    );
  }

  try {
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

    if (tokenData.error_message || tokenData.error_type) {
      log.error("Instagram token exchange failed in callback", tokenData);
      return res.redirect(
        `${clientUrl}/oauth/instagram/callback?error=${encodeURIComponent(tokenData.error_message || "token_exchange_failed")}`,
      );
    }

    let shortToken, igUserId;
    if (tokenData.data && Array.isArray(tokenData.data)) {
      shortToken = tokenData.data[0].access_token;
      igUserId = tokenData.data[0].user_id;
    } else {
      shortToken = tokenData.access_token;
      igUserId = tokenData.user_id;
    }

    if (!shortToken || !igUserId) {
      log.error(
        "Instagram token response missing fields in callback",
        tokenData,
      );
      return res.redirect(
        `${clientUrl}/oauth/instagram/callback?error=invalid_token_response`,
      );
    }

    // Exchange for long-lived token (60 days)
    const longTokenRes = await fetch(
      `https://graph.instagram.com/access_token` +
        `?grant_type=ig_exchange_token` +
        `&client_secret=${appSecret}` +
        `&access_token=${shortToken}`,
    );
    const longTokenData = await longTokenRes.json();

    if (longTokenData.error) {
      log.error(
        "Instagram long-lived token exchange failed in callback",
        longTokenData,
      );
      return res.redirect(
        `${clientUrl}/oauth/instagram/callback?error=long_token_failed`,
      );
    }

    const longToken = longTokenData.access_token;
    const expiresIn = longTokenData.expires_in || 5184000;

    // Get Instagram username and correct graph ID
    const profileRes = await fetch(
      `https://graph.instagram.com/me?fields=id,username,profile_picture_url&access_token=${longToken}`,
    );
    const profileData = await profileRes.json();
    const username = profileData.username || igUserId;
    const graphUserId = profileData.id || String(igUserId);
    const igProfilePicture = profileData.profile_picture_url || null;

    // Save or update connected account
    const encryptedToken = encrypt(longToken);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Delete + create instead of upsert (providerUserId may have changed due to precision fix)
    await prisma.connectedAccount.deleteMany({
      where: { userId, provider: "INSTAGRAM" },
    });
    await prisma.connectedAccount.create({
      data: {
        userId,
        provider: "INSTAGRAM",
        providerUserId: graphUserId,
        providerUserName: username,
        accessTokenEncrypted: encryptedToken,
        tokenExpiresAt,
        status: "ACTIVE",
      },
    });

    // If user has no profile picture, use the Instagram one
    if (igProfilePicture) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { profileImage: true, avatarUrl: true },
      });
      if (!user.profileImage && !user.avatarUrl) {
        await prisma.user.update({
          where: { id: userId },
          data: { avatarUrl: igProfilePicture },
        });
        log.info("Set Instagram profile picture as user avatar via callback", {
          userId,
        });
      }
    }

    log.info("Instagram connected via callback", {
      userId,
      igUserId: graphUserId,
      username,
    });

    // Redirect to client with success
    res.redirect(
      `${clientUrl}/oauth/instagram/callback?success=true&username=${encodeURIComponent(username)}`,
    );
  } catch (err) {
    log.error("Instagram callback error", err);
    res.redirect(`${clientUrl}/oauth/instagram/callback?error=server_error`);
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
    const { postId, publishType, caption, mediaUrl: rawMediaUrl } = req.body;

    if (!publishType || !rawMediaUrl) {
      return res
        .status(400)
        .json({ error: "Missing required fields: publishType, mediaUrl" });
    }

    // Resolve to a publicly accessible URL if it's a local path
    let mediaUrl = rawMediaUrl;
    if (
      rawMediaUrl.startsWith("/uploads/") ||
      !rawMediaUrl.startsWith("http")
    ) {
      mediaUrl = await getPublicMediaUrl(rawMediaUrl);
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

    // Use 'me' instead of numeric ID to avoid precision issues with large IDs
    const igPath = "me";

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
      `https://graph.instagram.com/v21.0/${igPath}/media`,
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
      `https://graph.instagram.com/v21.0/${igPath}/media_publish`,
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

    // Fetch permalink for the published media
    let permalink = null;
    try {
      const mediaRes = await fetch(
        `https://graph.instagram.com/v21.0/${publishData.id}?fields=permalink&access_token=${accessToken}`,
      );
      const mediaData = await mediaRes.json();
      if (mediaData.permalink) permalink = mediaData.permalink;
    } catch {
      // Non-critical
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
          externalPostUrl: permalink,
          status: "SUCCESS",
        },
      });
    }

    log.info("Instagram publish success", {
      userId: req.user.id,
      publishType,
      mediaId: publishData.id,
      permalink,
    });

    res.json({
      success: true,
      mediaId: publishData.id,
      publishType,
      postUrl: permalink,
    });
  } catch (err) {
    log.error("Instagram publish error", err);
    res.status(500).json({ error: "שגיאה בפרסום לאינסטגרם" });
  }
});

export default router;
