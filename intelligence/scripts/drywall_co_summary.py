#!/usr/bin/env python3
"""
Final summary of drywall framing COs with full details.
"""

import asyncio
import os
import sys
import re
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg

SUBCATEGORIES = {
    "rated_wall": {
        "name": "Rated Wall Assembly",
        "keywords": ["fire rated", "1-hour", "2-hour", "shaft wall", "smoke", "stc", "sound rated", "ul assembly"]
    },
    "mep_penetration": {
        "name": "MEP Penetration Framing",
        "keywords": ["penetration", "access panel", "grille", "diffuser", "duct", "conduit", "sleeve", "chase"]
    },
    "door_opening": {
        "name": "Door/Opening Framing",
        "keywords": ["door frame", "header", "rough opening", "door height", "door jamb", "hm frame"]
    },
    "wall_alignment": {
        "name": "Wall-to-Structure Alignment",
        "keywords": ["slab edge", "curb", "existing", "as-built", "not align", "offset", "shear wall"]
    },
    "pony_wall": {
        "name": "Pony Walls/Partial Height",
        "keywords": ["pony wall", "low wall", "partial height", "counter", "die wall", "half wall"]
    }
}


def categorize(text: str) -> str:
    text_lower = text.lower()
    for cat_id, info in SUBCATEGORIES.items():
        if any(kw in text_lower for kw in info["keywords"]):
            return cat_id
    return "other"


def extract_costs(text: str) -> list:
    """Extract dollar amounts from text."""
    amounts = re.findall(r'\$[\d,]+(?:\.\d{2})?[kK]?', text)
    return amounts


async def main():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Get all drywall COs with full details
        rows = await conn.fetch("""
            SELECT
                source_ref,
                source_project_name,
                question_text,
                resolution_text,
                trade_category
            FROM intelligence.items
            WHERE resulted_in_co = true
              AND (trade_category ILIKE '%drywall%'
                OR question_text ILIKE '%drywall%'
                OR question_text ILIKE '%framing%'
                OR question_text ILIKE '%gypsum%'
                OR question_text ILIKE '%stud%'
                OR question_text ILIKE '%gyp%')
            ORDER BY source_project_name, source_ref
        """)

        print("=" * 90)
        print("DRYWALL/FRAMING RFIs THAT RESULTED IN CHANGE ORDERS")
        print("Full details by subcategory")
        print("=" * 90)

        # Group by category
        by_category = defaultdict(list)
        for r in rows:
            text = r["question_text"] or ""
            cat = categorize(text)
            by_category[cat].append(r)

        # Print each category
        for cat_id, info in SUBCATEGORIES.items():
            rfis = by_category.get(cat_id, [])
            if not rfis:
                continue

            print(f"\n{'#' * 90}")
            print(f"# {info['name'].upper()}")
            print(f"# {len(rfis)} RFIs resulted in Change Orders")
            print(f"{'#' * 90}")

            # Group by project
            by_project = defaultdict(list)
            for r in rfis:
                by_project[r["source_project_name"]].append(r)

            for project, proj_rfis in by_project.items():
                print(f"\n{'='*90}")
                print(f"PROJECT: {project}")
                print(f"{'='*90}")

                for rfi in proj_rfis[:2]:  # Show up to 2 per project
                    q_text = rfi["question_text"] or "No question text"
                    r_text = rfi["resolution_text"] or "No resolution"

                    # Clean text
                    q_text = re.sub(r'\s+', ' ', q_text).strip()
                    r_text = re.sub(r'\s+', ' ', r_text).strip()

                    # Extract any costs mentioned
                    all_text = q_text + " " + r_text
                    costs = extract_costs(all_text)

                    print(f"\n{'-'*90}")
                    print(f"RFI: {rfi['source_ref']}")
                    print(f"Trade: {rfi['trade_category'] or 'Not specified'}")
                    if costs:
                        print(f"Cost Estimates Mentioned: {', '.join(costs)}")
                    print(f"{'-'*90}")

                    print(f"\nQUESTION:")
                    # Wrap text
                    for i in range(0, len(q_text), 85):
                        print(f"  {q_text[i:i+85]}")

                    print(f"\nRESOLUTION:")
                    r_preview = r_text[:400] + "..." if len(r_text) > 400 else r_text
                    for i in range(0, len(r_preview), 85):
                        print(f"  {r_preview[i:i+85]}")

                if len(proj_rfis) > 2:
                    print(f"\n  ... and {len(proj_rfis) - 2} more COs in this project")

        # Summary
        print(f"\n\n{'=' * 90}")
        print("SUMMARY BY CATEGORY")
        print("=" * 90)
        print(f"\n{'Category':<35} {'COs':>8} {'Projects':>10}")
        print("-" * 55)

        for cat_id, info in SUBCATEGORIES.items():
            rfis = by_category.get(cat_id, [])
            projects = len(set(r["source_project_name"] for r in rfis))
            print(f"{info['name']:<35} {len(rfis):>8} {projects:>10}")

        other = by_category.get("other", [])
        if other:
            print(f"{'Other/Uncategorized':<35} {len(other):>8}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
