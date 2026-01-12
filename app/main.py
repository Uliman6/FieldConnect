from fastapi import FastAPI, UploadFile, File, Depends, Form
from sqlalchemy.orm import Session
import json, zipfile, io
from .db import Base, engine, get_db
from .models import Project, DailyLog, Event, AudioBlob, ProcessingJob
from .services.ingest import ingest_export_json, upsert_audio_blob_and_enqueue
from .services.storage import save_audio_bytes

app = FastAPI(title="Lessons Applied API", version="0.2.0")
Base.metadata.create_all(bind=engine)

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/ingest/export-json")
async def ingest_export_json_endpoint(export_json: UploadFile = File(...), db: Session = Depends(get_db)):
    export_bytes = await export_json.read()
    summary = ingest_export_json(db, export_bytes, export_json.filename or "export.json")
    return {**summary, "audio_blobs_upserted": 0, "jobs_enqueued": 0}

@app.post("/ingest/bundle")
async def ingest_bundle(
    export_json: UploadFile = File(...),
    manifest_json: UploadFile | None = File(None),
    audio_zip: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    export_bytes = await export_json.read()
    summary = ingest_export_json(db, export_bytes, export_json.filename or "export.json")

    # Manifest: prefer explicit manifest.json; fallback to enhanced_audio_manifest inside export
    audio_files = []
    if manifest_json is not None:
        manifest = json.loads((await manifest_json.read()).decode("utf-8"))
        audio_files = manifest.get("audio_files", [])
    else:
        data = json.loads(export_bytes.decode("utf-8"))
        e = data.get("enhanced_audio_manifest", {})
        if isinstance(e, dict) and "audio_files" in e:
            audio_files = e["audio_files"]

    audio_blobs_upserted = 0
    jobs_enqueued = 0

    if audio_zip is not None:
        zbytes = await audio_zip.read()
        z = zipfile.ZipFile(io.BytesIO(zbytes))
        meta_by_filename = {m["filename"]: m for m in audio_files if "filename" in m}

        for name in z.namelist():
            if name.endswith("/"):
                continue
            fn = name.split("/")[-1]
            if fn not in meta_by_filename:
                continue
            meta = meta_by_filename[fn]
            blob = z.read(name)
            storage_path = save_audio_bytes(fn, blob)
            upsert_audio_blob_and_enqueue(db, meta, storage_path)
            audio_blobs_upserted += 1
            jobs_enqueued += 1

    return {**summary, "audio_blobs_upserted": audio_blobs_upserted, "jobs_enqueued": jobs_enqueued, "manifest_audio_refs": len(audio_files)}

@app.post("/media/upload")
async def upload_media(
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    section_key: str = Form(...),
    project_id: str | None = Form(None),
    daily_log_id: str | None = Form(None),
    created_at: str | None = Form(None),
    audio_file_id: str = Form(...),
    filename: str = Form(...),
    mime_type: str | None = Form(None),
    duration_seconds: int | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    data = await file.read()
    storage_path = save_audio_bytes(filename, data)
    meta = {
        "audio_file_id": audio_file_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "section_key": section_key,
        "project_id": project_id,
        "daily_log_id": daily_log_id,
        "created_at": created_at,
        "filename": filename,
        "mime_type": mime_type or file.content_type,
        "duration_seconds": duration_seconds,
    }
    upsert_audio_blob_and_enqueue(db, meta, storage_path)
    return {"audio_file_id": audio_file_id, "jobs_enqueued": 1}

@app.get("/projects")
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).all()

@app.get("/daily-logs")
def list_daily_logs(db: Session = Depends(get_db)):
    return db.query(DailyLog).all()

@app.get("/events")
def list_events(db: Session = Depends(get_db)):
    return db.query(Event).all()

@app.get("/audio-blobs")
def list_audio(db: Session = Depends(get_db)):
    return db.query(AudioBlob).all()

@app.get("/jobs")
def list_jobs(db: Session = Depends(get_db)):
    return db.query(ProcessingJob).order_by(ProcessingJob.id.desc()).all()
