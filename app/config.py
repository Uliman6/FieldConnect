import os
from pydantic import BaseModel

class Settings(BaseModel):
    database_url: str = os.environ.get("DATABASE_URL", "postgresql+psycopg://lessons:lessons@localhost:5432/lessons")
    redis_url: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    blob_root: str = os.environ.get("BLOB_ROOT", "./data/blobs")
    export_root: str = os.environ.get("EXPORT_ROOT", "./data/exports")

    openai_api_key: str | None = os.environ.get("OPENAI_API_KEY")
    openai_transcribe_model: str = os.environ.get("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe")
    openai_chat_model: str = os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o-mini")

settings = Settings()
