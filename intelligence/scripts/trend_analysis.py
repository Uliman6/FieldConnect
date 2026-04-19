#!/usr/bin/env python3
"""
Cross-Project Trend Analysis

Identifies recurring issues across projects by:
1. Finding similar RFIs using BM25
2. Clustering into "issue archetypes"
3. Showing frequency and actual descriptions

This helps validate similarity logic and identify patterns.
"""

import asyncio
import os
import sys
from pathlib import Path
from collections import defaultdict
from dataclasses import dataclass, field

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

import asyncpg
from evaluation.approaches import BM25
from extraction.abstraction import extract_clean_question


@dataclass
class IssueCluster:
    """A cluster of similar issues across projects."""
    anchor_id: str
    anchor_ref: str
    anchor_text: str
    anchor_project: str
    anchor_trade: str
    similar_items: list = field(default_factory=list)
    projects_affected: set = field(default_factory=set)

    def add_similar(self, item_id: str, ref: str, text: str, project: str, score: float):
        self.similar_items.append({
            "id": item_id,
            "ref": ref,
            "text": text,
            "project": project,
            "score": score
        })
        self.projects_affected.add(project)

    @property
    def cross_project_count(self) -> int:
        """Number of different projects this issue appears in."""
        return len(self.projects_affected)

    @property
    def total_occurrences(self) -> int:
        """Total number of similar RFIs including anchor."""
        return 1 + len(self.similar_items)


async def load_corpus(conn) -> list[dict]:
    """Load RFI corpus from database."""
    rows = await conn.fetch("""
        SELECT
            id::text,
            source_ref,
            source_project_id,
            source_project_name,
            question_text,
            raw_text,
            trade_category
        FROM intelligence.items
        WHERE source_type = 'rfi'
          AND (question_text IS NOT NULL OR raw_text IS NOT NULL)
          AND LENGTH(COALESCE(question_text, raw_text)) > 50
        ORDER BY created_at DESC
        LIMIT 3000
    """)

    corpus = []
    for row in rows:
        doc = dict(row)
        doc["text"] = doc.get("question_text") or doc.get("raw_text") or ""
        doc["clean_text"] = extract_clean_question(doc["text"])
        corpus.append(doc)

    return corpus


def find_similar_across_projects(
    corpus: list[dict],
    bm25: BM25,
    corpus_by_id: dict,
    min_score: float = 0.5,
    top_k: int = 10
) -> list[IssueCluster]:
    """
    For each RFI, find similar RFIs from OTHER projects.
    Returns clusters of similar issues.
    """
    clusters = []
    processed_ids = set()  # Avoid creating duplicate clusters

    for doc in corpus:
        doc_id = doc["id"]

        # Skip if already part of a cluster
        if doc_id in processed_ids:
            continue

        doc_project = doc.get("source_project_id") or ""
        query_text = doc.get("clean_text") or doc.get("text", "")

        if len(query_text) < 30:
            continue

        # Find similar RFIs
        results = bm25.rank(query_text, top_k=50)

        # Normalize scores
        if not results:
            continue
        max_score = max(score for _, score in results)
        if max_score == 0:
            continue

        # Find matches from OTHER projects
        cross_project_matches = []
        for match_id, score in results:
            normalized_score = score / max_score

            if normalized_score < min_score:
                continue

            match_doc = corpus_by_id.get(match_id)
            if not match_doc:
                continue

            match_project = match_doc.get("source_project_id") or ""

            # Must be from a DIFFERENT project
            if match_project == doc_project:
                continue

            # Skip self
            if match_id == doc_id:
                continue

            cross_project_matches.append((match_doc, normalized_score))

        # Only create cluster if we have cross-project matches
        if cross_project_matches:
            cluster = IssueCluster(
                anchor_id=doc_id,
                anchor_ref=doc.get("source_ref", ""),
                anchor_text=doc.get("clean_text", ""),
                anchor_project=doc.get("source_project_name") or doc_project,
                anchor_trade=doc.get("trade_category", "")
            )
            cluster.projects_affected.add(doc.get("source_project_name") or doc_project)

            for match_doc, score in cross_project_matches[:top_k]:
                cluster.add_similar(
                    item_id=match_doc["id"],
                    ref=match_doc.get("source_ref", ""),
                    text=match_doc.get("clean_text", ""),
                    project=match_doc.get("source_project_name") or match_doc.get("source_project_id", ""),
                    score=score
                )
                processed_ids.add(match_doc["id"])

            clusters.append(cluster)
            processed_ids.add(doc_id)

    return clusters


def merge_overlapping_clusters(clusters: list[IssueCluster], overlap_threshold: float = 0.5) -> list[IssueCluster]:
    """
    Merge clusters that share many of the same RFIs.
    """
    # For now, just return as-is. Can implement merging later if needed.
    return clusters


def print_top_clusters(clusters: list[IssueCluster], top_n: int = 10):
    """Print the top recurring issue clusters."""

    # Sort by cross-project count, then by total occurrences
    sorted_clusters = sorted(
        clusters,
        key=lambda c: (c.cross_project_count, c.total_occurrences),
        reverse=True
    )

    print("\n" + "=" * 100)
    print("TOP RECURRING ISSUES ACROSS PROJECTS")
    print("=" * 100)

    for i, cluster in enumerate(sorted_clusters[:top_n], 1):
        print(f"\n{'-' * 100}")
        print(f"ISSUE #{i}: {cluster.anchor_trade or 'Unknown Trade'}")
        print(f"{'─' * 100}")
        print(f"Projects Affected: {cluster.cross_project_count}")
        print(f"Total Occurrences: {cluster.total_occurrences}")
        print(f"Projects: {', '.join(sorted(cluster.projects_affected))}")

        print(f"\n  ANCHOR RFI [{cluster.anchor_ref}] from {cluster.anchor_project}:")
        print(f"    {cluster.anchor_text[:300]}{'...' if len(cluster.anchor_text) > 300 else ''}")

        print(f"\n  SIMILAR RFIs:")
        for j, similar in enumerate(cluster.similar_items[:5], 1):
            print(f"\n    {j}. [{similar['ref']}] from {similar['project']} (score: {similar['score']:.2f})")
            print(f"       {similar['text'][:250]}{'...' if len(similar['text']) > 250 else ''}")

    # Summary stats
    print("\n" + "=" * 100)
    print("SUMMARY")
    print("=" * 100)

    total_clusters = len(clusters)
    multi_project = len([c for c in clusters if c.cross_project_count >= 2])
    three_plus = len([c for c in clusters if c.cross_project_count >= 3])

    print(f"\nTotal issue clusters found: {total_clusters}")
    print(f"Issues appearing in 2+ projects: {multi_project}")
    print(f"Issues appearing in 3+ projects: {three_plus}")

    # Trade breakdown
    trade_counts = defaultdict(int)
    for cluster in sorted_clusters[:50]:
        trade = cluster.anchor_trade or "Unknown"
        trade_counts[trade] += 1

    print(f"\nTop trades with recurring issues:")
    for trade, count in sorted(trade_counts.items(), key=lambda x: -x[1])[:10]:
        print(f"  {trade}: {count} issue patterns")


async def main():
    print("=" * 100)
    print("CROSS-PROJECT TREND ANALYSIS")
    print("=" * 100)

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL required")
        sys.exit(1)

    print("\nConnecting to database...")
    conn = await asyncpg.connect(database_url)

    try:
        # Load corpus
        print("Loading RFI corpus...")
        corpus = await load_corpus(conn)
        print(f"  Loaded {len(corpus)} RFIs")

        # Get unique projects
        projects = set(doc.get("source_project_name") or doc.get("source_project_id") for doc in corpus)
        print(f"  From {len(projects)} projects")

        # Build BM25 index
        print("\nBuilding BM25 index...")
        bm25 = BM25()
        bm25.fit(corpus, text_field="clean_text")

        # Create lookup dict
        corpus_by_id = {doc["id"]: doc for doc in corpus}

        # Find similar issues across projects
        print("\nFinding similar issues across projects...")
        clusters = find_similar_across_projects(
            corpus=corpus,
            bm25=bm25,
            corpus_by_id=corpus_by_id,
            min_score=0.4,  # Lower threshold to find more patterns
            top_k=10
        )

        print(f"  Found {len(clusters)} issue clusters")

        # Print results
        print_top_clusters(clusters, top_n=10)

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
