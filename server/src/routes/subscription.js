import { Router } from "express";
import prisma from "../config/prisma.js";
import { requireAuth } from "../utils/auth-middleware.js";
import { createCheckout, cancelProviderSubscription, billingEnabled } from "../services/billing-provider.js";
import { createLogger } from "../utils/logger.js";

const router = Router();
const log = createLogger("subscription");
router.use(requireAuth);

router.get("/plans", async (_req, res) => {
  try {
    const plans = await prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceMonthly: "asc" } });
    res.json({ plans, billingAvailable: billingEnabled() });
  } catch (error) {
    log.error("Failed to fetch plans", error);
    res.status(500).json({ error: "Failed to load plans" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: { in: ["ACTIVE", "PAST_DUE", "CANCELLED", "PENDING"] } },
      include: { plan: true }, orderBy: { createdAt: "desc" },
    });
    res.json({ subscription });
  } catch (error) {
    log.error("Failed to fetch subscription", error);
    res.status(500).json({ error: "Failed to load subscription" });
  }
});

// Creates a hosted checkout session. Activation happens only after a signed webhook.
router.post("/subscribe", async (req, res) => {
  try {
    const planId = String(req.body?.planId || "");
    if (!planId) return res.status(400).json({ error: "planId is required" });
    const existing = await prisma.subscription.findFirst({ where: { userId: req.user.id, status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] } } });
    if (existing) return res.status(409).json({ error: "An open subscription already exists" });
    const plan = await prisma.plan.findFirst({ where: { id: planId, isActive: true } });
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    const checkout = await createCheckout({ user: req.user, plan });
    res.status(201).json({ checkoutUrl: checkout.url, sessionId: checkout.id });
  } catch (error) {
    log.error("Failed to create checkout", error);
    if (error.code === "BILLING_NOT_CONFIGURED" || error.code === "PLAN_NOT_CONFIGURED") {
      return res.status(503).json({ error: error.message, code: error.code });
    }
    res.status(502).json({ error: "Billing provider is temporarily unavailable" });
  }
});

router.post("/cancel", async (req, res) => {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: { in: ["ACTIVE", "PAST_DUE"] } },
    });
    if (!subscription) return res.status(404).json({ error: "Active subscription not found" });
    if (!subscription.gatewaySubscriptionId) return res.status(409).json({ error: "Subscription is not managed by the billing provider" });
    const providerSubscription = await cancelProviderSubscription(subscription.gatewaySubscriptionId);
    // Webhook remains authoritative; reflect the scheduled cancellation without revoking paid access.
    await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelledAt: new Date() } });
    res.json({ message: "Cancellation scheduled", cancelAt: providerSubscription.cancel_at ? new Date(providerSubscription.cancel_at * 1000) : subscription.endsAt });
  } catch (error) {
    log.error("Failed to cancel subscription", error);
    if (error.code === "BILLING_NOT_CONFIGURED") return res.status(503).json({ error: error.message, code: error.code });
    res.status(502).json({ error: "Could not cancel at billing provider" });
  }
});

router.get("/payments", async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: 20 });
    res.json({ payments });
  } catch (error) {
    log.error("Failed to fetch payments", error);
    res.status(500).json({ error: "Failed to load payments" });
  }
});

export default router;
