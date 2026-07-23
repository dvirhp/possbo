---
description: "Possbo project overview and architecture conventions for AI agents"
applyTo: "**"
---

# Possbo — Project Architecture Guide

## Overview

Possbo is a multi-platform social media management and automated publishing platform.  
Users connect their Facebook account (via Playwright browser automation) and Instagram (via Graph API), manage groups, create campaigns with AI-powered content generation, and publish them to multiple groups simultaneously — with scheduling, retry capabilities, and engagement analytics.

## Tech Stack

| Layer         | Technology                                                          |
| ------------- | ------------------------------------------------------------------- |
| Frontend      | React 18 + Vite 5 + React Router 6                                  |
| Backend       | Node.js + Express 4 (ESM)                                           |
| Database      | PostgreSQL (Neon, pooled)                                           |
| ORM           | Prisma 5 (26 models)                                                |
| Auth          | JWT (access 15min / refresh 7d in httpOnly cookie) + bcrypt + OAuth |
| OAuth         | Google, Facebook, GitHub, LinkedIn, Apple (via code/token exchange) |
| FB Automation | Playwright (headless browser, cookie-based sessions)                |
| Instagram     | Instagram Graph API (Feed, Story, Reel)                             |
| AI            | Google Gemini API (post generation)                                 |
| Encryption    | AES-256-GCM (PBKDF2 derived keys)                                   |
| Email         | Nodemailer + Gmail SMTP                                             |
| CAPTCHA       | Cloudflare Turnstile                                                |
| Security      | Helmet, CORS, express-rate-limit, SSRF prevention                   |
| Media         | Sharp (image processing), Multer (uploads)                          |
| Charts        | Recharts (analytics dashboard)                                      |
| Icons         | Lucide React                                                        |
| Testing       | Vitest + @testing-library/react + supertest                         |
| CI/CD         | GitHub Actions (lint → test → build)                                |
| Language      | Hebrew UI (RTL), English code                                       |

## Monorepo Structure

```
possbo/
├── client/          # React frontend (Vite) — 19 pages, 24 components, 8 services
├── server/          # Express backend (ESM) — 11 routes, 14 utils, 5 jobs
├── scripts/         # Dev scripts (concurrent client + server)
├── .github/         # CI workflows + this file
└── .copilot/        # Deep-dive architecture docs
```

## Key Conventions

### Code Style

- **ESM everywhere** — `import/export`, `"type": "module"` in both package.json files
- **No TypeScript** — plain JavaScript with JSDoc when needed
- **Flat ESLint config** — `eslint.config.js` (ESLint 9 format)
- **RTL direction** — all UI text is Hebrew, CSS uses `direction: rtl`

### Backend Patterns

- Routes in `server/src/routes/` — each file exports an Express Router (11 files, ~80 endpoints)
- Utilities in `server/src/utils/` — pure functions, no side effects (16 modules)
- **Auth service** — `utils/auth-service.js` centralizes `setRefreshCookie()`, `issueTokens()`, `formatUserResponse()`, `normalizeEmail()`. All auth/OAuth routes import from here — never duplicate cookie/token logic
- **Upload service** — `utils/upload-service.js` centralizes Multer config with `uploadImages(category)`, `uploadSingle(category)`, `uploadFields(category, fields)`. All routes use this instead of local Multer setup
- Background jobs in `server/src/jobs/` — interval-based scheduler (5 handlers)
- Config in `server/src/config/` — Prisma client singleton + Passport strategies
- Auth middleware: `req.user` populated by JWT in Authorization header; `requireAuth` for protected routes
- Error handling: `asyncHandler()` wrapper + global error middleware
- Secrets encrypted with `encrypt()`/`decrypt()` from `utils/encryption.js`
- Rate limiting: general (300/15min), auth (10/15min), refresh (30/15min), publish (30/hour)
- Structured logging via `utils/logger.js` (color-coded levels)
- Input validation via `utils/validators.js` + `utils/security.js` (SSRF prevention)

### Frontend Patterns

- Pages in `client/src/pages/` — one component per route (19 pages)
- Components in `client/src/components/` — reusable UI components (24 components)
- Services in `client/src/services/` — axios-based API wrappers (8 modules)
- Utilities in `client/src/utils/` — shared helpers (e.g. `formData.js` for `buildFormData()`)
- Context in `client/src/context/` — DataProvider (auth/state), ThemeProvider, NavigationGuard
- Styles in `client/src/styles/` — one CSS file per page/component (32 CSS files)
- i18n in `client/src/assets/i18n/` — Hebrew locale object (`he.js`)
- Auth state: JWT stored in memory (`http.js`), refresh via httpOnly cookie
- Protected routes wrapped with `AuthLayout` component
- Code splitting: `React.lazy()` + `Suspense` for protected pages
- Background publishing: custom events (`possbo-publish-start/done`) + global banner

### Database

- Prisma schema at `server/prisma/schema.prisma` (26 models)
- Migrations tracked in `server/prisma/migrations/`
- All IDs are UUIDs (`@default(uuid())`)
- Timestamps: `createdAt`, `updatedAt` on every model
- Column naming: `snake_case` mapped with `@map()`
- Key models: User, ConnectedAccount, Post, PostMedia, Group, UserGroup, PostGroup, PostGroupSchedule, PublicationJob, PublicationHistory, PublicationMetric, PostTemplate, Notification, Subscription, DailyStats, DailyExposure

### Testing

- Server tests: `server/tests/` — 21 test files (routes + utils)
- Client tests: `client/src/test/` — 20 test files (pages + components + services + assets)
- Use `--pool=forks` for full server suite to avoid test isolation issues
- Run: `npm test` in either directory
- Coverage: `npm run test:coverage`

## Route Files

| Prefix              | File              | Endpoints | Description                                              |
| ------------------- | ----------------- | --------- | -------------------------------------------------------- |
| `/api/auth`         | `auth.js`         | 18        | Authentication, profile, password, avatar, notifications |
| `/api/groups`       | `groups.js`       | 12        | Group search, sync, save, metadata, screenshots          |
| `/api/publish`      | `publish.js`      | 3         | Immediate publish (group + profile)                      |
| `/api/scheduler`    | `scheduler.js`    | 22        | Campaigns, scheduling, jobs, stats, metrics, exposure    |
| `/api/templates`    | `templates.js`    | 6         | Template CRUD + usage tracking                           |
| `/api/screenshot`   | `screenshot.js`   | 1         | Facebook page screenshot                                 |
| `/api/ai`           | `ai.js`           | 1         | AI post generation (Gemini)                              |
| `/api/oauth`        | `oauth.js`        | 5         | OAuth (Google, FB, GitHub, LinkedIn, Apple)              |
| `/api/instagram`    | `instagram.js`    | 6         | Instagram connection + publishing                        |
| `/api/subscription` | `subscription.js` | 5         | Plans, billing, payments                                 |
| `/api/feedback`     | `feedback.js`     | 1         | User feedback via email                                  |

## Environment Variables (server/.env)

```
DATABASE_URL=          # PostgreSQL connection string (pooled)
DIRECT_URL=            # PostgreSQL connection string (direct)
JWT_SECRET=            # Access token signing
JWT_REFRESH_SECRET=    # Refresh token signing
ENCRYPTION_KEY=        # AES master key (≥32 chars)
FACEBOOK_APP_ID=       # App-level FB credentials
FACEBOOK_APP_SECRET=   # App-level FB secret
GOOGLE_CLIENT_ID=      # Google OAuth
GOOGLE_CLIENT_SECRET=  # Google OAuth
GITHUB_CLIENT_ID=      # GitHub OAuth
GITHUB_CLIENT_SECRET=  # GitHub OAuth
INSTAGRAM_APP_ID=      # Instagram/Facebook app ID
INSTAGRAM_APP_SECRET=  # Instagram/Facebook app secret
GEMINI_API_KEY=        # Google Gemini AI API key
TURNSTILE_SECRET_KEY=  # Cloudflare Turnstile
SMTP_HOST=             # Email server (smtp.gmail.com)
SMTP_PORT=             # Email port (587)
SMTP_USER=             # Gmail address
SMTP_PASS=             # Gmail app password
CLIENT_URL=            # CORS origin (http://localhost:3000)
PORT=                  # Server port (5001)
```

## Running Locally

```bash
# Both (from root)
npm run dev

# Server only
cd server && npm install && npx prisma generate && npm run dev

# Client only
cd client && npm install && npm run dev
```

Server runs on `https://localhost:5001`, Client on `http://localhost:3000`.

## Architecture Deep Dive

See `.copilot/` for detailed docs:

| Document                                                  | Content                                                  |
| --------------------------------------------------------- | -------------------------------------------------------- |
| [data-flow.md](.copilot/data-flow.md)                     | 13 data flow diagrams (auth, OAuth, Instagram, AI, etc.) |
| [security.md](.copilot/security.md)                       | Encryption, auth, rate limiting, SSRF, CAPTCHA           |
| [database.md](.copilot/database.md)                       | 26 Prisma models, ERD, conventions, key queries          |
| [publishing-pipeline.md](.copilot/publishing-pipeline.md) | 5 publishing modes, retry logic, metrics collection      |
