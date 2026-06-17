# PostIt - Social Media Post Sharing Platform

A full-stack application for sharing content from Facebook groups with friends.

## Project Structure

```
postit/
├── client/          # React frontend
│   ├── src/
│   │   ├── pages/   # Login, Dashboard pages
│   │   ├── services/# API integration
│   │   ├── styles/  # CSS styles
│   │   └── App.jsx
│   └── package.json
└── server/          # Node.js + Express backend
    ├── src/
    │   ├── routes/  # Auth and groups routes
    │   ├── config/  # Passport configuration
    │   └── index.js # Main server file
    ├── prisma/      # Database schema
    └── package.json
```

## Features

- ✅ Facebook OAuth authentication
- ✅ Search for Facebook groups
- ✅ Save found groups to database
- ✅ Screenshot functionality
- ✅ User profile management

## Setup Instructions

### 1. Facebook App Setup

1. Go to https://developers.facebook.com
2. Create a new app
3. Set up Facebook Login product
4. Add your redirect URI: `http://localhost:5000/api/auth/facebook/callback`
5. Copy your App ID and App Secret

### 2. Backend Setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env` with:

```
DATABASE_URL="file:./dev.db"
PORT=5000
SESSION_SECRET=your_secret_here
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
CLIENT_URL=http://localhost:3000
```

Initialize database:

```bash
npm run prisma:migrate
```

Start server:

```bash
npm run dev
```

### 3. Frontend Setup

```bash
cd client
npm install
npm run dev
```

Visit: http://localhost:3000

## API Endpoints

- `GET /api/auth/facebook` - Facebook login
- `GET /api/auth/facebook/callback` - Facebook callback
- `GET /api/auth/me` - Get current user
- `GET /api/auth/logout` - Logout
- `POST /api/groups/search` - Search for a group
- `GET /api/groups/my-groups` - Get user's groups
- `GET /api/groups/saved` - Get saved groups from DB
