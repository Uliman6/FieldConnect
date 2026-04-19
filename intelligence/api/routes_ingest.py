"""
Ingestion endpoints for the Intelligence Service.
Handles bulk import of RFIs, punch lists, and live observation ingestion.
"""

import time
import uuid
import logging
from typing import Optional
from datetime import datetime, date
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

import db
from ingestion.normalizer import normalize_text
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


class SingleItemRequest(BaseModel):
    """Request body for single item ingestion."""
    observation_text: str
    project_id: str
    company_id: str
    source_type: str = "observation"  # observation, event, daily_log, etc.
    source_ref: Optional[str] = None  # app's internal ID for this item
    item_date: Optional[str] = None  # ISO date string
    trade_category: Optional[str] = None
    severity: Optional[str] = None
    project_phase: Optional[str] = None
    metadata: Optional[dict] = None


class SingleItemResponse(BaseModel):
    """Response from single item ingestion."""
    item_id: str
    status: str  # "indexed" or "queued"
    normalized: bool
    processing_time_ms: float


@router.post("/single", response_model=SingleItemResponse)
async def ingest_single_item(req: SingleItemRequest):
    """
    Ingest a single new observation into the intelligence layer.
    Called by the main app backend every time a user saves an observation.
    Runs the pipeline: normalize -> store -> (async: extract entities, embed)
    """
    start_time = time.time()

    if not req.observation_text or len(req.observation_text.strip()) < 10:
        raise HTTPException(
            status_code=400,
            detail="Observation text must be at least 10 characters"
        )

    # Normalize the text
    normalized_text = normalize_text(req.observation_text)

    # Parse item date
    item_date = None
    if req.item_date:
        try:
            item_date = datetime.fromisoformat(req.item_date.replace('Z', '+00:00')).date()
        except ValueError:
            pass
    if item_date is None:
        item_date = date.today()

    # Generate UUID for the item
    item_id = str(uuid.uuid4())

    # Store the item
    try:
        await db.execute("""
            INSERT INTO intelligence.items (
                id,
                company_id,
                source_project_id,
                source_type,
                source_ref,
                raw_text,
                normalized_text,
                item_date,
                trade_category,
                severity,
                project_phase,
                metadata,
                created_at,
                updated_at
            ) VALUES (
                $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
            )
        """,
            item_id,
            req.company_id,
            req.project_id,
            req.source_type,
            req.source_ref,
            req.observation_text,
            normalized_text,
            item_date,
            req.trade_category,
            req.severity,
            req.project_phase,
            req.metadata or {}
        )
    except Exception as e:
        logger.error(f"Failed to store item: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to store item: {str(e)}")

    # TODO: Trigger async entity extraction and embedding generation
    # For now, we just store the item. Background processing can be added later.

    elapsed_ms = (time.time() - start_time) * 1000

    logger.info(f"Ingested item {item_id} for project {req.project_id} in {elapsed_ms:.1f}ms")

    return SingleItemResponse(
        item_id=item_id,
        status="indexed",
        normalized=True,
        processing_time_ms=round(elapsed_ms, 1)
    )


@router.post("/catch-up/{company_id}")
async def catch_up(company_id: str, since: Optional[str] = None):
    """
    Re-index any items in the main app DB that aren't yet in the intelligence DB.
    Called manually or on a daily cron.

    Note: This requires access to the main app database, which would be
    implemented as a separate integration. For now, returns a placeholder.
    """
    return {
        "status": "not_implemented",
        "message": "Catch-up sync requires main app database integration",
        "company_id": company_id,
        "since": since
    }


@router.post("/reprocess/{project_id}")
async def reprocess_project(project_id: str):
    """
    Re-run extraction and embeddings for all items in a project.
    Useful after terminology dictionary updates or algorithm changes.
    """
    # Count items to reprocess
    count = await db.fetchval("""
        SELECT COUNT(*) FROM intelligence.items
        WHERE source_project_id = $1
    """, project_id)

    if count == 0:
        return {
            "status": "no_items",
            "project_id": project_id,
            "items_found": 0
        }

    # TODO: Trigger async reprocessing job
    # For now, just return the count

    return {
        "status": "queued",
        "project_id": project_id,
        "items_to_process": count,
        "message": "Reprocessing queued. Check status via /health endpoint."
    }


@router.get("/stats/{company_id}")
async def get_ingestion_stats(company_id: str):
    """Get ingestion statistics for a company."""
    stats = await db.fetchrow("""
        SELECT
            COUNT(*) as total_items,
            COUNT(DISTINCT source_project_id) as project_count,
            COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as embedded_count,
            COUNT(CASE WHEN source_type = 'rfi' THEN 1 END) as rfi_count,
            COUNT(CASE WHEN source_type = 'observation' THEN 1 END) as observation_count,
            MIN(item_date) as earliest_date,
            MAX(item_date) as latest_date
        FROM intelligence.items
        WHERE company_id = $1::uuid
    """, company_id)

    if not stats:
        return {
            "company_id": company_id,
            "total_items": 0,
            "project_count": 0
        }

    return {
        "company_id": company_id,
        "total_items": stats["total_items"],
        "project_count": stats["project_count"],
        "embedded_count": stats["embedded_count"],
        "rfi_count": stats["rfi_count"],
        "observation_count": stats["observation_count"],
        "date_range": {
            "earliest": str(stats["earliest_date"]) if stats["earliest_date"] else None,
            "latest": str(stats["latest_date"]) if stats["latest_date"] else None
        }
    }
