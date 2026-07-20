import { Router } from "express";
import prisma from "../config/prisma.js";
import { requireAuth } from "../utils/auth-middleware.js";
import { createLogger } from "../utils/logger.js";

const router = Router();
const log = createLogger("subscription");

// Auth middleware
router.use(requireAuth);

// ─── GET /api/subscription/plans ─────────────────────────
router.get("/plans", async (req, res) => {
  try {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
    });
    res.json({ plans });
  } catch (err) {
    log.error("Failed to fetch plans", err);
    res.status(500).json({ error: "שגיאה בטעינת המסלולים" });
  }
});

// ─── GET /api/subscription/me ────────────────────────────
router.get("/me", async (req, res) => {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: { in: ["ACTIVE", "CANCELLED"] } },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ subscription });
  } catch (err) {
    log.error("Failed to fetch subscription", err);
    res.status(500).json({ error: "שגיאה בטעינת המנוי" });
  }
});

// ─── POST /api/subscription/subscribe ────────────────────
router.post("/subscribe", async (req, res) => {
  try {
    const { planId: _planId, token: _token } = req.body; // eslint-disable-line no-unused-vars
    const userId = req.user.id;

    // Check if user already has an active subscription
    const existing = await prisma.subscription.findFirst({
      where: { userId, status: "ACTIVE" },
    });
    if (existing) {
      return res.status(400).json({ error: "כבר יש לך מנוי פעיל" });
    }

    // Find the plan
    const plan = await prisma.plan.findFirst({
      where: { isActive: true },
    });
    if (!plan) {
      return res.status(404).json({ error: "מסלול לא נמצא" });
    }

    // TODO: In production, process payment with provider using the token
    // const paymentResult = await paymentProvider.charge({
    //   token,
    //   amount: plan.priceMonthly * 100, // in agorot
    //   currency: 'ILS',
    //   description: `PostIt - ${plan.name}`,
    //   recurring: true
    // })

    const now = new Date();
    const endsAt = new Date(now);
    endsAt.setMonth(endsAt.getMonth() + 1);

    // Create subscription
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        planId: plan.id,
        status: "ACTIVE",
        startedAt: now,
        endsAt,
        // gatewayCustomerId: paymentResult.customerId,
        // gatewaySubscriptionId: paymentResult.subscriptionId,
        // paymentToken: paymentResult.token,
      },
      include: { plan: true },
    });

    // Create payment record
    await prisma.payment.create({
      data: {
        userId,
        subscriptionId: subscription.id,
        amount: plan.priceMonthly,
        currency: "ILS",
        status: "SUCCESS",
        periodStart: now,
        periodEnd: endsAt,
        // gatewayTransactionId: paymentResult.transactionId,
      },
    });

    log.info(`User ${userId} subscribed to plan ${plan.name}`);
    res.json({ subscription, message: "המנוי הופעל בהצלחה" });
  } catch (err) {
    log.error("Failed to create subscription", err);
    res.status(500).json({ error: "שגיאה ביצירת המנוי" });
  }
});

// ─── POST /api/subscription/cancel ───────────────────────
router.post("/cancel", async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: "ACTIVE" },
      include: { plan: true },
    });

    if (!subscription) {
      return res.status(404).json({ error: "לא נמצא מנוי פעיל" });
    }

    // Calculate prorated amount
    const now = new Date();
    const periodStart = new Date(subscription.startedAt);
    const periodEnd = new Date(subscription.endsAt);
    const totalDays = Math.ceil(
      (periodEnd - periodStart) / (1000 * 60 * 60 * 24),
    );
    const usedDays = Math.ceil((now - periodStart) / (1000 * 60 * 60 * 24));
    const proratedAmount =
      (Number(subscription.plan.priceMonthly) / totalDays) * usedDays;

    // TODO: In production, cancel recurring billing with provider
    // await paymentProvider.cancelSubscription(subscription.gatewaySubscriptionId)

    // Update subscription
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
      },
    });

    log.info(
      `User ${userId} cancelled subscription. Prorated: ${proratedAmount.toFixed(2)} ILS`,
    );
    res.json({
      message: "המנוי בוטל בהצלחה",
      proratedAmount: proratedAmount.toFixed(2),
      usedDays,
      totalDays,
    });
  } catch (err) {
    log.error("Failed to cancel subscription", err);
    res.status(500).json({ error: "שגיאה בביטול המנוי" });
  }
});

// ─── GET /api/subscription/payments ──────────────────────
router.get("/payments", async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json({ payments });
  } catch (err) {
    log.error("Failed to fetch payments", err);
    res.status(500).json({ error: "שגיאה בטעינת היסטוריית התשלומים" });
  }
});

export default router;
