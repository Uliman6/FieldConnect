#!/usr/bin/env python3
"""
Score the most expensive RFIs by CO amount for each project.

Fetches top N costliest RFIs per project and runs LLM impact scoring on them.
"""

import asyncio
import os
import sys
import json
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg
from openai import AsyncOpenAI

REPORTS_DIR = Path(__file__).parent.parent / "reports"
TOP_N_PER_PROJECT = 10  # Score top 10 per project

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SCORING_PROMPT = """You are a construction project analyst. Analyze this RFI that resulted in a change order costing ${co_amount:,.0f}.

RFI Question:
{question_text}

Resolution:
{resolution_text}

Project: {project}
Trade: {trade}
Change Order Amount: ${co_amount:,.0f}

TASK: Score this RFI on impact and learning value. This is a high-cost RFI - be thoughtful about what made it expensive.

Return JSON:
{{
    "learning_value": {{
        "score": <1-5>,
        "reasoning": "<why this score - what can we learn from this expensive issue?>"
    }},
    "applicability_scope": {{
        "level": "<broad|category_specific|narrow>",
        "project_types": ["<which project types can learn from this>"],
        "reasoning": "<who else should know about this?>"
    }},
    "actionability": {{
        "level": "<high|medium|low>",
        "specific_action": "<concrete preventive action>",
        "action_phase": "<design|preconstruction|construction|closeout>",
        "reasoning": "<what specifically should change?>"
    }},
    "root_cause_clarity": {{
        "level": "<clear|partial|unclear>",
        "root_cause": "<what actually caused this expensive issue>",
        "reasoning": "<how confident are we about the cause?>"
    }},
    "cost_driver": {{
        "primary_driver": "<what made this expensive - rework|scope_addition|coordination_failure|design_change|field_conditions|error_correction>",
        "reasoning": "<why did this cost so much?>"
    }},
    "summary": {{
        "one_line": "<one sentence describing the costly issue>",
        "lesson_type": "<preventable_error|coordination_gap|design_issue|field_discovery|scope_change>"
    }}
}}

SCORING GUIDE - Learning Value (1-5):
- 1: Routine clarification - cost is just from scope, not preventable
- 2: Standard occurrence - expected for this project type
- 3: Worth tracking - coordination gap or process issue that could be improved
- 4: Important lesson - preventable error, expensive rework, clear action to prevent
- 5: Critical - major failure, safety concern, repeated pattern, cascade effect

HIGH VALUE SIGNALS (4-5):
- Preventable field errors that caused expensive rework
- Coordination failures between trades
- Missing information that should have been caught in design
- Issues that cascaded to affect multiple systems
- Repeated patterns seen across projects

CONSIDER THE COST:
- High CO amount + preventable issue = higher learning value
- High CO amount but just scope addition = lower learning value (can't prevent)
- Moderate CO but clear prevention action = higher learning value"""


async def fetch_costly_rfis(conn) -> list[dict]:
    """Fetch top N most expensive RFIs per project."""

    rows = await conn.fetch("""
        WITH ranked AS (
            SELECT
                id, source_ref, source_project_name,
                question_text, resolution_text, trade_category,
                cost_impact,
                ROW_NUMBER() OVER (
                    PARTITION BY source_project_name
                    ORDER BY cost_impact DESC
                ) as rank
            FROM intelligence.items
            WHERE cost_impact > 0
              AND question_text IS NOT NULL
        )
        SELECT id, source_ref, source_project_name,
               question_text, resolution_text, trade_category,
               cost_impact
        FROM ranked
        WHERE rank <= $1
        ORDER BY source_project_name, cost_impact DESC
    """, TOP_N_PER_PROJECT)

    return [dict(r) for r in rows]


async def score_rfi(rfi: dict, semaphore: asyncio.Semaphore) -> dict:
    """Score a single RFI with LLM."""
    async with semaphore:
        try:
            prompt = SCORING_PROMPT.format(
                question_text=rfi["question_text"][:3000],
                resolution_text=(rfi["resolution_text"] or "No resolution recorded")[:1500],
                trade=rfi["trade_category"] or "Not specified",
                project=rfi["source_project_name"],
                co_amount=float(rfi["cost_impact"])
            )

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a construction analyst evaluating costly RFIs for lessons learned. Be discriminating about learning value - high cost alone doesn't mean high learning value."},
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
            result["co_amount"] = float(rfi["cost_impact"])
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
                "co_amount": float(rfi["cost_impact"]),
                "success": False,
                "error": str(e)
            }


async def main():
    print("=" * 80)
    print("SCORE COSTLY RFIs - TOP {} PER PROJECT".format(TOP_N_PER_PROJECT))
    print("=" * 80)

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Fetch costly RFIs
        rfis = await fetch_costly_rfis(conn)

        # Group by project for display
        by_project = {}
        for rfi in rfis:
            p = rfi['source_project_name']
            if p not in by_project:
                by_project[p] = []
            by_project[p].append(rfi)

        print(f"\nRFIs to score by project:")
        for project, project_rfis in sorted(by_project.items()):
            total_co = sum(float(r['cost_impact']) for r in project_rfis)
            print(f"  {project}: {len(project_rfis)} RFIs, ${total_co:,.0f}")

        print(f"\nTotal: {len(rfis)} RFIs")

        # Score with LLM
        print("\nScoring with GPT-4o-mini...")
        semaphore = asyncio.Semaphore(10)

        results = []
        for i in range(0, len(rfis), 10):
            batch = rfis[i:i+10]
            batch_results = await asyncio.gather(
                *[score_rfi(rfi, semaphore) for rfi in batch]
            )
            results.extend(batch_results)
            print(f"  Processed {min(i+10, len(rfis))}/{len(rfis)}")

        successful = [r for r in results if r.get("success")]
        failed = [r for r in results if not r.get("success")]

        # Calculate cost
        total_input = sum(r.get("tokens_used", {}).get("input", 0) for r in successful)
        total_output = sum(r.get("tokens_used", {}).get("output", 0) for r in successful)
        cost = (total_input * 0.15 + total_output * 0.60) / 1_000_000

        print(f"\nScoring complete: {len(successful)} successful, {len(failed)} failed")
        print(f"Cost: ${cost:.4f}")

        # Distribution
        score_dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        for r in successful:
            score = r.get("learning_value", {}).get("score", 0)
            if score in score_dist:
                score_dist[score] += 1

        print("\n" + "=" * 80)
        print("LEARNING VALUE DISTRIBUTION")
        print("=" * 80)
        for score in [5, 4, 3, 2, 1]:
            bar = "#" * score_dist[score]
            print(f"  Score {score}: {score_dist[score]:3d} {bar}")

        # Results by project
        print("\n" + "=" * 80)
        print("RESULTS BY PROJECT")
        print("=" * 80)

        for project in sorted(by_project.keys()):
            project_results = [r for r in successful if r['project'] == project]
            if not project_results:
                continue

            total_co = sum(r['co_amount'] for r in project_results)
            avg_score = sum(r.get('learning_value', {}).get('score', 0) for r in project_results) / len(project_results)

            print(f"\n{project}:")
            print(f"  RFIs scored: {len(project_results)}")
            print(f"  Total CO: ${total_co:,.0f}")
            print(f"  Avg Learning Score: {avg_score:.1f}")

            # Show top 3 by learning value
            sorted_by_score = sorted(project_results,
                                    key=lambda x: (x.get('learning_value', {}).get('score', 0), x['co_amount']),
                                    reverse=True)

            print(f"  Top by learning value:")
            for r in sorted_by_score[:3]:
                lv = r.get('learning_value', {})
                summary = r.get('summary', {}).get('one_line', '')[:60]
                print(f"    {r['rfi_number']}: Score {lv.get('score', '?')}, ${r['co_amount']:,.0f}")
                print(f"      {summary}")

        # Save results
        output = {
            "generated_at": datetime.now().isoformat(),
            "top_n_per_project": TOP_N_PER_PROJECT,
            "total_rfis": len(rfis),
            "successful": len(successful),
            "cost_usd": cost,
            "score_distribution": score_dist,
            "results": successful
        }

        # Load existing scoring data and merge
        existing_path = REPORTS_DIR / "impact_scoring_v2.json"
        if existing_path.exists():
            with open(existing_path, 'r', encoding='utf-8') as f:
                existing = json.load(f)

            # Create lookup of existing results
            existing_lookup = {}
            for r in existing.get('results', []):
                key = (r.get('project'), r.get('rfi_number'))
                existing_lookup[key] = r

            # Update with new results
            for r in successful:
                key = (r['project'], r['rfi_number'])
                existing_lookup[key] = r

            # Rebuild results list
            existing['results'] = list(existing_lookup.values())
            existing['updated_at'] = datetime.now().isoformat()
            existing['costly_rfis_scored'] = len(successful)

            # Recalculate distribution
            new_dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
            for r in existing['results']:
                score = r.get('learning_value', {}).get('score', 0)
                if score in new_dist:
                    new_dist[score] += 1
            existing['score_distribution'] = new_dist

            with open(existing_path, 'w', encoding='utf-8') as f:
                json.dump(existing, f, indent=2, ensure_ascii=False)
            print(f"\nUpdated existing scoring file: {existing_path}")
            print(f"  Total results now: {len(existing['results'])}")

        # Also save standalone file
        standalone_path = REPORTS_DIR / "costly_rfis_scoring.json"
        with open(standalone_path, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"Saved standalone results: {standalone_path}")

        # Show highest learning value RFIs
        print("\n" + "=" * 80)
        print("HIGHEST LEARNING VALUE RFIs (Score 4-5)")
        print("=" * 80)

        high_value = [r for r in successful if r.get('learning_value', {}).get('score', 0) >= 4]
        high_value.sort(key=lambda x: (x.get('learning_value', {}).get('score', 0), x['co_amount']), reverse=True)

        for r in high_value[:15]:
            lv = r.get('learning_value', {})
            act = r.get('actionability', {})
            summary = r.get('summary', {})

            print(f"\n${r['co_amount']:>12,.0f} | Score {lv.get('score')}/5 | {r['rfi_number']} ({r['project'][:25]})")
            print(f"  Summary: {summary.get('one_line', '')[:80]}")
            print(f"  Action: {act.get('specific_action', '')[:80]}")
            print(f"  Why: {lv.get('reasoning', '')[:100]}")

    finally:
        await conn.close()

    print("\n" + "=" * 80)
    print("SCORING COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
