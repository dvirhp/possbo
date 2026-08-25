-- Persist the verified WhatsApp bot identity across server restarts and
-- in-memory conversation expiry.
ALTER TABLE "users" ADD COLUMN "whatsapp_bot_phone" TEXT;

CREATE UNIQUE INDEX "users_whatsapp_bot_phone_key"
ON "users"("whatsapp_bot_phone");
