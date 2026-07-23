# Security Architecture — Possbo

## Threat Model

Possbo handles sensitive Facebook credentials, Instagram tokens, and browser sessions. Key threats:

1. **Credential theft** — FB App ID/Secret stored per-user, Instagram access tokens
2. **Session hijacking** — Playwright cookies grant full FB access
3. **Token theft** — JWT access/refresh tokens, OAuth tokens
4. **Injection** — XSS, SQL injection via user input
5. **SSRF** — Server-side request forgery via URL inputs (group URLs, screenshots)
6. **Brute force** — Login, registration, password reset endpoints
7. **CSRF** — Cross-site request forgery on state-changing endpoints

## Encryption at Rest

### Algorithm: AES-256-GCM

- Authenticated encryption (confidentiality + integrity)
- Unique random salt per encrypted value (32 bytes)
- Key derivation: PBKDF2-SHA512, 100,000 iterations
- Master key: `ENCRYPTION_KEY` env var (≥32 characters)

### Storage Format

```
salt:iv:authTag:ciphertext
(all hex-encoded, colon-separated)
```

### What's Encrypted:

| Data                   | Location                    | Purpose                              |
| ---------------------- | --------------------------- | ------------------------------------ |
| Facebook App ID        | `user.facebookAppId`        | Per-user FB app credentials          |
| Facebook App Secret    | `user.facebookAppSecret`    | Per-user FB app credentials          |
| Facebook Storage State | `user.facebookStorageState` | Browser cookies (Playwright session) |

### Key Security Properties:

- Each value has unique salt → same plaintext produces different ciphertext
- GCM auth tag → tampering detected on decryption
- Master key never stored in DB → env-only
- PBKDF2 with 100k iterations → resistant to brute-force key derivation

## Authentication

### Password Storage

- Algorithm: bcrypt
- Rounds: 12 (adaptive, ~250ms on modern hardware)
- Salt: automatically generated per-hash by bcrypt

### JWT Tokens

| Token   | Lifetime | Storage                     | Purpose              |
| ------- | -------- | --------------------------- | -------------------- |
| Access  | 15 min   | Client memory (JS variable) | API authorization    |
| Refresh | 7 days   | httpOnly cookie             | Refresh access token |

### Cookie Security:

```javascript
{
  httpOnly: true,      // Not accessible via JS (XSS safe)
  secure: true,        // HTTPS only in production
  sameSite: "lax",     // CSRF protection
  path: "/api/auth",   // Only sent to auth endpoints
  maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
}
```

### Why Memory Token Storage?

- Access token in memory → survives page navigation via refresh flow
- NOT in localStorage → immune to XSS token theft
- Refresh in httpOnly cookie → immune to JS access
- Short access lifetime → limits damage window if intercepted

### OAuth Security

- OAuth tokens validated server-side with each provider's SDK
- Google: verified via `google-auth-library` (verifyIdToken)
- Facebook: validated via Graph API `/me` endpoint
- GitHub: exchanged via OAuth2 code flow → API call
- LinkedIn / Apple: code exchange + profile fetch
- `ConnectedAccount` stores provider tokens linked to user

## CORS Configuration

```javascript
app.use(
  cors({
    origin: process.env.CLIENT_URL, // Only allow known frontend origin
    credentials: true, // Allow cookies
  }),
);
```

- Only the configured `CLIENT_URL` can make requests
- Credentials enabled for httpOnly cookie transport

## Security Headers (Helmet)

```javascript
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled for SPA flexibility
    crossOriginEmbedderPolicy: false, // Allow cross-origin resources
    crossOriginResourcePolicy: false, // Allow uploads from different port
  }),
);
```

Helmet enables by default: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Strict-Transport-Security, and other security headers.

## Rate Limiting

| Limiter          | Limit        | Window | Applied To                      | Purpose                     |
| ---------------- | ------------ | ------ | ------------------------------- | --------------------------- |
| `generalLimiter` | 300 requests | 15 min | All `/api/` routes              | General abuse prevention    |
| `authLimiter`    | 10 requests  | 15 min | Login, register, password reset | Brute-force protection      |
| `refreshLimiter` | 30 requests  | 15 min | Token refresh endpoint          | Refresh abuse prevention    |
| `publishLimiter` | 30 requests  | 1 hour | Publishing endpoints            | Publishing abuse prevention |

Implementation: `express-rate-limit` with in-memory store. Key by IP address.

## CAPTCHA Protection

- **Cloudflare Turnstile** on registration endpoint
- Server-side validation via Turnstile API (`utils/turnstile.js`)
- Prevents automated account creation
- Site key configured via `VITE_TURNSTILE_SITE_KEY` (client) and `TURNSTILE_SECRET_KEY` (server)

## SSRF Prevention

```javascript
// utils/security.js
function isValidUrl(url) {
  // Validates URL format
  // Blocks private/internal IP ranges (127.x, 10.x, 192.168.x, etc.)
  // Blocks localhost, metadata endpoints
  // Only allows http/https schemes
}
```

Applied to:

- Facebook group URLs before Playwright navigation
- Screenshot capture URLs
- Any user-provided URLs

## Input Validation

### Server-Side (`utils/validators.js` + `utils/security.js`):

| Validation        | Function                     | Description                          |
| ----------------- | ---------------------------- | ------------------------------------ |
| UUID format       | `isValidUUID(id)`            | Validates UUID v4 format             |
| Email format      | `isValidEmail(email)`        | RFC-compliant email validation       |
| Password strength | `isValidPassword(pw)`        | Minimum length (6 chars)             |
| Date format       | `isValidDate(date)`          | ISO 8601 date validation             |
| Text length       | `sanitizeText(text, maxLen)` | Truncate to max length               |
| File type         | `fileFilter(file)`           | Whitelist: JPEG, PNG, GIF, WebP, MP4 |
| File size         | Multer config                | Max file size limits                 |
| URL safety        | `isValidUrl(url)`            | SSRF prevention (see above)          |

### ORM-Level (Prisma):

- All queries use parameterized inputs → SQL injection safe
- Schema-level constraints (unique, required, enums)
- Relation validation on foreign keys

### Client-Side:

- Form validation before submission
- `required` HTML attributes
- Error messages in Hebrew for user guidance
- File type/size validation before upload

## Email Verification Flow

1. User registers → server generates 6-digit code
2. Code stored in `EmailVerificationToken` (hashed, expires in 10 minutes)
3. Code sent via Nodemailer to user's email
4. User submits code → server verifies → marks account as verified
5. Maximum 3 resend attempts per session

## Password Reset Flow

1. User submits email → server generates reset code
2. Code stored in `PasswordResetToken` (hashed, expires in 10 minutes)
3. Code sent via email
4. User submits code + new password → server verifies → updates password hash

## File Upload Security

- **Multer** handles multipart uploads
- File type whitelist: images (JPEG, PNG, GIF, WebP) and video (MP4)
- File size limits enforced
- Files stored in `server/uploads/` directory
- Cross-Origin-Resource-Policy header set for `/uploads` static serving

## Session Management

### Facebook Browser Session:

- Playwright cookies stored encrypted in DB
- Validated every 7.5 hours by background job
- Expired sessions are nullified + user notified
- Sessions can be manually disconnected by user

### User Auth Session:

- Access token: short-lived (15min), stored in memory
- Refresh token: 7-day rotation in httpOnly cookie
- Logout clears refresh cookie server-side

## Facebook Session Security

### Session Isolation:

- Each user has their own encrypted storage state
- Storage state decrypted only when needed for automation
- Playwright runs in isolated browser context per operation

### Session Expiry Handling:

1. Keep-alive job validates cookies every 3 days
2. If expired → `facebookStorageState` set to null
3. User notified via in-app notification
4. Must re-authenticate via visible browser

### Automation Safeguards:

- Headless browser for automation (no visible window)
- Headed browser only for initial login (user in control)
- 10-second delay between multi-group publishes (rate limiting)
- Max 3 retry attempts per failed publication

## Rate Limiting & Abuse Prevention

### Publishing:

- 10-second delay between consecutive group publishes
- Maximum 3 retry attempts per job
- Exponential backoff: 10min → 20min → 40min
- Jobs processed in batches of 10

### API:

- Auth endpoints have standard rate limiting via CORS + short token life
- Failed login returns generic error (no user enumeration)

## Secrets Management

### Required Environment Variables:

```
DATABASE_URL          — PostgreSQL connection (with SSL)
JWT_SECRET            — Access token HMAC key
JWT_REFRESH_SECRET    — Refresh token HMAC key (different from access)
ENCRYPTION_KEY        — AES master key (≥32 chars, high entropy)
FACEBOOK_APP_ID       — Default FB app (optional)
FACEBOOK_APP_SECRET   — Default FB secret (optional)
```

### Rules:

- Never commit `.env` to git (`.gitignore` covers it)
- Production keys rotated regularly
- Different keys per environment (dev/staging/prod)
- `ENCRYPTION_KEY` change requires re-encrypting all stored data

## Security Checklist

- [x] Passwords hashed with bcrypt (12 rounds)
- [x] Sensitive data encrypted at rest (AES-256-GCM)
- [x] JWT in httpOnly cookie (refresh) + memory (access)
- [x] CORS restricted to specific origin
- [x] Parameterized queries via Prisma ORM
- [x] No secrets in client-side code
- [x] Facebook cookies encrypted before DB storage
- [x] Session expiry detection + user notification
- [x] Rate limiting on publishing operations
- [x] Input validation on all endpoints
