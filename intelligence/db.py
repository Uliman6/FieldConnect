"""
Database connection and utilities for the Intelligence Service.
Uses asyncpg for async PostgreSQL connections.
"""

import asyncpg
from contextlib import asynccontextmanager
from typing import Optional
import logging

from config import settings

logger = logging.getLogger(__name__)

# Connection pool
_pool: Optional[asyncpg.Pool] = None


async def init_db():
    """Initialize the database connection pool."""
    global _pool
    if _pool is None:
        logger.info("Creating database connection pool...")
        _pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=2,
            max_size=10,
            command_timeout=60
        )
        logger.info("Database pool created successfully")
    return _pool


async def close_db():
    """Close the database connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Database pool closed")


async def get_pool() -> asyncpg.Pool:
    """Get the connection pool, initializing if needed."""
    if _pool is None:
        await init_db()
    return _pool


@asynccontextmanager
async def get_connection():
    """Get a database connection from the pool."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


async def execute(query: str, *args):
    """Execute a query and return the status."""
    async with get_connection() as conn:
        return await conn.execute(query, *args)


async def fetch(query: str, *args):
    """Execute a query and return all rows."""
    async with get_connection() as conn:
        return await conn.fetch(query, *args)


async def fetchrow(query: str, *args):
    """Execute a query and return a single row."""
    async with get_connection() as conn:
        return await conn.fetchrow(query, *args)


async def fetchval(query: str, *args):
    """Execute a query and return a single value."""
    async with get_connection() as conn:
        return await conn.fetchval(query, *args)


async def run_migrations():
    """Run database migrations."""
    import os
    migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")

    async with get_connection() as conn:
        # Create migrations tracking table if it doesn't exist
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS intelligence.migrations (
                id SERIAL PRIMARY KEY,
                filename TEXT NOT NULL UNIQUE,
                applied_at TIMESTAMP DEFAULT NOW()
            )
        """)

        # First ensure the intelligence schema exists
        await conn.execute("CREATE SCHEMA IF NOT EXISTS intelligence")

        # Get already applied migrations
        applied = await conn.fetch(
            "SELECT filename FROM intelligence.migrations ORDER BY id"
        )
        applied_files = {row["filename"] for row in applied}

        # Find and run new migrations
        if os.path.exists(migrations_dir):
            migration_files = sorted([
                f for f in os.listdir(migrations_dir)
                if f.endswith(".sql")
            ])

            for filename in migration_files:
                if filename not in applied_files:
                    filepath = os.path.join(migrations_dir, filename)
                    logger.info(f"Running migration: {filename}")

                    with open(filepath, "r") as f:
                        sql = f.read()

                    await conn.execute(sql)
                    await conn.execute(
                        "INSERT INTO intelligence.migrations (filename) VALUES ($1)",
                        filename
                    )
                    logger.info(f"Migration applied: {filename}")


async def check_health() -> dict:
    """Check database health status."""
    try:
        async with get_connection() as conn:
            # Basic connectivity
            db_version = await conn.fetchval("SELECT version()")

            # Check intelligence schema exists
            schema_exists = await conn.fetchval("""
                SELECT EXISTS(
                    SELECT 1 FROM information_schema.schemata
                    WHERE schema_name = 'intelligence'
                )
            """)

            # Count items if table exists
            items_count = 0
            entities_count = 0
            if schema_exists:
                try:
                    items_count = await conn.fetchval(
                        "SELECT COUNT(*) FROM intelligence.items"
                    )
                    entities_count = await conn.fetchval(
                        "SELECT COUNT(*) FROM intelligence.entities"
                    )
                except Exception:
                    pass  # Tables might not exist yet

            return {
                "status": "healthy",
                "database": "connected",
                "schema": "exists" if schema_exists else "not created",
                "items_count": items_count,
                "entities_count": entities_count,
                "db_version": db_version[:50] if db_version else None
            }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }
