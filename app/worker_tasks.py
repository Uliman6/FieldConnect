import asyncio
from datetime import datetime
from sqlalchemy.orm import Session
from .db import SessionLocal
from .models import ProcessingJob, AudioBlob, Event
from .services.transcription import transcribe_audio

def transcribe_audio_task(processing_job_id: int):
    db: Session = SessionLocal()
    try:
        job = db.get(ProcessingJob, processing_job_id)
        if not job:
            return
        job.status = "running"
        job.updated_at = datetime.utcnow()
        db.commit()

        audio_file_id = job.payload.get("audio_file_id")
        blob = db.get(AudioBlob, audio_file_id)
        if not blob:
            job.status = "failed"
            job.error = f"AudioBlob not found: {audio_file_id}"
            job.updated_at = datetime.utcnow()
            db.commit()
            return

        res = asyncio.run(transcribe_audio(blob.storage_path, blob.mime_type))

        if res.get("status") == "needs_config":
            job.status = "needs_config"
            job.result = res
            job.updated_at = datetime.utcnow()
            db.commit()
            return

        if res.get("status") != "ok":
            job.status = "failed"
            job.result = res
            job.updated_at = datetime.utcnow()
            db.commit()
            return

        text = res.get("text")

        if blob.entity_type == "event":
            ev = db.get(Event, blob.entity_id)
            if ev:
                ev.transcript_text = text
                db.add(ev)

        job.status = "done"
        job.result = res
        job.updated_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()
