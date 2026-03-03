"""
Schedule API endpoints for FieldConnect Intelligence Service.

Handles schedule upload, parsing, and phase mapping.
"""

from datetime import date, datetime
from typing import Optional
import logging
import json

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel

from ingestion.schedule_parser import (
    parse_csv_schedule_from_content,
    parse_excel_schedule_from_bytes,
    validate_schedule,
    get_schedule_date_range,
    get_phase_date_ranges,
    create_sample_schedule
)
from ingestion.phase_mapper import (
    get_all_phases,
    infer_phase_from_text,
    calculate_phase_similarity,
    get_related_phases,
    assign_phase_to_item
)
import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/schedule", tags=["schedule"])


class ScheduleUploadResponse(BaseModel):
    success: bool
    project_id: str
    activities_parsed: int
    activities_with_phase: int
    phase_mapping_rate: float
    date_range: Optional[dict] = None
    phase_ranges: dict = {}
    warnings: list[str] = []


class PhaseInferenceRequest(BaseModel):
    text: str


class PhaseInferenceResponse(BaseModel):
    inferred_phase: Optional[str]
    confidence: str  # "high", "medium", "low"


class PhaseSimilarityRequest(BaseModel):
    phase1: str
    phase2: str


class PhaseSimilarityResponse(BaseModel):
    similarity: float
    same_phase: bool
    phases_between: int


class AssignPhasesRequest(BaseModel):
    project_id: str
    use_text_inference: bool = True


class AssignPhasesResponse(BaseModel):
    total_items: int
    items_updated: int
    phase_distribution: dict


@router.get("/phases")
async def list_phases():
    """Get all standard construction phases in chronological order."""
    return {
        "phases": get_all_phases(),
        "count": len(get_all_phases())
    }


@router.post("/upload/{project_id}", response_model=ScheduleUploadResponse)
async def upload_schedule(
    project_id: str,
    file: UploadFile = File(...),
    company_id: str = Form(...)
):
    """
    Upload and parse a project schedule file.

    Supports CSV and Excel (.xlsx) formats.
    Activities are automatically mapped to standard construction phases.
    """
    # Validate file type
    filename = file.filename or ""
    if not filename.lower().endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Use CSV or Excel (.xlsx)"
        )

    # Read file content
    content = await file.read()

    # Parse based on file type
    if filename.lower().endswith(".csv"):
        schedule = parse_csv_schedule_from_content(content.decode("utf-8-sig"))
    else:
        schedule = parse_excel_schedule_from_bytes(content)

    if not schedule:
        raise HTTPException(
            status_code=400,
            detail="Could not parse schedule. Check file format and column headers."
        )

    # Validate schedule
    validation = validate_schedule(schedule)

    # Store schedule in database
    try:
        # Delete existing schedule for this project
        await db.execute(
            "DELETE FROM intelligence.project_schedules WHERE project_id = $1 AND company_id = $2",
            project_id, company_id
        )

        # Insert new schedule entries
        for entry in schedule:
            await db.execute("""
                INSERT INTO intelligence.project_schedules (
                    project_id, company_id, activity_id, activity_name,
                    phase, start_date, end_date, duration_days, predecessors
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
                project_id,
                company_id,
                entry.get("activity_id", ""),
                entry.get("activity_name", ""),
                entry.get("phase"),
                entry.get("start_date"),
                entry.get("end_date"),
                entry.get("duration_days"),
                entry.get("predecessors")
            )

        logger.info(f"Stored {len(schedule)} schedule entries for project {project_id}")

    except Exception as e:
        logger.error(f"Error storing schedule: {e}")
        raise HTTPException(status_code=500, detail="Error storing schedule")

    # Build response
    date_range = validation.get("date_range")
    date_range_dict = None
    if date_range:
        date_range_dict = {
            "start": date_range[0].isoformat(),
            "end": date_range[1].isoformat()
        }

    phase_ranges = get_phase_date_ranges(schedule)
    phase_ranges_dict = {
        phase: {"start": r[0].isoformat(), "end": r[1].isoformat()}
        for phase, r in phase_ranges.items()
    }

    return ScheduleUploadResponse(
        success=True,
        project_id=project_id,
        activities_parsed=validation["total_activities"],
        activities_with_phase=validation["activities_with_phase"],
        phase_mapping_rate=validation["phase_mapping_rate"],
        date_range=date_range_dict,
        phase_ranges=phase_ranges_dict,
        warnings=validation.get("warnings", [])
    )


@router.get("/{project_id}")
async def get_project_schedule(
    project_id: str,
    company_id: str = Query(...)
):
    """Get the stored schedule for a project."""
    rows = await db.fetch("""
        SELECT activity_id, activity_name, phase, start_date, end_date,
               duration_days, predecessors
        FROM intelligence.project_schedules
        WHERE project_id = $1 AND company_id = $2
        ORDER BY start_date NULLS LAST, activity_name
    """, project_id, company_id)

    if not rows:
        raise HTTPException(status_code=404, detail="No schedule found for this project")

    activities = []
    for row in rows:
        activity = dict(row)
        # Convert dates to ISO strings
        if activity.get("start_date"):
            activity["start_date"] = activity["start_date"].isoformat()
        if activity.get("end_date"):
            activity["end_date"] = activity["end_date"].isoformat()
        activities.append(activity)

    # Get phase summary
    phase_counts = {}
    for activity in activities:
        phase = activity.get("phase") or "unmapped"
        phase_counts[phase] = phase_counts.get(phase, 0) + 1

    return {
        "project_id": project_id,
        "total_activities": len(activities),
        "phase_summary": phase_counts,
        "activities": activities
    }


@router.delete("/{project_id}")
async def delete_project_schedule(
    project_id: str,
    company_id: str = Query(...)
):
    """Delete the schedule for a project."""
    result = await db.execute(
        "DELETE FROM intelligence.project_schedules WHERE project_id = $1 AND company_id = $2",
        project_id, company_id
    )

    return {"success": True, "project_id": project_id, "deleted": True}


@router.post("/infer-phase", response_model=PhaseInferenceResponse)
async def infer_phase(request: PhaseInferenceRequest):
    """
    Infer the construction phase from text content.

    Uses keyword matching against standard construction terminology.
    """
    phase = infer_phase_from_text(request.text)

    # Determine confidence based on text length and match quality
    confidence = "low"
    if phase:
        text_len = len(request.text)
        if text_len > 200:
            confidence = "high"
        elif text_len > 50:
            confidence = "medium"

    return PhaseInferenceResponse(
        inferred_phase=phase,
        confidence=confidence
    )


@router.post("/phase-similarity", response_model=PhaseSimilarityResponse)
async def get_phase_similarity(request: PhaseSimilarityRequest):
    """
    Calculate similarity between two construction phases.

    Returns a score from 0.0 to 1.0 based on chronological distance.
    """
    similarity = calculate_phase_similarity(request.phase1, request.phase2)
    phases = get_all_phases()

    try:
        idx1 = phases.index(request.phase1)
        idx2 = phases.index(request.phase2)
        phases_between = abs(idx1 - idx2)
    except ValueError:
        phases_between = -1

    return PhaseSimilarityResponse(
        similarity=similarity,
        same_phase=request.phase1 == request.phase2,
        phases_between=phases_between
    )


@router.get("/related-phases/{phase}")
async def get_related_phases_endpoint(
    phase: str,
    window: int = Query(default=1, ge=0, le=4)
):
    """
    Get phases related to (adjacent to) the given phase.

    Args:
        phase: Center phase name
        window: Number of phases on each side to include (0-4)
    """
    related = get_related_phases(phase, window)

    return {
        "center_phase": phase,
        "window": window,
        "related_phases": related
    }


@router.post("/assign-phases", response_model=AssignPhasesResponse)
async def assign_phases_to_items(request: AssignPhasesRequest):
    """
    Assign phases to all items in a project.

    Uses the project schedule if available, otherwise infers from text.
    """
    # Get project schedule if available
    schedule_rows = await db.fetch("""
        SELECT activity_name, phase, start_date, end_date
        FROM intelligence.project_schedules
        WHERE project_id = $1
    """, request.project_id)

    project_schedule = None
    if schedule_rows:
        project_schedule = [dict(row) for row in schedule_rows]

    # Get all items for the project
    items = await db.fetch("""
        SELECT id, raw_text, normalized_text, item_date, trade_category, project_phase
        FROM intelligence.items
        WHERE source_project_id = $1
    """, request.project_id)

    if not items:
        raise HTTPException(status_code=404, detail="No items found for this project")

    updated_count = 0
    phase_distribution: dict[str, int] = {}

    for item in items:
        item_dict = dict(item)

        # Skip if already has a phase and we don't want to override
        if item_dict.get("project_phase") and not request.use_text_inference:
            phase = item_dict["project_phase"]
            phase_distribution[phase] = phase_distribution.get(phase, 0) + 1
            continue

        # Assign phase
        result = assign_phase_to_item(item_dict, project_schedule)
        new_phase = result.get("project_phase")

        if new_phase:
            # Update in database
            await db.execute("""
                UPDATE intelligence.items
                SET project_phase = $1
                WHERE id = $2
            """, new_phase, item_dict["id"])

            updated_count += 1
            phase_distribution[new_phase] = phase_distribution.get(new_phase, 0) + 1
        else:
            phase_distribution["unknown"] = phase_distribution.get("unknown", 0) + 1

    return AssignPhasesResponse(
        total_items=len(items),
        items_updated=updated_count,
        phase_distribution=phase_distribution
    )


@router.post("/sample/{project_id}")
async def create_sample_schedule_endpoint(
    project_id: str,
    company_id: str = Form(...),
    start_date: str = Form(...),
    duration_months: int = Form(default=12)
):
    """
    Create a sample construction schedule for testing.

    Useful when no real schedule is available.
    """
    try:
        parsed_start = datetime.strptime(start_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD")

    schedule = create_sample_schedule(parsed_start, duration_months)

    # Store in database
    try:
        await db.execute(
            "DELETE FROM intelligence.project_schedules WHERE project_id = $1 AND company_id = $2",
            project_id, company_id
        )

        for entry in schedule:
            await db.execute("""
                INSERT INTO intelligence.project_schedules (
                    project_id, company_id, activity_id, activity_name,
                    phase, start_date, end_date, duration_days
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
                project_id,
                company_id,
                entry.get("activity_id", ""),
                entry.get("activity_name", ""),
                entry.get("phase"),
                entry.get("start_date"),
                entry.get("end_date"),
                entry.get("duration_days")
            )

    except Exception as e:
        logger.error(f"Error storing sample schedule: {e}")
        raise HTTPException(status_code=500, detail="Error storing schedule")

    # Build response
    phase_ranges = get_phase_date_ranges(schedule)
    phase_ranges_dict = {
        phase: {"start": r[0].isoformat(), "end": r[1].isoformat()}
        for phase, r in phase_ranges.items()
    }

    return {
        "success": True,
        "project_id": project_id,
        "activities_created": len(schedule),
        "start_date": parsed_start.isoformat(),
        "duration_months": duration_months,
        "phase_ranges": phase_ranges_dict
    }
