"""
Ingestion pipeline for the Intelligence Service.
Orchestrates: parse → normalize → store → (later: extract entities → embed)
"""

import asyncio
import uuid
from datetime import datetime, date
from typing import Optional
from pathlib import Path
import logging
import json

from ingestion.parsers import scan_all_projects, scan_project_folder
from ingestion.normalizer import normalize
import db

logger = logging.getLogger(__name__)


def parse_date_str(date_str: Optional[str]) -> Optional[date]:
    """Convert a date string to a date object for asyncpg."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


async def store_item(item: dict) -> Optional[str]:
    """
    Store a single parsed item in the database.

    Returns the item ID if successful, None otherwise.
    """
    # Normalize the raw text
    norm_result = normalize(item.get("raw_text", ""))
    normalized_text = norm_result["normalized_text"]

    # Generate UUID for the item
    item_id = str(uuid.uuid4())

    # Convert date string to date object
    item_date = parse_date_str(item.get("item_date"))

    # Ensure metadata is JSON-serializable
    metadata = item.get("metadata", {})
    if metadata:
        metadata = json.loads(json.dumps(metadata, default=str))

    try:
        await db.execute("""
            INSERT INTO intelligence.items (
                id, company_id, source_project_id, source_project_name,
                source_type, source_ref, raw_text, normalized_text,
                item_date, trade_category, severity,
                resolution_text, cost_impact, resulted_in_co,
                schedule_impact_days, metadata
            ) VALUES (
                $1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb
            )
        """,
            item_id,
            item.get("company_id"),
            item.get("source_project_id"),
            item.get("source_project_name"),
            item.get("source_type"),
            item.get("source_ref"),
            item.get("raw_text"),
            normalized_text,
            item_date,
            item.get("trade_category"),
            item.get("severity"),
            item.get("resolution_text"),
            item.get("cost_impact"),
            item.get("resulted_in_co", False),
            item.get("schedule_impact_days"),
            json.dumps(metadata)
        )
        return item_id
    except Exception as e:
        logger.error(f"Error storing item {item.get('source_ref')}: {e}")
        return None


async def ingest_items(items: list[dict]) -> dict:
    """
    Ingest a list of parsed items into the database.

    Returns stats about the ingestion.
    """
    stats = {
        "total": len(items),
        "success": 0,
        "failed": 0,
        "item_ids": []
    }

    for item in items:
        item_id = await store_item(item)
        if item_id:
            stats["success"] += 1
            stats["item_ids"].append(item_id)
        else:
            stats["failed"] += 1

        # Log progress every 50 items
        if (stats["success"] + stats["failed"]) % 50 == 0:
            logger.info(f"Ingested {stats['success'] + stats['failed']}/{stats['total']} items...")

    logger.info(f"Ingestion complete: {stats['success']} success, {stats['failed']} failed")
    return stats


async def ingest_from_folder(
    data_folder: str,
    company_id: str,
    clear_existing: bool = False
) -> dict:
    """
    Full ingestion pipeline from a data folder.

    Args:
        data_folder: Path to folder containing project subfolders
        company_id: Company ID to assign to all items
        clear_existing: If True, delete existing items for this company first

    Returns:
        Stats about the ingestion
    """
    logger.info(f"Starting ingestion from {data_folder}")

    # Initialize database
    await db.init_db()

    # Optionally clear existing data
    if clear_existing:
        logger.info(f"Clearing existing items for company {company_id}")
        await db.execute(
            "DELETE FROM intelligence.items WHERE company_id = $1",
            company_id
        )

    # Parse all PDFs
    logger.info("Parsing PDFs...")
    items = scan_all_projects(data_folder, company_id)
    logger.info(f"Parsed {len(items)} items from PDFs")

    # Store items in database
    logger.info("Storing items in database...")
    stats = await ingest_items(items)

    return stats


async def ingest_single_project(
    project_folder: str,
    project_id: str,
    project_name: str,
    company_id: str
) -> dict:
    """
    Ingest a single project folder.
    """
    logger.info(f"Ingesting project: {project_name}")

    await db.init_db()

    items = scan_project_folder(project_folder, project_id, project_name)
    for item in items:
        item["company_id"] = company_id

    stats = await ingest_items(items)
    return stats


# CLI entry point
if __name__ == "__main__":
    import sys
    import argparse

    # Suppress MuPDF warnings
    try:
        import fitz
        fitz.TOOLS.mupdf_display_errors(False)
    except:
        pass

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s"
    )

    parser = argparse.ArgumentParser(description="Ingest RFIs and punch lists into the intelligence database")
    parser.add_argument("data_folder", help="Path to the data folder containing project subfolders")
    parser.add_argument("--company-id", default="fieldconnect-demo", help="Company ID to assign")
    parser.add_argument("--clear", action="store_true", help="Clear existing data before ingesting")

    args = parser.parse_args()

    async def main():
        stats = await ingest_from_folder(
            args.data_folder,
            args.company_id,
            clear_existing=args.clear
        )
        print(f"\nIngestion complete!")
        print(f"  Total parsed: {stats['total']}")
        print(f"  Successfully stored: {stats['success']}")
        print(f"  Failed: {stats['failed']}")

    asyncio.run(main())
