import os
from datetime import datetime
from pathlib import Path
from ..config import settings

def ensure_dirs():
    Path(settings.blob_root).mkdir(parents=True, exist_ok=True)
    Path(settings.export_root).mkdir(parents=True, exist_ok=True)

def save_export_json_bytes(filename: str, data: bytes) -> str:
    ensure_dirs()
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out = os.path.join(settings.export_root, f"{ts}_{filename}")
    with open(out, "wb") as f:
        f.write(data)
    return out

def save_audio_bytes(filename: str, data: bytes) -> str:
    ensure_dirs()
    safe = filename.replace("/", "_")
    out = os.path.join(settings.blob_root, safe)
    with open(out, "wb") as f:
        f.write(data)
    return out
