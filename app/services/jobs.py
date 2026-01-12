from datetime import datetime
from rq import Queue
from redis import Redis
from sqlalchemy.orm import Session
from ..config import settings
from ..models import ProcessingJob

def get_queue():
    redis = Redis.from_url(settings.redis_url)
    return Queue("lessons", connection=redis, default_timeout=900)

def enqueue_transcription(db: Session, audio_file_id: str) -> int:
    job = ProcessingJob(
        job_type="transcribe_audio",
        status="queued",
        payload={"audio_file_id": audio_file_id},
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(job)
    db.commit()
    q = get_queue()
    q.enqueue("app.worker_tasks.transcribe_audio_task", job.id)
    return job.id
