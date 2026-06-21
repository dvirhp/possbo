# PostIt — Architecture Deep Dive

This folder contains detailed architecture documentation for AI agents and developers.

## Files

| File                                             | Topic                                             |
| ------------------------------------------------ | ------------------------------------------------- |
| [data-flow.md](data-flow.md)                     | Complete data flow: auth, publishing, scheduling  |
| [security.md](security.md)                       | Security architecture: encryption, auth, sessions |
| [database.md](database.md)                       | Database schema relationships and conventions     |
| [publishing-pipeline.md](publishing-pipeline.md) | Full publishing pipeline: immediate + scheduled   |

## Quick Reference

### Run Locally

```bash
cd server && npm install && npx prisma generate && npm run dev
cd client && npm install && npm run dev
```

### Run Tests

```bash
cd server && npm test
cd client && npm test
```

### Key Environment Variables

```
DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY,
FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, CLIENT_URL, PORT
```
