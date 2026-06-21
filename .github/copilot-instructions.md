---
description: "PostIt project overview and architecture conventions for AI agents"
applyTo: "**"
---

# PostIt — Project Architecture Guide

## Overview

PostIt is a Facebook group management and automated publishing platform.  
Users connect their Facebook account (via Playwright browser automation), manage groups, create posts, and publish them to multiple groups simultaneously — with scheduling and retry capabilities.

## Tech Stack

| Layer         | Technology                                                  |
| ------------- | ----------------------------------------------------------- |
| Frontend      | React 18 + Vite 5 + React Router 6                          |
| Backend       | Node.js + Express 4 (ESM)                                   |
| Database      | PostgreSQL (Neon, pooled)                                   |
| ORM           | Prisma 5                                                    |
| Auth          | JWT (access 15min / refresh 7d in httpOnly cookie) + bcrypt |
| FB Automation | Playwright (headless browser, cookie-based sessions)        |
| Encryption    | AES-256-GCM (PBKDF2 derived keys)                           |
| Testing       | Vitest + @testing-library/react + supertest                 |
| CI/CD         | GitHub Actions (lint → test → build)                        |
| Language      | Hebrew UI (RTL), English code                               |

## Monorepo Structure

```
postit/
├── client/          # React frontend (Vite)
├── server/          # Express backend (ESM)
├── .github/         # CI workflows
└── .copilot/        # Agent docs (this folder)
```

## Key Conventions

### Code Style

- **ESM everywhere** — `import/export`, `"type": "module"` in both package.json files
- **No TypeScript** — plain JavaScript with JSDoc when needed
- **Flat ESLint config** — `eslint.config.js` (ESLint 9 format)
- **RTL direction** — all UI text is Hebrew, CSS uses `direction: rtl`

### Backend Patterns

- Routes in `server/src/routes/` — each file exports an Express Router
- Utilities in `server/src/utils/` — pure functions, no side effects
- Background jobs in `server/src/jobs/` — interval-based scheduler
- Auth middleware: `req.user` populated by JWT in Authorization header
- Error handling: `asyncHandler()` wrapper + global error middleware
- Secrets encrypted with `encrypt()`/`decrypt()` from `utils/encryption.js`

### Frontend Patterns

- Pages in `client/src/pages/` — one component per route
- Services in `client/src/services/` — axios-based API wrappers
- Styles in `client/src/styles/` — one CSS file per page/component
- i18n in `client/src/assets/i18n/` — Hebrew locale object
- Auth state: JWT stored in memory (http.js), refresh via httpOnly cookie

### Database

- Prisma schema at `server/prisma/schema.prisma`
- Migrations tracked in `server/prisma/migrations/`
- All IDs are UUIDs (`@default(uuid())`)
- Timestamps: `createdAt`, `updatedAt` on every model
- Column naming: `snake_case` mapped with `@map()`

### Testing

- Server tests: `server/tests/` — unit tests for utils, routes, services
- Client tests: `client/src/test/` — component + service tests
- Run: `npm test` in either directory
- Coverage: `npm run test:coverage`

## Environment Variables (server/.env)

```
DATABASE_URL=          # PostgreSQL connection string
JWT_SECRET=            # Access token signing
JWT_REFRESH_SECRET=    # Refresh token signing
ENCRYPTION_KEY=        # AES master key (≥32 chars)
FACEBOOK_APP_ID=       # App-level FB credentials
FACEBOOK_APP_SECRET=   # App-level FB secret
CLIENT_URL=            # CORS origin (http://localhost:3000)
PORT=                  # Server port (5001)
```

## Running Locally

```bash
# Server
cd server && npm install && npx prisma generate && npm run dev

# Client
cd client && npm install && npm run dev
```

Server runs on `:5001`, Client on `:3000`.
