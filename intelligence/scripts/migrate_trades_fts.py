"""
Migration script to:
1. Normalize trade names (spaces -> underscores)
2. Add search_vector column with GIN index for FTS

Usage:
    python -m scripts.migrate_trades_fts
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from db import get_pool, close_db


# Trade name normalization mapping
TRADE_NORMALIZATIONS = {
    "fire protection": "fire_protection",
    "audio visual": "audio_visual",
    "exterior envelope": "exterior_envelope",
    "interior/finishes": "interior_finishes",
    "civil/site": "civil_site",
    "to contact": None,  # Remove this invalid trade
}


async def normalize_trade_names():
    """Normalize trade names to use underscores instead of spaces."""
    print("=" * 60)
    print("NORMALIZING TRADE NAMES")
    print("=" * 60)

    pool = await get_pool()
    async with pool.acquire() as conn:
        for old_name, new_name in TRADE_NORMALIZATIONS.items():
            if new_name is None:
                # Set to NULL for invalid trades
                result = await conn.execute("""
                    UPDATE intelligence.items
                    SET trade_category = NULL
                    WHERE trade_category = $1
                """, old_name)
                print(f"  Cleared '{old_name}': {result}")
            else:
                # Replace old with new (handle both exact and in comma-separated lists)
                result = await conn.execute("""
                    UPDATE intelligence.items
                    SET trade_category = REPLACE(trade_category, $1, $2)
                    WHERE trade_category LIKE $3
                """, old_name, new_name, f"%{old_name}%")
                print(f"  Renamed '{old_name}' -> '{new_name}': {result}")

    print("\nTrade normalization complete!")


async def add_fts_column():
    """Add search_vector column with GIN index for full-text search."""
    print("\n" + "=" * 60)
    print("ADDING FTS SEARCH_VECTOR COLUMN")
    print("=" * 60)

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Check if column exists
        exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'intelligence'
                  AND table_name = 'items'
                  AND column_name = 'search_vector'
            )
        """)

        if exists:
            print("  search_vector column already exists")
        else:
            print("  Adding search_vector column...")
            await conn.execute("""
                ALTER TABLE intelligence.items
                ADD COLUMN search_vector tsvector
            """)
            print("  Column added!")

        # Populate the search_vector
        print("  Populating search_vector from text columns...")
        await conn.execute("""
            UPDATE intelligence.items
            SET search_vector = to_tsvector('english',
                COALESCE(normalized_text, '') || ' ' ||
                COALESCE(question_text, '') || ' ' ||
                COALESCE(trade_category, '') || ' ' ||
                COALESCE(source_ref, '')
            )
        """)
        print("  search_vector populated!")

        # Check if index exists
        index_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE schemaname = 'intelligence'
                  AND tablename = 'items'
                  AND indexname = 'idx_items_search_vector'
            )
        """)

        if index_exists:
            print("  GIN index already exists")
        else:
            print("  Creating GIN index on search_vector...")
            await conn.execute("""
                CREATE INDEX idx_items_search_vector
                ON intelligence.items USING GIN(search_vector)
            """)
            print("  GIN index created!")

        # Create trigger to auto-update search_vector
        print("  Creating trigger for auto-update...")
        await conn.execute("""
            CREATE OR REPLACE FUNCTION intelligence.update_search_vector()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.search_vector := to_tsvector('english',
                    COALESCE(NEW.normalized_text, '') || ' ' ||
                    COALESCE(NEW.question_text, '') || ' ' ||
                    COALESCE(NEW.trade_category, '') || ' ' ||
                    COALESCE(NEW.source_ref, '')
                );
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """)

        # Drop trigger if exists, then create
        await conn.execute("""
            DROP TRIGGER IF EXISTS trg_items_search_vector ON intelligence.items
        """)
        await conn.execute("""
            CREATE TRIGGER trg_items_search_vector
            BEFORE INSERT OR UPDATE ON intelligence.items
            FOR EACH ROW
            EXECUTE FUNCTION intelligence.update_search_vector()
        """)
        print("  Trigger created!")

    print("\nFTS setup complete!")


async def verify_changes():
    """Verify the changes were applied correctly."""
    print("\n" + "=" * 60)
    print("VERIFYING CHANGES")
    print("=" * 60)

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Check normalized trades
        rows = await conn.fetch("""
            SELECT trade_category, COUNT(*) as cnt
            FROM intelligence.items
            WHERE trade_category LIKE '%fire%'
               OR trade_category LIKE '%audio%'
               OR trade_category LIKE '%exterior%'
            GROUP BY trade_category
            ORDER BY cnt DESC
        """)
        print("\nNormalized fire/audio/exterior trades:")
        for row in rows:
            print(f"  {row['cnt']:4d} | {row['trade_category']}")

        # Test FTS
        print("\nTesting FTS search for 'curtainwall mullion':")
        rows = await conn.fetch("""
            SELECT source_ref, trade_category,
                   ts_rank(search_vector, to_tsquery('english', 'curtainwall & mullion')) as rank
            FROM intelligence.items
            WHERE search_vector @@ to_tsquery('english', 'curtainwall & mullion')
            ORDER BY rank DESC
            LIMIT 5
        """)
        for row in rows:
            print(f"  [{row['source_ref']}] trade={row['trade_category']} rank={row['rank']:.4f}")


async def main():
    try:
        await normalize_trade_names()
        await add_fts_column()
        await verify_changes()
    finally:
        await close_db()

    print("\n" + "=" * 60)
    print("MIGRATION COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
