# PostIt Client

React 18 + Vite 5 SPA frontend.

## Structure

```
src/
├── components/       # Reusable UI components
│   ├── BackButton.jsx
│   ├── BottomNav.jsx
│   ├── ConfirmDialog.jsx
│   ├── FacebookPreview.jsx
│   ├── GenericList.jsx
│   ├── LocationAutocomplete.jsx
│   ├── OAuthButtons.jsx
│   ├── TopLoader.jsx
│   └── Turnstile.jsx
├── context/          # React context providers
│   └── DataProvider.jsx
├── pages/            # Route pages
│   ├── CreatePost.jsx     # Campaign wizard (3 steps)
│   ├── Dashboard.jsx      # Main dashboard with stats, campaigns, history
│   ├── ForgotPassword.jsx
│   ├── GroupDetails.jsx
│   ├── Landing.jsx
│   ├── Login.jsx
│   ├── MyGroups.jsx
│   ├── OAuthCallback.jsx
│   ├── PostDetails.jsx
│   ├── Privacy.jsx
│   ├── Register.jsx
│   └── ScheduledCalendar.jsx
├── services/         # API communication
│   ├── api.js             # Auth API methods
│   ├── groupsService.js   # Groups CRUD + sync
│   ├── http.js            # Axios instance + interceptors
│   ├── publishService.js  # Publish to groups
│   └── screenshotService.js
├── styles/           # CSS modules (one per page/component)
├── assets/i18n/      # Hebrew translations
└── test/             # Vitest + RTL tests
```

## Scripts

```bash
npm run dev          # Start Vite dev server (port 3000)
npm run build        # Production build
npm run preview      # Preview production build
npm test             # Run tests (watch mode)
npm run test:coverage # Coverage report (threshold: 40%)
```

## Key Patterns

- **DataProvider**: Wraps the app with user state, groups, auth checking
- **http.js**: Axios instance with JWT interceptor (auto-refresh on 401)
- **Background publishing**: CreatePost dispatches custom events (`postit-publish-start`, `postit-publish-done`) handled by global banner in App.jsx
- **i18n**: Static Hebrew strings in `assets/i18n/he.js`
- **RTL layout**: All UI is right-to-left Hebrew
