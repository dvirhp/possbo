# Possbo Client

> React 18 + Vite 5 SPA frontend — Hebrew RTL interface for Facebook & Instagram management.

## Structure

```
src/
├── App.jsx                        # React Router config (22 routes)
├── App.css                        # Global RTL + base styles
├── main.jsx                       # React root render
├── assets/
│   └── i18n/
│       ├── he.js                  # Hebrew translation strings (entire UI)
│       └── index.js               # Re-export (locale = he)
├── components/                    # 24 reusable UI components
│   ├── AccessibilityWidget.jsx    # Font size, contrast, accessibility options
│   ├── AuthLayout.jsx             # Protected route wrapper (redirect to /login)
│   ├── BackButton.jsx             # Navigation back button
│   ├── BottomNav.jsx              # Mobile bottom navigation bar
│   ├── ChatBot.jsx                # AI chatbot widget (in-app)
│   ├── ConfirmDialog.jsx          # Reusable confirmation modal
│   ├── DashboardOverview.jsx      # Dashboard cards + stats grid
│   ├── EmojiPicker.jsx            # Emoji picker for post composition
│   ├── ErrorBoundary.jsx          # React error boundary (crash recovery)
│   ├── FacebookPreview.jsx        # Facebook post preview component
│   ├── GenericList.jsx            # Reusable list with search/filter/sort
│   ├── InstagramPreview.jsx       # Instagram post preview component
│   ├── LandingChatBot.jsx         # Chatbot on public landing page
│   ├── LocationAutocomplete.jsx   # OpenStreetMap location picker
│   ├── NotificationSettings.jsx   # Notification preferences form
│   ├── OAuthButtons.jsx           # OAuth login buttons (Google, FB, GitHub, etc.)
│   ├── OptimalTimesHint.jsx       # Best publish time recommendations
│   ├── OtpInput.jsx               # OTP input field for email verification
│   ├── PostsDataTable.jsx         # Publication history data table
│   ├── PullToRefresh.jsx          # Mobile pull-to-refresh gesture handler
│   ├── Sidebar.jsx                # Desktop navigation sidebar
│   ├── TopLoader.jsx              # NProgress top loading bar
│   └── Turnstile.jsx              # Cloudflare Turnstile CAPTCHA widget
├── context/                       # React context providers
│   ├── DataProvider.jsx           # Global state: user, groups, auth, notifications
│   ├── ThemeProvider.jsx          # Light/dark theme toggle + persistence
│   └── NavigationGuard.jsx        # Route protection + redirect logic
├── pages/                         # 19 route pages
│   ├── Landing.jsx                # Public homepage with features + CTAs
│   ├── Login.jsx                  # Email/password login + OAuth buttons
│   ├── Register.jsx               # Registration + email verification
│   ├── ForgotPassword.jsx         # Password reset flow
│   ├── Dashboard.jsx              # Main hub: stats, campaigns, groups tab
│   ├── CreatePost.jsx             # Multi-step campaign wizard with group selection
│   ├── GeneratePost.jsx           # AI-powered post generation (Gemini)
│   ├── MyGroups.jsx               # List/search saved Facebook groups
│   ├── GroupDetails.jsx           # Single group: screenshot, publish, history
│   ├── PostDetails.jsx            # Single post metrics and details
│   ├── ScheduledCalendar.jsx      # Calendar view of scheduled publications
│   ├── Templates.jsx              # List saved post templates
│   ├── TemplateForm.jsx           # Create/edit post template
│   ├── Reports.jsx                # Analytics dashboard with charts (Recharts)
│   ├── Subscription.jsx           # Billing and plan management
│   ├── Guides.jsx                 # User guides / help documentation
│   ├── Feedback.jsx               # User feedback form
│   ├── OAuthCallback.jsx          # OAuth provider callback handler
│   └── Privacy.jsx                # Privacy policy page
├── services/                      # 8 API service modules
│   ├── http.js                    # Axios instance + JWT interceptor + auto-refresh
│   ├── api.js                     # authAPI + groupsAPI (high-level wrappers)
│   ├── groupsService.js           # Groups, campaigns, scheduler, stats, metrics
│   ├── publishService.js          # Publish to groups/profile (FormData)
│   ├── templatesService.js        # Template CRUD + usage tracking
│   ├── screenshotService.js       # Facebook page screenshot capture
│   ├── oauthService.js            # OAuth login (Google, FB, GitHub, LinkedIn, Apple)
│   ├── aiService.js               # AI post generation (Gemini)
│   └── subscriptionService.js     # Plans, billing, payments
├── styles/                        # 32 CSS files (one per page/component)
│   ├── main.css                   # Global reset + utilities
│   ├── theme.css                  # CSS custom properties (light/dark)
│   ├── landing.css, auth.css, login.css, dashboard.css, ...
│   └── accessibility.css, sidebar.css, bottom-nav.css, ...
└── test/                          # 20 test files (Vitest + RTL)
    ├── setup.js                   # Test environment setup
    ├── App.test.jsx               # Main app routing tests
    ├── pages/                     # 7 page tests
    ├── components/                # 3 component tests
    ├── services/                  # 8 service tests (includes oauthService)
    └── assets/                    # 1 i18n test
```

## Routing

| Path                        | Page              | Auth      | Description                        |
| --------------------------- | ----------------- | --------- | ---------------------------------- |
| `/`                         | Landing           | Public    | Homepage with features + CTAs      |
| `/login`                    | Login             | Public    | Email/password + OAuth             |
| `/register`                 | Register          | Public    | Registration + email verification  |
| `/forgot-password`          | ForgotPassword    | Public    | Password reset flow                |
| `/privacy`                  | Privacy           | Public    | Privacy policy                     |
| `/oauth/:provider/callback` | OAuthCallback     | Public    | GitHub, LinkedIn, Apple, Instagram |
| `/dashboard`                | Dashboard         | Protected | Main hub: stats, campaigns, groups |
| `/create-post`              | CreatePost        | Protected | Campaign wizard                    |
| `/generate-post`            | GeneratePost      | Protected | AI post generation                 |
| `/scheduled`                | ScheduledCalendar | Protected | Calendar view                      |
| `/group/:id`                | GroupDetails      | Protected | Single group details               |
| `/post/:id`                 | PostDetails       | Protected | Single post metrics                |
| `/templates`                | Templates         | Protected | Template list                      |
| `/templates/new`            | TemplateForm      | Protected | Create template                    |
| `/templates/:id/edit`       | TemplateForm      | Protected | Edit template                      |
| `/reports`                  | Reports           | Protected | Analytics dashboard                |
| `/subscription`             | Subscription      | Protected | Billing                            |
| `/guides`                   | Guides            | Protected | Help documentation                 |
| `/feedback`                 | Feedback          | Protected | User feedback                      |

> **Note:** `/my-groups` redirects to `/dashboard?tab=groups`

## Scripts

```bash
npm run dev            # Start Vite dev server (port 3000)
npm run build          # Production build
npm run preview        # Preview production build
npm test               # Run tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
npm run lint           # ESLint (flat config, React + Hooks)
```

## Key Patterns

### State Management

- **DataProvider** — global context wrapping the app: user state, groups, auth check, notifications
- **ThemeProvider** — light/dark theme toggle, persisted in localStorage
- **NavigationGuard** — route protection, redirect unauthenticated users to `/login`

### HTTP Layer

- **http.js** — Axios instance with:
  - `setAccessToken()` / `getAccessToken()` / `clearAccessToken()` — token stored in JS variable (not localStorage)
  - Request interceptor: adds `Authorization: Bearer <token>` header
  - Response interceptor: on 401 → auto-refresh via `/api/auth/refresh` → retry original request
- Token stored in memory (XSS-safe), refresh token in httpOnly cookie

### Publishing

- **Background publishing** — `CreatePost` dispatches custom events (`possbo-publish-start`, `possbo-publish-done`) handled by global banner in `App.jsx`
- Multi-group publish: client fires parallel requests via `Promise.all()`

### UI

- **i18n** — static Hebrew strings in `assets/i18n/he.js`, imported as `t` object
- **RTL layout** — all CSS uses `direction: rtl`, text is Hebrew
- **Responsive** — mobile-first with `BottomNav` + `PullToRefresh`, desktop gets `Sidebar`
- **Accessibility** — `AccessibilityWidget` for font size / contrast adjustments
- **Code splitting** — protected pages use `React.lazy()` + `Suspense`

### Dependencies

| Package               | Purpose                 |
| --------------------- | ----------------------- |
| `react` + `react-dom` | UI framework            |
| `react-router-dom`    | Client-side routing     |
| `axios`               | HTTP client             |
| `recharts`            | Charts for Reports page |
| `lucide-react`        | Icon library            |
| `@emoji-mart/react`   | Emoji picker            |
| `canvas-confetti`     | Success animations      |
| `html2canvas`         | Screenshot capture      |
