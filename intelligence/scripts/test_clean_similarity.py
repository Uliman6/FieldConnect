#!/usr/bin/env python3
"""
Test similarity matching with CLEAN question text and revision filtering.

Uses:
- extract_clean_question() for display-ready text
- filter_revision_matches() to remove same-RFI revisions
- LLM abstractions for key term matching
"""

import asyncio
import csv
import json
import sys
import os
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

import asyncpg
from openai import OpenAI
import numpy as np

from extraction.abstraction import (
    abstract_with_llm,
    abstract_rule_based,
    abstraction_to_json,
    extract_clean_question,
    filter_revision_matches,
)


async def get_test_queries(conn, limit: int = 50) -> list[dict]:
    """Get sample RFIs to use as queries."""
    rows = await conn.fetch("""
        SELECT
            id::text,
            source_ref,
            source_project_name,
            question_text,
            raw_text,
            trade_category,
            project_phase,
            embedding,
            abstracted_summary
        FROM intelligence.items
        WHERE source_type = 'rfi'
          AND (question_text IS NOT NULL OR raw_text IS NOT NULL)
          AND LENGTH(COALESCE(question_text, raw_text)) > 50
          AND embedding IS NOT NULL
        ORDER BY RANDOM()
        LIMIT $1
    """, limit)
    return [dict(r) for r in rows]


async def find_similar_items(conn, query_embedding: list[float], query_id: str, query_ref: str, limit: int = 5) -> list[dict]:
    """Find similar items using embedding similarity, filtering revisions."""
    # Get more candidates than needed since we'll filter some out
    rows = await conn.fetch("""
        SELECT
            id::text,
            source_ref,
            source_project_name,
            question_text,
            raw_text,
            trade_category,
            project_phase,
            embedding,
            abstracted_summary,
            resolution_text
        FROM intelligence.items
        WHERE source_type = 'rfi'
          AND id::text != $1
          AND embedding IS NOT NULL
        LIMIT 500
    """, query_id)

    candidates = [dict(r) for r in rows]

    # Filter out revisions of the same RFI
    candidates = filter_revision_matches(query_ref, candidates, ref_field="source_ref")

    # Compute similarities
    query_vec = np.array(query_embedding)
    scored = []

    for item in candidates:
        if item["embedding"]:
            cand_vec = np.array(item["embedding"])
            dot = np.dot(query_vec, cand_vec)
            norm1 = np.linalg.norm(query_vec)
            norm2 = np.linalg.norm(cand_vec)
            if norm1 > 0 and norm2 > 0:
                sim = float(dot / (norm1 * norm2))
                item["semantic_score"] = sim
                scored.append(item)

    scored.sort(key=lambda x: x["semantic_score"], reverse=True)
    return scored[:limit]


def compute_key_terms_overlap(query_terms: list[str], candidate_summary: dict) -> tuple[float, list[str]]:
    """Compute key terms overlap score and return matched terms."""
    if not query_terms:
        return 0.0, []

    cand_terms = candidate_summary.get("key_terms", []) if candidate_summary else []
    if not cand_terms:
        return 0.0, []

    query_set = {t.lower().strip() for t in query_terms}
    cand_set = {t.lower().strip() for t in cand_terms}

    exact_matches = list(query_set & cand_set)
    partial_matches = []
    for qt in query_set - set(exact_matches):
        for ct in cand_set - set(exact_matches):
            if qt in ct or ct in qt:
                partial_matches.append(f"{qt}~{ct}")
                break

    total = len(exact_matches) + len(partial_matches) * 0.7

    if total == 0:
        score = 0.0
    elif total < 1:
        score = 0.35
    elif total < 2:
        score = 0.5
    elif total < 3:
        score = 0.75
    else:
        score = min(1.0, 0.85 + (total - 3) * 0.05)

    return score, exact_matches + partial_matches[:2]


async def main():
    print("=" * 70)
    print("CLEAN SIMILARITY TEST (with revision filtering)")
    print("=" * 70)

    database_url = os.getenv("DATABASE_URL")
    openai_key = os.getenv("OPENAI_API_KEY")

    if not database_url or not openai_key:
        print("ERROR: DATABASE_URL and OPENAI_API_KEY required")
        sys.exit(1)

    client = OpenAI(api_key=openai_key)
    conn = await asyncpg.connect(database_url)

    try:
        print("\nFetching 50 test queries...")
        queries = await get_test_queries(conn, limit=50)
        print(f"  Got {len(queries)} queries")

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = Path(__file__).parent.parent / "evaluation" / f"clean_similarity_{timestamp}.csv"

        results = []
        revisions_filtered = 0

        print("\nProcessing queries...")
        for i, query in enumerate(queries):
            query_id = query["id"]
            query_ref = query["source_ref"]
            query_raw = query.get("question_text") or query.get("raw_text") or ""
            query_clean = extract_clean_question(query_raw)
            query_project = query["source_project_name"] or "Unknown"

            print(f"  [{i+1}/50] {query_ref}...", end=" ", flush=True)

            # Get or generate abstraction
            existing_abs = query.get("abstracted_summary")
            if existing_abs and isinstance(existing_abs, str):
                try:
                    query_abstraction = json.loads(existing_abs)
                except:
                    query_abstraction = {}
            elif existing_abs and isinstance(existing_abs, dict):
                query_abstraction = existing_abs
            else:
                query_abstraction = {}

            if not query_abstraction.get("key_terms"):
                try:
                    abs_result = await abstract_with_llm(query_raw, client)
                    if abs_result:
                        query_abstraction = abstraction_to_json(abs_result)
                    else:
                        abs_result = abstract_rule_based(query_raw)
                        query_abstraction = abstraction_to_json(abs_result)
                except:
                    abs_result = abstract_rule_based(query_raw)
                    query_abstraction = abstraction_to_json(abs_result)

            query_key_terms = query_abstraction.get("key_terms", [])
            query_issue_type = query_abstraction.get("issue_type", "general")
            query_scope = query_abstraction.get("scope_summary", "")

            # Find similar items (with revision filtering)
            similar = await find_similar_items(conn, query["embedding"], query_id, query_ref, limit=5)
            print(f"found {len(similar)} matches")

            for rank, match in enumerate(similar, 1):
                match_raw = match.get("question_text") or match.get("raw_text") or ""
                match_clean = extract_clean_question(match_raw)

                match_abs = match.get("abstracted_summary")
                if match_abs and isinstance(match_abs, str):
                    try:
                        match_abstraction = json.loads(match_abs)
                    except:
                        match_abstraction = {}
                elif match_abs and isinstance(match_abs, dict):
                    match_abstraction = match_abs
                else:
                    match_abstraction = {}

                match_key_terms = match_abstraction.get("key_terms", [])
                match_issue_type = match_abstraction.get("issue_type", "general")
                match_scope = match_abstraction.get("scope_summary", "")

                semantic_score = match.get("semantic_score", 0)
                key_terms_score, matched_terms = compute_key_terms_overlap(query_key_terms, match_abstraction)

                # Issue type score
                if query_issue_type.lower() == match_issue_type.lower():
                    issue_score = 1.0
                elif query_issue_type.lower() in ["dimension", "dimension_clarification"] and \
                     match_issue_type.lower() in ["dimension", "dimension_clarification"]:
                    issue_score = 0.9
                else:
                    issue_score = 0.5

                combined = 0.30 * semantic_score + 0.25 * key_terms_score + 0.15 * issue_score + 0.12 * 0.5

                results.append({
                    "query_ref": query_ref,
                    "query_question": query_clean[:300],
                    "query_scope": query_scope[:200] if query_scope else "",
                    "query_terms": "; ".join(query_key_terms[:5]),
                    "query_type": query_issue_type,
                    "rank": rank,
                    "match_ref": match["source_ref"],
                    "match_question": match_clean[:300],
                    "match_scope": match_scope[:200] if match_scope else "",
                    "match_terms": "; ".join(match_key_terms[:5]),
                    "match_type": match_issue_type,
                    "semantic": round(semantic_score, 3),
                    "terms_score": round(key_terms_score, 3),
                    "matched": "; ".join(matched_terms),
                    "combined": round(combined, 3),
                })

        # Write CSV
        print(f"\nWriting to {output_file}...")
        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=results[0].keys())
            writer.writeheader()
            writer.writerows(results)

        print(f"  Wrote {len(results)} rows")

        # Summary
        print("\n" + "=" * 70)
        print("SUMMARY")
        print("=" * 70)

        semantic_scores = [r["semantic"] for r in results]
        term_scores = [r["terms_score"] for r in results]
        combined_scores = [r["combined"] for r in results]

        print(f"Semantic: avg={sum(semantic_scores)/len(semantic_scores):.3f}")
        print(f"Key Terms: avg={sum(term_scores)/len(term_scores):.3f}")
        print(f"Combined: avg={sum(combined_scores)/len(combined_scores):.3f}")

        with_terms = sum(1 for r in results if r["terms_score"] > 0)
        print(f"Matches with term overlap: {with_terms}/{len(results)} ({100*with_terms/len(results):.1f}%)")

        # Check for any revision matches that slipped through (should be 0)
        from extraction.abstraction import is_revision_of
        revision_matches = sum(1 for r in results if is_revision_of(r["query_ref"], r["match_ref"]))
        print(f"Revision matches (should be 0): {revision_matches}")

        print(f"\nCSV: {output_file}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
