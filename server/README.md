# Possbo Server

> Node.js + Express REST API with Prisma ORM — backend for Facebook & Instagram automation.

## Structure

```
src/
├── index.js                        # Express app entry point (HTTPS, PORT=5001)
├── config/
│   ├── prisma.js                   # Prisma client singleton
│   └── passport.js                 # Passport strategies (JWT + OAuth)
├── routes/                         # 11 route files (~80 endpoints)
│   ├── auth.js                     # Register, login, refresh, profile, password, avatar
│   ├── groups.js                   # Group search, sync, save, metadata, screenshots
│   ├── publish.js                  # Immediate publish (group + profile)
│   ├── scheduler.js                # Campaigns, scheduling, jobs, stats, metrics, exposure
│   ├── templates.js                # Template CRUD + usage tracking
│   ├── screenshot.js               # Facebook page screenshot capture
│   ├── ai.js                       # AI post generation (Google Gemini)
│   ├── oauth.js                    # OAuth login (Google, Facebook, GitHub, LinkedIn, Apple)
│   ├── instagram.js                # Instagram connection + publishing (Feed/Story/Reel)
│   ├── subscription.js             # Plans, billing, payments, cancellation
│   └── feedback.js                 # User feedback submission via email
├── utils/                          # 14 utility modules
│   ├── async-handler.js            # Express async error wrapper
│   ├── auth-middleware.js          # JWT verification middleware (requireAuth)
│   ├── encryption.js               # AES-256-GCM encrypt/decrypt (PBKDF2 key derivation)
│   ├── facebook-automation.js      # Playwright: session, scrape, publish, screenshots
│   ├── jwt.js                      # Generate/verify access (15min) + refresh (7d) tokens
│   ├── logger.js                   # Structured console logger (color-coded levels)
│   ├── mailer.js                   # Nodemailer: verification, password reset, feedback
│   ├── media-upload.js             # Upload media to public hosts (freeimage, imgur)
│   ├── metrics-scraper.js          # Playwright metrics collection (likes, comments, shares)
│   ├── posts-storage.js            # Prisma CRUD for posts, media, publication history
│   ├── rate-limit.js               # Rate limiters: general, auth, refresh, publish
│   ├── security.js                 # SSRF prevention, input sanitization, file filters
│   ├── turnstile.js                # Cloudflare Turnstile CAPTCHA verification
│   └── validators.js               # UUID, email, password, date validation helpers
└── jobs/                           # 5 background job handlers
    ├── index.js                    # Scheduler orchestrator (start/stop all tasks)
    ├── publication-scheduler.js    # Process pending jobs (60s) + generate from schedules (5min)
    ├── session-keepalive.js        # Validate FB sessions every 7.5 hours
    ├── group-metadata-refresh.js   # Daily group metadata sync (member counts, privacy)
    └── metrics-collector.js        # Periodically collect engagement metrics

prisma/
├── schema.prisma                   # Database schema (26 models)
└── migrations/                     # Migration history

scripts/                            # 10 dev/maintenance scripts
├── bootstrap-session.mjs           # Open browser for manual Facebook login
├── add-failed-post.mjs             # Insert test failure record
├── add-oauth-columns.mjs           # Migrate DB for OAuth columns
├── check-fb.mjs                    # Test Facebook session validity
├── debug-ig.mjs                    # Debug Instagram integration
├── measure-endpoints.mjs           # Performance benchmark all API endpoints
├── migrate-platform.mjs            # Migrate data between platforms
├── seed-test-campaign.mjs          # Create test campaign for development
├── sync-member-counts.mjs          # Sync group member counts from Facebook
└── test-endpoint.mjs               # Test single endpoint

tests/                              # 19 test files (Vitest + supertest)
├── routes/                         # 9 route test files
│   ├── auth.test.js, groups.test.js, publish.test.js
│   ├── scheduler.test.js, templates.test.js, screenshot.test.js
│   ├── subscription.test.js, ai.test.js, oauth.test.js
└── utils/                          # 10 utility test files
    ├── encryption.test.js, jwt.test.js, auth-middleware.test.js
    ├── async-handler.test.js, security.test.js, mailer.test.js
    ├── rate-limit.test.js, posts-storage.test.js
    ├── turnstile.test.js, validators.test.js
```

## Middleware Stack

```
Request → Helmet → CORS → JSON (1MB) → URL Parser → Cookie Parser
       → Rate Limiter (/api/) → Static Files (/uploads) → JWT User Loader
       → Routes → Error Handler
```

| Middleware        | Purpose                                           |
| ----------------- | ------------------------------------------------- |
| `helmet`          | Security headers (CSP disabled for SPA)           |
| `cors`            | Credentials enabled, `CLIENT_URL` origin only     |
| `express.json`    | 1MB body limit                                    |
| `cookieParser`    | Parse httpOnly refresh token cookie               |
| `generalLimiter`  | 300 requests / 15 min on `/api/`                  |
| Static `/uploads` | Cross-origin enabled for client on different port |
| JWT User Loader   | Authorization header → `req.user` (non-blocking)  |

## Database

PostgreSQL via Prisma 5 on Neon serverless (26 models).

```bash
npx prisma generate     # Regenerate client after schema changes
npx prisma db push      # Push schema to database
npx prisma db pull      # Pull schema from database
npx prisma studio       # Visual database browser
npx prisma migrate dev  # Create migration
```

## API Reference

### Auth (`/api/auth`) — 18 endpoints

| Method | Path                     | Auth   | Description                           |
| ------ | ------------------------ | ------ | ------------------------------------- |
| POST   | `/register`              | No     | Register with Turnstile CAPTCHA       |
| POST   | `/verify-email`          | No     | Verify email with code                |
| POST   | `/resend-code`           | No     | Resend verification code              |
| POST   | `/login`                 | No     | Login → access token + refresh cookie |
| POST   | `/forgot-password`       | No     | Send reset code via email             |
| POST   | `/reset-password`        | No     | Reset password with code              |
| POST   | `/refresh`               | Cookie | Refresh access token                  |
| POST   | `/verify-facebook`       | Yes    | Validate FB session status            |
| GET    | `/me`                    | Yes    | Current user info + session status    |
| GET    | `/facebook-credentials`  | Yes    | Get encrypted FB app credentials      |
| POST   | `/logout`                | Yes    | Clear refresh token cookie            |
| POST   | `/password/request-code` | Yes    | Request password change code          |
| PATCH  | `/password`              | Yes    | Change password                       |
| PATCH  | `/profile`               | Yes    | Update name, email, gender, phone     |
| POST   | `/avatar`                | Yes    | Upload avatar image                   |
| POST   | `/disconnect-facebook`   | Yes    | Remove Facebook session               |
| PATCH  | `/whatsapp`              | Yes    | Update WhatsApp number/message        |
| PATCH  | `/notification-settings` | Yes    | Update notification preferences       |

### Groups (`/api/groups`) — 12 endpoints

| Method | Path                       | Auth | Description                       |
| ------ | -------------------------- | ---- | --------------------------------- |
| POST   | `/search`                  | Yes  | Search Facebook group by name     |
| GET    | `/facebook-screenshot`     | Yes  | Capture group screenshot          |
| GET    | `/refresh-screenshot`      | Yes  | Refresh cached screenshot         |
| POST   | `/session/bootstrap`       | Yes  | Open browser for manual FB login  |
| GET    | `/scrape-my-groups`        | Yes  | Sync groups from Facebook account |
| GET    | `/my-groups`               | Yes  | Get all scraped groups            |
| GET    | `/saved`                   | Yes  | Get saved/bookmarked groups       |
| POST   | `/refresh-metadata`        | Yes  | Trigger metadata refresh          |
| GET    | `/refresh-metadata/status` | Yes  | Check refresh status              |
| GET    | `/:groupId/posts`          | Yes  | Publication history for group     |
| POST   | `/save`                    | Yes  | Manually save a group             |
| DELETE | `/:groupId`                | Yes  | Remove saved group                |

### Publish (`/api/publish`) — 3 endpoints

| Method | Path       | Auth | Description                           |
| ------ | ---------- | ---- | ------------------------------------- |
| POST   | `/`        | Yes  | Publish to Facebook group (multipart) |
| POST   | `/profile` | Yes  | Publish to user's Facebook profile    |
| GET    | `/history` | Yes  | Get publication history               |

### Scheduler (`/api/scheduler`) — 22 endpoints

| Method | Path                                | Auth | Description                        |
| ------ | ----------------------------------- | ---- | ---------------------------------- |
| POST   | `/schedule`                         | Yes  | Schedule post to groups            |
| POST   | `/campaigns`                        | Yes  | Create campaign (multipart)        |
| GET    | `/campaigns`                        | Yes  | List all campaigns                 |
| GET    | `/campaigns/recent`                 | Yes  | Drafts + recent for restore        |
| GET    | `/campaigns/:postId`                | Yes  | Single campaign detail             |
| PUT    | `/campaigns/:postId`                | Yes  | Update campaign (multipart)        |
| DELETE | `/campaigns/:postId`                | Yes  | Delete campaign                    |
| POST   | `/campaigns/:postId/duplicate`      | Yes  | Duplicate campaign                 |
| PATCH  | `/campaigns/:postId/pause`          | Yes  | Toggle pause state                 |
| GET    | `/jobs`                             | Yes  | List pending/running jobs          |
| DELETE | `/jobs/:jobId`                      | Yes  | Cancel pending job                 |
| GET    | `/history`                          | Yes  | Full publication history           |
| GET    | `/history/:pubId`                   | Yes  | Single publication detail          |
| DELETE | `/history/:id`                      | Yes  | Delete history record              |
| GET    | `/notifications`                    | Yes  | User notifications                 |
| PATCH  | `/notifications/read`               | Yes  | Mark all as read                   |
| GET    | `/session-status`                   | Yes  | Facebook session health            |
| POST   | `/publications/:id/refresh-metrics` | Yes  | Refresh single publication metrics |
| POST   | `/refresh-all-metrics`              | Yes  | Refresh all metrics                |
| GET    | `/stats`                            | Yes  | Aggregated publication stats       |
| GET    | `/exposure`                         | Yes  | Reach/impression data              |
| GET    | `/dashboard-data`                   | Yes  | Dashboard KPIs snapshot            |
| GET    | `/dashboard-kpis`                   | Yes  | Detailed KPIs with date range      |
| GET    | `/top-posts`                        | Yes  | Best performing posts              |

### Production scheduler

Set `RUN_SCHEDULER=true` on exactly one production process and set it to
`false` on additional web replicas. Each pass atomically claims up to
`PUBLICATION_CLAIM_LIMIT` due jobs and processes up to
`PUBLICATION_USER_CONCURRENCY` independent users concurrently. Jobs belonging
to the same user remain sequential.

For a separate worker service, run `npm run worker` and set
`RUN_SCHEDULER=false` on every web service.

### Templates (`/api/templates`) — 6 endpoints

| Method | Path       | Auth | Description                      |
| ------ | ---------- | ---- | -------------------------------- |
| GET    | `/`        | Yes  | List all templates               |
| GET    | `/:id`     | Yes  | Template detail                  |
| POST   | `/`        | Yes  | Create template (multipart)      |
| PUT    | `/:id`     | Yes  | Update template (multipart)      |
| DELETE | `/:id`     | Yes  | Delete template                  |
| POST   | `/:id/use` | Yes  | Mark as used (increment counter) |

### AI (`/api/ai`) — 1 endpoint

| Method | Path             | Auth | Description                 |
| ------ | ---------------- | ---- | --------------------------- |
| POST   | `/generate-post` | Yes  | Generate post via Gemini AI |

### OAuth (`/api/oauth`) — 5 endpoints

| Method | Path        | Auth | Description                   |
| ------ | ----------- | ---- | ----------------------------- |
| POST   | `/google`   | No   | Google OAuth login/register   |
| POST   | `/facebook` | No   | Facebook OAuth login/register |
| POST   | `/github`   | No   | GitHub OAuth login/register   |
| POST   | `/linkedin` | No   | LinkedIn OAuth login/register |
| POST   | `/apple`    | No   | Apple OAuth login/register    |

### Instagram (`/api/instagram`) — 6 endpoints

| Method | Path          | Auth | Description                |
| ------ | ------------- | ---- | -------------------------- |
| GET    | `/status`     | Yes  | Check Instagram connection |
| GET    | `/auth-url`   | Yes  | Generate OAuth URL         |
| POST   | `/connect`    | Yes  | Connect via OAuth code     |
| GET    | `/callback`   | No   | OAuth callback handler     |
| POST   | `/disconnect` | Yes  | Disconnect Instagram       |
| POST   | `/publish`    | Yes  | Publish (Feed/Story/Reel)  |

### Subscription (`/api/subscription`) — 5 endpoints

| Method | Path         | Auth | Description          |
| ------ | ------------ | ---- | -------------------- |
| GET    | `/plans`     | Yes  | Available plans      |
| GET    | `/me`        | Yes  | Current subscription |
| POST   | `/subscribe` | Yes  | Create subscription  |
| POST   | `/cancel`    | Yes  | Cancel subscription  |
| GET    | `/payments`  | Yes  | Payment history      |

### Feedback (`/api/feedback`) — 1 endpoint

| Method | Path | Auth | Description               |
| ------ | ---- | ---- | ------------------------- |
| POST   | `/`  | Yes  | Submit feedback via email |

### Screenshot (`/api/screenshot`) — 1 endpoint

| Method | Path | Auth | Description                     |
| ------ | ---- | ---- | ------------------------------- |
| GET    | `/`  | No   | Capture Facebook URL screenshot |

## Auth Flow

1. **Register** — email/password + Turnstile CAPTCHA → verification code via email
2. **Verify** — submit code → account activated
3. **Login** — returns JWT access token (15min) + refresh token in httpOnly cookie (7d)
4. **Refresh** — `POST /api/auth/refresh` with cookie → new access token
5. **OAuth** — Google/Facebook/GitHub/LinkedIn/Apple → create or link account → tokens
6. **Facebook session** — stored encrypted in DB, used by Playwright for posting

## Background Jobs

| Job                      | Interval   | Description                                     |
| ------------------------ | ---------- | ----------------------------------------------- |
| Process publication jobs | 60 seconds | Execute pending `PENDING` jobs via Playwright   |
| Generate scheduled jobs  | 5 minutes  | Create `PublicationJob` from active schedules   |
| Session keep-alive       | 7.5 hours  | Validate FB session cookies, nullify expired    |
| Group metadata refresh   | Daily      | Sync member counts, privacy type                |
| Metrics collector        | Periodic   | Collect engagement metrics from published posts |

## Scripts

```bash
npm run dev              # Start with --watch (port 5001)
npm start                # Production start
npm test                 # Run Vitest tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run lint             # ESLint (flat config)
npm run prisma:generate  # Regenerate Prisma client
npm run prisma:migrate   # Create migration
npm run prisma:studio    # Visual DB browser
```

## Key Dependencies

| Package                          | Purpose               |
| -------------------------------- | --------------------- |
| `express`                        | Web framework         |
| `@prisma/client`                 | Database ORM          |
| `bcrypt`                         | Password hashing      |
| `jsonwebtoken`                   | JWT tokens            |
| `playwright`                     | Facebook automation   |
| `nodemailer`                     | Email sending         |
| `multer`                         | File uploads          |
| `sharp`                          | Image processing      |
| `helmet`                         | Security headers      |
| `express-rate-limit`             | Rate limiting         |
| `google-auth-library`            | Google OAuth          |
| `passport` + `passport-facebook` | Facebook OAuth        |
| `cors`                           | Cross-origin requests |
| `cookie-parser`                  | Cookie parsing        |
