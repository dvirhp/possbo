import { Router } from "express";
import prisma from "../config/prisma.js";
import { parseWebhook } from "../services/billing-provider.js";
import { createLogger } from "../utils/logger.js";

const router = Router();
const log = createLogger("billing-webhook");

const asDate = (seconds) => seconds ? new Date(seconds * 1000) : null;

async function syncSubscription(db, providerSubscription) {
  const userId = providerSubscription.metadata?.userId;
  const planId = providerSubscription.metadata?.planId;
  if (!userId || !planId) throw new Error("Provider subscription is missing userId/planId metadata");
  const status = providerSubscription.status === "active" || providerSubscription.status === "trialing"
    ? "ACTIVE"
    : providerSubscription.status === "past_due" || providerSubscription.status === "unpaid"
      ? "PAST_DUE"
      : providerSubscription.status === "canceled" ? "CANCELLED" : "PENDING";
  return db.subscription.upsert({
    where: { gatewaySubscriptionId: providerSubscription.id },
    create: {
      userId, planId, status,
      startedAt: asDate(providerSubscription.start_date) || new Date(),
      endsAt: asDate(providerSubscription.current_period_end),
      cancelledAt: status === "CANCELLED" ? new Date() : null,
      gatewayCustomerId: String(providerSubscription.customer),
      gatewaySubscriptionId: providerSubscription.id,
    },
    update: {
      planId, status,
      endsAt: asDate(providerSubscription.current_period_end),
      cancelledAt: status === "CANCELLED" ? new Date() : null,
      gatewayCustomerId: String(providerSubscription.customer),
    },
  });
}

async function syncInvoice(db, invoice, succeeded) {
  const providerSub = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!providerSub) return;
  const subscription = await db.subscription.findUnique({ where: { gatewaySubscriptionId: providerSub } });
  if (!subscription) throw new Error(`Unknown provider subscription ${providerSub}`);
  const line = invoice.lines?.data?.[0];
  await db.payment.upsert({
    where: { gatewayInvoiceId: invoice.id },
    create: {
      userId: subscription.userId,
      subscriptionId: subscription.id,
      amount: (invoice.amount_due || 0) / 100,
      currency: String(invoice.currency || "ils").toUpperCase(),
      status: succeeded ? "SUCCESS" : "FAILED",
      periodStart: asDate(line?.period?.start) || new Date(),
      periodEnd: asDate(line?.period?.end) || new Date(),
      gatewayInvoiceId: invoice.id,
      gatewayTransactionId: typeof invoice.payment_intent === "string" ? invoice.payment_intent : null,
      invoiceUrl: invoice.hosted_invoice_url || null,
      invoicePdfUrl: invoice.invoice_pdf || null,
      failureReason: succeeded ? null : "Payment failed at provider",
    },
    update: {
      status: succeeded ? "SUCCESS" : "FAILED",
      gatewayTransactionId: typeof invoice.payment_intent === "string" ? invoice.payment_intent : null,
      invoiceUrl: invoice.hosted_invoice_url || null,
      invoicePdfUrl: invoice.invoice_pdf || null,
      failureReason: succeeded ? null : "Payment failed at provider",
    },
  });
  if (!succeeded) await db.subscription.update({ where: { id: subscription.id }, data: { status: "PAST_DUE" } });
}

router.post("/stripe", async (req, res) => {
  let event;
  try { event = parseWebhook(req.body, req.headers["stripe-signature"]); }
  catch { return res.status(400).json({ error: "Invalid webhook signature" }); }

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.billingWebhookEvent.createMany({
        data: [{ provider: "stripe", eventId: event.id, eventType: event.type }],
        skipDuplicates: true,
      });
      if (claimed.count === 0) return;
      // Use the transaction client for the marker; domain writes are idempotent themselves.
      if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
        await syncSubscription(tx, event.data.object);
      } else if (event.type === "invoice.paid") {
        await syncInvoice(tx, event.data.object, true);
      } else if (event.type === "invoice.payment_failed") {
        await syncInvoice(tx, event.data.object, false);
      }
      await tx.billingWebhookEvent.update({ where: { provider_eventId: { provider: "stripe", eventId: event.id } }, data: { processedAt: new Date() } });
    });
    res.json({ received: true });
  } catch (error) {
    log.error("Billing webhook processing failed", error, { eventId: event.id, eventType: event.type });
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
