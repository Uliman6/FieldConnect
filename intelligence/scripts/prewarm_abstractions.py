#!/usr/bin/env python3
"""
Pre-warm Abstraction Cache

Generates and caches privacy-safe abstractions for all items that don't have one yet.
This avoids LLM calls at query time, making responses faster.

Usage:
    python scripts/prewarm_abstractions.py [--limit 100] [--batch-size 20]
"""

import asyncio
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg
from alerts.privacy_guard import (
    generate_abstracted_alert,
    save_abstraction_to_cache
)


async def count_missing_abstractions(conn) -> int:
    """Count items without cached abstractions."""
    return await conn.fetchval("""
        SELECT COUNT(*)
        FROM intelligence.items
        WHERE abstracted_summary IS NULL
          AND source_type = 'rfi'
          AND LENGTH(COALESCE(question_text, raw_text)) > 50
    """)


async def get_items_needing_abstraction(conn, limit: int = 100) -> list[dict]:
    """Fetch items that need abstractions generated."""
    rows = await conn.fetch("""
        SELECT
            id::text,
            raw_text,
            question_text,
            resolution_text,
            cost_impact,
            schedule_impact_days,
            resulted_in_co
        FROM intelligence.items
        WHERE abstracted_summary IS NULL
          AND source_type = 'rfi'
          AND LENGTH(COALESCE(question_text, raw_text)) > 50
        ORDER BY RANDOM()
        LIMIT $1
    """, limit)

    return [dict(row) for row in rows]


async def generate_and_cache_one(item: dict, conn) -> bool:
    """Generate abstraction for a single item and save to database."""
    try:
        source_text = item.get("question_text") or item.get("raw_text") or ""

        if len(source_text.strip()) < 20:
            return False

        # Generate abstraction (synchronous call)
        abstracted = generate_abstracted_alert(
            source_text=source_text,
            resolution_text=item.get("resolution_text"),
            cost_impact=item.get("cost_impact"),
            schedule_impact_days=item.get("schedule_impact_days"),
            resulted_in_co=item.get("resulted_in_co", False)
        )

        if not abstracted or len(abstracted) < 10:
            return False

        # Save to database
        await conn.execute(
            """
            UPDATE intelligence.items
            SET abstracted_summary = $2, updated_at = NOW()
            WHERE id = $1
            """,
            item["id"],
            abstracted
        )

        return True

    except Exception as e:
        print(f"  Error for {item['id'][:8]}: {e}")
        return False


async def main():
    parser = argparse.ArgumentParser(description="Pre-warm abstraction cache")
    parser.add_argument("--limit", type=int, default=100, help="Max items to process")
    parser.add_argument("--batch-size", type=int, default=20, help="Items per batch")
    args = parser.parse_args()

    print("=" * 70)
    print("ABSTRACTION CACHE PRE-WARMING")
    print("=" * 70)

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL required")
        sys.exit(1)

    print("\nConnecting to database...")
    conn = await asyncpg.connect(database_url)

    try:
        # Check how many need processing
        missing = await count_missing_abstractions(conn)
        print(f"  Items without cached abstractions: {missing}")

        if missing == 0:
            print("\n  All items already have cached abstractions!")
            return

        to_process = min(args.limit, missing)
        print(f"  Will process up to {to_process} items")

        # Process in batches
        processed = 0
        success = 0

        while processed < to_process:
            batch_size = min(args.batch_size, to_process - processed)
            items = await get_items_needing_abstraction(conn, batch_size)

            if not items:
                break

            print(f"\nBatch {processed // args.batch_size + 1}: Processing {len(items)} items...")

            for item in items:
                item_id_short = item["id"][:8]
                source_preview = (item.get("question_text") or item.get("raw_text") or "")[:60]

                result = await generate_and_cache_one(item, conn)
                if result:
                    success += 1
                    print(f"  + {item_id_short}: {source_preview}...")
                else:
                    print(f"  - {item_id_short}: skipped")

                processed += 1

            # Rate limit between batches
            await asyncio.sleep(1)

        print("\n" + "=" * 70)
        print("SUMMARY")
        print("=" * 70)
        print(f"\n  Processed: {processed}")
        print(f"  Successfully cached: {success}")
        print(f"  Skipped/failed: {processed - success}")

        # Check remaining
        remaining = await count_missing_abstractions(conn)
        print(f"\n  Remaining without cache: {remaining}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
