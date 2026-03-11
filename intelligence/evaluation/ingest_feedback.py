"""
Ingest labeled feedback back into the system.

This script:
1. Reads labeled data from labeling_tasks.json
2. Stores relevance judgments in the database feedback table
3. Optionally updates the keyword index based on findings

Usage:
    python -m evaluation.ingest_feedback
"""

import asyncio
import json
from pathlib import Path
from datetime import datetime
import uuid

# Add parent to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from db import get_pool, close_db


async def ingest_labeled_data():
    """Ingest labeled relevance judgments into the database."""
    print("=" * 60)
    print("FEEDBACK INGESTION")
    print("=" * 60)

    data_file = Path(__file__).parent / "data" / "labeling_tasks.json"
    if not data_file.exists():
        print(f"No data file found at {data_file}")
        return

    with open(data_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    tasks = data.get("tasks", [])

    # Count labeled items
    labeled_pairs = []
    for task in tasks:
        query_id = task["query"]["id"]
        query_text = task["query"]["text"]

        for candidate in task.get("candidates", []):
            if candidate.get("relevance") is not None:
                labeled_pairs.append({
                    "query_id": query_id,
                    "query_text": query_text,
                    "candidate_id": candidate["id"],
                    "candidate_text": candidate["text"],
                    "relevance": candidate["relevance"],
                    "reasoning": candidate.get("reasoning"),
                    "labeled_by": task.get("labeled_by"),
                })

    if not labeled_pairs:
        print("No labeled pairs found. Please label some data first.")
        return

    print(f"Found {len(labeled_pairs)} labeled pairs")

    # Store in database
    pool = await get_pool()

    try:
        async with pool.acquire() as conn:
            # Check if feedback table exists with relevance_label column
            check = await conn.fetchval("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'intelligence'
                    AND table_name = 'feedback'
                    AND column_name = 'relevance_label'
                )
            """)

            if not check:
                # Add relevance_label column if it doesn't exist
                await conn.execute("""
                    ALTER TABLE intelligence.feedback
                    ADD COLUMN IF NOT EXISTS relevance_label TEXT,
                    ADD COLUMN IF NOT EXISTS query_item_id UUID,
                    ADD COLUMN IF NOT EXISTS candidate_item_id UUID,
                    ADD COLUMN IF NOT EXISTS reasoning TEXT,
                    ADD COLUMN IF NOT EXISTS labeled_by TEXT
                """)
                print("Added relevance labeling columns to feedback table")

            # Insert labeled pairs
            inserted = 0
            for pair in labeled_pairs:
                try:
                    await conn.execute("""
                        INSERT INTO intelligence.feedback (
                            id, query_item_id, candidate_item_id,
                            relevance_label, reasoning, labeled_by,
                            created_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                        ON CONFLICT DO NOTHING
                    """,
                        uuid.uuid4(),
                        uuid.UUID(pair["query_id"]) if pair["query_id"] else None,
                        uuid.UUID(pair["candidate_id"]) if pair["candidate_id"] else None,
                        pair["relevance"],
                        pair["reasoning"],
                        pair["labeled_by"],
                        datetime.now(),
                    )
                    inserted += 1
                except Exception as e:
                    print(f"  Error inserting pair: {e}")

            print(f"Inserted {inserted} feedback records")

        # Analyze patterns
        print("\n" + "=" * 60)
        print("PATTERN ANALYSIS")
        print("=" * 60)

        # Find common keywords in highly relevant matches
        highly_relevant = [p for p in labeled_pairs if p["relevance"] == "highly_relevant"]
        print(f"\nAnalyzing {len(highly_relevant)} highly relevant pairs...")

        if highly_relevant:
            # Extract common terms
            from collections import Counter
            from extraction.keywords import tokenize

            query_terms = Counter()
            candidate_terms = Counter()
            shared_terms = Counter()

            for pair in highly_relevant:
                q_tokens = set(tokenize(pair["query_text"]))
                c_tokens = set(tokenize(pair["candidate_text"]))
                shared = q_tokens & c_tokens

                for t in q_tokens:
                    query_terms[t] += 1
                for t in c_tokens:
                    candidate_terms[t] += 1
                for t in shared:
                    shared_terms[t] += 1

            print("\nMost common shared terms in highly relevant pairs:")
            for term, count in shared_terms.most_common(20):
                print(f"  {term}: {count}")

            # Save insights
            insights_file = Path(__file__).parent / "data" / "relevance_insights.json"
            with open(insights_file, "w", encoding="utf-8") as f:
                json.dump({
                    "highly_relevant_count": len(highly_relevant),
                    "common_shared_terms": dict(shared_terms.most_common(50)),
                    "common_query_terms": dict(query_terms.most_common(50)),
                    "common_candidate_terms": dict(candidate_terms.most_common(50)),
                }, f, indent=2)
            print(f"\nInsights saved to: {insights_file}")

    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(ingest_labeled_data())
