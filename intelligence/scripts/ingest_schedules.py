"""
Ingest project schedules from PDF files and assign phases to items.
"""

import asyncio
import sys
from pathlib import Path
from datetime import date

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import db
from ingestion.schedule_pdf_parser import (
    extract_schedule_from_pdf,
    infer_phase_from_section_hierarchy,
    get_phase_summary,
    get_project_date_range
)
from ingestion.phase_mapper import get_phase_from_schedule

# Company ID for demo data
COMPANY_ID = "00000000-0000-0000-0000-000000000001"


async def store_project_schedule(project_name: str, activities: list[dict]):
    """Store schedule activities in the database."""
    # Delete existing schedule for this project
    await db.execute(
        "DELETE FROM intelligence.project_schedules WHERE project_id = $1 AND company_id = $2",
        project_name, COMPANY_ID
    )

    # Insert new activities
    count = 0
    for activity in activities:
        try:
            await db.execute("""
                INSERT INTO intelligence.project_schedules (
                    project_id, company_id, activity_id, activity_name,
                    phase, start_date, end_date, duration_days
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
                project_name,
                COMPANY_ID,
                activity.get("activity_id", ""),
                activity.get("activity_name", ""),
                activity.get("phase"),
                activity.get("start_date"),
                activity.get("end_date"),
                activity.get("duration_days")
            )
            count += 1
        except Exception as e:
            print(f"  Error storing activity {activity.get('activity_id')}: {e}")

    return count


async def assign_phases_to_items(project_name: str, schedule: list[dict]):
    """Assign phases to items based on their dates and the project schedule."""
    # Get items for this project that don't have a phase or have dates
    items = await db.fetch("""
        SELECT id, item_date, raw_text, project_phase
        FROM intelligence.items
        WHERE source_project_name = $1 AND company_id = $2
    """, project_name, COMPANY_ID)

    if not items:
        print(f"  No items found for project {project_name}")
        return 0

    updated = 0
    phase_counts = {}

    for item in items:
        item_date = item.get("item_date")
        if not item_date:
            continue

        # Get phase from schedule
        result = get_phase_from_schedule(item_date, schedule)

        if result and result.get("phase"):
            phase = result["phase"]

            # Update item
            await db.execute("""
                UPDATE intelligence.items
                SET project_phase = $1
                WHERE id = $2
            """, phase, item["id"])

            updated += 1
            phase_counts[phase] = phase_counts.get(phase, 0) + 1

    return updated, phase_counts


async def main():
    data_folder = Path(r"C:\Users\uluck\LL Data")

    print("Initializing database...")
    await db.init_db()

    # Find all schedule PDFs
    schedule_files = {}
    for project_folder in data_folder.iterdir():
        if not project_folder.is_dir():
            continue

        schedule_folder = project_folder / "Schedule"
        if not schedule_folder.exists():
            continue

        for pdf_file in schedule_folder.glob("*.pdf"):
            schedule_files[project_folder.name] = pdf_file
            break  # Use first PDF found

    print(f"\nFound {len(schedule_files)} schedule files:")
    for project, path in schedule_files.items():
        print(f"  - {project}: {path.name}")

    # Parse and store each schedule
    print("\n" + "=" * 60)
    print("Parsing and storing schedules...")
    print("=" * 60)

    all_schedules = {}

    for project_name, pdf_path in schedule_files.items():
        print(f"\nProcessing: {project_name}")
        print(f"  File: {pdf_path.name}")

        # Parse PDF
        activities = extract_schedule_from_pdf(str(pdf_path))
        activities = infer_phase_from_section_hierarchy(activities)

        print(f"  Extracted {len(activities)} activities")

        if not activities:
            print("  WARNING: No activities extracted!")
            continue

        # Get date range
        date_range = get_project_date_range(activities)
        if date_range:
            print(f"  Date range: {date_range[0]} to {date_range[1]}")

        # Show phase summary
        summary = get_phase_summary(activities)
        phases_with_data = [p for p in summary if summary[p]["start_date"]]
        print(f"  Phases mapped: {len(phases_with_data)}")
        for phase in list(summary.keys())[:5]:
            data = summary[phase]
            print(f"    - {phase}: {data['activity_count']} activities")

        # Store in database
        stored = await store_project_schedule(project_name, activities)
        print(f"  Stored {stored} activities in database")

        all_schedules[project_name] = activities

    # Assign phases to items
    print("\n" + "=" * 60)
    print("Assigning phases to items based on dates...")
    print("=" * 60)

    total_updated = 0

    for project_name, schedule in all_schedules.items():
        print(f"\nProject: {project_name}")

        updated, phase_counts = await assign_phases_to_items(project_name, schedule)
        total_updated += updated

        print(f"  Updated {updated} items")
        if phase_counts:
            for phase, count in sorted(phase_counts.items(), key=lambda x: -x[1])[:5]:
                print(f"    - {phase}: {count} items")

    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Schedules processed: {len(all_schedules)}")
    print(f"Total items updated with phases: {total_updated}")

    # Show overall phase distribution
    phase_dist = await db.fetch("""
        SELECT project_phase, COUNT(*) as count
        FROM intelligence.items
        WHERE company_id = $1 AND project_phase IS NOT NULL
        GROUP BY project_phase
        ORDER BY count DESC
    """, COMPANY_ID)

    print("\nOverall phase distribution:")
    for row in phase_dist:
        print(f"  {row['project_phase']}: {row['count']} items")


if __name__ == "__main__":
    asyncio.run(main())
