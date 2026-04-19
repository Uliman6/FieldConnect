#!/usr/bin/env python3
"""
Drywall Trade Trend Analysis

Identifies recurring drywall issues across projects to surface
patterns that field teams should watch for.
"""

import asyncio
import os
import sys
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg

# Drywall-specific issue categories
DRYWALL_ISSUES = {
    "soffit_detail": {
        "name": "Soffit/Bulkhead Details",
        "keywords": ["soffit", "bulkhead", "drop ceiling", "ceiling pocket", "ceiling detail"],
        "description": "Missing or unclear soffit framing and transition details"
    },
    "fire_rating": {
        "name": "Fire Rating/Shaft Walls",
        "keywords": ["fire rated", "fire rating", "shaft wall", "smoke barrier", "fire barrier",
                     "1-hour", "2-hour", "ul assembly", "rated wall", "rated ceiling"],
        "description": "Fire-rated assembly requirements and shaft wall construction"
    },
    "mep_coordination": {
        "name": "MEP Coordination",
        "keywords": ["coordinate", "mep", "conflict", "clearance", "duct", "pipe", "conduit",
                     "above ceiling", "plenum", "chase"],
        "description": "Coordination with mechanical, electrical, plumbing in wall/ceiling cavities"
    },
    "framing_layout": {
        "name": "Framing Layout/Dimensions",
        "keywords": ["framing", "stud", "layout", "dimension", "locate", "grid", "centerline",
                     "stud spacing", "gauge", "track"],
        "description": "Wall framing dimensions, stud layouts, and structural details"
    },
    "finish_level": {
        "name": "Finish Level/Tolerance",
        "keywords": ["finish level", "level 4", "level 5", "tolerance", "flatness", "smooth",
                     "texture", "skim coat", "joint treatment"],
        "description": "Gypsum board finish levels and surface tolerance requirements"
    },
    "backing_blocking": {
        "name": "Backing/Blocking",
        "keywords": ["backing", "blocking", "support", "mount", "tv mount", "grab bar",
                     "handrail", "accessory", "fixture support"],
        "description": "Wood blocking and backing requirements for fixtures/accessories"
    },
    "moisture_mold": {
        "name": "Moisture/Mold Resistance",
        "keywords": ["moisture", "mold", "wet area", "greenboard", "densarmor", "glass mat",
                     "water resistant", "shower", "restroom"],
        "description": "Moisture-resistant board requirements and wet area details"
    },
    "ceiling_grid": {
        "name": "ACT/Ceiling Grid",
        "keywords": ["act", "acoustic ceiling", "ceiling tile", "grid", "t-bar", "suspension",
                     "ceiling height", "hard lid"],
        "description": "Acoustic ceiling tile grid layout and coordination"
    },
    "column_beam_wrap": {
        "name": "Column/Beam Wraps",
        "keywords": ["column wrap", "beam wrap", "column enclosure", "furring", "corner bead",
                     "radius", "curved"],
        "description": "Drywall wrapping of structural columns and beams"
    },
    "slab_edge": {
        "name": "Slab Edge/Floor Conditions",
        "keywords": ["slab edge", "floor", "base of wall", "bottom track", "sill", "transition",
                     "elevation change", "step"],
        "description": "Wall-to-floor transitions and slab edge conditions"
    }
}


async def get_drywall_rfis(conn) -> list[dict]:
    """Fetch all drywall-related RFIs."""
    rows = await conn.fetch("""
        SELECT
            id::text,
            source_ref,
            source_project_id,
            source_project_name,
            question_text,
            raw_text,
            resolution_text,
            trade_category,
            cost_impact,
            resulted_in_co
        FROM intelligence.items
        WHERE trade_category ILIKE '%drywall%'
           OR question_text ILIKE '%drywall%'
           OR question_text ILIKE '%gypsum%'
           OR question_text ILIKE '%gyp board%'
           OR question_text ILIKE '%soffit%'
           OR question_text ILIKE '%framing%'
           OR question_text ILIKE '%stud%'
           OR raw_text ILIKE '%drywall%'
           OR raw_text ILIKE '%gypsum%'
        ORDER BY source_project_name, source_ref
    """)

    return [dict(r) for r in rows]


def categorize_rfi(rfi: dict) -> list[str]:
    """Categorize an RFI into drywall issue types."""
    text = (rfi.get("question_text") or rfi.get("raw_text") or "").lower()

    categories = []
    for cat_id, cat_info in DRYWALL_ISSUES.items():
        for keyword in cat_info["keywords"]:
            if keyword in text:
                categories.append(cat_id)
                break

    return categories if categories else ["uncategorized"]


def analyze_trends(rfis: list[dict]) -> dict:
    """Analyze RFIs to find trends by category."""

    # Track by category
    by_category = defaultdict(list)

    # Track by project
    projects = set()

    for rfi in rfis:
        projects.add(rfi["source_project_name"])
        categories = categorize_rfi(rfi)

        for cat in categories:
            by_category[cat].append(rfi)

    # Calculate stats for each category
    trends = {}
    for cat_id, cat_rfis in by_category.items():
        if cat_id == "uncategorized":
            continue

        # Count unique projects
        cat_projects = set(r["source_project_name"] for r in cat_rfis)

        # Count change orders
        co_count = sum(1 for r in cat_rfis if r.get("resulted_in_co"))

        # Sum cost impact
        cost_sum = sum(r.get("cost_impact") or 0 for r in cat_rfis)

        trends[cat_id] = {
            "name": DRYWALL_ISSUES[cat_id]["name"],
            "description": DRYWALL_ISSUES[cat_id]["description"],
            "rfi_count": len(cat_rfis),
            "project_count": len(cat_projects),
            "projects": list(cat_projects),
            "change_orders": co_count,
            "cost_impact": cost_sum,
            "examples": cat_rfis[:5]  # Keep top 5 examples
        }

    # Sort by cross-project prevalence
    sorted_trends = dict(sorted(
        trends.items(),
        key=lambda x: (x[1]["project_count"], x[1]["rfi_count"]),
        reverse=True
    ))

    return {
        "total_rfis": len(rfis),
        "total_projects": len(projects),
        "project_list": list(projects),
        "trends": sorted_trends,
        "uncategorized_count": len(by_category.get("uncategorized", []))
    }


def print_report(analysis: dict):
    """Print formatted trend report."""

    print("=" * 70)
    print("DRYWALL TRADE - RECURRING ISSUE TRENDS")
    print("=" * 70)
    print(f"\nTotal Drywall RFIs Analyzed: {analysis['total_rfis']}")
    print(f"Projects Covered: {analysis['total_projects']}")
    print(f"  - " + "\n  - ".join(analysis['project_list']))
    print(f"\nUncategorized RFIs: {analysis['uncategorized_count']}")

    print("\n" + "-" * 70)
    print("TOP RECURRING ISSUES (sorted by cross-project frequency)")
    print("-" * 70)

    for i, (cat_id, trend) in enumerate(analysis["trends"].items(), 1):
        if trend["project_count"] < 2:
            continue  # Skip issues only in 1 project

        print(f"\n{i}. {trend['name'].upper()}")
        print(f"   {trend['description']}")
        print(f"   RFIs: {trend['rfi_count']} across {trend['project_count']} projects")

        if trend["change_orders"]:
            print(f"   Change Orders: {trend['change_orders']}")
        if trend["cost_impact"]:
            print(f"   Total Cost Impact: ${trend['cost_impact']:,.0f}")

        print(f"\n   Projects affected:")
        for proj in trend["projects"][:4]:
            print(f"     - {proj}")

        print(f"\n   Example RFIs:")
        for ex in trend["examples"][:3]:
            text = (ex.get("question_text") or ex.get("raw_text") or "")[:120]
            print(f"     [{ex['source_ref']}] {text}...")

    print("\n" + "=" * 70)
    print("RECOMMENDATIONS FOR FIELD TEAMS")
    print("=" * 70)

    top_3 = list(analysis["trends"].items())[:3]
    for cat_id, trend in top_3:
        if trend["project_count"] >= 2:
            print(f"\n-> {trend['name']}: Review details early in coordination phase.")


async def main():
    print("Connecting to database...")
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        print("Fetching drywall RFIs...")
        rfis = await get_drywall_rfis(conn)
        print(f"Found {len(rfis)} drywall-related RFIs")

        print("\nAnalyzing trends...")
        analysis = analyze_trends(rfis)

        print_report(analysis)

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
