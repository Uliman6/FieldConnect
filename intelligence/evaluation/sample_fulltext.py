"""
Sample pairs with full text for manual review.

Labels until we have enough samples of each category, then fetches
full-length text from the database for review.

Usage:
    python -m evaluation.sample_fulltext
"""

import asyncio
import json
import random
from pathlib import Path
from datetime import datetime

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from db import get_pool, close_db
from config import get_openai_client


LABELING_PROMPT = """You are evaluating whether two construction issues are relevant to each other.

QUERY (new field observation):
Project: {query_project}
Reference: {query_ref}
Trade: {query_trade}
Text: {query_text}

CANDIDATE (historical RFI/issue):
Project: {candidate_project}
Reference: {candidate_ref}
Trade: {candidate_trade}
Text: {candidate_text}
Resolution: {candidate_resolution}

Evaluate relevance based on:
1. Would the resolution from the historical issue help address the new observation?
2. Are these fundamentally similar problems (not just surface-level word overlap)?
3. Would a project manager want to see this historical issue when encountering the new observation?

Respond with ONLY one of these labels:
- highly_relevant: Same or very similar issue. Resolution directly applies.
- somewhat_relevant: Related issue. Some lessons might apply.
- not_relevant: Different issue. No useful connection.

Also provide a brief (1 sentence) reasoning.

Format your response as:
LABEL: <label>
REASONING: <reasoning>
"""


async def label_with_llm(query: dict, candidate: dict) -> dict:
    """Use LLM to label a single query-candidate pair."""
    client = get_openai_client()

    prompt = LABELING_PROMPT.format(
        query_project=query.get("project", ""),
        query_ref=query.get("ref", ""),
        query_trade=query.get("trade", ""),
        query_text=query.get("text", "")[:800],  # Slightly more context
        candidate_project=candidate.get("project", ""),
        candidate_ref=candidate.get("ref", ""),
        candidate_trade=candidate.get("trade", ""),
        candidate_text=candidate.get("text", "")[:800],
        candidate_resolution=candidate.get("resolution", "")[:400],
    )

    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=100,
            temperature=0.1,
        )

        content = response.choices[0].message.content.strip()

        label = None
        reasoning = None

        for line in content.split("\n"):
            line = line.strip()
            if line.upper().startswith("LABEL:"):
                label_text = line.split(":", 1)[1].strip().lower()
                if "highly" in label_text:
                    label = "highly_relevant"
                elif "somewhat" in label_text:
                    label = "somewhat_relevant"
                else:
                    label = "not_relevant"
            elif line.upper().startswith("REASONING:"):
                reasoning = line.split(":", 1)[1].strip()

        return {
            "relevance": label or "not_relevant",
            "reasoning": reasoning,
        }

    except Exception as e:
        print(f"  Error calling LLM: {e}")
        return {"relevance": None, "reasoning": f"Error: {str(e)}"}


def get_base_ref(ref: str) -> str:
    """Get base ref without revision suffix (RFI-0920.1 -> RFI-0920)."""
    if not ref:
        return ""
    # Remove .1, .2, etc. suffixes
    import re
    return re.sub(r'\.\d+$', '', ref)


def is_revision_pair(ref1: str, ref2: str) -> bool:
    """Check if two refs are revisions of each other."""
    base1 = get_base_ref(ref1)
    base2 = get_base_ref(ref2)
    # Same base = revision pair (cheating)
    return base1 == base2


async def get_similar_pairs(pool, num_pairs: int = 50) -> list[tuple[dict, dict]]:
    """Get pairs that share trade/phase (likely relevant), excluding revisions."""
    print(f"  Finding {num_pairs} trade-matched pairs...", flush=True)

    async with pool.acquire() as conn:
        # Get pairs that share the same trade (likely relevant)
        # Use COALESCE to prefer normalized_text when question_text is short
        rows = await conn.fetch("""
            WITH queries AS (
                SELECT id, source_project_name, source_ref,
                       CASE WHEN LENGTH(question_text) > 50 THEN question_text
                            ELSE COALESCE(normalized_text, question_text) END as full_text,
                       trade_category, project_phase, resolution_text
                FROM intelligence.items
                WHERE (question_text IS NOT NULL OR normalized_text IS NOT NULL)
                  AND LENGTH(COALESCE(normalized_text, question_text, '')) > 50
                  AND trade_category IS NOT NULL
                ORDER BY RANDOM()
                LIMIT $1
            )
            SELECT
                q.id as q_id, q.source_project_name as q_project, q.source_ref as q_ref,
                q.full_text as q_text, q.trade_category as q_trade, q.project_phase as q_phase,
                c.id as c_id, c.source_project_name as c_project, c.source_ref as c_ref,
                CASE WHEN LENGTH(c.question_text) > 50 THEN c.question_text
                     ELSE COALESCE(c.normalized_text, c.question_text) END as c_text,
                c.trade_category as c_trade, c.project_phase as c_phase,
                c.resolution_text as c_resolution
            FROM queries q
            JOIN LATERAL (
                SELECT id, source_project_name, source_ref, question_text, normalized_text,
                       trade_category, project_phase, resolution_text
                FROM intelligence.items
                WHERE id != q.id
                  AND trade_category = q.trade_category
                  AND (question_text IS NOT NULL OR normalized_text IS NOT NULL)
                ORDER BY RANDOM()
                LIMIT 5  -- Get more candidates to filter revisions
            ) c ON true
        """, num_pairs * 2)  # Get extra to account for filtered revisions

    pairs = []
    seen_pairs = set()
    for row in rows:
        q_ref = row["q_ref"]
        c_ref = row["c_ref"]

        # Skip revision pairs (cheating)
        if is_revision_pair(q_ref, c_ref):
            continue

        # Skip duplicates
        pair_key = (row["q_id"], row["c_id"])
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)

        query_dict = {
            "id": str(row["q_id"]),
            "project": row["q_project"],
            "ref": q_ref,
            "text": row["q_text"] or "",
            "trade": row["q_trade"],
            "phase": row["q_phase"],
        }
        cand_dict = {
            "id": str(row["c_id"]),
            "project": row["c_project"],
            "ref": c_ref,
            "text": row["c_text"] or "",
            "trade": row["c_trade"],
            "phase": row["c_phase"],
            "resolution": row["c_resolution"] or "",
        }
        pairs.append((query_dict, cand_dict))

        if len(pairs) >= num_pairs:
            break

    print(f"  Got {len(pairs)} trade-matched pairs (excluded revisions)", flush=True)
    return pairs


async def get_random_pairs(pool, num_pairs: int = 50) -> list[tuple[dict, dict]]:
    """Get random pairs (likely not relevant), excluding revisions."""
    print(f"  Fetching {num_pairs} random pairs...", flush=True)

    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                id, source_project_name, source_ref,
                CASE WHEN LENGTH(question_text) > 50 THEN question_text
                     ELSE COALESCE(normalized_text, question_text) END as full_text,
                trade_category, project_phase, resolution_text
            FROM intelligence.items
            WHERE (question_text IS NOT NULL OR normalized_text IS NOT NULL)
              AND LENGTH(COALESCE(normalized_text, question_text, '')) > 50
            ORDER BY RANDOM()
            LIMIT $1
        """, num_pairs * 3)  # Get extra to filter revisions

    pairs = []
    seen_pairs = set()
    half = len(rows) // 2
    for i in range(half):
        q = rows[i]
        c = rows[half + i]

        # Skip revision pairs
        if is_revision_pair(q["source_ref"], c["source_ref"]):
            continue

        pair_key = (q["id"], c["id"])
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)

        query_dict = {
            "id": str(q["id"]),
            "project": q["source_project_name"],
            "ref": q["source_ref"],
            "text": q["full_text"] or "",
            "trade": q["trade_category"],
            "phase": q["project_phase"],
        }
        cand_dict = {
            "id": str(c["id"]),
            "project": c["source_project_name"],
            "ref": c["source_ref"],
            "text": c["full_text"] or "",
            "trade": c["trade_category"],
            "phase": c["project_phase"],
            "resolution": c["resolution_text"] or "",
        }
        pairs.append((query_dict, cand_dict))

        if len(pairs) >= num_pairs:
            break

    print(f"  Got {len(pairs)} random pairs (excluded revisions)", flush=True)
    return pairs


async def get_full_text(pool, item_id: str) -> dict:
    """Get full text for an item from database."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT
                source_project_name,
                source_ref,
                question_text,
                normalized_text,
                raw_text,
                resolution_text,
                trade_category,
                project_phase
            FROM intelligence.items
            WHERE id = $1
        """, item_id)

        if row:
            return {
                "project": row["source_project_name"],
                "ref": row["source_ref"],
                "question_text": row["question_text"],
                "normalized_text": row["normalized_text"],
                "raw_text": row["raw_text"],
                "resolution_text": row["resolution_text"],
                "trade": row["trade_category"],
                "phase": row["project_phase"],
            }
        return {}


async def sample_until_targets(
    highly_target: int = 10,
    somewhat_target: int = 10,
    not_relevant_target: int = 10,
):
    """Keep labeling until we have enough samples of each category."""
    print("=" * 70, flush=True)
    print("SAMPLING PAIRS UNTIL TARGETS MET", flush=True)
    print("=" * 70, flush=True)
    print(f"Targets: {highly_target} highly, {somewhat_target} somewhat, {not_relevant_target} not_relevant", flush=True)
    print(flush=True)

    print("Connecting to database...", flush=True)
    pool = await get_pool()
    print("Connected!", flush=True)

    samples = {
        "highly_relevant": [],
        "somewhat_relevant": [],
        "not_relevant": [],
    }

    total_labeled = 0

    try:
        # Strategy: use SIMILAR pairs to find highly_relevant quickly
        # Random pairs are mostly not_relevant
        while (len(samples["highly_relevant"]) < highly_target or
               len(samples["somewhat_relevant"]) < somewhat_target or
               len(samples["not_relevant"]) < not_relevant_target):

            print(f"\nProgress: highly={len(samples['highly_relevant'])}/{highly_target}, "
                  f"somewhat={len(samples['somewhat_relevant'])}/{somewhat_target}, "
                  f"not_relevant={len(samples['not_relevant'])}/{not_relevant_target}", flush=True)

            # Use similar pairs if we still need highly_relevant
            if len(samples["highly_relevant"]) < highly_target:
                pairs = await get_similar_pairs(pool, 30)
            else:
                pairs = await get_random_pairs(pool, 30)

            for query, candidate in pairs:
                # Skip if we already have enough of all categories
                if (len(samples["highly_relevant"]) >= highly_target and
                    len(samples["somewhat_relevant"]) >= somewhat_target and
                    len(samples["not_relevant"]) >= not_relevant_target):
                    break

                # Label with LLM
                result = await label_with_llm(query, candidate)
                total_labeled += 1

                relevance = result.get("relevance")
                if not relevance:
                    continue

                # Add to appropriate bucket if not full
                if relevance == "highly_relevant" and len(samples["highly_relevant"]) < highly_target:
                    samples["highly_relevant"].append({
                        "query": query,
                        "candidate": candidate,
                        "reasoning": result.get("reasoning"),
                    })
                    print(f"  [+] HIGHLY RELEVANT: {query['ref']} <-> {candidate['ref']}", flush=True)
                elif relevance == "somewhat_relevant" and len(samples["somewhat_relevant"]) < somewhat_target:
                    samples["somewhat_relevant"].append({
                        "query": query,
                        "candidate": candidate,
                        "reasoning": result.get("reasoning"),
                    })
                    print(f"  [~] somewhat: {query['ref']} <-> {candidate['ref']}", flush=True)
                elif relevance == "not_relevant" and len(samples["not_relevant"]) < not_relevant_target:
                    samples["not_relevant"].append({
                        "query": query,
                        "candidate": candidate,
                        "reasoning": result.get("reasoning"),
                    })
                    print(f"  [-] not_relevant: {query['ref']} <-> {candidate['ref']}", flush=True)

                await asyncio.sleep(0.05)  # Rate limit

            print()

        print(f"\nLabeled {total_labeled} pairs total to find targets.")

        # Now fetch full text for all samples
        print("\nFetching full text from database...")

        for category in samples:
            for sample in samples[category]:
                query_full = await get_full_text(pool, sample["query"]["id"])
                cand_full = await get_full_text(pool, sample["candidate"]["id"])
                sample["query_full"] = query_full
                sample["candidate_full"] = cand_full

        # Save to file
        output_file = Path(__file__).parent / "data" / "review_samples.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump({
                "generated_at": datetime.now().isoformat(),
                "total_labeled": total_labeled,
                "samples": samples,
            }, f, indent=2, default=str)

        print(f"\nSaved to: {output_file}")

        # Print summary for console
        print("\n" + "=" * 70)
        print("SAMPLES FOR REVIEW")
        print("=" * 70)

        for category in ["highly_relevant", "somewhat_relevant", "not_relevant"]:
            print(f"\n{'='*70}")
            print(f"  {category.upper()} ({len(samples[category])} samples)")
            print(f"{'='*70}")

            for i, sample in enumerate(samples[category]):
                print(f"\n--- Sample {i+1} ---")
                q = sample.get("query_full", sample["query"])
                c = sample.get("candidate_full", sample["candidate"])

                print(f"QUERY: [{q.get('ref', '?')}] {q.get('project', '?')}")
                print(f"  Text: {(q.get('question_text') or q.get('text', ''))[:300]}...")

                print(f"\nCANDIDATE: [{c.get('ref', '?')}] {c.get('project', '?')}")
                print(f"  Text: {(c.get('question_text') or c.get('text', ''))[:300]}...")
                print(f"  Resolution: {(c.get('resolution_text') or c.get('resolution', ''))[:200]}...")

                print(f"\nLLM Reasoning: {sample.get('reasoning', 'N/A')}")

    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(sample_until_targets())
