import argparse, os, sys
import httpx

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True, help="API base URL, e.g. http://localhost:8000")
    ap.add_argument("--export", required=True, help="Path to export JSON file")
    ap.add_argument("--manifest", help="Path to manifest.json (optional)")
    ap.add_argument("--zip", dest="zip_path", help="Path to audio ZIP (optional)")
    args = ap.parse_args()

    files = {
        "export_json": (os.path.basename(args.export), open(args.export, "rb"), "application/json"),
    }
    if args.manifest:
        files["manifest_json"] = (os.path.basename(args.manifest), open(args.manifest, "rb"), "application/json")
    if args.zip_path:
        files["audio_zip"] = (os.path.basename(args.zip_path), open(args.zip_path, "rb"), "application/zip")

    url = args.api.rstrip("/") + "/ingest/bundle"
    with httpx.Client(timeout=300) as client:
        r = client.post(url, files=files)
        r.raise_for_status()
        print(r.json())

if __name__ == "__main__":
    main()
