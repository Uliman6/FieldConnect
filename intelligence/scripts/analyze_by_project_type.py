#!/usr/bin/env python3
"""
Analyze RFIs by project type to identify project-specific vs. broadly applicable lessons.

Project Types:
- CoreSite Data Center: TI (Data Center)
- Abbott Alameda Office TI: TI (Office)
- Intuitive Surgical MOB: Medical Office Building (unclear if new/renovation)
- Silicon Valley Office: Office with existing structural steel
- Southline Office: Ground-up new construction
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
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Project type definitions
PROJECT_TYPES = {
    "CoreSite Data Center": {
        "type": "TI",
        "subtype": "Data Center",
        "description": "Tenant improvement in existing building for data center use",
        "characteristics": "High electrical loads, cooling requirements, raised floors, redundancy requirements"
    },
    "Abbott Alameda Office TI": {
        "type": "TI",
        "subtype": "Office",
        "description": "Tenant improvement in existing office building",
        "characteristics": "Working within existing conditions, demolition of existing finishes, coordination with base building systems"
    },
    "Intuitive Surgical MOB": {
        "type": "MOB",
        "subtype": "Medical Office Building",
        "description": "Medical office building - potentially renovation or new construction",
        "characteristics": "Medical-grade finishes, specialized MEP, ADA compliance critical, infection control considerations"
    },
    "Silicon Valley Office": {
        "type": "Hybrid",
        "subtype": "Office with Existing Structure",
        "description": "Office building incorporating existing structural steel",
        "characteristics": "Working with existing structure, potential as-built discrepancies, coordination with existing conditions"
    },
    "Southline Office": {
        "type": "Ground-Up",
        "subtype": "Office",
        "description": "New ground-up office construction",
        "characteristics": "New foundations, structural frame, all-new systems, typical new construction coordination"
    }
}

CLASSIFICATION_PROMPT = """Analyze this RFI and classify whether the issue is SPECIFIC to this project type or BROADLY APPLICABLE across all construction projects.

PROJECT INFO:
- Project: {project}
- Project Type: {project_type}
- Subtype: {subtype}
- Project Characteristics: {characteristics}

RFI DETAILS:
- RFI Number: {rfi_number}
- Trade: {trade}
- CO Amount: ${co_amount:,.0f}
- Question: {question}
- Resolution: {resolution}
- AI Summary: {summary}
- Root Cause: {root_cause}

CLASSIFICATION TASK:
Determine if this RFI's lesson is:

1. PROJECT-TYPE SPECIFIC: The issue is unique to or significantly more likely in this project type
   Examples for each type:
   - Data Center TI: Electrical capacity issues, cooling conflicts, raised floor coordination
   - Office TI: Existing condition surprises, demo scope issues, base building coordination
   - MOB: Medical gas, ADA compliance in clinical spaces, infection control
   - Ground-Up: Foundation issues, new structural coordination, site conditions
   - Hybrid/Existing Structure: As-built discrepancies, structural tie-ins, phasing

2. BROADLY APPLICABLE: The issue could happen on any project type
   Examples: Fire rating issues, code compliance, general coordination failures, design documentation gaps

Return JSON:
{{
    "classification": "<project_type_specific|broadly_applicable>",
    "confidence": "<high|medium|low>",
    "reasoning": "<why this classification - be specific about what makes it unique or universal>",
    "applicable_to": ["<list of project types this applies to>"],
    "key_lesson": "<the transferable lesson in one sentence>",
    "prevention_action": "<specific action to prevent this>"
}}

Be thoughtful - some issues SEEM project-specific but are actually common patterns."""


async def classify_rfi(rfi: dict, project_info: dict, semaphore: asyncio.Semaphore) -> dict:
    """Classify a single RFI."""
    async with semaphore:
        try:
            prompt = CLASSIFICATION_PROMPT.format(
                project=rfi['project'],
                project_type=project_info['type'],
                subtype=project_info['subtype'],
                characteristics=project_info['characteristics'],
                rfi_number=rfi['rfi'],
                trade=rfi['trade'] or 'Not specified',
                co_amount=rfi['co_amount'],
                question=(rfi['question'] or '')[:2000],
                resolution=(rfi['resolution'] or 'No resolution')[:1000],
                summary=rfi.get('summary', {}).get('one_line', ''),
                root_cause=rfi.get('root_cause', {}).get('root_cause', '')
            )

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a construction analyst classifying RFIs by applicability. Be thoughtful about what's truly project-type-specific vs. broadly applicable."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                max_tokens=500,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            result['rfi'] = rfi['rfi']
            result['project'] = rfi['project']
            result['co_amount'] = rfi['co_amount']
            result['trade'] = rfi['trade']
            result['question_preview'] = (rfi['question'] or '')[:200]
            result['original_summary'] = rfi.get('summary', {}).get('one_line', '')
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
    print("PROJECT TYPE ANALYSIS - Top 10 RFIs per Project")
    print("=" * 100)

    # Load scoring data
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
                    'trade': row['trade_category'],
                    'co_amount': float(row['cost_impact']),
                    'question': row['question_text'],
                    'resolution': row['resolution_text'],
                    'summary': scoring.get('summary', {}),
                    'root_cause': scoring.get('root_cause_clarity', {}),
                })

        # Print project summaries
        print("\nPROJECT TYPES:")
        for proj, info in PROJECT_TYPES.items():
            if proj in by_project:
                total_co = sum(r['co_amount'] for r in by_project[proj])
                print(f"\n  {proj}")
                print(f"    Type: {info['type']} - {info['subtype']}")
                print(f"    Top 10 CO: ${total_co:,.0f}")

        # Classify all RFIs
        all_rfis = []
        for proj, rfis in by_project.items():
            all_rfis.extend(rfis)

        print(f"\nClassifying {len(all_rfis)} RFIs...")
        semaphore = asyncio.Semaphore(10)

        results = []
        for i in range(0, len(all_rfis), 10):
            batch = all_rfis[i:i+10]
            batch_results = await asyncio.gather(*[
                classify_rfi(rfi, PROJECT_TYPES.get(rfi['project'], {
                    'type': 'Unknown', 'subtype': 'Unknown', 'characteristics': ''
                }), semaphore)
                for rfi in batch
            ])
            results.extend(batch_results)
            print(f"  {min(i+10, len(all_rfis))}/{len(all_rfis)}")

        successful = [r for r in results if r.get('success')]

        # Analyze by project
        print("\n" + "=" * 100)

        for proj in PROJECT_TYPES.keys():
            if proj not in by_project:
                continue

            proj_results = [r for r in successful if r['project'] == proj]
            if not proj_results:
                continue

            info = PROJECT_TYPES[proj]
            total_co = sum(r['co_amount'] for r in proj_results)

            specific = [r for r in proj_results if r.get('classification') == 'project_type_specific']
            broad = [r for r in proj_results if r.get('classification') == 'broadly_applicable']

            specific_co = sum(r['co_amount'] for r in specific)
            broad_co = sum(r['co_amount'] for r in broad)

            print(f"\n{'='*100}")
            print(f"{proj}")
            print(f"{'='*100}")
            print(f"Type: {info['type']} - {info['subtype']}")
            print(f"Description: {info['description']}")
            print(f"\nTop 10 RFIs Total: ${total_co:,.0f}")
            print(f"  Project-Type Specific: {len(specific)} RFIs, ${specific_co:,.0f} ({specific_co/total_co*100:.1f}%)")
            print(f"  Broadly Applicable: {len(broad)} RFIs, ${broad_co:,.0f} ({broad_co/total_co*100:.1f}%)")

            # Show each RFI
            print(f"\n{'-'*100}")
            print("TOP 10 RFIs DETAILED ANALYSIS:")
            print(f"{'-'*100}")

            for r in sorted(proj_results, key=lambda x: x['co_amount'], reverse=True):
                classification = r.get('classification', 'unknown')
                tag = "[SPECIFIC]" if classification == 'project_type_specific' else "[BROAD]"
                confidence = r.get('confidence', '')

                print(f"\n{tag} {r['rfi']} - ${r['co_amount']:,.0f} (Confidence: {confidence})")
                print(f"  Trade: {r.get('trade', 'N/A')}")
                print(f"  Summary: {r.get('original_summary', '')[:80]}")
                print(f"  Reasoning: {r.get('reasoning', '')[:120]}")
                print(f"  Key Lesson: {r.get('key_lesson', '')[:100]}")
                print(f"  Applies To: {', '.join(r.get('applicable_to', []))}")

        # Overall summary
        print("\n" + "=" * 100)
        print("OVERALL SUMMARY")
        print("=" * 100)

        all_specific = [r for r in successful if r.get('classification') == 'project_type_specific']
        all_broad = [r for r in successful if r.get('classification') == 'broadly_applicable']

        total_all = sum(r['co_amount'] for r in successful)
        specific_total = sum(r['co_amount'] for r in all_specific)
        broad_total = sum(r['co_amount'] for r in all_broad)

        print(f"\nAcross all {len(successful)} top RFIs (${total_all:,.0f} total):")
        print(f"  Project-Type Specific: {len(all_specific)} RFIs, ${specific_total:,.0f} ({specific_total/total_all*100:.1f}%)")
        print(f"  Broadly Applicable: {len(all_broad)} RFIs, ${broad_total:,.0f} ({broad_total/total_all*100:.1f}%)")

        # By project type
        print("\n" + "-" * 100)
        print("BREAKDOWN BY PROJECT TYPE:")
        print("-" * 100)

        for ptype in ['TI', 'Ground-Up', 'MOB', 'Hybrid']:
            type_projects = [p for p, info in PROJECT_TYPES.items() if info['type'] == ptype]
            type_results = [r for r in successful if r['project'] in type_projects]

            if not type_results:
                continue

            type_specific = [r for r in type_results if r.get('classification') == 'project_type_specific']
            type_broad = [r for r in type_results if r.get('classification') == 'broadly_applicable']

            type_total = sum(r['co_amount'] for r in type_results)
            spec_total = sum(r['co_amount'] for r in type_specific)

            print(f"\n{ptype}:")
            print(f"  Projects: {', '.join(type_projects)}")
            print(f"  Total CO: ${type_total:,.0f}")
            print(f"  Specific: {len(type_specific)} ({spec_total/type_total*100:.1f}%)")
            print(f"  Broad: {len(type_broad)} ({(type_total-spec_total)/type_total*100:.1f}%)")

        # Broad lessons summary
        print("\n" + "=" * 100)
        print("BROADLY APPLICABLE LESSONS (sorted by CO)")
        print("=" * 100)

        for r in sorted(all_broad, key=lambda x: x['co_amount'], reverse=True)[:15]:
            print(f"\n${r['co_amount']:>12,.0f} | {r['rfi']} ({r['project'][:20]})")
            print(f"  Lesson: {r.get('key_lesson', '')[:90]}")
            print(f"  Action: {r.get('prevention_action', '')[:90]}")

        # Project-specific lessons
        print("\n" + "=" * 100)
        print("PROJECT-TYPE SPECIFIC LESSONS (sorted by CO)")
        print("=" * 100)

        for r in sorted(all_specific, key=lambda x: x['co_amount'], reverse=True)[:15]:
            ptype = PROJECT_TYPES.get(r['project'], {}).get('type', 'Unknown')
            print(f"\n${r['co_amount']:>12,.0f} | {r['rfi']} ({r['project'][:20]}) [{ptype}]")
            print(f"  Lesson: {r.get('key_lesson', '')[:90]}")
            print(f"  Why Specific: {r.get('reasoning', '')[:90]}")

        # Save results
        output = {
            'generated_at': datetime.now().isoformat(),
            'project_types': PROJECT_TYPES,
            'total_rfis': len(successful),
            'total_co': total_all,
            'specific_count': len(all_specific),
            'specific_co': specific_total,
            'broad_count': len(all_broad),
            'broad_co': broad_total,
            'results': successful
        }

        output_path = REPORTS_DIR / 'project_type_analysis.json'
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        print(f"\nResults saved to: {output_path}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
