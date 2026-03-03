"""
Generate embeddings for all ingested items.

Usage:
    python scripts/generate_embeddings.py [--limit N] [--batch-size N]
"""

import asyncio
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import logging
import db
from similarity.pipeline import (
    generate_embeddings_for_items,
    get_embedding_statistics
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

COMPANY_ID = "00000000-0000-0000-0000-000000000001"


async def run_embedding_generation(limit: int = None, batch_size: int = 100):
    """Run embedding generation for all items."""
    await db.init_db()

    # Check current status
    stats = await get_embedding_statistics(COMPANY_ID)
    logger.info(f"Current embedding status:")
    logger.info(f"  Total items: {stats['total_items']}")
    logger.info(f"  Items with embeddings: {stats['items_with_embeddings']}")
    logger.info(f"  Items pending: {stats['items_pending']}")
    logger.info(f"  Coverage: {stats['coverage_pct']}%")

    if stats["items_pending"] == 0:
        logger.info("All items already have embeddings!")
        return

    # Run embedding generation
    logger.info(f"\nGenerating embeddings (batch_size={batch_size})...")

    result = await generate_embeddings_for_items(
        company_id=COMPANY_ID,
        batch_size=batch_size,
        limit=limit
    )

    logger.info(f"\nEmbedding generation complete!")
    logger.info(f"  Items processed: {result['items_processed']}")
    logger.info(f"  Embeddings generated: {result['embeddings_generated']}")
    logger.info(f"  Errors: {result['errors']}")

    # Show final status
    final_stats = await get_embedding_statistics(COMPANY_ID)
    logger.info(f"\nFinal embedding status:")
    logger.info(f"  Items with embeddings: {final_stats['items_with_embeddings']}")
    logger.info(f"  Coverage: {final_stats['coverage_pct']}%")


async def test_single_embedding():
    """Test embedding generation for a single item."""
    await db.init_db()

    from similarity.embeddings import generate_embedding_async, build_embedding_input

    # Get a random item
    item = await db.fetchrow("""
        SELECT id, normalized_text, raw_text, project_phase, issue_type
        FROM intelligence.items
        WHERE company_id = $1
        LIMIT 1
    """, COMPANY_ID)

    if not item:
        logger.error("No items found")
        return

    text = item["normalized_text"] or item["raw_text"]
    logger.info(f"Testing embedding for: {text[:100]}...")

    # Get entities
    entities = await db.fetch("""
        SELECT entity_type, normalized_value
        FROM intelligence.entities
        WHERE item_id = $1
    """, item["id"])

    entity_list = [dict(e) for e in entities]
    logger.info(f"Entities: {entity_list}")

    # Build input
    embedding_input = build_embedding_input(
        normalized_text=text,
        entities=entity_list,
        project_phase=item["project_phase"],
        issue_type=item["issue_type"]
    )

    logger.info(f"Embedding input: {embedding_input[:200]}...")

    # Generate embedding
    embedding = await generate_embedding_async(embedding_input)
    logger.info(f"Generated embedding with {len(embedding)} dimensions")
    logger.info(f"First 5 values: {embedding[:5]}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate embeddings for items")
    parser.add_argument("--limit", type=int, default=None, help="Limit items to process")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size for API calls")
    parser.add_argument("--test", action="store_true", help="Test on single item")

    args = parser.parse_args()

    if args.test:
        asyncio.run(test_single_embedding())
    else:
        asyncio.run(run_embedding_generation(
            limit=args.limit,
            batch_size=args.batch_size
        ))
