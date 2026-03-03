"""
Embedding pipeline for generating and storing embeddings for all items.
"""

import asyncio
import logging
from typing import Optional

import db
from similarity.embeddings import (
    build_embedding_input,
    batch_embed_with_rate_limit
)

logger = logging.getLogger(__name__)

COMPANY_ID = "00000000-0000-0000-0000-000000000001"


async def get_items_without_embeddings(
    company_id: str,
    limit: Optional[int] = None
) -> list[dict]:
    """
    Fetch items that don't have embeddings yet.
    """
    query = """
        SELECT id, normalized_text, raw_text, project_phase, issue_type, trade_category
        FROM intelligence.items
        WHERE company_id = $1
          AND embedding IS NULL
          AND (normalized_text IS NOT NULL OR raw_text IS NOT NULL)
        ORDER BY created_at
    """

    if limit:
        query += f" LIMIT {limit}"

    rows = await db.fetch(query, company_id)
    return [dict(row) for row in rows]


async def get_entities_for_items(item_ids: list[str]) -> dict[str, list[dict]]:
    """
    Fetch entities for a list of item IDs.
    Returns a dict mapping item_id -> list of entities.
    """
    if not item_ids:
        return {}

    # Convert to UUID strings for the query
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


async def store_embedding(item_id: str, embedding: list[float]):
    """
    Store an embedding for an item.
    """
    await db.execute("""
        UPDATE intelligence.items
        SET embedding = $1, updated_at = NOW()
        WHERE id = $2::uuid
    """, embedding, item_id)


async def store_embeddings_batch(embeddings: list[tuple[str, list[float]]]):
    """
    Store multiple embeddings efficiently.
    """
    async with db.get_connection() as conn:
        # Use prepared statement for efficiency
        await conn.executemany("""
            UPDATE intelligence.items
            SET embedding = $1, updated_at = NOW()
            WHERE id = $2::uuid
        """, [(emb, item_id) for item_id, emb in embeddings])


async def generate_embeddings_for_items(
    company_id: str,
    batch_size: int = 100,
    limit: Optional[int] = None
) -> dict:
    """
    Generate embeddings for all items without embeddings.

    Args:
        company_id: Company ID to process
        batch_size: Number of items to embed per API call
        limit: Max items to process (None for all)

    Returns:
        Summary dict with counts
    """
    # Get items without embeddings
    items = await get_items_without_embeddings(company_id, limit)

    if not items:
        logger.info("No items need embeddings")
        return {"items_processed": 0, "embeddings_generated": 0, "errors": 0}

    logger.info(f"Found {len(items)} items needing embeddings")

    # Get entities for all items
    item_ids = [str(item["id"]) for item in items]
    entities_by_item = await get_entities_for_items(item_ids)

    logger.info(f"Loaded entities for {len(entities_by_item)} items")

    # Build embedding inputs
    embedding_inputs = []
    item_id_order = []

    for item in items:
        item_id = str(item["id"])
        text = item.get("normalized_text") or item.get("raw_text") or ""

        if not text.strip():
            continue

        entities = entities_by_item.get(item_id, [])

        embedding_input = build_embedding_input(
            normalized_text=text,
            entities=entities,
            project_phase=item.get("project_phase"),
            issue_type=item.get("issue_type")
        )

        embedding_inputs.append(embedding_input)
        item_id_order.append(item_id)

    logger.info(f"Built {len(embedding_inputs)} embedding inputs")

    # Generate embeddings in batches
    embeddings = await batch_embed_with_rate_limit(
        embedding_inputs,
        batch_size=batch_size,
        delay_between_batches=0.2
    )

    # Store embeddings
    stored = 0
    errors = 0

    embeddings_to_store = []
    for item_id, embedding in zip(item_id_order, embeddings):
        if embedding is not None:
            embeddings_to_store.append((item_id, embedding))

    # Store in batches
    store_batch_size = 50
    for i in range(0, len(embeddings_to_store), store_batch_size):
        batch = embeddings_to_store[i:i + store_batch_size]
        try:
            await store_embeddings_batch(batch)
            stored += len(batch)
        except Exception as e:
            logger.error(f"Failed to store batch: {e}")
            # Fall back to individual stores
            for item_id, embedding in batch:
                try:
                    await store_embedding(item_id, embedding)
                    stored += 1
                except Exception as e2:
                    logger.error(f"Failed to store embedding for {item_id}: {e2}")
                    errors += 1

    logger.info(f"Stored {stored} embeddings, {errors} errors")

    return {
        "items_processed": len(items),
        "embeddings_generated": stored,
        "errors": errors
    }


async def get_embedding_statistics(company_id: str) -> dict:
    """
    Get statistics about embeddings.
    """
    stats = await db.fetchrow("""
        SELECT
            COUNT(*) as total_items,
            COUNT(embedding) as items_with_embeddings,
            COUNT(*) FILTER (WHERE embedding IS NULL AND (normalized_text IS NOT NULL OR raw_text IS NOT NULL)) as items_pending
        FROM intelligence.items
        WHERE company_id = $1
    """, company_id)

    total = stats["total_items"]
    with_embeddings = stats["items_with_embeddings"]

    return {
        "total_items": total,
        "items_with_embeddings": with_embeddings,
        "items_pending": stats["items_pending"],
        "coverage_pct": round(with_embeddings / total * 100, 1) if total > 0 else 0
    }
