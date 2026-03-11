"""
Generate test pairs for human labeling.

This script:
1. Samples diverse queries from the database
2. For each query, retrieves candidates using multiple approaches
3. Outputs a JSON file for human labeling

Usage:
    python -m evaluation.generate_test_pairs --num-queries 30
"""

import asyncio
import json
import random
import argparse
from pathlib import Path
from datetime import datetime

# Add parent to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from db import get_pool, close_db


async def sample_diverse_queries(pool, num_queries: int = 30) -> list[dict]:
    """
    Sample diverse queries from different projects, phases, and issue types.
    Uses stratified sampling to ensure variety.
    """
    async with pool.acquire() as conn:
        # Get all items with question_text (cleaner for queries)
        rows = await conn.fetch("""
            SELECT
                id,
                source_project_name,
                source_type,
                source_ref,
                question_text,
                normalized_text,
                raw_text,
                trade_category,
                issue_type,
                project_phase,
                resolution_text
            FROM intelligence.items
            WHERE question_text IS NOT NULL
              AND LENGTH(question_text) > 20
            ORDER BY RANDOM()
            LIMIT 500
        """)

        if not rows:
            # Fallback to normalized_text
            rows = await conn.fetch("""
                SELECT
                    id,
                    source_project_name,
                    source_type,
                    source_ref,
                    NULL as question_text,
                    normalized_text,
                    raw_text,
                    trade_category,
                    issue_type,
                    project_phase,
                    resolution_text
                FROM intelligence.items
                WHERE normalized_text IS NOT NULL
                ORDER BY RANDOM()
                LIMIT 500
            """)

    # Convert to dicts
    items = [dict(row) for row in rows]

    # Stratified sampling: try to get variety across projects and issue types
    by_project = {}
    for item in items:
        proj = item.get("source_project_name", "unknown")
        if proj not in by_project:
            by_project[proj] = []
        by_project[proj].append(item)

    # Sample evenly from projects
    selected = []
    project_list = list(by_project.keys())
    idx = 0
    while len(selected) < num_queries and any(by_project.values()):
        proj = project_list[idx % len(project_list)]
        if by_project[proj]:
            selected.append(by_project[proj].pop(0))
        idx += 1
        # Remove empty projects
        project_list = [p for p in project_list if by_project[p]]

    return selected


async def get_candidates_for_query(
    pool,
    query_id: str,
    query_text: str,
    num_candidates: int = 10
) -> list[dict]:
    """
    Get candidate matches for a query using simple text similarity.
    We intentionally use a basic approach here - the goal is to get
    candidates that MIGHT be relevant for human labeling.
    """
    async with pool.acquire() as conn:
        # Get candidates that share some keywords (loose matching)
        # Exclude the query itself
        rows = await conn.fetch("""
            SELECT
                id,
                source_project_name,
                source_type,
                source_ref,
                question_text,
                normalized_text,
                raw_text,
                trade_category,
                issue_type,
                project_phase,
                resolution_text,
                cost_impact,
                schedule_impact_days
            FROM intelligence.items
            WHERE id != $1
              AND (question_text IS NOT NULL OR normalized_text IS NOT NULL)
            ORDER BY RANDOM()
            LIMIT $2
        """, query_id, num_candidates * 5)  # Get more, then filter

    candidates = [dict(row) for row in rows]

    # Simple keyword overlap scoring to get diverse candidates
    query_words = set(query_text.lower().split())
    scored = []
    for c in candidates:
        c_text = c.get("question_text") or c.get("normalized_text") or ""
        c_words = set(c_text.lower().split())
        overlap = len(query_words & c_words)
        scored.append((overlap, c))

    # Sort by overlap and take a mix: some high overlap, some low
    scored.sort(key=lambda x: x[0], reverse=True)

    # Take top 5 (likely relevant) + 5 random (might be relevant or not)
    top_candidates = [c for _, c in scored[:5]]
    random_candidates = random.sample([c for _, c in scored[5:]], min(5, len(scored) - 5))

    return top_candidates + random_candidates


def create_labeling_task(query: dict, candidates: list[dict]) -> dict:
    """
    Create a labeling task structure for human review.
    """
    query_text = query.get("question_text") or query.get("normalized_text") or query.get("raw_text", "")

    return {
        "task_id": f"task_{str(query['id'])[:8]}",
        "query": {
            "id": str(query["id"]),
            "project": query.get("source_project_name", ""),
            "ref": query.get("source_ref", ""),
            "text": query_text[:500],  # Truncate for readability
            "trade": query.get("trade_category"),
            "issue_type": query.get("issue_type"),
            "phase": query.get("project_phase"),
        },
        "candidates": [
            {
                "id": str(c["id"]),
                "project": c.get("source_project_name", ""),
                "ref": c.get("source_ref", ""),
                "text": (c.get("question_text") or c.get("normalized_text") or "")[:500],
                "trade": c.get("trade_category"),
                "issue_type": c.get("issue_type"),
                "phase": c.get("project_phase"),
                "resolution": (c.get("resolution_text") or "")[:200],
                # YOUR LABEL GOES HERE
                "relevance": None,  # Options: "highly_relevant", "somewhat_relevant", "not_relevant"
                "reasoning": None,  # Optional: why you chose this label
            }
            for c in candidates
        ],
        "labeled_by": None,  # Your name/initials
        "labeled_at": None,  # Will be filled when you label
    }


async def generate_test_pairs(num_queries: int = 30, candidates_per_query: int = 10):
    """Main function to generate test pairs."""
    print(f"Generating {num_queries} test queries with {candidates_per_query} candidates each...")

    pool = await get_pool()

    try:
        # Sample queries
        print("Sampling diverse queries...")
        queries = await sample_diverse_queries(pool, num_queries)
        print(f"  Got {len(queries)} queries")

        # Generate candidates for each
        tasks = []
        for i, query in enumerate(queries):
            query_text = query.get("question_text") or query.get("normalized_text") or ""
            print(f"  [{i+1}/{len(queries)}] Getting candidates for: {query_text[:60]}...")

            candidates = await get_candidates_for_query(
                pool,
                query["id"],
                query_text,
                candidates_per_query
            )

            task = create_labeling_task(query, candidates)
            tasks.append(task)

        # Save to file
        output_dir = Path(__file__).parent / "data"
        output_dir.mkdir(exist_ok=True)
        output_file = output_dir / "labeling_tasks.json"

        output = {
            "generated_at": datetime.now().isoformat(),
            "num_queries": len(tasks),
            "candidates_per_query": candidates_per_query,
            "instructions": {
                "how_to_label": [
                    "For each candidate, set 'relevance' to one of:",
                    "  - 'highly_relevant': Same or very similar issue, resolution would directly apply",
                    "  - 'somewhat_relevant': Related issue, some lessons might apply",
                    "  - 'not_relevant': Different issue, no useful connection",
                    "",
                    "Optionally add 'reasoning' to explain your choice.",
                    "Set 'labeled_by' to your name/initials.",
                    "Save the file when done.",
                ],
                "tips": [
                    "Focus on whether the RESOLUTION would be useful, not just surface similarity",
                    "Same trade + similar problem = likely relevant",
                    "Same keywords but different context = might not be relevant",
                    "Consider: would you want to see this match in production?",
                ]
            },
            "tasks": tasks,
        }

        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, default=str)

        print(f"\n{'='*60}")
        print(f"SUCCESS! Labeling tasks saved to:")
        print(f"  {output_file}")
        print(f"\nNext steps:")
        print(f"  1. Open the file in your editor")
        print(f"  2. For each candidate, set 'relevance' to:")
        print(f"     'highly_relevant', 'somewhat_relevant', or 'not_relevant'")
        print(f"  3. Save the file")
        print(f"  4. Run: python -m evaluation.evaluate")
        print(f"{'='*60}")

    finally:
        await close_db()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate test pairs for evaluation")
    parser.add_argument("--num-queries", type=int, default=30, help="Number of queries to generate")
    parser.add_argument("--candidates", type=int, default=10, help="Candidates per query")
    args = parser.parse_args()

    asyncio.run(generate_test_pairs(args.num_queries, args.candidates))
