# Daily Log - Construction Job Site App

A mobile-first daily log application for construction job sites, designed to replace manual form filling with voice-to-text capture and structured data storage.

## Features

### Core Daily Log Capture
- **Project Info**: Project name, number, address
  - **Address autocomplete** (NEW): Start typing and get suggestions from Open-Meteo geocoding
  - Shows verification when an address is selected
- **Weather Conditions**: Temperature range, sky condition, precipitation, wind, weather delays
  - **Auto-fetch from address** (NEW): Automatically fetches current weather using Open-Meteo API based on project address
  - "Refresh Weather" button to update weather data
  - Shows location confirmation after fetch
- **Daily Totals**: Auto-calculated workers and hours from task entries
- **Activity/Tasks by Company**: Company name, worker count, hours, task descriptions
- **Visitors**: Time-stamped visitor log
- **Equipment**: Equipment tracking by company
- **Materials**: Material deliveries with phase codes and quantities

### Project Management
- **Create Projects**: Add new projects with name, number, and address
- **Delete Projects**: Remove projects with all associated data
  - Confirmation modal shows count of logs and events to be deleted
  - Permanently removes all daily logs and events for the project
- **Import Data**: Import projects, forms, and directories from JSON files
  - Import complete projects with logs and events
  - Import form templates
  - Import company/vendor directories

### Insight Capture (Key Feature)
- **Pending Issues**: The most critical section for capturing problems
  - Voice-to-text recording support
  - Category tagging (Coordination, Design, QA/QC, Safety, Schedule, Procurement, Inspection, Other)
  - Severity levels (Low, Medium, High)
  - External entity tags (AHJ, Inspector, Owner, Architect, Vendor/Sub)
  - Location tracking
  - Assignee assignment
- **Inspection Notes**: Track inspections with Pass/Fail/Partial results (voice-enabled)
- **Additional Work/Rework**: Tag out-of-scope work by type (voice-enabled)
- **Daily Summary Notes**: Free-form voice or text field for overall observations

### Event Capture (NEW)
A separate, voice-first feature for real-time event recording (15-30s recordings):
- **Quick Recording**: Big "Record Event" button for fast capture
- **Auto-Title from Transcription**: Events are automatically titled based on the transcription content
- **Event Types**: Delay, Quality, Safety, Inspection, Material, Equipment, Coordination, Other
- **Severity Levels**: Low, Medium, High
- **Event Details**:
  - Title (auto-generated from transcription or manual)
  - Auto-generate button to regenerate title from transcription
  - Notes (optional typed notes)
  - Location (free text: "Level 3 / Grid D4")
  - Trade/Vendor (free text: "ABC Concrete / rebar sub")
- **Bridge to Daily Log**: "Add to Today's Daily Log" converts event to Pending Issue
- **Resolution Tracking**: Mark events as Open/Resolved
- **Timeline View**: See today's events and earlier events

### Voice Recording
Voice recording is available for all key narrative sections:
- Pending Issues (description)
- Inspection Notes (notes)
- Additional Work entries (description)
- Daily Summary Notes
- **Event Capture**
- **Master Voice Capture** (record your entire daily summary in one go)

**Master Voice Capture (NEW):**
- Big "Voice Capture" button at the top of the daily log
- Opens a recording modal with **talking points** as a guide:
  - Weather conditions
  - Activity / Crews on site
  - Issues & Problems
  - Inspections
  - Equipment
  - Materials
  - Visitors
  - General Notes
- Tap to start/stop recording
- Playback before saving
- Re-record if needed
- **Saved Recording Display**: After saving, shows a player with:
  - Play/pause with progress bar
  - Duration display
  - Re-record option to replace
  - Delete option to remove
  - **Automatic transcription** using OpenAI GPT-4o-transcribe
  - Transcription shown below the player when ready
  - Retry button if transcription fails

**Voice Recorder Features:**
- **Hold to record**: Press and hold the mic button to record
- **Release to stop**: Release your finger to automatically stop recording
- **Drag up to lock**: While recording, drag up to lock the recording - no need to keep holding
- **Stop button**: When locked, tap the stop button to end the recording
- **Playback**: After recording, tap "Play Recording" to listen back before saving
- **Play button on fields**: Voice input fields show a Play button when audio is recorded
- **Persistent storage**: Audio files are now saved to permanent storage, so recordings survive app restarts

All voice recordings are stored as Voice Artifacts with:
- Section key (which section the recording belongs to)
- Local audio URI (persisted in document storage)
- Transcript text (populated when transcription API is connected)
- Status tracking (recorded → uploaded → transcribed)

### Company Recall (NEW)
- **Recall button**: In the Activity/Tasks section, tap "Recall" to add companies from your previous day's log
- **Recall All**: One tap to add all companies from yesterday
- **Pre-filled data**: Worker counts and hours are copied, task descriptions are left blank for new entries
- **Smart filtering**: Companies already added today are excluded from the recall list

### Export & Sharing
- **PDF Export**: Professional PDF generation with all log data
- **Copy Summary**: Quick text summary for email/Procore notes
- **Print**: Direct printing support
- **JSON Exports**:
  - Export Last 7 Days
  - Export Last 30 Days
  - Export This Project
  - Export All Data
  - Export Audio Manifest (includes audio file references)
- **Audio Pack Export (NEW)**:
  - **Export Audio Pack (ZIP)**: Downloads all audio recordings as a ZIP file with manifest.json
  - **Export JSON + Audio Linkage**: JSON export with enhanced audio manifest containing audio_file_id for each recording
  - Works on both mobile and desktop browser
  - Supports offline transcription workflows (Whisper, etc.)

### Sync & Backend Ready
- **Sync Status Indicators**: Shows pending/syncing/synced/error states
- **Export Payload Functions**:
  - `exportDailyLogPayload()` - stable JSON for single daily log
  - `exportEventPayload()` - stable JSON for single event
  - `exportAllDataPayload()` - complete export with filters
- **Backend Schema**: Full Postgres-compatible schema in `src/lib/backend-schema.ts`
- **Offline-First**: App works offline, syncs when connected

## Architecture

### Tech Stack
- Expo SDK 53 / React Native 0.76.7
- TypeScript
- Zustand for state management (with AsyncStorage persistence)
- NativeWind (TailwindCSS) for styling
- expo-av for audio recording
- expo-print for PDF generation
- expo-sharing for file sharing
- expo-file-system for file operations
- @react-native-community/netinfo for connectivity

### Data Storage
- All data persisted locally via AsyncStorage
- **Audio files persisted to document storage** (survive app restarts)
- Structured for backend database sync
- Schema supports:
  - Multiple projects
  - Multiple daily logs per project
  - Normalized child tables (tasks, issues, visitors, equipment, materials)
  - **Events** (new separate entity for real-time capture)
  - Voice artifacts with processing status
  - Sync status tracking

### File Structure
```
src/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx      # Tab navigation
│   │   ├── index.tsx        # Daily log form
│   │   ├── events.tsx       # Event Capture screen
│   │   ├── history.tsx      # Log history
│   │   └── projects.tsx     # Project management with delete
│   ├── event-detail.tsx     # Event detail/edit screen with auto-title
│   ├── exports.tsx          # Data export screen
│   ├── import.tsx           # Data import screen (NEW)
│   ├── export.tsx           # PDF export screen
│   └── _layout.tsx          # Root layout
├── components/
│   ├── ui.tsx               # Reusable UI components
│   ├── VoiceRecorder.tsx    # Voice recording component
│   ├── PendingIssues.tsx    # Issues section
│   ├── RepeatingSections.tsx # Tasks, visitors, equipment, materials
│   ├── InsightSections.tsx  # Inspections, additional work
│   └── SyncStatus.tsx       # Sync status indicators
└── lib/
    ├── types.ts             # TypeScript interfaces (includes Event type)
    ├── store.ts             # Zustand store (includes event actions)
    ├── sync.ts              # Sync utilities, API client, export functions
    ├── transcription.ts     # Transcription API with auto-title generation
    ├── backend-schema.ts    # Database schema documentation
    └── cn.ts                # Utility functions
```

## Voice-to-Text

The app includes voice recording capability using expo-av with **GPT-4o-transcribe** integration:
- Records audio and stores the file locally
- **Automatic transcription** using OpenAI's gpt-4o-transcribe model
- Creates voice artifacts with metadata and transcript text
- Transcriptions are stored alongside audio files

### Transcription Setup
1. Go to the **API tab** in Vibecode
2. Ensure OpenAI API is configured
3. Recordings will automatically be transcribed using gpt-4o-transcribe

### Transcription Models
- **gpt-4o-transcribe** (default): High-quality transcription with speech understanding
- **gpt-4o-mini-transcribe**: Faster/cheaper option for simpler transcriptions

## Event Capture

### Recording Events
1. Go to the **Events** tab
2. Select a project (or it uses the last-selected project)
3. Tap the big "Record Event" button
4. Hold to record your voice note (15-30 seconds recommended)
5. Release to save - you'll be taken to the event detail screen

### Event Details
After recording, fill in:
- **Title**: Give the event a descriptive name
- **Event Type**: Delay, Quality, Safety, Inspection, Material, Equipment, Coordination, Other
- **Severity**: Low, Medium, High
- **Location**: Where did this happen?
- **Trade/Vendor**: Who was involved?
- **Notes**: Any additional written notes

### Bridging to Daily Log
Events can be converted to Pending Issues in the Daily Log:
1. Open an event
2. Tap "Add to Today's Daily Log"
3. The event becomes a Pending Issue with:
   - Event type mapped to issue category
   - Same severity
   - Audio recording attached
   - Reference link back to original event

### Resolution
- Mark events as resolved when the issue is addressed
- Resolved events show a green checkmark

## Data Export

### Export Screen
Access via the download icon in the Events tab header.

### Export Options
| Export Type | Description |
|-------------|-------------|
| Last 7 Days | All data from the past week |
| Last 30 Days | All data from the past month |
| This Project | All data for the currently selected project |
| All Data | Complete backup of everything |
| Audio Manifest | All data plus audio file reference list |
| **Audio Pack (ZIP)** | ZIP file with all audio files + manifest.json |
| **JSON + Audio Linkage** | JSON export with enhanced audio manifest for offline transcription |

### Audio Pack Export

The Audio Pack export creates a ZIP file containing:

```
lessons_applied_audio_<YYYY-MM-DD>_<HHmm>.zip
├── audio/
│   ├── event_<event_id>.m4a
│   ├── pending_issue_<issue_id>.m4a
│   ├── inspection_note_<note_id>.m4a
│   ├── additional_work_<work_id>.m4a
│   ├── daily_summary_<log_id>.m4a
│   └── voice_artifact_<artifact_id>.m4a
├── transcripts/
│   ├── event_<event_id>.txt
│   ├── voice_artifact_<artifact_id>.txt
│   └── ... (text files for all transcribed audio)
└── manifest.json
```

**manifest.json structure:**
```json
{
  "audio_files": [
    {
      "audio_file_id": "unique_id",
      "entity_type": "event | pending_issue | inspection_note | additional_work | daily_summary | voice_artifact",
      "entity_id": "id_of_parent_entity",
      "section_key": "event | pending_issues | inspection_notes | additional_work | daily_summary | voice_artifacts",
      "project_id": "project_id",
      "daily_log_id": "log_id_or_null",
      "created_at": "2024-01-15T10:30:00.000Z",
      "filename": "event_abc123.m4a",
      "mime_type": "audio/m4a",
      "duration_seconds": null,
      "original_uri": "file:///path/to/original",
      "transcript_text": "The transcribed text content..."
    }
  ],
  "transcript_files": [
    {
      "transcript_file_id": "unique_id",
      "audio_file_id": "matching_audio_file_id",
      "entity_type": "event",
      "entity_id": "entity_id",
      "filename": "event_abc123.txt",
      "text": "Full transcript text...",
      "word_count": 45
    }
  ],
  "export_metadata": {
    "exported_at": "2024-01-15T12:00:00.000Z",
    "total_audio_files": 5,
    "total_transcript_files": 3,
    "total_size_bytes": 1234567
  }
}
```

### JSON + Audio Linkage Export

When using "Export JSON + Audio Linkage", the JSON export includes an `enhanced_audio_manifest` field:

```typescript
{
  // ... standard export fields ...
  enhanced_audio_manifest: {
    audio_files: AudioFileReference[],  // Same structure as manifest.json
    audio_pack_filename: string | null,  // Suggested ZIP filename
    audio_manifest_included: true
  }
}
```

This allows you to:
1. Export the JSON file
2. Export the Audio Pack (ZIP)
3. Use the manifest to map audio files to entities for batch offline transcription

### Export Format
Exports are JSON files containing:
```typescript
{
  projects: Project[],
  daily_logs: DailyLogPayload[],
  events: EventPayload[],
  export_metadata: {
    device_id: string,
    app_version: string,
    exported_at: string
  },
  audio_manifest?: {  // Optional, when include_audio_manifest is true
    events: [{ event_id, audio_uri }],
    voice_artifacts: [{ log_id, artifact_id, audio_uri }]
  }
}
```

## Backend Integration

### Setting Up Sync

1. Set `EXPO_PUBLIC_API_URL` in the **ENV tab** to your backend URL
2. Implement the API endpoints documented in `src/lib/backend-schema.ts`
3. The app will automatically sync when online

### API Endpoints (to implement)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sync/daily-logs` | POST | Batch sync daily logs |
| `/api/sync/events` | POST | Batch sync events |
| `/api/projects/:id/daily-logs` | GET | Get logs for a project |
| `/api/daily-logs/:id` | GET | Get single log with entries |
| `/api/voice-artifacts/:id/upload` | POST | Upload audio file |
| `/api/voice-artifacts/:id/transcribe` | POST | Queue for transcription |

### Export Payload Format (Daily Log)

```typescript
{
  project: Project,
  daily_log: { ... },
  tasks: TaskEntry[],
  visitors: VisitorEntry[],
  equipment: EquipmentEntry[],
  materials: MaterialEntry[],
  pending_issues: PendingIssue[],
  inspection_notes: InspectionNote[],
  additional_work_entries: AdditionalWorkEntry[],
  voice_artifacts: VoiceArtifact[],
  metadata: {
    created_at: string,
    updated_at: string,
    device_id: string,
    user_id: string | null,
    app_version: string
  }
}
```

### Event Payload Format

```typescript
{
  event: {
    id: string,
    project_id: string,
    created_at: string,
    local_audio_uri: string,
    transcript_text: string | null,
    status: 'recorded' | 'uploaded' | 'transcribed',
    event_type: EventType,
    severity: 'Low' | 'Medium' | 'High',
    title: string,
    notes: string,
    location: string,
    trade_vendor: string,
    linked_daily_log_id: string | null,
    is_resolved: boolean,
    resolved_at: string | null,
    server_id: string | null,
    last_synced_at: string | null,
    sync_status: SyncStatus
  },
  project: { id, name, number, address } | null,
  metadata: {
    device_id: string,
    app_version: string,
    exported_at: string
  }
}
```

## Usage

### Getting Started
1. Open the app
2. Go to **Projects** tab
3. Create a new project
4. A daily log is automatically created for today

### Creating Daily Logs
1. Fill in your name under "Prepared By"
2. Record weather conditions
3. **Add Pending Issues** (most important) - use voice or type
4. Add tasks by company
5. Fill in other sections as needed
6. Use Daily Summary Notes for overall observations

### Quick Event Capture
1. Go to **Events** tab
2. Tap "Record Event"
3. Hold to record, release to save
4. Fill in event details
5. Optionally add to Daily Log

### Exporting
- Tap **Copy** to copy a text summary
- Tap **PDF** to generate and share a PDF document
- Tap the **download icon** in Events tab to access JSON exports

### Syncing
- Sync status appears at the bottom of each log
- Tap the sync badge to manually sync
- Logs automatically attempt sync when network is available

## Future Enhancements

Ready for implementation:
- Transcription API integration (OpenAI Whisper, Deepgram, etc.)
- Backend database sync server (Node.js/Express + Postgres)
- Processing queue for async transcription
- Procore/ACC integration (`procore_project_id`, `related_rfi_ids`, `related_co_ids` fields exist)
- File attachments for issues
- Analytics dashboard
- Multi-user support with auth
- Event-to-alert automation (when transcription is available)
- Form generation from voice transcripts
