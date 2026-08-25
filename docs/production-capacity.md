# Production capacity runbook

## Before deployment

1. Set the worker container memory limit and mirror it in `WORKER_MEMORY_LIMIT_MB`. Start with 1024 MB. With the default 256 MB reserve and 350 MB estimate per Chromium, concurrency is 2.
2. Configure `REDIS_URL`. Without it rate limiting deliberately falls back to local memory, which is suitable only for one API replica.
3. Configure `ALERT_WEBHOOK_URL`; alert payloads are generic JSON and are rate-limited to one per type per 15 minutes.
4. Point the platform autoscaler at `GET /health/scaling`. Scale on `due_queue_depth` and `oldest_due_seconds`, not the future `scheduled_queue_depth`. Recommended first policy: add a worker above 100 due jobs or 120 seconds oldest-due age; remove only after both stay below half those values for 10 minutes.
5. Keep the API and worker as separate processes. Never enable `RUN_SCHEDULER` on API replicas when the dedicated worker is deployed.

## Load test

Install k6, start an isolated API/database, then run:

```powershell
docker compose -f compose.yaml -f compose.load.yaml --profile local-db up -d postgres redis migrate api
```

```powershell
$env:BASE_URL='http://localhost:8000'; npm run load:api
```

The test fails above 1% errors, p95 500 ms, or p99 1 second. To create a 5,000-item queue without calling Facebook/Instagram, copy an existing test job but schedule the copies 24 hours ahead:

```powershell
$env:SOURCE_JOB_ID='test-job-id'; $env:JOB_COUNT='5000'; npm run load:seed-queue
```

Never seed production. The script refuses production unless a separate explicit override is supplied.

## Operational checks

- `GET /api/operations/health-metrics?hours=24` (admin) returns HTTP p95/p99, queue wait p95, oldest pending job, success by platform, worker heartbeat, process memory/CPU, and live Chromium slots.
- `POST /api/scheduler/jobs/:jobId/replay` replays only failed jobs and preserves the original record.
- Retention runs daily. Defaults: events 30 days, metrics 180 days, successful/failed history 365 days, and unreferenced terminal jobs 90 days.
