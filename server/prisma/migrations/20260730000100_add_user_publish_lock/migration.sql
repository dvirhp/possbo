ALTER TABLE "publication_jobs"
ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "publication_jobs_idempotency_key_key"
ON "publication_jobs"("idempotency_key");

CREATE TABLE "user_publish_locks" (
  "user_id" TEXT NOT NULL,
  "owner_token" TEXT NOT NULL,
  "locked_until" TIMESTAMP(3) NOT NULL,
  "heartbeat_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_publish_locks_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX "user_publish_locks_locked_until_idx"
ON "user_publish_locks"("locked_until");

ALTER TABLE "user_publish_locks"
ADD CONSTRAINT "user_publish_locks_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
