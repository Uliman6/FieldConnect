"""
Quick-start script for the evaluation workflow.

Usage:
    python -m evaluation.run generate   # Step 1: Generate labeling tasks
    python -m evaluation.run evaluate   # Step 2: Evaluate approaches (after labeling)
    python -m evaluation.run ingest     # Step 3: Store feedback in database
    python -m evaluation.run all        # Run full pipeline

Or run interactively:
    python -m evaluation.run
"""

import asyncio
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))


def print_banner():
    print("""
╔══════════════════════════════════════════════════════════════════╗
║           RETRIEVAL EVALUATION FRAMEWORK                         ║
║                                                                  ║
║  Test different approaches to find what works best for your data ║
╚══════════════════════════════════════════════════════════════════╝
    """)


def print_help():
    print("""
WORKFLOW:
=========

STEP 1: Generate labeling tasks
   python -m evaluation.run generate

   This creates evaluation/data/labeling_tasks.json with queries
   and candidate matches for you to label.

STEP 2: Label the data (YOUR PART)
   Open evaluation/data/labeling_tasks.json in your editor.
   For each candidate, set "relevance" to one of:
   - "highly_relevant"  : Same or very similar issue
   - "somewhat_relevant": Related, some lessons apply
   - "not_relevant"     : No useful connection

   Optionally add "reasoning" to explain your choice.

STEP 3: Evaluate approaches
   python -m evaluation.run evaluate

   Compares BM25, Keywords, Embeddings, Hybrid approaches
   against your labeled ground truth.

STEP 4 (Optional): Store feedback
   python -m evaluation.run ingest

   Saves your labels to the database for future learning.

TIPS:
=====
- Start with ~10 queries, label them, evaluate
- Iterate: label more, tune weights, re-evaluate
- Focus on precision@5 (are top 5 results relevant?)
- MRR tells you how quickly relevant items appear
    """)


async def run_generate():
    from evaluation.generate_test_pairs import generate_test_pairs
    await generate_test_pairs(num_queries=30, candidates_per_query=10)


async def run_evaluate():
    from evaluation.evaluate import run_evaluation
    await run_evaluation()


async def run_ingest():
    from evaluation.ingest_feedback import ingest_labeled_data
    await ingest_labeled_data()


async def interactive_menu():
    print_banner()

    while True:
        print("\nOptions:")
        print("  1. Generate labeling tasks")
        print("  2. Evaluate approaches (after labeling)")
        print("  3. Ingest feedback to database")
        print("  4. Help / Show workflow")
        print("  q. Quit")
        print()

        choice = input("Enter choice: ").strip().lower()

        if choice in ("1", "generate"):
            await run_generate()
        elif choice in ("2", "evaluate"):
            await run_evaluate()
        elif choice in ("3", "ingest"):
            await run_ingest()
        elif choice in ("4", "help"):
            print_help()
        elif choice in ("q", "quit", "exit"):
            print("Goodbye!")
            break
        else:
            print(f"Unknown option: {choice}")


async def main():
    if len(sys.argv) < 2:
        await interactive_menu()
        return

    command = sys.argv[1].lower()

    if command == "generate":
        await run_generate()
    elif command == "evaluate":
        await run_evaluate()
    elif command == "ingest":
        await run_ingest()
    elif command == "all":
        print("Running full pipeline...\n")
        await run_generate()
        print("\n" + "=" * 60)
        print("NOW: Label the data in evaluation/data/labeling_tasks.json")
        print("THEN: Run `python -m evaluation.run evaluate`")
        print("=" * 60)
    elif command in ("help", "-h", "--help"):
        print_help()
    else:
        print(f"Unknown command: {command}")
        print_help()


if __name__ == "__main__":
    asyncio.run(main())
