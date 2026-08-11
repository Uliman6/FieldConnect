#!/usr/bin/env python3
"""
Impact Scoring - Find Score 5s
Adjusted criteria to identify the top learnable RFIs
"""

import asyncio
import os
import sys
import json
import random
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg
from openai import AsyncOpenAI

REPORTS_DIR = Path(__file__).parent.parent / "reports"

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Adjusted prompt - less strict on score 5 criteria
SCORING_PROMPT = """You are a construction analyst ranking RFIs by learning value for future projects.

RFI Question:
{question_text}

Resolution:
{resolution_text}

Project: {project}
Trade: {trade}

TASK: Rank this RFI's learning value on a 1-5 scale. Be honest about what rises to the top.

Return JSON:
{{
    "learning_value": {{
        "score": <1-5>,
        "reasoning": "<why this score>"
    }},
    "applicability_scope": {{
        "level": "<broad|category_specific|narrow>",
        "project_types": ["list project types"]
    }},
    "actionability": {{
        "level": "<high|medium|low>",
        "specific_action": "<what preventive action?>",
        "action_phase": "<design|preconstruction|submittal_review|construction|closeout>"
    }},
    "root_cause_clarity": {{
        "level": "<clear|partial|unknown>",
        "root_cause": "<what was the root cause?>"
    }},
    "impact_scope": {{
        "score": <1-5>,
        "trades_affected": ["<list trades>"]
    }},
    "rework_level": "<none|minor|significant|major>",
    "summary": {{
        "one_line": "<one sentence>",
        "is_routine": <true|false>
    }}
}}

=== SCORING SCALE ===

**SCORE 5 - TOP TIER LEARNING** (expect ~2-5% of RFIs)
These are the RFIs every PM/superintendent should see. They reveal:
- A systemic issue that WILL recur if not addressed
- Something that caused or could cause MAJOR rework, safety issue, or code violation
- A process gap with a clear fix

Examples of Score 5:
- PT cable blowout due to insufficient cover → add pre-stress inspection
- Fire-rated wall breached by MEP → require penetration approval process
- Embed misplaced causing curtain wall rework → add embed survey to pre-pour
- Waterproofing failed at transition → require membrane inspection at transitions
- Code violation discovered during inspection → add code check to design review

**SCORE 4 - IMPORTANT LESSON** (expect ~30-40%)
Valuable learning but either:
- More narrow in applicability (TI-specific, data center-specific), OR
- Less severe consequence, OR
- Root cause less clear

**SCORE 3 - WORTH NOTING** (expect ~30-40%)
Moderate learning value. Coordination issues, spec clarifications.

**SCORE 2-1 - ROUTINE** (expect ~20-30%)
Standard RFI traffic. Missing dimensions, routine clarifications.

=== KEY QUESTION TO ASK ===
"Would I want to warn other project teams about this issue?"
- If YES and the warning is specific/actionable → Score 5
- If YES but the warning is general → Score 4
- If MAYBE → Score 3
- If NO → Score 1-2

DO NOT be overly conservative. If an RFI reveals something genuinely important, score it 5."""


async def fetch_score4_rfis(conn) -> list[dict]:
    """Fetch RFIs that were previously scored as 4 to re-evaluate."""
    # Load previous results
    json_path = REPORTS_DIR / "impact_scoring_full.json"
    if json_path.exists():
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Get all score 4 RFI IDs
        score4_ids = []
        for r in data['results']:
            if r.get('learning_value', {}).get('score') == 4:
                score4_ids.append(r['rfi_id'])

        print(f"Found {len(score4_ids)} previous score-4 RFIs to re-evaluate")

        # Fetch from database
        rows = await conn.fetch("""
            SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category
            FROM intelligence.items
            WHERE id = ANY($1::uuid[])
        """, score4_ids)

        return [dict(row) for row in rows]
    else:
        print("No previous results found, fetching all high-value candidates")
        rows = await conn.fetch("""
            SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category
            FROM intelligence.items
            WHERE resulted_in_co = true
              AND question_text IS NOT NULL
              AND (
                question_text ILIKE '%blow%out%'
                OR question_text ILIKE '%fail%'
                OR question_text ILIKE '%damage%'
                OR question_text ILIKE '%rework%'
                OR question_text ILIKE '%remediation%'
                OR question_text ILIKE '%safety%'
                OR question_text ILIKE '%code%'
                OR question_text ILIKE '%violation%'
                OR question_text ILIKE '%seismic%'
                OR question_text ILIKE '%fire%rat%'
              )
            ORDER BY random()
            LIMIT 100
        """)
        return [dict(row) for row in rows]


async def score_rfi(rfi: dict, semaphore: asyncio.Semaphore) -> dict:
    """Score a single RFI."""
    async with semaphore:
        try:
            prompt = SCORING_PROMPT.format(
                question_text=rfi["question_text"][:3000],
                resolution_text=(rfi["resolution_text"] or "No resolution recorded")[:1500],
                trade=rfi["trade_category"] or "Not specified",
                project=rfi["source_project_name"]
            )

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are ranking RFIs by learning value. Score 5 means 'every PM should know about this.' Be selective but not overly conservative - the best 2-5% should get score 5."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=800,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            result["rfi_id"] = str(rfi["id"])
            result["rfi_number"] = rfi["source_ref"]
            result["project"] = rfi["source_project_name"]
            result["trade"] = rfi["trade_category"]
            result["question_text"] = rfi["question_text"]
            result["resolution_text"] = rfi["resolution_text"]
            result["success"] = True
            result["tokens_used"] = {
                "input": response.usage.prompt_tokens,
                "output": response.usage.completion_tokens
            }

            return result

        except Exception as e:
            return {
                "rfi_id": str(rfi["id"]),
                "rfi_number": rfi["source_ref"],
                "project": rfi["source_project_name"],
                "success": False,
                "error": str(e)
            }


async def main():
    print("=" * 70)
    print("IMPACT SCORING - FIND SCORE 5s")
    print("=" * 70)
    print("Re-evaluating previous score-4s with adjusted criteria")
    print()

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        rfis = await fetch_score4_rfis(conn)
        print(f"Total to re-evaluate: {len(rfis)}")

        # Count by project
        by_proj = {}
        for r in rfis:
            p = r['source_project_name']
            by_proj[p] = by_proj.get(p, 0) + 1
        print("\nProject distribution:")
        for p, c in sorted(by_proj.items(), key=lambda x: x[1], reverse=True):
            print(f"  {p}: {c}")

        print("\nScoring...")
        semaphore = asyncio.Semaphore(10)

        results = []
        score_5_count = 0
        total_cost = 0

        batch_size = 20
        for i in range(0, len(rfis), batch_size):
            batch = rfis[i:i+batch_size]
            batch_results = await asyncio.gather(*[score_rfi(rfi, semaphore) for rfi in batch])

            for r in batch_results:
                if r.get("success"):
                    results.append(r)
                    score = r.get("learning_value", {}).get("score", 0)
                    if score == 5:
                        score_5_count += 1
                        print(f"\n  *** SCORE 5: {r['rfi_number']} ({r['project']})")
                        print(f"      {r.get('summary', {}).get('one_line', '')[:70]}")

                    tokens = r.get("tokens_used", {})
                    total_cost += (tokens.get("input", 0) * 0.15 + tokens.get("output", 0) * 0.60) / 1_000_000

            processed = min(i + batch_size, len(rfis))
            print(f"  {processed}/{len(rfis)} | Score 5s: {score_5_count} | Cost: ${total_cost:.4f}")

        # Distribution
        score_dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        for r in results:
            s = r.get("learning_value", {}).get("score", 0)
            if s in score_dist:
                score_dist[s] += 1

        print("\n" + "=" * 70)
        print("FINAL DISTRIBUTION")
        print("=" * 70)
        for s in [5, 4, 3, 2, 1]:
            print(f"  Score {s}: {score_dist[s]}")
        print(f"\nTotal cost: ${total_cost:.4f}")

        # Save
        output = {
            "generated_at": datetime.now().isoformat(),
            "cost_usd": total_cost,
            "score_distribution": score_dist,
            "results": results
        }
        json_path = REPORTS_DIR / "impact_scoring_5s.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"\nResults: {json_path}")

        # Show all score 5s with full details
        print("\n" + "=" * 70)
        print("ALL SCORE 5s - FULL DETAILS")
        print("=" * 70)
        for r in results:
            if r.get("learning_value", {}).get("score") == 5:
                print(f"\n{'='*70}")
                print(f"RFI: {r['rfi_number']}")
                print(f"Project: {r['project']}")
                print(f"Trade: {r.get('trade', 'N/A')}")
                print(f"\nQuestion: {r['question_text'][:500]}...")
                print(f"\nResolution: {(r.get('resolution_text') or 'N/A')[:300]}...")
                print(f"\nLearning Value: {r['learning_value']['score']}/5")
                print(f"  Reasoning: {r['learning_value']['reasoning']}")
                print(f"\nApplicability: {r.get('applicability_scope', {}).get('level')}")
                print(f"  Types: {', '.join(r.get('applicability_scope', {}).get('project_types', []))}")
                print(f"\nActionability: {r.get('actionability', {}).get('level')}")
                print(f"  Action: {r.get('actionability', {}).get('specific_action', 'N/A')}")
                print(f"  Phase: {r.get('actionability', {}).get('action_phase', 'N/A')}")
                print(f"\nRoot Cause Clarity: {r.get('root_cause_clarity', {}).get('level')}")
                print(f"  Root Cause: {r.get('root_cause_clarity', {}).get('root_cause', 'N/A')}")
                print(f"\nRework Level: {r.get('rework_level', 'N/A')}")
                print(f"Summary: {r.get('summary', {}).get('one_line', 'N/A')}")

        # Show score 4s briefly
        print("\n" + "=" * 70)
        print("SCORE 4s (First 20)")
        print("=" * 70)
        score_4s = [r for r in results if r.get("learning_value", {}).get("score") == 4]
        for r in score_4s[:20]:
            print(f"\n{r['rfi_number']} ({r['project']})")
            print(f"  {r.get('summary', {}).get('one_line', '')[:80]}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
