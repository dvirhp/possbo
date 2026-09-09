import express from "express";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import prisma from "../config/prisma.js";
import { decrypt } from "../utils/encryption.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import { createLogger } from "../utils/logger.js";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  generateCode,
} from "../utils/mailer.js";
import { verifyTurnstile } from "../utils/turnstile.js";
import { persistUpload } from "../services/object-storage.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  setRefreshCookie,
  formatUserResponse,
  ensureStoredProfileImage,
  normalizeEmail,
} from "../utils/auth-service.js";

const router = express.Router();
const log = createLogger("auth");
const SALT_ROUNDS = 10;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");

// In-memory store for pending email verifications (code → data)
// Format: { email: { code, data, expiresAt } }
const hashOneTimeCode = (code) =>
  crypto.createHash("sha256").update(String(code).trim()).digest("hex");

async function createPasswordResetCode(user, code) {
  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id, usedAt: null },
  });
  return prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashOneTimeCode(code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
}

async function findValidPasswordReset(userId, code) {
  return prisma.passwordResetToken.findFirst({
    where: {
      userId,
      tokenHash: hashOneTimeCode(code),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

// setRefreshCookie, formatUserResponse, issueTokens, normalizeEmail
// are now imported from utils/auth-service.js

// Register step 1: validate & send verification code
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, gender, phone, idNumber, captchaToken } =
      req.body;

    // Verify Turnstile CAPTCHA
    const captchaValid = await verifyTurnstile(captchaToken, req.ip);
    if (!captchaValid) {
      log.warn("Registration CAPTCHA failed", { email, ip: req.ip });
      return res.status(400).json({ error: "אימות CAPTCHA נכשל — נסה שוב" });
    }

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (!idNumber || !/^\d{9}$/.test(idNumber)) {
      return res
        .status(400)
        .json({ error: "יש להזין תעודת זהות תקינה (9 ספרות)" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    if (password.length > 128) {
      return res
        .status(400)
        .json({ error: "Password must be at most 128 characters" });
    }

    const normalizedEmail = normalizeEmail(email);

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // Reject an already-associated identity before hashing a password or
    // sending an email that can never result in a valid registration.
    const existingIdNumber = await prisma.user.findUnique({
      where: { idNumber },
      select: { id: true },
    });
    if (existingIdNumber) {
      return res.status(409).json({
        error: "תעודת הזהות כבר משויכת לחשבון קיים",
        code: "ID_NUMBER_ALREADY_REGISTERED",
      });
    }

    // Generate and send verification code
    const code = generateCode();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await prisma.pendingRegistration.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        codeHash: hashOneTimeCode(code),
        passwordHash,
        name: name || null,
        gender: gender || null,
        phone: phone || null,
        idNumber: idNumber || null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      update: {
        codeHash: hashOneTimeCode(code),
        passwordHash,
        name: name || null,
        gender: gender || null,
        phone: phone || null,
        idNumber: idNumber || null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const sent = await sendVerificationEmail(normalizedEmail, code);
    if (!sent) {
      return res.status(500).json({ error: "שגיאה בשליחת המייל — נסה שוב" });
    }

    log.info("Registration verification email requested", {
      email: normalizedEmail,
      ip: req.ip,
    });

    res.json({
      success: true,
      requiresVerification: true,
      email: normalizedEmail,
    });
  } catch (error) {
    log.error("Registration failed", error, { email: req.body?.email });
    res.status(500).json({ error: "Registration failed" });
  }
});

// Register step 2: verify code and create account
router.post("/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !code) {
      return res.status(400).json({ error: "חסר אימייל או קוד" });
    }

    const pending = await prisma.pendingRegistration.findUnique({
      where: { email: normalizedEmail },
    });
    if (!pending) {
      return res
        .status(400)
        .json({ error: "לא נמצא קוד אימות — נסה להירשם מחדש" });
    }

    if (pending.expiresAt < new Date()) {
      await prisma.pendingRegistration.delete({
        where: { email: normalizedEmail },
      });
      return res.status(400).json({ error: "הקוד פג תוקף — נסה להירשם מחדש" });
    }

    if (pending.codeHash !== hashOneTimeCode(code)) {
      return res.status(400).json({ error: "קוד שגוי — נסה שוב" });
    }

    // Code verified — create the user
    const { passwordHash, name, gender, phone, idNumber } = pending;

    // Double-check email not taken (race condition)
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name,
          gender,
          phone,
          idNumber,
          emailVerifiedAt: new Date(),
        },
      });
      await tx.pendingRegistration.delete({
        where: { email: normalizedEmail },
      });
      return created;
    });

    // Generate JWT tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshTokenHash },
    });

    setRefreshCookie(res, refreshToken, req);

    res.status(201).json({
      success: true,
      accessToken,
      user: formatUserResponse(user, { subscription: null }),
    });
  } catch (error) {
    const conflictTarget = Array.isArray(error?.meta?.target)
      ? error.meta.target.join(",")
      : String(error?.meta?.target || "");
    if (error?.code === "P2002" && /id_?number/i.test(conflictTarget)) {
      return res.status(409).json({
        error: "תעודת הזהות כבר משויכת לחשבון קיים",
        code: "ID_NUMBER_ALREADY_REGISTERED",
      });
    }
    log.error("Email verification failed", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

// Resend verification code
router.post("/resend-code", async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);

    const pending = await prisma.pendingRegistration.findUnique({
      where: { email: normalizedEmail },
    });
    if (!pending) {
      return res.status(400).json({ error: "לא נמצאה הרשמה בהמתנה" });
    }

    // Generate new code
    const code = generateCode();
    await prisma.pendingRegistration.update({
      where: { email: normalizedEmail },
      data: {
        codeHash: hashOneTimeCode(code),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const sent = await sendVerificationEmail(normalizedEmail, code);
    if (!sent) {
      return res.status(500).json({ error: "שגיאה בשליחת המייל" });
    }

    res.json({ success: true });
  } catch (error) {
    log.error("Resend code failed", error);
    res.status(500).json({ error: "Failed to resend code" });
  }
});

// Login with email + password
router.post("/login", async (req, res) => {
  try {
    const { email, password, captchaToken } = req.body;

    // Verify Turnstile CAPTCHA
    const captchaValid = await verifyTurnstile(captchaToken, req.ip);
    if (!captchaValid) {
      log.warn("Login CAPTCHA failed", { email, ip: req.ip });
      return res.status(400).json({ error: "אימות CAPTCHA נכשל — נסה שוב" });
    }

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (password.length > 128) {
      return res
        .status(400)
        .json({ error: "Password must be at most 128 characters" });
    }

    const normalizedEmail = normalizeEmail(email);

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user || !user.passwordHash) {
      log.warn("Login rejected", { email: normalizedEmail, reason: "not_found" });
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      log.warn("Login rejected", { userId: user.id, reason: "invalid_password" });
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate JWT tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Store refresh token hash in DB
    const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshTokenHash, lastLoginAt: new Date() },
    });

    setRefreshCookie(res, refreshToken, req);

    // Check subscription status
    const activeSubscription = await prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ["ACTIVE", "CANCELLED"] } },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });

    // Check Instagram connection
    const instagramAccount = await prisma.connectedAccount.findFirst({
      where: { userId: user.id, provider: "INSTAGRAM", status: "ACTIVE" },
      select: { providerUserName: true },
    });

    log.info("Login succeeded", {
      userId: user.id,
      hasSubscription: Boolean(activeSubscription),
      instagramConnected: Boolean(instagramAccount),
    });

    res.json({
      success: true,
      accessToken,
      user: formatUserResponse(user, {
        instagramConnected: !!instagramAccount,
        instagramUsername: instagramAccount?.providerUserName || null,
        subscription: activeSubscription
          ? {
              status: activeSubscription.status,
              planName: activeSubscription.plan?.name,
              endsAt: activeSubscription.endsAt,
            }
          : null,
      }),
    });
  } catch (error) {
    log.error("Login failed", error, { email: req.body?.email });
    res.status(500).json({ error: "Login failed" });
  }
});

// Forgot password — step 1: send code to email
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return res.status(400).json({ error: "יש להזין אימייל" });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user) {
      // Don't reveal if email exists — still return success
      return res.json({ success: true });
    }

    const code = generateCode();
    await createPasswordResetCode(user, code);

    await sendPasswordResetEmail(normalizedEmail, code);
    res.json({ success: true });
  } catch (error) {
    log.error("Forgot password failed", error);
    res.status(500).json({ error: "שגיאה בשליחת הקוד" });
  }
});

// Forgot password — step 2: verify code & set new password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !code || !newPassword) {
      return res.status(400).json({ error: "חסרים שדות חובה" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "סיסמה חייבת להכיל לפחות 6 תווים" });
    }

    if (newPassword.length > 128) {
      return res.status(400).json({ error: "סיסמה חייבת להכיל עד 128 תווים" });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    const pending = user
      ? await findValidPasswordReset(user.id, code)
      : null;
    if (!pending) {
      return res.status(400).json({ error: "לא נמצא קוד אימות — בקש קוד חדש" });
    }

    if (pending.expiresAt < Date.now()) {
      await prisma.passwordResetToken.delete({ where: { id: pending.id } });
      return res.status(400).json({ error: "הקוד פג תוקף — בקש קוד חדש" });
    }

    if (pending.tokenHash !== hashOneTimeCode(code)) {
      return res.status(400).json({ error: "קוד שגוי" });
    }

    await prisma.passwordResetToken.update({
      where: { id: pending.id },
      data: { usedAt: new Date() },
    });

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    res.json({ success: true });
  } catch (error) {
    log.error("Reset password failed", error);
    res.status(500).json({ error: "שגיאה באיפוס הסיסמה" });
  }
});

// Refresh access token using refresh token from cookie
router.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ error: "No refresh token" });
    }

    // Verify JWT signature and expiry
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    // Verify token matches what's stored in DB
    let user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });
    if (!user || !user.refreshToken) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const tokenValid = await bcrypt.compare(token, user.refreshToken);
    if (!tokenValid) {
      // Token reuse detected - invalidate all tokens (security measure)
      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: null },
      });
      log.warn("Refresh token reuse detected", { userId: user.id, ip: req.ip });
      return res.status(401).json({ error: "Token reuse detected" });
    }

    user = await ensureStoredProfileImage(user);

    // Rotate: issue new tokens
    const newAccessToken = generateAccessToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);

    // Hash in parallel with the following lookups, but persist the rotated
    // token before acknowledging it to the client.
    const hashPromise = bcrypt.hash(newRefreshToken, SALT_ROUNDS);

    // Check subscription status
    const activeSubscription = await prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ["ACTIVE", "CANCELLED"] } },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });

    // Check Instagram connection
    const instagramAccount = await prisma.connectedAccount.findFirst({
      where: { userId: user.id, provider: "INSTAGRAM", status: "ACTIVE" },
      select: { providerUserName: true },
    });

    const newRefreshHash = await hashPromise;
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshHash },
    });

    setRefreshCookie(res, newRefreshToken, req);

    res.json({
      success: true,
      accessToken: newAccessToken,
      user: formatUserResponse(user, {
        instagramConnected: !!instagramAccount,
        instagramUsername: instagramAccount?.providerUserName || null,
        subscription: activeSubscription
          ? {
              status: activeSubscription.status,
              planName: activeSubscription.plan?.name,
              endsAt: activeSubscription.endsAt,
            }
          : null,
      }),
    });

  } catch (error) {
    log.error("Token refresh failed", error);
    res.status(500).json({ error: "Token refresh failed" });
  }
});

// Verify Facebook connection is still valid
router.post("/verify-facebook", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        facebookAccessToken: true,
        facebookStorageState: true,
        fbSessionValid: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // If no FB token and no storage state — not connected at all
    if (!user.facebookAccessToken && !user.facebookStorageState) {
      if (user.fbSessionValid) {
        await prisma.user.update({
          where: { id: req.user.id },
          data: { fbSessionValid: false },
        });
      }
      return res.json({ fbSessionValid: false, reason: "not_connected" });
    }

    // Check Graph API token validity
    let tokenValid = false;
    if (user.facebookAccessToken) {
      try {
        const fbRes = await fetch(
          `https://graph.facebook.com/me?fields=id&access_token=${user.facebookAccessToken}`,
        );
        const fbData = await fbRes.json();
        tokenValid = !fbData.error;
      } catch {
        tokenValid = false;
      }
    }

    // Check storage state — verify critical cookies exist
    let hasStorageState = !!user.facebookStorageState;
    let cookiesExpired = false;

    if (hasStorageState) {
      try {
        const decrypted = decrypt(user.facebookStorageState);
        const state = JSON.parse(decrypted);
        const cookies = state.cookies || [];
        // Only check if critical FB cookies (c_user, xs) exist at all.
        // Don't check expiry timestamps — they may be stale in the stored JSON
        // while the actual session is still valid. The keep-alive job does the
        // real browser-based validation.
        const criticalCookies = cookies.filter(
          (c) => c.name === "c_user" || c.name === "xs",
        );
        if (criticalCookies.length === 0) {
          cookiesExpired = true;
        }
      } catch {
        // Can't decrypt or parse — treat as expired
        cookiesExpired = true;
      }
    }

    // Session is valid only if storage state exists AND cookies haven't expired
    const fbSessionValid = hasStorageState && !cookiesExpired;

    // Update DB if status changed
    if (user.fbSessionValid !== fbSessionValid) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { fbSessionValid },
      });

      // Create notification if session became invalid
      if (!fbSessionValid) {
        // Don't delete storage state here — let the keep-alive job do the actual
        // browser-based verification. Cookie expiry timestamps can be stale while
        // the session is still valid (FB refreshes them on each visit).

        await prisma.notification
          .create({
            data: {
              userId: req.user.id,
              type: "SESSION_EXPIRED",
              title: "חיבור הפייסבוק פג תוקף",
              message:
                "החיבור לפייסבוק שלך אינו תקין. אנא התחבר מחדש כדי שפוסטים מתוזמנים ימשיכו לפעול.",
            },
          })
          .catch(() => {});
      }
    }

    res.json({ fbSessionValid, tokenValid, hasStorageState, cookiesExpired });
  } catch (error) {
    log.error("Facebook verification failed", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

// Get current user (requires valid access token via middleware)
router.get("/me", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Verify FB session is actually valid (has storage state data)
  let fbSessionValid = req.user.fbSessionValid || false;
  if (fbSessionValid) {
    // Check if storage state actually exists
    const hasState = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { facebookStorageState: true },
    });
    if (!hasState?.facebookStorageState) {
      fbSessionValid = false;
      await prisma.user
        .update({
          where: { id: req.user.id },
          data: { fbSessionValid: false },
        })
        .catch(() => {});
    }
  }

  // Check subscription status
  const activeSubscription = await prisma.subscription.findFirst({
    where: { userId: req.user.id, status: { in: ["ACTIVE", "CANCELLED"] } },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  // Check Instagram connection
  const instagramAccount = await prisma.connectedAccount.findFirst({
    where: { userId: req.user.id, provider: "INSTAGRAM", status: "ACTIVE" },
    select: {
      providerUserName: true,
      tokenExpiresAt: true,
      accessTokenEncrypted: true,
    },
  });

  // Backfill avatar from Instagram if user has no profile picture
  let avatarUrl = req.user.avatarUrl || null;
  if (
    instagramAccount &&
    !req.user.profileImage &&
    !req.user.avatarUrl &&
    instagramAccount.accessTokenEncrypted
  ) {
    try {
      const { decrypt } = await import("../utils/encryption.js");
      const token = decrypt(instagramAccount.accessTokenEncrypted);
      const profileRes = await fetch(
        `https://graph.instagram.com/me?fields=profile_picture_url&access_token=${token}`,
      );
      const profileData = await profileRes.json();
      if (profileData.profile_picture_url) {
        await prisma.user.update({
          where: { id: req.user.id },
          data: { avatarUrl: profileData.profile_picture_url },
        });
        avatarUrl = profileData.profile_picture_url;
      }
    } catch {
      /* non-critical */
    }
  }

  res.json(
    formatUserResponse(
      { ...req.user, fbSessionValid, avatarUrl },
      {
        instagramConnected: !!instagramAccount,
        instagramUsername: instagramAccount?.providerUserName || null,
        subscription: activeSubscription
          ? {
              status: activeSubscription.status,
              planName: activeSubscription.plan?.name,
              endsAt: activeSubscription.endsAt,
            }
          : null,
      },
    ),
  );
});

// Get decrypted Facebook credentials (internal use / for automation)
router.get("/facebook-credentials", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!req.user.facebookAppId || !req.user.facebookAppSecret) {
    return res
      .status(404)
      .json({ error: "No Facebook credentials configured" });
  }

  try {
    const appId = decrypt(req.user.facebookAppId);
    const appSecret = decrypt(req.user.facebookAppSecret);
    res.json({
      success: true,
      facebookAppId: appId,
      facebookAppSecret: appSecret,
    });
  } catch {
    res.status(500).json({ error: "Failed to decrypt credentials" });
  }
});

// Logout - invalidate refresh token
router.post("/logout", async (req, res) => {
  try {
    // Clear refresh token from DB if user is authenticated
    if (req.user) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { refreshToken: null },
      });
      log.info("Logout succeeded", { userId: req.user.id });
    }

    res.clearCookie("refreshToken", { path: "/api/auth" });
    res.json({ success: true, message: "Logged out successfully" });
  } catch {
    res.clearCookie("refreshToken", { path: "/api/auth" });
    res.json({ success: true, message: "Logged out" });
  }
});

// Change password step 1: verify current password & send code
router.post("/password/request-code", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { currentPassword } = req.body;
  if (!currentPassword) {
    return res.status(400).json({ error: "יש להזין סיסמה נוכחית" });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || !user.passwordHash) {
    return res
      .status(400)
      .json({ error: "לא ניתן לשנות סיסמה — חשבון ללא סיסמה" });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "סיסמה נוכחית שגויה" });
  }

  // Send verification code
  const code = generateCode();
  await createPasswordResetCode(user, code);

  const sent = await sendPasswordResetEmail(user.email, code);
  if (!sent) {
    return res.status(500).json({ error: "שגיאה בשליחת הקוד למייל" });
  }

  res.json({ success: true, email: user.email });
});

// Change password step 2: verify code & set new password
router.patch("/password", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { code, newPassword } = req.body;

  if (!code || !newPassword) {
    return res.status(400).json({ error: "יש למלא קוד אימות וסיסמה חדשה" });
  }

  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({ error: "סיסמה חדשה חייבת להכיל לפחות 6 תווים" });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const pending = await findValidPasswordReset(user.id, code);
  if (!pending) {
    return res.status(400).json({ error: "לא נמצא קוד אימות — בקש קוד חדש" });
  }

  if (pending.expiresAt < Date.now()) {
    await prisma.passwordResetToken.delete({ where: { id: pending.id } });
    return res.status(400).json({ error: "הקוד פג תוקף — בקש קוד חדש" });
  }

  if (pending.tokenHash !== hashOneTimeCode(code)) {
    return res.status(400).json({ error: "קוד שגוי" });
  }

  await prisma.passwordResetToken.update({
    where: { id: pending.id },
    data: { usedAt: new Date() },
  });

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash: newHash },
  });

  res.json({ success: true });
});

// Update profile (name / email)
router.patch("/profile", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { name, email } = req.body;
  const data = {};
  if (name !== undefined) data.name = name.trim() || null;
  if (email !== undefined) {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return res.status(400).json({ error: "אימייל לא תקין" });
    }
    // Check uniqueness
    const existing = await prisma.user.findFirst({
      where: { email: trimmed, id: { not: req.user.id } },
    });
    if (existing) {
      return res.status(409).json({ error: "אימייל כבר בשימוש" });
    }
    data.email = trimmed;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "אין שדות לעדכון" });
  }

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data,
  });

  res.json({
    success: true,
    user: { id: updated.id, email: updated.email, name: updated.name },
  });
});

// Upload avatar
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `avatar-${req.user.id}-${Date.now()}${ext}`);
  },
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Only image files allowed"));
    }
  },
});

router.post("/avatar", avatarUpload.single("avatar"), asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const profileImage = `/uploads/${req.file.filename}`;
  await persistUpload(req.file.path, req.file.filename, req.file.mimetype);
  await prisma.user.update({
    where: { id: req.user.id },
    data: { profileImage },
  });
  res.json({ success: true, profileImage });
}));

// Disconnect Facebook session
router.post("/disconnect-facebook", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  await prisma.user.update({
    where: { id: req.user.id },
    data: { facebookStorageState: null, fbSessionValid: false },
  });

  res.json({ success: true, message: "חיבור הפייסבוק נותק" });
});

// Save WhatsApp number
router.patch("/whatsapp", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { whatsappNumber, whatsappMessage } = req.body;

  // If updating message only
  if (whatsappMessage !== undefined && whatsappNumber === undefined) {
    const msg = whatsappMessage ? whatsappMessage.trim().slice(0, 500) : null;
    await prisma.user.update({
      where: { id: req.user.id },
      data: { whatsappMessage: msg || null },
    });
    return res.json({ success: true, whatsappMessage: msg || null });
  }

  if (
    whatsappNumber !== undefined &&
    whatsappNumber !== null &&
    whatsappNumber !== ""
  ) {
    let cleaned = whatsappNumber.replace(/[^0-9]/g, "");
    // Auto-convert Israeli mobile numbers (05x) to international format
    if (/^0[5][0-9]/.test(cleaned) && cleaned.length === 10) {
      cleaned = "972" + cleaned.slice(1);
    }
    if (cleaned.length < 9 || cleaned.length > 15) {
      return res
        .status(400)
        .json({ error: "מספר וואטסאפ לא תקין — אורך לא תקין" });
    }
    const data = { whatsappNumber: cleaned };
    if (whatsappMessage !== undefined) {
      data.whatsappMessage = whatsappMessage
        ? whatsappMessage.trim().slice(0, 500)
        : null;
    }
    await prisma.user.update({
      where: { id: req.user.id },
      data,
    });
    return res.json({
      success: true,
      whatsappNumber: cleaned,
      whatsappMessage: data.whatsappMessage ?? undefined,
    });
  }

  // Remove whatsapp number (and message)
  await prisma.user.update({
    where: { id: req.user.id },
    data: { whatsappNumber: null, whatsappMessage: null },
  });
  res.json({ success: true, whatsappNumber: null, whatsappMessage: null });
});

// ─── Notification Settings ──────────────────────────────────
router.patch("/notification-settings", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const {
    enabled,
    emailOnSuccess,
    emailOnFailure,
    emailOnSchedule,
    pushOnSuccess,
    pushOnFailure,
    pushOnSchedule,
  } = req.body;

  const settings = {
    enabled: Boolean(enabled),
    emailOnSuccess: Boolean(emailOnSuccess),
    emailOnFailure: Boolean(emailOnFailure),
    emailOnSchedule: Boolean(emailOnSchedule),
    pushOnSuccess: Boolean(pushOnSuccess),
    pushOnFailure: Boolean(pushOnFailure),
    pushOnSchedule: Boolean(pushOnSchedule),
  };

  await prisma.user.update({
    where: { id: req.user.id },
    data: { notificationSettings: settings },
  });

  res.json({ success: true, notificationSettings: settings });
});

export default router;
