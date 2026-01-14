# FieldConnect Project Context

## Overview
FieldConnect (formerly SiteSpeak) is a construction daily log application for field workers to record voice notes, events, and generate PDF reports.

## Architecture

### Frontend (Expo/React Native Web)
- **Location**: `Frontend/`
- **Deployed on**: Vercel at https://field-connect-xi.vercel.app
- **Stack**: Expo SDK 53, React Native, NativeWind/Tailwind, Zustand for state
- **Build**: `npx expo export --platform web`
- **Install command**: `npm install --legacy-peer-deps` (required due to peer dep conflicts)

### Backend (Node.js/Express)
- **Location**: `node-backend/`
- **Deployed on**: Render (free tier) at https://sitespeak-api.onrender.com
- **Stack**: Express, Prisma ORM, JWT authentication
- **Database**: PostgreSQL on Railway

### Key Configuration Files
- `Frontend/vercel.json` - Vercel build config with legacy-peer-deps
- `Frontend/.env.production` - Contains `EXPO_PUBLIC_API_URL` pointing to Render backend
- `node-backend/Dockerfile` - Multi-stage build using node:20-slim (not Alpine, due to OpenSSL compatibility)
- `node-backend/prisma/schema.prisma` - Database schema with `debian-openssl-3.0.x` binary target

## Deployment Connections

### GitHub Repository
- URL: https://github.com/Uliman6/FieldConnect.git
- Both Vercel and Render auto-deploy from the `main` branch

### Vercel (Frontend)
- Connected to GitHub repo
- Auto-deploys on push to main
- Environment variables set in Vercel dashboard

### Render (Backend)
- Connected to GitHub repo
- Root directory: `node-backend`
- Environment variables configured:
  - `DATABASE_URL` - Railway PostgreSQL connection string
  - `JWT_SECRET` - For authentication
  - `OPENAI_API_KEY` - For Whisper transcription
  - `CORS_ORIGIN` - https://field-connect-xi.vercel.app

### Railway (Database)
- PostgreSQL database
- Connection string used by Render backend

## Authentication
- JWT-based authentication
- Admin account: `admin@fieldconnect.com` / `ulibaba1`
- Setup endpoint: `/api/auth/setup` (one-time admin creation)

## Key Features Implemented
1. **Audio Recording** - MediaRecorder API for web (`VoiceRecorder.web.tsx`, `MasterVoiceCapture.web.tsx`)
2. **Transcription** - Backend service using OpenAI Whisper (`src/services/transcription.service.js`)
3. **Data Import** - `/api/import/json` endpoint for importing existing data

## Current Storage Architecture (NEEDS IMPROVEMENT)
- Data is stored locally using Zustand + localStorage
- **Problem**: Data clears on browser refresh
- **Next Priority**: Implement cloud storage to sync with backend database

## Important Technical Decisions
1. **Dockerfile uses Debian-slim** (not Alpine) due to Prisma OpenSSL compatibility issues
2. **Database migrations run on container startup** via `npx prisma db push --skip-generate` in CMD
3. **Frontend uses --legacy-peer-deps** due to npm peer dependency conflicts

## File Structure
```
Backend/
├── Frontend/           # Expo web frontend
│   ├── src/
│   │   ├── app/       # Expo Router routes
│   │   ├── components/# UI components (including .web.tsx variants)
│   │   └── lib/       # Utilities, stores, transcription service
│   ├── vercel.json
│   └── .env.production
├── node-backend/       # Express backend
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/  # Including transcription.service.js
│   │   └── middleware/
│   ├── prisma/
│   │   └── schema.prisma
│   └── Dockerfile
└── CLAUDE.md          # This file
```

## Common Issues & Solutions
- **401 on transcription**: Auth token must be included in requests (fixed in transcription.ts)
- **Prisma OpenSSL errors**: Use debian-openssl-3.0.x binary target + node:20-slim Docker image
- **npm peer conflicts**: Use --legacy-peer-deps flag
- **Database tables not created**: Ensure `prisma db push` runs on container startup

## Next Session Priority
Implement cloud storage to replace local storage - data should persist in backend database and sync across devices/sessions.
