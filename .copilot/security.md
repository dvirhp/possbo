# Security Architecture — PostIt

## Threat Model

PostIt handles sensitive Facebook credentials and browser sessions. Key threats:

1. **Credential theft** — FB App ID/Secret stored per-user
2. **Session hijacking** — Playwright cookies grant full FB access
3. **Token theft** — JWT access/refresh tokens
4. **Injection** — XSS, SQL injection via user input

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

| Data                   | Location                    | Purpose                     |
| ---------------------- | --------------------------- | --------------------------- |
| Facebook App ID        | `user.facebookAppId`        | Per-user FB app credentials |
| Facebook App Secret    | `user.facebookAppSecret`    | Per-user FB app credentials |
| Facebook Storage State | `user.facebookStorageState` | Browser cookies (session)   |

### Key Security Properties:

- Each value has unique salt → same plaintext produces different ciphertext
- GCM auth tag → tampering detected on decryption
- Master key never stored in DB → env-only

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

## CORS Configuration

```javascript
app.use(
  cors({
    origin: process.env.CLIENT_URL, // Only allow known frontend origin
    credentials: true, // Allow cookies
  }),
);
```

## Input Validation

### Server-Side:

- Email format validation on register/login
- Password minimum length (6 chars)
- Required field checks before DB operations
- Prisma parameterized queries (SQL injection safe)

### Client-Side:

- Form validation before submission
- `required` HTML attributes
- Error messages in Hebrew for user guidance

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
