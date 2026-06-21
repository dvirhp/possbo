# Database Architecture — PostIt

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
┌─────────────────────────────────────────────────────────────────────┐
│                            USER DOMAIN                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐     ┌───────────────┐     ┌──────────────────┐       │
│  │   User   │────→│ UserSession   │     │ ConnectedAccount │       │
│  │          │     └───────────────┘     └──────────────────┘       │
│  │          │────→│ PasswordReset │                                  │
│  │          │     └───────────────┘                                  │
│  │          │────→│ EmailVerify   │                                  │
│  └────┬─────┘     └───────────────┘                                  │
│       │                                                              │
├───────┼──────────────────────────────────────────────────────────────┤
│       │              CONTENT DOMAIN                                   │
├───────┼──────────────────────────────────────────────────────────────┤
│       │                                                              │
│       ├────→ Post ────→ PostMedia[]                                  │
│       │       │                                                      │
│       │       └────→ PostGroup ────→ PostGroupSchedule              │
│       │                  │                                           │
│       │                  └────→ PublicationJob[]                     │
│       │                              │                               │
│       │                              └────→ PublicationHistory       │
│       │                                          │                   │
│       │                                          └── PublicationMetric│
│       │                                                              │
│       ├────→ Group (via UserGroup)                                   │
│       │                                                              │
│       ├────→ PostTemplate[]                                          │
│       │                                                              │
│       └────→ Notification[]                                          │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                        BILLING DOMAIN                                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User ────→ Subscription ────→ Plan                                  │
│       ────→ UsageLimit                                               │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                        AUDIT DOMAIN                                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User ────→ AuditLog[]                                               │
│  Group ────→ GroupSyncHistory[]                                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Core Models

### User

```prisma
model User {
  id                    String    @id @default(uuid())
  email                 String    @unique
  passwordHash          String    @map("password_hash")
  name                  String?
  avatarUrl             String?   @map("avatar_url")
  status                UserStatus @default(ACTIVE)
  facebookAppId         String?   @map("facebook_app_id")      // encrypted
  facebookAppSecret     String?   @map("facebook_app_secret")  // encrypted
  facebookStorageState  String?   @map("facebook_storage_state") // encrypted cookies
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")
}
```

### Post

```prisma
model Post {
  id          String     @id @default(uuid())
  userId      String     @map("user_id")
  title       String?
  content     String
  status      PostStatus @default(DRAFT)
  isAnonymous Boolean    @default(false) @map("is_anonymous")
  location    String?
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")
}
```

### Group

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

### Publishing Pipeline Models

```prisma
// Links a Post to a Group for a specific user
model PostGroup {
  id        String  @id @default(uuid())
  postId    String  @map("post_id")
  groupId   String  @map("group_id")
  userId    String  @map("user_id")
  isEnabled Boolean @default(true) @map("is_enabled")

  @@unique([postId, groupId])  // One link per post-group pair
}

// Schedule configuration for recurring posts
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

// Queue entry for a publication attempt
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

// Record of a published post
model PublicationHistory {
  id               String   @id @default(uuid())
  postId           String   @map("post_id")
  groupId          String   @map("group_id")
  userId           String   @map("user_id")
  postGroupId      String?  @map("post_group_id")
  publicationJobId String?  @map("publication_job_id")
  publishedAt      DateTime @map("published_at")
  status           PublicationStatus
  externalPostUrl  String?  @map("external_post_url")
  screenshotUrl    String?  @map("screenshot_url")
  errorMessage     String?  @map("error_message")
}
```

## Enums

```prisma
enum UserStatus     { ACTIVE, SUSPENDED, DELETED }
enum PostStatus     { DRAFT, ACTIVE, ARCHIVED }
enum MediaType      { IMAGE, VIDEO }
enum FrequencyType  { ONCE, DAILY, WEEKLY, MONTHLY, CUSTOM }
enum IntervalUnit   { MINUTES, HOURS, DAYS, WEEKS }
enum JobStatus      { PENDING, RUNNING, SUCCESS, FAILED, CANCELLED }
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
  include: { post: true, group: true },
  orderBy: { publishedAt: "desc" },
  take: 50,
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
```
