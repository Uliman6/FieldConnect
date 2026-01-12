import argparse, json, os
import httpx

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True, help="API base URL, e.g. http://localhost:8000")
    ap.add_argument("--manifest", required=True, help="Path to manifest.json")
    ap.add_argument("--audio-dir", required=True, help="Folder containing the audio files referenced by manifest filenames")
    args = ap.parse_args()

    manifest = json.load(open(args.manifest, "r", encoding="utf-8"))
    audio_files = manifest.get("audio_files", [])

    url = args.api.rstrip("/") + "/media/upload"

    uploaded = 0
    skipped = 0
    with httpx.Client(timeout=300) as client:
        for m in audio_files:
            fn = m["filename"]
            path = os.path.join(args.audio_dir, fn)
            if not os.path.exists(path):
                print(f"Missing file: {path}")
                skipped += 1
                continue

            data = {
                "entity_type": m.get("entity_type"),
                "entity_id": m.get("entity_id"),
                "section_key": m.get("section_key"),
                "project_id": m.get("project_id"),
                "daily_log_id": m.get("daily_log_id"),
                "created_at": m.get("created_at"),
                "audio_file_id": m.get("audio_file_id"),
                "filename": m.get("filename"),
                "mime_type": m.get("mime_type"),
                "duration_seconds": str(m.get("duration_seconds") or ""),
            }
            # Remove empty strings to avoid FastAPI validation issues
            data = {k:v for k,v in data.items() if v not in (None, "")}

            with open(path, "rb") as f:
                files = {"file": (fn, f, m.get("mime_type") or "application/octet-stream")}
                r = client.post(url, data=data, files=files)
                r.raise_for_status()
                uploaded += 1
                print(r.json())

    print({"uploaded": uploaded, "skipped": skipped})

if __name__ == "__main__":
    main()
