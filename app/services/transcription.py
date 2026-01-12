from __future__ import annotations
from ..config import settings

async def transcribe_audio(path: str, mime_type: str | None = None) -> dict:
    """
    Stub transcription service.

    Implement your provider call here later.
    """
    if not settings.openai_api_key:
        return {"status": "needs_config", "text": None, "provider": None, "meta": {"hint": "Set OPENAI_API_KEY"}}
    return {"status": "needs_config", "text": None, "provider": "openai", "meta": {"hint": "Implement provider call in app/services/transcription.py"}}
