# Data Flow — Possbo

## 1. Authentication Flow

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant C as Client (React)
    participant S as Server (Express)
    participant DB as PostgreSQL

    U->>C: Submit email + password
    C->>S: POST /api/auth/login
    S->>DB: Find user by email
    S->>S: bcrypt.compare(password, hash)
    S->>S: Generate accessToken (15min)
    S->>S: Generate refreshToken (7d)
    S-->>C: { accessToken } + Set-Cookie: refreshToken
    C->>C: Store accessToken in memory
    C->>U: Redirect to /dashboard

    Note over C,S: On subsequent requests:
    C->>S: GET /api/... (Authorization: Bearer <token>)
    S->>S: Verify JWT → populate req.user

    Note over C,S: On token expiry (401):
    C->>S: POST /api/auth/refresh (Cookie: refreshToken)
    S->>S: Verify refresh token
    S-->>C: { new accessToken }
    C->>C: Retry original request
```

## 2. Registration + Email Verification Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL
    participant E as Email (SMTP)

    U->>C: Fill registration form
    C->>S: POST /api/auth/register (+ Turnstile token)
    S->>S: Verify Turnstile CAPTCHA
    S->>S: Hash password (bcrypt, 12 rounds)
    S->>DB: Create User (emailVerified: false)
    S->>DB: Create EmailVerificationToken (6-digit code, 10min expiry)
    S->>E: Send verification code email
    S-->>C: { accessToken } + Set-Cookie
    C->>U: Show OTP input form

    U->>C: Enter 6-digit code
    C->>S: POST /api/auth/verify-email { code }
    S->>DB: Find token, verify code + expiry
    S->>DB: Update user (emailVerified: true)
    S-->>C: { success: true }
    C->>U: Redirect to /dashboard
```

## 3. OAuth Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant P as OAuth Provider
    participant DB as PostgreSQL

    U->>C: Click OAuth button (Google/FB/GitHub/LinkedIn/Apple)

    alt Google (ID Token)
        C->>P: Google Sign-In popup → ID token
        C->>S: POST /api/oauth/google { credential }
        S->>P: Verify ID token (google-auth-library)
    else GitHub/LinkedIn/Apple (Code Flow)
        C->>P: Redirect to provider login
        P->>C: Redirect to /oauth/:provider/callback?code=...
        C->>S: POST /api/oauth/:provider { code }
        S->>P: Exchange code for access token
        S->>P: Fetch user profile
    else Facebook (Code Flow)
        C->>P: FB Login popup → code
        C->>S: POST /api/oauth/facebook { code }
        S->>P: Exchange code → access token → profile
    end

    S->>DB: Find ConnectedAccount by (provider, providerUserId)
    alt Existing account
        S->>DB: Update ConnectedAccount tokens
        S->>S: Generate JWT tokens for linked User
    else New user
        S->>DB: Create User + ConnectedAccount
        S->>S: Generate JWT tokens
    end
    S-->>C: { accessToken, user } + Set-Cookie
    C->>U: Redirect to /dashboard
```

## 4. Facebook Session Bootstrap

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant PW as Playwright Browser
    participant FB as Facebook

    U->>C: Click "Connect Facebook"
    C->>S: POST /api/groups/session/bootstrap
    S->>PW: Launch visible browser (headed mode)
    PW->>FB: Navigate to facebook.com/login
    U->>PW: Manually login to Facebook
    PW->>PW: Detect login success (c_user cookie)
    PW->>S: Return storage state (cookies)
    S->>S: encrypt(storageState)
    S->>DB: Save to user.facebookStorageState
    S-->>C: { success: true }
    C->>U: Redirect to dashboard
```

## 5. Immediate Publish Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant PW as Playwright
    participant FB as Facebook
    participant DB as PostgreSQL

    C->>S: POST /api/publish (groupUrl, text, image)
    S->>DB: Load user + decrypt storage state
    S->>PW: Launch headless browser with cookies
    PW->>FB: Navigate to group URL
    PW->>FB: Fill post form + submit
    PW->>PW: Wait for post confirmation
    PW->>PW: Take screenshot of published post
    PW-->>S: { postUrl, screenshot }
    S->>DB: Save Post + PostMedia + PublicationHistory
    S-->>C: { success, postUrl, screenshot }
```

## 6. Scheduled Publishing Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL
    participant SCH as Scheduler (Background)
    participant PW as Playwright

    Note over C,S: Step 1: User creates campaign
    C->>S: POST /api/scheduler/campaigns (multipart)
    S->>DB: Create Post + PostMedia[]
    S->>DB: Create PostGroup[] for each selected group
    S->>DB: Create PostGroupSchedule[] with frequency
    S->>DB: Create PublicationJob[] (PENDING)

    Note over SCH,DB: Step 2: Every 5min - generate jobs
    SCH->>DB: Find schedules where nextRunAt <= now
    SCH->>DB: Create PublicationJob for each
    SCH->>DB: Advance nextRunAt based on frequency

    Note over SCH,PW: Step 3: Every 60s - process jobs
    SCH->>DB: Find PENDING jobs where scheduledAt <= now
    SCH->>DB: Lock job (optimistic: set lockedAt)
    SCH->>PW: Publish via Playwright
    alt Success
        SCH->>DB: Mark SUCCESS + create PublicationHistory
    else Failure (attempts < 3)
        SCH->>DB: Back to PENDING + exponential backoff
    else Failure (max attempts)
        SCH->>DB: Mark FAILED + create Notification
    end
```

## 7. Instagram Publishing Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant IG as Instagram Graph API
    participant UH as Upload Host (freeimage/imgur)
    participant DB as PostgreSQL

    Note over C,S: Step 1: Connect Instagram
    C->>S: GET /api/instagram/auth-url
    S-->>C: { url: "https://facebook.com/dialog/oauth?..." }
    C->>C: Redirect to Instagram OAuth
    Note over C: User authorizes app
    C->>S: POST /api/instagram/connect { code }
    S->>IG: Exchange code for access token
    S->>IG: GET /me?fields=id,username
    S->>DB: Create ConnectedAccount (provider: "instagram")
    S-->>C: { success, username }

    Note over C,S: Step 2: Publish
    C->>S: POST /api/instagram/publish (image + caption + type)
    S->>UH: Upload image to public URL
    S->>IG: POST /{ig-user-id}/media (image_url, caption)
    IG-->>S: { id: container_id }
    S->>IG: POST /{ig-user-id}/media_publish (creation_id)
    IG-->>S: { id: media_id }
    S->>DB: Save PublicationHistory (platform: "instagram")
    S-->>C: { success, mediaId }
```

## 8. AI Post Generation Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant AI as Google Gemini API

    U->>C: Enter prompt + options on GeneratePost page
    C->>S: POST /api/ai/generate-post { prompt, options }
    S->>S: Build Gemini prompt with system instructions
    S->>AI: Generate content (Gemini API)
    AI-->>S: { generated text }
    S-->>C: { content: "generated post text" }
    C->>U: Display generated text in editor
    Note over U: User can edit, then create campaign
```

## 9. Session Keep-Alive Flow

```mermaid
sequenceDiagram
    participant SCH as Scheduler
    participant DB as PostgreSQL
    participant PW as Playwright
    participant FB as Facebook

    Note over SCH: Every 7.5 hours
    SCH->>DB: Find users with facebookStorageState != null
    loop For each user
        SCH->>DB: Decrypt storage state
        SCH->>PW: Launch headless with cookies
        PW->>FB: Navigate to facebook.com
        alt Cookies valid (c_user + xs present)
            PW-->>SCH: New cookies
            SCH->>DB: Encrypt + save updated state
        else Session expired
            SCH->>DB: Set facebookStorageState = null
            SCH->>DB: Create SESSION_EXPIRED notification
        end
    end
```

## 10. Metrics Collection Flow

```mermaid
sequenceDiagram
    participant SCH as Scheduler / API
    participant DB as PostgreSQL
    participant PW as Playwright
    participant FB as Facebook

    Note over SCH: Background job OR manual trigger
    SCH->>DB: Find recent publications with external URLs
    loop For each publication
        SCH->>PW: Launch headless browser
        PW->>FB: Navigate to external post URL
        PW->>PW: Scrape: likes, comments, shares, reach, impressions
        PW-->>SCH: { metrics }
        SCH->>DB: Upsert PublicationMetric
        SCH->>DB: Update DailyStats aggregates
        SCH->>DB: Update DailyExposure aggregates
    end
```

## 11. Multi-Group Publish (Client-Side Parallel)

```
User creates post → selects multiple groups → clicks "Publish"
  ↓
Client dispatches custom event: 'possbo-publish-start'
App.jsx shows global progress banner
  ↓
Client sends Promise.all([
  publishService.publish(group1Url, text, image, ...),
  publishService.publish(group2Url, text, image, ...),
  publishService.publish(group3Url, text, image, ...),
])
  ↓
Each request → Server → Playwright → Facebook
  ↓
Client dispatches: 'possbo-publish-done' with results
Results displayed per-group (success/failure)
Banner shows summary
```

## 12. Password Reset Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL
    participant E as Email

    U->>C: Click "Forgot Password"
    C->>S: POST /api/auth/forgot-password { email }
    S->>DB: Find user by email
    S->>DB: Create PasswordResetToken (6-digit code, 10min expiry)
    S->>E: Send reset code email
    S-->>C: { success: true }
    C->>U: Show code + new password form

    U->>C: Enter code + new password
    C->>S: POST /api/auth/reset-password { email, code, newPassword }
    S->>DB: Verify token + expiry
    S->>S: Hash new password (bcrypt)
    S->>DB: Update user passwordHash
    S->>DB: Delete used token
    S-->>C: { success: true }
    C->>U: Redirect to /login
```

## 13. Data Relationships

```
User
 ├── ConnectedAccount[] (Google, FB, GitHub, LinkedIn, Apple, Instagram)
 ├── Post[] (content, media, status, platform)
 │    ├── PostMedia[] (images/videos)
 │    ├── PostVersion[] (content history)
 │    └── PostGroup[] (post ↔ group link)
 │         ├── PostGroupSchedule (frequency, nextRunAt)
 │         └── PublicationJob[] (queue entries)
 │              └── PublicationHistory (results)
 │                   └── PublicationMetric (engagement data)
 ├── Group[] (via UserGroup join)
 │    └── GroupSyncHistory[]
 ├── PostTemplate[] (saved templates)
 ├── Notification[] (alerts)
 ├── Subscription → Plan
 ├── UsageLimit
 ├── Payment[]
 ├── DailyStats[] (aggregated metrics)
 ├── DailyExposure[] (reach/impressions)
 ├── AuditLog[]
 ├── UserSession[]
 ├── PasswordResetToken
 └── EmailVerificationToken
```
