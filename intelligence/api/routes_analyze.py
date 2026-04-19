"""
Analysis endpoints for the Intelligence Service.
Main endpoint for matching new observations against historical data.
"""

import time
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import db
from alerts.privacy_guard import (
    generate_abstracted_alert,
    generate_match_reason,
    get_or_generate_abstraction,
    batch_get_or_generate_abstractions
)
from extraction.abstraction import extract_clean_question
from evaluation.approaches import BM25

logger = logging.getLogger(__name__)
router = APIRouter()

# BM25 index - lazily initialized
_bm25_index: Optional[BM25] = None
_corpus: Optional[list] = None
_corpus_by_id: Optional[dict] = None


class AnalyzeRequest(BaseModel):
    """Request body for the /analyze endpoint."""
    observation_text: str
    project_id: str
    company_id: str
    project_phase: Optional[str] = None
    trade_category: Optional[str] = None
    also_ingest: bool = False  # If True, also index this observation


class Alert(BaseModel):
    """A single alert returned from analysis."""
    match_reason: str
    learning: str  # Abstracted summary
    recommended_action: Optional[str] = None
    confidence: float  # 0-1
    source_type: str  # "rfi", "punch_list", etc.
    source_phase: Optional[str] = None
    cost_impact: Optional[float] = None
    schedule_impact_days: Optional[int] = None
    resulted_in_co: bool = False
    alert_tier: str  # "high", "medium", "low"


class AnalyzeResponse(BaseModel):
    """Response from the /analyze endpoint."""
    alerts: list[Alert]
    processing_time_ms: float
    matches_found: int
    observation_indexed: bool = False


async def _load_corpus():
    """Load RFI corpus from database for BM25 indexing."""
    global _corpus, _corpus_by_id

    rows = await db.fetch("""
        SELECT
            id::text,
            source_ref,
            source_project_id,
            source_project_name,
            question_text,
            raw_text,
            trade_category,
            project_phase,
            resolution_text,
            cost_impact,
            schedule_impact_days,
            resulted_in_co,
            source_type,
            abstracted_summary
        FROM intelligence.items
        WHERE (question_text IS NOT NULL OR raw_text IS NOT NULL)
          AND LENGTH(COALESCE(question_text, raw_text)) > 30
        ORDER BY created_at DESC
        LIMIT 5000
    """)

    _corpus = []
    _corpus_by_id = {}

    for row in rows:
        doc = dict(row)
        doc["text"] = doc.get("question_text") or doc.get("raw_text") or ""
        _corpus.append(doc)
        _corpus_by_id[doc["id"]] = doc

    logger.info(f"Loaded {len(_corpus)} items for BM25 index")
    return _corpus


async def _get_bm25_index() -> BM25:
    """Get or create the BM25 index."""
    global _bm25_index, _corpus

    if _bm25_index is None or _corpus is None:
        await _load_corpus()
        _bm25_index = BM25()
        _bm25_index.fit(_corpus, text_field="text")
        logger.info("BM25 index built")

    return _bm25_index


def _determine_alert_tier(score: float, has_cost_impact: bool, has_co: bool) -> str:
    """Determine the alert tier based on score and impact."""
    if score >= 0.8 or has_co:
        return "high"
    elif score >= 0.6 or has_cost_impact:
        return "medium"
    else:
        return "low"


def _extract_recommendation(doc: dict) -> Optional[str]:
    """Extract a recommended action from the document."""
    resolution = doc.get("resolution_text") or ""

    if not resolution:
        return None

    # Look for action-oriented phrases
    if "confirm" in resolution.lower():
        return "Verify specifications before proceeding"
    elif "coordinate" in resolution.lower():
        return "Coordinate with relevant trades"
    elif "submit" in resolution.lower():
        return "Submit for design team review"
    elif "revise" in resolution.lower() or "update" in resolution.lower():
        return "Review current details against updated requirements"

    return None


@router.post("/", response_model=AnalyzeResponse)
async def analyze_observation(req: AnalyzeRequest):
    """
    Main intelligence endpoint. Called when a user logs a new observation.
    Returns ranked, privacy-safe alerts from historical data.
    """
    start_time = time.time()

    if not req.observation_text or len(req.observation_text.strip()) < 10:
        raise HTTPException(
            status_code=400,
            detail="Observation text must be at least 10 characters"
        )

    # Get BM25 index
    bm25 = await _get_bm25_index()

    # Run BM25 search
    bm25_results = bm25.rank(req.observation_text, top_k=50)

    # Normalize scores
    if bm25_results:
        max_score = max(score for _, score in bm25_results)
        if max_score > 0:
            bm25_results = [(doc_id, score / max_score) for doc_id, score in bm25_results]

    # Filter and boost results
    scored_results = []
    trade_lower = (req.trade_category or "").lower()

    for doc_id, score in bm25_results:
        doc = _corpus_by_id.get(doc_id)
        if not doc:
            continue

        # Filter out same project
        doc_project = doc.get("source_project_id") or ""
        if doc_project == req.project_id:
            continue

        # Trade boost
        final_score = score
        doc_trade = (doc.get("trade_category") or "").lower()
        if trade_lower and trade_lower in doc_trade:
            final_score += 0.3

        # Phase boost
        doc_phase = doc.get("project_phase") or ""
        if req.project_phase and doc_phase == req.project_phase:
            final_score += 0.15

        scored_results.append((doc, final_score))

    # Sort by final score
    scored_results.sort(key=lambda x: x[1], reverse=True)

    # Generate alerts for top results
    alerts = []
    for doc, score in scored_results[:5]:
        if score < 0.3:  # Minimum threshold
            continue

        # Check if we already have a cached abstraction
        learning = doc.get("abstracted_summary")

        if not learning:
            # Generate and cache abstracted alert
            learning = await get_or_generate_abstraction(
                item_id=doc["id"],
                source_text=doc.get("text", ""),
                resolution_text=doc.get("resolution_text"),
                cost_impact=doc.get("cost_impact"),
                schedule_impact_days=doc.get("schedule_impact_days"),
                resulted_in_co=doc.get("resulted_in_co", False)
            )

        if not learning:
            continue

        # Generate match reason
        match_reason = generate_match_reason(
            query_text=req.observation_text,
            matched_text=doc.get("text", ""),
            matched_trade=doc.get("trade_category"),
            matched_phase=doc.get("project_phase"),
            score=score
        )

        # Determine tier
        tier = _determine_alert_tier(
            score=score,
            has_cost_impact=bool(doc.get("cost_impact")),
            has_co=doc.get("resulted_in_co", False)
        )

        alerts.append(Alert(
            match_reason=match_reason,
            learning=learning,
            recommended_action=_extract_recommendation(doc),
            confidence=round(min(score, 1.0), 2),
            source_type=doc.get("source_type", "rfi"),
            source_phase=doc.get("project_phase"),
            cost_impact=doc.get("cost_impact"),
            schedule_impact_days=doc.get("schedule_impact_days"),
            resulted_in_co=doc.get("resulted_in_co", False),
            alert_tier=tier
        ))

    # Handle also_ingest flag
    observation_indexed = False
    if req.also_ingest:
        # TODO: Implement single item ingestion
        # For now, just log that we would index it
        logger.info(f"Would index observation for project {req.project_id}")
        observation_indexed = False  # Will be True once implemented

    elapsed_ms = (time.time() - start_time) * 1000

    return AnalyzeResponse(
        alerts=alerts,
        processing_time_ms=round(elapsed_ms, 1),
        matches_found=len(scored_results),
        observation_indexed=observation_indexed
    )


@router.get("/phase-alerts/{project_id}")
async def get_phase_alerts(
    project_id: str,
    phase: str,
    company_id: str,
    limit: int = 5
):
    """
    Get proactive alerts for a project entering a new phase.
    Surfaces the most common/costly issues from this phase across all company projects.
    """
    # Query for recurring issues in this phase from other projects
    rows = await db.fetch("""
        SELECT
            trade_category,
            COUNT(*) as occurrence_count,
            AVG(COALESCE(cost_impact, 0)) as avg_cost,
            SUM(CASE WHEN resulted_in_co THEN 1 ELSE 0 END) as co_count,
            MIN(raw_text) as sample_text
        FROM intelligence.items
        WHERE company_id = $1
          AND project_phase = $2
          AND source_project_id != $3
        GROUP BY trade_category
        HAVING COUNT(*) >= 2
        ORDER BY co_count DESC, occurrence_count DESC
        LIMIT $4
    """, company_id, phase, project_id, limit)

    phase_alerts = []
    for row in rows:
        phase_alerts.append({
            "trade": row["trade_category"],
            "occurrence_count": row["occurrence_count"],
            "avg_cost_impact": float(row["avg_cost"]) if row["avg_cost"] else None,
            "change_order_count": row["co_count"],
            "warning": f"Watch for {row['trade_category']} issues during {phase} phase - occurred {row['occurrence_count']} times in previous projects"
        })

    return {
        "project_id": project_id,
        "phase": phase,
        "alerts": phase_alerts
    }


@router.post("/refresh-index")
async def refresh_index():
    """Force refresh the BM25 index from database."""
    global _bm25_index, _corpus, _corpus_by_id

    _bm25_index = None
    _corpus = None
    _corpus_by_id = None

    await _get_bm25_index()

    return {
        "status": "refreshed",
        "corpus_size": len(_corpus) if _corpus else 0
    }
