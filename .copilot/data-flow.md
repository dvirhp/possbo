# Data Flow — PostIt

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

## 2. Facebook Session Bootstrap

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

## 3. Immediate Publish Flow

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
    S->>DB: Save Post + PublicationHistory
    S-->>C: { success, postUrl, screenshot }
```

## 4. Scheduled Publishing Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL
    participant SCH as Scheduler (Background)
    participant PW as Playwright

    Note over C,S: Step 1: User schedules
    C->>S: POST /api/scheduler/schedule
    S->>DB: Create PostGroup + PostGroupSchedule + PublicationJob

    Note over SCH,DB: Step 2: Every 5min - generate jobs
    SCH->>DB: Find schedules where nextRunAt <= now
    SCH->>DB: Create PublicationJob for each
    SCH->>DB: Advance nextRunAt based on frequency

    Note over SCH,PW: Step 3: Every 60s - process jobs
    SCH->>DB: Find PENDING jobs where scheduledAt <= now
    SCH->>DB: Lock job (optimistic: set lockedAt)
    SCH->>PW: Publish via Playwright
    alt Success
        SCH->>DB: Mark SUCCESS + create history
    else Failure (attempts < 3)
        SCH->>DB: Back to PENDING + exponential backoff
    else Failure (max attempts)
        SCH->>DB: Mark FAILED + create notification
    end
```

## 5. Session Keep-Alive Flow

```mermaid
sequenceDiagram
    participant SCH as Scheduler
    participant DB as PostgreSQL
    participant PW as Playwright
    participant FB as Facebook

    Note over SCH: Every 3 days
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

## 6. Multi-Group Publish (Client-Side)

```
User creates post → selects multiple groups → clicks "Publish"
  ↓
Client sends Promise.all([
  publishService.publish(group1Url, text, image, ...),
  publishService.publish(group2Url, text, image, ...),
  publishService.publish(group3Url, text, image, ...),
])
  ↓
Each request → Server → Playwright → Facebook
  ↓
Results displayed per-group (success/failure)
```

## 7. Data Relationships

```
User
 ├── Post[] (content, media, status)
 │    ├── PostMedia[] (images/videos)
 │    └── PostGroup[] (post ↔ group link)
 │         ├── PostGroupSchedule (frequency, nextRunAt)
 │         └── PublicationJob[] (queue entries)
 │              └── PublicationHistory (results)
 ├── Group[] (via UserGroup join)
 ├── Notification[] (alerts)
 ├── ConnectedAccount[] (FB, Instagram)
 └── Subscription (plan, limits)
```
