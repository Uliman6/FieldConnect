# FieldConnect

A full-stack construction daily log platform with voice-powered documentation, AI transcription, and intelligent insights.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-20232A?style=flat&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)

## Overview

FieldConnect enables construction field workers to document their work using voice recordings. The platform automatically transcribes audio, extracts structured data, categorizes observations, and generates professional PDF reports.

### Key Features

- **Voice-First Documentation** - Record observations hands-free on job sites
- **AI Transcription** - Automatic speech-to-text using OpenAI Whisper
- **Smart Categorization** - AI-powered classification of events (safety, delays, quality, materials)
- **Daily Log Generation** - Structured daily reports with tasks, visitors, equipment, and weather
- **PDF Export** - Professional report generation for stakeholders
- **Offline Support** - Works in low-connectivity environments with automatic sync
- **Multi-Platform** - Web, iOS, and Android from a single codebase

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  FieldConnect   │   Voice Diary   │     Maintenance Forms       │
│  (Expo/RN Web)  │   (React/Vite)  │       (React/Vite)          │
└────────┬────────┴────────┬────────┴──────────────┬──────────────┘
         │                 │                        │
         └─────────────────┼────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NODE.JS BACKEND (Express)                     │
│  • Authentication (JWT)    • Voice Processing                    │
│  • Daily Logs CRUD         • PDF Generation                      │
│  • Event Management        • File Uploads (Cloudinary)           │
└────────────────────────────────┬────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────┐
│   PostgreSQL    │   │  OpenAI API     │   │  Intelligence       │
│   (Railway)     │   │  (Whisper)      │   │  (Python/FastAPI)   │
└─────────────────┘   └─────────────────┘   └─────────────────────┘
```

## Project Structure

```
├── Frontend/              # Main mobile/web app (Expo SDK 53)
│   ├── src/app/          # File-based routing (Expo Router)
│   ├── src/components/   # Reusable UI components
│   └── src/lib/          # Utilities, stores, API clients
│
├── voice-diary/          # Simplified voice note app (Vite/React)
│   └── src/              # Pages, components, state management
│
├── maintenance-forms/    # Equipment maintenance forms (Vite/React)
│   └── src/              # Form pages and templates
│
├── node-backend/         # Express API server
│   ├── src/controllers/  # Route handlers
│   ├── src/services/     # Business logic (transcription, PDF)
│   ├── src/routes/       # API route definitions
│   └── prisma/           # Database schema and migrations
│
└── intelligence/         # Python analytics service (FastAPI)
    ├── api/              # REST endpoints
    ├── extraction/       # Data extraction pipelines
    └── similarity/       # Pattern matching algorithms
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Mobile/Web** | Expo SDK 53, React Native | Cross-platform UI |
| **Styling** | NativeWind, Tailwind CSS | Utility-first styling |
| **State** | Zustand, React Query | Client state management |
| **Backend** | Node.js, Express | REST API server |
| **ORM** | Prisma | Type-safe database access |
| **Database** | PostgreSQL | Primary data store |
| **Auth** | JWT, bcrypt | Authentication |
| **AI** | OpenAI Whisper | Speech-to-text |
| **Analytics** | Python, FastAPI, Pandas | Data analysis |
| **Storage** | Cloudinary | Media file storage |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- OpenAI API key

### Installation

```bash
# Clone the repository
git clone https://github.com/Uliman6/FieldConnect.git
cd FieldConnect/Backend

# Install all dependencies
npm run install:all

# Set up environment variables
cp node-backend/.env.example node-backend/.env
# Edit .env with your database URL and API keys

# Initialize database
npm run db:setup

# Start development servers
npm run dev
```

### Environment Variables

```env
# node-backend/.env
DATABASE_URL=postgresql://user:password@localhost:5432/fieldconnect
JWT_SECRET=your-secret-key
OPENAI_API_KEY=your-openai-key
CLOUDINARY_URL=cloudinary://...
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | User authentication |
| `GET` | `/api/projects` | List user projects |
| `POST` | `/api/daily-logs` | Create daily log |
| `POST` | `/api/events` | Log an event/observation |
| `POST` | `/api/transcription/transcribe` | Transcribe audio file |
| `POST` | `/api/voice-diary/process` | Process voice note |
| `GET` | `/api/reports/:id/pdf` | Generate PDF report |

## Deployment

### Frontend (Vercel)
- Auto-deploys from `main` branch
- Build command: `npx expo export --platform web`

### Backend (Render)
- Docker-based deployment
- Root directory: `node-backend`

### Database (Railway)
- Managed PostgreSQL instance

## Development

```bash
# Run backend only
npm run dev:backend

# Run frontend only
npm run dev:frontend

# Run database migrations
npm run db:setup

# Open Prisma Studio
cd node-backend && npx prisma studio
```

## License

MIT

## Author

Built by [Uliman6](https://github.com/Uliman6)
