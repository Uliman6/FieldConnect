#!/usr/bin/env python3
"""Correlate learning scores with CO amounts."""

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

    # Get CO amounts from database
    rows = await conn.fetch('''
        SELECT source_ref, source_project_name, cost_impact
        FROM intelligence.items
        WHERE cost_impact > 0
    ''')

    co_lookup = {(r['source_project_name'], r['source_ref']): float(r['cost_impact']) for r in rows}

    print(f'RFIs with CO amounts in database: {len(co_lookup)}')
    print()

    # Match with scoring
    score_to_cos = {5: [], 4.5: [], 4: [], 3: [], 2: [], 1: []}

    for result in scoring['results']:
        key = (result['project'], result['rfi_number'])
        if key in co_lookup:
            score = result.get('learning_value', {}).get('score', 0)
            if score in score_to_cos:
                score_to_cos[score].append({
                    'rfi': result['rfi_number'],
                    'project': result['project'],
                    'co_amount': co_lookup[key],
                    'summary': result.get('summary', {}).get('one_line', '')[:60],
                    'impact': result.get('impact_severity', 'unknown')
                })

    print('=' * 70)
    print('CO AMOUNT BY LEARNING SCORE')
    print('=' * 70)

    for score in [5, 4.5, 4, 3, 2, 1]:
        items = score_to_cos[score]
        if items:
            total = sum(i['co_amount'] for i in items)
            avg = total / len(items)
            max_co = max(i['co_amount'] for i in items)
            print(f'\nScore {score}: {len(items)} RFIs with CO data')
            print(f'  Total CO: ${total:,.0f}')
            print(f'  Average: ${avg:,.0f}')
            print(f'  Maximum: ${max_co:,.0f}')
            print(f'  Top by CO amount:')
            top = sorted(items, key=lambda x: x['co_amount'], reverse=True)[:5]
            for t in top:
                print(f'    ${t["co_amount"]:>12,.0f} | {t["rfi"]:12} | {t["summary"]}')
        else:
            print(f'\nScore {score}: No RFIs with CO data')

    # Summary correlation
    print('\n' + '=' * 70)
    print('CORRELATION SUMMARY')
    print('=' * 70)

    all_with_co = []
    for score, items in score_to_cos.items():
        for item in items:
            item['score'] = score
            all_with_co.append(item)

    # Calculate average CO by score bucket
    print('\nAverage CO Amount by Score Bucket:')
    high_scores = [i for i in all_with_co if i['score'] >= 4.5]
    mid_scores = [i for i in all_with_co if 3 <= i['score'] < 4.5]
    low_scores = [i for i in all_with_co if i['score'] < 3]

    if high_scores:
        avg_high = sum(i['co_amount'] for i in high_scores) / len(high_scores)
        print(f'  Score 4.5-5 (High Learning): ${avg_high:,.0f} avg ({len(high_scores)} RFIs)')
    if mid_scores:
        avg_mid = sum(i['co_amount'] for i in mid_scores) / len(mid_scores)
        print(f'  Score 3-4 (Medium Learning): ${avg_mid:,.0f} avg ({len(mid_scores)} RFIs)')
    if low_scores:
        avg_low = sum(i['co_amount'] for i in low_scores) / len(low_scores)
        print(f'  Score 1-2 (Low Learning): ${avg_low:,.0f} avg ({len(low_scores)} RFIs)')

    # Top 10 COs and their scores
    print('\n' + '=' * 70)
    print('TOP 10 HIGHEST-VALUE CHANGE ORDERS')
    print('=' * 70)

    top_10 = sorted(all_with_co, key=lambda x: x['co_amount'], reverse=True)[:10]
    for t in top_10:
        print(f'\n${t["co_amount"]:>12,.0f} | Score {t["score"]} | {t["rfi"]} ({t["project"][:20]})')
        print(f'  {t["summary"]}')

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
