ALTER TABLE "plans" ADD COLUMN "gateway_price_id" TEXT;
CREATE UNIQUE INDEX "plans_gateway_price_id_key" ON "plans"("gateway_price_id");

CREATE UNIQUE INDEX "subscriptions_gateway_subscription_id_key" ON "subscriptions"("gateway_subscription_id");

ALTER TABLE "payments"
  ADD COLUMN "gateway_invoice_id" TEXT,
  ADD COLUMN "invoice_url" TEXT,
  ADD COLUMN "invoice_pdf_url" TEXT;
CREATE UNIQUE INDEX "payments_gateway_invoice_id_key" ON "payments"("gateway_invoice_id");

CREATE TABLE "billing_webhook_events" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_webhook_events_provider_event_id_key" ON "billing_webhook_events"("provider", "event_id");
CREATE INDEX "billing_webhook_events_created_at_idx" ON "billing_webhook_events"("created_at");
