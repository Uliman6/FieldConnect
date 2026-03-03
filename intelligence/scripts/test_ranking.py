"""
Test the ranking algorithm with sample queries.

Shows the difference between semantic-only search and combined ranking.

Usage:
    python scripts/test_ranking.py "HVAC coordination issue" --phase mep_rough_in
    python scripts/test_ranking.py --samples
"""

import asyncio
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import logging
import db
from similarity.embeddings import generate_embedding_async, build_embedding_input
from similarity.search import search_similar, search_and_rank
from similarity.ranking import explain_ranking
from extraction.regex_patterns import extract_all_regex_entities
from extraction.keywords import extract_all_keywords_flat

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

COMPANY_ID = "00000000-0000-0000-0000-000000000001"


def extract_query_entities(text: str) -> dict[str, set[str]]:
    """Extract entities from query text and return as dict of sets."""
    regex_results = extract_all_regex_entities(text)

    entities = {}
    for entity_type, matches in regex_results.items():
        if matches:
            entities[entity_type] = {m.get("value", "").lower() for m in matches}

    return entities


async def compare_search_methods(
    query: str,
    query_phase: str = None,
    top_k: int = 5
):
    """Compare semantic-only search vs ranked search."""
    logger.info(f"\n{'='*70}")
    logger.info(f"Query: {query}")
    if query_phase:
        logger.info(f"Phase: {query_phase}")
    logger.info(f"{'='*70}")

    # Generate embedding
    embedding_input = build_embedding_input(query, project_phase=query_phase)
    query_embedding = await generate_embedding_async(embedding_input)

    # Extract entities from query
    query_entities = extract_query_entities(query)
    if query_entities:
        logger.info(f"Query entities: {query_entities}")

    # Extract keywords from query (CRITICAL for relevance)
    query_keywords = extract_all_keywords_flat(query)
    if query_keywords:
        logger.info(f"Query keywords: {query_keywords}")

    # Method 1: Semantic-only search
    semantic_results = await search_similar(
        query_embedding=query_embedding,
        company_id=COMPANY_ID,
        top_k=top_k,
        min_score=0.25
    )

    # Method 2: Ranked search with keywords
    ranked_results = await search_and_rank(
        query_embedding=query_embedding,
        company_id=COMPANY_ID,
        query_text=query,
        top_k=top_k,
        min_semantic_score=0.25,
        min_final_score=0.20,
        query_phase=query_phase,
        query_entities=query_entities,
        query_keywords=query_keywords
    )

    # Display results side by side
    print(f"\n{'SEMANTIC-ONLY SEARCH':^35} | {'RANKED SEARCH':^35}")
    print(f"{'-'*35} | {'-'*35}")

    max_len = max(len(semantic_results), len(ranked_results))
    for i in range(max_len):
        # Semantic result
        if i < len(semantic_results):
            sem = semantic_results[i]
            sem_text = (sem.get("normalized_text") or sem.get("raw_text") or "")[:25]
            sem_score = sem.get("semantic_score", 0)
            sem_col = f"{i+1}. [{sem_score:.3f}] {sem_text}..."
        else:
            sem_col = ""

        # Ranked result
        if i < len(ranked_results):
            rnk = ranked_results[i]
            rnk_text = (rnk.get("normalized_text") or rnk.get("raw_text") or "")[:25]
            final_score = rnk.get("final_score", 0)
            rnk_col = f"{i+1}. [{final_score:.3f}] {rnk_text}..."
        else:
            rnk_col = ""

        print(f"{sem_col:<35} | {rnk_col:<35}")

    # Show detailed breakdown for top ranked result
    if ranked_results:
        print(f"\n{'='*70}")
        print("TOP RANKED RESULT - Score Breakdown:")
        print(f"{'='*70}")
        top = ranked_results[0]
        print(f"Text: {(top.get('normalized_text') or top.get('raw_text') or '')[:100]}...")
        print(f"Project: {top.get('source_project_name', 'Unknown')}")
        print(f"Phase: {top.get('project_phase', 'N/A')}")
        matched_kw = top.get('matched_keywords', [])
        print(f"Matched Keywords: {matched_kw if matched_kw else 'None'}")
        print(f"\nScores:")
        print(f"  KEYWORD:   {top.get('keyword_score', 0):.3f} (35% weight) <-- CRITICAL")
        print(f"  Semantic:  {top.get('semantic_score', 0):.3f} (30% weight)")
        print(f"  Phase:     {top.get('phase_score', 0):.3f} (15% weight)")
        print(f"  Entity:    {top.get('entity_score', 0):.3f} (10% weight)")
        print(f"  Outcome:   {top.get('outcome_score', 0):.3f} (7% weight)")
        print(f"  Recency:   {top.get('recency_score', 0):.3f} (3% weight)")
        print(f"  -------------------------")
        print(f"  FINAL:     {top.get('final_score', 0):.3f}")
        print(f"\nExplanation: {explain_ranking(top)}")


async def run_sample_queries():
    """Run sample queries with different phases."""
    await db.init_db()

    samples = [
        ("Water leak in ceiling near elevator", "envelope"),
        ("HVAC duct coordination with sprinkler", "mep_rough_in"),
        ("Concrete crack in floor slab", "structure"),
        ("Paint touch-up needed at drywall seams", "interior_finishes"),
        ("Fire caulking missing at penetrations", "mep_trim_out"),
        ("Door hardware specification issue", "interior_finishes"),
    ]

    for query, phase in samples:
        await compare_search_methods(query, query_phase=phase, top_k=3)
        print("\n")


async def run_single_query(query: str, phase: str = None, top_k: int = 5):
    """Run a single query."""
    await db.init_db()
    await compare_search_methods(query, query_phase=phase, top_k=top_k)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test ranking algorithm")
    parser.add_argument("query", nargs="?", help="Search query text")
    parser.add_argument("--phase", type=str, help="Construction phase context")
    parser.add_argument("--samples", action="store_true", help="Run sample queries")
    parser.add_argument("--top-k", type=int, default=5, help="Number of results")

    args = parser.parse_args()

    if args.samples:
        asyncio.run(run_sample_queries())
    elif args.query:
        asyncio.run(run_single_query(args.query, args.phase, args.top_k))
    else:
        asyncio.run(run_sample_queries())
