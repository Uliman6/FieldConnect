"""
Compare flat search vs tiered search for 5 test queries.

Shows which tier each result came from and whether trade matching improved results.

Usage:
    python -m scripts.compare_tiered_search
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from db import get_pool, close_db
from similarity import (
    search_and_rank,
    tiered_search_and_rank,
    generate_embedding_async,
    extract_search_keywords,
    get_related_trades
)


# Test queries with expected trade focus
# NOTE: Trade names use underscores (fire_protection, not "fire protection")
TEST_QUERIES = [
    {
        "text": "The curtainwall installer is asking about mullion alignment tolerances at Level 3 north side",
        "trade": "curtainwall",
        "expected_trade_match": True,
    },
    {
        "text": "Electrical conduit routing conflicts with HVAC ductwork in the ceiling plenum at Grid C-5",
        "trade": "electrical",
        "expected_trade_match": True,
    },
    {
        "text": "Concrete spalling observed at the parking garage ramp. Rebar is exposed and corroding.",
        "trade": "concrete",
        "expected_trade_match": True,
    },
    {
        "text": "Fire sprinkler head locations don't match the reflected ceiling plan coordination drawings",
        "trade": "fire_protection",  # Now uses underscore
        "expected_trade_match": True,
    },
    {
        "text": "Waterproofing membrane at the plaza level has bubbling and delamination near drain locations",
        "trade": "waterproofing",
        "expected_trade_match": True,
    },
]


async def run_comparison():
    """Run comparison between flat and tiered search."""
    print("=" * 80)
    print("FLAT SEARCH vs TIERED SEARCH COMPARISON")
    print("=" * 80)

    pool = await get_pool()

    # Get company_id
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT DISTINCT company_id FROM intelligence.items LIMIT 1
        """)
        company_id = str(row["company_id"]) if row else None

    if not company_id:
        print("No data found in database")
        await close_db()
        return

    print(f"\nUsing company_id: {company_id}")

    for i, query in enumerate(TEST_QUERIES):
        print("\n" + "=" * 80)
        print(f"QUERY {i+1}: {query['text'][:70]}...")
        print(f"Expected Trade: {query['trade']}")
        print("=" * 80)

        # Extract keywords for display
        keywords = extract_search_keywords(query["text"])
        related = get_related_trades(query["trade"])
        print(f"Extracted Keywords: {keywords}")
        print(f"Related Trades: {related[:5]}...")

        # Generate embedding
        embedding = await generate_embedding_async(query["text"])

        # --- FLAT SEARCH (old) ---
        print("\n--- FLAT SEARCH (old approach) ---")
        flat_results = await search_and_rank(
            query_embedding=embedding,
            company_id=company_id,
            query_text=query["text"],
            top_k=5,
            min_final_score=0.1
        )

        for j, item in enumerate(flat_results):
            trade = item.get("trade_category", "N/A")
            ref = item.get("source_ref", "?")
            score = item.get("final_score", 0)
            trade_match = query["trade"].lower() in (trade or "").lower()
            match_marker = "[MATCH]" if trade_match else ""
            text_preview = (item.get("question_text") or item.get("normalized_text") or "")[:60]
            print(f"  {j+1}. [{ref}] trade={trade} score={score:.3f} {match_marker}")
            print(f"      {text_preview}...")

        flat_trade_matches = sum(
            1 for item in flat_results
            if query["trade"].lower() in (item.get("trade_category") or "").lower()
        )

        # --- TIERED SEARCH (new) ---
        print("\n--- TIERED SEARCH (new approach) ---")
        tiered_results = await tiered_search_and_rank(
            query_embedding=embedding,
            company_id=company_id,
            query_text=query["text"],
            query_trade=query["trade"],
            top_k=5,
            min_final_score=0.1,
            debug=True
        )

        for j, item in enumerate(tiered_results):
            trade = item.get("trade_category", "N/A")
            ref = item.get("source_ref", "?")
            score = item.get("final_score", 0)
            tier = item.get("tier", "?")
            tier_boost = item.get("tier_boost", 0)
            trade_match = query["trade"].lower() in (trade or "").lower()
            match_marker = "[MATCH]" if trade_match else ""
            text_preview = (item.get("question_text") or item.get("normalized_text") or "")[:60]
            print(f"  {j+1}. [{ref}] tier={tier} trade={trade} score={score:.3f} {match_marker}")
            print(f"      boost={tier_boost:.2f} | {text_preview}...")

        tiered_trade_matches = sum(
            1 for item in tiered_results
            if query["trade"].lower() in (item.get("trade_category") or "").lower()
        )

        # Summary
        print(f"\n  SUMMARY: Flat={flat_trade_matches}/5 trade matches, Tiered={tiered_trade_matches}/5 trade matches")
        if tiered_trade_matches > flat_trade_matches:
            print("  >>> TIERED SEARCH IMPROVED TRADE MATCHING <<<")
        elif tiered_trade_matches == flat_trade_matches:
            print("  === Same trade matching performance ===")
        else:
            print("  !!! Flat search had more trade matches (investigate) !!!")

    await close_db()
    print("\n" + "=" * 80)
    print("COMPARISON COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_comparison())
