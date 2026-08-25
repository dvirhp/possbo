# Publishing Pipeline — Possbo

## Overview

Possbo supports two publishing modes:

1. **Immediate** — User publishes from the UI, one group at a time (server)
2. **Multi-group immediate** — User selects groups, client fires requests in parallel
3. **Scheduled** — Background scheduler processes jobs at configured times

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER ACTIONS                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌─────────────────────────────┐       │
│  │ Immediate Publish │    │ Schedule for Later           │       │
│  │ POST /api/publish │    │ POST /api/scheduler/schedule │       │
│  └────────┬─────────┘    └──────────────┬──────────────┘       │
│           │                              │                       │
│           ▼                              ▼                       │
│  ┌─────────────────┐    ┌─────────────────────────────┐       │
│  │ Playwright now   │    │ Create:                      │       │
│  │ → publish        │    │  - PostGroup                 │       │
│  │ → screenshot     │    │  - PostGroupSchedule         │       │
│  │ → return result  │    │  - PublicationJob (PENDING)  │       │
│  └────────┬─────────┘    └──────────────┬──────────────┘       │
│           │                              │                       │
│           ▼                              ▼                       │
│  ┌─────────────────┐    ┌─────────────────────────────┐       │
│  │ PublicationHistory│    │ Background Scheduler         │       │
│  │ (SUCCESS)        │    │ processes when time arrives   │       │
│  └─────────────────┘    └─────────────────────────────┘       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Mode 1: Immediate Single-Group Publish

**Endpoint**: `POST /api/publish`  
**Format**: multipart/form-data

```
Request:
  groupUrl: "https://facebook.com/groups/123"
  text: "Post content in Hebrew"
  image: <file> (optional)
  groupName: "Group Name"
  anonymous: "true"
  location: "Tel Aviv"

Response:
  { success: true, postUrl: "...", screenshot: "base64...", savedPost: {...} }
```

**Steps:**

1. Validate user has Facebook session
2. Load & decrypt storage state
3. Launch headless Playwright with cookies
4. Navigate to group → find post composer
5. Type text → attach image (if provided)
6. Set anonymous mode / location (if provided)
7. Click publish → wait for confirmation
8. Take screenshot of published post
9. Save Post + PostMedia + PublicationHistory to DB
10. Return result to client

## Mode 2: Multi-Group Immediate (Client-Side Parallel)

**No special endpoint** — client fires multiple `POST /api/publish` requests.

```javascript
// CreatePost.jsx
const promises = selectedGroups.map((group) => {
  return publishService.publish(
    groupUrl,
    text,
    image,
    group.name,
    isAnonymous,
    location,
  );
});
const results = await Promise.all(promises);
```

**Characteristics:**

- Each request spawns its own Playwright instance
- Server-side: sequential (one browser per request)
- Results displayed per-group in UI
- If one fails, others still succeed

## Mode 3: Scheduled Publishing

### Step 1: User Creates Schedule

```
POST /api/scheduler/schedule
{
  postId: "uuid",
  groupIds: ["uuid1", "uuid2"],
  scheduledAt: "2024-01-15T10:00:00Z",
  frequency: "DAILY",        // optional: ONCE, DAILY, WEEKLY, MONTHLY
  intervalValue: 1,          // optional: repeat every N units
  intervalUnit: "DAYS"       // optional: MINUTES, HOURS, DAYS, WEEKS
}
```

**Creates:**

- `PostGroup` for each groupId (upsert)
- `PostGroupSchedule` with frequency config
- `PublicationJob` (status: PENDING, scheduledAt: given time)

### Step 2: Generate Jobs from Schedules (Every 5 min)

```javascript
// publication-scheduler.js → generateScheduledJobs()

// Find active schedules where it's time to generate
const schedules = await prisma.postGroupSchedule.findMany({
  where: { isActive: true, nextRunAt: { lte: now } },
});

for (schedule of schedules) {
  // Create a new publication job
  await prisma.publicationJob.create({
    data: {
      postGroupId: schedule.postGroupId,
      scheduledAt: schedule.nextRunAt,
    },
  });

  // Advance nextRunAt based on frequency
  const nextRun = calculateNextRun(schedule);
  if (nextRun) {
    await prisma.postGroupSchedule.update({ data: { nextRunAt: nextRun } });
  } else {
    // ONCE frequency → deactivate
    await prisma.postGroupSchedule.update({ data: { isActive: false } });
  }
}
```

### Step 3: Process Jobs (Every 60 seconds)

```javascript
// publication-scheduler.js → processPublicationJobs()

// 1. Find pending jobs
const jobs = await prisma.publicationJob.findMany({
  where: { status: "PENDING", scheduledAt: { lte: now } },
  take: 10,
  orderBy: { scheduledAt: "asc" }
})

// 2. Lock each job (optimistic)
const locked = await prisma.publicationJob.updateMany({
  where: { id: job.id, status: "PENDING", lockedAt: null },
  data: { status: "RUNNING", lockedAt: now, lockedBy: workerId, attempts: { increment: 1 } }
})
if (locked.count === 0) continue  // Another worker got it

// 3. Publish via Playwright
const result = await publishToGroup(groupUrl, content, imagePath, { userId })

// 4. Record result
if (success) → mark SUCCESS + create PublicationHistory
if (failure) → retry or mark FAILED
```

## Retry Logic

### Configuration:

- Maximum attempts: **3**
- Backoff formula: `2^attempts × 5 minutes`
  - Attempt 1 failure → retry in 10 minutes
  - Attempt 2 failure → retry in 20 minutes
  - Attempt 3 failure → FAILED permanently

### Retry Flow:

```
Job fails (attempt 1 of 3)
  → status: PENDING
  → scheduledAt: now + 10 minutes
  → lastError: "error message"

Job fails (attempt 2 of 3)
  → status: PENDING
  → scheduledAt: now + 20 minutes

Job fails (attempt 3 of 3)
  → status: FAILED
  → completedAt: now
  → Notification created for user
```

### Non-Retryable Errors:

- `SESSION_EXPIRED` — immediately fails, notifies user
- `FACEBOOK_SESSION_REQUIRED` — same as above

## Frequency Types

| Type    | Behavior                                   |
| ------- | ------------------------------------------ |
| ONCE    | Publishes once, schedule deactivated after |
| DAILY   | nextRunAt += 1 day                         |
| WEEKLY  | nextRunAt += 7 days                        |
| MONTHLY | nextRunAt += 1 month (same day)            |
| CUSTOM  | nextRunAt += intervalValue × intervalUnit  |

### Custom Interval Examples:

- Every 2 hours: `{ intervalValue: 2, intervalUnit: "HOURS" }`
- Every 3 days: `{ intervalValue: 3, intervalUnit: "DAYS" }`
- Every 2 weeks: `{ intervalValue: 2, intervalUnit: "WEEKS" }`

## Job States

```
              ┌─────────────────────┐
              │      PENDING        │
              │  (waiting for time) │
              └──────────┬──────────┘
                         │ scheduledAt <= now
                         ▼
              ┌─────────────────────┐
              │      RUNNING        │
              │  (locked by worker) │
              └──────────┬──────────┘
                    ┌────┴────┐
                    ▼         ▼
         ┌──────────────┐  ┌──────────────┐
         │   SUCCESS    │  │   retry?     │
         │  (published) │  │              │
         └──────────────┘  └──────┬───────┘
                              ┌───┴───┐
                              ▼       ▼
                    ┌──────────┐ ┌──────────┐
                    │ PENDING  │ │  FAILED  │
                    │(+backoff)│ │(max tries)│
                    └──────────┘ └──────────┘

         ┌──────────────┐
         │  CANCELLED   │  ← User manually cancels
         │              │
         └──────────────┘
```

## Rate Limiting & Safety

1. **10-second delay** between publishes in the same batch
2. **Batch size**: 10 jobs max per processing cycle
3. **Optimistic locking**: prevents double-processing
4. **Worker ID**: UUID per process for lock ownership
5. **Lock timeout**: if a job is locked but never completes, it stays locked
   (future: implement stale lock detection)

## Monitoring

### Logs:

```
[scheduler] Starting background job scheduler...
[scheduler] Found 3 pending jobs
[scheduler] ✓ Published post abc123 to group xyz789
[scheduler] ✗ Failed job def456: SESSION_EXPIRED
[scheduler] Job def456 will retry at 2024-01-15T10:10:00Z
[scheduler] Batch done. Succeeded: 2, Failed: 1
```

### API Endpoints for Status:

- `GET /api/scheduler/jobs` — pending/running jobs
- `GET /api/scheduler/history` — completed publications
- `GET /api/scheduler/history/:pubId` — single publication detail
- `GET /api/scheduler/session-status` — FB session health
- `GET /api/scheduler/notifications` — failure notifications
- `GET /api/scheduler/stats` — aggregated publication stats
- `GET /api/scheduler/exposure` — reach/impression data
- `GET /api/scheduler/dashboard-data` — dashboard KPIs snapshot
- `GET /api/scheduler/dashboard-kpis` — detailed KPIs with date range
- `GET /api/scheduler/top-posts` — best performing posts

## Mode 4: Instagram Publishing

**Endpoint**: `POST /api/instagram/publish`

Instagram uses the **Graph API** (unlike Facebook which uses Playwright).

### Flow:

```
┌─────────────────────────────────────────────────────────┐
│ 1. User connects Instagram via OAuth                      │
│    GET /api/instagram/auth-url → redirect to FB/IG OAuth │
│    POST /api/instagram/connect → save access token        │
│                                                           │
│ 2. User publishes to Instagram                            │
│    POST /api/instagram/publish                            │
│    ┌────────────────────────────────────────┐             │
│    │ a. Upload media to public URL          │             │
│    │    (freeimage.host or imgur)            │             │
│    │ b. Create media container via Graph API│             │
│    │ c. Publish container via Graph API     │             │
│    │ d. Save PublicationHistory (platform:  │             │
│    │    "instagram")                         │             │
│    └────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

### Supported Types:

| Type      | Endpoint              | Requirements                       |
| --------- | --------------------- | ---------------------------------- |
| Feed Post | `/{ig-user-id}/media` | Image URL + caption                |
| Story     | `/{ig-user-id}/media` | Image URL, `media_type: "STORIES"` |
| Reel      | `/{ig-user-id}/media` | Video URL, `media_type: "REELS"`   |

### Media Upload (`utils/media-upload.js`):

Instagram Graph API requires publicly accessible media URLs. Possbo uploads local files to external hosts:

1. **freeimage.host** — primary (free image hosting)
2. **imgur** — fallback

## Mode 5: Profile Publishing

**Endpoint**: `POST /api/publish/profile`

Publishes to the user's own Facebook profile (not a group) using Playwright.

```
Request:
  text: "Post content"
  image: <file> (optional)

Flow:
  1. Validate user has Facebook session
  2. Load & decrypt storage state
  3. Launch headless Playwright
  4. Navigate to facebook.com → user's profile
  5. Create post on profile wall
  6. Save PublicationHistory (platform: "facebook")
```

## Metrics Collection

### Background Job: `metrics-collector.js`

Periodically scrapes engagement metrics from published posts using Playwright.

```
For each recent publication:
  1. Navigate to external post URL
  2. Scrape: likes, comments, shares, reach, impressions
  3. Save to PublicationMetric table
  4. Update DailyStats + DailyExposure aggregates
```

### Manual Refresh:

- `POST /api/scheduler/publications/:id/refresh-metrics` — single publication
- `POST /api/scheduler/refresh-all-metrics` — all user publications

### Metrics Model:

```prisma
model PublicationMetric {
  id             String   @id @default(uuid())
  publicationId  String   @map("publication_id")
  likes          Int      @default(0)
  comments       Int      @default(0)
  shares         Int      @default(0)
  reach          Int      @default(0)
  impressions    Int      @default(0)
  collectedAt    DateTime @map("collected_at")
}
```

## Campaign Management

Campaigns are the user-facing abstraction over the publishing pipeline.

### CRUD Endpoints:

| Method | Path                                         | Description                             |
| ------ | -------------------------------------------- | --------------------------------------- |
| POST   | `/api/scheduler/campaigns`                   | Create campaign (multipart with images) |
| GET    | `/api/scheduler/campaigns`                   | List all campaigns                      |
| GET    | `/api/scheduler/campaigns/recent`            | Drafts + recent for quick restore       |
| GET    | `/api/scheduler/campaigns/:postId`           | Single campaign detail                  |
| PUT    | `/api/scheduler/campaigns/:postId`           | Update campaign (multipart)             |
| DELETE | `/api/scheduler/campaigns/:postId`           | Delete campaign + related jobs          |
| POST   | `/api/scheduler/campaigns/:postId/duplicate` | Duplicate campaign                      |
| PATCH  | `/api/scheduler/campaigns/:postId/pause`     | Toggle pause state (ACTIVE ↔ PAUSED)    |

### Campaign Lifecycle:

```
DRAFT → ACTIVE (when scheduled) → PAUSED (user toggles) → ARCHIVED (all jobs done)
         │
         └→ Creates: PostGroup[] + PostGroupSchedule[] + PublicationJob[]
```
