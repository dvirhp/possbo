import express from "express";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
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

const router = express.Router();
const log = createLogger("auth");
const SALT_ROUNDS = 10;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");

// In-memory store for pending email verifications (code → data)
// Format: { email: { code, data, expiresAt } }
const pendingVerifications = new Map();
const passwordResetCodes = new Map();

// Clean expired entries every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [key, val] of pendingVerifications) {
      if (val.expiresAt < now) pendingVerifications.delete(key);
    }
    for (const [key, val] of passwordResetCodes) {
      if (val.expiresAt < now) passwordResetCodes.delete(key);
    }
  },
  5 * 60 * 1000,
);

const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function setRefreshCookie(res, token) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_TOKEN_MAX_AGE,
    path: "/api/auth",
  });
}

// Register step 1: validate & send verification code
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, gender, phone, captchaToken } = req.body;

    // Verify Turnstile CAPTCHA
    const captchaValid = await verifyTurnstile(captchaToken, req.ip);
    if (!captchaValid) {
      return res.status(400).json({ error: "אימות CAPTCHA נכשל — נסה שוב" });
    }

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
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

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // Generate and send verification code
    const code = generateCode();
    pendingVerifications.set(normalizedEmail, {
      code,
      data: { email: normalizedEmail, password, name, gender, phone },
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    const sent = await sendVerificationEmail(normalizedEmail, code);
    if (!sent) {
      return res.status(500).json({ error: "שגיאה בשליחת המייל — נסה שוב" });
    }

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
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !code) {
      return res.status(400).json({ error: "חסר אימייל או קוד" });
    }

    const pending = pendingVerifications.get(normalizedEmail);
    if (!pending) {
      return res
        .status(400)
        .json({ error: "לא נמצא קוד אימות — נסה להירשם מחדש" });
    }

    if (pending.expiresAt < Date.now()) {
      pendingVerifications.delete(normalizedEmail);
      return res.status(400).json({ error: "הקוד פג תוקף — נסה להירשם מחדש" });
    }

    if (pending.code !== code.trim()) {
      return res.status(400).json({ error: "קוד שגוי — נסה שוב" });
    }

    // Code verified — create the user
    pendingVerifications.delete(normalizedEmail);
    const { password, name, gender, phone } = pending.data;

    // Double-check email not taken (race condition)
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: name || null,
        gender: gender || null,
        phone: phone || null,
      },
    });

    // Generate JWT tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshTokenHash },
    });

    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      success: true,
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profileImage: user.profileImage || null,
        avatarUrl: null,
        fbSessionValid: false,
        whatsappNumber: null,
        whatsappMessage: null,
        notificationSettings: null,
        createdAt: user.createdAt,
        subscription: null,
      },
    });
  } catch (error) {
    log.error("Email verification failed", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

// Resend verification code
router.post("/resend-code", async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    const pending = pendingVerifications.get(normalizedEmail);
    if (!pending) {
      return res.status(400).json({ error: "לא נמצאה הרשמה בהמתנה" });
    }

    // Generate new code
    const code = generateCode();
    pending.code = code;
    pending.expiresAt = Date.now() + 10 * 60 * 1000;

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

    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
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

    setRefreshCookie(res, refreshToken);

    // Check subscription status
    const activeSubscription = await prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ['ACTIVE', 'CANCELLED'] } },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profileImage: user.profileImage,
        avatarUrl: user.avatarUrl || null,
        fbSessionValid: user.fbSessionValid || false,
        whatsappNumber: user.whatsappNumber || null,
        whatsappMessage: user.whatsappMessage || null,
        notificationSettings: user.notificationSettings || null,
        createdAt: user.createdAt,
        subscription: activeSubscription ? {
          status: activeSubscription.status,
          planName: activeSubscription.plan?.name,
          endsAt: activeSubscription.endsAt,
        } : null,
      },
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
    const normalizedEmail = email?.trim().toLowerCase();

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
    passwordResetCodes.set(normalizedEmail, {
      code,
      userId: user.id,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

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
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !code || !newPassword) {
      return res.status(400).json({ error: "חסרים שדות חובה" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "סיסמה חייבת להכיל לפחות 6 תווים" });
    }

    if (newPassword.length > 128) {
      return res.status(400).json({ error: "סיסמה חייבת להכיל עד 128 תווים" });
    }

    const pending = passwordResetCodes.get(normalizedEmail);
    if (!pending) {
      return res.status(400).json({ error: "לא נמצא קוד אימות — בקש קוד חדש" });
    }

    if (pending.expiresAt < Date.now()) {
      passwordResetCodes.delete(normalizedEmail);
      return res.status(400).json({ error: "הקוד פג תוקף — בקש קוד חדש" });
    }

    if (pending.code !== code.trim()) {
      return res.status(400).json({ error: "קוד שגוי" });
    }

    passwordResetCodes.delete(normalizedEmail);

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: pending.userId },
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
    const user = await prisma.user.findUnique({
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
      return res.status(401).json({ error: "Token reuse detected" });
    }

    // Rotate: issue new tokens
    const newAccessToken = generateAccessToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);

    // Start hashing new token in parallel — don't block response
    const hashPromise = bcrypt.hash(newRefreshToken, SALT_ROUNDS);

    // Check subscription status
    const activeSubscription = await prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ['ACTIVE', 'CANCELLED'] } },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    setRefreshCookie(res, newRefreshToken);

    // Send response immediately — user doesn't need to wait for DB save
    res.json({
      success: true,
      accessToken: newAccessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profileImage: user.profileImage,
        avatarUrl: user.avatarUrl || null,
        fbSessionValid: user.fbSessionValid || false,
        whatsappNumber: user.whatsappNumber || null,
        whatsappMessage: user.whatsappMessage || null,
        notificationSettings: user.notificationSettings || null,
        createdAt: user.createdAt,
        subscription: activeSubscription ? {
          status: activeSubscription.status,
          planName: activeSubscription.plan?.name,
          endsAt: activeSubscription.endsAt,
        } : null,
      },
    });

    // Save new refresh token hash in background — don't block the response
    hashPromise
      .then((newRefreshHash) =>
        prisma.user.update({
          where: { id: user.id },
          data: { refreshToken: newRefreshHash },
        }),
      )
      .catch((err) => log.error("Failed to save refresh token hash", err));
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
    where: { userId: req.user.id, status: { in: ['ACTIVE', 'CANCELLED'] } },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    profileImage: req.user.profileImage,
    avatarUrl: req.user.avatarUrl || null,
    fbSessionValid,
    whatsappNumber: req.user.whatsappNumber || null,
    whatsappMessage: req.user.whatsappMessage || null,
    notificationSettings: req.user.notificationSettings || null,
    createdAt: req.user.createdAt,
    subscription: activeSubscription ? {
      status: activeSubscription.status,
      planName: activeSubscription.plan?.name,
      endsAt: activeSubscription.endsAt,
    } : null,
  });
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
  passwordResetCodes.set(user.email, {
    code,
    userId: user.id,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

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

  const pending = passwordResetCodes.get(user.email);
  if (!pending || pending.userId !== user.id) {
    return res.status(400).json({ error: "לא נמצא קוד אימות — בקש קוד חדש" });
  }

  if (pending.expiresAt < Date.now()) {
    passwordResetCodes.delete(user.email);
    return res.status(400).json({ error: "הקוד פג תוקף — בקש קוד חדש" });
  }

  if (pending.code !== code.trim()) {
    return res.status(400).json({ error: "קוד שגוי" });
  }

  passwordResetCodes.delete(user.email);

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

router.post("/avatar", avatarUpload.single("avatar"), async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const profileImage = `/uploads/${req.file.filename}`;
  await prisma.user.update({
    where: { id: req.user.id },
    data: { profileImage },
  });
  res.json({ success: true, profileImage });
});

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
