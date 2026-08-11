#!/usr/bin/env python3
"""
Impact Scoring - Full Run
Processes ALL RFIs until we find at least 5 score-5s
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

# More aggressive prompt to identify score 5s
SCORING_PROMPT = """You are a construction analyst identifying HIGH-VALUE learning opportunities from RFIs.

RFI Question:
{question_text}

Resolution:
{resolution_text}

Project: {project}
Trade: {trade}

TASK: Score this RFI's LEARNING VALUE - can this teach us something useful for future projects?

Return JSON:
{{
    "learning_value": {{
        "score": <1-5>,
        "reasoning": "<specific explanation>"
    }},
    "applicability_scope": {{
        "level": "<broad|category_specific|narrow>",
        "project_types": ["list types this applies to"]
    }},
    "actionability": {{
        "level": "<high|medium|low>",
        "specific_action": "<if high/medium, what specific preventive action?>",
        "action_phase": "<design|preconstruction|submittal_review|construction|closeout>"
    }},
    "root_cause_clarity": {{
        "level": "<clear|partial|unknown>",
        "root_cause": "<if clear/partial, what was the root cause?>"
    }},
    "impact_scope": {{
        "score": <1-5>,
        "trades_affected": ["<list trades>"]
    }},
    "rework_level": "<none|minor|significant|major>",
    "summary": {{
        "one_line": "<one sentence summary>",
        "is_routine": <true|false>
    }}
}}

=== SCORE 5 (CRITICAL) CRITERIA ===
Give Score 5 ONLY when ALL of these are true:
1. CLEAR ROOT CAUSE identified (we know exactly WHY this happened)
2. BROADLY APPLICABLE (applies to most construction projects, not just TI or specific types)
3. SPECIFIC PREVENTIVE ACTION exists (a checklist item, process change, or verification step)
4. SIGNIFICANT IMPACT (safety, structural, code, or major rework)

EXAMPLES OF SCORE 5:
- "PT cable blowout during stressing due to insufficient concrete cover - add pre-stress cover verification"
- "Fire-rated wall breached by uncoordinated MEP penetrations - require fire rating review before penetration approval"
- "Structural embed misplaced causing curtain wall rework - add embed location verification to pre-pour checklist"
- "Waterproofing failed at transition - require waterproofing inspection at all material transitions"

=== SCORE 4 (IMPORTANT) ===
Clear root cause OR broadly applicable (not necessarily both). Actionable insight available.

=== SCORE 3 (WORTH TRACKING) ===
Category-specific lesson (TI, data center). Moderate actionability.

=== SCORE 2-1 (ROUTINE) ===
Routine coordination, missing details, clarifications. Nothing transferable.

BE DISCRIMINATING but don't be overly conservative. If an RFI reveals a genuine systemic issue with clear prevention, score it 5."""


async def fetch_all_rfis(conn) -> list[dict]:
    """Fetch ALL RFIs that resulted in change orders."""
    rows = await conn.fetch("""
        SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category
        FROM intelligence.items
        WHERE resulted_in_co = true
          AND question_text IS NOT NULL
          AND length(question_text) > 50
        ORDER BY random()
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
                    {"role": "system", "content": "You are a construction analyst. Identify genuinely valuable learning opportunities. Score 5 requires: clear root cause + broad applicability + specific preventive action + significant impact."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
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
    print("IMPACT SCORING - FULL RUN")
    print("=" * 70)
    print("Target: At least 5 score-5s")
    print()

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        all_rfis = await fetch_all_rfis(conn)
        print(f"Total RFIs to process: {len(all_rfis)}")

        # Count by project
        by_proj = {}
        for r in all_rfis:
            p = r['source_project_name']
            by_proj[p] = by_proj.get(p, 0) + 1
        print("\nProject distribution:")
        for p, c in sorted(by_proj.items(), key=lambda x: x[1], reverse=True):
            print(f"  {p}: {c}")

        print("\nScoring in batches of 20...")
        semaphore = asyncio.Semaphore(10)

        all_results = []
        score_5_count = 0
        score_4_count = 0
        total_cost = 0

        batch_size = 20
        for i in range(0, len(all_rfis), batch_size):
            batch = all_rfis[i:i+batch_size]
            batch_results = await asyncio.gather(*[score_rfi(rfi, semaphore) for rfi in batch])

            for r in batch_results:
                if r.get("success"):
                    all_results.append(r)
                    score = r.get("learning_value", {}).get("score", 0)
                    if score == 5:
                        score_5_count += 1
                        print(f"\n  *** SCORE 5 FOUND: {r['rfi_number']} ({r['project']})")
                        print(f"      {r.get('summary', {}).get('one_line', '')[:70]}")
                    elif score == 4:
                        score_4_count += 1

                    # Track cost
                    tokens = r.get("tokens_used", {})
                    total_cost += (tokens.get("input", 0) * 0.15 + tokens.get("output", 0) * 0.60) / 1_000_000

            processed = min(i + batch_size, len(all_rfis))
            print(f"  Processed: {processed}/{len(all_rfis)} | Score 5s: {score_5_count} | Score 4s: {score_4_count} | Cost: ${total_cost:.4f}")

            # Check if we've reached our target
            if score_5_count >= 5:
                print(f"\n*** TARGET REACHED: {score_5_count} score-5s found! ***")
                break

        # Distribution
        score_dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        for r in all_results:
            s = r.get("learning_value", {}).get("score", 0)
            if s in score_dist:
                score_dist[s] += 1

        print("\n" + "=" * 70)
        print("FINAL DISTRIBUTION")
        print("=" * 70)
        for s in [5, 4, 3, 2, 1]:
            print(f"  Score {s}: {score_dist[s]}")
        print(f"\nTotal processed: {len(all_results)}")
        print(f"Total cost: ${total_cost:.4f}")

        # Save results
        output = {
            "generated_at": datetime.now().isoformat(),
            "cost_usd": total_cost,
            "total_processed": len(all_results),
            "score_distribution": score_dist,
            "results": all_results
        }
        json_path = REPORTS_DIR / "impact_scoring_full.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"\nResults saved: {json_path}")

        # Show all score 5s
        print("\n" + "=" * 70)
        print("ALL SCORE 5s (CRITICAL)")
        print("=" * 70)
        for r in all_results:
            if r.get("learning_value", {}).get("score") == 5:
                print(f"\n{r['rfi_number']} ({r['project']})")
                print(f"  Trade: {r.get('trade', 'N/A')}")
                print(f"  Summary: {r.get('summary', {}).get('one_line', '')}")
                print(f"  Root Cause: {r.get('root_cause_clarity', {}).get('root_cause', 'N/A')}")
                print(f"  Action: {r.get('actionability', {}).get('specific_action', 'N/A')}")
                print(f"  Applicability: {r.get('applicability_scope', {}).get('level')}")

        # Show all score 4s
        print("\n" + "=" * 70)
        print("ALL SCORE 4s (IMPORTANT)")
        print("=" * 70)
        for r in all_results:
            if r.get("learning_value", {}).get("score") == 4:
                print(f"\n{r['rfi_number']} ({r['project']})")
                print(f"  Summary: {r.get('summary', {}).get('one_line', '')[:80]}")
                print(f"  Action: {r.get('actionability', {}).get('specific_action', '')[:60]}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
