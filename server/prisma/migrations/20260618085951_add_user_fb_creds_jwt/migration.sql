-- AlterTable
ALTER TABLE "users" ADD COLUMN     "facebook_app_id" TEXT,
ADD COLUMN     "facebook_app_secret" TEXT,
ADD COLUMN     "refresh_token" TEXT;
