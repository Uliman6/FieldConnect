"""
Privacy Guard - Abstracts source data into safe-to-surface alerts.

Every result passes through this before reaching the user. It transforms
raw source data into abstracted, actionable learnings without exposing
proprietary project details.

Includes database caching to avoid regenerating abstractions on every request.
"""

import re
import hashlib
import logging
from typing import Optional
from openai import OpenAI

from config import settings

logger = logging.getLogger(__name__)

# Initialize OpenAI client
openai_client = OpenAI(api_key=settings.openai_api_key)


ABSTRACTION_PROMPT = """You are writing a brief, actionable construction alert.
Given the source RFI below, create an abstracted version that:

1. REMOVES all project names, specific addresses, company names, and person names
2. KEEPS the technical learning - what the issue was, what trade, what material
3. KEEPS the outcome if mentioned - rework, cost impact, schedule impact, change order
4. Includes a recommended action if one can be inferred
5. Is 2-3 sentences maximum

Source RFI:
{source_text}

Resolution (if available):
{resolution_text}

Cost impact: {cost_impact}
Schedule impact: {schedule_impact} days
Resulted in change order: {resulted_in_co}

Write the alert. Do NOT include any project names, company names, person names, or RFI numbers.
Start directly with the technical issue - do not say "Alert:" or similar."""


def _scrub_identifiers(text: str) -> str:
    """
    Remove common identifiers from text as a safety net.
    This catches anything the LLM might miss.
    """
    if not text:
        return ""

    result = text

    # Remove RFI numbers (RFI-0123, RFI 456, etc.)
    result = re.sub(r'\bRFI[-\s]?\d+(?:\.\d+)?\b', '', result, flags=re.IGNORECASE)

    # Remove project codes (SLP1, SVOP, etc.)
    result = re.sub(r'\b[A-Z]{2,5}\d?\s*[-–]\s*', '', result)

    # Remove common project name patterns
    result = re.sub(r'\b(?:Project|Job|Site)\s+[A-Z][a-zA-Z0-9\s]+(?=\s|,|\.)', '', result)

    # Remove email addresses
    result = re.sub(r'\b[\w.-]+@[\w.-]+\.\w+\b', '[email]', result)

    # Remove phone numbers
    result = re.sub(r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b', '[phone]', result)

    # Clean up extra whitespace
    result = re.sub(r'\s+', ' ', result).strip()

    return result


def generate_abstracted_alert(
    source_text: str,
    resolution_text: Optional[str] = None,
    cost_impact: Optional[float] = None,
    schedule_impact_days: Optional[int] = None,
    resulted_in_co: bool = False,
    cache_key: Optional[str] = None
) -> str:
    """
    Generate a privacy-safe abstracted alert from source RFI text.

    Args:
        source_text: The raw RFI description text
        resolution_text: The resolution/response text if available
        cost_impact: Dollar amount of cost impact if known
        schedule_impact_days: Days of schedule impact if known
        resulted_in_co: Whether this resulted in a change order
        cache_key: Optional key for caching (usually item ID)

    Returns:
        Abstracted alert text safe for display
    """
    if not source_text or len(source_text.strip()) < 20:
        return ""

    # Truncate inputs to manage token usage
    source_truncated = source_text[:1500]
    resolution_truncated = (resolution_text or "")[:500]

    # Format impact values
    cost_str = f"${cost_impact:,.0f}" if cost_impact else "Unknown"
    schedule_str = str(schedule_impact_days) if schedule_impact_days else "Unknown"
    co_str = "Yes" if resulted_in_co else "No"

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You write concise construction field alerts. Never include project names, company names, person names, or RFI numbers."
                },
                {
                    "role": "user",
                    "content": ABSTRACTION_PROMPT.format(
                        source_text=source_truncated,
                        resolution_text=resolution_truncated or "Not available",
                        cost_impact=cost_str,
                        schedule_impact=schedule_str,
                        resulted_in_co=co_str
                    )
                }
            ],
            temperature=0.3,
            max_tokens=200
        )

        alert_text = response.choices[0].message.content.strip()

        # Safety scrub - remove any identifiers the LLM might have missed
        alert_text = _scrub_identifiers(alert_text)

        return alert_text

    except Exception as e:
        # Return a generic fallback rather than exposing raw text
        return f"A similar issue was identified in a previous project. Review historical data for resolution approaches."


def generate_match_reason(
    query_text: str,
    matched_text: str,
    matched_trade: Optional[str] = None,
    matched_phase: Optional[str] = None,
    score: float = 0.0
) -> str:
    """
    Generate a brief explanation of why this match was surfaced.

    Args:
        query_text: The user's observation/query
        matched_text: The matched historical item text
        matched_trade: Trade category of the match
        matched_phase: Project phase of the match
        score: Relevance score

    Returns:
        Brief match reason string
    """
    parts = []

    if matched_trade:
        parts.append(f"Related {matched_trade} issue")

    if matched_phase:
        phase_display = matched_phase.replace("_", " ").title()
        parts.append(f"from {phase_display} phase")

    if score >= 0.8:
        parts.append("(high relevance)")
    elif score >= 0.6:
        parts.append("(moderate relevance)")

    if parts:
        return " ".join(parts)
    else:
        return "Similar historical issue found"


def compute_alert_hash(source_text: str) -> str:
    """
    Compute a hash for caching abstracted alerts.
    Same source text will produce the same hash.
    """
    normalized = source_text.lower().strip()
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


# ============================================================================
# Database Caching Functions
# ============================================================================

async def get_cached_abstraction(item_id: str) -> Optional[str]:
    """
    Check if an abstracted summary is already cached in the database.

    Args:
        item_id: The UUID of the intelligence.items row

    Returns:
        Cached abstracted_summary if exists, None otherwise
    """
    from db import fetchval

    try:
        result = await fetchval(
            """
            SELECT abstracted_summary
            FROM intelligence.items
            WHERE id = $1 AND abstracted_summary IS NOT NULL
            """,
            item_id
        )
        return result
    except Exception as e:
        logger.warning(f"Error fetching cached abstraction for {item_id}: {e}")
        return None


async def save_abstraction_to_cache(item_id: str, abstracted_text: str) -> bool:
    """
    Save an abstracted summary to the database cache.

    Args:
        item_id: The UUID of the intelligence.items row
        abstracted_text: The privacy-safe abstracted text

    Returns:
        True if saved successfully, False otherwise
    """
    from db import execute

    try:
        await execute(
            """
            UPDATE intelligence.items
            SET abstracted_summary = $2, updated_at = NOW()
            WHERE id = $1
            """,
            item_id,
            abstracted_text
        )
        logger.debug(f"Cached abstraction for item {item_id}")
        return True
    except Exception as e:
        logger.warning(f"Error caching abstraction for {item_id}: {e}")
        return False


async def get_or_generate_abstraction(
    item_id: str,
    source_text: str,
    resolution_text: Optional[str] = None,
    cost_impact: Optional[float] = None,
    schedule_impact_days: Optional[int] = None,
    resulted_in_co: bool = False
) -> str:
    """
    Get cached abstraction or generate and cache a new one.

    This is the main entry point for alert abstraction with caching.
    It first checks the database cache, and if not found, generates
    a new abstraction using the LLM and saves it to the cache.

    Args:
        item_id: The UUID of the intelligence.items row
        source_text: The raw RFI description text
        resolution_text: The resolution/response text if available
        cost_impact: Dollar amount of cost impact if known
        schedule_impact_days: Days of schedule impact if known
        resulted_in_co: Whether this resulted in a change order

    Returns:
        Abstracted alert text safe for display
    """
    # Try to get from cache first
    cached = await get_cached_abstraction(item_id)
    if cached:
        logger.debug(f"Cache hit for item {item_id}")
        return cached

    logger.debug(f"Cache miss for item {item_id}, generating...")

    # Generate new abstraction
    abstracted = generate_abstracted_alert(
        source_text=source_text,
        resolution_text=resolution_text,
        cost_impact=cost_impact,
        schedule_impact_days=schedule_impact_days,
        resulted_in_co=resulted_in_co
    )

    # Save to cache (fire and forget - don't block on cache write)
    if abstracted and len(abstracted) > 10:
        await save_abstraction_to_cache(item_id, abstracted)

    return abstracted


async def batch_get_or_generate_abstractions(
    items: list[dict],
    max_concurrent: int = 5
) -> dict[str, str]:
    """
    Get or generate abstractions for multiple items efficiently.

    First fetches all cached abstractions in a single query,
    then generates missing ones with rate limiting.

    Args:
        items: List of dicts with 'id', 'raw_text', 'resolution_text', etc.
        max_concurrent: Max concurrent LLM calls

    Returns:
        Dict mapping item_id to abstracted text
    """
    import asyncio
    from db import fetch

    if not items:
        return {}

    item_ids = [item['id'] for item in items]
    item_lookup = {item['id']: item for item in items}
    results = {}

    # Batch fetch all cached abstractions
    try:
        rows = await fetch(
            """
            SELECT id::text, abstracted_summary
            FROM intelligence.items
            WHERE id = ANY($1::uuid[]) AND abstracted_summary IS NOT NULL
            """,
            item_ids
        )
        for row in rows:
            results[row['id']] = row['abstracted_summary']
    except Exception as e:
        logger.warning(f"Error batch fetching cached abstractions: {e}")

    # Find items that need generation
    missing = [item_id for item_id in item_ids if item_id not in results]

    if missing:
        logger.info(f"Generating {len(missing)} missing abstractions...")

        # Generate missing abstractions with concurrency limit
        semaphore = asyncio.Semaphore(max_concurrent)

        async def generate_one(item_id: str):
            async with semaphore:
                item = item_lookup.get(item_id)
                if not item:
                    return item_id, ""

                abstracted = await get_or_generate_abstraction(
                    item_id=item_id,
                    source_text=item.get('raw_text') or item.get('question_text', ''),
                    resolution_text=item.get('resolution_text'),
                    cost_impact=item.get('cost_impact'),
                    schedule_impact_days=item.get('schedule_impact_days'),
                    resulted_in_co=item.get('resulted_in_co', False)
                )
                return item_id, abstracted

        # Run all generations concurrently (with semaphore limiting)
        tasks = [generate_one(item_id) for item_id in missing]
        generated = await asyncio.gather(*tasks, return_exceptions=True)

        for result in generated:
            if isinstance(result, Exception):
                logger.warning(f"Error generating abstraction: {result}")
                continue
            item_id, text = result
            results[item_id] = text

    return results


async def pre_warm_abstractions_for_query(
    query_text: str,
    top_k: int = 20
) -> int:
    """
    Pre-warm the abstraction cache for items likely to be returned for a query.

    Call this proactively when you know a query is coming (e.g., when a user
    starts typing) to ensure abstractions are cached before results are needed.

    Args:
        query_text: The expected query text
        top_k: Number of items to pre-warm

    Returns:
        Number of items pre-warmed
    """
    from db import fetch

    # Fetch items without cached abstractions that are likely relevant
    # Using simple text search for now - could use BM25 ranking
    try:
        rows = await fetch(
            """
            SELECT id::text, raw_text, question_text, resolution_text,
                   cost_impact, schedule_impact_days, resulted_in_co
            FROM intelligence.items
            WHERE abstracted_summary IS NULL
              AND source_type = 'rfi'
              AND LENGTH(COALESCE(question_text, raw_text)) > 50
            LIMIT $1
            """,
            top_k
        )

        if not rows:
            return 0

        items = [dict(row) for row in rows]
        await batch_get_or_generate_abstractions(items)
        return len(items)

    except Exception as e:
        logger.warning(f"Error pre-warming abstractions: {e}")
        return 0
