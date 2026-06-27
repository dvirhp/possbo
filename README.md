# PostIt

פלטפורמה לפרסום אוטומטי בקבוצות פייסבוק. מאפשרת יצירת קמפיינים, תזמון פרסומים חוזרים, ניהול קבוצות וסנכרון ישירות מפייסבוק.

## ארכיטקטורה

```
post-it/
├── client/              # React 18 + Vite 5
│   ├── src/
│   │   ├── components/  # ConfirmDialog, Turnstile, FacebookPreview, OAuthButtons...
│   │   ├── context/     # DataProvider, ThemeProvider
│   │   ├── pages/       # Login, Register, Dashboard, CreatePost, Landing...
│   │   ├── services/    # api.js, groupsService.js, publishService.js, http.js
│   │   ├── styles/      # CSS per component
│   │   └── test/        # Vitest + React Testing Library
│   └── package.json
├── server/              # Node.js + Express (ES Modules)
│   ├── src/
│   │   ├── routes/      # auth, groups, publish, scheduler, screenshot, oauth
│   │   ├── utils/       # facebook-automation, encryption, jwt, mailer, turnstile
│   │   └── config/      # passport.js
│   ├── prisma/          # Schema + Migrations (PostgreSQL on Neon)
│   └── tests/           # Vitest + supertest
└── scripts/             # dev.mjs (concurrent client + server)
```

## טכנולוגיות

| Layer | Stack |
|-------|-------|
| Frontend | React 18, Vite 5, React Router v6, Axios |
| Backend | Node.js (ES Modules), Express, Prisma 5.22 |
| Database | PostgreSQL (Neon serverless) |
| Auth | JWT (access + refresh tokens), bcrypt, AES-256-GCM |
| Automation | Playwright (Facebook posting and scraping) |
| Email | Nodemailer + Gmail SMTP |
| CAPTCHA | Cloudflare Turnstile |
| Tests | Vitest, React Testing Library, supertest |

## תכונות

- יצירת קמפיינים (טקסט, תמונות, מיקום, אנונימיות, וואטסאפ)
- פרסום מיידי במקביל במספר קבוצות
- תזמון פרסומים (חד פעמי / חוזר עם ימים ושעות)
- סנכרון קבוצות מפייסבוק (Playwright)
- שמירת טיוטות ושחזור מהיסטוריה
- ניהול קבוצות (הוספה ידנית, חיפוש, סנכרון)
- הגדרות: פרופיל, סיסמה, וואטסאפ, חיבור פייסבוק, ערכת נושא
- Cloudflare Turnstile CAPTCHA
- Background publishing עם banner notification גלובלי
- Statistics dashboard

## התקנה מהירה

```bash
git clone <repo-url>
cd post-it

# Server
cd server
npm install
cp .env.example .env   # configure env vars
npx prisma generate
npx prisma db push

# Client
cd ../client
npm install

# Run both (from root post-it/)
node scripts/dev.mjs
```

## משתני סביבה

### Server (`server/.env`)

| Variable | Description |
|----------|-------------|
| DATABASE_URL | PostgreSQL connection (pooled) |
| DIRECT_URL | PostgreSQL connection (direct) |
| PORT | Server port (default: 5001) |
| JWT_SECRET | Access token signing secret |
| JWT_REFRESH_SECRET | Refresh token signing secret |
| ENCRYPTION_KEY | 64 hex chars for AES-256-GCM |
| TURNSTILE_SECRET_KEY | Cloudflare Turnstile secret |
| SMTP_HOST | Email server (smtp.gmail.com) |
| SMTP_PORT | Email port (587) |
| SMTP_USER | Gmail address |
| SMTP_PASS | Gmail app password |

### Client (`client/.env`)

| Variable | Description |
|----------|-------------|
| VITE_API_URL | Backend URL (http://localhost:5001/api) |
| VITE_TURNSTILE_SITE_KEY | Cloudflare site key (empty = auto bypass) |
| VITE_FACEBOOK_APP_ID | Facebook app ID |

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
| Method | Path | Description |
|--------|------|-------------|
| POST | /register | Register (email, password, name, captchaToken) |
| POST | /login | Login, returns JWT access token |
| POST | /refresh | Refresh access token via httpOnly cookie |
| GET | /me | Current user info + fbSessionValid |
| POST | /logout | Clear refresh cookie |
| POST | /forgot-password | Send reset code via email |
| POST | /reset-password | Reset password with code |
| PUT | /profile | Update name/email |
| PUT | /whatsapp | Update WhatsApp number/message |
| POST | /disconnect-facebook | Remove FB session data |
| POST | /request-password-code | Verify current password, send change code |
| POST | /change-password | Change password with code |

### Groups (`/api/groups`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /saved | Get user's saved groups |
| POST | /save | Save a group manually |
| DELETE | /:id | Delete a group |
| POST | /scrape-my-groups | Sync groups from Facebook via Playwright |
| POST | /bootstrap-session | Open browser for Facebook login |

### Publish (`/api/publish`)
| Method | Path | Description |
|--------|------|-------------|
| POST | / | Publish text/images to a Facebook group |
| GET | /history | Get publish history |

### Scheduler (`/api/scheduler`)
| Method | Path | Description |
|--------|------|-------------|
| POST | /campaigns | Create campaign |
| GET | /campaigns | List user campaigns |
| GET | /campaigns/recent | Drafts + history for restore |
| GET | /campaigns/:id | Get single campaign detail |
| PUT | /campaigns/:id | Update campaign |
| DELETE | /campaigns/:id | Delete campaign |
| POST | /campaigns/:id/pause | Pause a campaign |
| POST | /campaigns/:id/resume | Resume a campaign |

## License

Private
