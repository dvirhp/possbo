# Possbo deployment path

## Environments

| Environment | Branch | Database | Deployment |
|---|---|---|---|
| Local | any | local Docker Postgres | manual |
| Development | `develop` | isolated Neon dev branch | automatic after CI |
| Production | `main` | isolated Neon production branch | manual approval |

Never share JWT, encryption, OAuth, SMTP, proxy, database, storage, or WhatsApp credentials between environments.

## Local production-like stack

1. Copy `server/.env.docker.example` to `server/.env.docker`.
2. Replace all secret placeholders with independent random values.
3. Run `docker compose up --build`.
4. Verify `http://localhost:8000/health/ready` returns `ready`.

The `migrate` service runs `prisma migrate deploy` once before the API and worker start. The API always has `RUN_SCHEDULER=false`; only the worker schedules and processes jobs.

## Development deployment

Provision three services from the same immutable image:

- Migration/pre-deploy command: `npm run db:deploy`
- Web API command: `npm run start:api`, with `RUN_SCHEDULER=false`
- Background worker command: `npm run start:worker`, with `RUN_SCHEDULER=true`

The API health endpoints are `/health/live` and `/health/ready`. Terminate TLS at the hosting platform and set `CLIENT_URL`, OAuth callbacks, webhook URLs, and `MEDIA_PUBLIC_URL` to the public development domains.

## Secrets

Store secrets in the hosting platform or a dedicated secret manager, never in Git, Docker layers, Compose manifests, screenshots, or CI logs. GitHub environment secrets should contain only deployment credentials; runtime secrets should preferably stay in the runtime platform.

Required production values are validated at process startup:

- `DATABASE_URL`, `DIRECT_URL`, `CLIENT_URL`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`, `ENCRYPTION_KEY`

Feature-specific values (OAuth, AI, SMTP, WhatsApp, proxy) are optional at boot but their features remain unavailable until configured.

## Release order

1. CI lint, tests, client build, Prisma validation, and image build.
2. Tag the image with the Git commit SHA.
3. Create a database restore point.
4. Run `prisma migrate deploy` once.
5. Deploy the API and worker using the same image SHA.
6. Check readiness, login, media upload, AI, WhatsApp reconnect, and one test publication.
7. Roll back both services to the previous image SHA if smoke checks fail. Database migrations must remain backward compatible for at least one release.

### Existing database baseline

Migration `20260810160000_reconcile_schema` repairs historical schema drift and is required for every fresh database. The current existing Neon database already contains these objects from earlier direct schema changes. Before its first automated deployment, verify that `prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` reports no schema difference, back it up, and then mark this one migration as applied with `prisma migrate resolve --applied 20260810160000_reconcile_schema`. Do not execute the reconciliation SQL against an already-reconciled database.

## Current temporary limitation

Compose uses a shared uploads volume so API and worker can access the same media. This is acceptable for local development only. The cloud Development environment must use S3-compatible object storage before either service is horizontally scaled.
