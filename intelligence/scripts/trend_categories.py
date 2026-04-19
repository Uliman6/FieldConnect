#!/usr/bin/env python3
"""
Categorized Trend Analysis

Groups recurring issues into categories and shows 4-5 examples of each.
"""

import asyncio
import os
import sys
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg
from evaluation.approaches import BM25
from extraction.abstraction import extract_clean_question


# Issue categories based on common RFI patterns
ISSUE_CATEGORIES = {
    "dimension_conflict": {
        "keywords": ["conflict", "clash", "clearance", "tolerance", "dimension", "offset", "align", "interference"],
        "description": "Dimensional conflicts and clearance issues"
    },
    "missing_detail": {
        "keywords": ["not shown", "not provided", "missing", "unclear", "not specified", "no detail", "not indicated", "not called out"],
        "description": "Missing or unclear design details"
    },
    "design_discrepancy": {
        "keywords": ["discrepancy", "inconsistent", "different", "does not match", "conflict between", "contradicts"],
        "description": "Discrepancies between drawings/specs"
    },
    "field_condition": {
        "keywords": ["existing", "field", "as-built", "site condition", "discovered", "found", "actual"],
        "description": "Field conditions differing from design"
    },
    "coordination": {
        "keywords": ["coordinate", "coordination", "MEP", "trade", "penetration", "routing", "clash"],
        "description": "Multi-trade coordination issues"
    },
    "material_spec": {
        "keywords": ["material", "product", "specification", "substitut", "equivalent", "manufacturer"],
        "description": "Material and specification questions"
    }
}


def categorize_rfi(text: str) -> list[str]:
    """Categorize an RFI based on keywords."""
    text_lower = text.lower()
    categories = []

    for cat_id, cat_info in ISSUE_CATEGORIES.items():
        for keyword in cat_info["keywords"]:
            if keyword in text_lower:
                categories.append(cat_id)
                break

    return categories if categories else ["other"]


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
          AND LENGTH(COALESCE(question_text, raw_text)) > 80
        LIMIT 2000
    """)

    corpus = []
    for row in rows:
        doc = dict(row)
        raw = doc.get("question_text") or doc.get("raw_text") or ""
        doc["text"] = raw
        doc["clean_text"] = extract_clean_question(raw)
        # Use raw if clean is too short
        if len(doc["clean_text"]) < 50:
            doc["clean_text"] = raw[:500]
        corpus.append(doc)

    return corpus


def find_cross_project_similar(
    anchor: dict,
    corpus: list[dict],
    bm25: BM25,
    corpus_by_id: dict,
    min_score: float = 0.45
) -> list[dict]:
    """Find similar RFIs from other projects."""
    anchor_project = anchor.get("source_project_name") or anchor.get("source_project_id") or ""
    query = anchor.get("clean_text", "")

    if len(query) < 30:
        return []

    results = bm25.rank(query, top_k=30)
    if not results:
        return []

    max_score = max(s for _, s in results) or 1

    matches = []
    for match_id, score in results:
        norm_score = score / max_score
        if norm_score < min_score or match_id == anchor["id"]:
            continue

        match_doc = corpus_by_id.get(match_id)
        if not match_doc:
            continue

        match_project = match_doc.get("source_project_name") or match_doc.get("source_project_id") or ""
        if match_project == anchor_project:
            continue

        matches.append({
            "id": match_id,
            "ref": match_doc.get("source_ref", ""),
            "text": match_doc.get("clean_text", "")[:300],
            "project": match_project[:25],
            "trade": match_doc.get("trade_category", ""),
            "score": norm_score
        })

    return matches[:5]


async def main():
    print("=" * 90)
    print("CATEGORIZED CROSS-PROJECT TREND ANALYSIS")
    print("=" * 90)

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL required")
        sys.exit(1)

    conn = await asyncpg.connect(database_url)

    try:
        print("\nLoading RFI corpus...")
        corpus = await load_corpus(conn)
        print(f"  Loaded {len(corpus)} RFIs")

        projects = set(d.get("source_project_name") or d.get("source_project_id") for d in corpus)
        print(f"  From {len(projects)} projects")

        # Build BM25 index
        print("\nBuilding BM25 index...")
        bm25 = BM25()
        bm25.fit(corpus, text_field="clean_text")
        corpus_by_id = {d["id"]: d for d in corpus}

        # Categorize all RFIs
        print("\nCategorizing RFIs...")
        categorized = defaultdict(list)
        for doc in corpus:
            cats = categorize_rfi(doc["clean_text"])
            for cat in cats:
                categorized[cat].append(doc)

        print(f"\nCategory distribution:")
        for cat, docs in sorted(categorized.items(), key=lambda x: -len(x[1])):
            print(f"  {cat}: {len(docs)} RFIs")

        # For each category, find cross-project recurring issues
        print("\n" + "=" * 90)
        print("TOP 3 RECURRING ISSUE CATEGORIES WITH CROSS-PROJECT EXAMPLES")
        print("=" * 90)

        # Focus on top 3 meaningful categories (not "other")
        top_categories = [
            cat for cat, docs in sorted(categorized.items(), key=lambda x: -len(x[1]))
            if cat != "other" and len(docs) >= 10
        ][:3]

        for cat_id in top_categories:
            cat_info = ISSUE_CATEGORIES.get(cat_id, {"description": cat_id})
            cat_docs = categorized[cat_id]

            print(f"\n{'=' * 90}")
            print(f"CATEGORY: {cat_info['description'].upper()}")
            print(f"Total RFIs in category: {len(cat_docs)}")
            print(f"{'=' * 90}")

            # Find RFIs that have cross-project matches
            cross_project_issues = []
            seen_anchors = set()

            for doc in cat_docs:
                if doc["id"] in seen_anchors:
                    continue

                matches = find_cross_project_similar(doc, corpus, bm25, corpus_by_id, min_score=0.4)
                if matches:
                    # Check that matches are also in this category
                    relevant_matches = []
                    for m in matches:
                        match_doc = corpus_by_id.get(m["id"])
                        if match_doc:
                            match_cats = categorize_rfi(match_doc.get("clean_text", ""))
                            if cat_id in match_cats:
                                relevant_matches.append(m)
                                seen_anchors.add(m["id"])

                    if relevant_matches:
                        cross_project_issues.append({
                            "anchor": doc,
                            "matches": relevant_matches,
                            "projects": {doc.get("source_project_name") or doc.get("source_project_id")} |
                                       {m["project"] for m in relevant_matches}
                        })
                        seen_anchors.add(doc["id"])

                if len(cross_project_issues) >= 5:
                    break

            if not cross_project_issues:
                # Fallback: just show examples from different projects
                print("\n  (No strong cross-project matches; showing examples from different projects)")
                by_project = defaultdict(list)
                for doc in cat_docs:
                    proj = doc.get("source_project_name") or doc.get("source_project_id") or "Unknown"
                    by_project[proj].append(doc)

                example_num = 1
                for proj, docs in list(by_project.items())[:5]:
                    doc = docs[0]
                    print(f"\n  EXAMPLE {example_num} [{doc.get('source_ref', '')}] from {proj[:25]}:")
                    print(f"    {doc['clean_text'][:350]}")
                    example_num += 1
            else:
                # Show cross-project recurring issues
                for i, issue in enumerate(cross_project_issues[:5], 1):
                    anchor = issue["anchor"]
                    matches = issue["matches"]
                    projects = issue["projects"]

                    print(f"\n  RECURRING ISSUE {i} (found in {len(projects)} projects)")
                    print(f"  Projects: {', '.join(str(p)[:20] for p in projects)}")

                    print(f"\n    A. [{anchor.get('source_ref', '')}] {anchor.get('source_project_name', '')[:20]}:")
                    print(f"       {anchor['clean_text'][:300]}")

                    for j, match in enumerate(matches[:2], 1):
                        letter = chr(ord('A') + j)
                        print(f"\n    {letter}. [{match['ref']}] {match['project']} (similarity: {match['score']:.0%}):")
                        print(f"       {match['text'][:300]}")

        # Summary
        print("\n" + "=" * 90)
        print("SUMMARY: What patterns repeat across projects?")
        print("=" * 90)

        for cat_id in top_categories:
            cat_info = ISSUE_CATEGORIES.get(cat_id, {"description": cat_id})
            cat_docs = categorized[cat_id]
            projects_with_cat = set(
                d.get("source_project_name") or d.get("source_project_id")
                for d in cat_docs
            )
            print(f"\n  {cat_info['description']}:")
            print(f"    - {len(cat_docs)} total RFIs")
            print(f"    - Appears in {len(projects_with_cat)} projects")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
