#!/usr/bin/env python3
"""Review top costliest RFIs and their learning scores."""

import asyncio
import os
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg

REPORTS_DIR = Path(__file__).parent.parent / "reports"


async def main():
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))

    # Load scoring data
    with open(REPORTS_DIR / 'impact_scoring_v2.json', 'r', encoding='utf-8') as f:
        scoring = json.load(f)

    # Create scoring lookup
    score_lookup = {}
    for result in scoring['results']:
        key = (result['project'], result['rfi_number'])
        score_lookup[key] = result

    # Get all RFIs with CO amounts
    rows = await conn.fetch('''
        SELECT id, source_ref, source_project_name, cost_impact,
               question_text, resolution_text, trade_category
        FROM intelligence.items
        WHERE cost_impact > 0
        ORDER BY cost_impact DESC
    ''')

    print("=" * 90)
    print("TOP 10 COSTLIEST RFIs - DETAILED REVIEW")
    print("=" * 90)

    for i, row in enumerate(rows[:10]):
        key = (row['source_project_name'], row['source_ref'])
        scoring_data = score_lookup.get(key, {})

        lv = scoring_data.get('learning_value', {})
        app = scoring_data.get('applicability_scope', {})
        act = scoring_data.get('actionability', {})
        rc = scoring_data.get('root_cause_clarity', {})
        summary = scoring_data.get('summary', {})

        print(f"\n{'='*90}")
        print(f"#{i+1} | ${float(row['cost_impact']):,.0f}")
        print(f"{'='*90}")
        print(f"RFI: {row['source_ref']}")
        print(f"Project: {row['source_project_name']}")
        print(f"Trade: {row['trade_category'] or 'Not specified'}")
        print(f"\nCURRENT SCORE: {lv.get('score', 'N/A')}")
        print(f"  Reasoning: {lv.get('reasoning', 'N/A')[:200]}")
        print(f"\nApplicability: {app.get('level', 'N/A')}")
        print(f"Actionability: {act.get('level', 'N/A')}")
        print(f"  Action: {act.get('specific_action', 'N/A')[:100]}")
        print(f"Root Cause: {rc.get('level', 'N/A')}")
        print(f"  Cause: {rc.get('root_cause', 'N/A')[:100]}")
        print(f"\nSummary: {summary.get('one_line', 'N/A')}")
        print(f"\nQUESTION:")
        print(f"  {(row['question_text'] or '')[:500]}...")
        print(f"\nRESOLUTION:")
        print(f"  {(row['resolution_text'] or 'N/A')[:300]}...")

    # Low-scored but high-CO RFIs
    print("\n\n" + "=" * 90)
    print("LOW SCORE BUT HIGH CO (Score <= 3 AND CO > $50K)")
    print("=" * 90)

    low_score_high_co = []
    for row in rows:
        key = (row['source_project_name'], row['source_ref'])
        scoring_data = score_lookup.get(key, {})
        score = scoring_data.get('learning_value', {}).get('score', 0)
        co = float(row['cost_impact'])

        if score <= 3 and co > 50000:
            low_score_high_co.append({
                'row': row,
                'scoring': scoring_data,
                'score': score,
                'co': co
            })

    for item in sorted(low_score_high_co, key=lambda x: x['co'], reverse=True):
        row = item['row']
        scoring_data = item['scoring']

        lv = scoring_data.get('learning_value', {})
        summary = scoring_data.get('summary', {})

        print(f"\n{'='*90}")
        print(f"${item['co']:,.0f} | Score {item['score']} | {row['source_ref']} ({row['source_project_name']})")
        print(f"{'='*90}")
        print(f"Reasoning: {lv.get('reasoning', 'N/A')[:200]}")
        print(f"Summary: {summary.get('one_line', 'N/A')}")
        print(f"\nQUESTION:")
        print(f"  {(row['question_text'] or '')[:400]}...")

    # Top 5 per project
    print("\n\n" + "=" * 90)
    print("TOP 5 COSTLIEST RFIs PER PROJECT")
    print("=" * 90)

    projects = {}
    for row in rows:
        p = row['source_project_name']
        if p not in projects:
            projects[p] = []
        projects[p].append(row)

    for project, rfis in sorted(projects.items()):
        print(f"\n\n{'='*90}")
        print(f"PROJECT: {project}")
        print(f"{'='*90}")

        total_co = sum(float(r['cost_impact']) for r in rfis)
        print(f"Total CO: ${total_co:,.0f} across {len(rfis)} RFIs")

        for i, row in enumerate(rfis[:5]):
            key = (row['source_project_name'], row['source_ref'])
            scoring_data = score_lookup.get(key, {})

            lv = scoring_data.get('learning_value', {})
            app = scoring_data.get('applicability_scope', {})
            act = scoring_data.get('actionability', {})
            rc = scoring_data.get('root_cause_clarity', {})
            summary = scoring_data.get('summary', {})

            print(f"\n  #{i+1} | ${float(row['cost_impact']):,.0f} | Score: {lv.get('score', 'N/A')}")
            print(f"  RFI: {row['source_ref']} | Trade: {row['trade_category'] or 'N/A'}")
            print(f"  Summary: {summary.get('one_line', 'N/A')[:80]}")
            print(f"  Applicability: {app.get('level', 'N/A')} | Actionability: {act.get('level', 'N/A')} | Root Cause: {rc.get('level', 'N/A')}")
            print(f"  Action: {act.get('specific_action', 'N/A')[:80]}")
            print(f"  Question: {(row['question_text'] or '')[:200]}...")

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
