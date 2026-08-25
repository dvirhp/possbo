import Stripe from "stripe";

let client;

export function billingEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    const error = new Error("Billing provider is not configured");
    error.code = "BILLING_NOT_CONFIGURED";
    throw error;
  }
  client ||= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export async function createCheckout({ user, plan }) {
  if (!plan.gatewayPriceId) {
    const error = new Error("The selected plan is not configured at the billing provider");
    error.code = "PLAN_NOT_CONFIGURED";
    throw error;
  }
  const baseUrl = process.env.CLIENT_URL.replace(/\/$/, "");
  return getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: plan.gatewayPriceId, quantity: 1 }],
    customer_email: user.email || undefined,
    client_reference_id: user.id,
    metadata: { userId: user.id, planId: plan.id },
    subscription_data: { metadata: { userId: user.id, planId: plan.id } },
    success_url: `${baseUrl}/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/subscription?checkout=cancelled`,
  }, { idempotencyKey: `checkout:${user.id}:${plan.id}` });
}

export function parseWebhook(body, signature) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

export async function cancelProviderSubscription(id) {
  return getStripe().subscriptions.update(id, { cancel_at_period_end: true });
}
