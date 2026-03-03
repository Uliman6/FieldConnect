"""
Test similarity search with sample queries.

Usage:
    python scripts/test_similarity.py "HVAC duct leak in ceiling"
    python scripts/test_similarity.py --interactive
"""

import asyncio
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import logging
import db
from similarity.embeddings import generate_embedding_async, build_embedding_input
from similarity.search import search_similar

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

COMPANY_ID = "00000000-0000-0000-0000-000000000001"

# Sample queries for testing
SAMPLE_QUERIES = [
    "Water leak in the ceiling near the elevator",
    "Electrical panel not installed per spec",
    "Missing fire caulking at penetrations",
    "Drywall damage from trade work",
    "HVAC duct connection issue",
    "Concrete crack in the floor slab",
    "Paint defects and touch-up needed",
    "Door hardware not per specification",
]


async def search_and_display(query: str, top_k: int = 5):
    """Search for similar items and display results."""
    logger.info(f"\n{'='*60}")
    logger.info(f"Query: {query}")
    logger.info(f"{'='*60}")

    # Generate embedding for query
    embedding_input = build_embedding_input(query)
    query_embedding = await generate_embedding_async(embedding_input)

    # Search
    results = await search_similar(
        query_embedding=query_embedding,
        company_id=COMPANY_ID,
        top_k=top_k,
        min_score=0.3
    )

    if not results:
        logger.info("No similar items found.")
        return

    logger.info(f"\nFound {len(results)} similar items:\n")

    for i, item in enumerate(results, 1):
        score = item.get("semantic_score", 0)
        source_type = item.get("source_type", "unknown")
        project = item.get("source_project_name", "Unknown Project")
        phase = item.get("project_phase", "N/A")
        text = item.get("normalized_text") or item.get("raw_text") or ""

        # Truncate text for display
        text_display = text[:150] + "..." if len(text) > 150 else text

        print(f"{i}. [{score:.3f}] [{source_type.upper()}] {project}")
        print(f"   Phase: {phase}")
        print(f"   {text_display}")
        print()


async def run_sample_queries():
    """Run all sample queries."""
    await db.init_db()

    for query in SAMPLE_QUERIES:
        await search_and_display(query, top_k=3)
        print("\n")


async def run_interactive():
    """Interactive mode for testing queries."""
    await db.init_db()

    print("\n" + "="*60)
    print("SIMILARITY SEARCH - Interactive Mode")
    print("="*60)
    print("Enter a query to find similar historical items.")
    print("Type 'quit' to exit.\n")

    while True:
        try:
            query = input("\nEnter query: ").strip()
            if query.lower() in ('quit', 'exit', 'q'):
                break
            if not query:
                continue

            await search_and_display(query, top_k=5)

        except KeyboardInterrupt:
            break
        except Exception as e:
            logger.error(f"Error: {e}")

    print("\nGoodbye!")


async def run_single_query(query: str, top_k: int = 5):
    """Run a single query."""
    await db.init_db()
    await search_and_display(query, top_k)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test similarity search")
    parser.add_argument("query", nargs="?", help="Search query text")
    parser.add_argument("--interactive", "-i", action="store_true", help="Interactive mode")
    parser.add_argument("--samples", action="store_true", help="Run sample queries")
    parser.add_argument("--top-k", type=int, default=5, help="Number of results")

    args = parser.parse_args()

    if args.interactive:
        asyncio.run(run_interactive())
    elif args.samples:
        asyncio.run(run_sample_queries())
    elif args.query:
        asyncio.run(run_single_query(args.query, args.top_k))
    else:
        # Default to sample queries
        asyncio.run(run_sample_queries())
