"""
Extract entities from all ingested items.

Usage:
    python scripts/extract_entities.py [--use-ai] [--limit N] [--batch-size N]
"""

import asyncio
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import logging
import db
from extraction.pipeline import (
    extract_entities_all_items,
    get_entity_statistics,
    extract_and_store_entities
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

COMPANY_ID = "00000000-0000-0000-0000-000000000001"


async def run_extraction(use_ai: bool = False, limit: int = None, batch_size: int = 20):
    """Run entity extraction on all items."""
    await db.init_db()

    # Check how many items need processing
    items_count = await db.fetch("""
        SELECT COUNT(DISTINCT i.id) as count
        FROM intelligence.items i
        LEFT JOIN intelligence.entities e ON i.id = e.item_id
        WHERE i.company_id = $1
        GROUP BY i.id
        HAVING COUNT(e.id) = 0
    """, COMPANY_ID)

    pending = len(items_count) if items_count else 0
    logger.info(f"Items pending entity extraction: {pending}")

    if pending == 0:
        logger.info("All items already have entities extracted")
        return

    # Run extraction
    logger.info(f"Starting extraction (use_ai={use_ai}, batch_size={batch_size})")

    result = await extract_entities_all_items(
        company_id=COMPANY_ID,
        use_ai=use_ai,
        batch_size=batch_size,
        limit=limit
    )

    logger.info(f"Extraction complete!")
    logger.info(f"  Items processed: {result['items_processed']}")
    logger.info(f"  Entities extracted: {result['entities_extracted']}")
    logger.info(f"  Errors: {result['errors']}")

    # Show statistics
    stats = await get_entity_statistics(COMPANY_ID)

    logger.info("\nEntity type counts:")
    for entity_type, count in stats["entity_type_counts"].items():
        logger.info(f"  {entity_type}: {count}")

    logger.info(f"\nCoverage: {stats['coverage']['items_with_entities']}/{stats['coverage']['total_items']} items ({stats['coverage']['coverage_pct']}%)")

    logger.info("\nTop 15 entities:")
    for entity in stats["top_entities"][:15]:
        logger.info(f"  [{entity['entity_type']:15}] {entity['normalized_value'][:40]:40} ({entity['count']})")


async def test_single_item():
    """Test extraction on a single item."""
    await db.init_db()

    # Get a random item
    items = await db.fetch("""
        SELECT id, raw_text, source_ref
        FROM intelligence.items
        WHERE company_id = $1
        LIMIT 1
    """, COMPANY_ID)

    if not items:
        logger.error("No items found")
        return

    item = items[0]
    logger.info(f"Testing extraction on: {item['source_ref']}")
    logger.info(f"Text: {item['raw_text'][:200]}...")

    result = await extract_and_store_entities(
        str(item['id']),
        item['raw_text'],
        use_ai=False
    )

    logger.info(f"Result: {result}")

    # Show extracted entities
    entities = await db.fetch("""
        SELECT entity_type, entity_value, normalized_value, confidence
        FROM intelligence.entities
        WHERE item_id = $1
    """, str(item['id']))

    logger.info(f"\nExtracted {len(entities)} entities:")
    for e in entities:
        logger.info(f"  [{e['entity_type']:15}] {e['normalized_value'][:50]} (conf: {e['confidence']})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract entities from items")
    parser.add_argument("--use-ai", action="store_true", help="Use AI extraction (slower)")
    parser.add_argument("--limit", type=int, default=None, help="Limit items to process")
    parser.add_argument("--batch-size", type=int, default=20, help="Batch size")
    parser.add_argument("--test", action="store_true", help="Test on single item")

    args = parser.parse_args()

    if args.test:
        asyncio.run(test_single_item())
    else:
        asyncio.run(run_extraction(
            use_ai=args.use_ai,
            limit=args.limit,
            batch_size=args.batch_size
        ))
