#!/usr/bin/env python3
"""
Detailed view of drywall RFIs and their change orders.
Shows full RFI text to verify subcategory accuracy.
"""

import asyncio
import os
import sys
from pathlib import Path
from collections import defaultdict
import re

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg

# Subcategories to analyze
SUBCATEGORIES = {
    "rated_wall_assembly": {
        "name": "Rated Wall Assembly",
        "keywords": ["fire rated", "1-hour", "2-hour", "ul assembly", "rated wall",
                     "shaft wall", "smoke partition", "sound rated", "stc", "fire rating"]
    },
    "mep_penetration_framing": {
        "name": "MEP Penetration Framing",
        "keywords": ["penetration", "duct opening", "grille", "diffuser", "access panel",
                     "sleeve", "chase", "pipe penetration", "exhaust", "transfer grille",
                     "conduit pathway", "conduit", "access door"]
    },
    "door_opening_framing": {
        "name": "Door/Opening Framing",
        "keywords": ["door frame", "door framing", "header", "rough opening", "ro dimension",
                     "door buck", "hm frame", "hollow metal", "door jamb", "opening size",
                     "door height", "door width"]
    },
    "wall_structure_alignment": {
        "name": "Wall-to-Structure Alignment",
        "keywords": ["curb", "slab edge", "not align", "offset from", "wall location",
                     "shear wall", "concrete wall", "protrudes into", "wall position",
                     "existing condition", "as-built", "field condition"]
    },
    "pony_partial_height": {
        "name": "Pony Walls/Partial Height",
        "keywords": ["pony wall", "low wall", "partial height", "half wall", "counter height",
                     "transaction counter", "knee wall", "countertop", "die wall"]
    }
}


def matches_category(text: str, category_id: str) -> bool:
    """Check if text matches a category."""
    text_lower = text.lower()
    keywords = SUBCATEGORIES[category_id]["keywords"]
    return any(kw.lower() in text_lower for kw in keywords)


async def main():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        for cat_id, cat_info in SUBCATEGORIES.items():
            print("\n" + "=" * 80)
            print(f"CATEGORY: {cat_info['name'].upper()}")
            print("=" * 80)

            # Build keyword search
            keyword_conditions = " OR ".join([
                f"question_text ILIKE '%{kw}%'" for kw in cat_info["keywords"][:5]
            ])

            # Get RFIs that resulted in COs for this category
            query = f"""
                SELECT
                    source_ref,
                    source_project_name,
                    question_text,
                    raw_text,
                    resolution_text,
                    resulted_in_co,
                    cost_impact
                FROM intelligence.items
                WHERE (trade_category ILIKE '%drywall%'
                   OR question_text ILIKE '%drywall%'
                   OR question_text ILIKE '%framing%'
                   OR question_text ILIKE '%gypsum%'
                   OR question_text ILIKE '%stud%')
                  AND resulted_in_co = true
                  AND ({keyword_conditions})
                ORDER BY source_project_name, source_ref
            """

            rows = await conn.fetch(query)

            if not rows:
                print("\nNo change order RFIs found for this category.")
                continue

            # Group by project and show one per project
            by_project = defaultdict(list)
            for r in rows:
                by_project[r["source_project_name"]].append(r)

            print(f"\nFound {len(rows)} RFIs with COs across {len(by_project)} projects")

            for project, rfis in by_project.items():
                print("\n" + "-" * 80)
                print(f"PROJECT: {project}")
                print("-" * 80)

                # Show first RFI from this project
                rfi = rfis[0]
                text = rfi["question_text"] or rfi["raw_text"] or ""
                resolution = rfi["resolution_text"] or "No resolution recorded"

                print(f"\nRFI NUMBER: {rfi['source_ref']}")
                print(f"RESULTED IN CO: Yes")
                print(f"COST IMPACT: ${rfi['cost_impact']:,.0f}" if rfi['cost_impact'] else "COST IMPACT: Not recorded")

                print(f"\nFULL RFI TEXT:")
                print("-" * 40)
                # Clean and wrap text
                clean_text = re.sub(r'\s+', ' ', text).strip()
                # Print in chunks for readability
                for i in range(0, len(clean_text), 100):
                    print(clean_text[i:i+100])

                print(f"\nRESOLUTION/RESPONSE:")
                print("-" * 40)
                clean_res = re.sub(r'\s+', ' ', resolution).strip()[:500]
                for i in range(0, len(clean_res), 100):
                    print(clean_res[i:i+100])

                if len(rfis) > 1:
                    print(f"\n(+{len(rfis)-1} more COs in this project for this category)")

            # Also show non-CO RFIs to compare
            print("\n" + "-" * 80)
            print("SAMPLE NON-CO RFIs (for comparison):")
            print("-" * 80)

            query_non_co = f"""
                SELECT
                    source_ref,
                    source_project_name,
                    SUBSTRING(question_text, 1, 300) as text
                FROM intelligence.items
                WHERE (trade_category ILIKE '%drywall%'
                   OR question_text ILIKE '%drywall%'
                   OR question_text ILIKE '%framing%')
                  AND (resulted_in_co = false OR resulted_in_co IS NULL)
                  AND ({keyword_conditions})
                LIMIT 2
            """
            non_co_rows = await conn.fetch(query_non_co)
            for r in non_co_rows:
                print(f"\n[{r['source_ref']}] {r['source_project_name']}")
                print(f"  {r['text']}...")

        # Also check if there are separate CO records
        print("\n" + "=" * 80)
        print("CHECKING FOR SEPARATE CHANGE ORDER RECORDS")
        print("=" * 80)

        # Look for CO mentions in RFI text
        co_mentions = await conn.fetch("""
            SELECT source_ref, source_project_name,
                   SUBSTRING(question_text, 1, 500) as text
            FROM intelligence.items
            WHERE (question_text ILIKE '%PCO%'
               OR question_text ILIKE '%change order%'
               OR question_text ILIKE '%COR %'
               OR question_text ILIKE '%CO #%')
              AND (question_text ILIKE '%drywall%'
               OR question_text ILIKE '%framing%')
            LIMIT 5
        """)

        if co_mentions:
            print("\nRFIs that mention specific CO/PCO numbers:")
            for r in co_mentions:
                print(f"\n[{r['source_ref']}] {r['source_project_name']}")
                text = re.sub(r'\s+', ' ', r['text'] or '').strip()
                print(f"  {text}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
