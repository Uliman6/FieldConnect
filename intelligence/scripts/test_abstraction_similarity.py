#!/usr/bin/env python3
"""
Test abstraction-based similarity matching on 50 RFIs.

For each query RFI:
1. Generate LLM abstraction (key terms, issue type)
2. Run tiered search to find similar items
3. Output results to CSV for analysis
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

from extraction.abstraction import abstract_with_llm, abstract_rule_based, abstraction_to_json
from similarity.embeddings import generate_embedding
from similarity.ranking import explain_ranking


async def get_test_queries(conn, limit: int = 50) -> list[dict]:
    """Get sample RFIs to use as queries."""
    rows = await conn.fetch("""
        SELECT
            id::text,
            source_ref,
            source_project_name,
            COALESCE(question_text, raw_text) as text,
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


async def find_similar_items(
    conn,
    query_embedding: list[float],
    query_id: str,
    company_id: str = None,
    limit: int = 5
) -> list[dict]:
    """Find similar items using embedding similarity."""
    import numpy as np

    # Get candidates (exclude query itself)
    rows = await conn.fetch("""
        SELECT
            id::text,
            source_ref,
            source_project_name,
            COALESCE(question_text, raw_text) as text,
            trade_category,
            project_phase,
            embedding,
            abstracted_summary,
            resolution_text,
            cost_impact,
            schedule_impact_days
        FROM intelligence.items
        WHERE source_type = 'rfi'
          AND id::text != $1
          AND embedding IS NOT NULL
        LIMIT 500
    """, query_id)

    # Compute similarities
    query_vec = np.array(query_embedding)
    scored = []

    for row in rows:
        if row["embedding"]:
            cand_vec = np.array(row["embedding"])
            # Cosine similarity
            dot = np.dot(query_vec, cand_vec)
            norm1 = np.linalg.norm(query_vec)
            norm2 = np.linalg.norm(cand_vec)
            if norm1 > 0 and norm2 > 0:
                sim = float(dot / (norm1 * norm2))
                scored.append((dict(row), sim))

    # Sort by similarity
    scored.sort(key=lambda x: x[1], reverse=True)

    # Return top matches with scores
    results = []
    for item, sim in scored[:limit]:
        item["semantic_score"] = sim
        results.append(item)

    return results


def compute_key_terms_overlap(query_terms: list[str], candidate_summary: dict) -> tuple[float, list[str]]:
    """Compute key terms overlap score and return matched terms."""
    if not query_terms:
        return 0.0, []

    cand_terms = candidate_summary.get("key_terms", []) if candidate_summary else []
    if not cand_terms:
        return 0.0, []

    query_set = {t.lower().strip() for t in query_terms}
    cand_set = {t.lower().strip() for t in cand_terms}

    # Exact matches
    exact_matches = list(query_set & cand_set)

    # Partial matches
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


def compute_issue_type_score(query_type: str, cand_type: str) -> float:
    """Compute issue type similarity score."""
    if not query_type or not cand_type:
        return 0.5

    if query_type.lower() == cand_type.lower():
        return 1.0

    related = {
        "dimension": ["dimension_clarification", "missing_information", "missing_info"],
        "detail_conflict": ["dimension", "missing_information", "coordination"],
        "coordination": ["detail_conflict", "installation_method"],
        "material": ["material_substitution", "installation_method"],
        "confirmation": ["dimension", "material", "installation_method"],
        "remediation": ["detail_conflict", "coordination"],
    }

    q_related = related.get(query_type.lower(), [])
    c_related = related.get(cand_type.lower(), [])

    if cand_type.lower() in q_related or query_type.lower() in c_related:
        return 0.7

    return 0.3


async def main():
    print("=" * 70)
    print("ABSTRACTION-BASED SIMILARITY TEST")
    print("=" * 70)

    database_url = os.getenv("DATABASE_URL")
    openai_key = os.getenv("OPENAI_API_KEY")

    if not database_url or not openai_key:
        print("ERROR: DATABASE_URL and OPENAI_API_KEY required")
        sys.exit(1)

    client = OpenAI(api_key=openai_key)

    print("\nConnecting to database...")
    conn = await asyncpg.connect(database_url)

    try:
        # Get test queries
        print("Fetching 50 test queries...")
        queries = await get_test_queries(conn, limit=50)
        print(f"  Got {len(queries)} queries")

        # Prepare CSV output
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = Path(__file__).parent.parent / "evaluation" / f"similarity_test_{timestamp}.csv"

        results = []

        print("\nProcessing queries...")
        for i, query in enumerate(queries):
            query_id = query["id"]
            query_ref = query["source_ref"]
            query_text = query["text"][:200] if query["text"] else ""
            query_project = query["source_project_name"] or "Unknown"

            print(f"  [{i+1}/50] {query_ref}...", end=" ", flush=True)

            # Get or generate query abstraction
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

            # If no abstraction, generate with LLM
            if not query_abstraction.get("key_terms"):
                try:
                    abs_result = await abstract_with_llm(query_text, client)
                    if abs_result:
                        query_abstraction = abstraction_to_json(abs_result)
                    else:
                        abs_result = abstract_rule_based(query_text)
                        query_abstraction = abstraction_to_json(abs_result)
                except Exception as e:
                    abs_result = abstract_rule_based(query_text)
                    query_abstraction = abstraction_to_json(abs_result)

            query_key_terms = query_abstraction.get("key_terms", [])
            query_issue_type = query_abstraction.get("issue_type", "general")

            # Find similar items
            similar = await find_similar_items(
                conn,
                query["embedding"],
                query_id,
                limit=5
            )

            print(f"found {len(similar)} matches")

            # Process each match
            for rank, match in enumerate(similar, 1):
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

                # Compute scores
                semantic_score = match.get("semantic_score", 0)
                key_terms_score, matched_terms = compute_key_terms_overlap(
                    query_key_terms, match_abstraction
                )
                issue_type_score = compute_issue_type_score(query_issue_type, match_issue_type)

                # Combined score (weighted)
                combined_score = (
                    0.30 * semantic_score +
                    0.25 * key_terms_score +
                    0.15 * issue_type_score +
                    0.12 * 0.5 +  # phase (neutral)
                    0.10 * 0.0 +  # keyword fallback
                    0.08 * 0.0    # entity
                )

                results.append({
                    "query_ref": query_ref,
                    "query_project": query_project,
                    "query_text": query_text[:150].replace("\n", " "),
                    "query_key_terms": "; ".join(query_key_terms[:5]),
                    "query_issue_type": query_issue_type,
                    "match_rank": rank,
                    "match_ref": match["source_ref"],
                    "match_project": match["source_project_name"] or "Unknown",
                    "match_text": (match["text"] or "")[:150].replace("\n", " "),
                    "match_key_terms": "; ".join(match_key_terms[:5]),
                    "match_issue_type": match_issue_type,
                    "semantic_score": round(semantic_score, 3),
                    "key_terms_score": round(key_terms_score, 3),
                    "matched_terms": "; ".join(matched_terms),
                    "issue_type_score": round(issue_type_score, 3),
                    "combined_score": round(combined_score, 3),
                    "has_resolution": "Yes" if match.get("resolution_text") else "No",
                    "cost_impact": match.get("cost_impact") or "",
                })

        # Write CSV
        print(f"\nWriting results to {output_file}...")

        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=results[0].keys())
            writer.writeheader()
            writer.writerows(results)

        print(f"  Wrote {len(results)} rows")

        # Print summary stats
        print("\n" + "=" * 70)
        print("SUMMARY STATISTICS")
        print("=" * 70)

        semantic_scores = [r["semantic_score"] for r in results]
        key_term_scores = [r["key_terms_score"] for r in results]
        combined_scores = [r["combined_score"] for r in results]

        print(f"\nSemantic Score:")
        print(f"  Min: {min(semantic_scores):.3f}, Max: {max(semantic_scores):.3f}, Avg: {sum(semantic_scores)/len(semantic_scores):.3f}")

        print(f"\nKey Terms Score:")
        print(f"  Min: {min(key_term_scores):.3f}, Max: {max(key_term_scores):.3f}, Avg: {sum(key_term_scores)/len(key_term_scores):.3f}")

        print(f"\nCombined Score:")
        print(f"  Min: {min(combined_scores):.3f}, Max: {max(combined_scores):.3f}, Avg: {sum(combined_scores)/len(combined_scores):.3f}")

        # Count matches with key term overlap
        with_term_match = sum(1 for r in results if r["key_terms_score"] > 0)
        print(f"\nMatches with key term overlap: {with_term_match}/{len(results)} ({100*with_term_match/len(results):.1f}%)")

        # Count same issue type
        same_issue = sum(1 for r in results if r["issue_type_score"] >= 1.0)
        related_issue = sum(1 for r in results if 0.5 < r["issue_type_score"] < 1.0)
        print(f"Same issue type: {same_issue}/{len(results)} ({100*same_issue/len(results):.1f}%)")
        print(f"Related issue type: {related_issue}/{len(results)} ({100*related_issue/len(results):.1f}%)")

        print(f"\nResults saved to: {output_file}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
