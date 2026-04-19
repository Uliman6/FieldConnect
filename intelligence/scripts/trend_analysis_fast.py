#!/usr/bin/env python3
"""
Fast Cross-Project Trend Analysis (Sampled)

Quick version that samples RFIs to find recurring patterns faster.
"""

import asyncio
import os
import sys
import random
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg
from evaluation.approaches import BM25
from extraction.abstraction import extract_clean_question


async def load_corpus(conn, limit: int = 500) -> list[dict]:
    """Load sampled RFI corpus from database."""
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
        ORDER BY RANDOM()
        LIMIT $1
    """, limit)

    corpus = []
    for row in rows:
        doc = dict(row)
        doc["text"] = doc.get("question_text") or doc.get("raw_text") or ""
        doc["clean_text"] = extract_clean_question(doc["text"])
        corpus.append(doc)

    return corpus


def find_clusters(corpus: list[dict], bm25: BM25, corpus_by_id: dict, min_score: float = 0.5):
    """Find similar issues across projects."""
    clusters = []
    processed = set()

    for doc in corpus:
        doc_id = doc["id"]
        if doc_id in processed:
            continue

        doc_project = doc.get("source_project_name") or doc.get("source_project_id") or ""
        query = doc.get("clean_text") or doc.get("text", "")

        if len(query) < 30:
            continue

        results = bm25.rank(query, top_k=30)
        if not results:
            continue

        max_score = max(s for _, s in results) or 1

        # Find cross-project matches
        matches = []
        for match_id, score in results:
            norm_score = score / max_score
            if norm_score < min_score or match_id == doc_id:
                continue

            match_doc = corpus_by_id.get(match_id)
            if not match_doc:
                continue

            match_project = match_doc.get("source_project_name") or match_doc.get("source_project_id") or ""
            if match_project == doc_project:
                continue

            matches.append({
                "id": match_id,
                "ref": match_doc.get("source_ref", ""),
                "text": match_doc.get("clean_text", "")[:200],
                "project": match_project,
                "trade": match_doc.get("trade_category", ""),
                "score": norm_score
            })
            processed.add(match_id)

        if matches:
            clusters.append({
                "anchor": {
                    "id": doc_id,
                    "ref": doc.get("source_ref", ""),
                    "text": doc.get("clean_text", "")[:200],
                    "project": doc_project,
                    "trade": doc.get("trade_category", "")
                },
                "matches": matches[:5],
                "projects": {doc_project} | {m["project"] for m in matches},
                "count": 1 + len(matches)
            })
            processed.add(doc_id)

    return clusters


async def main():
    print("=" * 80)
    print("CROSS-PROJECT TREND ANALYSIS (Fast/Sampled)")
    print("=" * 80)

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL required")
        sys.exit(1)

    print("\nConnecting to database...")
    conn = await asyncpg.connect(database_url)

    try:
        print("Loading sampled RFI corpus (500 RFIs)...")
        corpus = await load_corpus(conn, limit=500)
        print(f"  Loaded {len(corpus)} RFIs")

        projects = set(d.get("source_project_name") or d.get("source_project_id") for d in corpus)
        print(f"  From {len(projects)} projects: {', '.join(str(p)[:20] for p in list(projects)[:5])}")

        print("\nBuilding BM25 index...")
        bm25 = BM25()
        bm25.fit(corpus, text_field="clean_text")

        corpus_by_id = {d["id"]: d for d in corpus}

        print("Finding similar issues across projects...")
        clusters = find_clusters(corpus, bm25, corpus_by_id, min_score=0.4)

        # Sort by number of projects affected
        clusters.sort(key=lambda c: (len(c["projects"]), c["count"]), reverse=True)

        print(f"\n  Found {len(clusters)} issue clusters")

        print("\n" + "=" * 80)
        print("TOP 10 RECURRING ISSUES ACROSS PROJECTS")
        print("=" * 80)

        for i, cluster in enumerate(clusters[:10], 1):
            anchor = cluster["anchor"]
            print(f"\n--- ISSUE #{i} ---")
            print(f"Trade: {anchor['trade'] or 'Unknown'}")
            print(f"Projects: {len(cluster['projects'])} ({', '.join(str(p)[:15] for p in cluster['projects'])})")
            print(f"Occurrences: {cluster['count']}")

            print(f"\nANCHOR [{anchor['ref']}] from {anchor['project'][:20]}:")
            print(f"  {anchor['text']}")

            print(f"\nSIMILAR RFIs:")
            for j, match in enumerate(cluster["matches"][:3], 1):
                print(f"  {j}. [{match['ref']}] from {match['project'][:20]} (score: {match['score']:.2f})")
                print(f"     {match['text']}")

        # Summary
        print("\n" + "=" * 80)
        print("SUMMARY")
        print("=" * 80)

        multi = len([c for c in clusters if len(c["projects"]) >= 2])
        three_plus = len([c for c in clusters if len(c["projects"]) >= 3])

        print(f"\nTotal clusters: {len(clusters)}")
        print(f"Issues in 2+ projects: {multi}")
        print(f"Issues in 3+ projects: {three_plus}")

        # Trade breakdown
        trade_counts = defaultdict(int)
        for c in clusters[:30]:
            trade = c["anchor"]["trade"] or "Unknown"
            trade_counts[trade] += 1

        print(f"\nTop trades with recurring issues:")
        for trade, count in sorted(trade_counts.items(), key=lambda x: -x[1])[:8]:
            print(f"  {trade}: {count}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
