"""
Compare random RFIs using the tiered similarity search and export results to Excel.

Usage:
    python scripts/compare_rfis_excel.py
"""

import asyncio
import sys
from pathlib import Path
import random
import re

sys.path.insert(0, str(Path(__file__).parent.parent))

import logging
import db
from similarity.embeddings import generate_embedding_async, build_embedding_input
from similarity.tiered_search import tiered_search_and_rank
from extraction.keywords import extract_all_keywords_flat

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

COMPANY_ID = "00000000-0000-0000-0000-000000000001"
HIGH_RELEVANCE_THRESHOLD = 0.45  # What we consider "high relevance"


def get_base_ref(ref: str) -> str:
    """Get base ref without revision suffix (RFI-0920.1 -> RFI-0920)."""
    if not ref:
        return ""
    # Remove .1, .2, etc. suffixes
    return re.sub(r'\.\d+$', '', ref)


def is_revision_pair(ref1: str, ref2: str) -> bool:
    """Check if two refs are revisions of each other (e.g., RFI-1157.1 and RFI-1157.2)."""
    base1 = get_base_ref(ref1)
    base2 = get_base_ref(ref2)
    # Same base = revision pair (should be excluded - it's cheating)
    return base1 == base2


async def get_all_rfis() -> list[dict]:
    """Get all RFIs from the database."""
    rows = await db.fetch("""
        SELECT
            id, source_project_id, source_project_name, source_type, source_ref,
            raw_text, question_text, normalized_text, project_phase, phase_percentage,
            trade_category, issue_type, severity,
            resolution_text, cost_impact, schedule_impact_days, resulted_in_co,
            abstracted_summary, embedding, metadata, item_date
        FROM intelligence.items
        WHERE company_id = $1
          AND source_type = 'rfi'
          AND embedding IS NOT NULL
        ORDER BY item_date DESC
    """, COMPANY_ID)

    return [dict(row) for row in rows]


async def compare_rfi_to_others(
    query_rfi: dict,
    all_rfis: list[dict]
) -> list[dict]:
    """
    Compare one RFI to all others using tiered search.

    Returns top matches with scores.
    """
    # Get the query text - prefer question_text
    query_text = query_rfi.get("question_text") or query_rfi.get("normalized_text") or query_rfi.get("raw_text") or ""

    if not query_text.strip():
        return []

    query_embedding = query_rfi.get("embedding")
    if not query_embedding:
        return []

    query_trade = query_rfi.get("trade_category")
    query_phase = query_rfi.get("project_phase")

    # Run tiered search
    results = await tiered_search_and_rank(
        query_embedding=query_embedding,
        company_id=COMPANY_ID,
        query_text=query_text,
        query_trade=query_trade,
        top_k=10,
        min_final_score=0.20,
        query_phase=query_phase,
        debug=True
    )

    # Filter out self-matches and revision pairs
    query_id = str(query_rfi["id"])
    query_ref = query_rfi.get("source_ref", "")

    filtered_results = []
    for r in results:
        # Skip self
        if str(r["id"]) == query_id:
            continue
        # Skip revision pairs (e.g., RFI-1157.1 vs RFI-1157.2)
        match_ref = r.get("source_ref", "")
        if is_revision_pair(query_ref, match_ref):
            continue
        filtered_results.append(r)

    return filtered_results[:5]  # Return top 5 matches


async def run_comparisons(
    sample_size: int = 30,
    max_rounds: int = 10
) -> tuple[list[dict], bool]:
    """
    Run RFI comparisons until we find high-relevance matches.

    Returns:
        Tuple of (all_comparison_results, found_high_relevance)
    """
    await db.init_db()

    all_rfis = await get_all_rfis()
    logger.info(f"Found {len(all_rfis)} RFIs in database")

    if len(all_rfis) < 2:
        logger.error("Not enough RFIs to compare")
        return [], False

    all_results = []
    found_high_relevance = False
    highest_score_seen = 0.0

    for round_num in range(1, max_rounds + 1):
        logger.info(f"\n{'='*60}")
        logger.info(f"ROUND {round_num}")
        logger.info(f"{'='*60}")

        # Sample random RFIs
        sample = random.sample(all_rfis, min(sample_size, len(all_rfis)))

        for i, query_rfi in enumerate(sample, 1):
            query_text = query_rfi.get("question_text") or query_rfi.get("normalized_text") or query_rfi.get("raw_text") or ""
            query_ref = query_rfi.get("source_ref", "N/A")

            logger.info(f"\n[{i}/{len(sample)}] Comparing RFI {query_ref}...")

            matches = await compare_rfi_to_others(query_rfi, all_rfis)

            for match in matches:
                final_score = match.get("final_score", 0)
                highest_score_seen = max(highest_score_seen, final_score)

                result = {
                    "round": round_num,
                    "query_rfi_ref": query_ref,
                    "query_project": query_rfi.get("source_project_name", ""),
                    "query_trade": query_rfi.get("trade_category", ""),
                    "query_phase": query_rfi.get("project_phase", ""),
                    "query_text": query_text[:500],  # Truncate for Excel
                    "match_rfi_ref": match.get("source_ref", "N/A"),
                    "match_project": match.get("source_project_name", ""),
                    "match_trade": match.get("trade_category", ""),
                    "match_phase": match.get("project_phase", ""),
                    "match_text": (match.get("question_text") or match.get("normalized_text") or match.get("raw_text") or "")[:500],
                    "final_score": final_score,
                    "keyword_score": match.get("keyword_score", 0),
                    "semantic_score": match.get("semantic_score", 0),
                    "phase_score": match.get("phase_score", 0),
                    "entity_score": match.get("entity_score", 0),
                    "matched_keywords": ", ".join(match.get("matched_keywords", [])),
                    "tier": match.get("tier", 4),
                }

                all_results.append(result)

                if final_score >= HIGH_RELEVANCE_THRESHOLD:
                    found_high_relevance = True
                    logger.info(f"  HIGH RELEVANCE FOUND! Score: {final_score:.3f}")
                    logger.info(f"    Query: {query_text[:100]}...")
                    logger.info(f"    Match: {result['match_text'][:100]}...")

        logger.info(f"\nRound {round_num} complete. Highest score seen: {highest_score_seen:.3f}")

        if found_high_relevance:
            logger.info("Found high relevance matches! Stopping.")
            break

    return all_results, found_high_relevance


def export_to_excel(results: list[dict], output_path: str):
    """Export results to Excel file."""
    try:
        import pandas as pd
    except ImportError:
        logger.error("pandas not installed. Installing...")
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "pandas", "openpyxl"], check=True)
        import pandas as pd

    df = pd.DataFrame(results)

    # Sort by final_score descending
    df = df.sort_values("final_score", ascending=False)

    # Save to Excel
    df.to_excel(output_path, index=False, engine="openpyxl")
    logger.info(f"Results exported to: {output_path}")

    return df


async def main():
    logger.info("Starting RFI comparison...")

    results, found_high = await run_comparisons(
        sample_size=30,
        max_rounds=5  # Will stop early if high relevance found
    )

    if not results:
        logger.error("No results to export")
        return

    # Export to Excel
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = Path(__file__).parent.parent / "evaluation" / f"rfi_comparison_{timestamp}.xlsx"
    output_path.parent.mkdir(exist_ok=True)

    df = export_to_excel(results, str(output_path))

    # Print summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"Total comparisons: {len(results)}")
    print(f"High relevance found: {found_high}")
    print(f"\nTop 10 matches by final_score:")
    print(df[["query_rfi_ref", "match_rfi_ref", "final_score", "keyword_score", "semantic_score", "matched_keywords"]].head(10).to_string())
    print(f"\nResults saved to: {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
