from sqlalchemy import String, DateTime, Integer, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from .db import Base

class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    number: Mapped[str | None] = mapped_column(String, nullable=True)
    address: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class DailyLog(Base):
    __tablename__ = "daily_logs"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id"), index=True)
    date: Mapped[str] = mapped_column(String, index=True)
    prepared_by: Mapped[str | None] = mapped_column(String, nullable=True)
    weather: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    daily_totals_workers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    daily_totals_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    daily_summary_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class Event(Base):
    __tablename__ = "events"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id"), index=True)
    linked_daily_log_id: Mapped[str | None] = mapped_column(String, ForeignKey("daily_logs.id"), nullable=True, index=True)

    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    event_type: Mapped[str | None] = mapped_column(String, nullable=True)
    severity: Mapped[str | None] = mapped_column(String, nullable=True)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    trade_vendor: Mapped[str | None] = mapped_column(String, nullable=True)

    status: Mapped[str | None] = mapped_column(String, nullable=True)
    transcript_text: Mapped[str | None] = mapped_column(Text, nullable=True)

class AudioBlob(Base):
    __tablename__ = "audio_blobs"
    id: Mapped[str] = mapped_column(String, primary_key=True)  # audio_file_id
    entity_type: Mapped[str] = mapped_column(String, index=True)
    entity_id: Mapped[str] = mapped_column(String, index=True)
    section_key: Mapped[str] = mapped_column(String, index=True)
    project_id: Mapped[str | None] = mapped_column(String, ForeignKey("projects.id"), nullable=True, index=True)
    daily_log_id: Mapped[str | None] = mapped_column(String, ForeignKey("daily_logs.id"), nullable=True, index=True)
    filename: Mapped[str] = mapped_column(String)
    mime_type: Mapped[str | None] = mapped_column(String, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    storage_path: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class ProcessingJob(Base):
    __tablename__ = "processing_jobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_type: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String, index=True)  # queued/running/done/failed/needs_config
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
