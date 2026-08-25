-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('ONE_TIME', 'RECURRING', 'SCHEDULED');

-- DropForeignKey
ALTER TABLE "post_templates" DROP CONSTRAINT "post_templates_post_id_fkey";

-- DropForeignKey
ALTER TABLE "publication_history" DROP CONSTRAINT "publication_history_group_id_fkey";

-- DropForeignKey
ALTER TABLE "publication_history" DROP CONSTRAINT "publication_history_post_group_id_fkey";

-- AlterTable
ALTER TABLE "facebook_groups" ADD COLUMN     "member_count" INTEGER,
ADD COLUMN     "privacy_type" TEXT;

-- AlterTable
ALTER TABLE "post_group_schedules" ADD COLUMN     "ig_publish_type" TEXT,
ADD COLUMN     "platform" TEXT NOT NULL DEFAULT 'FACEBOOK',
ADD COLUMN     "post_id" TEXT,
ADD COLUMN     "target_type" TEXT NOT NULL DEFAULT 'GROUP',
ALTER COLUMN "post_group_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "post_media" ADD COLUMN     "ig_type" TEXT;

-- AlterTable
ALTER TABLE "post_templates" DROP COLUMN "post_id",
ADD COLUMN     "campaign_title" TEXT,
ADD COLUMN     "day_times" JSONB,
ADD COLUMN     "group_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ig_day_times" JSONB,
ADD COLUMN     "ig_recurring_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "ig_recurring_end_date" TEXT,
ADD COLUMN     "ig_recurring_start_date" TEXT,
ADD COLUMN     "ig_schedule_date" TEXT,
ADD COLUMN     "ig_schedule_mode" TEXT,
ADD COLUMN     "ig_schedule_time" TEXT,
ADD COLUMN     "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "instagram_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "instagram_publish_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "profile_day_times" JSONB,
ADD COLUMN     "profile_recurring_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "profile_recurring_end_date" TEXT,
ADD COLUMN     "profile_recurring_start_date" TEXT,
ADD COLUMN     "profile_schedule_date" TEXT,
ADD COLUMN     "profile_schedule_mode" TEXT,
ADD COLUMN     "profile_schedule_time" TEXT,
ADD COLUMN     "publish_to_profile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurring_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "recurring_times" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "schedule_mode" TEXT,
ADD COLUMN     "scheduled_date" TEXT,
ADD COLUMN     "story_media_mode" TEXT,
ADD COLUMN     "story_picked_index" INTEGER,
ADD COLUMN     "usage_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wa_day_times" JSONB,
ADD COLUMN     "wa_recurring_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "wa_recurring_end_date" TEXT,
ADD COLUMN     "wa_recurring_start_date" TEXT,
ADD COLUMN     "wa_schedule_date" TEXT,
ADD COLUMN     "wa_schedule_mode" TEXT,
ADD COLUMN     "wa_schedule_time" TEXT,
ADD COLUMN     "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsapp_targets" JSONB,
ADD COLUMN     "whatsapp_text" TEXT;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "campaign_type" "CampaignType" NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN     "day_times" JSONB,
ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "instagram_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "instagram_publish_type" TEXT,
ADD COLUMN     "is_paused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publish_to_profile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurring_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "recurring_end" TIMESTAMP(3),
ADD COLUMN     "recurring_start" TIMESTAMP(3),
ADD COLUMN     "recurring_time" TEXT,
ADD COLUMN     "recurring_times" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "scheduled_dates" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[],
ADD COLUMN     "story_captions" JSONB,
ADD COLUMN     "story_media_mode" TEXT,
ADD COLUMN     "story_picked_index" INTEGER,
ADD COLUMN     "template_name" TEXT,
ADD COLUMN     "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsapp_targets" JSONB;

-- AlterTable
ALTER TABLE "publication_history" ADD COLUMN     "platform" TEXT NOT NULL DEFAULT 'FACEBOOK',
ADD COLUMN     "target_type" TEXT NOT NULL DEFAULT 'GROUP',
ALTER COLUMN "group_id" DROP NOT NULL,
ALTER COLUMN "post_group_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "publication_jobs" ADD COLUMN     "ig_publish_type" TEXT,
ADD COLUMN     "platform" TEXT NOT NULL DEFAULT 'FACEBOOK',
ADD COLUMN     "post_id" TEXT,
ADD COLUMN     "target_type" TEXT NOT NULL DEFAULT 'GROUP',
ALTER COLUMN "post_group_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "gateway_customer_id" TEXT,
ADD COLUMN     "gateway_subscription_id" TEXT,
ADD COLUMN     "payment_token" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "apple_id" TEXT,
ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "facebook_oauth_id" TEXT,
ADD COLUMN     "fb_session_valid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "github_id" TEXT,
ADD COLUMN     "google_id" TEXT,
ADD COLUMN     "id_number" TEXT,
ADD COLUMN     "linkedin_id" TEXT,
ADD COLUMN     "notification_settings" JSONB,
ADD COLUMN     "whatsapp_message" TEXT,
ADD COLUMN     "whatsapp_number" TEXT,
ADD COLUMN     "whatsapp_session_connected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsapp_session_phone" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_contacts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "wa_id" TEXT NOT NULL,
    "name" TEXT,
    "push_name" TEXT,
    "phone" TEXT,
    "is_group" BOOLEAN NOT NULL DEFAULT false,
    "participant_count" INTEGER,
    "profile_pic_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_broadcast_lists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "members" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_broadcast_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "status" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "is_prorated" BOOLEAN NOT NULL DEFAULT false,
    "gateway_transaction_id" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_exposure" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "exposure_count" INTEGER NOT NULL DEFAULT 0,
    "posts_published" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_exposure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_stats" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "groups_count" INTEGER NOT NULL DEFAULT 0,
    "posts_count" INTEGER NOT NULL DEFAULT 0,
    "scheduled_count" INTEGER NOT NULL DEFAULT 0,
    "published_count" INTEGER NOT NULL DEFAULT 0,
    "exposure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_contacts_user_id_idx" ON "whatsapp_contacts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_contacts_user_id_wa_id_key" ON "whatsapp_contacts"("user_id", "wa_id");

-- CreateIndex
CREATE INDEX "whatsapp_broadcast_lists_user_id_idx" ON "whatsapp_broadcast_lists"("user_id");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_subscription_id_idx" ON "payments"("subscription_id");

-- CreateIndex
CREATE INDEX "daily_exposure_user_id_idx" ON "daily_exposure"("user_id");

-- CreateIndex
CREATE INDEX "daily_exposure_date_idx" ON "daily_exposure"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_exposure_user_id_date_key" ON "daily_exposure"("user_id", "date");

-- CreateIndex
CREATE INDEX "daily_stats_user_id_idx" ON "daily_stats"("user_id");

-- CreateIndex
CREATE INDEX "daily_stats_date_idx" ON "daily_stats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_stats_user_id_date_key" ON "daily_stats"("user_id", "date");

-- CreateIndex
CREATE INDEX "post_group_schedules_post_id_idx" ON "post_group_schedules"("post_id");

-- CreateIndex
CREATE INDEX "publication_history_user_id_status_published_at_idx" ON "publication_history"("user_id", "status", "published_at");

-- CreateIndex
CREATE INDEX "publication_metrics_publication_history_id_collected_at_idx" ON "publication_metrics"("publication_history_id", "collected_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_number_key" ON "users"("id_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_facebook_oauth_id_key" ON "users"("facebook_oauth_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_github_id_key" ON "users"("github_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_linkedin_id_key" ON "users"("linkedin_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_apple_id_key" ON "users"("apple_id");

-- AddForeignKey
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_broadcast_lists" ADD CONSTRAINT "whatsapp_broadcast_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_group_schedules" ADD CONSTRAINT "post_group_schedules_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_jobs" ADD CONSTRAINT "publication_jobs_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_history" ADD CONSTRAINT "publication_history_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_history" ADD CONSTRAINT "publication_history_post_group_id_fkey" FOREIGN KEY ("post_group_id") REFERENCES "post_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_exposure" ADD CONSTRAINT "daily_exposure_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_stats" ADD CONSTRAINT "daily_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
