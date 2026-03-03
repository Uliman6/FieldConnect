"""
Phase Mapper for FieldConnect Intelligence Service.

Maps construction activities to standard project phases and determines
the current phase based on date and project schedule.
"""

import re
from datetime import date, datetime
from typing import Optional
from pathlib import Path

import yaml


# Load phase definitions
_definitions: Optional[dict] = None


def load_phase_definitions() -> dict:
    """Load phase definitions from YAML file."""
    global _definitions
    if _definitions is not None:
        return _definitions

    definitions_path = Path(__file__).parent.parent / "data" / "phase_definitions.yaml"
    if definitions_path.exists():
        with open(definitions_path, "r", encoding="utf-8") as f:
            _definitions = yaml.safe_load(f)
    else:
        # Default minimal definitions if file not found
        _definitions = {
            "phases": [
                "preconstruction", "foundation", "structure", "envelope",
                "mep_rough_in", "interior_finishes", "mep_trim_out",
                "commissioning", "closeout"
            ],
            "phase_keywords": {},
            "phase_trades": {}
        }

    return _definitions


def get_all_phases() -> list[str]:
    """Get list of all standard phases in chronological order."""
    definitions = load_phase_definitions()
    return definitions.get("phases", [])


def get_phase_index(phase: str) -> int:
    """Get the chronological index of a phase (0-based)."""
    phases = get_all_phases()
    try:
        return phases.index(phase)
    except ValueError:
        return -1


def infer_phase_from_text(text: str) -> Optional[str]:
    """
    Infer the project phase from text content using keyword matching.

    Args:
        text: Item text (raw or normalized)

    Returns:
        Detected phase name or None if no match
    """
    definitions = load_phase_definitions()
    phase_keywords = definitions.get("phase_keywords", {})

    text_lower = text.lower()

    # Score each phase based on keyword matches
    phase_scores: dict[str, int] = {}

    for phase, keywords in phase_keywords.items():
        score = 0
        for keyword in keywords:
            keyword_lower = keyword.lower()
            # Count occurrences (word boundary matching for better accuracy)
            pattern = r'\b' + re.escape(keyword_lower) + r'\b'
            matches = len(re.findall(pattern, text_lower))
            score += matches

        if score > 0:
            phase_scores[phase] = score

    if not phase_scores:
        return None

    # Return phase with highest score
    return max(phase_scores, key=phase_scores.get)


def infer_phase_from_trade(trade: str) -> list[str]:
    """
    Get possible phases for a trade.

    Args:
        trade: Trade name

    Returns:
        List of phases where this trade is typically active
    """
    definitions = load_phase_definitions()
    phase_trades = definitions.get("phase_trades", {})

    trade_lower = trade.lower()
    matching_phases = []

    for phase, trades in phase_trades.items():
        for t in trades:
            if trade_lower in t.lower() or t.lower() in trade_lower:
                matching_phases.append(phase)
                break

    return matching_phases


def get_phase_from_schedule(
    item_date: date,
    schedule: list[dict]
) -> Optional[dict]:
    """
    Determine the project phase for a given date using the project schedule.

    Args:
        item_date: Date of the item
        schedule: List of schedule entries with keys:
            - activity_name: str
            - phase: str (mapped phase)
            - start_date: date
            - end_date: date

    Returns:
        Dict with:
            - phase: str (the current phase)
            - phase_progress: float (0.0 to 1.0, percentage through the phase)
            - active_activities: list[str] (activities happening on this date)
        Or None if date is outside schedule range
    """
    if not schedule:
        return None

    # Find all activities active on this date
    active_activities = []
    for entry in schedule:
        start = entry.get("start_date")
        end = entry.get("end_date")

        if start and end:
            if start <= item_date <= end:
                active_activities.append({
                    "name": entry.get("activity_name", ""),
                    "phase": entry.get("phase", "")
                })

    if not active_activities:
        # Date is outside all activities - find closest phase
        return _get_closest_phase(item_date, schedule)

    # Determine primary phase (most activities or latest in sequence)
    phase_counts: dict[str, int] = {}
    for activity in active_activities:
        phase = activity.get("phase", "")
        if phase:
            phase_counts[phase] = phase_counts.get(phase, 0) + 1

    if not phase_counts:
        return None

    # If tie, prefer later phase (construction typically overlaps forward)
    phases = get_all_phases()
    primary_phase = max(
        phase_counts.keys(),
        key=lambda p: (phase_counts[p], phases.index(p) if p in phases else -1)
    )

    # Calculate phase progress
    phase_progress = _calculate_phase_progress(item_date, primary_phase, schedule)

    return {
        "phase": primary_phase,
        "phase_progress": phase_progress,
        "active_activities": [a["name"] for a in active_activities]
    }


def _get_closest_phase(item_date: date, schedule: list[dict]) -> Optional[dict]:
    """Get the closest phase for a date outside the schedule range."""
    if not schedule:
        return None

    # Get overall schedule bounds
    all_starts = [e["start_date"] for e in schedule if e.get("start_date")]
    all_ends = [e["end_date"] for e in schedule if e.get("end_date")]

    if not all_starts or not all_ends:
        return None

    earliest_start = min(all_starts)
    latest_end = max(all_ends)

    if item_date < earliest_start:
        # Before project start - return preconstruction at 0%
        return {
            "phase": "preconstruction",
            "phase_progress": 0.0,
            "active_activities": []
        }
    elif item_date > latest_end:
        # After project end - return closeout at 100%
        return {
            "phase": "closeout",
            "phase_progress": 1.0,
            "active_activities": []
        }

    return None


def _calculate_phase_progress(
    item_date: date,
    phase: str,
    schedule: list[dict]
) -> float:
    """Calculate progress through a phase (0.0 to 1.0)."""
    # Find all activities in this phase
    phase_activities = [
        e for e in schedule
        if e.get("phase") == phase and e.get("start_date") and e.get("end_date")
    ]

    if not phase_activities:
        return 0.5  # Default to middle if no activities found

    # Get phase bounds (earliest start to latest end)
    phase_start = min(a["start_date"] for a in phase_activities)
    phase_end = max(a["end_date"] for a in phase_activities)

    total_days = (phase_end - phase_start).days
    if total_days <= 0:
        return 0.5

    elapsed_days = (item_date - phase_start).days
    progress = max(0.0, min(1.0, elapsed_days / total_days))

    return round(progress, 3)


def map_activity_to_phase(activity_name: str) -> Optional[str]:
    """
    Map a schedule activity name to a standard phase.

    Args:
        activity_name: Name of the activity from the schedule

    Returns:
        Mapped phase name or None if no match
    """
    return infer_phase_from_text(activity_name)


def calculate_phase_similarity(phase1: str, phase2: str) -> float:
    """
    Calculate similarity between two phases based on chronological distance.

    Adjacent phases are more similar than distant ones.

    Args:
        phase1: First phase name
        phase2: Second phase name

    Returns:
        Similarity score (0.0 to 1.0, higher is more similar)
    """
    phases = get_all_phases()

    try:
        idx1 = phases.index(phase1)
        idx2 = phases.index(phase2)
    except ValueError:
        return 0.5  # Unknown phase, return neutral

    # Distance between phases
    distance = abs(idx1 - idx2)
    max_distance = len(phases) - 1

    if max_distance == 0:
        return 1.0

    # Convert distance to similarity (inverse)
    similarity = 1.0 - (distance / max_distance)

    return round(similarity, 3)


def get_related_phases(phase: str, window: int = 1) -> list[str]:
    """
    Get phases related to the given phase (adjacent phases).

    Args:
        phase: Center phase
        window: How many phases on each side to include

    Returns:
        List of related phases including the input phase
    """
    phases = get_all_phases()

    try:
        idx = phases.index(phase)
    except ValueError:
        return [phase]

    start_idx = max(0, idx - window)
    end_idx = min(len(phases), idx + window + 1)

    return phases[start_idx:end_idx]


# Convenience functions for item processing

def assign_phase_to_item(
    item: dict,
    project_schedule: Optional[list[dict]] = None
) -> dict:
    """
    Assign a phase to an item based on available information.

    Priority:
    1. Use project schedule if available and item has a date
    2. Infer from item text content using keywords
    3. Infer from trade if available
    4. Return None if cannot determine

    Args:
        item: Item dict with keys like raw_text, normalized_text, item_date, trade_category
        project_schedule: Optional project schedule

    Returns:
        Updated item dict with phase information added
    """
    result = item.copy()
    result["project_phase"] = None
    result["phase_progress"] = None
    result["phase_source"] = None

    # Try schedule-based assignment first
    if project_schedule and item.get("item_date"):
        item_date = item["item_date"]
        if isinstance(item_date, str):
            try:
                item_date = datetime.strptime(item_date, "%Y-%m-%d").date()
            except ValueError:
                item_date = None

        if item_date:
            schedule_result = get_phase_from_schedule(item_date, project_schedule)
            if schedule_result:
                result["project_phase"] = schedule_result["phase"]
                result["phase_progress"] = schedule_result["phase_progress"]
                result["phase_source"] = "schedule"
                return result

    # Try text-based inference
    text = item.get("normalized_text") or item.get("raw_text") or ""
    if text:
        inferred_phase = infer_phase_from_text(text)
        if inferred_phase:
            result["project_phase"] = inferred_phase
            result["phase_source"] = "text_inference"
            return result

    # Try trade-based inference
    trade = item.get("trade_category")
    if trade:
        possible_phases = infer_phase_from_trade(trade)
        if possible_phases:
            # Return the most common (middle) phase for this trade
            result["project_phase"] = possible_phases[len(possible_phases) // 2]
            result["phase_source"] = "trade_inference"
            return result

    return result
