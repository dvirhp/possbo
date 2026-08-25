import express from "express";
import prisma from "../config/prisma.js";
import { OAuth2Client } from "google-auth-library";
import { createLogger } from "../utils/logger.js";
import { issueTokens } from "../utils/auth-service.js";

const router = express.Router();
const log = createLogger("oauth");

// ─── Google OAuth ─────────────────────────────────────────
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post("/google", async (req, res) => {
  try {
    const { credential, mode } = req.body; // mode: 'login' | 'register'
    if (!credential) {
      return res.status(400).json({ error: "Missing Google credential" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ error: "No email provided by Google" });
    }

    // Find user by googleId or email
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (mode === "register") {
      if (user && user.googleId) {
        return res
          .status(409)
          .json({ error: "חשבון כבר קיים, התחבר במקום להירשם" });
      }
      if (user && !user.googleId) {
        // Link Google to existing account
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId, avatarUrl: user.avatarUrl || picture },
        });
      } else {
        // Create new user
        user = await prisma.user.create({
          data: { email, name, googleId, avatarUrl: picture },
        });
      }
    } else {
      // Login
      if (!user) {
        return res
          .status(401)
          .json({ error: "אין חשבון עם האימייל הזה, הירשם קודם" });
      }
      if (!user.googleId) {
        // Auto-link on login if email matches
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId, avatarUrl: user.avatarUrl || picture },
        });
      }
    }

    const result = await issueTokens(res, user, req);
    res.json(result);
  } catch (error) {
    log.error("Google OAuth failed", error);
    res.status(500).json({ error: "Google authentication failed" });
  }
});

// ─── Facebook OAuth ───────────────────────────────────────
router.post("/facebook", async (req, res) => {
  try {
    const { accessToken: fbToken, mode } = req.body;
    if (!fbToken) {
      return res.status(400).json({ error: "Missing Facebook token" });
    }

    // Verify token and get user info from Facebook
    const fbRes = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${fbToken}`,
    );
    const fbData = await fbRes.json();

    if (fbData.error) {
      return res.status(401).json({ error: "Invalid Facebook token" });
    }

    const { id: facebookOAuthId, email, name, picture } = fbData;
    const avatarUrl = picture?.data?.url;

    if (!email) {
      return res
        .status(400)
        .json({ error: "לא התקבל אימייל מפייסבוק, ודא שהאימייל ציבורי" });
    }

    let user = await prisma.user.findFirst({
      where: { OR: [{ facebookOAuthId }, { email }] },
    });

    if (mode === "register") {
      if (user && user.facebookOAuthId) {
        return res
          .status(409)
          .json({ error: "חשבון כבר קיים, התחבר במקום להירשם" });
      }
      if (user && !user.facebookOAuthId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { facebookOAuthId, avatarUrl: user.avatarUrl || avatarUrl },
        });
      } else {
        user = await prisma.user.create({
          data: { email, name, facebookOAuthId, avatarUrl },
        });
      }
    } else {
      if (!user) {
        return res
          .status(401)
          .json({ error: "אין חשבון עם האימייל הזה, הירשם קודם" });
      }
      if (!user.facebookOAuthId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { facebookOAuthId, avatarUrl: user.avatarUrl || avatarUrl },
        });
      }
    }

    const result = await issueTokens(res, user, req);
    res.json(result);
  } catch (error) {
    log.error("Facebook OAuth failed", error);
    res.status(500).json({ error: "Facebook authentication failed" });
  }
});

// ─── GitHub OAuth ─────────────────────────────────────────
router.post("/github", async (req, res) => {
  try {
    const { code, mode } = req.body;
    if (!code) {
      return res.status(400).json({ error: "Missing GitHub code" });
    }

    // Exchange code for access token
    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      },
    );
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return res.status(401).json({ error: "Invalid GitHub code" });
    }

    // Get user info
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const ghUser = await userRes.json();

    // Get email (may be private)
    let email = ghUser.email;
    if (!email) {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const emails = await emailsRes.json();
      const primary = emails.find((e) => e.primary && e.verified);
      email = primary?.email || emails.find((e) => e.verified)?.email;
    }

    if (!email) {
      return res
        .status(400)
        .json({ error: "לא התקבל אימייל מGitHub, ודא שיש אימייל מאומת" });
    }

    const githubId = String(ghUser.id);
    const name = ghUser.name || ghUser.login;
    const avatarUrl = ghUser.avatar_url;

    let user = await prisma.user.findFirst({
      where: { OR: [{ githubId }, { email }] },
    });

    if (mode === "register") {
      if (user && user.githubId) {
        return res
          .status(409)
          .json({ error: "חשבון כבר קיים, התחבר במקום להירשם" });
      }
      if (user && !user.githubId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { githubId, avatarUrl: user.avatarUrl || avatarUrl },
        });
      } else {
        user = await prisma.user.create({
          data: { email, name, githubId, avatarUrl },
        });
      }
    } else {
      if (!user) {
        return res
          .status(401)
          .json({ error: "אין חשבון עם האימייל הזה, הירשם קודם" });
      }
      if (!user.githubId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { githubId, avatarUrl: user.avatarUrl || avatarUrl },
        });
      }
    }

    const result = await issueTokens(res, user, req);
    res.json(result);
  } catch (error) {
    log.error("GitHub OAuth failed", error);
    res.status(500).json({ error: "GitHub authentication failed" });
  }
});

// ─── LinkedIn OAuth ───────────────────────────────────────
router.post("/linkedin", async (req, res) => {
  try {
    const { code, mode } = req.body;
    if (!code) {
      return res.status(400).json({ error: "Missing LinkedIn code" });
    }

    // Exchange code for access token
    const tokenRes = await fetch(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: `${process.env.CLIENT_URL}/oauth/linkedin/callback`,
          client_id: process.env.LINKEDIN_CLIENT_ID,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        }),
      },
    );
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return res.status(401).json({ error: "Invalid LinkedIn code" });
    }

    // Get user info using OpenID Connect userinfo endpoint
    const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const liUser = await userRes.json();

    const linkedinId = liUser.sub;
    const email = liUser.email;
    const name = liUser.name;
    const avatarUrl = liUser.picture;

    if (!email) {
      return res.status(400).json({ error: "לא התקבל אימייל מ-LinkedIn" });
    }

    let user = await prisma.user.findFirst({
      where: { OR: [{ linkedinId }, { email }] },
    });

    if (mode === "register") {
      if (user && user.linkedinId) {
        return res
          .status(409)
          .json({ error: "חשבון כבר קיים, התחבר במקום להירשם" });
      }
      if (user && !user.linkedinId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { linkedinId, avatarUrl: user.avatarUrl || avatarUrl },
        });
      } else {
        user = await prisma.user.create({
          data: { email, name, linkedinId, avatarUrl },
        });
      }
    } else {
      if (!user) {
        return res
          .status(401)
          .json({ error: "אין חשבון עם האימייל הזה, הירשם קודם" });
      }
      if (!user.linkedinId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { linkedinId, avatarUrl: user.avatarUrl || avatarUrl },
        });
      }
    }

    const result = await issueTokens(res, user, req);
    res.json(result);
  } catch (error) {
    log.error("LinkedIn OAuth failed", error);
    res.status(500).json({ error: "LinkedIn authentication failed" });
  }
});

// ─── Apple OAuth ──────────────────────────────────────────
router.post("/apple", async (req, res) => {
  try {
    const { id_token, code, mode } = req.body;
    if (!id_token && !code) {
      return res.status(400).json({ error: "Missing Apple credentials" });
    }

    // Decode the Apple ID token (JWT) to get user info
    // Apple's id_token is a JWT signed by Apple — we decode the payload
    let payload;
    try {
      const parts = id_token.split(".");
      payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    } catch {
      return res.status(401).json({ error: "Invalid Apple token" });
    }

    const appleId = payload.sub;
    const email = payload.email;
    const name = null; // Apple only provides name on first auth

    if (!email) {
      return res.status(400).json({ error: "לא התקבל אימייל מ-Apple" });
    }

    let user = await prisma.user.findFirst({
      where: { OR: [{ appleId }, { email }] },
    });

    if (mode === "register") {
      if (user && user.appleId) {
        return res
          .status(409)
          .json({ error: "חשבון כבר קיים, התחבר במקום להירשם" });
      }
      if (user && !user.appleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { appleId },
        });
      } else {
        user = await prisma.user.create({
          data: { email, name, appleId },
        });
      }
    } else {
      if (!user) {
        return res
          .status(401)
          .json({ error: "אין חשבון עם האימייל הזה, הירשם קודם" });
      }
      if (!user.appleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { appleId },
        });
      }
    }

    const result = await issueTokens(res, user, req);
    res.json(result);
  } catch (error) {
    log.error("Apple OAuth failed", error);
    res.status(500).json({ error: "Apple authentication failed" });
  }
});

export default router;
