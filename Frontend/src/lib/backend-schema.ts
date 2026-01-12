/**
 * Backend Database Schema for Daily Log System
 *
 * This schema is designed for Postgres but written to be compatible with SQLite.
 * Use this as the reference for implementing the backend API.
 */

export const BACKEND_SCHEMA = `
-- ============================================
-- CORE TABLES
-- ============================================

-- Projects table
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  number TEXT,
  address TEXT,
  procore_project_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Daily logs table
CREATE TABLE daily_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  prepared_by TEXT,

  -- Weather (stored as JSON for flexibility)
  weather_low_temp INTEGER,
  weather_high_temp INTEGER,
  weather_precipitation TEXT,
  weather_wind TEXT,
  weather_sky_condition TEXT CHECK(weather_sky_condition IN ('Clear', 'Partly Cloudy', 'Cloudy', 'Overcast', 'Rainy', 'Stormy')),
  weather_delay BOOLEAN DEFAULT FALSE,

  -- Totals
  daily_totals_workers INTEGER DEFAULT 0,
  daily_totals_hours REAL DEFAULT 0,

  -- Daily summary
  daily_summary_notes TEXT,
  daily_summary_audio_uri TEXT,

  -- Status
  status TEXT CHECK(status IN ('draft', 'completed')) DEFAULT 'draft',

  -- Sync metadata
  device_id TEXT,
  app_version TEXT,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(project_id, date)
);

-- ============================================
-- ENTRY TABLES
-- ============================================

-- Task entries
CREATE TABLE task_entries (
  id TEXT PRIMARY KEY,
  daily_log_id TEXT NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  company_name TEXT,
  workers INTEGER DEFAULT 0,
  hours REAL DEFAULT 0,
  task_description TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Visitor entries
CREATE TABLE visitor_entries (
  id TEXT PRIMARY KEY,
  daily_log_id TEXT NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  time TEXT,
  company_name TEXT,
  visitor_name TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Equipment entries
CREATE TABLE equipment_entries (
  id TEXT PRIMARY KEY,
  daily_log_id TEXT NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  company TEXT,
  equipment TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Material entries
CREATE TABLE material_entries (
  id TEXT PRIMARY KEY,
  daily_log_id TEXT NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  company TEXT,
  material_name TEXT,
  phase_code TEXT,
  quantity TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INSIGHT CAPTURE TABLES
-- ============================================

-- Pending issues (most important section)
CREATE TABLE pending_issues (
  id TEXT PRIMARY KEY,
  daily_log_id TEXT NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  category TEXT CHECK(category IN ('Coordination', 'Design', 'QAQC', 'Safety', 'Schedule', 'Procurement', 'Inspection', 'Other')) DEFAULT 'Other',
  severity TEXT CHECK(severity IN ('Low', 'Medium', 'High')) DEFAULT 'Medium',
  assignee TEXT,
  due_date DATE,
  external_entity TEXT,
  location TEXT,
  audio_uri TEXT,
  related_rfi_ids TEXT, -- JSON array
  related_co_ids TEXT,  -- JSON array
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Inspection notes
CREATE TABLE inspection_notes (
  id TEXT PRIMARY KEY,
  daily_log_id TEXT NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  inspector_name TEXT,
  ahj TEXT, -- Authority Having Jurisdiction
  inspection_type TEXT,
  result TEXT CHECK(result IN ('Pass', 'Fail', 'Partial')) DEFAULT 'Pass',
  notes TEXT,
  follow_up_needed BOOLEAN DEFAULT FALSE,
  audio_uri TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Additional work entries
CREATE TABLE additional_work_entries (
  id TEXT PRIMARY KEY,
  daily_log_id TEXT NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  description TEXT,
  tag TEXT CHECK(tag IN ('owner_request', 'design_ambiguity', 'vendor_issue', 'field_condition', 'other')) DEFAULT 'other',
  audio_uri TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- VOICE & PROCESSING TABLES
-- ============================================

-- Voice artifacts for async transcription pipeline
CREATE TABLE voice_artifacts (
  id TEXT PRIMARY KEY,
  daily_log_id TEXT NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  section_key TEXT CHECK(section_key IN ('pending_issues', 'inspection_notes', 'additional_work', 'daily_summary')) NOT NULL,
  entity_id TEXT, -- ID of the related entry (issue, note, work entry, or null for daily_summary)
  local_audio_uri TEXT NOT NULL,
  remote_audio_uri TEXT, -- After upload to cloud storage
  transcript_text TEXT,
  status TEXT CHECK(status IN ('recorded', 'uploaded', 'transcribed', 'failed')) DEFAULT 'recorded',
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

-- Processing jobs for async operations
CREATE TABLE processing_jobs (
  id TEXT PRIMARY KEY,
  daily_log_id TEXT NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  job_type TEXT CHECK(job_type IN ('transcription', 'sync', 'export')) NOT NULL,
  status TEXT CHECK(status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  input_data TEXT, -- JSON
  output_data TEXT, -- JSON
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- ============================================
-- SYNC TRACKING
-- ============================================

-- Sync log for tracking what has been synced
CREATE TABLE sync_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL, -- 'daily_log', 'project', etc.
  entity_id TEXT NOT NULL,
  action TEXT CHECK(action IN ('create', 'update', 'delete')) NOT NULL,
  device_id TEXT NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_hash TEXT -- For conflict detection
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_daily_logs_project_id ON daily_logs(project_id);
CREATE INDEX idx_daily_logs_date ON daily_logs(date);
CREATE INDEX idx_task_entries_daily_log_id ON task_entries(daily_log_id);
CREATE INDEX idx_pending_issues_daily_log_id ON pending_issues(daily_log_id);
CREATE INDEX idx_pending_issues_severity ON pending_issues(severity);
CREATE INDEX idx_voice_artifacts_daily_log_id ON voice_artifacts(daily_log_id);
CREATE INDEX idx_voice_artifacts_status ON voice_artifacts(status);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX idx_sync_log_entity ON sync_log(entity_type, entity_id);
`;

/**
 * API Endpoint Definitions
 *
 * These endpoints should be implemented on your backend server.
 */
export const API_ENDPOINTS = {
  // Sync daily logs (batch)
  syncDailyLogs: {
    method: 'POST',
    path: '/api/sync/daily-logs',
    description: 'Sync one or more daily logs to the server',
    requestBody: {
      logs: 'DailyLogPayload[]', // Array of log payloads from exportDailyLogPayload()
    },
    response: {
      synced: 'string[]', // IDs of successfully synced logs
      failed: '{ id: string; error: string }[]', // Failed syncs with errors
    },
  },

  // Get daily logs for a project
  getDailyLogs: {
    method: 'GET',
    path: '/api/projects/:projectId/daily-logs',
    description: 'Get all daily logs for a project',
    queryParams: {
      startDate: 'ISO date string (optional)',
      endDate: 'ISO date string (optional)',
      limit: 'number (optional, default 50)',
      offset: 'number (optional, default 0)',
    },
    response: {
      logs: 'DailyLog[]',
      total: 'number',
    },
  },

  // Get single daily log with all entries
  getDailyLog: {
    method: 'GET',
    path: '/api/daily-logs/:logId',
    description: 'Get a complete daily log with all related entries',
    response: 'DailyLogPayload',
  },

  // Upload audio file
  uploadAudio: {
    method: 'POST',
    path: '/api/voice-artifacts/:artifactId/upload',
    description: 'Upload audio file for transcription',
    requestBody: {
      audio: 'multipart/form-data file',
    },
    response: {
      remote_uri: 'string',
      status: 'uploaded',
    },
  },

  // Get transcription status
  getTranscriptionStatus: {
    method: 'GET',
    path: '/api/voice-artifacts/:artifactId/status',
    description: 'Check transcription processing status',
    response: {
      status: 'recorded | uploaded | transcribed | failed',
      transcript_text: 'string | null',
      error_message: 'string | null',
    },
  },

  // Trigger transcription
  triggerTranscription: {
    method: 'POST',
    path: '/api/voice-artifacts/:artifactId/transcribe',
    description: 'Queue audio for transcription processing',
    response: {
      job_id: 'string',
      status: 'pending',
    },
  },

  // Projects
  getProjects: {
    method: 'GET',
    path: '/api/projects',
    description: 'Get all projects',
    response: 'Project[]',
  },

  createProject: {
    method: 'POST',
    path: '/api/projects',
    description: 'Create a new project',
    requestBody: 'Partial<Project>',
    response: 'Project',
  },
};

/**
 * Example backend implementation (Node.js/Express pseudo-code)
 */
export const EXAMPLE_BACKEND_CODE = `
// Example: Express.js sync endpoint

app.post('/api/sync/daily-logs', async (req, res) => {
  const { logs } = req.body;
  const synced: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const payload of logs) {
    try {
      await db.transaction(async (trx) => {
        // Upsert project
        await trx('projects')
          .insert(payload.project)
          .onConflict('id')
          .merge();

        // Upsert daily log
        await trx('daily_logs')
          .insert({
            ...payload.daily_log,
            device_id: payload.metadata.device_id,
            app_version: payload.metadata.app_version,
          })
          .onConflict('id')
          .merge();

        const logId = payload.daily_log.id;

        // Sync entries (delete and re-insert for simplicity)
        await trx('task_entries').where('daily_log_id', logId).delete();
        if (payload.tasks.length > 0) {
          await trx('task_entries').insert(
            payload.tasks.map((t, i) => ({ ...t, daily_log_id: logId, sort_order: i }))
          );
        }

        // ... repeat for other entry types ...

        // Sync voice artifacts
        await trx('voice_artifacts').where('daily_log_id', logId).delete();
        if (payload.voice_artifacts.length > 0) {
          await trx('voice_artifacts').insert(
            payload.voice_artifacts.map(a => ({ ...a, daily_log_id: logId }))
          );
        }

        // Log sync
        await trx('sync_log').insert({
          id: generateId(),
          entity_type: 'daily_log',
          entity_id: logId,
          action: 'update',
          device_id: payload.metadata.device_id,
        });
      });

      synced.push(payload.daily_log.id);
    } catch (error) {
      failed.push({ id: payload.daily_log.id, error: error.message });
    }
  }

  res.json({ synced, failed });
});
`;
