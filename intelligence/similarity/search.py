"""
Similarity search using numpy for cosine similarity computation.
Optimized for datasets up to ~10K items.

Includes ranked search that combines semantic similarity with
keyword matching, phase proximity, entity overlap, and outcome significance.

KEYWORD MATCHING IS CRITICAL - results with matching keywords rank highest.
"""

import numpy as np
from typing import Optional
import db
from similarity.ranking import rank_candidates, compute_ranking_score
from extraction.keywords import extract_all_keywords_flat


async def get_candidates_with_embeddings(
    company_id: str,
    project_phase: Optional[str] = None,
    source_types: Optional[list[str]] = None,
    limit: int = 500
) -> list[dict]:
    """
    Fetch candidate items with their embeddings from the database.
    Pre-filters by company, optionally by phase and source type.

    Args:
        company_id: Filter to this company's data
        project_phase: Optional phase filter (exact or adjacent phases)
        source_types: Optional list of source types to include
        limit: Maximum candidates to fetch

    Returns:
        List of item dicts with embeddings
    """
    query = """
        SELECT
            id, source_project_id, source_project_name, source_type, source_ref,
            raw_text, normalized_text, project_phase, phase_percentage,
            trade_category, issue_type, severity,
            resolution_text, cost_impact, schedule_impact_days, resulted_in_co,
            abstracted_summary, embedding, metadata, item_date
        FROM intelligence.items
        WHERE company_id = $1
          AND embedding IS NOT NULL
    """
    params = [company_id]
    param_idx = 2

    if source_types:
        query += f" AND source_type = ANY(${param_idx})"
        params.append(source_types)
        param_idx += 1

    query += f" ORDER BY created_at DESC LIMIT ${param_idx}"
    params.append(limit)

    rows = await db.fetch(query, *params)

    return [dict(row) for row in rows]


def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    dot = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(dot / (norm1 * norm2))


def compute_similarities(
    query_embedding: list[float],
    candidates: list[dict]
) -> list[tuple[dict, float]]:
    """
    Compute cosine similarity between query and all candidates.

    Args:
        query_embedding: The embedding of the new observation
        candidates: List of candidate items with 'embedding' field

    Returns:
        List of (candidate, similarity_score) tuples, sorted by score descending
    """
    if not candidates:
        return []

    query_vec = np.array(query_embedding)

    results = []
    for candidate in candidates:
        if candidate.get("embedding"):
            cand_vec = np.array(candidate["embedding"])
            score = cosine_similarity(query_vec, cand_vec)
            results.append((candidate, score))

    # Sort by similarity score descending
    results.sort(key=lambda x: x[1], reverse=True)

    return results


async def search_similar(
    query_embedding: list[float],
    company_id: str,
    top_k: int = 20,
    min_score: float = 0.3,
    project_phase: Optional[str] = None,
    source_types: Optional[list[str]] = None
) -> list[dict]:
    """
    Find the most similar historical items to a query embedding.

    Args:
        query_embedding: 1536-dim embedding of the new observation
        company_id: Company ID to search within
        top_k: Number of results to return
        min_score: Minimum similarity score threshold
        project_phase: Optional phase for filtering/boosting
        source_types: Optional list of source types to include

    Returns:
        List of matching items with similarity scores
    """
    # Fetch candidates
    candidates = await get_candidates_with_embeddings(
        company_id=company_id,
        project_phase=project_phase,
        source_types=source_types,
        limit=500  # Fetch more than top_k for filtering
    )

    if not candidates:
        return []

    # Compute similarities
    scored = compute_similarities(query_embedding, candidates)

    # Filter by minimum score and take top_k
    results = []
    for candidate, score in scored:
        if score >= min_score:
            candidate["semantic_score"] = score
            results.append(candidate)
            if len(results) >= top_k:
                break

    return results


async def get_entities_for_candidates(item_ids: list[str]) -> dict[str, list[dict]]:
    """
    Fetch entities for a list of candidate item IDs.
    Returns dict mapping item_id -> list of entity dicts.
    """
    if not item_ids:
        return {}

    rows = await db.fetch("""
        SELECT item_id, entity_type, normalized_value
        FROM intelligence.entities
        WHERE item_id = ANY($1::uuid[])
    """, item_ids)

    entities_by_item = {}
    for row in rows:
        item_id = str(row["item_id"])
        if item_id not in entities_by_item:
            entities_by_item[item_id] = []
        entities_by_item[item_id].append({
            "entity_type": row["entity_type"],
            "normalized_value": row["normalized_value"]
        })

    return entities_by_item


async def search_and_rank(
    query_embedding: list[float],
    company_id: str,
    query_text: Optional[str] = None,
    top_k: int = 20,
    min_semantic_score: float = 0.25,
    min_final_score: float = 0.25,
    query_phase: Optional[str] = None,
    query_entities: Optional[dict[str, set[str]]] = None,
    query_keywords: Optional[set[str]] = None,
    source_types: Optional[list[str]] = None,
    weights: Optional[dict[str, float]] = None
) -> list[dict]:
    """
    Find and rank similar historical items using combined scoring.

    This is the main search function that:
    1. Extracts keywords from query text (CRITICAL for relevance)
    2. Finds semantically similar items via embedding cosine similarity
    3. Loads entities for those items
    4. Applies multi-factor ranking (keywords, phase, entities, outcome, recency)
    5. Returns top-k results sorted by final combined score

    KEYWORD MATCHING IS CRITICAL - if the query mentions "curtainwall",
    results containing "curtainwall" should rank very high.

    Args:
        query_embedding: 1536-dim embedding of the query
        company_id: Company ID to search within
        query_text: Original query text for keyword extraction (IMPORTANT)
        top_k: Number of results to return
        min_semantic_score: Minimum cosine similarity to consider
        min_final_score: Minimum combined score to include
        query_phase: Current construction phase (for phase boosting)
        query_entities: Extracted entities from query, dict of type -> set of values
        query_keywords: Pre-extracted keywords (if not provided, extracts from query_text)
        source_types: Filter by source types (rfi, punch_list, etc.)
        weights: Custom weights for ranking factors

    Returns:
        List of ranked items with individual and combined scores
    """
    # Step 1: Extract keywords from query (CRITICAL for relevance)
    # If keywords not provided, extract them from query_text
    if query_keywords is None and query_text:
        query_keywords = extract_all_keywords_flat(query_text)

    # Step 2: Get candidates with embeddings
    candidates = await get_candidates_with_embeddings(
        company_id=company_id,
        project_phase=query_phase,
        source_types=source_types,
        limit=500
    )

    if not candidates:
        return []

    # Step 3: Compute semantic similarities
    scored = compute_similarities(query_embedding, candidates)

    # Filter by minimum semantic score
    filtered = [(c, s) for c, s in scored if s >= min_semantic_score]

    if not filtered:
        return []

    # Step 4: Load entities for top candidates (limit to avoid over-fetching)
    top_candidates = filtered[:100]  # Top 100 by semantic score
    item_ids = [str(c["id"]) for c, _ in top_candidates]
    entities_by_item = await get_entities_for_candidates(item_ids)

    # Step 5: Apply combined ranking with keywords
    ranked = rank_candidates(
        candidates_with_semantic=top_candidates,
        query_phase=query_phase,
        query_entities=query_entities,
        entities_by_item=entities_by_item,
        query_keywords=query_keywords,
        weights=weights,
        top_k=top_k,
        min_final_score=min_final_score
    )

    return ranked
