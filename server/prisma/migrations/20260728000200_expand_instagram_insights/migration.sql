ALTER TABLE "publication_metrics"
  ADD COLUMN "views_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "saves_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "replies_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "total_interactions_count" INTEGER NOT NULL DEFAULT 0;
