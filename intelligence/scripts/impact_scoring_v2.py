#!/usr/bin/env python3
"""
Impact Scoring v2 - With 4.5 Category
Based on user calibration feedback
"""

import asyncio
import os
import sys
import json
import random
from pathlib import Path
from datetime import datetime
from decimal import Decimal

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg
from openai import AsyncOpenAI

REPORTS_DIR = Path(__file__).parent.parent / "reports"

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Updated prompt with 4.5 category based on user calibration
SCORING_PROMPT = """You are a construction analyst ranking RFIs by learning value.

RFI Question:
{question_text}

Resolution:
{resolution_text}

Project: {project}
Trade: {trade}
Change Order Value: ${co_value:,.2f}

TASK: Score this RFI's learning value on a scale including half-points (1, 2, 3, 4, 4.5, 5).

Return JSON:
{{
    "learning_value": {{
        "score": <1|2|3|4|4.5|5>,
        "reasoning": "<why this score>"
    }},
    "applicability_scope": {{
        "level": "<broad|category_specific|narrow>",
        "project_types": ["list project types"]
    }},
    "actionability": {{
        "level": "<high|medium|low>",
        "specific_action": "<what preventive action or checklist item?>",
        "action_phase": "<design|preconstruction|submittal_review|construction|closeout>"
    }},
    "root_cause_clarity": {{
        "level": "<clear|partial|unknown>",
        "root_cause": "<what was the root cause?>"
    }},
    "impact_severity": "<critical|significant|moderate|minor>",
    "rework_level": "<none|minor|significant|major>",
    "summary": {{
        "one_line": "<one sentence>",
        "lesson_type": "<checklist_item|process_change|design_consideration|code_compliance|coordination_gap>"
    }}
}}

=== SCORING SCALE (CALIBRATED) ===

**SCORE 5 - CRITICAL LEARNING** (rare, ~1-2%)
Both conditions required:
1. CRITICAL IMPACT: Safety issue, code violation discovered late, damage to critical systems (elevators, fire systems, structure), or major rework
2. TRANSFERABLE LESSON: Clear root cause with specific preventive action

Examples of Score 5:
- Stair barrier rejected by police for safety concealment risk
- Water intrusion into elevator shaft due to missing weather barrier
- Existing electrical found non-code-compliant, unknown what it feeds
- Structural failure or near-miss with clear preventable cause

**SCORE 4.5 - IMPORTANT CHECK** (~5-10%)
Good transferable learning that should be a checklist item, but impact is NOT critical:
- Fire rating requirement missed but caught before major rework
- Code compliance issue that's a good reminder for future projects
- Design revision that should trigger re-verification
- ADA compliance gap caught during construction

Examples:
- ESS battery rooms require 2-hr fire separation (good to know, not critical damage)
- Wall changes should trigger ADA re-check (process improvement)
- Tall walls >40' need NFPA 285 combustible material check
- Shop drawing revisions should trigger seismic code re-verification

**SCORE 4 - NOTABLE LEARNING** (~20-30%)
Useful insight but either:
- More narrow applicability (specific project type)
- Less clear root cause
- Standard coordination issue with moderate impact

**SCORE 3 - WORTH TRACKING** (~30-40%)
Category-specific issues, routine coordination gaps.

**SCORE 2-1 - ROUTINE** (~30-40%)
Standard RFI traffic, missing details, clarifications.

=== KEY DISTINCTION ===
Score 5 vs 4.5: "Did this cause or nearly cause CRITICAL damage/safety issue?"
- If YES (elevator damage, safety violation, structural issue) → Score 5
- If NO but good learning → Score 4.5

Score 4.5 vs 4: "Is this a transferable checklist item for future projects?"
- If YES, specific action for any similar project → Score 4.5
- If NO, more situation-specific → Score 4"""


async def fetch_rfis_with_co_values(conn) -> list[dict]:
    """Fetch RFIs with their change order values."""
    rows = await conn.fetch("""
        SELECT
            id,
            source_ref,
            source_project_name,
            question_text,
            resolution_text,
            trade_category,
            COALESCE(cost_impact, 0) as co_value
        FROM intelligence.items
        WHERE resulted_in_co = true
          AND question_text IS NOT NULL
          AND length(question_text) > 50
        ORDER BY cost_impact DESC NULLS LAST
    """)
    return [dict(row) for row in rows]


async def score_rfi(rfi: dict, semaphore: asyncio.Semaphore) -> dict:
    """Score a single RFI."""
    async with semaphore:
        try:
            co_value = float(rfi.get("co_value", 0) or 0)

            prompt = SCORING_PROMPT.format(
                question_text=rfi["question_text"][:3000],
                resolution_text=(rfi["resolution_text"] or "No resolution recorded")[:1500],
                trade=rfi["trade_category"] or "Not specified",
                project=rfi["source_project_name"],
                co_value=co_value
            )

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are ranking RFIs by learning value. Use the calibrated scale: Score 5 requires CRITICAL impact + learning. Score 4.5 is for good checklist items without critical impact. Be discriminating."},
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
            result["co_value"] = co_value
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
                "co_value": float(rfi.get("co_value", 0) or 0),
                "success": False,
                "error": str(e)
            }


async def main():
    print("=" * 70)
    print("IMPACT SCORING v2 - WITH 4.5 CATEGORY")
    print("=" * 70)
    print("Calibrated based on user feedback")
    print()

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        all_rfis = await fetch_rfis_with_co_values(conn)
        print(f"Total RFIs: {len(all_rfis)}")

        # Show CO value distribution
        high_value = [r for r in all_rfis if r['co_value'] > 50000]
        medium_value = [r for r in all_rfis if 10000 < r['co_value'] <= 50000]
        low_value = [r for r in all_rfis if r['co_value'] <= 10000]

        print(f"\nChange Order Value Distribution:")
        print(f"  >$50K: {len(high_value)} RFIs")
        print(f"  $10K-$50K: {len(medium_value)} RFIs")
        print(f"  <$10K: {len(low_value)} RFIs")

        print("\nScoring all RFIs...")
        semaphore = asyncio.Semaphore(10)

        results = []
        total_cost = 0

        batch_size = 25
        for i in range(0, len(all_rfis), batch_size):
            batch = all_rfis[i:i+batch_size]
            batch_results = await asyncio.gather(*[score_rfi(rfi, semaphore) for rfi in batch])

            for r in batch_results:
                if r.get("success"):
                    results.append(r)
                    tokens = r.get("tokens_used", {})
                    total_cost += (tokens.get("input", 0) * 0.15 + tokens.get("output", 0) * 0.60) / 1_000_000

            processed = min(i + batch_size, len(all_rfis))

            # Count current distribution
            dist = {}
            for r in results:
                s = r.get("learning_value", {}).get("score", 0)
                dist[s] = dist.get(s, 0) + 1

            print(f"  {processed}/{len(all_rfis)} | 5s:{dist.get(5,0)} | 4.5s:{dist.get(4.5,0)} | 4s:{dist.get(4,0)} | Cost: ${total_cost:.4f}")

        # Final distribution
        score_dist = {}
        for r in results:
            s = r.get("learning_value", {}).get("score", 0)
            score_dist[s] = score_dist.get(s, 0) + 1

        print("\n" + "=" * 70)
        print("FINAL DISTRIBUTION")
        print("=" * 70)
        for s in sorted(score_dist.keys(), reverse=True):
            print(f"  Score {s}: {score_dist[s]}")
        print(f"\nTotal cost: ${total_cost:.4f}")

        # Save results
        output = {
            "generated_at": datetime.now().isoformat(),
            "cost_usd": total_cost,
            "score_distribution": {str(k): v for k, v in score_dist.items()},
            "results": results
        }
        json_path = REPORTS_DIR / "impact_scoring_v2.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"\nResults: {json_path}")

        # Analyze high-value COs vs scores
        print("\n" + "=" * 70)
        print("HIGH-VALUE CHANGE ORDERS vs LEARNING SCORES")
        print("=" * 70)

        # Sort by CO value
        by_co = sorted(results, key=lambda x: x.get('co_value', 0), reverse=True)

        print("\nTop 15 by Change Order Value:")
        print("-" * 70)
        for r in by_co[:15]:
            score = r.get("learning_value", {}).get("score", "?")
            co = r.get("co_value", 0)
            summary = r.get("summary", {}).get("one_line", "")[:50]
            print(f"  ${co:>10,.0f} | Score {score} | {r['rfi_number']} | {summary}")

        # Show score 5s and 4.5s
        print("\n" + "=" * 70)
        print("ALL SCORE 5s (CRITICAL)")
        print("=" * 70)
        score_5s = [r for r in results if r.get("learning_value", {}).get("score") == 5]
        for r in score_5s:
            co = r.get("co_value", 0)
            print(f"\n{r['rfi_number']} ({r['project']}) - CO: ${co:,.0f}")
            print(f"  Impact: {r.get('impact_severity', '?')}")
            print(f"  Summary: {r.get('summary', {}).get('one_line', '')}")
            print(f"  Root Cause: {r.get('root_cause_clarity', {}).get('root_cause', 'N/A')[:80]}")
            print(f"  Action: {r.get('actionability', {}).get('specific_action', 'N/A')[:80]}")

        print("\n" + "=" * 70)
        print("ALL SCORE 4.5s (IMPORTANT CHECKS)")
        print("=" * 70)
        score_45s = [r for r in results if r.get("learning_value", {}).get("score") == 4.5]
        for r in score_45s[:20]:  # Show first 20
            co = r.get("co_value", 0)
            lesson_type = r.get("summary", {}).get("lesson_type", "?")
            print(f"\n{r['rfi_number']} ({r['project']}) - CO: ${co:,.0f} - {lesson_type}")
            print(f"  {r.get('summary', {}).get('one_line', '')[:80]}")
            print(f"  Action: {r.get('actionability', {}).get('specific_action', 'N/A')[:60]}")

        if len(score_45s) > 20:
            print(f"\n... and {len(score_45s) - 20} more score-4.5s")

        # Correlation analysis
        print("\n" + "=" * 70)
        print("CO VALUE vs LEARNING SCORE CORRELATION")
        print("=" * 70)

        score_to_cos = {}
        for r in results:
            s = r.get("learning_value", {}).get("score", 0)
            co = r.get("co_value", 0)
            if s not in score_to_cos:
                score_to_cos[s] = []
            score_to_cos[s].append(co)

        print("\nAverage CO Value by Score:")
        for s in sorted(score_to_cos.keys(), reverse=True):
            cos = score_to_cos[s]
            avg = sum(cos) / len(cos) if cos else 0
            total = sum(cos)
            print(f"  Score {s}: Avg ${avg:,.0f} | Total ${total:,.0f} | Count {len(cos)}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
