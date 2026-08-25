import { Router } from "express";
import prisma from "../config/prisma.js";
import { requireAuth } from "../utils/auth-middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { sendWebPushToUser, webPushEnabled } from "../utils/web-push.js";

const router = Router();
router.use(requireAuth);

router.get("/public-key", (_req, res) => {
  if (!webPushEnabled()) return res.status(503).json({ error: "התראות Push אינן מוגדרות בשרת" });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post("/subscribe", asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: "Push subscription אינה תקינה" });
  if (!endpoint.startsWith("https://") || endpoint.length > 2048) return res.status(400).json({ error: "Push endpoint אינו תקין" });
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: req.get("user-agent")?.slice(0, 500) },
    update: { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: req.get("user-agent")?.slice(0, 500) },
  });
  res.status(201).json({ success: true });
}));

router.delete("/subscribe", asyncHandler(async (req, res) => {
  const endpoint = String(req.body?.endpoint || "");
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { userId: req.user.id, endpoint } });
  res.json({ success: true });
}));

router.post("/test", asyncHandler(async (req, res) => {
  const result = await sendWebPushToUser(req.user.id, { title: "Possbo מחובר", body: "התראות Push פועלות במכשיר הזה.", url: "/dashboard" });
  if (result.disabled) return res.status(503).json({ error: "התראות Push אינן מוגדרות בשרת" });
  res.json({ success: true, sent: result.sent });
}));

export default router;
