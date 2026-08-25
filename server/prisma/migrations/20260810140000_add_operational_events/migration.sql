CREATE TABLE "operational_events" (
  "id" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "level" TEXT NOT NULL,
  "service" TEXT NOT NULL DEFAULT 'api',
  "module" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "request_id" TEXT,
  "user_id" TEXT,
  "trace_id" TEXT,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "status_code" INTEGER,
  "duration_ms" INTEGER,
  "metadata" JSONB,
  CONSTRAINT "operational_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "operational_events_timestamp_idx" ON "operational_events"("timestamp");
CREATE INDEX "operational_events_level_timestamp_idx" ON "operational_events"("level", "timestamp");
CREATE INDEX "operational_events_module_timestamp_idx" ON "operational_events"("module", "timestamp");
CREATE INDEX "operational_events_user_id_timestamp_idx" ON "operational_events"("user_id", "timestamp");
CREATE INDEX "operational_events_request_id_idx" ON "operational_events"("request_id");
CREATE INDEX "operational_events_entity_type_entity_id_idx" ON "operational_events"("entity_type", "entity_id");
