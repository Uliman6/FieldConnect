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
- Admin account: `***REMOVED***` / `***REMOVED***`
- Setup endpoint: `/api/auth/setup` (one-time admin creation)

## Key Features Implemented
1. **Audio Recording** - MediaRecorder API for web (`VoiceRecorder.web.tsx`, `MasterVoiceCapture.web.tsx`)
2. **Transcription** - Backend service using OpenAI Whisper (`src/services/transcription.service.js`)
3. **Data Import** - `/api/import/json` endpoint for importing existing data

## Current Storage Architecture
- **Local State**: Zustand store with AsyncStorage persistence
- **Backend Sync**: DataProvider component hydrates from backend on startup
- **Offline Support**: IndexedDB queue for offline operations (web platform)
- **Project Persistence**: Current project saved to localStorage for web
- **Source of Truth**: Backend database (PostgreSQL) - history pages fetch directly from API

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

## Git Workflow

### Branch Strategy
```
main                    # Production-ready code, auto-deploys to Vercel/Render
├── feature/xyz         # New features (e.g., feature/punch-list)
├── fix/xyz             # Bug fixes (e.g., fix/date-navigation)
└── refactor/xyz        # Code refactoring (e.g., refactor/auth-flow)
```

### Development Process
1. **Create feature branch** from main:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-feature-name
   ```

2. **Develop and test locally**:
   - Frontend: `cd Frontend && npm run web`
   - Backend: `cd node-backend && npm run dev`

3. **Commit with clear messages**:
   ```bash
   git add .
   git commit -m "Add feature description

   - Detail 1
   - Detail 2

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
   ```

4. **Push and create PR**:
   ```bash
   git push -u origin feature/your-feature-name
   gh pr create --title "Feature: Your Feature" --body "Description..."
   ```

5. **Test on preview deployment** (Vercel creates preview for PRs)

6. **Merge to main** after testing:
   ```bash
   gh pr merge --squash
   ```

### Branch Naming Conventions
- `feature/` - New functionality (e.g., `feature/punch-list-photos`)
- `fix/` - Bug fixes (e.g., `fix/transcription-fallback`)
- `refactor/` - Code improvements (e.g., `refactor/api-error-handling`)
- `docs/` - Documentation updates
- `test/` - Test additions

### Before Merging Checklist
- [ ] Feature works locally (frontend + backend)
- [ ] No console errors
- [ ] Tested on Vercel preview (for frontend changes)
- [ ] Backend changes tested with local database
- [ ] Code is clean (no debug console.logs left)

## Next Priority
- Punch list feature with photo capability
- Full offline queue testing
