# FieldConnect Admin Guide

This guide covers common administrative tasks for managing FieldConnect.

## Table of Contents
1. [User Management](#user-management)
2. [Database Access](#database-access)
3. [Frontend Configuration](#frontend-configuration)
4. [Deployment](#deployment)
5. [Troubleshooting](#troubleshooting)

---

## User Management

### Creating a New User

**Option 1: Via API (Recommended)**
```bash
curl -X POST https://fieldconnect.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "newuser@example.com", "password": "password123", "name": "New User"}'
```

**Option 2: Via Frontend**
Users can self-register through the app's login screen (tap "Create Account").

### Listing All Users (Admin Only)
```bash
# First, login to get a token
TOKEN=$(curl -s -X POST https://fieldconnect.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@fieldconnect.com", "password": "YOUR_ADMIN_PASSWORD"}' | jq -r '.token')

# Then list users
curl -H "Authorization: Bearer $TOKEN" \
  https://fieldconnect.onrender.com/api/auth/users
```

### Updating a User (Admin Only)
```bash
# Update user role, name, or deactivate
curl -X PATCH "https://fieldconnect.onrender.com/api/auth/users/USER_ID_HERE" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "role": "ADMIN", "isActive": true}'
```

Roles available:
- `VIEWER` - Can view but not edit (default for new users)
- `EDITOR` - Can create and edit
- `ADMIN` - Full access including user management

### Changing a User's Password (Admin Only)
```bash
curl -X PATCH "https://fieldconnect.onrender.com/api/auth/users/USER_ID_HERE" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password": "newpassword123"}'
```

### Deactivating a User
```bash
curl -X PATCH "https://fieldconnect.onrender.com/api/auth/users/USER_ID_HERE" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isActive": false}'
```

### Deleting a User (Admin Only)
```bash
curl -X DELETE "https://fieldconnect.onrender.com/api/auth/users/USER_ID_HERE" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Database Access

### Direct Database Access
The database is hosted on Railway. Access via:
1. Go to https://railway.app and login
2. Select the FieldConnect project
3. Click on the PostgreSQL service
4. Use the "Connect" tab for connection string or Query tab for SQL

### Common SQL Queries

**List all users:**
```sql
SELECT id, email, name, role, is_active, created_at FROM "User" ORDER BY created_at DESC;
```

**List all projects:**
```sql
SELECT id, name, project_number, created_at FROM "Project" ORDER BY created_at DESC;
```

**Count records per table:**
```sql
SELECT 
  (SELECT COUNT(*) FROM "User") as users,
  (SELECT COUNT(*) FROM "Project") as projects,
  (SELECT COUNT(*) FROM "DailyLog") as daily_logs,
  (SELECT COUNT(*) FROM "Event") as events;
```

---

## Frontend Configuration

### Changing the App Language
The app language is set automatically based on device settings. Users can change it in:
**Settings Tab > Language**

Supported languages:
- English (en)
- Spanish (es)
- Turkish (tr)

### Adding a New Language Translation
1. Create a new locale file: `Frontend/src/i18n/locales/XX.ts` (copy from en.ts)
2. Translate all strings
3. Add the import in `Frontend/src/i18n/LanguageProvider.tsx`
4. Add to the language selector in settings

### Environment Variables
- **Frontend**: Set in `Frontend/.env.production` and Vercel dashboard
- **Backend**: Set in Render dashboard

Key environment variables:
```
# Frontend
EXPO_PUBLIC_API_URL=https://fieldconnect.onrender.com

# Backend
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret
OPENAI_API_KEY=sk-...
CORS_ORIGIN=https://field-connect-xi.vercel.app
```

---

## Deployment

### Web App (Vercel)
Auto-deploys from `main` branch. No action needed.

To deploy manually:
```bash
cd Frontend
vercel --prod
```

### Backend (Render)
Auto-deploys from `main` branch. No action needed.

To trigger manual deploy:
1. Go to Render dashboard
2. Click "Manual Deploy" > "Deploy latest commit"

### iOS App (EAS)
```bash
cd Frontend

# Build new version
eas build --platform ios --profile production

# Submit to TestFlight
eas submit --platform ios --latest

# OTA update (JS-only changes, no rebuild needed)
eas update --branch main --message "Description of changes"
```

### When to Use Full Build vs OTA Update

| Change Type | Method |
|-------------|--------|
| JavaScript/React code | OTA Update |
| Translations | OTA Update |
| Styles/UI | OTA Update |
| New npm package | Full Build |
| Native module change | Full Build |
| app.json changes | Full Build |
| Permissions | Full Build |

---

## Troubleshooting

### Backend Not Responding
Render free tier sleeps after 15 min. Wait ~30 seconds for cold start.

To keep alive, the GitHub Actions workflow pings every 14 min:
`.github/workflows/keep-alive.yml`

### User Can't Login
1. Check if user exists: Query database or use admin API
2. Check if account is active: `isActive` must be `true`
3. Reset password via admin API

### PDF Not Generating
1. Check Render logs for errors
2. Ensure daily log has content (tasks, issues, etc.)
3. Try regenerating from the app

### Sync Issues
1. Check network connectivity
2. Pull to refresh in the app
3. Check Render logs for API errors

### Multi-Tenant Data Leak (CRITICAL)
Each project is owned by one user. Users should ONLY see:
- Projects they created
- Daily logs in their projects
- Events in their projects

If data leaks between users:
1. Check projectId is being passed correctly in queries
2. Verify middleware is attaching user to request
3. Check Prisma queries filter by userId

---

## Test Accounts

For testing multi-user functionality:

| Email | Password | Role |
|-------|----------|------|
| admin@fieldconnect.com | [your admin password] | ADMIN |
| test1@fieldconnect.com | testuser1 | EDITOR |
| test2@fieldconnect.com | testuser2 | EDITOR |

Create test accounts with:
```bash
curl -X POST https://fieldconnect.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test1@fieldconnect.com", "password": "testuser1", "name": "Test User 1"}'

curl -X POST https://fieldconnect.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test2@fieldconnect.com", "password": "testuser2", "name": "Test User 2"}'
```

---

## Quick Reference

| Task | Command/Action |
|------|----------------|
| Create user | `POST /api/auth/register` |
| List users | `GET /api/auth/users` (admin) |
| Update user | `PATCH /api/auth/users/:id` (admin) |
| Delete user | `DELETE /api/auth/users/:id` (admin) |
| Deploy web | Push to `main` (auto) |
| Deploy iOS | `eas build --platform ios` |
| OTA update | `eas update --branch main` |
| Check logs | Render dashboard > Logs |
| Database | Railway dashboard > Query |
