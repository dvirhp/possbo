# Database Architecture — Possbo

## Connection

- **Provider**: PostgreSQL (Neon serverless, pooled connection)
- **ORM**: Prisma 5
- **Schema**: `server/prisma/schema.prisma`
- **Migrations**: `server/prisma/migrations/`

## Conventions

| Convention    | Example                                     |
| ------------- | ------------------------------------------- |
| IDs           | UUID v4 (`@default(uuid())`)                |
| Timestamps    | `createdAt`, `updatedAt` on every model     |
| Column naming | `snake_case` in DB via `@map()`             |
| Model naming  | `PascalCase` in Prisma                      |
| Relations     | Explicit foreign keys with `@relation`      |
| Soft delete   | Not used — hard deletes                     |
| Indexes       | On foreign keys + frequently queried fields |

## Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                           USER DOMAIN                                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────┐     ┌───────────────────┐     ┌──────────────────┐    │
│  │   User   │────→│   UserSession     │     │ ConnectedAccount │    │
│  │          │     └───────────────────┘     │ (Google, FB,     │    │
│  │          │────→│ PasswordResetToken │     │  GitHub, IG,     │    │
│  │          │     └───────────────────┘     │  LinkedIn, Apple)│    │
│  │          │────→│ EmailVerifyToken   │     └──────────────────┘    │
│  └────┬─────┘     └───────────────────┘                              │
│       │                                                               │
├───────┼───────────────────────────────────────────────────────────────┤
│       │              CONTENT DOMAIN                                    │
├───────┼───────────────────────────────────────────────────────────────┤
│       │                                                               │
│       ├────→ Post ────→ PostMedia[] (IMAGE, VIDEO)                   │
│       │       │    ────→ PostVersion[] (history/versioning)           │
│       │       │                                                       │
│       │       └────→ PostGroup ────→ PostGroupSchedule               │
│       │                  │           (ONCE/DAILY/WEEKLY/MONTHLY)      │
│       │                  │                                            │
│       │                  └────→ PublicationJob[] (queue)              │
│       │                              │                                │
│       │                              └────→ PublicationHistory        │
│       │                                          │                    │
│       │                                          └── PublicationMetric│
│       │                                              (likes, comments,│
│       │                                               shares, reach,  │
│       │                                               impressions)    │
│       │                                                               │
│       ├────→ Group (via UserGroup join table)                         │
│       │       └────→ GroupSyncHistory[]                               │
│       │                                                               │
│       ├────→ PostTemplate[] (saved templates with usage counter)      │
│       │                                                               │
│       ├────→ Notification[]                                           │
│       │                                                               │
│       └────→ AuditLog[]                                               │
│                                                                       │
├───────────────────────────────────────────────────────────────────────┤
│                       ANALYTICS DOMAIN                                 │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  User ────→ DailyStats[] (aggregated daily metrics)                  │
│       ────→ DailyExposure[] (daily reach/impression tracking)        │
│                                                                       │
├───────────────────────────────────────────────────────────────────────┤
│                        BILLING DOMAIN                                  │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  User ────→ Subscription ────→ Plan                                  │
│       ────→ UsageLimit                                                │
│       ────→ Payment[]                                                 │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

## All Models (26 total)

### User Domain

#### User

```prisma
model User {
  id                    String     @id @default(uuid())
  email                 String     @unique
  passwordHash          String     @map("password_hash")
  name                  String?
  avatarUrl             String?    @map("avatar_url")
  gender                String?
  phone                 String?
  status                UserStatus @default(ACTIVE)
  emailVerified         Boolean    @default(false) @map("email_verified")
  facebookAppId         String?    @map("facebook_app_id")       // encrypted
  facebookAppSecret     String?    @map("facebook_app_secret")   // encrypted
  facebookStorageState  String?    @map("facebook_storage_state") // encrypted cookies
  whatsappNumber        String?    @map("whatsapp_number")
  whatsappMessage       String?    @map("whatsapp_message")
  notificationSettings  Json?      @map("notification_settings")
  createdAt             DateTime   @default(now()) @map("created_at")
  updatedAt             DateTime   @updatedAt @map("updated_at")
}
```

#### ConnectedAccount

```prisma
model ConnectedAccount {
  id              String   @id @default(uuid())
  userId          String   @map("user_id")
  provider        String   // google, facebook, github, linkedin, apple, instagram
  providerUserId  String   @map("provider_user_id")
  accessToken     String?  @map("access_token")
  refreshToken    String?  @map("refresh_token")
  tokenExpiresAt  DateTime? @map("token_expires_at")
  profile         Json?
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@unique([provider, providerUserId])
}
```

#### UserSession, PasswordResetToken, EmailVerificationToken

- Session tokens, reset codes, verification codes
- All linked to User via `userId`
- Tokens have expiration timestamps

### Content Domain

#### Post

```prisma
model Post {
  id          String     @id @default(uuid())
  userId      String     @map("user_id")
  title       String?
  content     String
  status      PostStatus @default(DRAFT)
  isAnonymous Boolean    @default(false) @map("is_anonymous")
  location    String?
  whatsapp    String?
  platform    String?    @default("facebook")  // facebook, instagram
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")
}
```

#### PostMedia

```prisma
model PostMedia {
  id        String    @id @default(uuid())
  postId    String    @map("post_id")
  url       String
  type      MediaType @default(IMAGE)
  order     Int       @default(0)
  createdAt DateTime  @default(now()) @map("created_at")
}
```

#### Group

```prisma
model Group {
  id          String  @id @default(uuid())
  externalId  String? @unique @map("external_id")  // Facebook group ID
  name        String
  url         String?
  image       String?
  memberCount Int?    @map("member_count")
  privacy     String? // PUBLIC, PRIVATE
}
```

#### UserGroup (join table)

```prisma
model UserGroup {
  id      String @id @default(uuid())
  userId  String @map("user_id")
  groupId String @map("group_id")

  @@unique([userId, groupId])
}
```

### Publishing Pipeline

#### PostGroup

```prisma
model PostGroup {
  id        String  @id @default(uuid())
  postId    String  @map("post_id")
  groupId   String  @map("group_id")
  userId    String  @map("user_id")
  isEnabled Boolean @default(true) @map("is_enabled")

  @@unique([postId, groupId])
}
```

#### PostGroupSchedule

```prisma
model PostGroupSchedule {
  id            String        @id @default(uuid())
  postGroupId   String        @map("post_group_id")
  frequencyType FrequencyType @default(ONCE)
  intervalValue Int?          @map("interval_value")
  intervalUnit  IntervalUnit? @map("interval_unit")
  startAt       DateTime      @map("start_at")
  nextRunAt     DateTime?     @map("next_run_at")
  isActive      Boolean       @default(true) @map("is_active")
}
```

#### PublicationJob

```prisma
model PublicationJob {
  id          String    @id @default(uuid())
  postGroupId String    @map("post_group_id")
  status      JobStatus @default(PENDING)
  scheduledAt DateTime  @map("scheduled_at")
  startedAt   DateTime? @map("started_at")
  completedAt DateTime? @map("completed_at")
  attempts    Int       @default(0)
  maxAttempts Int       @default(3) @map("max_attempts")
  lastError   String?   @map("last_error")
  lockedAt    DateTime? @map("locked_at")
  lockedBy    String?   @map("locked_by")
}
```

#### PublicationHistory

```prisma
model PublicationHistory {
  id               String            @id @default(uuid())
  postId           String            @map("post_id")
  groupId          String            @map("group_id")
  userId           String            @map("user_id")
  postGroupId      String?           @map("post_group_id")
  publicationJobId String?           @map("publication_job_id")
  publishedAt      DateTime          @map("published_at")
  status           PublicationStatus
  externalPostUrl  String?           @map("external_post_url")
  screenshotUrl    String?           @map("screenshot_url")
  errorMessage     String?           @map("error_message")
  platform         String?           @default("facebook")
}
```

#### PublicationMetric

```prisma
model PublicationMetric {
  id                String   @id @default(uuid())
  publicationId     String   @map("publication_id")
  likes             Int      @default(0)
  comments          Int      @default(0)
  shares            Int      @default(0)
  reach             Int      @default(0)
  impressions       Int      @default(0)
  collectedAt       DateTime @map("collected_at")
}
```

### Content Support

#### PostTemplate

```prisma
model PostTemplate {
  id          String   @id @default(uuid())
  userId      String   @map("user_id")
  name        String
  content     String
  isAnonymous Boolean  @default(false) @map("is_anonymous")
  location    String?
  whatsapp    String?
  usageCount  Int      @default(0) @map("usage_count")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
}
```

#### PostVersion

- Tracks post content changes over time
- Linked to Post via `postId`

### Analytics

#### DailyStats

- Aggregated daily publication counts per user
- Fields: date, totalPublished, successCount, failedCount

#### DailyExposure

- Daily reach and impression tracking per user
- Fields: date, reach, impressions

#### GroupSyncHistory

- Records group sync operations
- Fields: groupId, syncedAt, status, memberCount

### Billing

#### Subscription, Plan, UsageLimit, Payment

- `Plan` defines tier (free, basic, pro)
- `Subscription` links user to plan with status + expiration
- `UsageLimit` tracks per-tier rate limits
- `Payment` records transaction history

### Audit

#### AuditLog

- Action tracking per user
- Fields: userId, action, details, ipAddress, createdAt

#### Notification

```prisma
model Notification {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  type      String   // SESSION_EXPIRED, PUBLISH_SUCCESS, PUBLISH_FAILED, etc.
  title     String
  message   String?
  isRead    Boolean  @default(false) @map("is_read")
  metadata  Json?
  createdAt DateTime @default(now()) @map("created_at")
}
```

## Enums

```prisma
enum UserStatus        { ACTIVE, SUSPENDED, DELETED }
enum PostStatus        { DRAFT, ACTIVE, PAUSED, ARCHIVED }
enum MediaType         { IMAGE, VIDEO }
enum FrequencyType     { ONCE, DAILY, WEEKLY, MONTHLY, CUSTOM }
enum IntervalUnit      { MINUTES, HOURS, DAYS, WEEKS }
enum JobStatus         { PENDING, RUNNING, SUCCESS, FAILED, CANCELLED }
enum PublicationStatus { SUCCESS, FAILED }
```

## Key Queries

### Find pending jobs ready to process:

```javascript
prisma.publicationJob.findMany({
  where: {
    status: "PENDING",
    scheduledAt: { lte: new Date() },
  },
  include: {
    postGroup: {
      include: { post: true, group: true, user: true },
    },
  },
  orderBy: { scheduledAt: "asc" },
  take: 10,
});
```

### Optimistic lock a job:

```javascript
prisma.publicationJob.updateMany({
  where: { id: jobId, status: "PENDING", lockedAt: null },
  data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId },
});
// Returns { count: 0 } if already locked by another worker
```

### Get user's publication history:

```javascript
prisma.publicationHistory.findMany({
  where: { userId },
  include: { post: true, group: true, metrics: true },
  orderBy: { publishedAt: "desc" },
  take: 50,
});
```

### Get dashboard KPIs:

```javascript
// Aggregated stats from DailyStats + DailyExposure
prisma.dailyStats.findMany({
  where: { userId, date: { gte: startDate, lte: endDate } },
});

prisma.dailyExposure.findMany({
  where: { userId, date: { gte: startDate, lte: endDate } },
});
```

### Get publication metrics:

```javascript
prisma.publicationMetric.findMany({
  where: { publicationId },
  orderBy: { collectedAt: "desc" },
});
```

## Migration Commands

```bash
# Create new migration
npx prisma migrate dev --name <migration_name>

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (development only!)
npx prisma migrate reset

# Open Prisma Studio (GUI)
npx prisma studio

# Regenerate Prisma client
npx prisma generate
```
