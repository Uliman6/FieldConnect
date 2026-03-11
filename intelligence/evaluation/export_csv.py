"""
Export labeling tasks to CSV for easier labeling in Excel/Google Sheets.

Usage:
    python -m evaluation.export_csv

This creates a CSV file you can open in Excel, add labels, and import back.
"""

import csv
import json
from pathlib import Path


def export_to_csv():
    """Export labeling tasks to CSV format."""
    data_file = Path(__file__).parent / "data" / "labeling_tasks.json"

    if not data_file.exists():
        print(f"No labeling tasks found. Run `python -m evaluation.run generate` first.")
        return

    with open(data_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Create CSV
    csv_file = Path(__file__).parent / "data" / "labeling_tasks.csv"

    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)

        # Header
        writer.writerow([
            "task_id",
            "query_ref",
            "query_text",
            "query_project",
            "query_trade",
            "candidate_id",
            "candidate_ref",
            "candidate_text",
            "candidate_project",
            "candidate_trade",
            "candidate_resolution",
            "relevance",  # YOUR INPUT: highly_relevant, somewhat_relevant, not_relevant
            "reasoning",  # YOUR INPUT: optional explanation
        ])

        for task in data.get("tasks", []):
            query = task["query"]

            for candidate in task.get("candidates", []):
                writer.writerow([
                    task["task_id"],
                    query.get("ref", ""),
                    query.get("text", "")[:200],  # Truncate for CSV readability
                    query.get("project", ""),
                    query.get("trade", ""),
                    candidate.get("id", ""),
                    candidate.get("ref", ""),
                    candidate.get("text", "")[:200],
                    candidate.get("project", ""),
                    candidate.get("trade", ""),
                    candidate.get("resolution", "")[:100],
                    candidate.get("relevance", ""),  # To be filled
                    candidate.get("reasoning", ""),  # To be filled
                ])

    print(f"Exported to: {csv_file}")
    print("""
Next steps:
1. Open the CSV in Excel or Google Sheets
2. Fill in the 'relevance' column with one of:
   - highly_relevant
   - somewhat_relevant
   - not_relevant
3. Optionally add reasoning
4. Save as CSV
5. Run: python -m evaluation.import_csv
    """)


def import_from_csv():
    """Import labeled CSV back into JSON format."""
    csv_file = Path(__file__).parent / "data" / "labeling_tasks.csv"
    json_file = Path(__file__).parent / "data" / "labeling_tasks.json"

    if not csv_file.exists():
        print(f"No CSV file found at {csv_file}")
        return

    if not json_file.exists():
        print(f"No JSON file found at {json_file}")
        return

    # Load existing JSON
    with open(json_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Build lookup: task_id -> candidate_id -> row
    csv_labels = {}
    with open(csv_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            task_id = row.get("task_id")
            candidate_id = row.get("candidate_id")
            relevance = row.get("relevance", "").strip().lower()
            reasoning = row.get("reasoning", "").strip()

            if task_id and candidate_id and relevance:
                if task_id not in csv_labels:
                    csv_labels[task_id] = {}
                csv_labels[task_id][candidate_id] = {
                    "relevance": relevance,
                    "reasoning": reasoning if reasoning else None,
                }

    # Update JSON
    updated = 0
    for task in data.get("tasks", []):
        task_id = task.get("task_id")
        if task_id in csv_labels:
            for candidate in task.get("candidates", []):
                cand_id = candidate.get("id")
                if cand_id in csv_labels[task_id]:
                    label_data = csv_labels[task_id][cand_id]
                    candidate["relevance"] = label_data["relevance"]
                    candidate["reasoning"] = label_data["reasoning"]
                    updated += 1

    # Save updated JSON
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"Updated {updated} labels in {json_file}")
    print("\nNow run: python -m evaluation.run evaluate")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "import":
        import_from_csv()
    else:
        export_to_csv()
