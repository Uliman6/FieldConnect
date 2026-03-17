"""
Tiered retrieval for construction data.

Trade match is the strongest relevancy signal. A curtainwall observation
should search curtainwall items first.

Tiers:
1. Same trade + keyword match (FTS)
2. Same trade + semantic (embedding)
3. Related trades + semantic
4. Open search (fallback)

Results are merged, deduped, and boosted by tier before final ranking.
"""

import yaml
import json
import numpy as np
from pathlib import Path
from typing import Optional
import db
from similarity.ranking import rank_candidates
from extraction.keywords import extract_all_keywords_flat
from extraction.abstraction import abstract_rule_based, classify_issue_type


# Tier boost values
TIER_BOOSTS = {
    1: 0.20,  # Same trade + keyword
    2: 0.10,  # Same trade + semantic
    3: 0.05,  # Related trade + semantic
    4: 0.00,  # Open search (no boost)
}

# Load trade adjacencies
_TRADE_ADJACENCIES = None


def load_trade_adjacencies() -> dict[str, list[str]]:
    """Load trade adjacency map from YAML file."""
    global _TRADE_ADJACENCIES
    if _TRADE_ADJACENCIES is not None:
        return _TRADE_ADJACENCIES

    yaml_path = Path(__file__).parent.parent / "data" / "trade_adjacencies.yaml"
    if yaml_path.exists():
        with open(yaml_path, "r", encoding="utf-8") as f:
            _TRADE_ADJACENCIES = yaml.safe_load(f) or {}
    else:
        _TRADE_ADJACENCIES = {}

    return _TRADE_ADJACENCIES


def get_related_trades(trade: str) -> list[str]:
    """Get trades that commonly interact with the given trade."""
    adjacencies = load_trade_adjacencies()

    # Normalize trade name (handle multi-trade entries)
    primary_trade = trade.split(",")[0].strip().lower() if trade else None
    if not primary_trade:
        return []

    # Look up related trades
    related = adjacencies.get(primary_trade, [])

    # Also check if this trade appears in another trade's adjacencies
    for other_trade, adj_list in adjacencies.items():
        if primary_trade in [t.lower() for t in adj_list]:
            if other_trade not in related:
                related.append(other_trade)

    return related


# Stop words for keyword extraction
STOP_WORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "to", "of",
    "in", "for", "on", "with", "at", "by", "from", "as", "into", "through",
    "during", "before", "after", "above", "below", "between", "under",
    "again", "further", "then", "once", "here", "there", "when", "where",
    "why", "how", "all", "each", "few", "more", "most", "other", "some",
    "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too",
    "very", "just", "and", "but", "or", "if", "because", "until", "while",
    "this", "that", "these", "those", "am", "it", "its", "itself", "they",
    "them", "their", "what", "which", "who", "whom", "we", "you", "your",
    "he", "she", "his", "her", "him", "my", "me", "our", "us",
    # Construction-specific stop words
    "please", "advise", "confirm", "provide", "see", "attached", "per",
    "regarding", "reference", "question", "asking", "about", "noted",
    "shown", "drawing", "drawings", "sheet", "detail", "details",
    "currently", "also", "however", "therefore", "additionally",
}


def extract_search_keywords(text: str, max_keywords: int = 5) -> list[str]:
    """
    Extract key search terms from observation text.

    Focuses on nouns and specific terms, strips generic words.
    For "the curtainwall installer is asking about mullion alignment
    tolerances at Level 3 north side", returns:
    ["curtainwall", "mullion", "alignment", "tolerances", "level"]

    Args:
        text: The observation/query text
        max_keywords: Maximum keywords to return

    Returns:
        List of search keywords
    """
    if not text:
        return []

    # Lowercase and tokenize
    import re
    text = text.lower()
    # Keep alphanumeric and hyphens (for terms like "pre-cast")
    tokens = re.findall(r'[a-z0-9][-a-z0-9]*', text)

    # Filter out stop words and short tokens
    keywords = []
    for token in tokens:
        if len(token) < 3:
            continue
        if token in STOP_WORDS:
            continue
        if token.isdigit():
            continue
        keywords.append(token)

    # Deduplicate while preserving order
    seen = set()
    unique_keywords = []
    for kw in keywords:
        if kw not in seen:
            seen.add(kw)
            unique_keywords.append(kw)

    # Return top N (first occurrence = likely more important)
    return unique_keywords[:max_keywords]


def extract_query_abstraction(text: str) -> tuple[list[str], str]:
    """
    Extract key terms and issue type from query text using rule-based approach.

    This is fast (no LLM) and suitable for real-time search queries.

    Args:
        text: The query/observation text

    Returns:
        Tuple of (key_terms, issue_type)
    """
    if not text:
        return [], "general"

    # Use rule-based abstraction
    abstraction = abstract_rule_based(text)

    return abstraction.key_terms, abstraction.issue_type


def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    dot = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(dot / (norm1 * norm2))


async def tier1_search(
    company_id: str,
    trade: str,
    keywords: list[str],
    limit: int = 20
) -> list[dict]:
    """
    Tier 1: Same trade + keyword match using FTS (full-text search).
    Uses the search_vector column with GIN index for fast search.
    """
    if not trade or not keywords:
        return []

    # Build FTS query - join keywords with | (OR) for more matches
    # AND is too strict for short keyword lists
    fts_query = " | ".join(keywords[:5])

    try:
        rows = await db.fetch("""
            SELECT
                id, source_project_id, source_project_name, source_type, source_ref,
                raw_text, question_text, normalized_text, project_phase, phase_percentage,
                trade_category, issue_type, severity,
                resolution_text, cost_impact, schedule_impact_days, resulted_in_co,
                abstracted_summary, embedding, metadata, item_date,
                ts_rank(search_vector, to_tsquery('english', $3)) as fts_rank
            FROM intelligence.items
            WHERE company_id = $1
              AND trade_category ILIKE $2
              AND search_vector @@ to_tsquery('english', $3)
            ORDER BY ts_rank(search_vector, to_tsquery('english', $3)) DESC
            LIMIT $4
        """, company_id, f"%{trade}%", fts_query, limit)

        results = []
        for row in rows:
            item = dict(row)
            item["tier"] = 1
            item["fts_rank"] = float(row["fts_rank"]) if row["fts_rank"] else 0
            results.append(item)

        return results

    except Exception as e:
        # Fallback to ILIKE if FTS fails (e.g., column doesn't exist)
        print(f"FTS failed, falling back to ILIKE: {e}")
        return await _tier1_search_fallback(company_id, trade, keywords, limit)


async def _tier1_search_fallback(
    company_id: str,
    trade: str,
    keywords: list[str],
    limit: int = 20
) -> list[dict]:
    """Fallback tier1 search using ILIKE when FTS is unavailable."""
    keyword_conditions = []
    params = [company_id, f"%{trade}%"]
    param_idx = 3

    for kw in keywords[:3]:
        keyword_conditions.append(
            f"(normalized_text ILIKE ${param_idx} OR question_text ILIKE ${param_idx})"
        )
        params.append(f"%{kw}%")
        param_idx += 1

    if not keyword_conditions:
        return []

    keyword_clause = " OR ".join(keyword_conditions)
    query = f"""
        SELECT
            id, source_project_id, source_project_name, source_type, source_ref,
            raw_text, question_text, normalized_text, project_phase, phase_percentage,
            trade_category, issue_type, severity,
            resolution_text, cost_impact, schedule_impact_days, resulted_in_co,
            abstracted_summary, embedding, metadata, item_date
        FROM intelligence.items
        WHERE company_id = $1
          AND trade_category ILIKE $2
          AND ({keyword_clause})
        LIMIT ${param_idx}
    """
    params.append(limit)
    rows = await db.fetch(query, *params)

    results = []
    for row in rows:
        item = dict(row)
        item["tier"] = 1
        results.append(item)

    return results


async def tier2_search(
    company_id: str,
    trade: str,
    query_embedding: list[float],
    limit: int = 20,
    exclude_ids: set = None
) -> list[dict]:
    """
    Tier 2: Same trade + semantic similarity.
    """
    if not trade or not query_embedding:
        return []

    exclude_ids = exclude_ids or set()

    rows = await db.fetch("""
        SELECT
            id, source_project_id, source_project_name, source_type, source_ref,
            raw_text, question_text, normalized_text, project_phase, phase_percentage,
            trade_category, issue_type, severity,
            resolution_text, cost_impact, schedule_impact_days, resulted_in_co,
            abstracted_summary, embedding, metadata, item_date
        FROM intelligence.items
        WHERE company_id = $1
          AND trade_category ILIKE $2
          AND embedding IS NOT NULL
        LIMIT 200
    """, company_id, f"%{trade}%")

    # Compute similarities in Python (pgvector not installed)
    query_vec = np.array(query_embedding)
    scored = []
    for row in rows:
        item_id = str(row["id"])
        if item_id in exclude_ids:
            continue
        if row["embedding"]:
            cand_vec = np.array(row["embedding"])
            sim = cosine_similarity(query_vec, cand_vec)
            item = dict(row)
            item["tier"] = 2
            item["semantic_score"] = sim
            scored.append((item, sim))

    # Sort by similarity and return top
    scored.sort(key=lambda x: x[1], reverse=True)
    return [item for item, _ in scored[:limit]]


async def tier3_search(
    company_id: str,
    related_trades: list[str],
    query_embedding: list[float],
    limit: int = 20,
    exclude_ids: set = None
) -> list[dict]:
    """
    Tier 3: Related trades + semantic similarity.
    """
    if not related_trades or not query_embedding:
        return []

    exclude_ids = exclude_ids or set()

    # Build trade pattern for ILIKE
    trade_patterns = [f"%{t}%" for t in related_trades]

    rows = await db.fetch("""
        SELECT
            id, source_project_id, source_project_name, source_type, source_ref,
            raw_text, question_text, normalized_text, project_phase, phase_percentage,
            trade_category, issue_type, severity,
            resolution_text, cost_impact, schedule_impact_days, resulted_in_co,
            abstracted_summary, embedding, metadata, item_date
        FROM intelligence.items
        WHERE company_id = $1
          AND embedding IS NOT NULL
          AND (
              trade_category ILIKE ANY($2)
          )
        LIMIT 300
    """, company_id, trade_patterns)

    # Compute similarities
    query_vec = np.array(query_embedding)
    scored = []
    for row in rows:
        item_id = str(row["id"])
        if item_id in exclude_ids:
            continue
        if row["embedding"]:
            cand_vec = np.array(row["embedding"])
            sim = cosine_similarity(query_vec, cand_vec)
            item = dict(row)
            item["tier"] = 3
            item["semantic_score"] = sim
            scored.append((item, sim))

    scored.sort(key=lambda x: x[1], reverse=True)
    return [item for item, _ in scored[:limit]]


async def tier4_search(
    company_id: str,
    query_embedding: list[float],
    limit: int = 20,
    exclude_ids: set = None
) -> list[dict]:
    """
    Tier 4: Open search - all items, semantic only.
    """
    if not query_embedding:
        return []

    exclude_ids = exclude_ids or set()

    rows = await db.fetch("""
        SELECT
            id, source_project_id, source_project_name, source_type, source_ref,
            raw_text, question_text, normalized_text, project_phase, phase_percentage,
            trade_category, issue_type, severity,
            resolution_text, cost_impact, schedule_impact_days, resulted_in_co,
            abstracted_summary, embedding, metadata, item_date
        FROM intelligence.items
        WHERE company_id = $1
          AND embedding IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 500
    """, company_id)

    # Compute similarities
    query_vec = np.array(query_embedding)
    scored = []
    for row in rows:
        item_id = str(row["id"])
        if item_id in exclude_ids:
            continue
        if row["embedding"]:
            cand_vec = np.array(row["embedding"])
            sim = cosine_similarity(query_vec, cand_vec)
            item = dict(row)
            item["tier"] = 4
            item["semantic_score"] = sim
            scored.append((item, sim))

    scored.sort(key=lambda x: x[1], reverse=True)
    return [item for item, _ in scored[:limit]]


async def get_entities_for_candidates(item_ids: list[str]) -> dict[str, list[dict]]:
    """Fetch entities for candidate items."""
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


async def tiered_search_and_rank(
    query_embedding: list[float],
    company_id: str,
    query_text: Optional[str] = None,
    query_trade: Optional[str] = None,
    top_k: int = 20,
    min_final_score: float = 0.25,
    query_phase: Optional[str] = None,
    query_entities: Optional[dict[str, set[str]]] = None,
    query_key_terms: Optional[list[str]] = None,
    query_issue_type: Optional[str] = None,
    weights: Optional[dict[str, float]] = None,
    debug: bool = False
) -> list[dict]:
    """
    Tiered retrieval with trade-focused search.

    Args:
        query_embedding: Embedding of the observation
        company_id: Company ID
        query_text: Original text for keyword extraction
        query_trade: Trade category (if known)
        top_k: Number of results to return
        min_final_score: Minimum score threshold
        query_phase: Construction phase
        query_entities: Extracted entities
        query_key_terms: Pre-computed key terms (from LLM abstraction)
        query_issue_type: Pre-computed issue type (from LLM abstraction)
        weights: Custom ranking weights
        debug: Include tier info in results

    Returns:
        Ranked list of similar items
    """
    # Extract keywords for FTS
    keywords = extract_search_keywords(query_text) if query_text else []
    # Also extract for ranking (legacy)
    query_keywords = extract_all_keywords_flat(query_text) if query_text else set()

    # Extract key terms and issue type if not provided
    # Uses fast rule-based approach for real-time queries
    if query_text and not query_key_terms:
        query_key_terms, extracted_issue_type = extract_query_abstraction(query_text)
        if not query_issue_type:
            query_issue_type = extracted_issue_type

    # Determine trade for search
    trade = query_trade.split(",")[0].strip() if query_trade else None

    # Get related trades
    related_trades = get_related_trades(trade) if trade else []

    # Collect results from all tiers
    all_results = []
    seen_ids = set()

    # Tier 1: Same trade + keywords
    if trade and keywords:
        tier1_results = await tier1_search(company_id, trade, keywords, limit=20)
        for item in tier1_results:
            item_id = str(item["id"])
            if item_id not in seen_ids:
                seen_ids.add(item_id)
                all_results.append(item)

    # Tier 2: Same trade + semantic
    if trade:
        tier2_results = await tier2_search(
            company_id, trade, query_embedding, limit=20, exclude_ids=seen_ids
        )
        for item in tier2_results:
            item_id = str(item["id"])
            if item_id not in seen_ids:
                seen_ids.add(item_id)
                all_results.append(item)

    # Tier 3: Related trades + semantic
    if related_trades:
        tier3_results = await tier3_search(
            company_id, related_trades, query_embedding, limit=20, exclude_ids=seen_ids
        )
        for item in tier3_results:
            item_id = str(item["id"])
            if item_id not in seen_ids:
                seen_ids.add(item_id)
                all_results.append(item)

    # Tier 4: Open search (always run as fallback)
    tier4_results = await tier4_search(
        company_id, query_embedding, limit=20, exclude_ids=seen_ids
    )
    for item in tier4_results:
        item_id = str(item["id"])
        if item_id not in seen_ids:
            seen_ids.add(item_id)
            all_results.append(item)

    if not all_results:
        return []

    # Ensure all items have semantic_score
    query_vec = np.array(query_embedding)
    for item in all_results:
        if "semantic_score" not in item and item.get("embedding"):
            cand_vec = np.array(item["embedding"])
            item["semantic_score"] = cosine_similarity(query_vec, cand_vec)
        elif "semantic_score" not in item:
            item["semantic_score"] = 0.0

    # Apply tier boosts
    for item in all_results:
        tier = item.get("tier", 4)
        boost = TIER_BOOSTS.get(tier, 0.0)
        item["tier_boost"] = boost
        # Apply boost to semantic score for ranking
        item["boosted_semantic_score"] = item["semantic_score"] + boost

    # Get entities for ranking
    item_ids = [str(item["id"]) for item in all_results]
    entities_by_item = await get_entities_for_candidates(item_ids)

    # Prepare for ranking
    candidates_with_semantic = [
        (item, item["boosted_semantic_score"]) for item in all_results
    ]

    # Apply full ranking with abstraction-based scoring
    ranked = rank_candidates(
        candidates_with_semantic=candidates_with_semantic,
        query_phase=query_phase,
        query_entities=query_entities,
        entities_by_item=entities_by_item,
        query_keywords=query_keywords,
        query_key_terms=query_key_terms,
        query_issue_type=query_issue_type,
        weights=weights,
        top_k=top_k,
        min_final_score=min_final_score
    )

    # Add debug info if requested
    if debug:
        for item in ranked:
            item["_debug"] = {
                "tier": item.get("tier", 4),
                "tier_boost": item.get("tier_boost", 0),
                "raw_semantic": item.get("semantic_score", 0),
                "keywords_used": keywords,
                "query_key_terms": query_key_terms,
                "query_issue_type": query_issue_type,
                "trade_searched": trade,
                "related_trades": related_trades,
            }

    return ranked
