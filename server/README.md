# PostIt Server

Node.js + Express REST API with Prisma ORM.

## Structure

```
src/
├── index.js              # Express app entry point (PORT=5001)
├── config/
│   └── passport.js       # Passport strategies (JWT)
├── routes/
│   ├── auth.js           # Register, login, refresh, profile, password
│   ├── groups.js         # Groups CRUD, Facebook sync
│   ├── oauth.js          # Google + Facebook OAuth login/register
│   ├── publish.js        # Publish to Facebook groups
│   ├── scheduler.js      # Campaigns CRUD, scheduling, jobs, notifications
│   └── screenshot.js     # Page screenshot capture
└── utils/
    ├── async-handler.js  # Express async error wrapper
    ├── encryption.js     # AES-256-GCM encrypt/decrypt
    ├── facebook-automation.js  # Playwright Facebook posting
    ├── jwt.js            # Generate/verify JWT tokens
    ├── logger.js         # Structured logger
    ├── mailer.js         # Nodemailer email sending
    ├── posts-storage.js  # File-based post storage
    ├── puppeteer.js      # Browser automation helpers
    ├── security.js       # Input validation, file filters
    └── turnstile.js      # Cloudflare Turnstile verification
```

## Database

PostgreSQL via Prisma 5.22 on Neon serverless.

```bash
npx prisma generate    # Regenerate client after schema changes
npx prisma db push     # Push schema to database
npx prisma db pull     # Pull schema from database
npx prisma studio      # Visual database browser
npx prisma migrate dev # Create migration
```

## Auth Flow

1. Register: email/password + Turnstile CAPTCHA → verification code via email
2. Login: returns JWT access token (15min) + refresh token in httpOnly cookie (7d)
3. Refresh: POST /api/auth/refresh with cookie → new access token
4. Facebook session: stored encrypted in DB, used by Playwright for posting

## Scripts

```bash
npm run dev           # Start with nodemon (port 5001)
npm test              # Run Vitest tests
npm run test:coverage # Coverage report (threshold: 70%)
```

## Key Dependencies

- express, cors, cookie-parser, multer
- @prisma/client, prisma
- bcrypt, jsonwebtoken
- nodemailer
- playwright (Facebook automation)
- google-auth-library (OAuth)
