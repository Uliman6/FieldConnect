# Lessons Applied — Backend Starter Kit (v2)

This is a **local dev backend** that ingests your mobile exports (JSON + audio files) and prepares an async pipeline for:
- transcription (audio -> text)
- structured extraction (one recording -> full daily log fields)
- future: search / alerts / Procore-ACC ingestion

It is designed to work with your updated app behavior:
- audio exports can include **previously recorded files across multiple days**, not only “today”
- each export bundle is treated as **append-only + idempotent** (safe to re-ingest)

---

## What you run this on (where to run the code)

Run this **on your computer**, not inside Vibecode.

Recommended: a laptop/desktop with Docker installed.
- macOS / Windows (Docker Desktop) / Linux (Docker Engine)

---

## What’s in the stack (local dev)

- API: FastAPI
- DB: Postgres
- Queue: Redis + RQ worker
- Media: local disk under `./data/blobs/` (dev only)

---

## Quick start

1) Install Docker + Docker Compose
2) Unzip this repo and open a terminal in the folder
3) Start services:

```bash
docker compose up --build
```

4) Verify health:
- http://localhost:8000/health
- API docs: http://localhost:8000/docs

---

## Your ingestion workflow (recommended)

Each time you export from the app, you should have:
- `..._with-audio-linkage.json` (or `..._all-data.json`)
- `manifest.json`
- `audio_pack.zip` (or a folder of `.m4a` files)

### Option A: Bundle ingest (JSON + manifest + ZIP)
Use the provided script (easiest):

```bash
python scripts/ingest_bundle.py --api http://localhost:8000   --export /path/to/lessons_applied_export_with-audio-linkage.json   --manifest /path/to/manifest.json   --zip /path/to/audio_pack.zip
```

### Option B: JSON-only (if you don’t have audio yet)
```bash
python scripts/ingest_bundle.py --api http://localhost:8000   --export /path/to/lessons_applied_export_all-data.json
```

### Option C: If your audio is NOT zipped (you have loose .m4a files)
Upload them individually (still automated) using:

```bash
python scripts/upload_audio_from_manifest.py --api http://localhost:8000   --manifest /path/to/manifest.json   --audio-dir /path/to/audio_files_folder
```

---

## What happens after ingest

- Projects / Daily Logs / Events are upserted into Postgres
- Each audio file becomes an `audio_blobs` row
- A `processing_jobs` row is created and queued for transcription

By default, transcription jobs will end as `needs_config` until you wire up a provider.

---

## Hooking up transcription (later)

Set in `docker-compose.yml`:
- `OPENAI_API_KEY`

Then implement the provider call in:
- `app/services/transcription.py`

(We keep this vendor-agnostic so you can choose OpenAI / Deepgram / AssemblyAI / self-hosted.)

---

## The “one voice recording -> full daily log” pipeline (next milestone)

This backend is structured for the flow:

1) Upload a **daily master recording** (entity_type=`daily_log`, section_key=`daily_master`)
2) Worker transcribes it
3) Worker runs extraction to output a full structured daily log payload
4) Store extracted fields + confidence + missing fields

The extraction stub lives in:
- `app/services/parsing.py`

Next, we’ll implement a strict schema-guided extractor.

---

## Inspect data locally

After ingest, you can list records:

- http://localhost:8000/projects
- http://localhost:8000/daily-logs
- http://localhost:8000/events
- http://localhost:8000/audio-blobs
- http://localhost:8000/jobs

---

## Next steps (future phases)

- Store blobs in S3/GCS + signed URLs
- Add RBAC + org/project access
- Add vector search (pgvector) for “has this happened before?”
- Add alert rules engine
- Add Procore/ACC ingestion workers
