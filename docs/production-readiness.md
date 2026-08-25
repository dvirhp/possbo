# Production readiness runbook

## Billing

1. Create recurring Stripe Prices and write each `price_...` value to `plans.gateway_price_id`.
2. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the runtime secret manager.
3. Register `POST https://<api>/webhooks/billing/stripe` for subscription create/update/delete and invoice paid/payment-failed events.
4. Run one test-clock renewal, one declined renewal, invoice download, end-of-period cancellation, and duplicate webhook replay before enabling live mode.

The API never accepts card data and never activates access from the checkout response. Signed webhooks are authoritative.

## Migration rehearsal on a production clone

1. Take a provider snapshot and a `pg_dump` (`npm run db:backup`). Record size and checksum outside the database host.
2. Restore it to an isolated database with `RESTORE_VERIFY_CONFIRM=DISPOSABLE_DATABASE npm run db:restore:verify -- <dump>`.
3. Point `DIRECT_URL` and `DATABASE_URL` at the clone. Run `npm run db:status`, `npm run db:drift`, and `npm run db:deploy`.
4. Run `npm run db:drift` again; it must exit 0. Compare row counts for users, posts, jobs, publications, subscriptions and payments.
5. Run the application smoke suite against the clone. Measure migration and restore time and confirm both fit the recovery objectives.

Never run `migrate resolve`, destructive restore, or reconciliation SQL on production without a fresh restore point and a reviewed drift report.

## Backup and restore drill

- Enable encrypted provider PITR plus a daily logical dump copied to a separate account/region.
- Suggested initial targets: RPO 24 hours for logical backups plus provider PITR, RTO 4 hours. Tighten after usage grows.
- Quarterly, restore the newest dump to a disposable database, validate migrations, row counts and authenticated reads, then record duration and evidence.
- Object storage needs versioning, lifecycle retention and replication; database backups do not contain media objects.

## Object storage

Production startup requires `STORAGE_DRIVER=s3` and S3-compatible credentials. Use a private bucket and `S3_PUBLIC_BASE_URL` only behind a controlled CDN; otherwise publishing uses short-lived signed URLs. Enable bucket versioning, encryption, CORS for the client origin, and lifecycle cleanup for abandoned media.
