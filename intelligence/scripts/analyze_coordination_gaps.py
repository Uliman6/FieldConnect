#!/usr/bin/env python3
"""
Deep dive into coordination gaps - separate true design coordination
from existing conditions coordination.
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

PROJECT_TYPES = {
    "CoreSite Data Center": {"type": "TI", "existing_building": True},
    "Abbott Alameda Office TI": {"type": "TI", "existing_building": True},
    "Intuitive Surgical MOB": {"type": "MOB", "existing_building": False},  # Unclear
    "Silicon Valley Office": {"type": "Hybrid", "existing_building": True},
    "Southline Office": {"type": "Ground-Up", "existing_building": False},
}

COORDINATION_ANALYSIS_PROMPT = """Analyze this coordination-related RFI and classify the ROOT CAUSE precisely.

PROJECT CONTEXT:
- Project: {project}
- Project Type: {project_type}
- Existing Building: {existing_building}

RFI DETAILS:
- RFI Number: {rfi_number}
- Trade: {trade}
- CO Amount: ${co_amount:,.0f}
- Question: {question}
- Resolution: {resolution}

CLASSIFICATION TASK:
Determine the specific type of coordination failure:

1. NEW_TO_NEW_CLASH: Clash between two NEW design elements (e.g., new duct vs new conduit)
   - Both elements are being newly designed/installed
   - This is a pure design coordination failure between disciplines

2. NEW_TO_EXISTING_CLASH: Clash between NEW design and EXISTING conditions
   - New element conflicts with existing structure, MEP, or architectural elements
   - Could have been caught with better as-built documentation or site survey

3. DESIGN_SEQUENCE_ERROR: Elements designed without considering installation sequence
   - Design doesn't account for how things get built
   - E.g., can't install X because Y is in the way

4. DIMENSIONAL_COORDINATION: Dimensions/clearances not coordinated between drawings
   - Different drawings show different dimensions
   - Clearance requirements not met when designs combined

5. SCOPE_BOUNDARY_GAP: Gap at scope boundary between trades/disciplines
   - Nobody designed the interface between two systems
   - "I thought you had it" problem

6. DESIGN_CHANGE_CASCADE: Change in one discipline not flowed to others
   - Design changed but dependent designs not updated

Return JSON:
{{
    "coordination_type": "<NEW_TO_NEW_CLASH|NEW_TO_EXISTING_CLASH|DESIGN_SEQUENCE_ERROR|DIMENSIONAL_COORDINATION|SCOPE_BOUNDARY_GAP|DESIGN_CHANGE_CASCADE>",
    "confidence": "<high|medium|low>",
    "clashing_elements": {{
        "element_1": "<first element involved>",
        "element_1_status": "<new|existing>",
        "element_2": "<second element involved>",
        "element_2_status": "<new|existing>"
    }},
    "disciplines_involved": ["<list of disciplines: arch, struct, mech, elec, plumb, civil, etc>"],
    "why_not_caught_earlier": "<specific reason this wasn't caught in design>",
    "when_should_have_caught": "<specific design phase and review type>",
    "prevention_action": "<specific action for future projects>",
    "is_ti_specific": <true if this type of issue is unique to TI/renovation projects, false if could happen on ground-up too>
}}

Be precise. Read the RFI carefully to understand what ACTUALLY clashed and whether it involved existing conditions."""


async def analyze_coordination(rfi: dict, semaphore: asyncio.Semaphore) -> dict:
    """Analyze a coordination gap RFI in detail."""
    async with semaphore:
        try:
            proj_info = PROJECT_TYPES.get(rfi['project'], {'type': 'Unknown', 'existing_building': False})

            prompt = COORDINATION_ANALYSIS_PROMPT.format(
                project=rfi['project'],
                project_type=proj_info['type'],
                existing_building="Yes" if proj_info['existing_building'] else "No",
                rfi_number=rfi['rfi'],
                trade=rfi['trade'] or 'Not specified',
                co_amount=rfi['co_amount'],
                question=(rfi['question'] or '')[:3000],
                resolution=(rfi['resolution'] or 'No resolution')[:2000],
            )

            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a construction coordination expert. Analyze RFIs to understand the precise nature of coordination failures."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=700,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            result['rfi'] = rfi['rfi']
            result['project'] = rfi['project']
            result['project_type'] = proj_info['type']
            result['existing_building'] = proj_info['existing_building']
            result['co_amount'] = rfi['co_amount']
            result['trade'] = rfi['trade']
            result['question_preview'] = (rfi['question'] or '')[:200]
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
    print("COORDINATION GAP DEEP DIVE")
    print("=" * 100)

    # Load the granular categorization to get coordination_gap RFIs
    with open(REPORTS_DIR / 'granular_categorization.json', 'r', encoding='utf-8') as f:
        granular_data = json.load(f)

    # Get all coordination_gap RFIs
    coord_rfis = [r for r in granular_data['results'] if r.get('issue_category') == 'coordination_gap']

    print(f"\nFound {len(coord_rfis)} coordination_gap RFIs totaling ${sum(r['co_amount'] for r in coord_rfis):,.0f}")

    # We need the full question/resolution text, so fetch from DB
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Get full text for these RFIs - build WHERE clause
        rfi_refs = [(r['project'], r['rfi']) for r in coord_rfis]

        # Build conditions for each RFI
        conditions = []
        params = []
        for i, (proj, rfi) in enumerate(rfi_refs):
            conditions.append(f"(source_project_name = ${i*2+1} AND source_ref = ${i*2+2})")
            params.extend([proj, rfi])

        query = f'''
            SELECT source_ref, source_project_name, cost_impact,
                   question_text, resolution_text, trade_category
            FROM intelligence.items
            WHERE {" OR ".join(conditions)}
        '''

        rows = await conn.fetch(query, *params)

        # Build lookup
        rfi_lookup = {(row['source_project_name'], row['source_ref']): row for row in rows}

        # Enrich coord_rfis with full text
        enriched = []
        for r in coord_rfis:
            key = (r['project'], r['rfi'])
            if key in rfi_lookup:
                row = rfi_lookup[key]
                enriched.append({
                    'rfi': r['rfi'],
                    'project': r['project'],
                    'trade': row['trade_category'],
                    'co_amount': float(row['cost_impact']),
                    'question': row['question_text'],
                    'resolution': row['resolution_text'],
                })

        print(f"Enriched {len(enriched)} RFIs with full text")

        # Analyze each
        print(f"\nAnalyzing coordination failures in detail...")
        semaphore = asyncio.Semaphore(5)

        results = []
        for i in range(0, len(enriched), 5):
            batch = enriched[i:i+5]
            batch_results = await asyncio.gather(*[
                analyze_coordination(rfi, semaphore)
                for rfi in batch
            ])
            results.extend(batch_results)
            print(f"  {min(i+5, len(enriched))}/{len(enriched)}")

        successful = [r for r in results if r.get('success')]
        print(f"\nSuccessfully analyzed: {len(successful)}/{len(enriched)}")

        # ========== ANALYSIS ==========

        total_co = sum(r['co_amount'] for r in successful)

        # 1. By Coordination Type
        print("\n" + "=" * 100)
        print("COORDINATION FAILURE TYPES")
        print("=" * 100)

        by_type = defaultdict(lambda: {'count': 0, 'total_co': 0, 'rfis': []})
        for r in successful:
            ctype = r.get('coordination_type', 'UNKNOWN')
            by_type[ctype]['count'] += 1
            by_type[ctype]['total_co'] += r['co_amount']
            by_type[ctype]['rfis'].append(r)

        sorted_types = sorted(by_type.items(), key=lambda x: x[1]['total_co'], reverse=True)

        print(f"\n{'Coordination Type':<30} {'Count':>5} {'Total CO':>15} {'% of Total':>10}")
        print("-" * 65)
        for ctype, data in sorted_types:
            pct = (data['total_co'] / total_co * 100) if total_co > 0 else 0
            print(f"{ctype:<30} {data['count']:>5} ${data['total_co']:>13,.0f} {pct:>8.1f}%")

        # 2. Existing vs New Analysis
        print("\n" + "=" * 100)
        print("EXISTING CONDITIONS vs NEW DESIGN COORDINATION")
        print("=" * 100)

        # Check how many involve existing conditions
        existing_involved = []
        new_only = []

        for r in successful:
            clashing = r.get('clashing_elements', {})
            e1_status = clashing.get('element_1_status', '').lower()
            e2_status = clashing.get('element_2_status', '').lower()

            if 'existing' in e1_status or 'existing' in e2_status:
                existing_involved.append(r)
            else:
                new_only.append(r)

        existing_co = sum(r['co_amount'] for r in existing_involved)
        new_co = sum(r['co_amount'] for r in new_only)

        print(f"\nInvolves Existing Conditions: {len(existing_involved)} RFIs, ${existing_co:,.0f} ({existing_co/total_co*100:.1f}%)")
        print(f"New-to-New Design Only:       {len(new_only)} RFIs, ${new_co:,.0f} ({new_co/total_co*100:.1f}%)")

        # 3. Break down by project
        print("\n" + "-" * 100)
        print("BY PROJECT:")
        print("-" * 100)

        for proj in PROJECT_TYPES.keys():
            proj_rfis = [r for r in successful if r['project'] == proj]
            if not proj_rfis:
                continue

            proj_existing = [r for r in proj_rfis if r in existing_involved]
            proj_new = [r for r in proj_rfis if r in new_only]

            proj_total = sum(r['co_amount'] for r in proj_rfis)
            existing_total = sum(r['co_amount'] for r in proj_existing)
            new_total = sum(r['co_amount'] for r in proj_new)

            proj_info = PROJECT_TYPES[proj]
            print(f"\n{proj} ({proj_info['type']}, Existing: {proj_info['existing_building']})")
            print(f"  Total: ${proj_total:,.0f} across {len(proj_rfis)} RFIs")
            if proj_total > 0:
                print(f"  - Existing conditions involved: {len(proj_existing)} RFIs, ${existing_total:,.0f} ({existing_total/proj_total*100:.1f}%)")
                print(f"  - New-to-new design only:       {len(proj_new)} RFIs, ${new_total:,.0f} ({new_total/proj_total*100:.1f}%)")

        # 4. TI-specific analysis
        print("\n" + "=" * 100)
        print("TI-SPECIFIC vs UNIVERSAL COORDINATION ISSUES")
        print("=" * 100)

        ti_specific = [r for r in successful if r.get('is_ti_specific')]
        universal = [r for r in successful if not r.get('is_ti_specific')]

        ti_co = sum(r['co_amount'] for r in ti_specific)
        univ_co = sum(r['co_amount'] for r in universal)

        print(f"\nTI/Renovation Specific: {len(ti_specific)} RFIs, ${ti_co:,.0f} ({ti_co/total_co*100:.1f}%)")
        print(f"Universal (any project): {len(universal)} RFIs, ${univ_co:,.0f} ({univ_co/total_co*100:.1f}%)")

        # 5. Disciplines involved
        print("\n" + "=" * 100)
        print("DISCIPLINES INVOLVED IN COORDINATION FAILURES")
        print("=" * 100)

        discipline_pairs = defaultdict(lambda: {'count': 0, 'total_co': 0})
        for r in successful:
            disciplines = r.get('disciplines_involved', [])
            if len(disciplines) >= 2:
                # Sort to create consistent pair key
                pair = tuple(sorted(disciplines[:2]))
                discipline_pairs[pair]['count'] += 1
                discipline_pairs[pair]['total_co'] += r['co_amount']

        sorted_pairs = sorted(discipline_pairs.items(), key=lambda x: x[1]['total_co'], reverse=True)

        print(f"\n{'Discipline Pair':<40} {'Count':>5} {'Total CO':>15}")
        print("-" * 65)
        for pair, data in sorted_pairs[:10]:
            pair_str = f"{pair[0]} <-> {pair[1]}"
            print(f"{pair_str:<40} {data['count']:>5} ${data['total_co']:>13,.0f}")

        # 6. Detailed breakdown by type
        print("\n" + "=" * 100)
        print("DETAILED BREAKDOWN BY COORDINATION TYPE")
        print("=" * 100)

        for ctype, data in sorted_types:
            print(f"\n{'-'*100}")
            print(f"{ctype} (${data['total_co']:,.0f} across {data['count']} RFIs)")
            print(f"{'-'*100}")

            # Show each RFI
            sorted_rfis = sorted(data['rfis'], key=lambda x: x['co_amount'], reverse=True)
            for r in sorted_rfis:
                clashing = r.get('clashing_elements', {})
                e1 = clashing.get('element_1', 'N/A')
                e1_stat = clashing.get('element_1_status', '')
                e2 = clashing.get('element_2', 'N/A')
                e2_stat = clashing.get('element_2_status', '')

                ti_tag = "[TI-SPECIFIC]" if r.get('is_ti_specific') else "[UNIVERSAL]"

                print(f"\n  ${r['co_amount']:>12,.0f} | {r['rfi']} ({r['project'][:20]}) {ti_tag}")
                print(f"    Clash: {e1} ({e1_stat}) vs {e2} ({e2_stat})")
                print(f"    Disciplines: {', '.join(r.get('disciplines_involved', []))}")
                print(f"    Why not caught: {r.get('why_not_caught_earlier', 'N/A')[:80]}")
                print(f"    Should have caught at: {r.get('when_should_have_caught', 'N/A')[:60]}")

        # 7. Excluding CoreSite - what do we see?
        print("\n" + "=" * 100)
        print("EXCLUDING CORESITE (Potential Outlier)")
        print("=" * 100)

        non_coresite = [r for r in successful if r['project'] != 'CoreSite Data Center']
        nc_total = sum(r['co_amount'] for r in non_coresite)

        nc_by_type = defaultdict(lambda: {'count': 0, 'total_co': 0})
        for r in non_coresite:
            ctype = r.get('coordination_type', 'UNKNOWN')
            nc_by_type[ctype]['count'] += 1
            nc_by_type[ctype]['total_co'] += r['co_amount']

        nc_sorted = sorted(nc_by_type.items(), key=lambda x: x[1]['total_co'], reverse=True)

        print(f"\nWithout CoreSite: {len(non_coresite)} RFIs, ${nc_total:,.0f}")
        print(f"\n{'Coordination Type':<30} {'Count':>5} {'Total CO':>15} {'% of Total':>10}")
        print("-" * 65)
        for ctype, data in nc_sorted:
            pct = (data['total_co'] / nc_total * 100) if nc_total > 0 else 0
            print(f"{ctype:<30} {data['count']:>5} ${data['total_co']:>13,.0f} {pct:>8.1f}%")

        # Existing vs new without CoreSite
        nc_existing = [r for r in non_coresite if r in existing_involved]
        nc_new = [r for r in non_coresite if r in new_only]
        nc_existing_co = sum(r['co_amount'] for r in nc_existing)
        nc_new_co = sum(r['co_amount'] for r in nc_new)

        print(f"\nWithout CoreSite - Existing vs New:")
        print(f"  Existing involved: {len(nc_existing)} RFIs, ${nc_existing_co:,.0f} ({nc_existing_co/nc_total*100:.1f}%)")
        print(f"  New-to-new only:   {len(nc_new)} RFIs, ${nc_new_co:,.0f} ({nc_new_co/nc_total*100:.1f}%)")

        # Save results
        output = {
            'generated_at': datetime.now().isoformat(),
            'total_rfis': len(successful),
            'total_co': total_co,
            'by_coordination_type': {k: {'count': v['count'], 'total_co': v['total_co']} for k, v in sorted_types},
            'existing_conditions_analysis': {
                'existing_involved': {'count': len(existing_involved), 'co': existing_co},
                'new_only': {'count': len(new_only), 'co': new_co},
            },
            'ti_specific_analysis': {
                'ti_specific': {'count': len(ti_specific), 'co': ti_co},
                'universal': {'count': len(universal), 'co': univ_co},
            },
            'excluding_coresite': {
                'total_rfis': len(non_coresite),
                'total_co': nc_total,
                'existing_involved': {'count': len(nc_existing), 'co': nc_existing_co},
                'new_only': {'count': len(nc_new), 'co': nc_new_co},
            },
            'results': successful
        }

        output_path = REPORTS_DIR / 'coordination_deep_dive.json'
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        print(f"\n\nResults saved to: {output_path}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
