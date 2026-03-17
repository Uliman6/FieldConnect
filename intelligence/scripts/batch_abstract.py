#!/usr/bin/env python3
"""
Batch abstraction of RFIs using LLM summarization.

This script:
1. Fetches all RFIs from the database
2. Strips noise and generates LLM-based abstractions
3. Stores abstractions in the abstracted_summary column
4. Optionally regenerates embeddings from abstractions

Usage:
    python scripts/batch_abstract.py [--limit N] [--dry-run] [--regenerate-embeddings]
"""

import asyncio
import argparse
import json
import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

import logging
import asyncpg
from openai import OpenAI

from extraction.abstraction import (
    abstract_with_llm,
    abstract_rule_based,
    abstraction_to_json,
    strip_noise,
)
from similarity.embeddings import generate_embedding

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Rate limiting for OpenAI API
BATCH_SIZE = 20  # Process in batches
DELAY_BETWEEN_BATCHES = 1.0  # seconds

# Connection pool settings - prevents timeout issues during long LLM calls
POOL_MIN_SIZE = 2
POOL_MAX_SIZE = 10


async def get_items_to_process(
    conn: asyncpg.Connection,
    limit: int = None,
    force_reprocess: bool = False
) -> list[dict]:
    """Fetch RFIs that need abstraction."""

    if force_reprocess:
        query = """
            SELECT id, source_ref, question_text, raw_text, abstracted_summary
            FROM intelligence.items
            WHERE source_type = 'rfi'
              AND (question_text IS NOT NULL OR raw_text IS NOT NULL)
            ORDER BY item_date DESC NULLS LAST
        """
    else:
        query = """
            SELECT id, source_ref, question_text, raw_text, abstracted_summary
            FROM intelligence.items
            WHERE source_type = 'rfi'
              AND (question_text IS NOT NULL OR raw_text IS NOT NULL)
              AND (abstracted_summary IS NULL OR abstracted_summary = '{}')
            ORDER BY item_date DESC NULLS LAST
        """

    if limit:
        query += f" LIMIT {limit}"

    rows = await conn.fetch(query)
    return [dict(r) for r in rows]


async def update_item(
    pool: asyncpg.Pool,
    item_id: str,
    abstraction_json: dict,
    embedding: list[float] = None
):
    """Update item with abstraction and optionally new embedding.

    Uses a fresh connection from the pool for each update to avoid
    connection timeout issues during long-running LLM calls.
    """
    async with pool.acquire() as conn:
        if embedding:
            await conn.execute("""
                UPDATE intelligence.items
                SET abstracted_summary = $1,
                    embedding = $2
                WHERE id = $3
            """, json.dumps(abstraction_json), embedding, item_id)
        else:
            await conn.execute("""
                UPDATE intelligence.items
                SET abstracted_summary = $1
                WHERE id = $2
            """, json.dumps(abstraction_json), item_id)


async def process_batch(
    items: list[dict],
    client: OpenAI,
    pool: asyncpg.Pool,
    regenerate_embeddings: bool = False,
    dry_run: bool = False
) -> tuple[int, int]:
    """
    Process a batch of items.

    Uses a connection pool for database updates to prevent
    connection timeout issues during long-running LLM calls.

    Returns (success_count, error_count)
    """
    success = 0
    errors = 0

    for item in items:
        item_id = item['id']
        source_ref = item.get('source_ref', 'unknown')

        # Prefer question_text, fall back to raw_text
        text = item.get('question_text') or item.get('raw_text') or ''

        if not text or len(text) < 30:
            logger.warning(f"Skipping {source_ref}: text too short")
            errors += 1
            continue

        try:
            # Try LLM abstraction
            abstraction = await abstract_with_llm(text, client)

            if not abstraction:
                # Fall back to rule-based
                logger.warning(f"LLM failed for {source_ref}, using rule-based")
                abstraction = abstract_rule_based(text)

            abstraction_json = abstraction_to_json(abstraction)

            # Generate new embedding from scope summary if requested
            embedding = None
            if regenerate_embeddings and abstraction.scope_summary:
                # Combine scope + key terms for embedding
                embed_text = f"{abstraction.scope_summary}. Key terms: {', '.join(abstraction.key_terms)}"
                embedding = generate_embedding(embed_text)

            if dry_run:
                logger.info(f"[DRY RUN] {source_ref}:")
                logger.info(f"  Scope: {abstraction.scope_summary[:100]}...")
                logger.info(f"  Terms: {abstraction.key_terms}")
                logger.info(f"  Type: {abstraction.issue_type}")
            else:
                await update_item(pool, item_id, abstraction_json, embedding)
                logger.info(f"Updated {source_ref}")

            success += 1

        except Exception as e:
            logger.error(f"Error processing {source_ref}: {e}")
            errors += 1

    return success, errors


async def main():
    parser = argparse.ArgumentParser(description="Batch abstract RFIs using LLM")
    parser.add_argument("--limit", type=int, help="Limit number of items to process")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to database")
    parser.add_argument("--regenerate-embeddings", action="store_true",
                        help="Regenerate embeddings from abstractions")
    parser.add_argument("--force", action="store_true",
                        help="Reprocess items that already have abstractions")
    args = parser.parse_args()

    database_url = os.getenv("DATABASE_URL")
    openai_key = os.getenv("OPENAI_API_KEY")

    if not database_url:
        logger.error("DATABASE_URL not set")
        sys.exit(1)
    if not openai_key:
        logger.error("OPENAI_API_KEY not set")
        sys.exit(1)

    client = OpenAI(api_key=openai_key)

    logger.info("Creating database connection pool...")
    pool = await asyncpg.create_pool(
        database_url,
        min_size=POOL_MIN_SIZE,
        max_size=POOL_MAX_SIZE,
        command_timeout=60,  # 60 second timeout per command
    )

    try:
        # Ensure abstracted_summary column exists
        async with pool.acquire() as conn:
            await conn.execute("""
                ALTER TABLE intelligence.items
                ADD COLUMN IF NOT EXISTS abstracted_summary JSONB DEFAULT '{}'
            """)

            # Fetch items to process
            logger.info("Fetching items to process...")
            items = await get_items_to_process(conn, args.limit, args.force)

        logger.info(f"Found {len(items)} items to process")

        if not items:
            logger.info("No items to process")
            return

        # Process in batches
        total_success = 0
        total_errors = 0

        for i in range(0, len(items), BATCH_SIZE):
            batch = items[i:i + BATCH_SIZE]
            batch_num = i // BATCH_SIZE + 1
            total_batches = (len(items) + BATCH_SIZE - 1) // BATCH_SIZE

            logger.info(f"Processing batch {batch_num}/{total_batches} ({len(batch)} items)...")

            success, errors = await process_batch(
                batch, client, pool,
                regenerate_embeddings=args.regenerate_embeddings,
                dry_run=args.dry_run
            )

            total_success += success
            total_errors += errors

            # Rate limiting
            if i + BATCH_SIZE < len(items):
                await asyncio.sleep(DELAY_BETWEEN_BATCHES)

        logger.info("=" * 60)
        logger.info("SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Total processed: {len(items)}")
        logger.info(f"Successful: {total_success}")
        logger.info(f"Errors: {total_errors}")

        if args.dry_run:
            logger.info("(DRY RUN - no changes written)")

    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
