#!/usr/bin/env python3
"""
Enrich RFIs missing root cause - targeted script for RFIs with cost impact.
Uses GPT-4o-mini for speed and cost efficiency.
"""

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
from openai import OpenAI

client = OpenAI()

ROOT_CAUSES = [
    "Design Coordination",
    "Incomplete Design",
    "Existing Conditions",
    "Means & Methods",
    "Owner / Program Change",
    "Code / Regulatory",
    "Vendor / Product Constraint",
    "Construction Error",
    "Unknown"
]

SYSTEMS = [
    "Structural",
    "Mechanical",
    "Electrical",
    "Plumbing",
    "Fire Protection",
    "Civil / Site",
    "Architectural",
    "Envelope",
    "Interiors",
    "Other"
]


def analyze_rfi(raw_text: str, summary: str = "") -> dict:
    """Use LLM to determine root cause and system."""

    prompt = f"""Analyze this RFI and determine:
1. Root Cause - select ONE from: {', '.join(ROOT_CAUSES)}
2. System - select ONE from: {', '.join(SYSTEMS)}

RFI Text:
{raw_text[:2000]}

{f"Summary: {summary}" if summary else ""}

Respond in JSON format:
{{"root_cause": "...", "system": "...", "confidence": "High/Medium/Low"}}
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=100,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        return {
            'llm_cause': result.get('root_cause', 'Unknown'),
            'llm_system': result.get('system', 'Other'),
            'llm_confidence': result.get('confidence', 'Medium')
        }
    except Exception as e:
        print(f"  Error: {e}")
        return None


async def main():
    print("=" * 70)
    print("ENRICH MISSING ROOT CAUSES")
    print("=" * 70)

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Get RFIs with cost but missing root cause
        rfis = await conn.fetch("""
            SELECT id, source_ref, source_project_name, cost_impact,
                   raw_text, abstracted_summary, metadata
            FROM intelligence.items
            WHERE cost_impact > 0
            ORDER BY cost_impact DESC
        """)

        # Filter to those missing root cause
        to_enrich = []
        for r in rfis:
            has_cause = False
            if r['metadata']:
                try:
                    meta = json.loads(r['metadata'])
                    if meta.get('llm_cause'):
                        has_cause = True
                except:
                    pass

            if not has_cause:
                to_enrich.append(r)

        print(f"Found {len(to_enrich)} RFIs missing root cause")
        print(f"Total cost impact: ${sum(float(r['cost_impact']) for r in to_enrich):,.0f}")

        # Process each
        enriched = 0
        errors = 0

        for i, rfi in enumerate(to_enrich):
            print(f"\n[{i+1}/{len(to_enrich)}] {rfi['source_ref']} @ {rfi['source_project_name']} (${float(rfi['cost_impact']):,.0f})")

            # Get analysis
            result = analyze_rfi(
                rfi['raw_text'] or '',
                rfi['abstracted_summary'] or ''
            )

            if not result:
                errors += 1
                continue

            print(f"  -> {result['llm_cause']} / {result['llm_system']}")

            # Update metadata
            existing_meta = {}
            if rfi['metadata']:
                try:
                    existing_meta = json.loads(rfi['metadata'])
                except:
                    pass

            existing_meta.update(result)

            await conn.execute("""
                UPDATE intelligence.items
                SET metadata = $1
                WHERE id = $2
            """, json.dumps(existing_meta), rfi['id'])

            enriched += 1

        print("\n" + "=" * 70)
        print(f"COMPLETE: Enriched {enriched}, Errors {errors}")
        print("=" * 70)

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
