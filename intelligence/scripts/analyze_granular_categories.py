#!/usr/bin/env python3
"""
Granular RFI categorization - drill down into specific issue types
to find patterns across projects regardless of project type.
"""

import asyncio
import os
import sys
import json
from pathlib import Path
from datetime import datetime
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg
from openai import AsyncOpenAI

REPORTS_DIR = Path(__file__).parent.parent / "reports"
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Granular issue taxonomy - specific enough to be actionable
ISSUE_TAXONOMY = """
DESIGN PHASE ISSUES:
- missing_detail: Specific detail/dimension not shown on drawings
- conflicting_drawings: Two drawings show different information
- design_omission: Entire system/element not designed
- code_oversight: Code requirement not addressed in design
- constructability_issue: Design impossible/impractical to build
- spec_conflict: Specification conflicts with drawings
- coordination_gap: Two disciplines not coordinated (MEP/Arch/Struct)

EXISTING CONDITIONS ISSUES:
- as_built_discrepancy: Field conditions differ from as-builts
- hidden_conditions: Unknown conditions discovered during demo
- existing_system_conflict: New work conflicts with existing systems
- survey_error: Site survey data was incorrect
- structural_capacity: Existing structure can't support new loads

FIELD EXECUTION ISSUES:
- installation_sequence: Work installed out of sequence
- trade_damage: One trade damaged another's work
- workmanship_defect: Work installed incorrectly
- material_substitution: Wrong material used
- layout_error: Work laid out in wrong location

COMMUNICATION ISSUES:
- scope_ambiguity: Unclear who is responsible for what
- submittal_gap: Submittal didn't match design intent
- rfi_response_delay: Late response caused rework
- owner_change: Owner requested change mid-construction
- verbal_direction: Verbal direction not documented

PROCUREMENT ISSUES:
- long_lead_item: Item not ordered early enough
- product_availability: Specified product unavailable
- budget_constraint: Value engineering required

REGULATORY ISSUES:
- permit_requirement: Permit authority required changes
- inspection_rejection: Inspector rejected installed work
- code_interpretation: Code interpreted differently than expected
- accessibility_compliance: ADA/accessibility issue
"""

CATEGORIZATION_PROMPT = """You are an expert construction analyst. Categorize this RFI into a SPECIFIC issue type.

RFI DETAILS:
- Project: {project} ({project_type})
- RFI Number: {rfi_number}
- Trade: {trade}
- CO Amount: ${co_amount:,.0f}
- Question: {question}
- Resolution: {resolution}
- AI Summary: {summary}

ISSUE TAXONOMY:
{taxonomy}

TASK:
1. Select the SINGLE most accurate issue type from the taxonomy above
2. Identify the SPECIFIC technical element involved (e.g., "conduit routing", "shear wall connection", "HVAC clearance")
3. Determine WHO should have caught this and WHEN

Return JSON:
{{
    "issue_category": "<category from taxonomy - use exact key like 'missing_detail', 'coordination_gap', etc.>",
    "issue_phase": "<design|existing_conditions|field_execution|communication|procurement|regulatory>",
    "technical_element": "<specific element like 'electrical conduit routing', 'structural embed locations', 'fire damper placement'>",
    "responsible_party": "<architect|structural_engineer|mep_engineer|gc_preconstruction|gc_field|subcontractor|owner>",
    "detection_point": "<schematic_design|design_development|cd_review|bid_phase|submittal_review|field_coordination|installation>",
    "could_bim_prevent": <true|false>,
    "could_site_survey_prevent": <true|false>,
    "could_early_trade_input_prevent": <true|false>,
    "one_line_lesson": "<specific actionable lesson in one sentence>",
    "prevention_checkpoint": "<when and how to catch this in future projects>"
}}

Be SPECIFIC. Don't use generic descriptions. Name the actual technical element and the actual prevention measure."""


async def categorize_rfi(rfi: dict, semaphore: asyncio.Semaphore) -> dict:
    """Categorize a single RFI with granular taxonomy."""
    async with semaphore:
        try:
            prompt = CATEGORIZATION_PROMPT.format(
                project=rfi['project'],
                project_type=rfi.get('project_type', 'Unknown'),
                rfi_number=rfi['rfi'],
                trade=rfi['trade'] or 'Not specified',
                co_amount=rfi['co_amount'],
                question=(rfi['question'] or '')[:2500],
                resolution=(rfi['resolution'] or 'No resolution')[:1500],
                summary=rfi.get('summary', ''),
                taxonomy=ISSUE_TAXONOMY
            )

            response = await client.chat.completions.create(
                model="gpt-4o",  # Using gpt-4o for better reasoning
                messages=[
                    {"role": "system", "content": "You are a construction expert who categorizes RFIs with precision. Be specific about technical elements and actionable about prevention."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=600,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            result['rfi'] = rfi['rfi']
            result['project'] = rfi['project']
            result['project_type'] = rfi.get('project_type', 'Unknown')
            result['co_amount'] = rfi['co_amount']
            result['trade'] = rfi['trade']
            result['question_preview'] = (rfi['question'] or '')[:150]
            result['success'] = True
            return result

        except Exception as e:
            return {
                'rfi': rfi['rfi'],
                'project': rfi['project'],
                'co_amount': rfi['co_amount'],
                'success': False,
                'error': str(e)
            }


async def main():
    print("=" * 100)
    print("GRANULAR RFI CATEGORIZATION - Top 10 per Project")
    print("=" * 100)

    # Project type mapping
    PROJECT_TYPES = {
        "CoreSite Data Center": "TI - Data Center",
        "Abbott Alameda Office TI": "TI - Office",
        "Intuitive Surgical MOB": "Medical Office Building",
        "Silicon Valley Office": "Hybrid - Existing Structure",
        "Southline Office": "Ground-Up Office",
    }

    # Load scoring data for summaries
    with open(REPORTS_DIR / 'impact_scoring_v2.json', 'r', encoding='utf-8') as f:
        scoring_data = json.load(f)

    score_lookup = {}
    for r in scoring_data.get('results', []):
        key = (r.get('project'), r.get('rfi_number'))
        score_lookup[key] = r

    # Connect to database
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Get RFIs by project
        rows = await conn.fetch('''
            SELECT id, source_ref, source_project_name, cost_impact,
                   question_text, resolution_text, trade_category
            FROM intelligence.items
            WHERE cost_impact > 0
            ORDER BY source_project_name, cost_impact DESC
        ''')

        # Group by project and get top 10 each
        by_project = {}
        for row in rows:
            proj = row['source_project_name']
            if proj not in by_project:
                by_project[proj] = []

            if len(by_project[proj]) < 10:
                key = (proj, row['source_ref'])
                scoring = score_lookup.get(key, {})

                by_project[proj].append({
                    'rfi': row['source_ref'],
                    'project': proj,
                    'project_type': PROJECT_TYPES.get(proj, 'Unknown'),
                    'trade': row['trade_category'],
                    'co_amount': float(row['cost_impact']),
                    'question': row['question_text'],
                    'resolution': row['resolution_text'],
                    'summary': scoring.get('summary', {}).get('one_line', ''),
                })

        # Flatten all RFIs
        all_rfis = []
        for proj, rfis in by_project.items():
            all_rfis.extend(rfis)

        print(f"\nCategorizing {len(all_rfis)} RFIs with granular taxonomy...")
        semaphore = asyncio.Semaphore(5)  # Lower concurrency for gpt-4o

        results = []
        for i in range(0, len(all_rfis), 5):
            batch = all_rfis[i:i+5]
            batch_results = await asyncio.gather(*[
                categorize_rfi(rfi, semaphore)
                for rfi in batch
            ])
            results.extend(batch_results)
            print(f"  {min(i+5, len(all_rfis))}/{len(all_rfis)}")

        successful = [r for r in results if r.get('success')]
        print(f"\nSuccessfully categorized: {len(successful)}/{len(all_rfis)}")

        # ========== ANALYSIS ==========

        # 1. By Issue Category
        print("\n" + "=" * 100)
        print("ANALYSIS BY ISSUE CATEGORY")
        print("=" * 100)

        by_category = defaultdict(lambda: {'count': 0, 'total_co': 0, 'rfis': []})
        for r in successful:
            cat = r.get('issue_category', 'unknown')
            by_category[cat]['count'] += 1
            by_category[cat]['total_co'] += r['co_amount']
            by_category[cat]['rfis'].append(r)

        sorted_cats = sorted(by_category.items(), key=lambda x: x[1]['total_co'], reverse=True)

        print(f"\n{'Category':<30} {'Count':>6} {'Total CO':>15} {'Avg CO':>12}")
        print("-" * 70)
        for cat, data in sorted_cats:
            avg = data['total_co'] / data['count'] if data['count'] > 0 else 0
            print(f"{cat:<30} {data['count']:>6} ${data['total_co']:>13,.0f} ${avg:>10,.0f}")

        # 2. By Issue Phase
        print("\n" + "=" * 100)
        print("ANALYSIS BY ISSUE PHASE")
        print("=" * 100)

        by_phase = defaultdict(lambda: {'count': 0, 'total_co': 0})
        for r in successful:
            phase = r.get('issue_phase', 'unknown')
            by_phase[phase]['count'] += 1
            by_phase[phase]['total_co'] += r['co_amount']

        sorted_phases = sorted(by_phase.items(), key=lambda x: x[1]['total_co'], reverse=True)
        total_co = sum(d['total_co'] for d in by_phase.values())

        print(f"\n{'Phase':<25} {'Count':>6} {'Total CO':>15} {'% of Total':>12}")
        print("-" * 60)
        for phase, data in sorted_phases:
            pct = (data['total_co'] / total_co * 100) if total_co > 0 else 0
            print(f"{phase:<25} {data['count']:>6} ${data['total_co']:>13,.0f} {pct:>10.1f}%")

        # 3. By Technical Element (grouped)
        print("\n" + "=" * 100)
        print("TOP TECHNICAL ELEMENTS BY CO")
        print("=" * 100)

        by_element = defaultdict(lambda: {'count': 0, 'total_co': 0, 'projects': set()})
        for r in successful:
            element = r.get('technical_element', 'unknown')
            by_element[element]['count'] += 1
            by_element[element]['total_co'] += r['co_amount']
            by_element[element]['projects'].add(r['project'])

        sorted_elements = sorted(by_element.items(), key=lambda x: x[1]['total_co'], reverse=True)[:20]

        print(f"\n{'Technical Element':<50} {'Count':>5} {'CO':>14} {'Projects':>3}")
        print("-" * 80)
        for element, data in sorted_elements:
            print(f"{element[:50]:<50} {data['count']:>5} ${data['total_co']:>12,.0f} {len(data['projects']):>3}")

        # 4. By Responsible Party
        print("\n" + "=" * 100)
        print("ANALYSIS BY RESPONSIBLE PARTY")
        print("=" * 100)

        by_party = defaultdict(lambda: {'count': 0, 'total_co': 0})
        for r in successful:
            party = r.get('responsible_party', 'unknown')
            by_party[party]['count'] += 1
            by_party[party]['total_co'] += r['co_amount']

        sorted_parties = sorted(by_party.items(), key=lambda x: x[1]['total_co'], reverse=True)

        print(f"\n{'Responsible Party':<25} {'Count':>6} {'Total CO':>15} {'% of Total':>12}")
        print("-" * 60)
        for party, data in sorted_parties:
            pct = (data['total_co'] / total_co * 100) if total_co > 0 else 0
            print(f"{party:<25} {data['count']:>6} ${data['total_co']:>13,.0f} {pct:>10.1f}%")

        # 5. By Detection Point
        print("\n" + "=" * 100)
        print("ANALYSIS BY DETECTION POINT (When issue was caught)")
        print("=" * 100)

        by_detection = defaultdict(lambda: {'count': 0, 'total_co': 0})
        for r in successful:
            detection = r.get('detection_point', 'unknown')
            by_detection[detection]['count'] += 1
            by_detection[detection]['total_co'] += r['co_amount']

        # Order by construction sequence
        detection_order = ['schematic_design', 'design_development', 'cd_review', 'bid_phase',
                          'submittal_review', 'field_coordination', 'installation', 'unknown']

        print(f"\n{'Detection Point':<25} {'Count':>6} {'Total CO':>15} {'Cumulative %':>12}")
        print("-" * 60)
        cumulative = 0
        for detection in detection_order:
            if detection in by_detection:
                data = by_detection[detection]
                cumulative += data['total_co']
                cum_pct = (cumulative / total_co * 100) if total_co > 0 else 0
                print(f"{detection:<25} {data['count']:>6} ${data['total_co']:>13,.0f} {cum_pct:>10.1f}%")

        # 6. Prevention Analysis
        print("\n" + "=" * 100)
        print("PREVENTION ANALYSIS")
        print("=" * 100)

        bim_preventable = [r for r in successful if r.get('could_bim_prevent')]
        survey_preventable = [r for r in successful if r.get('could_site_survey_prevent')]
        trade_preventable = [r for r in successful if r.get('could_early_trade_input_prevent')]

        bim_co = sum(r['co_amount'] for r in bim_preventable)
        survey_co = sum(r['co_amount'] for r in survey_preventable)
        trade_co = sum(r['co_amount'] for r in trade_preventable)

        print(f"\nPrevention Method              RFIs    Total CO        % of Total")
        print("-" * 70)
        print(f"BIM/Clash Detection            {len(bim_preventable):>4}    ${bim_co:>12,.0f}    {bim_co/total_co*100:>6.1f}%")
        print(f"Better Site Survey             {len(survey_preventable):>4}    ${survey_co:>12,.0f}    {survey_co/total_co*100:>6.1f}%")
        print(f"Early Trade Input              {len(trade_preventable):>4}    ${trade_co:>12,.0f}    {trade_co/total_co*100:>6.1f}%")

        # 7. Cross-Project Pattern Analysis
        print("\n" + "=" * 100)
        print("CROSS-PROJECT PATTERNS (Same issue across multiple projects)")
        print("=" * 100)

        # Group by issue category and see which appear in multiple projects
        category_projects = defaultdict(lambda: {'projects': set(), 'total_co': 0, 'rfis': []})
        for r in successful:
            cat = r.get('issue_category', 'unknown')
            category_projects[cat]['projects'].add(r['project'])
            category_projects[cat]['total_co'] += r['co_amount']
            category_projects[cat]['rfis'].append(r)

        # Filter to categories appearing in 2+ projects
        cross_project = {k: v for k, v in category_projects.items() if len(v['projects']) >= 2}
        sorted_cross = sorted(cross_project.items(), key=lambda x: x[1]['total_co'], reverse=True)

        print(f"\n{'Issue Category':<30} {'Projects':>3} {'Total CO':>14} Projects Affected")
        print("-" * 90)
        for cat, data in sorted_cross:
            proj_list = ', '.join(sorted([p[:15] for p in data['projects']]))
            print(f"{cat:<30} {len(data['projects']):>3} ${data['total_co']:>12,.0f}  {proj_list}")

        # 8. Detailed lessons by category
        print("\n" + "=" * 100)
        print("TOP LESSONS BY CATEGORY (Specific & Actionable)")
        print("=" * 100)

        for cat, data in sorted_cats[:8]:  # Top 8 categories
            print(f"\n{'-'*100}")
            print(f"{cat.upper()} (${data['total_co']:,.0f} across {data['count']} RFIs)")
            print(f"{'-'*100}")

            # Show top 3 by CO
            sorted_rfis = sorted(data['rfis'], key=lambda x: x['co_amount'], reverse=True)[:3]
            for r in sorted_rfis:
                print(f"\n  ${r['co_amount']:>10,.0f} | {r['rfi']} ({r['project'][:20]})")
                print(f"    Element: {r.get('technical_element', 'N/A')}")
                print(f"    Responsible: {r.get('responsible_party', 'N/A')} | Caught at: {r.get('detection_point', 'N/A')}")
                print(f"    Lesson: {r.get('one_line_lesson', 'N/A')[:90]}")
                print(f"    Prevention: {r.get('prevention_checkpoint', 'N/A')[:90]}")

        # Save results
        output = {
            'generated_at': datetime.now().isoformat(),
            'total_rfis': len(successful),
            'total_co': total_co,
            'by_category': {k: {'count': v['count'], 'total_co': v['total_co']} for k, v in sorted_cats},
            'by_phase': dict(by_phase),
            'by_responsible_party': dict(by_party),
            'by_detection_point': dict(by_detection),
            'prevention_analysis': {
                'bim_preventable': {'count': len(bim_preventable), 'co': bim_co},
                'survey_preventable': {'count': len(survey_preventable), 'co': survey_co},
                'trade_input_preventable': {'count': len(trade_preventable), 'co': trade_co},
            },
            'cross_project_patterns': {k: {'projects': list(v['projects']), 'total_co': v['total_co']}
                                       for k, v in sorted_cross},
            'results': successful
        }

        output_path = REPORTS_DIR / 'granular_categorization.json'
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        print(f"\n\nResults saved to: {output_path}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
