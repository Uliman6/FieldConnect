"""
Verify database connection and create the intelligence schema.
"""

import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


async def verify_and_setup():
    print("Connecting to database...")

    try:
        conn = await asyncpg.connect(DATABASE_URL)
        print("[OK] Connected successfully!\n")

        # Check PostgreSQL version
        version = await conn.fetchval("SELECT version()")
        print(f"PostgreSQL: {version[:60]}...\n")

        # Create intelligence schema
        print("Creating intelligence schema...")
        await conn.execute("CREATE SCHEMA IF NOT EXISTS intelligence")
        print("[OK] intelligence schema created!\n")

        # Run the migration
        print("Running schema migration...")
        migration_path = os.path.join(os.path.dirname(__file__), "migrations", "001_initial_schema.sql")

        with open(migration_path, "r") as f:
            sql = f.read()

        await conn.execute(sql)
        print("[OK] Schema migration complete!\n")

        # Verify tables exist
        tables = await conn.fetch("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'intelligence'
            ORDER BY table_name
        """)
        print("Tables created:")
        for t in tables:
            print(f"  - intelligence.{t['table_name']}")

        # Verify indexes
        indexes = await conn.fetch("""
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'intelligence'
            ORDER BY indexname
        """)
        print(f"\nIndexes created: {len(indexes)}")
        for idx in indexes:
            print(f"  - {idx['indexname']}")

        # Test inserting a sample item with embedding
        print("\nTesting item insertion with embedding...")
        test_embedding = [0.1] * 1536  # Dummy embedding

        await conn.execute("""
            INSERT INTO intelligence.items
                (company_id, source_project_id, source_type, raw_text, embedding)
            VALUES
                ($1, 'test-project', 'observation', 'Test observation', $2)
        """, "00000000-0000-0000-0000-000000000000", test_embedding)
        print("[OK] Test item inserted with embedding!")

        # Verify we can read it back
        count = await conn.fetchval("SELECT COUNT(*) FROM intelligence.items")
        print(f"[OK] Items in database: {count}")

        # Clean up test data
        await conn.execute("""
            DELETE FROM intelligence.items
            WHERE source_project_id = 'test-project'
        """)
        print("[OK] Test data cleaned up")

        await conn.close()

        print("\n" + "="*50)
        print("ALL CHECKS PASSED - Database is ready!")
        print("="*50)
        return True

    except Exception as e:
        print(f"[ERROR] Failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    asyncio.run(verify_and_setup())
