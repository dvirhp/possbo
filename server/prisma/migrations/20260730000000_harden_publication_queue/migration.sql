ALTER TABLE "publication_jobs"
ADD COLUMN "schedule_id" TEXT,
ADD COLUMN "occurrence_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "publication_jobs_schedule_id_occurrence_at_key"
ON "publication_jobs"("schedule_id", "occurrence_at");

CREATE INDEX "publication_jobs_schedule_id_idx"
ON "publication_jobs"("schedule_id");

ALTER TABLE "publication_jobs"
ADD CONSTRAINT "publication_jobs_schedule_id_fkey"
FOREIGN KEY ("schedule_id")
REFERENCES "post_group_schedules"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
