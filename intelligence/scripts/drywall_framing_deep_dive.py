#!/usr/bin/env python3
"""
Deep Dive: Drywall Framing & Dimension Issues

Breaks down the broad "framing/dimension" category into specific,
actionable subcategories that field teams can watch for.
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

# Specific framing issue subcategories
FRAMING_SUBCATEGORIES = {
    "door_opening_framing": {
        "name": "Door/Opening Framing",
        "keywords": [
            "door frame", "door framing", "header", "rough opening", "ro dimension",
            "door buck", "hm frame", "hollow metal", "door jamb", "cripple stud",
            "king stud", "jack stud", "opening size", "door opening"
        ],
        "description": "Headers, rough openings, and framing around doors/openings",
        "alert": "Verify rough opening dimensions match door schedule before framing"
    },
    "column_conflict": {
        "name": "Column/Structural Conflicts",
        "keywords": [
            "column embed", "column wrap", "column align", "exposed column",
            "column offset", "column enclosure", "column in wall", "columns do not align",
            "gusset plate", "column protrude", "structural column"
        ],
        "description": "Walls conflicting with or not aligning to structural columns",
        "alert": "Check column locations against wall layout - columns often don't align with partition grid"
    },
    "wall_structure_alignment": {
        "name": "Wall-to-Structure Alignment",
        "keywords": [
            "curb", "slab edge", "not align", "offset from", "wall location",
            "shear wall", "concrete wall", "cmu", "adjacent to", "protrudes into",
            "wall position", "wall layout"
        ],
        "description": "Partition walls not aligning with slabs, curbs, or structure",
        "alert": "Field verify slab edges and curbs before wall layout - as-built often differs from drawings"
    },
    "pony_partial_height": {
        "name": "Pony Walls/Partial Height",
        "keywords": [
            "pony wall", "low wall", "partial height", "half wall", "counter height",
            "transaction counter", "reception desk", "knee wall", "stub wall",
            "countertop", "2'-0\"", "3'-0\"", "42\"", "36\""
        ],
        "description": "Low walls, transaction counters, and partial-height partitions",
        "alert": "Confirm pony wall heights match millwork/counter heights before framing"
    },
    "stud_gauge_spacing": {
        "name": "Stud Gauge/Spacing",
        "keywords": [
            "stud size", "gauge", "stud spacing", "16\" o.c.", "24\" o.c.",
            "20 gauge", "25 gauge", "18 gauge", "metal stud", "light gauge",
            "stud depth", "3-5/8", "6\"", "2-1/2"
        ],
        "description": "Stud gauge, spacing, and depth requirements unclear or missing",
        "alert": "Verify stud gauge and spacing on partition schedule - often not shown on plan"
    },
    "mep_penetration_framing": {
        "name": "MEP Penetration Framing",
        "keywords": [
            "penetration", "duct opening", "grille", "diffuser", "access panel",
            "sleeve", "chase", "riser", "pipe penetration", "conduit",
            "exhaust", "transfer grille", "duct framing"
        ],
        "description": "Framing around MEP penetrations, grilles, and access panels",
        "alert": "Coordinate MEP rough-in locations before close-in - penetration sizes often change"
    },
    "soffit_bulkhead_framing": {
        "name": "Soffit/Bulkhead Framing",
        "keywords": [
            "soffit framing", "bulkhead", "ceiling drop", "fur down", "wing wall",
            "return", "soffit depth", "soffit height", "kicker", "ledger",
            "ceiling pocket", "cloud"
        ],
        "description": "Soffit construction details, depths, and transitions",
        "alert": "Request soffit framing sections - depths and returns rarely detailed"
    },
    "rated_wall_assembly": {
        "name": "Rated Wall Assembly Details",
        "keywords": [
            "fire rated", "1-hour", "2-hour", "ul assembly", "rated wall",
            "shaft wall", "smoke partition", "sound rated", "stc", "acoustic",
            "deflection track", "slip track", "top of wall"
        ],
        "description": "Fire-rated and sound-rated assembly requirements",
        "alert": "Confirm UL assembly number and verify all components match specification"
    },
    "grid_centerline": {
        "name": "Grid/Centerline Layout",
        "keywords": [
            "gridline", "grid line", "centerline", "center line", "offset",
            "face of wall", "face of stud", "fos", "fow", "dimension to",
            "layout", "locate"
        ],
        "description": "Wall layout dimensions and grid alignment",
        "alert": "Clarify if dimensions are to face of stud, centerline, or face of gyp"
    },
    "head_of_wall": {
        "name": "Head of Wall Conditions",
        "keywords": [
            "top track", "deflection", "head of wall", "ceiling connection",
            "structure above", "deck", "gap", "slip joint", "fire stop",
            "top of wall", "how condition"
        ],
        "description": "Top-of-wall connections to structure or ceiling",
        "alert": "Verify head-of-wall condition matches deck profile and deflection requirements"
    },
    "base_of_wall": {
        "name": "Base of Wall Conditions",
        "keywords": [
            "bottom track", "floor track", "slab depression", "raised floor",
            "floor transition", "base condition", "threshold", "elevation change",
            "floor elevation", "raf", "raised access"
        ],
        "description": "Bottom track conditions at floor transitions and depressions",
        "alert": "Check floor elevations at wall locations - depressions often not shown on plan"
    },
    "backing_support": {
        "name": "Blocking/Backing Requirements",
        "keywords": [
            "blocking", "backing", "plywood", "wood backing", "grab bar",
            "tv mount", "av", "monitor", "handrail", "accessory mounting",
            "support", "fixture"
        ],
        "description": "Wood blocking and backing for fixtures and accessories",
        "alert": "Request blocking layout from architect before close-in - often not detailed"
    }
}


async def get_framing_rfis(conn) -> list[dict]:
    """Fetch framing/dimension related RFIs."""
    rows = await conn.fetch("""
        SELECT
            id::text,
            source_ref,
            source_project_id,
            source_project_name,
            question_text,
            raw_text,
            resolution_text,
            cost_impact,
            resulted_in_co
        FROM intelligence.items
        WHERE (trade_category ILIKE '%drywall%'
           OR question_text ILIKE '%drywall%'
           OR question_text ILIKE '%gypsum%'
           OR question_text ILIKE '%framing%'
           OR question_text ILIKE '%stud%'
           OR raw_text ILIKE '%framing%')
          AND (question_text ILIKE '%framing%'
           OR question_text ILIKE '%stud%'
           OR question_text ILIKE '%layout%'
           OR question_text ILIKE '%dimension%'
           OR question_text ILIKE '%locate%'
           OR question_text ILIKE '%align%'
           OR question_text ILIKE '%track%'
           OR question_text ILIKE '%column%'
           OR question_text ILIKE '%opening%'
           OR question_text ILIKE '%header%'
           OR question_text ILIKE '%soffit%'
           OR question_text ILIKE '%wall%')
        ORDER BY source_project_name, source_ref
    """)
    return [dict(r) for r in rows]


def categorize_rfi(rfi: dict) -> list[str]:
    """Categorize an RFI into specific framing subcategories."""
    text = (rfi.get("question_text") or rfi.get("raw_text") or "").lower()

    categories = []
    scores = {}

    for cat_id, cat_info in FRAMING_SUBCATEGORIES.items():
        score = 0
        for keyword in cat_info["keywords"]:
            if keyword.lower() in text:
                score += 1
        if score > 0:
            scores[cat_id] = score

    # Return categories with matches, sorted by score
    if scores:
        sorted_cats = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        # Return top matches (score > 0)
        return [cat for cat, score in sorted_cats if score >= 1]

    return ["other_framing"]


def analyze_subcategories(rfis: list[dict]) -> dict:
    """Analyze RFIs by subcategory."""

    by_category = defaultdict(list)
    projects = set()

    for rfi in rfis:
        projects.add(rfi["source_project_name"])
        categories = categorize_rfi(rfi)

        for cat in categories:
            by_category[cat].append(rfi)

    # Build results
    results = {}
    for cat_id, cat_rfis in by_category.items():
        if cat_id == "other_framing":
            continue

        cat_info = FRAMING_SUBCATEGORIES.get(cat_id, {})
        cat_projects = set(r["source_project_name"] for r in cat_rfis)
        co_count = sum(1 for r in cat_rfis if r.get("resulted_in_co"))

        results[cat_id] = {
            "name": cat_info.get("name", cat_id),
            "description": cat_info.get("description", ""),
            "alert": cat_info.get("alert", ""),
            "rfi_count": len(cat_rfis),
            "project_count": len(cat_projects),
            "projects": list(cat_projects),
            "change_orders": co_count,
            "examples": cat_rfis[:4]
        }

    # Sort by cross-project prevalence
    sorted_results = dict(sorted(
        results.items(),
        key=lambda x: (x[1]["project_count"], x[1]["rfi_count"]),
        reverse=True
    ))

    return {
        "total_rfis": len(rfis),
        "total_projects": len(projects),
        "subcategories": sorted_results,
        "other_count": len(by_category.get("other_framing", []))
    }


def print_report(analysis: dict):
    """Print detailed subcategory report."""

    print("=" * 75)
    print("DRYWALL FRAMING ISSUES - DETAILED SUBCATEGORIES")
    print("=" * 75)
    print(f"\nTotal Framing RFIs Analyzed: {analysis['total_rfis']}")
    print(f"Projects: {analysis['total_projects']}")
    print(f"Uncategorized: {analysis['other_count']}")

    print("\n" + "-" * 75)
    print("SPECIFIC ISSUE TYPES (sorted by cross-project frequency)")
    print("-" * 75)

    for i, (cat_id, data) in enumerate(analysis["subcategories"].items(), 1):
        if data["project_count"] < 2:
            continue

        print(f"\n{'='*75}")
        print(f"{i}. {data['name'].upper()}")
        print(f"{'='*75}")
        print(f"   {data['description']}")
        print(f"\n   Stats: {data['rfi_count']} RFIs | {data['project_count']} projects | {data['change_orders']} COs")

        print(f"\n   >> ALERT: {data['alert']}")

        print(f"\n   Projects affected: {', '.join(data['projects'][:4])}")

        print(f"\n   Example RFIs:")
        for ex in data["examples"][:3]:
            text = (ex.get("question_text") or ex.get("raw_text") or "")[:150]
            # Clean up text
            text = re.sub(r'\s+', ' ', text).strip()
            print(f"\n   [{ex['source_ref']}] {ex['source_project_name']}")
            print(f"      \"{text}...\"")

    # Summary table
    print("\n" + "=" * 75)
    print("SUMMARY: ACTIONABLE ALERTS FOR DRYWALL FRAMING")
    print("=" * 75)
    print(f"\n{'Issue Type':<35} {'RFIs':>6} {'Projects':>8} {'Alert Priority':>15}")
    print("-" * 75)

    for cat_id, data in analysis["subcategories"].items():
        if data["project_count"] >= 2:
            priority = "HIGH" if data["project_count"] >= 4 else "MEDIUM" if data["project_count"] >= 3 else "LOW"
            print(f"{data['name']:<35} {data['rfi_count']:>6} {data['project_count']:>8} {priority:>15}")


async def main():
    print("Connecting to database...")
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        print("Fetching framing/dimension RFIs...")
        rfis = await get_framing_rfis(conn)
        print(f"Found {len(rfis)} framing-related RFIs")

        print("\nAnalyzing subcategories...")
        analysis = analyze_subcategories(rfis)

        print_report(analysis)

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
