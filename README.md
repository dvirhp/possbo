# Possbo

> פלטפורמה לניהול קבוצות פייסבוק ופרסום אוטומטי מרובה-פלטפורמות.

Possbo מאפשרת למשתמשים לחבר את חשבון הפייסבוק שלהם (באמצעות Playwright), לנהל קבוצות, ליצור קמפיינים ולפרסם במקביל למספר קבוצות — עם תזמון, ניסיונות חוזרים, ותמיכה באינסטגרם.

---

## תוכן עניינים

- [ארכיטקטורה](#ארכיטקטורה)
- [טכנולוגיות](#טכנולוגיות)
- [תכונות](#תכונות)
- [התקנה מהירה](#התקנה-מהירה)
- [משתני סביבה](#משתני-סביבה)
- [סקריפטים](#סקריפטים)
- [טסטים](#טסטים)
- [מבנה API](#מבנה-api)
- [תיעוד נוסף](#תיעוד-נוסף)

---

## ארכיטקטורה

```
possbo/
├── client/                  # React 18 + Vite 5 (SPA)
│   ├── src/
│   │   ├── components/      # 24 reusable UI components
│   │   ├── context/         # DataProvider, ThemeProvider, NavigationGuard
│   │   ├── pages/           # 19 route pages
│   │   ├── services/        # 8 API service modules
│   │   ├── styles/          # 32 CSS files (one per page/component)
│   │   ├── assets/i18n/     # Hebrew translations
│   │   └── test/            # Vitest + React Testing Library
│   └── package.json
├── server/                  # Node.js + Express (ESM)
│   ├── src/
│   │   ├── routes/          # 11 route files (~80 endpoints)
│   │   ├── utils/           # 14 utility modules
│   │   ├── jobs/            # 5 background job handlers
│   │   └── config/          # Prisma client, Passport strategies
│   ├── prisma/              # Schema (26 models) + Migrations
│   ├── scripts/             # 10 dev/maintenance scripts
│   └── tests/               # Vitest + supertest (19 test files)
├── scripts/                 # dev.mjs (concurrent client + server)
├── .copilot/                # Deep-dive architecture docs for AI agents
└── .github/                 # CI workflows + copilot-instructions.md
```

## טכנולוגיות

| Layer      | Stack                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------ |
| Frontend   | React 18, Vite 5, React Router v6, Axios, Recharts, Lucide Icons                           |
| Backend    | Node.js (ESM), Express 4, Prisma 5                                                         |
| Database   | PostgreSQL (Neon serverless, pooled)                                                       |
| Auth       | JWT (access 15min / refresh 7d), bcrypt, OAuth (Google, Facebook, GitHub, LinkedIn, Apple) |
| Encryption | AES-256-GCM (PBKDF2 key derivation)                                                        |
| Automation | Playwright (Facebook posting, scraping, screenshots)                                       |
| Instagram  | Instagram Graph API (Feed, Story, Reel)                                                    |
| AI         | Google Gemini API (post generation)                                                        |
| Email      | Nodemailer + Gmail SMTP (verification, password reset, feedback)                           |
| CAPTCHA    | Cloudflare Turnstile                                                                       |
| Security   | Helmet, CORS, rate limiting (express-rate-limit), SSRF prevention                          |
| Media      | Sharp (image processing), Multer (uploads)                                                 |
| Tests      | Vitest, React Testing Library, supertest                                                   |

## תכונות

### ניהול קבוצות

- סנכרון קבוצות מפייסבוק (Playwright scraping)
- הוספה ידנית, חיפוש, סקרינשוטים של קבוצות
- מטאדאטא: מספר חברים, סוג פרטיות, רענון אוטומטי

### יצירת תוכן

- יצירת קמפיינים (טקסט, תמונות, מיקום, אנונימיות, וואטסאפ)
- יצירת פוסט עם AI (Google Gemini) — פרומפטים מותאמים
- תבניות פוסט — שמירה, עריכה, שימוש חוזר
- תצוגה מקדימה של Facebook ו-Instagram

### פרסום

- פרסום מיידי במקביל למספר קבוצות
- פרסום לפרופיל אישי בפייסבוק
- פרסום לאינסטגרם (Feed / Story / Reel)
- תזמון פרסומים (חד-פעמי / חוזר: יומי, שבועי, חודשי)
- ניסיונות חוזרים אוטומטיים (exponential backoff, עד 3 ניסיונות)

### אנליטיקס ודוחות

- דשבורד עם KPIs (פרסומים, הצלחות, חשיפות)
- מטריקות מעורבות (לייקים, תגובות, שיתופים, חשיפות)
- דוחות ביצועים עם גרפים (Recharts)
- Top posts — פוסטים בעלי הביצועים הטובים ביותר

### חשבון ואבטחה

- הרשמה עם אימות מייל + Turnstile CAPTCHA
- התחברות עם OAuth (Google, Facebook, GitHub, LinkedIn, Apple)
- שכחת סיסמה / איפוס סיסמה
- פרופיל: שם, אימייל, אווטאר, מגדר, טלפון
- ערכת נושא כהה/בהירה
- הגדרות התראות
- נגישות (גודל טקסט, ניגודיות)
- מנויים ותוכניות (Subscription)

## התקנה מהירה

```bash
git clone <repo-url>
cd possbo

# Server
cd server
npm install
cp .env.example .env       # הגדרת משתני סביבה
npx prisma generate
npx prisma db push

# Client
cd ../client
npm install

# הרצת שניהם (מתיקיית הבסיס)
cd ..
npm run dev                 # node scripts/dev.mjs
```

> **Server** → `https://localhost:5001` &nbsp;|&nbsp; **Client** → `http://localhost:3000`

## משתני סביבה

### Server (`server/.env`)

| Variable               | Description                           |
| ---------------------- | ------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string (pooled) |
| `DIRECT_URL`           | PostgreSQL connection string (direct) |
| `PORT`                 | Server port (default: `5001`)         |
| `JWT_SECRET`           | Access token signing secret           |
| `JWT_REFRESH_SECRET`   | Refresh token signing secret          |
| `ENCRYPTION_KEY`       | AES master key (≥32 characters)       |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret           |
| `SMTP_HOST`            | Email server (`smtp.gmail.com`)       |
| `SMTP_PORT`            | Email port (`587`)                    |
| `SMTP_USER`            | Gmail address                         |
| `SMTP_PASS`            | Gmail app password                    |
| `FACEBOOK_APP_ID`      | Facebook app credentials              |
| `FACEBOOK_APP_SECRET`  | Facebook app secret                   |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID                |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret                   |
| `GITHUB_CLIENT_ID`     | GitHub OAuth client ID                |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth secret                   |
| `INSTAGRAM_APP_ID`     | Instagram/Facebook app ID             |
| `INSTAGRAM_APP_SECRET` | Instagram/Facebook app secret         |
| `GEMINI_API_KEY`       | Google Gemini AI API key              |
| `CLIENT_URL`           | CORS origin (`http://localhost:3000`) |

### Client (`client/.env`)

| Variable                  | Description                                |
| ------------------------- | ------------------------------------------ |
| `VITE_API_URL`            | Backend URL (`https://localhost:5001/api`) |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare site key (empty = auto bypass)  |
| `VITE_FACEBOOK_APP_ID`    | Facebook app ID                            |

## סקריפטים

```bash
# Root
npm run dev              # Start client + server concurrently
npm run build            # Build client for production

# Server
cd server
npm run dev              # Start with --watch (port 5001)
npm start                # Production start
npm run prisma:generate  # Regenerate Prisma client
npm run prisma:migrate   # Create migration
npm run prisma:studio    # Visual DB browser

# Client
cd client
npm run dev              # Vite dev server (port 3000)
npm run build            # Production build
npm run preview          # Preview production build
```

## טסטים

```bash
# Server tests (Vitest + supertest)
cd server
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report

# Client tests (Vitest + React Testing Library)
cd client
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
```

| Suite             | Test Files | Stack                 |
| ----------------- | ---------- | --------------------- |
| Server routes     | 9 files    | supertest + Vitest    |
| Server utils      | 10 files   | Vitest                |
| Client pages      | 7 files    | React Testing Library |
| Client components | 3 files    | React Testing Library |
| Client services   | 7 files    | Vitest                |
| Client assets     | 1 file     | Vitest                |

## מבנה API

| Prefix              | Route File        | Endpoints | Description                                           |
| ------------------- | ----------------- | --------- | ----------------------------------------------------- |
| `/api/auth`         | `auth.js`         | 18        | Authentication, profile, password, avatar             |
| `/api/groups`       | `groups.js`       | 12        | Group search, sync, save, metadata                    |
| `/api/publish`      | `publish.js`      | 3         | Immediate publish (group + profile)                   |
| `/api/scheduler`    | `scheduler.js`    | 22        | Campaigns, scheduling, jobs, stats, metrics           |
| `/api/templates`    | `templates.js`    | 6         | Template CRUD                                         |
| `/api/screenshot`   | `screenshot.js`   | 1         | Facebook page screenshot                              |
| `/api/ai`           | `ai.js`           | 1         | AI post generation (Gemini)                           |
| `/api/oauth`        | `oauth.js`        | 5         | OAuth providers (Google, FB, GitHub, LinkedIn, Apple) |
| `/api/instagram`    | `instagram.js`    | 6         | Instagram connection + publishing                     |
| `/api/subscription` | `subscription.js` | 5         | Plans, billing, payments                              |
| `/api/feedback`     | `feedback.js`     | 1         | User feedback via email                               |

## תיעוד נוסף

| Document               | Path                                                                 | Content                                           |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| Architecture Deep Dive | [`.copilot/README.md`](.copilot/README.md)                           | Index of all architecture docs                    |
| Data Flow              | [`.copilot/data-flow.md`](.copilot/data-flow.md)                     | Auth, publish, scheduling, OAuth, Instagram flows |
| Security               | [`.copilot/security.md`](.copilot/security.md)                       | Encryption, auth, sessions, rate limiting, SSRF   |
| Database               | [`.copilot/database.md`](.copilot/database.md)                       | Schema, 26 models, ERD, conventions               |
| Publishing Pipeline    | [`.copilot/publishing-pipeline.md`](.copilot/publishing-pipeline.md) | Immediate, scheduled, Instagram, retry logic      |
| Agent Instructions     | [`.github/copilot-instructions.md`](.github/copilot-instructions.md) | Project conventions for AI agents                 |
| Client Guide           | [`client/README.md`](client/README.md)                               | Frontend architecture + patterns                  |
| Server Guide           | [`server/README.md`](server/README.md)                               | Backend architecture + API reference              |

## פקודות פיתוח

```bash
node scripts/dev.mjs              # Start dev (client:3000 + server:5001)

cd client && npm test             # Run client tests
cd client && npm run test:coverage # Client coverage report

cd server && npm test             # Run server tests
cd server && npm run test:coverage # Server coverage report

cd server && npx prisma studio    # Visual DB browser
cd server && npx prisma db pull   # Pull schema from live DB
cd server && npx prisma generate  # Regenerate Prisma client
```

## API Endpoints

### Auth (`/api/auth`)

| Method | Path                   | Description                                    |
| ------ | ---------------------- | ---------------------------------------------- |
| POST   | /register              | Register (email, password, name, captchaToken) |
| POST   | /login                 | Login, returns JWT access token                |
| POST   | /refresh               | Refresh access token via httpOnly cookie       |
| GET    | /me                    | Current user info + fbSessionValid             |
| POST   | /logout                | Clear refresh cookie                           |
| POST   | /forgot-password       | Send reset code via email                      |
| POST   | /reset-password        | Reset password with code                       |
| PUT    | /profile               | Update name/email                              |
| PUT    | /whatsapp              | Update WhatsApp number/message                 |
| POST   | /disconnect-facebook   | Remove FB session data                         |
| POST   | /request-password-code | Verify current password, send change code      |
| POST   | /change-password       | Change password with code                      |

### Groups (`/api/groups`)

| Method | Path               | Description                              |
| ------ | ------------------ | ---------------------------------------- |
| GET    | /saved             | Get user's saved groups                  |
| POST   | /save              | Save a group manually                    |
| DELETE | /:id               | Delete a group                           |
| POST   | /scrape-my-groups  | Sync groups from Facebook via Playwright |
| POST   | /bootstrap-session | Open browser for Facebook login          |

### Publish (`/api/publish`)

| Method | Path     | Description                             |
| ------ | -------- | --------------------------------------- |
| POST   | /        | Publish text/images to a Facebook group |
| GET    | /history | Get publish history                     |

### Scheduler (`/api/scheduler`)

| Method | Path                  | Description                  |
| ------ | --------------------- | ---------------------------- |
| POST   | /campaigns            | Create campaign              |
| GET    | /campaigns            | List user campaigns          |
| GET    | /campaigns/recent     | Drafts + history for restore |
| GET    | /campaigns/:id        | Get single campaign detail   |
| PUT    | /campaigns/:id        | Update campaign              |
| DELETE | /campaigns/:id        | Delete campaign              |
| POST   | /campaigns/:id/pause  | Pause a campaign             |
| POST   | /campaigns/:id/resume | Resume a campaign            |

## License

Private
