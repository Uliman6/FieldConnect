#!/usr/bin/env python3
"""
Comprehensive trend analysis of costly RFIs.

Analyzes:
1. Trade/scope distribution
2. Keyword extraction and clustering
3. Root cause patterns (workflow/design/process)
4. Cost driver analysis
5. Project phase patterns
6. Actionability themes
"""

import asyncio
import os
import sys
import json
import re
from pathlib import Path
from collections import defaultdict, Counter
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg

REPORTS_DIR = Path(__file__).parent.parent / "reports"


def extract_keywords(text: str) -> list[str]:
    """Extract meaningful keywords from RFI text."""
    if not text:
        return []

    text = text.lower()

    # Key construction terms to look for
    keyword_patterns = [
        # Structural
        r'\b(pt[- ]?cable|post[- ]?tension|rebar|reinforc|concrete|slab|shear[- ]?wall|foundation|footing|beam|column|embed|anchor|dowel)\b',
        # Fire/Safety
        r'\b(fire[- ]?rat|fire[- ]?stop|smoke[- ]?barrier|egress|exit|safety|sprinkler|alarm|fireproof)\b',
        # MEP
        r'\b(electrical|plumb|hvac|mechanic|duct|conduit|pipe|drain|water|sewer)\b',
        # Architectural
        r'\b(wall|ceiling|floor|door|window|glazing|curtain[- ]?wall|facade|roof|waterproof|flash)\b',
        # Issues
        r'\b(crack|spall|leak|damage|fail|defect|error|miss|wrong|incorrect|violat|non[- ]?compli)\b',
        # Actions
        r'\b(rework|remediat|repair|replace|demo|remove|reinstall|core|cut|patch)\b',
        # Codes
        r'\b(ada|ibc|nfpa|code|inspector|permit|compliance)\b',
        # Coordination
        r'\b(clash|conflict|coordinat|clearance|tolerance|alignment|layout)\b',
    ]

    keywords = []
    for pattern in keyword_patterns:
        matches = re.findall(pattern, text)
        keywords.extend(matches)

    return keywords


def categorize_issue(question: str, summary: dict, root_cause: dict) -> dict:
    """Categorize the issue type based on RFI content and LLM analysis."""
    q = (question or '').lower()
    lesson_type = summary.get('lesson_type', '')
    rc = (root_cause.get('root_cause', '') or '').lower()

    categories = {
        'structural': False,
        'fire_life_safety': False,
        'waterproofing': False,
        'code_compliance': False,
        'coordination': False,
        'design_error': False,
        'field_error': False,
        'existing_conditions': False,
        'scope_change': False,
    }

    # Structural
    if any(kw in q for kw in ['pt cable', 'post-tension', 'rebar', 'shear wall', 'structural', 'concrete', 'crack', 'spall', 'embed', 'anchor', 'dowel', 'foundation']):
        categories['structural'] = True

    # Fire/Life Safety
    if any(kw in q for kw in ['fire', 'smoke', 'egress', 'exit', 'sprinkler', 'life safety', 'fireproof', 'fire rating', 'fire rated']):
        categories['fire_life_safety'] = True

    # Waterproofing
    if any(kw in q for kw in ['water intrusion', 'leak', 'waterproof', 'moisture', 'flash', 'seal', 'water damage', 'flooding']):
        categories['waterproofing'] = True

    # Code compliance
    if any(kw in q for kw in ['ada', 'code', 'compliance', 'inspector', 'violation', 'non-compliant', 'ibc', 'nfpa']):
        categories['code_compliance'] = True
    if lesson_type in ['code_violation', 'safety_issue']:
        categories['code_compliance'] = True

    # Coordination
    if any(kw in q for kw in ['clash', 'conflict', 'coordinat', 'clearance', 'between', 'interference']):
        categories['coordination'] = True
    if lesson_type == 'coordination_gap':
        categories['coordination'] = True

    # Design error
    if any(kw in q for kw in ['not shown', 'missing', 'omit', 'design', 'drawing', 'spec']):
        categories['design_error'] = True
    if lesson_type == 'design_error':
        categories['design_error'] = True

    # Field error
    if any(kw in q for kw in ['installed wrong', 'incorrect', 'misalign', 'out of tolerance', 'field', 'already installed']):
        categories['field_error'] = True
    if 'damage_occurred' in lesson_type or 'installed' in rc:
        categories['field_error'] = True

    # Existing conditions
    if any(kw in q for kw in ['existing', 'as-built', 'field condition', 'discovered', 'found']):
        categories['existing_conditions'] = True
    if lesson_type == 'field_discovery':
        categories['existing_conditions'] = True

    # Scope change
    if any(kw in q for kw in ['scope', 'addition', 'change order', 'owner request', 'add']):
        categories['scope_change'] = True
    if lesson_type == 'scope_change':
        categories['scope_change'] = True

    return categories


def identify_process_phase(action_phase: str, question: str) -> str:
    """Identify which project phase the issue relates to."""
    q = (question or '').lower()

    if action_phase:
        return action_phase

    if any(kw in q for kw in ['shop drawing', 'submittal', 'design', 'specification', 'drawing']):
        return 'design'
    if any(kw in q for kw in ['pour', 'install', 'construct', 'build', 'place', 'erect']):
        return 'construction'
    if any(kw in q for kw in ['inspect', 'punch', 'closeout', 'final']):
        return 'closeout'
    if any(kw in q for kw in ['bid', 'estimat', 'precon']):
        return 'preconstruction'

    return 'construction'  # Default


async def main():
    print("=" * 100)
    print("COSTLY RFI TREND ANALYSIS")
    print("=" * 100)

    # Load scoring data
    with open(REPORTS_DIR / 'impact_scoring_v2.json', 'r', encoding='utf-8') as f:
        scoring_data = json.load(f)

    # Create scoring lookup
    score_lookup = {}
    for r in scoring_data.get('results', []):
        key = (r.get('project'), r.get('rfi_number'))
        score_lookup[key] = r

    # Connect to database
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Get all costly RFIs
        rows = await conn.fetch('''
            SELECT id, source_ref, source_project_name, cost_impact,
                   question_text, resolution_text, trade_category
            FROM intelligence.items
            WHERE cost_impact > 0
            ORDER BY cost_impact DESC
        ''')

        print(f"\nTotal RFIs with CO amount: {len(rows)}")
        total_co = sum(float(r['cost_impact']) for r in rows)
        print(f"Total CO amount: ${total_co:,.0f}")

        # Prepare analysis data
        rfis = []
        for row in rows:
            key = (row['source_project_name'], row['source_ref'])
            scoring = score_lookup.get(key, {})

            rfis.append({
                'rfi': row['source_ref'],
                'project': row['source_project_name'],
                'trade': row['trade_category'],
                'co_amount': float(row['cost_impact']),
                'question': row['question_text'],
                'resolution': row['resolution_text'],
                'score': scoring.get('learning_value', {}).get('score'),
                'summary': scoring.get('summary', {}),
                'root_cause': scoring.get('root_cause_clarity', {}),
                'actionability': scoring.get('actionability', {}),
                'applicability': scoring.get('applicability_scope', {}),
            })

        # ============================================================
        # ANALYSIS 1: BY TRADE/SCOPE
        # ============================================================
        print("\n" + "=" * 100)
        print("ANALYSIS 1: COST BY TRADE/SCOPE")
        print("=" * 100)

        by_trade = defaultdict(lambda: {'count': 0, 'total_co': 0, 'rfis': []})
        for rfi in rfis:
            trade = rfi['trade'] or 'Not Specified'
            by_trade[trade]['count'] += 1
            by_trade[trade]['total_co'] += rfi['co_amount']
            by_trade[trade]['rfis'].append(rfi)

        sorted_trades = sorted(by_trade.items(), key=lambda x: x[1]['total_co'], reverse=True)

        print(f"\n{'Trade':<30} {'Count':>8} {'Total CO':>15} {'Avg CO':>12} {'% of Total':>10}")
        print("-" * 80)
        for trade, data in sorted_trades[:15]:
            avg = data['total_co'] / data['count'] if data['count'] > 0 else 0
            pct = (data['total_co'] / total_co * 100) if total_co > 0 else 0
            print(f"{trade[:30]:<30} {data['count']:>8} ${data['total_co']:>13,.0f} ${avg:>10,.0f} {pct:>9.1f}%")

        # ============================================================
        # ANALYSIS 2: ISSUE CATEGORY CLUSTERING
        # ============================================================
        print("\n" + "=" * 100)
        print("ANALYSIS 2: ISSUE CATEGORY CLUSTERING")
        print("=" * 100)

        category_stats = defaultdict(lambda: {'count': 0, 'total_co': 0, 'examples': []})

        for rfi in rfis:
            categories = categorize_issue(rfi['question'], rfi['summary'], rfi['root_cause'])
            for cat, is_present in categories.items():
                if is_present:
                    category_stats[cat]['count'] += 1
                    category_stats[cat]['total_co'] += rfi['co_amount']
                    if len(category_stats[cat]['examples']) < 5:
                        category_stats[cat]['examples'].append({
                            'rfi': rfi['rfi'],
                            'project': rfi['project'],
                            'co': rfi['co_amount'],
                            'summary': rfi['summary'].get('one_line', '')[:80]
                        })

        sorted_cats = sorted(category_stats.items(), key=lambda x: x[1]['total_co'], reverse=True)

        print(f"\n{'Category':<25} {'Count':>8} {'Total CO':>15} {'Avg CO':>12}")
        print("-" * 65)
        for cat, data in sorted_cats:
            avg = data['total_co'] / data['count'] if data['count'] > 0 else 0
            print(f"{cat:<25} {data['count']:>8} ${data['total_co']:>13,.0f} ${avg:>10,.0f}")

        # Show top examples for each category
        print("\n" + "-" * 100)
        print("TOP EXAMPLES BY CATEGORY")
        print("-" * 100)

        for cat, data in sorted_cats[:6]:
            print(f"\n{cat.upper().replace('_', ' ')} (${data['total_co']:,.0f} total)")
            for ex in sorted(data['examples'], key=lambda x: x['co'], reverse=True)[:3]:
                print(f"  ${ex['co']:>10,.0f} | {ex['rfi']} ({ex['project'][:20]})")
                print(f"              {ex['summary']}")

        # ============================================================
        # ANALYSIS 3: KEYWORD EXTRACTION & THEMES
        # ============================================================
        print("\n" + "=" * 100)
        print("ANALYSIS 3: KEYWORD THEMES")
        print("=" * 100)

        keyword_costs = defaultdict(lambda: {'count': 0, 'total_co': 0})

        for rfi in rfis:
            keywords = extract_keywords(rfi['question'])
            for kw in set(keywords):  # Dedupe per RFI
                keyword_costs[kw]['count'] += 1
                keyword_costs[kw]['total_co'] += rfi['co_amount']

        # Sort by total CO
        sorted_keywords = sorted(keyword_costs.items(), key=lambda x: x[1]['total_co'], reverse=True)

        print(f"\n{'Keyword':<20} {'Count':>8} {'Total CO':>15} {'Avg CO':>12}")
        print("-" * 60)
        for kw, data in sorted_keywords[:25]:
            avg = data['total_co'] / data['count'] if data['count'] > 0 else 0
            print(f"{kw:<20} {data['count']:>8} ${data['total_co']:>13,.0f} ${avg:>10,.0f}")

        # ============================================================
        # ANALYSIS 4: ROOT CAUSE PATTERNS (from LLM analysis)
        # ============================================================
        print("\n" + "=" * 100)
        print("ANALYSIS 4: ROOT CAUSE PATTERNS (LLM Analysis)")
        print("=" * 100)

        # Extract root cause themes
        root_cause_themes = defaultdict(lambda: {'count': 0, 'total_co': 0, 'examples': []})

        for rfi in rfis:
            rc = rfi['root_cause'].get('root_cause', '') or ''

            # Classify root cause
            rc_lower = rc.lower()

            themes = []
            if any(kw in rc_lower for kw in ['design', 'drawing', 'plan', 'spec', 'detail', 'shown']):
                themes.append('design_documentation')
            if any(kw in rc_lower for kw in ['coordinat', 'between', 'trade', 'clash', 'conflict']):
                themes.append('trade_coordination')
            if any(kw in rc_lower for kw in ['install', 'field', 'construct', 'place', 'built']):
                themes.append('field_execution')
            if any(kw in rc_lower for kw in ['review', 'check', 'verif', 'inspect', 'catch']):
                themes.append('quality_control')
            if any(kw in rc_lower for kw in ['existing', 'as-built', 'condition', 'discover']):
                themes.append('existing_conditions')
            if any(kw in rc_lower for kw in ['communi', 'unclear', 'misunderst', 'interpret']):
                themes.append('communication')
            if any(kw in rc_lower for kw in ['code', 'compliance', 'requirement', 'standard']):
                themes.append('code_requirements')
            if any(kw in rc_lower for kw in ['sequence', 'timing', 'schedule', 'phase']):
                themes.append('sequencing')

            if not themes:
                themes = ['other']

            for theme in themes:
                root_cause_themes[theme]['count'] += 1
                root_cause_themes[theme]['total_co'] += rfi['co_amount']
                if len(root_cause_themes[theme]['examples']) < 3:
                    root_cause_themes[theme]['examples'].append({
                        'rfi': rfi['rfi'],
                        'co': rfi['co_amount'],
                        'cause': rc[:100]
                    })

        sorted_rc = sorted(root_cause_themes.items(), key=lambda x: x[1]['total_co'], reverse=True)

        print(f"\n{'Root Cause Theme':<25} {'Count':>8} {'Total CO':>15} {'Avg CO':>12}")
        print("-" * 65)
        for theme, data in sorted_rc:
            avg = data['total_co'] / data['count'] if data['count'] > 0 else 0
            print(f"{theme:<25} {data['count']:>8} ${data['total_co']:>13,.0f} ${avg:>10,.0f}")

        # ============================================================
        # ANALYSIS 5: ACTIONABILITY / PREVENTION PHASES
        # ============================================================
        print("\n" + "=" * 100)
        print("ANALYSIS 5: PREVENTION PHASE ANALYSIS")
        print("=" * 100)

        phase_stats = defaultdict(lambda: {'count': 0, 'total_co': 0, 'actions': []})

        for rfi in rfis:
            phase = rfi['actionability'].get('action_phase', '')
            if not phase:
                phase = identify_process_phase(phase, rfi['question'])

            phase_stats[phase]['count'] += 1
            phase_stats[phase]['total_co'] += rfi['co_amount']

            action = rfi['actionability'].get('specific_action', '')
            if action and len(phase_stats[phase]['actions']) < 10:
                phase_stats[phase]['actions'].append(action)

        sorted_phases = sorted(phase_stats.items(), key=lambda x: x[1]['total_co'], reverse=True)

        print(f"\n{'Prevention Phase':<20} {'Count':>8} {'Total CO':>15} {'Avg CO':>12}")
        print("-" * 60)
        for phase, data in sorted_phases:
            avg = data['total_co'] / data['count'] if data['count'] > 0 else 0
            print(f"{phase:<20} {data['count']:>8} ${data['total_co']:>13,.0f} ${avg:>10,.0f}")

        print("\nTOP ACTIONS BY PHASE:")
        for phase, data in sorted_phases[:4]:
            print(f"\n{phase.upper()}:")
            action_counts = Counter(data['actions'])
            for action, count in action_counts.most_common(3):
                print(f"  - {action[:90]}")

        # ============================================================
        # ANALYSIS 6: HIGH-COST DEEP DIVE (Top 50)
        # ============================================================
        print("\n" + "=" * 100)
        print("ANALYSIS 6: TOP 50 COSTLIEST RFIs - DETAILED PATTERNS")
        print("=" * 100)

        top_50 = sorted(rfis, key=lambda x: x['co_amount'], reverse=True)[:50]

        # Aggregate patterns in top 50
        top_categories = defaultdict(int)
        top_keywords = defaultdict(int)
        top_root_causes = []

        for rfi in top_50:
            cats = categorize_issue(rfi['question'], rfi['summary'], rfi['root_cause'])
            for cat, present in cats.items():
                if present:
                    top_categories[cat] += 1

            for kw in set(extract_keywords(rfi['question'])):
                top_keywords[kw] += 1

            rc = rfi['root_cause'].get('root_cause', '')
            if rc:
                top_root_causes.append(rc)

        print("\nCategory prevalence in Top 50:")
        for cat, count in sorted(top_categories.items(), key=lambda x: x[1], reverse=True):
            pct = count / 50 * 100
            bar = '#' * int(pct / 2)
            print(f"  {cat:<25} {count:>3} ({pct:>5.1f}%) {bar}")

        print("\nTop keywords in Top 50:")
        for kw, count in sorted(top_keywords.items(), key=lambda x: x[1], reverse=True)[:15]:
            print(f"  {kw:<20} {count:>3} occurrences")

        # ============================================================
        # ANALYSIS 7: PROJECT-SPECIFIC PATTERNS
        # ============================================================
        print("\n" + "=" * 100)
        print("ANALYSIS 7: PROJECT-SPECIFIC PATTERNS")
        print("=" * 100)

        by_project = defaultdict(lambda: {
            'count': 0, 'total_co': 0, 'categories': defaultdict(int),
            'keywords': defaultdict(int), 'top_issues': []
        })

        for rfi in rfis:
            proj = rfi['project']
            by_project[proj]['count'] += 1
            by_project[proj]['total_co'] += rfi['co_amount']

            cats = categorize_issue(rfi['question'], rfi['summary'], rfi['root_cause'])
            for cat, present in cats.items():
                if present:
                    by_project[proj]['categories'][cat] += 1

            for kw in set(extract_keywords(rfi['question'])):
                by_project[proj]['keywords'][kw] += 1

            if len(by_project[proj]['top_issues']) < 5:
                by_project[proj]['top_issues'].append({
                    'rfi': rfi['rfi'],
                    'co': rfi['co_amount'],
                    'summary': rfi['summary'].get('one_line', '')[:60]
                })

        for proj, data in sorted(by_project.items(), key=lambda x: x[1]['total_co'], reverse=True):
            print(f"\n{'='*80}")
            print(f"{proj}")
            print(f"{'='*80}")
            print(f"RFIs: {data['count']} | Total CO: ${data['total_co']:,.0f} | Avg: ${data['total_co']/data['count']:,.0f}")

            print("\nTop Categories:")
            for cat, count in sorted(data['categories'].items(), key=lambda x: x[1], reverse=True)[:5]:
                pct = count / data['count'] * 100
                print(f"  {cat:<25} {count:>3} ({pct:>5.1f}%)")

            print("\nTop Keywords:")
            top_kw = sorted(data['keywords'].items(), key=lambda x: x[1], reverse=True)[:8]
            print(f"  {', '.join([f'{kw}({c})' for kw, c in top_kw])}")

            print("\nTop Issues:")
            for issue in sorted(data['top_issues'], key=lambda x: x['co'], reverse=True)[:3]:
                print(f"  ${issue['co']:>10,.0f} | {issue['rfi']}: {issue['summary']}")

        # ============================================================
        # ANALYSIS 8: SCORE 5 PATTERN ANALYSIS
        # ============================================================
        print("\n" + "=" * 100)
        print("ANALYSIS 8: SCORE 5 (CRITICAL) PATTERN ANALYSIS")
        print("=" * 100)

        score_5_rfis = [r for r in rfis if r['score'] == 5]

        if score_5_rfis:
            print(f"\nScore 5 RFIs: {len(score_5_rfis)}")
            print(f"Total CO: ${sum(r['co_amount'] for r in score_5_rfis):,.0f}")

            s5_categories = defaultdict(int)
            s5_keywords = defaultdict(int)
            s5_lesson_types = defaultdict(int)

            for rfi in score_5_rfis:
                cats = categorize_issue(rfi['question'], rfi['summary'], rfi['root_cause'])
                for cat, present in cats.items():
                    if present:
                        s5_categories[cat] += 1

                for kw in set(extract_keywords(rfi['question'])):
                    s5_keywords[kw] += 1

                lt = rfi['summary'].get('lesson_type', 'unknown')
                s5_lesson_types[lt] += 1

            print("\nLesson Types:")
            for lt, count in sorted(s5_lesson_types.items(), key=lambda x: x[1], reverse=True):
                pct = count / len(score_5_rfis) * 100
                print(f"  {lt:<30} {count:>3} ({pct:>5.1f}%)")

            print("\nCategories:")
            for cat, count in sorted(s5_categories.items(), key=lambda x: x[1], reverse=True):
                pct = count / len(score_5_rfis) * 100
                print(f"  {cat:<25} {count:>3} ({pct:>5.1f}%)")

            print("\nTop Keywords:")
            for kw, count in sorted(s5_keywords.items(), key=lambda x: x[1], reverse=True)[:15]:
                print(f"  {kw:<20} {count:>3}")

        # ============================================================
        # SUMMARY: KEY FINDINGS
        # ============================================================
        print("\n" + "=" * 100)
        print("SUMMARY: KEY FINDINGS & RECOMMENDATIONS")
        print("=" * 100)

        print("""
Based on the analysis of {} RFIs totaling ${:,.0f} in change orders:

TOP COST DRIVERS:
""".format(len(rfis), total_co))

        # Top 3 categories by cost
        for i, (cat, data) in enumerate(sorted_cats[:3], 1):
            pct = data['total_co'] / total_co * 100
            print(f"  {i}. {cat.upper().replace('_', ' ')}: ${data['total_co']:,.0f} ({pct:.1f}% of total)")

        print("\nKEY PATTERNS IDENTIFIED:")

        # Analyze patterns
        if sorted_keywords[0][1]['total_co'] > total_co * 0.1:
            print(f"  - '{sorted_keywords[0][0]}' appears in ${sorted_keywords[0][1]['total_co']:,.0f} worth of COs")

        if sorted_rc[0][1]['total_co'] > total_co * 0.1:
            print(f"  - Root cause '{sorted_rc[0][0]}' accounts for ${sorted_rc[0][1]['total_co']:,.0f}")

        # Save detailed results
        results = {
            'generated_at': datetime.now().isoformat(),
            'total_rfis': len(rfis),
            'total_co': total_co,
            'by_trade': {k: {'count': v['count'], 'total_co': v['total_co']} for k, v in sorted_trades},
            'by_category': {k: {'count': v['count'], 'total_co': v['total_co']} for k, v in sorted_cats},
            'by_keyword': {k: v for k, v in sorted_keywords[:30]},
            'by_root_cause': {k: {'count': v['count'], 'total_co': v['total_co']} for k, v in sorted_rc},
            'by_phase': {k: {'count': v['count'], 'total_co': v['total_co']} for k, v in sorted_phases},
            'by_project': {k: {'count': v['count'], 'total_co': v['total_co']} for k, v in by_project.items()},
        }

        output_path = REPORTS_DIR / 'trend_analysis.json'
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)

        print(f"\nDetailed results saved to: {output_path}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
