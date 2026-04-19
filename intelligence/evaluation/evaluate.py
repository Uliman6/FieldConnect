"""
Evaluate retrieval approaches against human-labeled ground truth.

Usage:
    python -m evaluation.evaluate

This reads labeled data from evaluation/data/labeling_tasks.json
and computes metrics for different retrieval approaches.
"""

import asyncio
import json
from pathlib import Path
from collections import defaultdict
from typing import Optional
import numpy as np

# Add parent to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from db import get_pool, close_db
from evaluation.approaches import BM25, EmbeddingRetriever, KeywordRetriever, HybridRetriever, FullHybridRetriever, AbstractionRetriever
from extraction.abstraction import abstract_rule_based, abstraction_to_json


# =============================================================================
# Metrics
# =============================================================================

def precision_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    """
    Precision@K: Of the top K retrieved, how many are relevant?
    """
    top_k = retrieved[:k]
    if not top_k:
        return 0.0
    relevant_in_top_k = len(set(top_k) & relevant)
    return relevant_in_top_k / len(top_k)


def recall_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    """
    Recall@K: Of all relevant items, how many are in top K?
    """
    if not relevant:
        return 0.0
    top_k = set(retrieved[:k])
    relevant_in_top_k = len(top_k & relevant)
    return relevant_in_top_k / len(relevant)


def mean_reciprocal_rank(retrieved: list[str], relevant: set[str]) -> float:
    """
    MRR: 1 / (rank of first relevant item)
    """
    for idx, doc_id in enumerate(retrieved):
        if doc_id in relevant:
            return 1.0 / (idx + 1)
    return 0.0


def ndcg_at_k(retrieved: list[str], relevance_scores: dict[str, float], k: int) -> float:
    """
    NDCG@K: Normalized Discounted Cumulative Gain

    Args:
        retrieved: List of retrieved doc IDs in order
        relevance_scores: doc_id -> relevance score (e.g., 2=highly, 1=somewhat, 0=not)
        k: Cutoff
    """
    top_k = retrieved[:k]

    # DCG
    dcg = 0.0
    for idx, doc_id in enumerate(top_k):
        rel = relevance_scores.get(doc_id, 0)
        dcg += (2 ** rel - 1) / np.log2(idx + 2)  # idx + 2 because log2(1) = 0

    # Ideal DCG
    ideal_rels = sorted(relevance_scores.values(), reverse=True)[:k]
    idcg = 0.0
    for idx, rel in enumerate(ideal_rels):
        idcg += (2 ** rel - 1) / np.log2(idx + 2)

    if idcg == 0:
        return 0.0
    return dcg / idcg


def hit_rate_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    """
    Hit Rate@K: 1 if any relevant item in top K, else 0
    """
    top_k = set(retrieved[:k])
    return 1.0 if (top_k & relevant) else 0.0


# =============================================================================
# Load labeled data
# =============================================================================

def load_labeled_data(filepath: Path) -> list[dict]:
    """Load labeled tasks and filter to only those with labels."""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    labeled_tasks = []
    for task in data.get("tasks", []):
        # Check if any candidates have been labeled
        labeled_candidates = [
            c for c in task.get("candidates", [])
            if c.get("relevance") is not None
        ]

        if labeled_candidates:
            task["candidates"] = labeled_candidates
            labeled_tasks.append(task)

    return labeled_tasks


def extract_ground_truth(task: dict) -> tuple[set[str], set[str], dict[str, float]]:
    """
    Extract ground truth from a labeled task.

    Returns:
        - highly_relevant: set of doc IDs marked highly relevant
        - all_relevant: set of doc IDs marked highly or somewhat relevant
        - relevance_scores: doc_id -> numeric score (2=highly, 1=somewhat, 0=not)
    """
    highly_relevant = set()
    all_relevant = set()
    relevance_scores = {}

    for candidate in task.get("candidates", []):
        doc_id = candidate.get("id")
        rel = candidate.get("relevance")

        if rel == "highly_relevant":
            highly_relevant.add(doc_id)
            all_relevant.add(doc_id)
            relevance_scores[doc_id] = 2.0
        elif rel == "somewhat_relevant":
            all_relevant.add(doc_id)
            relevance_scores[doc_id] = 1.0
        else:
            relevance_scores[doc_id] = 0.0

    return highly_relevant, all_relevant, relevance_scores


# =============================================================================
# Run evaluation
# =============================================================================

async def load_corpus(pool) -> list[dict]:
    """Load all items from database for retrieval, including abstractions."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                id::text,
                COALESCE(question_text, normalized_text, raw_text) as text,
                embedding,
                project_phase as phase,
                trade_category as trade,
                abstracted_summary
            FROM intelligence.items
            WHERE (question_text IS NOT NULL OR normalized_text IS NOT NULL)
        """)

    corpus = []
    for row in rows:
        doc = dict(row)
        # Parse abstraction JSON if present
        abstraction = row.get("abstracted_summary")
        if abstraction and isinstance(abstraction, str):
            try:
                import json
                doc["abstraction"] = json.loads(abstraction)
            except:
                doc["abstraction"] = {}
        elif abstraction and isinstance(abstraction, dict):
            doc["abstraction"] = abstraction
        else:
            doc["abstraction"] = {}
        corpus.append(doc)

    return corpus


async def run_evaluation():
    """Main evaluation function."""
    print("=" * 70)
    print("RETRIEVAL APPROACH EVALUATION")
    print("=" * 70)

    # Load labeled data
    data_file = Path(__file__).parent / "data" / "labeling_tasks.json"
    if not data_file.exists():
        print(f"\nERROR: No labeled data found at {data_file}")
        print("Run `python -m evaluation.generate_test_pairs` first, then label the data.")
        return

    labeled_tasks = load_labeled_data(data_file)
    if not labeled_tasks:
        print(f"\nNo labeled tasks found. Please label some candidates in:")
        print(f"  {data_file}")
        print("\nSet 'relevance' to 'highly_relevant', 'somewhat_relevant', or 'not_relevant'")
        return

    print(f"\nLoaded {len(labeled_tasks)} labeled tasks")

    # Count labels
    total_labeled = sum(len(t.get("candidates", [])) for t in labeled_tasks)
    highly_count = sum(
        1 for t in labeled_tasks
        for c in t.get("candidates", [])
        if c.get("relevance") == "highly_relevant"
    )
    somewhat_count = sum(
        1 for t in labeled_tasks
        for c in t.get("candidates", [])
        if c.get("relevance") == "somewhat_relevant"
    )

    print(f"  Total labeled candidates: {total_labeled}")
    print(f"  Highly relevant: {highly_count}")
    print(f"  Somewhat relevant: {somewhat_count}")
    print(f"  Not relevant: {total_labeled - highly_count - somewhat_count}")

    # Load corpus
    print("\nLoading corpus from database...")
    pool = await get_pool()

    try:
        corpus = await load_corpus(pool)
        print(f"  Loaded {len(corpus)} documents")

        # Filter to documents with embeddings for embedding-based approaches
        corpus_with_embeddings = [d for d in corpus if d.get("embedding")]
        print(f"  Documents with embeddings: {len(corpus_with_embeddings)}")

        # Initialize retrievers
        print("\nInitializing retrievers...")

        bm25 = BM25()
        bm25.fit(corpus)
        print("  - BM25: ready")

        keyword_retriever = KeywordRetriever()
        keyword_retriever.fit(corpus)
        print("  - Keyword: ready")

        embedding_retriever = EmbeddingRetriever()
        embedding_retriever.fit(corpus_with_embeddings)
        print("  - Embedding: ready")

        hybrid = HybridRetriever(bm25_weight=0.5, embedding_weight=0.5)
        hybrid.fit(corpus_with_embeddings)
        print("  - Hybrid (BM25+Embedding): ready")

        full_hybrid = FullHybridRetriever()
        full_hybrid.fit(corpus_with_embeddings)
        print("  - Full Hybrid (all signals): ready")

        # Filter to documents with abstractions for abstraction-based approach
        corpus_with_abstractions = [
            d for d in corpus_with_embeddings
            if d.get("abstraction") and d["abstraction"].get("key_terms")
        ]
        print(f"  Documents with abstractions: {len(corpus_with_abstractions)}")

        abstraction_retriever = AbstractionRetriever()
        abstraction_retriever.fit(corpus_with_abstractions)
        print("  - Abstraction (key_terms + issue_type): ready")

        # Evaluate each approach
        print("\n" + "=" * 70)
        print("EVALUATION RESULTS")
        print("=" * 70)

        approaches = {
            "BM25": ("bm25", bm25),
            "Keywords": ("keyword", keyword_retriever),
            "Embeddings": ("embedding", embedding_retriever),
            "Hybrid (BM25+Emb)": ("hybrid", hybrid),
            "Full Hybrid": ("full_hybrid", full_hybrid),
            "Abstraction": ("abstraction", abstraction_retriever),
        }

        results = {}

        for approach_name, (approach_type, retriever) in approaches.items():
            metrics = defaultdict(list)

            for task in labeled_tasks:
                query_text = task["query"]["text"]
                query_id = task["query"]["id"]

                highly_relevant, all_relevant, relevance_scores = extract_ground_truth(task)

                # Get candidates that were in this task (for fair comparison)
                task_candidate_ids = {c["id"] for c in task.get("candidates", [])}

                # Run retrieval
                if approach_type == "bm25":
                    ranked = retriever.rank(query_text, top_k=50)
                    retrieved = [doc_id for doc_id, _ in ranked]
                elif approach_type == "keyword":
                    ranked = retriever.rank(query_text, top_k=50)
                    retrieved = [doc_id for doc_id, _ in ranked]
                elif approach_type == "embedding":
                    # Need query embedding - skip if not available
                    # For now, we'll get it from the corpus if the query is in there
                    query_emb = None
                    for doc in corpus_with_embeddings:
                        if doc["id"] == query_id:
                            query_emb = doc["embedding"]
                            break
                    if query_emb is None:
                        continue
                    ranked = retriever.rank(query_emb, top_k=50)
                    retrieved = [doc_id for doc_id, _ in ranked]
                elif approach_type == "hybrid":
                    query_emb = None
                    for doc in corpus_with_embeddings:
                        if doc["id"] == query_id:
                            query_emb = doc["embedding"]
                            break
                    ranked = retriever.rank(query_text, query_emb, top_k=50)
                    retrieved = [doc_id for doc_id, _ in ranked]
                elif approach_type == "full_hybrid":
                    query_emb = None
                    query_phase = task["query"].get("phase")
                    for doc in corpus_with_embeddings:
                        if doc["id"] == query_id:
                            query_emb = doc["embedding"]
                            break
                    ranked = retriever.rank(query_text, query_emb, query_phase, top_k=50)
                    retrieved = [doc_id for doc_id, _, _ in ranked]
                elif approach_type == "abstraction":
                    # Get query embedding and abstraction
                    query_emb = None
                    query_abstraction = None
                    query_phase = task["query"].get("phase")
                    for doc in corpus_with_abstractions:
                        if doc["id"] == query_id:
                            query_emb = doc["embedding"]
                            query_abstraction = doc.get("abstraction", {})
                            break
                    # If query not in corpus, generate abstraction from text
                    if query_abstraction is None:
                        abs_result = abstract_rule_based(query_text)
                        query_abstraction = abstraction_to_json(abs_result)
                    query_key_terms = query_abstraction.get("key_terms", [])
                    query_issue_type = query_abstraction.get("issue_type", "general")
                    ranked = retriever.rank(
                        query_text, query_emb, query_key_terms, query_issue_type, query_phase, top_k=50
                    )
                    retrieved = [doc_id for doc_id, _, _ in ranked]

                # Filter to candidates that were in this task
                retrieved_in_task = [d for d in retrieved if d in task_candidate_ids]

                # If no overlap, use original retrieved list
                if not retrieved_in_task:
                    retrieved_in_task = retrieved

                # Compute metrics
                for k in [3, 5, 10]:
                    metrics[f"P@{k}"].append(precision_at_k(retrieved_in_task, all_relevant, k))
                    metrics[f"R@{k}"].append(recall_at_k(retrieved_in_task, all_relevant, k))
                    metrics[f"Hit@{k}"].append(hit_rate_at_k(retrieved_in_task, all_relevant, k))

                metrics["MRR"].append(mean_reciprocal_rank(retrieved_in_task, all_relevant))
                metrics["NDCG@5"].append(ndcg_at_k(retrieved_in_task, relevance_scores, 5))
                metrics["NDCG@10"].append(ndcg_at_k(retrieved_in_task, relevance_scores, 10))

            # Average metrics
            avg_metrics = {k: np.mean(v) if v else 0.0 for k, v in metrics.items()}
            results[approach_name] = avg_metrics

        # Print results table
        print("\n{:<20} {:>8} {:>8} {:>8} {:>8} {:>8} {:>8}".format(
            "Approach", "P@5", "R@5", "Hit@5", "MRR", "NDCG@5", "NDCG@10"
        ))
        print("-" * 70)

        for approach_name, metrics in results.items():
            print("{:<20} {:>8.3f} {:>8.3f} {:>8.3f} {:>8.3f} {:>8.3f} {:>8.3f}".format(
                approach_name,
                metrics.get("P@5", 0),
                metrics.get("R@5", 0),
                metrics.get("Hit@5", 0),
                metrics.get("MRR", 0),
                metrics.get("NDCG@5", 0),
                metrics.get("NDCG@10", 0),
            ))

        # Determine winner
        print("\n" + "=" * 70)
        print("ANALYSIS")
        print("=" * 70)

        best_by_metric = {}
        for metric in ["P@5", "MRR", "NDCG@10"]:
            best_approach = max(results.keys(), key=lambda a: results[a].get(metric, 0))
            best_score = results[best_approach].get(metric, 0)
            best_by_metric[metric] = (best_approach, best_score)
            print(f"Best by {metric}: {best_approach} ({best_score:.3f})")

        # Save results
        results_file = Path(__file__).parent / "data" / "evaluation_results.json"
        with open(results_file, "w", encoding="utf-8") as f:
            json.dump({
                "num_tasks": len(labeled_tasks),
                "total_labeled": total_labeled,
                "results": results,
                "best_by_metric": {k: {"approach": v[0], "score": v[1]} for k, v in best_by_metric.items()},
            }, f, indent=2)

        print(f"\nResults saved to: {results_file}")

        print("\n" + "=" * 70)
        print("RECOMMENDATIONS")
        print("=" * 70)
        print("""
Based on these results, consider:

1. If BM25 beats embeddings: Your domain has specialized vocabulary that
   benefits from exact matching. Increase keyword weight.

2. If embeddings beat BM25: Semantic similarity captures paraphrasing well.
   But watch for false positives (similar words, different meaning).

3. If Hybrid wins: The combination is working. Tune the weights based on
   which individual approach performs better.

4. If Full Hybrid wins: The additional signals (phase, entities) add value.
   Consider increasing their weights.

Next steps:
- Label more data for more reliable metrics
- Try different weight configurations
- Consider adding cross-encoder re-ranking for top candidates
        """)

    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(run_evaluation())
