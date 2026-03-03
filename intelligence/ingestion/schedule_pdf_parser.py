"""
PDF Schedule Parser for FieldConnect Intelligence Service.

Parses construction schedule PDFs (P6 exports, Gantt charts) and extracts
activity timelines with automatic phase mapping.
"""

import re
from datetime import datetime, date
from pathlib import Path
from typing import Optional
import logging

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

from ingestion.phase_mapper import map_activity_to_phase

logger = logging.getLogger(__name__)


def parse_schedule_date(date_str: str) -> Optional[date]:
    """
    Parse date strings from P6 schedule exports.

    Formats:
    - "09/03/24 08:00 AM A" (with status indicator)
    - "11/06/25 05:00 PM"
    - "09/03/24 08:00 AM"
    - "10-Nov-25 A" (DD-MMM-YY format)
    - "10-Nov-25"
    """
    if not date_str or not isinstance(date_str, str):
        return None

    date_str = date_str.strip()

    # Remove trailing status indicators (A, *, etc.)
    date_str = re.sub(r'\s*[A\*]+\s*$', '', date_str)

    # Try various formats
    formats = [
        "%m/%d/%y %I:%M %p",   # 09/03/24 08:00 AM
        "%m/%d/%Y %I:%M %p",   # 09/03/2024 08:00 AM
        "%d-%b-%y",            # 10-Nov-25
        "%d-%b-%Y",            # 10-Nov-2025
        "%d-%B-%y",            # 10-November-25
        "%d-%B-%Y",            # 10-November-2025
        "%m/%d/%y",            # 09/03/24
        "%m/%d/%Y",            # 09/03/2024
        "%Y-%m-%d",            # 2024-09-03
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except ValueError:
            continue

    return None


def extract_schedule_from_pdf(pdf_path: str) -> list[dict]:
    """
    Extract schedule activities from a PDF file.

    Handles P6-style exports with columns:
    Activity ID | Activity Name | Duration | Start | Finish

    The PDF text is often split across multiple lines per row,
    so we need to reconstruct rows by pattern matching.

    Returns list of activity dicts.
    """
    if fitz is None:
        logger.error("PyMuPDF not installed. Install with: pip install pymupdf")
        return []

    activities = []

    try:
        doc = fitz.open(pdf_path)

        for page_num, page in enumerate(doc):
            text = page.get_text()
            lines = [l.strip() for l in text.split('\n') if l.strip()]

            # Parse using multi-line reconstruction
            page_activities = parse_multiline_schedule(lines)
            activities.extend(page_activities)

        doc.close()

    except Exception as e:
        logger.error(f"Error reading PDF {pdf_path}: {e}")
        return []

    # Deduplicate by activity_id
    seen_ids = set()
    unique_activities = []
    for activity in activities:
        aid = activity.get("activity_id", "")
        if aid and aid not in seen_ids:
            seen_ids.add(aid)
            unique_activities.append(activity)
        elif not aid:
            unique_activities.append(activity)

    logger.info(f"Extracted {len(unique_activities)} activities from {pdf_path}")
    return unique_activities


def parse_multiline_schedule(lines: list[str]) -> list[dict]:
    """
    Parse schedule data from lines where each column value is on a separate line.

    Pattern observed:
    - Activity ID (e.g., "MILE-9040", "L1-RW-1150", "ROOF.DM1-1090")
    - Activity Name (e.g., "PG&E/SVP Power On")
    - Duration number(s)
    - Date(s) in MM/DD/YY HH:MM AM/PM format or DD-MMM-YY format
    """
    activities = []
    i = 0

    # Date patterns - support both formats
    # MM/DD/YY HH:MM AM/PM format
    date_pattern1 = re.compile(r'^(\d{1,2}/\d{1,2}/\d{2,4}\s+\d{1,2}:\d{2}\s*[AP]M)', re.IGNORECASE)
    # DD-MMM-YY format (e.g., "10-Nov-25", "10-Nov-25 A")
    date_pattern2 = re.compile(r'^(\d{1,2}-[A-Za-z]{3}-\d{2,4})', re.IGNORECASE)

    def is_date_line(line):
        return date_pattern1.match(line) or date_pattern2.match(line)

    def extract_date(line):
        m1 = date_pattern1.match(line)
        if m1:
            return m1.group(1)
        m2 = date_pattern2.match(line)
        if m2:
            return m2.group(1)
        return None

    # Activity ID patterns (alphanumeric with dashes/dots)
    activity_id_pattern = re.compile(r'^([A-Za-z]{1,10}[\-\.]?[A-Za-z0-9\-\.]+)$')

    # Skip patterns
    skip_words = {'Activity', 'ID', 'Name', 'Original', 'Duration', 'Remaining',
                  'Start', 'Finish', 'Page', 'Print', 'Date', 'Baseline', 'TASK',
                  'filter', 'Standard', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
                  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', '2025', '2024', '2026',
                  'OD', 'RD', 'Actual', 'Work', 'Milestone', 'Level', 'Effort',
                  'Critical', 'Data'}

    # Combined duration + date pattern for both formats
    combined_pattern1 = re.compile(r'^(\d+)\s+(\d{1,2}/\d{1,2}/\d{2,4}\s+\d{1,2}:\d{2}\s*[AP]M)', re.IGNORECASE)
    combined_pattern2 = re.compile(r'^(\d+)\s+(\d{1,2}-[A-Za-z]{3}-\d{2,4})', re.IGNORECASE)

    def extract_combined_date(line):
        m1 = combined_pattern1.match(line)
        if m1:
            return int(m1.group(1)), m1.group(2)
        m2 = combined_pattern2.match(line)
        if m2:
            return int(m2.group(1)), m2.group(2)
        return None, None

    while i < len(lines):
        line = lines[i]

        # Skip header/footer lines
        if line in skip_words or any(line.startswith(w) for w in ['Page ', 'Print ', 'Data ', 'D0-', 'Coresite', 'DPR ']):
            i += 1
            continue

        # Check if this looks like an activity ID
        id_match = activity_id_pattern.match(line)

        if id_match:
            activity_id = id_match.group(1)

            # Look ahead for activity name, durations, and dates
            activity_name = None
            start_date = None
            end_date = None
            duration = None

            j = i + 1
            dates_found = []

            # Collect next several lines until we find another activity ID or enough data
            while j < min(i + 10, len(lines)):
                next_line = lines[j]

                # Skip if it's another activity ID (we've gone too far)
                if activity_id_pattern.match(next_line) and j > i + 1:
                    break

                # Check for date (either format)
                date_str = extract_date(next_line)
                if date_str:
                    parsed_date = parse_schedule_date(date_str)
                    if parsed_date:
                        dates_found.append(parsed_date)
                    j += 1
                    continue

                # Check for combined "remaining_duration date" pattern
                dur, date_str = extract_combined_date(next_line)
                if date_str:
                    parsed_date = parse_schedule_date(date_str)
                    if parsed_date:
                        dates_found.append(parsed_date)
                    j += 1
                    continue

                # Check for duration number
                if re.match(r'^\d+$', next_line):
                    if duration is None:
                        duration = int(next_line)
                    j += 1
                    continue

                # Otherwise it's likely the activity name
                if activity_name is None and next_line not in skip_words:
                    # Make sure it's not just a number or date
                    if not re.match(r'^\d+$', next_line) and not is_date_line(next_line):
                        activity_name = next_line
                        j += 1
                        continue

                j += 1

            # We have an activity if we found a name and at least one date
            if activity_name and dates_found:
                if len(dates_found) >= 2:
                    start_date = dates_found[0]
                    end_date = dates_found[1]
                else:
                    start_date = dates_found[0]
                    end_date = dates_found[0]

                phase = map_activity_to_phase(activity_name)

                activities.append({
                    "activity_id": activity_id,
                    "activity_name": activity_name,
                    "start_date": start_date,
                    "end_date": end_date,
                    "duration_days": duration,
                    "phase": phase
                })

            i = j
        else:
            # Check if this is a section header (like "Preconstruction", "Construction")
            # These often appear twice in a row in the PDF
            if i + 1 < len(lines) and lines[i] == lines[i + 1]:
                section_name = line

                # Look for dates after section header
                j = i + 2
                dates_found = []
                duration = None

                while j < min(i + 8, len(lines)):
                    next_line = lines[j]

                    date_str = extract_date(next_line)
                    if date_str:
                        parsed_date = parse_schedule_date(date_str)
                        if parsed_date:
                            dates_found.append(parsed_date)

                    dur, date_str = extract_combined_date(next_line)
                    if date_str:
                        if duration is None and dur:
                            duration = dur
                        parsed_date = parse_schedule_date(date_str)
                        if parsed_date:
                            dates_found.append(parsed_date)

                    if re.match(r'^\d+$', next_line) and duration is None:
                        duration = int(next_line)

                    j += 1

                if dates_found:
                    phase = map_activity_to_phase(section_name)

                    activities.append({
                        "activity_id": section_name.upper().replace(' ', '_')[:20],
                        "activity_name": section_name,
                        "start_date": dates_found[0],
                        "end_date": dates_found[-1] if len(dates_found) > 1 else dates_found[0],
                        "duration_days": duration,
                        "phase": phase,
                        "is_summary": True
                    })

                i = j
            else:
                i += 1

    return activities


def parse_activity_line(line: str) -> Optional[dict]:
    """
    Parse a single line from P6 schedule export.

    Expected patterns:
    - "MILE-9040 PG&E/SVP Power On 0 0 09/08/25 05:00 PM"
    - "L1-RW-1150 Trim Wall Devices 5 7 08/14/25 08:00 AM A 09/10/25 05:00 PM"
    """
    line = line.strip()
    if not line or len(line) < 20:
        return None

    # Skip header lines and summary lines
    skip_patterns = [
        r'^Activity\s+ID',
        r'^Duration$',
        r'^Remaining$',
        r'^Start$',
        r'^Finish$',
        r'^Page\s+\d+',
        r'^Print\s+Date',
        r'^Data\s+Date',
        r'^Baseline',
        r'^TASK\s+filter',
        r'^\d{4}$',  # Year only
        r'^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$',
    ]

    for pattern in skip_patterns:
        if re.search(pattern, line, re.IGNORECASE):
            return None

    # Pattern 1: Activity ID at start followed by name and dates
    # Examples:
    # "MILE-9040 PG&E/SVP Power On 0 0 09/08/25 05:00 PM"
    # "L1-RW-1150 Trim Wall Devices 5 7 08/14/25 08:00 AM A 09/10/25 05:00 PM"

    # Look for date patterns (MM/DD/YY HH:MM AM/PM)
    date_pattern = r'(\d{1,2}/\d{1,2}/\d{2,4}\s+\d{1,2}:\d{2}\s*[AP]M)'
    date_matches = list(re.finditer(date_pattern, line, re.IGNORECASE))

    if len(date_matches) >= 1:
        # Get the position of first date
        first_date_pos = date_matches[0].start()

        # Everything before dates is activity info
        activity_info = line[:first_date_pos].strip()

        # Parse dates
        start_date = None
        end_date = None

        if len(date_matches) >= 2:
            start_date = parse_schedule_date(date_matches[0].group(1))
            end_date = parse_schedule_date(date_matches[1].group(1))
        elif len(date_matches) == 1:
            # Single date - could be start or milestone
            start_date = parse_schedule_date(date_matches[0].group(1))
            end_date = start_date

        # Parse activity_info to get ID and name
        # Pattern: "ID NAME DURATION REMAINING_DURATION"
        # Look for activity ID pattern at start
        id_match = re.match(r'^([A-Za-z0-9\-\.]+)\s+', activity_info)

        if id_match:
            activity_id = id_match.group(1)
            rest = activity_info[id_match.end():].strip()

            # Try to extract duration numbers from end
            duration_match = re.search(r'\s+(\d+)\s+(\d+)\s*$', rest)
            if duration_match:
                activity_name = rest[:duration_match.start()].strip()
                duration = int(duration_match.group(1))
            else:
                activity_name = rest
                duration = None

            if activity_name and start_date:
                # Map to phase based on activity name
                phase = map_activity_to_phase(activity_name)

                return {
                    "activity_id": activity_id,
                    "activity_name": activity_name,
                    "start_date": start_date,
                    "end_date": end_date,
                    "duration_days": duration,
                    "phase": phase
                }

    # Pattern 2: Summary/Section headers (no activity ID)
    # Examples: "Preconstruction 126 9 03/03/25..."
    section_match = re.match(r'^([A-Za-z][A-Za-z\s&/]+?)\s+(\d+)\s+(\d+)\s+', line)
    if section_match and date_matches:
        section_name = section_match.group(1).strip()

        # Skip if it looks like a single word that's part of something else
        if len(section_name) > 3 and ' ' not in section_name or len(section_name) > 10:
            start_date = parse_schedule_date(date_matches[0].group(1)) if date_matches else None
            end_date = parse_schedule_date(date_matches[-1].group(1)) if len(date_matches) > 1 else start_date

            phase = map_activity_to_phase(section_name)

            return {
                "activity_id": section_name.upper().replace(' ', '_')[:20],
                "activity_name": section_name,
                "start_date": start_date,
                "end_date": end_date,
                "duration_days": int(section_match.group(2)) if section_match.group(2) else None,
                "phase": phase,
                "is_summary": True
            }

    return None


def infer_phase_from_section_hierarchy(activities: list[dict]) -> list[dict]:
    """
    Improve phase mapping by using section hierarchy.

    If an activity doesn't have a phase but is under a section that does,
    inherit the phase from the parent section.
    """
    current_section_phase = None

    for activity in activities:
        if activity.get("is_summary"):
            # This is a section header
            if activity.get("phase"):
                current_section_phase = activity["phase"]
        else:
            # Regular activity
            if not activity.get("phase") and current_section_phase:
                activity["phase"] = current_section_phase

    return activities


def parse_all_project_schedules(data_folder: str) -> dict[str, list[dict]]:
    """
    Find and parse all schedule PDFs in the data folder.

    Returns dict mapping project_name to list of activities.
    """
    data_path = Path(data_folder)
    results = {}

    # Find all Schedule folders
    for project_folder in data_path.iterdir():
        if not project_folder.is_dir():
            continue

        schedule_folder = project_folder / "Schedule"
        if not schedule_folder.exists():
            continue

        project_name = project_folder.name

        # Find PDF files in Schedule folder
        for pdf_file in schedule_folder.glob("*.pdf"):
            logger.info(f"Parsing schedule: {pdf_file.name} for project {project_name}")

            activities = extract_schedule_from_pdf(str(pdf_file))
            activities = infer_phase_from_section_hierarchy(activities)

            if activities:
                results[project_name] = activities
                break  # Use first schedule found per project

    return results


def get_project_date_range(activities: list[dict]) -> Optional[tuple[date, date]]:
    """Get overall date range from activities."""
    starts = [a["start_date"] for a in activities if a.get("start_date")]
    ends = [a["end_date"] for a in activities if a.get("end_date")]

    if not starts:
        return None

    return (min(starts), max(ends) if ends else max(starts))


def get_phase_summary(activities: list[dict]) -> dict:
    """Get summary of phases in the schedule."""
    phase_dates = {}

    for activity in activities:
        phase = activity.get("phase")
        if not phase:
            continue

        start = activity.get("start_date")
        end = activity.get("end_date")

        if phase not in phase_dates:
            phase_dates[phase] = {"starts": [], "ends": [], "count": 0}

        if start:
            phase_dates[phase]["starts"].append(start)
        if end:
            phase_dates[phase]["ends"].append(end)
        phase_dates[phase]["count"] += 1

    # Calculate date ranges per phase
    summary = {}
    for phase, data in phase_dates.items():
        summary[phase] = {
            "activity_count": data["count"],
            "start_date": min(data["starts"]).isoformat() if data["starts"] else None,
            "end_date": max(data["ends"]).isoformat() if data["ends"] else None
        }

    return summary


# CLI for testing
if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) < 2:
        print("Usage: python schedule_pdf_parser.py <pdf_path_or_data_folder>")
        sys.exit(1)

    path = sys.argv[1]

    if path.endswith(".pdf"):
        # Single PDF
        activities = extract_schedule_from_pdf(path)
        activities = infer_phase_from_section_hierarchy(activities)

        print(f"\nExtracted {len(activities)} activities:\n")
        for a in activities[:20]:
            phase = a.get("phase", "?")
            print(f"  [{phase:15}] {a.get('activity_id', ''):15} {a.get('activity_name', '')[:40]}")
            print(f"                    {a.get('start_date')} -> {a.get('end_date')}")

        if len(activities) > 20:
            print(f"\n  ... and {len(activities) - 20} more")

        print(f"\nPhase summary:")
        for phase, data in get_phase_summary(activities).items():
            print(f"  {phase}: {data['activity_count']} activities, {data['start_date']} to {data['end_date']}")
    else:
        # Data folder
        results = parse_all_project_schedules(path)

        print(f"\nParsed schedules for {len(results)} projects:\n")
        for project, activities in results.items():
            date_range = get_project_date_range(activities)
            print(f"  {project}: {len(activities)} activities")
            if date_range:
                print(f"    Date range: {date_range[0]} to {date_range[1]}")

            summary = get_phase_summary(activities)
            for phase, data in summary.items():
                print(f"    - {phase}: {data['activity_count']} activities")
