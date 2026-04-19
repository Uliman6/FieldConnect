#!/usr/bin/env python3
"""
Drywall Framing Issues -> Change Order Analysis

Identifies which specific framing subcategories lead to change orders
across projects, revealing the highest-risk issues.
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

# Same subcategories from deep dive
FRAMING_SUBCATEGORIES = {
    "door_opening_framing": {
        "name": "Door/Opening Framing",
        "keywords": ["door frame", "door framing", "header", "rough opening", "ro dimension",
                     "door buck", "hm frame", "hollow metal", "door jamb", "opening size"]
    },
    "column_conflict": {
        "name": "Column/Structural Conflicts",
        "keywords": ["column embed", "column wrap", "column align", "exposed column",
                     "column offset", "column enclosure", "column in wall", "gusset plate"]
    },
    "wall_structure_alignment": {
        "name": "Wall-to-Structure Alignment",
        "keywords": ["curb", "slab edge", "not align", "offset from", "wall location",
                     "shear wall", "concrete wall", "protrudes into", "wall position"]
    },
    "pony_partial_height": {
        "name": "Pony Walls/Partial Height",
        "keywords": ["pony wall", "low wall", "partial height", "half wall", "counter height",
                     "transaction counter", "knee wall", "countertop"]
    },
    "stud_gauge_spacing": {
        "name": "Stud Gauge/Spacing",
        "keywords": ["stud size", "gauge", "stud spacing", "16\" o.c.", "24\" o.c.",
                     "20 gauge", "metal stud", "stud depth"]
    },
    "mep_penetration_framing": {
        "name": "MEP Penetration Framing",
        "keywords": ["penetration", "duct opening", "grille", "diffuser", "access panel",
                     "sleeve", "chase", "pipe penetration", "exhaust", "transfer grille"]
    },
    "soffit_bulkhead_framing": {
        "name": "Soffit/Bulkhead Framing",
        "keywords": ["soffit framing", "bulkhead", "ceiling drop", "fur down", "wing wall",
                     "soffit depth", "soffit height", "ceiling pocket"]
    },
    "rated_wall_assembly": {
        "name": "Rated Wall Assembly",
        "keywords": ["fire rated", "1-hour", "2-hour", "ul assembly", "rated wall",
                     "shaft wall", "smoke partition", "sound rated", "stc"]
    },
    "grid_centerline": {
        "name": "Grid/Centerline Layout",
        "keywords": ["gridline", "grid line", "centerline", "center line", "offset",
                     "face of wall", "face of stud", "fos", "dimension to"]
    },
    "head_of_wall": {
        "name": "Head of Wall Conditions",
        "keywords": ["top track", "deflection", "head of wall", "ceiling connection",
                     "structure above", "deck", "slip joint", "top of wall"]
    },
    "base_of_wall": {
        "name": "Base of Wall Conditions",
        "keywords": ["bottom track", "floor track", "slab depression", "raised floor",
                     "floor transition", "base condition", "threshold", "raf"]
    },
    "backing_support": {
        "name": "Blocking/Backing",
        "keywords": ["blocking", "backing", "plywood", "wood backing", "grab bar",
                     "tv mount", "monitor", "handrail", "accessory", "support"]
    }
}


def categorize_rfi(text: str) -> list[str]:
    """Categorize RFI text into framing subcategories."""
    text_lower = text.lower()
    categories = []

    for cat_id, cat_info in FRAMING_SUBCATEGORIES.items():
        for keyword in cat_info["keywords"]:
            if keyword.lower() in text_lower:
                categories.append(cat_id)
                break

    return categories if categories else ["uncategorized"]


async def main():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Get all drywall-related RFIs with CO flag
        print("Fetching drywall RFIs with change order data...")
        rows = await conn.fetch("""
            SELECT
                id::text,
                source_ref,
                source_project_name,
                COALESCE(question_text, raw_text) as text,
                resulted_in_co,
                cost_impact,
                resolution_text
            FROM intelligence.items
            WHERE (trade_category ILIKE '%drywall%'
               OR question_text ILIKE '%drywall%'
               OR question_text ILIKE '%gypsum%'
               OR question_text ILIKE '%framing%'
               OR question_text ILIKE '%stud%'
               OR raw_text ILIKE '%drywall%'
               OR raw_text ILIKE '%framing%')
            ORDER BY source_project_name
        """)

        print(f"Found {len(rows)} drywall-related RFIs")

        # Analyze by subcategory
        co_by_category = defaultdict(lambda: {"total": 0, "with_co": 0, "projects": set(), "examples": []})

        for r in rows:
            text = r["text"] or ""
            categories = categorize_rfi(text)
            has_co = r["resulted_in_co"] or False
            project = r["source_project_name"]

            for cat in categories:
                co_by_category[cat]["total"] += 1
                co_by_category[cat]["projects"].add(project)
                if has_co:
                    co_by_category[cat]["with_co"] += 1
                    if len(co_by_category[cat]["examples"]) < 5:
                        co_by_category[cat]["examples"].append({
                            "ref": r["source_ref"],
                            "project": project,
                            "text": text[:200]
                        })

        # Calculate CO rate and sort
        results = []
        for cat_id, data in co_by_category.items():
            if cat_id == "uncategorized":
                continue
            if data["total"] < 5:  # Skip categories with too few RFIs
                continue

            co_rate = (data["with_co"] / data["total"] * 100) if data["total"] > 0 else 0
            results.append({
                "category": cat_id,
                "name": FRAMING_SUBCATEGORIES.get(cat_id, {}).get("name", cat_id),
                "total": data["total"],
                "with_co": data["with_co"],
                "co_rate": co_rate,
                "projects": len(data["projects"]),
                "examples": data["examples"]
            })

        # Sort by CO rate (highest risk first)
        results.sort(key=lambda x: (x["co_rate"], x["with_co"]), reverse=True)

        # Print report
        print("\n" + "=" * 75)
        print("DRYWALL FRAMING ISSUES - CHANGE ORDER RISK ANALYSIS")
        print("=" * 75)
        print("\nWhich framing issues are most likely to result in change orders?")

        print("\n" + "-" * 75)
        print(f"{'Issue Category':<35} {'RFIs':>6} {'COs':>6} {'CO Rate':>10} {'Projects':>8}")
        print("-" * 75)

        for r in results:
            print(f"{r['name']:<35} {r['total']:>6} {r['with_co']:>6} {r['co_rate']:>9.1f}% {r['projects']:>8}")

        # Detailed breakdown of high-risk categories
        print("\n" + "=" * 75)
        print("HIGH-RISK CATEGORIES - DETAILED BREAKDOWN")
        print("=" * 75)

        high_risk = [r for r in results if r["co_rate"] >= 15 and r["with_co"] >= 3]

        for r in high_risk:
            print(f"\n{'='*75}")
            print(f"{r['name'].upper()}")
            print(f"CO Rate: {r['co_rate']:.1f}% ({r['with_co']} of {r['total']} RFIs)")
            print(f"Projects affected: {r['projects']}")
            print(f"{'='*75}")

            print("\nRFIs that resulted in Change Orders:")
            for ex in r["examples"][:4]:
                text = re.sub(r'\s+', ' ', ex["text"]).strip()
                print(f"\n  [{ex['ref']}] {ex['project']}")
                print(f"    \"{text}...\"")

        # Cross-project analysis
        print("\n" + "=" * 75)
        print("CROSS-PROJECT CHANGE ORDER PATTERNS")
        print("=" * 75)

        # Find issues that caused COs in multiple projects
        multi_project_co = []
        for cat_id, data in co_by_category.items():
            if cat_id == "uncategorized":
                continue

            # Count projects with COs for this category
            projects_with_co = set()
            for ex in data.get("examples", []):
                projects_with_co.add(ex["project"])

            if len(projects_with_co) >= 2:
                multi_project_co.append({
                    "category": cat_id,
                    "name": FRAMING_SUBCATEGORIES.get(cat_id, {}).get("name", cat_id),
                    "projects_with_co": len(projects_with_co),
                    "total_cos": data["with_co"]
                })

        multi_project_co.sort(key=lambda x: x["projects_with_co"], reverse=True)

        print("\nIssues causing COs across multiple projects (systemic problems):")
        print("-" * 75)
        for item in multi_project_co:
            print(f"  {item['name']}: COs in {item['projects_with_co']} projects ({item['total_cos']} total COs)")

        # Summary
        print("\n" + "=" * 75)
        print("KEY FINDINGS")
        print("=" * 75)

        if high_risk:
            print("\nHighest Risk Issues (most likely to become change orders):")
            for r in high_risk[:3]:
                print(f"  - {r['name']}: {r['co_rate']:.0f}% CO rate")

        if multi_project_co:
            print("\nSystemic Issues (caused COs across multiple projects):")
            for item in multi_project_co[:3]:
                print(f"  - {item['name']}: COs in {item['projects_with_co']} projects")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
