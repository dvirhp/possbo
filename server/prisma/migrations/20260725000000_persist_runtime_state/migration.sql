CREATE TABLE "pending_registrations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "gender" TEXT,
    "phone" TEXT,
    "id_number" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "state_encrypted" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_bot_conversations" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "user_id" TEXT,
    "state" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_bot_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_bot_otps" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_bot_otps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pending_registrations_email_key" ON "pending_registrations"("email");
CREATE INDEX "pending_registrations_expires_at_idx" ON "pending_registrations"("expires_at");
CREATE UNIQUE INDEX "whatsapp_sessions_user_id_key" ON "whatsapp_sessions"("user_id");
CREATE UNIQUE INDEX "whatsapp_bot_conversations_phone_key" ON "whatsapp_bot_conversations"("phone");
CREATE INDEX "whatsapp_bot_conversations_user_id_idx" ON "whatsapp_bot_conversations"("user_id");
CREATE INDEX "whatsapp_bot_conversations_expires_at_idx" ON "whatsapp_bot_conversations"("expires_at");
CREATE UNIQUE INDEX "whatsapp_bot_otps_phone_key" ON "whatsapp_bot_otps"("phone");
CREATE INDEX "whatsapp_bot_otps_expires_at_idx" ON "whatsapp_bot_otps"("expires_at");

ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_bot_conversations" ADD CONSTRAINT "whatsapp_bot_conversations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_bot_otps" ADD CONSTRAINT "whatsapp_bot_otps_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
