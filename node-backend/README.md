# Construction Daily Log Backend

Node.js backend API for the construction daily log and event intelligence system.

## Features

- **JSON Import**: Import data from React app JSON exports
- **PDF Reports**: Generate professional PDF daily log reports
- **Event Intelligence**: Find similar events using keyword matching
- **Full-text Search**: Search across events with relevance scoring
- **CRUD APIs**: Complete REST API for projects, daily logs, and events

## Tech Stack

- Node.js + Express
- PostgreSQL with Prisma ORM
- PDFKit for PDF generation
- Docker Compose for database

## Quick Start

### 1. Install Dependencies

```bash
cd node-backend
npm install
```

### 2. Start PostgreSQL

```bash
docker-compose up -d
```

### 3. Initialize Database

```bash
npm run db:generate
npm run db:push
```

### 4. Start the Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3001`

## API Endpoints

### Health Check

```bash
curl http://localhost:3001/health
```

### Import

```bash
# Import JSON file
curl -X POST http://localhost:3001/api/import/json \
  -F "file=@export.json"

# Import JSON body
curl -X POST http://localhost:3001/api/import/json \
  -H "Content-Type: application/json" \
  -d '{"projects": [...], "daily_logs": [...], "events": [...]}'

# Get import history
curl http://localhost:3001/api/import/history
```

### Projects

```bash
# List all projects
curl http://localhost:3001/api/projects

# Get single project
curl http://localhost:3001/api/projects/{id}

# Create project
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "Project Name", "number": "PRJ-001", "address": "123 Main St"}'

# Update project
curl -X PATCH http://localhost:3001/api/projects/{id} \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name"}'

# Delete project
curl -X DELETE http://localhost:3001/api/projects/{id}
```

### Daily Logs

```bash
# List daily logs (with filters)
curl "http://localhost:3001/api/daily-logs?project_id={id}&status=draft"

# Get single daily log (with all nested data)
curl http://localhost:3001/api/daily-logs/{id}

# Create daily log
curl -X POST http://localhost:3001/api/daily-logs \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "uuid",
    "date": "2024-01-15",
    "prepared_by": "John Doe",
    "status": "draft",
    "weather": {"condition": "Sunny", "temperature": "72F"},
    "tasks": [{"company_name": "ABC Electric", "workers": 5, "hours": 8}]
  }'

# Update daily log
curl -X PATCH http://localhost:3001/api/daily-logs/{id} \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'

# Add task to daily log
curl -X POST http://localhost:3001/api/daily-logs/{id}/tasks \
  -H "Content-Type: application/json" \
  -d '{"company_name": "XYZ Plumbing", "workers": 3, "hours": 6}'

# Add pending issue
curl -X POST http://localhost:3001/api/daily-logs/{id}/pending-issues \
  -H "Content-Type: application/json" \
  -d '{"title": "Water leak", "severity": "high", "assignee": "John"}'
```

### Reports

```bash
# Download PDF report
curl http://localhost:3001/api/reports/daily-log/{id} -o report.pdf

# Preview PDF (inline)
curl http://localhost:3001/api/reports/daily-log/{id}/preview
```

### Events

```bash
# List events (with filters)
curl "http://localhost:3001/api/events?project_id={id}&severity=high"

# Search events
curl "http://localhost:3001/api/events/search?q=water%20leak&project_id={id}"

# Get single event
curl http://localhost:3001/api/events/{id}

# Get similar events for an event
curl http://localhost:3001/api/events/{id}/similar

# Find similar events (by ID or text)
curl -X POST http://localhost:3001/api/events/find-similar \
  -H "Content-Type: application/json" \
  -d '{"event_id": "uuid"}'

curl -X POST http://localhost:3001/api/events/find-similar \
  -H "Content-Type: application/json" \
  -d '{"text": "water leak in basement near electrical panel"}'

# Create event
curl -X POST http://localhost:3001/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "uuid",
    "title": "Water Damage",
    "transcript_text": "Found water damage in the basement...",
    "event_type": "issue",
    "severity": "high",
    "location": "Basement Level 1",
    "trade_vendor": "ABC Plumbing"
  }'

# Update event
curl -X PATCH http://localhost:3001/api/events/{id} \
  -H "Content-Type: application/json" \
  -d '{"is_resolved": true}'

# Get event types
curl http://localhost:3001/api/events/types

# Get severities
curl http://localhost:3001/api/events/severities
```

## Data Model

### Projects
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Project name |
| number | String? | Project number |
| address | String? | Project address |

### Daily Logs
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Foreign key to project |
| date | Date | Log date |
| prepared_by | String? | Person who prepared |
| status | String? | draft/completed |
| weather | JSON | Weather conditions |
| daily_totals_workers | Int? | Total workers |
| daily_totals_hours | Float? | Total hours |

**Nested entities**: tasks, visitors, equipment, materials, pending_issues, inspection_notes, additional_work_entries

### Events
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Foreign key to project |
| transcript_text | Text? | Voice transcript |
| event_type | String? | Event category |
| severity | String? | low/medium/high/critical |
| title | String? | Event title |
| notes | Text? | Additional notes |
| location | String? | Location on site |
| trade_vendor | String? | Related contractor |
| is_resolved | Boolean | Resolution status |

## Similarity Algorithm

The similarity search uses a multi-factor scoring system:

### Score Components

| Factor | Weight | Description |
|--------|--------|-------------|
| Same Event Type | +0.30 | Events of same type |
| Same Location | +0.20 | Fuzzy location match |
| Same Trade/Vendor | +0.25 | Same contractor |
| Text Similarity | 0-0.50 | Keyword overlap (Jaccard) |

### How It Works

1. **Keyword Extraction**: Removes stop words, extracts meaningful terms
2. **Entity Recognition**: Identifies names, companies (Inc, LLC, etc.)
3. **Fuzzy Matching**: Levenshtein distance for location/vendor names
4. **Jaccard Similarity**: Keyword overlap between transcripts
5. **Scoring**: Weighted sum, returns results with score > 0.3

### Example Response

```json
{
  "sourceEventId": "abc-123",
  "count": 3,
  "similarEvents": [
    {
      "id": "def-456",
      "title": "Water Leak - Level 2",
      "similarityScore": 0.78,
      "scoreBreakdown": {
        "eventType": 0.3,
        "location": 0.2,
        "textSimilarity": 0.28
      },
      "matchedKeywords": ["water", "leak", "plumbing"]
    }
  ]
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | - | PostgreSQL connection string |
| PORT | 3001 | Server port |
| NODE_ENV | development | Environment |
| CORS_ORIGIN | http://localhost:3000 | Allowed CORS origin |
| UPLOAD_DIR | ./uploads | File upload directory |
| MAX_FILE_SIZE | 52428800 | Max upload size (50MB) |

## Database Commands

```bash
# Generate Prisma client
npm run db:generate

# Push schema changes to database
npm run db:push

# Run migrations (production)
npm run db:migrate

# Open Prisma Studio (database browser)
npm run db:studio
```

## Project Structure

```
node-backend/
├── src/
│   ├── index.js              # Express server entry
│   ├── routes/
│   │   ├── import.routes.js
│   │   ├── reports.routes.js
│   │   ├── projects.routes.js
│   │   ├── daily-logs.routes.js
│   │   └── events.routes.js
│   ├── controllers/
│   │   ├── import.controller.js
│   │   ├── reports.controller.js
│   │   ├── projects.controller.js
│   │   ├── daily-logs.controller.js
│   │   └── events.controller.js
│   ├── services/
│   │   ├── prisma.js
│   │   ├── import.service.js
│   │   ├── pdf-generator.service.js
│   │   └── similarity.service.js
│   └── middleware/
│       ├── upload.middleware.js
│       └── error-handler.middleware.js
├── prisma/
│   └── schema.prisma
├── docker-compose.yml
├── package.json
├── .env
└── README.md
```

## License

MIT
