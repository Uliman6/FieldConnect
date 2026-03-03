"""
Entity extraction pipeline for FieldConnect Intelligence Service.

Combines regex-based and AI-based extraction to extract all entity types
from RFI and punch list items.
"""

import asyncio
import logging
from typing import Optional
from uuid import uuid4

import db
from extraction.regex_patterns import extract_all_regex_entities
from extraction.ai_extractor import extract_entities_with_ai

logger = logging.getLogger(__name__)


async def extract_and_store_entities(
    item_id: str,
    text: str,
    use_ai: bool = True,
    ai_timeout: float = 30.0
) -> dict:
    """
    Extract entities from text and store them in the database.

    Args:
        item_id: Database item ID
        text: Text to extract entities from
        use_ai: Whether to use AI extraction (slower but more comprehensive)
        ai_timeout: Timeout for AI extraction

    Returns:
        Dict with extraction summary
    """
    if not text or len(text.strip()) < 5:
        return {"item_id": item_id, "entities_extracted": 0, "error": "Text too short"}

    entities = []

    # 1. Regex-based extraction (fast, high precision)
    regex_results = extract_all_regex_entities(text)

    for entity_type, matches in regex_results.items():
        for match in matches:
            entities.append({
                "item_id": item_id,
                "entity_type": entity_type,
                "entity_value": match.get("match_text", match.get("value")),
                "normalized_value": match.get("value"),
                "confidence": 1.0,  # Regex matches are high confidence
                "source": "regex"
            })

    # 2. AI-based extraction (slower, handles complex entities)
    if use_ai:
        try:
            ai_results = await extract_entities_with_ai(text, timeout=ai_timeout)

            if ai_results:
                # Trades
                for trade in ai_results.get("trades", []):
                    entities.append({
                        "item_id": item_id,
                        "entity_type": "trade",
                        "entity_value": trade,
                        "normalized_value": trade,
                        "confidence": 0.9,
                        "source": "ai"
                    })

                # Materials
                for material in ai_results.get("materials", []):
                    entities.append({
                        "item_id": item_id,
                        "entity_type": "material",
                        "entity_value": material,
                        "normalized_value": material.lower(),
                        "confidence": 0.85,
                        "source": "ai"
                    })

                # Brands
                for brand in ai_results.get("brands", []):
                    entities.append({
                        "item_id": item_id,
                        "entity_type": "brand",
                        "entity_value": brand,
                        "normalized_value": brand,
                        "confidence": 0.85,
                        "source": "ai"
                    })

                # People
                for person in ai_results.get("people", []):
                    entities.append({
                        "item_id": item_id,
                        "entity_type": "person",
                        "entity_value": person,
                        "normalized_value": person,
                        "confidence": 0.8,
                        "source": "ai"
                    })

                # Companies
                for company in ai_results.get("companies", []):
                    entities.append({
                        "item_id": item_id,
                        "entity_type": "company",
                        "entity_value": company,
                        "normalized_value": company,
                        "confidence": 0.85,
                        "source": "ai"
                    })

                # Update item with issue_type and primary_trade if extracted
                if ai_results.get("issue_type") or ai_results.get("primary_trade"):
                    await update_item_classification(
                        item_id,
                        issue_type=ai_results.get("issue_type"),
                        trade_category=ai_results.get("primary_trade")
                    )

        except Exception as e:
            logger.warning(f"AI extraction failed for item {item_id}: {e}")

    # 3. Store entities in database
    stored_count = 0
    for entity in entities:
        try:
            await store_entity(entity)
            stored_count += 1
        except Exception as e:
            logger.error(f"Failed to store entity: {e}")

    return {
        "item_id": item_id,
        "entities_extracted": stored_count,
        "regex_count": sum(len(v) for v in regex_results.values()),
        "ai_count": stored_count - sum(len(v) for v in regex_results.values()) if use_ai else 0
    }


async def store_entity(entity: dict) -> str:
    """Store a single entity in the database."""
    entity_id = str(uuid4())

    await db.execute("""
        INSERT INTO intelligence.entities (id, item_id, entity_type, entity_value, normalized_value, confidence)
        VALUES ($1, $2::uuid, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
    """,
        entity_id,
        entity["item_id"],
        entity["entity_type"],
        entity["entity_value"],
        entity["normalized_value"],
        entity["confidence"]
    )

    return entity_id


async def update_item_classification(
    item_id: str,
    issue_type: Optional[str] = None,
    trade_category: Optional[str] = None
):
    """Update item with extracted classification."""
    updates = []
    params = []
    param_idx = 1

    if issue_type:
        updates.append(f"issue_type = ${param_idx}")
        params.append(issue_type)
        param_idx += 1

    if trade_category:
        updates.append(f"trade_category = ${param_idx}")
        params.append(trade_category)
        param_idx += 1

    if not updates:
        return

    params.append(item_id)

    query = f"""
        UPDATE intelligence.items
        SET {', '.join(updates)}, updated_at = NOW()
        WHERE id = ${param_idx}::uuid
    """

    await db.execute(query, *params)


async def extract_entities_for_project(
    project_id: str,
    company_id: str,
    use_ai: bool = True,
    batch_size: int = 10,
    limit: Optional[int] = None
) -> dict:
    """
    Extract entities for all items in a project.

    Args:
        project_id: Project ID
        company_id: Company ID
        use_ai: Whether to use AI extraction
        batch_size: Number of items to process concurrently
        limit: Max items to process (None for all)

    Returns:
        Summary dict
    """
    # Get items that don't have entities yet
    query = """
        SELECT i.id, i.raw_text, i.normalized_text
        FROM intelligence.items i
        LEFT JOIN intelligence.entities e ON i.id = e.item_id
        WHERE i.source_project_id = $1 AND i.company_id = $2
        GROUP BY i.id
        HAVING COUNT(e.id) = 0
    """
    params = [project_id, company_id]

    if limit:
        query += f" LIMIT {limit}"

    items = await db.fetch(query, *params)

    logger.info(f"Processing {len(items)} items for project {project_id}")

    total_entities = 0
    processed = 0
    errors = 0

    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]

        tasks = []
        for item in batch:
            text = item.get("normalized_text") or item.get("raw_text") or ""
            tasks.append(extract_and_store_entities(
                str(item["id"]),
                text,
                use_ai=use_ai
            ))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            processed += 1
            if isinstance(result, Exception):
                errors += 1
                logger.error(f"Extraction error: {result}")
            elif isinstance(result, dict):
                total_entities += result.get("entities_extracted", 0)

        logger.info(f"Progress: {processed}/{len(items)} items, {total_entities} entities")

    return {
        "project_id": project_id,
        "items_processed": processed,
        "entities_extracted": total_entities,
        "errors": errors
    }


async def extract_entities_all_items(
    company_id: str,
    use_ai: bool = True,
    batch_size: int = 10,
    limit: Optional[int] = None
) -> dict:
    """
    Extract entities for all items across all projects.

    Args:
        company_id: Company ID
        use_ai: Whether to use AI extraction
        batch_size: Concurrent batch size
        limit: Max items to process

    Returns:
        Summary dict
    """
    # Get items without entities
    query = """
        SELECT i.id, i.raw_text, i.normalized_text, i.source_project_id
        FROM intelligence.items i
        LEFT JOIN intelligence.entities e ON i.id = e.item_id
        WHERE i.company_id = $1
        GROUP BY i.id
        HAVING COUNT(e.id) = 0
    """

    if limit:
        query += f" LIMIT {limit}"

    items = await db.fetch(query, company_id)

    logger.info(f"Processing {len(items)} items total")

    total_entities = 0
    processed = 0
    errors = 0

    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]

        tasks = []
        for item in batch:
            text = item.get("normalized_text") or item.get("raw_text") or ""
            tasks.append(extract_and_store_entities(
                str(item["id"]),
                text,
                use_ai=use_ai
            ))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            processed += 1
            if isinstance(result, Exception):
                errors += 1
                logger.error(f"Extraction error: {result}")
            elif isinstance(result, dict):
                total_entities += result.get("entities_extracted", 0)

        if processed % 100 == 0:
            logger.info(f"Progress: {processed}/{len(items)} items, {total_entities} entities")

    return {
        "items_processed": processed,
        "entities_extracted": total_entities,
        "errors": errors
    }


async def get_entity_statistics(company_id: str) -> dict:
    """Get statistics about extracted entities."""
    # Entity counts by type
    type_counts = await db.fetch("""
        SELECT entity_type, COUNT(*) as count
        FROM intelligence.entities e
        JOIN intelligence.items i ON e.item_id = i.id
        WHERE i.company_id = $1
        GROUP BY entity_type
        ORDER BY count DESC
    """, company_id)

    # Most common entities
    top_entities = await db.fetch("""
        SELECT entity_type, normalized_value, COUNT(*) as count
        FROM intelligence.entities e
        JOIN intelligence.items i ON e.item_id = i.id
        WHERE i.company_id = $1
        GROUP BY entity_type, normalized_value
        ORDER BY count DESC
        LIMIT 50
    """, company_id)

    # Items with vs without entities
    coverage = await db.fetch("""
        SELECT
            COUNT(DISTINCT i.id) as total_items,
            COUNT(DISTINCT e.item_id) as items_with_entities
        FROM intelligence.items i
        LEFT JOIN intelligence.entities e ON i.id = e.item_id
        WHERE i.company_id = $1
    """, company_id)

    return {
        "entity_type_counts": {r["entity_type"]: r["count"] for r in type_counts},
        "top_entities": [dict(r) for r in top_entities],
        "coverage": {
            "total_items": coverage[0]["total_items"],
            "items_with_entities": coverage[0]["items_with_entities"],
            "coverage_pct": round(coverage[0]["items_with_entities"] / coverage[0]["total_items"] * 100, 1) if coverage[0]["total_items"] > 0 else 0
        }
    }
