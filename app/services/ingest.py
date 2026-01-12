import json
from datetime import datetime
from sqlalchemy.orm import Session

from ..models import Project, DailyLog, Event, AudioBlob
from .jobs import enqueue_transcription
from .storage import save_export_json_bytes


def _dt(s: str | None):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def ensure_project(db: Session, project_id: str, fallback: dict | None = None):
    """
    Ensure a Project row exists for FK integrity.

    In real exports, it's possible for daily logs/events to reference project_id values
    that are not present in top-level `projects[]` or have mismatched nested `row["project"]`.
    We create a placeholder project (or use fallback fields) so ingestion doesn't fail.
    """
    if not project_id:
        return

    existing = db.get(Project, project_id)
    if existing:
        return

    name = "Unknown Project"
    number = None
    address = None
    created_at = None
    updated_at = None

    if isinstance(fallback, dict):
        name = fallback.get("name") or name
        number = fallback.get("number")
        address = fallback.get("address")
        created_at = _dt(fallback.get("created_at"))
        updated_at = _dt(fallback.get("updated_at"))

    db.add(
        Project(
            id=project_id,
            name=name,
            number=number,
            address=address,
            created_at=created_at,
            updated_at=updated_at,
        )
    )


def upsert_project(db: Session, p: dict):
    obj = db.get(Project, p["id"]) or Project(id=p["id"], name=p.get("name", "") or "Unknown Project")
    obj.name = p.get("name") or obj.name
    obj.number = p.get("number")
    obj.address = p.get("address")
    obj.created_at = _dt(p.get("created_at"))
    obj.updated_at = _dt(p.get("updated_at"))
    db.add(obj)


def upsert_daily_log(db: Session, row: dict):
    dl = row["daily_log"]

    # Ensure referenced project exists (use row["project"] as fallback metadata if present)
    fallback_project = row.get("project") if isinstance(row.get("project"), dict) else None
    ensure_project(db, dl["project_id"], fallback=fallback_project)

    # Optional: detect mismatches to help debug app export consistency
    if fallback_project and fallback_project.get("id") and fallback_project.get("id") != dl["project_id"]:
        # Create the fallback project too, so both IDs exist
        ensure_project(db, fallback_project["id"], fallback=fallback_project)

    obj = db.get(DailyLog, dl["id"]) or DailyLog(id=dl["id"], project_id=dl["project_id"], date=dl["date"])
    obj.project_id = dl["project_id"]
    obj.date = dl["date"]
    obj.prepared_by = dl.get("prepared_by")
    obj.weather = dl.get("weather")
    obj.daily_totals_workers = dl.get("daily_totals_workers")
    obj.daily_totals_hours = dl.get("daily_totals_hours")
    obj.daily_summary_notes = dl.get("daily_summary_notes")
    obj.status = dl.get("status")
    obj.created_at = _dt(dl.get("created_at"))
    obj.updated_at = _dt(dl.get("updated_at"))
    db.add(obj)


def upsert_event(db: Session, row: dict):
    ev = row["event"]

    fallback_project = row.get("project") if isinstance(row.get("project"), dict) else None
    ensure_project(db, ev["project_id"], fallback=fallback_project)
    print("DEBUG ensure_project called for", dl["project_id"])

    obj = db.get(Event, ev["id"]) or Event(
        id=ev["id"],
        project_id=ev["project_id"],
        linked_daily_log_id=ev.get("linked_daily_log_id"),
    )
    obj.project_id = ev["project_id"]
    obj.linked_daily_log_id = ev.get("linked_daily_log_id")
    obj.created_at = _dt(ev.get("created_at"))
    obj.event_type = ev.get("event_type")
    obj.severity = ev.get("severity")
    obj.title = ev.get("title")
    obj.notes = ev.get("notes")
    obj.location = ev.get("location")
    obj.trade_vendor = ev.get("trade_vendor")
    obj.status = ev.get("status")
    obj.transcript_text = ev.get("transcript_text")
    db.add(obj)


def ingest_export_json(db: Session, export_bytes: bytes, filename: str) -> dict:
    save_export_json_bytes(filename, export_bytes)
    data = json.loads(export_bytes.decode("utf-8"))

    # 1) Upsert explicit projects first (if present)
    for p in data.get("projects", []):
        upsert_project(db, p)

    # 2) Daily logs (ensure projects exist even if missing from projects[])
    for row in data.get("daily_logs", []):
        # Upsert nested project object if it exists
        if isinstance(row.get("project"), dict) and row["project"].get("id"):
            upsert_project(db, row["project"])
        upsert_daily_log(db, row)

    # 3) Events
    for row in data.get("events", []):
        if isinstance(row.get("project"), dict) and row["project"].get("id"):
            upsert_project(db, row["project"])
        upsert_event(db, row)

    db.commit()

    enhanced_files = []
    if isinstance(data.get("enhanced_audio_manifest"), dict) and "audio_files" in data["enhanced_audio_manifest"]:
        enhanced_files = data["enhanced_audio_manifest"]["audio_files"]

    return {
        "projects_upserted": len(data.get("projects", [])),
        "daily_logs_upserted": len(data.get("daily_logs", [])),
        "events_upserted": len(data.get("events", [])),
        "enhanced_audio_refs_found": len(enhanced_files),
    }


def upsert_audio_blob_and_enqueue(db: Session, meta: dict, storage_path: str):
    audio_file_id = meta["audio_file_id"]
    obj = db.get(AudioBlob, audio_file_id) or AudioBlob(
        id=audio_file_id,
        entity_type=meta["entity_type"],
        entity_id=meta["entity_id"],
        section_key=meta.get("section_key", ""),
        project_id=meta.get("project_id"),
        daily_log_id=meta.get("daily_log_id"),
        filename=meta["filename"],
        mime_type=meta.get("mime_type"),
        duration_seconds=meta.get("duration_seconds"),
        storage_path=storage_path,
        created_at=_dt(meta.get("created_at")),
    )

    obj.entity_type = meta["entity_type"]
    obj.entity_id = meta["entity_id"]
    obj.section_key = meta.get("section_key", "")
    obj.project_id = meta.get("project_id")
    obj.daily_log_id = meta.get("daily_log_id")
    obj.filename = meta["filename"]
    obj.mime_type = meta.get("mime_type")
    obj.duration_seconds = meta.get("duration_seconds")
    obj.storage_path = storage_path
    obj.created_at = _dt(meta.get("created_at"))
    db.add(obj)
    db.commit()

    enqueue_transcription(db, audio_file_id=audio_file_id)
