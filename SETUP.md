# PostIt - Setup Guide

## Prerequisites
- Node.js 20+
- PostgreSQL (or update DATABASE_URL for your DB)
- Facebook Developer App (for OAuth login)

## Quick Start (new machine)

### 1. Install dependencies
```bash
cd server && npm install
cd ../client && npm install
```

### 2. Create environment file
Create `server/.env`:
```env
PORT=5001
CLIENT_URL=http://localhost:3000
SESSION_SECRET=any-random-secret-string
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
DATABASE_URL=postgresql://user:password@localhost:5432/postit
```

### 3. Setup database
```bash
cd server
npx prisma generate
npx prisma migrate dev
```

### 4. Bootstrap Facebook session
```bash
cd server
npx playwright install chromium
npm run bootstrap-session
```
A browser will open — log into Facebook manually. After login the session is saved locally.

### 5. Run the app
```bash
# Terminal 1 - Server
cd server && npm run dev

# Terminal 2 - Client
cd client && npm run dev
```
- Client: http://localhost:3000
- Server: http://localhost:5001

## Running Tests
```bash
cd server && npm test
cd client && npm test
```

## Notes
- `server/.facebook-storage-state.json` is machine-specific (cannot be copied between machines)
- `server/posts-history.json` is created automatically on first publish
- `server/uploads/` is created automatically when images are uploaded
