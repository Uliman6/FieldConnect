"""
Ranking algorithm that combines multiple scoring factors:
- Keyword matching (critical for construction domain)
- Semantic similarity (embeddings)
- Phase proximity (construction timeline)
- Entity overlap (trades, materials, locations)
- Outcome significance (cost/schedule impact)
- Recency weighting

The final score is a weighted combination of all factors.
KEYWORD MATCHING IS CRITICAL - items with matching keywords should rank highly.
"""

import logging
from typing import Optional
from datetime import date, timedelta

logger = logging.getLogger(__name__)

# Default weights for ranking factors
# IMPORTANT: With abstracted summaries, we can rely more on semantic similarity
# since embeddings are now based on clean, focused scope summaries
DEFAULT_WEIGHTS = {
    "semantic": 0.30,      # Embedding similarity (now from abstracted scope)
    "key_terms": 0.25,     # Abstracted key terms matching
    "issue_type": 0.15,    # Same issue type boost
    "phase": 0.12,         # Phase proximity
    "entity": 0.08,        # Entity overlap (from extraction)
    "outcome": 0.05,       # Cost/schedule impact significance
    "recency": 0.03,       # Recent items slightly boosted
    "keyword": 0.02,       # Legacy raw keyword matching (fallback)
}

# Construction phases in chronological order
PHASE_ORDER = [
    "preconstruction",
    "sitework",
    "foundation",
    "structure",
    "envelope",
    "mep_rough_in",
    "interior_framing",
    "interior_finishes",
    "mep_trim_out",
    "commissioning",
    "closeout"
]

# Phase index lookup for distance calculations
PHASE_INDEX = {phase: i for i, phase in enumerate(PHASE_ORDER)}


def calculate_keyword_score(
    query_keywords: set[str],
    candidate: dict
) -> dict:
    """
    Calculate keyword matching score between query keywords and candidate.

    This is CRITICAL for relevance - if the query mentions "curtainwall",
    results containing "curtainwall" should rank very high.

    IMPORTANT: Prioritizes question_text for matching, as it contains
    the actual issue/clarification needed. Falls back to normalized_text
    and raw_text if question_text is not available.

    Args:
        query_keywords: Set of keywords extracted from query
        candidate: The candidate item dict with text fields

    Returns:
        Dict with score and matched keywords info
    """
    if not query_keywords:
        return {
            "score": 0.0,
            "matched_keywords": [],
            "match_count": 0,
            "query_coverage": 0.0
        }

    # Prioritize question_text (clean RFI question/punch description)
    # Fall back to normalized_text, then raw_text
    question_text = candidate.get("question_text") or ""
    normalized_text = candidate.get("normalized_text") or ""
    raw_text = candidate.get("raw_text") or ""

    # Combine texts for matching - question_text is most reliable
    candidate_text = f"{question_text} {normalized_text} {raw_text}".lower()

    if not candidate_text.strip():
        return {
            "score": 0.0,
            "matched_keywords": [],
            "match_count": 0,
            "query_coverage": 0.0
        }

    matched = []

    for keyword in query_keywords:
        # Check if keyword appears in candidate text
        if keyword.lower() in candidate_text:
            matched.append(keyword)

    match_count = len(matched)
    query_coverage = match_count / len(query_keywords)

    # Scoring: heavily reward multiple keyword matches
    # 0 matches = 0.0
    # 1 match = 0.5 (still good - shows relevance)
    # 2 matches = 0.8 (very good - multiple relevant terms)
    # 3+ matches = 0.95+ (excellent - highly relevant)
    if match_count == 0:
        score = 0.0
    elif match_count == 1:
        score = 0.5
    elif match_count == 2:
        score = 0.8
    else:
        score = min(1.0, 0.9 + (match_count - 2) * 0.05)

    return {
        "score": score,
        "matched_keywords": matched,
        "match_count": match_count,
        "query_coverage": query_coverage
    }


def calculate_phase_score(query_phase: Optional[str], candidate_phase: Optional[str]) -> float:
    """
    Calculate phase proximity score.

    Returns:
        1.0 for same phase
        0.8 for adjacent phases
        Decreasing score for more distant phases
        0.5 if either phase is unknown
    """
    if not query_phase or not candidate_phase:
        return 0.5  # Neutral score for unknown phases

    query_idx = PHASE_INDEX.get(query_phase.lower())
    cand_idx = PHASE_INDEX.get(candidate_phase.lower())

    if query_idx is None or cand_idx is None:
        return 0.5  # Unknown phase names

    distance = abs(query_idx - cand_idx)

    if distance == 0:
        return 1.0  # Same phase
    elif distance == 1:
        return 0.85  # Adjacent phase
    elif distance == 2:
        return 0.7
    elif distance == 3:
        return 0.5
    else:
        # Diminishing returns for very distant phases
        return max(0.2, 1.0 - (distance * 0.15))


def calculate_entity_overlap_score(
    query_entities: dict[str, set[str]],
    candidate_entities: list[dict]
) -> float:
    """
    Calculate entity overlap score between query and candidate.

    Args:
        query_entities: Dict of entity_type -> set of normalized values
        candidate_entities: List of entity dicts from candidate item

    Returns:
        Score from 0.0 to 1.0 based on overlap
    """
    if not query_entities or not candidate_entities:
        return 0.0

    # Build candidate entity sets
    candidate_sets = {}
    for entity in candidate_entities:
        etype = entity.get("entity_type", "")
        value = entity.get("normalized_value", "").lower()
        if etype and value:
            if etype not in candidate_sets:
                candidate_sets[etype] = set()
            candidate_sets[etype].add(value)

    if not candidate_sets:
        return 0.0

    # Calculate overlap for each entity type
    # Weight different entity types differently
    type_weights = {
        "trade": 0.35,      # Trade matches are highly significant
        "material": 0.25,   # Material matches are important
        "location": 0.20,   # Location relevance
        "spec_section": 0.10,
        "drawing_ref": 0.05,
        "brand": 0.05,
    }

    total_weight = 0.0
    weighted_overlap = 0.0

    for etype, query_values in query_entities.items():
        weight = type_weights.get(etype, 0.05)
        total_weight += weight

        if etype in candidate_sets:
            cand_values = candidate_sets[etype]
            # Jaccard-like overlap
            intersection = len(query_values & cand_values)
            union = len(query_values | cand_values)
            if union > 0:
                overlap = intersection / union
                weighted_overlap += weight * overlap

    if total_weight == 0:
        return 0.0

    return weighted_overlap / total_weight


def calculate_outcome_score(candidate: dict) -> float:
    """
    Calculate outcome significance score.
    Items with cost impact, schedule delays, or change orders are more significant.

    Returns:
        Score from 0.0 to 1.0
    """
    score = 0.0

    # Cost impact (normalized)
    cost_impact = candidate.get("cost_impact")
    if cost_impact and cost_impact > 0:
        # Log scale for cost - $1k = 0.3, $10k = 0.5, $100k = 0.7
        import math
        cost_score = min(1.0, 0.3 + (math.log10(max(1, cost_impact)) - 3) * 0.2)
        score = max(score, cost_score)

    # Schedule impact
    schedule_days = candidate.get("schedule_impact_days")
    if schedule_days and schedule_days > 0:
        # 1 day = 0.2, 5 days = 0.4, 10+ days = 0.6
        schedule_score = min(0.8, 0.2 + (schedule_days * 0.04))
        score = max(score, schedule_score)

    # Change order
    if candidate.get("resulted_in_co"):
        score = max(score, 0.7)

    # Has resolution (indicates it was tracked to completion)
    if candidate.get("resolution_text"):
        score = max(score, 0.3)

    return score


def calculate_recency_score(
    candidate_date: Optional[date],
    reference_date: Optional[date] = None,
    decay_days: int = 365
) -> float:
    """
    Calculate recency score with time decay.
    More recent items get higher scores.

    Args:
        candidate_date: Date of the candidate item
        reference_date: Reference date (defaults to today)
        decay_days: Days over which score decays from 1.0 to 0.5

    Returns:
        Score from 0.5 to 1.0
    """
    if not candidate_date:
        return 0.7  # Neutral-ish for unknown dates

    if reference_date is None:
        reference_date = date.today()

    # Handle both date and datetime
    if hasattr(candidate_date, 'date'):
        candidate_date = candidate_date.date()

    days_old = (reference_date - candidate_date).days

    if days_old <= 0:
        return 1.0
    elif days_old >= decay_days * 2:
        return 0.5
    else:
        # Linear decay from 1.0 to 0.5 over decay_days*2
        return 1.0 - (days_old / (decay_days * 4))


def calculate_key_terms_score(
    query_terms: list[str],
    candidate_abstraction: Optional[dict]
) -> dict:
    """
    Calculate key terms matching score between query and candidate abstraction.

    This compares abstracted key terms (extracted by LLM) for semantic matching.
    Key terms are technical construction terms like "splice plate", "fillet weld", etc.

    Args:
        query_terms: Key terms from query abstraction
        candidate_abstraction: Abstracted summary dict from candidate item

    Returns:
        Dict with score and matched terms info
    """
    if not query_terms:
        return {
            "score": 0.0,
            "matched_terms": [],
            "match_count": 0,
            "query_coverage": 0.0
        }

    if not candidate_abstraction:
        return {
            "score": 0.0,
            "matched_terms": [],
            "match_count": 0,
            "query_coverage": 0.0
        }

    candidate_terms = candidate_abstraction.get("key_terms", [])
    if not candidate_terms:
        return {
            "score": 0.0,
            "matched_terms": [],
            "match_count": 0,
            "query_coverage": 0.0
        }

    # Normalize terms for comparison
    query_set = {t.lower().strip() for t in query_terms}
    candidate_set = {t.lower().strip() for t in candidate_terms}

    # Find exact matches
    exact_matches = query_set & candidate_set

    # Find partial matches (one term contains the other)
    partial_matches = []
    for qt in query_set:
        if qt in exact_matches:
            continue
        for ct in candidate_set:
            if ct in exact_matches:
                continue
            # Check if one contains the other
            if qt in ct or ct in qt:
                partial_matches.append((qt, ct))
                break

    total_matches = len(exact_matches) + len(partial_matches) * 0.7
    query_coverage = total_matches / len(query_set) if query_set else 0

    # Scoring: reward multiple term matches
    # 0 matches = 0.0
    # 1 match = 0.5
    # 2 matches = 0.75
    # 3+ matches = 0.9+
    if total_matches == 0:
        score = 0.0
    elif total_matches < 1:
        score = 0.35  # Partial match only
    elif total_matches < 2:
        score = 0.5
    elif total_matches < 3:
        score = 0.75
    else:
        score = min(1.0, 0.85 + (total_matches - 3) * 0.05)

    matched = list(exact_matches) + [f"{p[0]}~{p[1]}" for p in partial_matches[:2]]

    return {
        "score": score,
        "matched_terms": matched,
        "match_count": total_matches,
        "query_coverage": query_coverage
    }


def calculate_issue_type_score(
    query_issue_type: Optional[str],
    candidate_abstraction: Optional[dict]
) -> float:
    """
    Calculate issue type matching score.

    Issue types are categories like: dimension, material, detail_conflict,
    coordination, missing_info, confirmation, remediation, installation.

    Same type = 1.0
    Related types = 0.6-0.8
    Different types = 0.3

    Args:
        query_issue_type: Issue type from query
        candidate_abstraction: Abstracted summary dict from candidate

    Returns:
        Score from 0.3 to 1.0
    """
    if not query_issue_type:
        return 0.5  # Neutral when unknown

    if not candidate_abstraction:
        return 0.5

    candidate_type = candidate_abstraction.get("issue_type", "general")
    if not candidate_type:
        return 0.5

    query_type = query_issue_type.lower().strip()
    candidate_type = candidate_type.lower().strip()

    # Exact match
    if query_type == candidate_type:
        return 1.0

    # Define related issue type groups
    RELATED_TYPES = {
        # Design/documentation issues
        "dimension": ["dimension_clarification", "missing_information", "missing_info", "detail_conflict"],
        "dimension_clarification": ["dimension", "missing_information", "missing_info", "detail_conflict"],
        "missing_information": ["dimension", "dimension_clarification", "missing_info", "detail_conflict"],
        "missing_info": ["dimension", "dimension_clarification", "missing_information", "detail_conflict"],
        "detail_conflict": ["dimension", "missing_information", "coordination"],

        # Installation/execution issues
        "material": ["material_substitution", "installation_method", "installation"],
        "material_substitution": ["material", "installation_method", "installation"],
        "installation_method": ["material", "coordination", "installation"],
        "installation": ["installation_method", "material", "coordination"],

        # Coordination issues
        "coordination": ["detail_conflict", "installation_method", "installation"],

        # Remediation
        "remediation": ["detail_conflict", "coordination"],

        # Confirmation (related to many)
        "confirmation": ["dimension", "material", "installation_method"],
    }

    related = RELATED_TYPES.get(query_type, [])
    if candidate_type in related:
        return 0.7

    # Check reverse relationship
    candidate_related = RELATED_TYPES.get(candidate_type, [])
    if query_type in candidate_related:
        return 0.7

    # Unrelated but both known
    return 0.3


def compute_ranking_score(
    candidate: dict,
    semantic_score: float,
    query_phase: Optional[str] = None,
    query_entities: Optional[dict[str, set[str]]] = None,
    candidate_entities: Optional[list[dict]] = None,
    query_keywords: Optional[set[str]] = None,
    query_key_terms: Optional[list[str]] = None,
    query_issue_type: Optional[str] = None,
    weights: Optional[dict[str, float]] = None
) -> dict:
    """
    Compute the combined ranking score for a candidate.

    Args:
        candidate: The candidate item dict (includes abstracted_summary if available)
        semantic_score: Pre-computed semantic similarity score
        query_phase: Phase of the query/observation
        query_entities: Extracted entities from query
        candidate_entities: Entities linked to candidate item
        query_keywords: Keywords extracted from query (legacy, fallback)
        query_key_terms: Abstracted key terms from query (preferred)
        query_issue_type: Issue type from query abstraction
        weights: Custom weights for ranking factors

    Returns:
        Dict with individual scores and combined final_score
    """
    w = weights or DEFAULT_WEIGHTS

    # Ensure weights sum to 1.0
    total_weight = sum(w.values())
    if total_weight != 1.0:
        w = {k: v / total_weight for k, v in w.items()}

    # Get candidate abstraction if available
    candidate_abstraction = candidate.get("abstracted_summary")
    if isinstance(candidate_abstraction, str):
        try:
            import json
            candidate_abstraction = json.loads(candidate_abstraction)
        except (json.JSONDecodeError, TypeError):
            candidate_abstraction = None

    # Calculate KEY TERMS score (from abstraction - preferred)
    key_terms_result = calculate_key_terms_score(
        query_key_terms or [],
        candidate_abstraction
    )
    key_terms_score = key_terms_result["score"]
    matched_terms = key_terms_result["matched_terms"]

    # Calculate ISSUE TYPE score (from abstraction)
    issue_type_score = calculate_issue_type_score(
        query_issue_type,
        candidate_abstraction
    )

    # Calculate legacy KEYWORD score (fallback for items without abstraction)
    keyword_result = calculate_keyword_score(
        query_keywords or set(),
        candidate
    )
    keyword_score = keyword_result["score"]
    matched_keywords = keyword_result["matched_keywords"]

    # Calculate other individual scores
    phase_score = calculate_phase_score(
        query_phase,
        candidate.get("project_phase")
    )

    entity_score = calculate_entity_overlap_score(
        query_entities or {},
        candidate_entities or []
    )

    outcome_score = calculate_outcome_score(candidate)

    recency_score = calculate_recency_score(
        candidate.get("item_date")
    )

    # Compute weighted final score using new abstraction-based weights
    final_score = (
        w.get("semantic", 0.30) * semantic_score +
        w.get("key_terms", 0.25) * key_terms_score +
        w.get("issue_type", 0.15) * issue_type_score +
        w.get("phase", 0.12) * phase_score +
        w.get("entity", 0.08) * entity_score +
        w.get("outcome", 0.05) * outcome_score +
        w.get("recency", 0.03) * recency_score +
        w.get("keyword", 0.02) * keyword_score  # Legacy fallback
    )

    return {
        "key_terms_score": round(key_terms_score, 4),
        "matched_terms": matched_terms,
        "issue_type_score": round(issue_type_score, 4),
        "keyword_score": round(keyword_score, 4),
        "matched_keywords": matched_keywords,
        "semantic_score": round(semantic_score, 4),
        "phase_score": round(phase_score, 4),
        "entity_score": round(entity_score, 4),
        "outcome_score": round(outcome_score, 4),
        "recency_score": round(recency_score, 4),
        "final_score": round(final_score, 4),
        "weights_used": w
    }


def rank_candidates(
    candidates_with_semantic: list[tuple[dict, float]],
    query_phase: Optional[str] = None,
    query_entities: Optional[dict[str, set[str]]] = None,
    entities_by_item: Optional[dict[str, list[dict]]] = None,
    query_keywords: Optional[set[str]] = None,
    query_key_terms: Optional[list[str]] = None,
    query_issue_type: Optional[str] = None,
    weights: Optional[dict[str, float]] = None,
    top_k: int = 20,
    min_final_score: float = 0.25
) -> list[dict]:
    """
    Rank candidates using combined scoring.

    Args:
        candidates_with_semantic: List of (candidate, semantic_score) tuples
        query_phase: Phase of the query
        query_entities: Entities from query, dict of type -> set of values
        entities_by_item: Pre-loaded entities, dict of item_id -> list of entities
        query_keywords: Keywords extracted from query (legacy fallback)
        query_key_terms: Abstracted key terms from query (preferred)
        query_issue_type: Issue type from query abstraction
        weights: Custom ranking weights
        top_k: Number of results to return
        min_final_score: Minimum combined score threshold

    Returns:
        List of candidates sorted by final_score, with scores attached
    """
    if not candidates_with_semantic:
        return []

    entities_by_item = entities_by_item or {}

    ranked = []
    for candidate, semantic_score in candidates_with_semantic:
        item_id = str(candidate.get("id", ""))
        candidate_entities = entities_by_item.get(item_id, [])

        scores = compute_ranking_score(
            candidate=candidate,
            semantic_score=semantic_score,
            query_phase=query_phase,
            query_entities=query_entities,
            candidate_entities=candidate_entities,
            query_keywords=query_keywords,
            query_key_terms=query_key_terms,
            query_issue_type=query_issue_type,
            weights=weights
        )

        if scores["final_score"] >= min_final_score:
            # Attach scores to candidate
            candidate_copy = dict(candidate)
            candidate_copy.update(scores)
            ranked.append(candidate_copy)

    # Sort by final score descending
    ranked.sort(key=lambda x: x["final_score"], reverse=True)

    return ranked[:top_k]


def explain_ranking(result: dict) -> str:
    """
    Generate a human-readable explanation of why an item ranked highly.
    """
    explanations = []

    # Key terms matches (from abstraction) - most important
    matched_terms = result.get("matched_terms", [])
    key_terms_score = result.get("key_terms_score", 0)
    if matched_terms:
        terms_str = ", ".join(matched_terms[:3])
        if len(matched_terms) > 3:
            terms_str += f" +{len(matched_terms) - 3} more"
        explanations.append(f"Matched terms: {terms_str}")
    elif key_terms_score > 0:
        explanations.append(f"Partial term match ({key_terms_score:.0%})")

    # Issue type match (from abstraction)
    issue_type_score = result.get("issue_type_score", 0)
    if issue_type_score >= 1.0:
        explanations.append("Same issue type")
    elif issue_type_score >= 0.7:
        explanations.append("Related issue type")

    # Semantic match
    semantic = result.get("semantic_score", 0)
    if semantic >= 0.5:
        explanations.append(f"Strong semantic match ({semantic:.0%})")
    elif semantic >= 0.35:
        explanations.append(f"Moderate semantic match ({semantic:.0%})")

    # Legacy keyword matches (fallback)
    matched_keywords = result.get("matched_keywords", [])
    if matched_keywords and not matched_terms:  # Only show if no term matches
        kw_str = ", ".join(matched_keywords[:3])
        if len(matched_keywords) > 3:
            kw_str += f" +{len(matched_keywords) - 3} more"
        explanations.append(f"Matched keywords: {kw_str}")

    phase = result.get("phase_score", 0)
    if phase >= 0.85:
        explanations.append("Same/adjacent construction phase")
    elif phase >= 0.7:
        explanations.append("Similar construction phase")

    entity = result.get("entity_score", 0)
    if entity >= 0.3:
        explanations.append("Overlapping trades/materials")

    outcome = result.get("outcome_score", 0)
    if outcome >= 0.5:
        if result.get("resulted_in_co"):
            explanations.append("Led to change order")
        elif result.get("cost_impact"):
            explanations.append(f"Had cost impact (${result['cost_impact']:,.0f})")
        elif result.get("schedule_impact_days"):
            explanations.append(f"Caused {result['schedule_impact_days']} day delay")

    if not explanations:
        explanations.append("General relevance")

    return "; ".join(explanations)
