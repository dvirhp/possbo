# Possbo — Architecture Deep Dive

This folder contains detailed architecture documentation for AI agents and developers.

## Files

| File                                             | Topic                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| [data-flow.md](data-flow.md)                     | Complete data flows: auth, publishing, scheduling, OAuth, Instagram, AI           |
| [security.md](security.md)                       | Security architecture: encryption, auth, sessions, rate limiting, SSRF prevention |
| [database.md](database.md)                       | Database schema: 26 models, ERD, relationships, conventions                       |
| [publishing-pipeline.md](publishing-pipeline.md) | Publishing pipeline: immediate, scheduled, Instagram, retry logic, metrics        |

## Related Documentation

| File                                                          | Location   | Purpose                                                             |
| ------------------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| [copilot-instructions.md](../.github/copilot-instructions.md) | `.github/` | Project conventions for AI agents (YAML frontmatter, applyTo: `**`) |
| [client/.agent.md](../client/.agent.md)                       | `client/`  | Frontend architecture reference (applyTo: `client/**`)              |
| [server/.agent.md](../server/.agent.md)                       | `server/`  | Backend architecture reference (applyTo: `server/**`)               |
| [client/README.md](../client/README.md)                       | `client/`  | Frontend developer guide                                            |
| [server/README.md](../server/README.md)                       | `server/`  | Backend developer guide + full API reference                        |

## Quick Reference

### Run Locally

```bash
# Both (from root)
npm run dev

# Server only
cd server && npm install && npx prisma generate && npm run dev

# Client only
cd client && npm install && npm run dev
```

### Run Tests

```bash
cd server && npm test          # 19 test files (Vitest + supertest)
cd client && npm test          # 20 test files (Vitest + React Testing Library)
```

### Key Environment Variables

```
DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY,
FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, CLIENT_URL, PORT,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID,
GITHUB_CLIENT_SECRET, INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET,
GEMINI_API_KEY, TURNSTILE_SECRET_KEY, SMTP_HOST, SMTP_USER, SMTP_PASS
```

### Project Stats

| Metric               | Count                                                 |
| -------------------- | ----------------------------------------------------- |
| API Endpoints        | ~80                                                   |
| Route Files          | 11                                                    |
| Utility Modules      | 14                                                    |
| Background Jobs      | 5                                                     |
| Database Models      | 26                                                    |
| Client Pages         | 19                                                    |
| Client Components    | 24                                                    |
| Client Services      | 8                                                     |
| Test Files           | 39 (server: 19, client: 20)                           |
| Auth Providers       | 6 (email + Google, Facebook, GitHub, LinkedIn, Apple) |
| Publishing Platforms | 2 (Facebook via Playwright, Instagram via Graph API)  |
