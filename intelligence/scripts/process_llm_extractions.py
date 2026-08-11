#!/usr/bin/env python3
"""
Process LLM Extractions

Takes the LLM root cause extractions and:
1. Clusters subcategories into standardized groups (~25 groups)
2. Builds improved keyword patterns from specific conditions
3. Stores extractions in the database for use in reports

This enables trade-specific reports to use LLM-quality root causes.
"""

import asyncio
import os
import sys
import json
import re
from pathlib import Path
from datetime import datetime
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg

REPORTS_DIR = Path(__file__).parent.parent / "reports"

# Standardized subcategory clusters - maps raw LLM subcategories to standardized names
SUBCATEGORY_CLUSTERS = {
    # Structural/Framing Issues
    "Framing Height Mismatch": [
        "framing height", "ceiling height", "stud height", "wall height",
        "existing framing", "header height", "top of wall"
    ],
    "Blocking/Backing Missing": [
        "blocking", "backing", "support", "reinforcement for",
        "nailer", "backer board"
    ],
    "Structural Detail Missing": [
        "structural detail", "beam", "column", "footing",
        "reinforcement", "rebar", "anchor", "embed"
    ],

    # MEP Coordination
    "Duct Conflicts": [
        "duct conflict", "ductwork", "duct routing", "duct obstruction",
        "hvac conflict", "supply air", "return air", "grease duct"
    ],
    "Pipe/Plumbing Conflicts": [
        "pipe conflict", "plumbing", "drain", "waste line",
        "water line", "condensate", "riser"
    ],
    "Electrical Conflicts": [
        "conduit", "electrical", "circuit", "panel", "junction box",
        "outlet", "receptacle", "cable tray"
    ],
    "Fire Protection Gaps": [
        "fire rating", "fire damper", "fsd", "fire sprinkler",
        "fire alarm", "smoke detector", "fire separation"
    ],

    # Existing Conditions
    "Elevation Conflicts": [
        "elevation", "grade", "level", "height conflict",
        "ada compliance", "slope"
    ],
    "Existing Structure Differs": [
        "existing structure", "existing wall", "existing concrete",
        "existing truss", "existing beam", "as-built"
    ],
    "Hidden Conditions": [
        "discovered", "exposed", "unanticipated", "unforeseen",
        "post-demo", "during demolition"
    ],

    # Code/Compliance
    "Code Compliance Issue": [
        "code", "inspector", "compliance", "per code",
        "building code", "ada", "accessibility"
    ],
    "Seismic Requirements": [
        "seismic", "bracing", "anchorage", "lateral"
    ],
    "Fire Code Requirements": [
        "fire code", "fire rated", "fire barrier", "frp",
        "fire protection"
    ],

    # Drawing/Documentation Issues
    "Missing Layout/Elevation": [
        "layout", "elevation", "rcp", "reflected ceiling",
        "floor plan", "section"
    ],
    "Missing Specification": [
        "specification", "spec not", "not specified", "not called out",
        "not shown", "not detailed", "not provided"
    ],
    "Conflicting Documents": [
        "conflict between", "discrepancy", "inconsistent",
        "does not match", "differs from"
    ],
    "Incomplete Demo Plans": [
        "demo plan", "demolition", "removal", "not shown for removal"
    ],

    # Design Changes
    "Owner-Requested Change": [
        "owner request", "client request", "owner directed",
        "per owner", "owner change"
    ],
    "Design Team Change": [
        "design change", "design team", "architect directed",
        "revised design", "redesign"
    ],
    "Scope Addition": [
        "addition", "added", "new scope", "add scope",
        "not in original", "not included"
    ],

    # Dimensional Issues
    "Clearance/Access Issues": [
        "clearance", "access", "space", "tight", "insufficient room",
        "cannot fit"
    ],
    "Dimensional Conflict": [
        "dimension", "measurement", "size", "length", "width",
        "thickness"
    ],

    # Material/Equipment
    "Material Substitution": [
        "substitut", "alternate", "equivalent", "in lieu of",
        "product change"
    ],
    "Equipment Coordination": [
        "equipment", "unit", "fixture", "device", "installation"
    ],

    # Coordination Process
    "Cross-Trade Coordination": [
        "coordination", "coordinate", "between trades",
        "architectural and", "mechanical and", "electrical and"
    ],
    "Submittal Issue": [
        "submittal", "shop drawing", "approval", "rejection"
    ],
}

def cluster_subcategory(raw_subcategory: str) -> str:
    """Map a raw LLM subcategory to a standardized cluster name."""
    raw_lower = raw_subcategory.lower()

    for cluster_name, keywords in SUBCATEGORY_CLUSTERS.items():
        for keyword in keywords:
            if keyword in raw_lower:
                return cluster_name

    # Fallback: use root cause category logic
    if "missing" in raw_lower or "lack of" in raw_lower or "not provided" in raw_lower:
        return "Missing Specification"
    if "conflict" in raw_lower or "discrepancy" in raw_lower:
        return "Conflicting Documents"
    if "change" in raw_lower or "addition" in raw_lower:
        return "Scope Addition"
    if "existing" in raw_lower:
        return "Existing Structure Differs"

    return "Other"


def extract_keyword_patterns(extractions: list[dict]) -> dict:
    """Extract keyword patterns from specific_condition text."""
    patterns_by_category = defaultdict(list)

    # Common construction terms to look for
    construction_terms = [
        # Structural
        r"(footing|foundation|column|beam|slab|truss|header|joist)",
        r"(framing|stud|blocking|backing|nailer|bracing)",
        r"(reinforcement|rebar|anchor|embed|bolt)",

        # MEP
        r"(duct|ductwork|hvac|diffuser|grille|vav)",
        r"(pipe|piping|drain|waste|vent|riser|condensate)",
        r"(conduit|panel|circuit|outlet|receptacle|junction)",
        r"(sprinkler|fire alarm|smoke detector|fsd|damper)",

        # Finishes
        r"(ceiling|wall|floor|finish|paint|tile|carpet)",
        r"(door|frame|hardware|threshold|closer)",
        r"(window|glazing|curtainwall|storefront)",

        # Dimensions
        r"(\d+['-]?\s*\d*[\"']?\s*(aff|above|below|high|tall))",
        r"(elevation|grade|level|slope)",
        r"(clearance|access|space|room)",

        # Code
        r"(ada|accessibility|code|fire rating|fire rated)",
        r"(seismic|lateral|bracing)",
    ]

    for ext in extractions:
        if not ext.get("success"):
            continue

        condition = ext.get("specific_condition", "").lower()
        category = ext.get("root_cause_category", "Unknown")

        # Extract matching terms
        found_terms = []
        for pattern in construction_terms:
            matches = re.findall(pattern, condition, re.IGNORECASE)
            found_terms.extend(matches)

        if found_terms:
            patterns_by_category[category].extend(found_terms)

    # Count frequency
    pattern_counts = {}
    for category, terms in patterns_by_category.items():
        term_counts = defaultdict(int)
        for term in terms:
            if isinstance(term, tuple):
                term = term[0]
            term_counts[term.lower()] += 1
        pattern_counts[category] = dict(sorted(term_counts.items(), key=lambda x: x[1], reverse=True)[:20])

    return pattern_counts


async def store_extractions_to_db(conn, extractions: list[dict]):
    """Store LLM extractions to database."""

    # First, check if the column exists
    column_exists = await conn.fetchval("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'intelligence'
            AND table_name = 'items'
            AND column_name = 'llm_root_cause'
        )
    """)

    if not column_exists:
        print("Adding llm_root_cause column to intelligence.items...")
        await conn.execute("""
            ALTER TABLE intelligence.items
            ADD COLUMN IF NOT EXISTS llm_root_cause JSONB
        """)
        print("Column added successfully")

    # Update each item with its extraction
    print("Storing extractions to database...")
    updated = 0
    errors = 0

    for ext in extractions:
        if not ext.get("success"):
            continue

        rfi_id = ext.get("rfi_id")
        if not rfi_id:
            continue

        # Build the JSON object to store
        root_cause_data = {
            "specific_condition": ext.get("specific_condition"),
            "impact": ext.get("impact"),
            "category": ext.get("root_cause_category"),
            "subcategory": ext.get("root_cause_subcategory"),
            "standardized_subcategory": cluster_subcategory(ext.get("root_cause_subcategory", "")),
            "preventable": ext.get("preventable"),
            "prevention_action": ext.get("prevention_action"),
            "extracted_at": datetime.now().isoformat()
        }

        try:
            await conn.execute("""
                UPDATE intelligence.items
                SET llm_root_cause = $1::jsonb
                WHERE id = $2::uuid
            """, json.dumps(root_cause_data), rfi_id)
            updated += 1
        except Exception as e:
            errors += 1
            if errors <= 5:  # Only show first 5 errors
                print(f"  Error updating {rfi_id}: {e}")

    return updated, errors


async def main():
    print("=" * 70)
    print("PROCESS LLM EXTRACTIONS")
    print("=" * 70)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # Load extractions
    extraction_path = REPORTS_DIR / "llm_root_cause_extraction.json"
    if not extraction_path.exists():
        print(f"ERROR: {extraction_path} not found. Run llm_root_cause_extraction.py first.")
        return

    with open(extraction_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    extractions = data.get("extractions", [])
    print(f"Loaded {len(extractions)} extractions")
    print()

    # 1. Cluster subcategories
    print("=" * 70)
    print("1. CLUSTERING SUBCATEGORIES")
    print("=" * 70)

    cluster_counts = defaultdict(int)
    for ext in extractions:
        if not ext.get("success"):
            continue
        raw_subcat = ext.get("root_cause_subcategory", "")
        standardized = cluster_subcategory(raw_subcat)
        cluster_counts[standardized] += 1
        ext["standardized_subcategory"] = standardized

    print("\nStandardized Subcategory Distribution:")
    for cluster, count in sorted(cluster_counts.items(), key=lambda x: x[1], reverse=True):
        pct = 100 * count / len(extractions)
        print(f"  {cluster}: {count} ({pct:.1f}%)")

    # Save cluster mapping
    cluster_output = {
        "generated_at": datetime.now().isoformat(),
        "total_items": len(extractions),
        "cluster_distribution": dict(sorted(cluster_counts.items(), key=lambda x: x[1], reverse=True)),
        "cluster_definitions": {k: v for k, v in SUBCATEGORY_CLUSTERS.items()}
    }

    cluster_path = REPORTS_DIR / "subcategory_clusters.json"
    with open(cluster_path, 'w', encoding='utf-8') as f:
        json.dump(cluster_output, f, indent=2)
    print(f"\nCluster definitions saved to: {cluster_path}")

    # 2. Extract keyword patterns
    print()
    print("=" * 70)
    print("2. EXTRACTING KEYWORD PATTERNS")
    print("=" * 70)

    patterns = extract_keyword_patterns(extractions)

    print("\nTop patterns by category:")
    for category, terms in patterns.items():
        top_terms = list(terms.items())[:5]
        print(f"\n  {category}:")
        for term, count in top_terms:
            print(f"    - {term}: {count}")

    patterns_path = REPORTS_DIR / "extracted_patterns.json"
    with open(patterns_path, 'w', encoding='utf-8') as f:
        json.dump(patterns, f, indent=2)
    print(f"\nPatterns saved to: {patterns_path}")

    # 3. Store to database
    print()
    print("=" * 70)
    print("3. STORING TO DATABASE")
    print("=" * 70)

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        updated, errors = await store_extractions_to_db(conn, extractions)
        print(f"\nUpdated: {updated} items")
        print(f"Errors: {errors} items")

        # Verify storage
        count = await conn.fetchval("""
            SELECT COUNT(*) FROM intelligence.items
            WHERE llm_root_cause IS NOT NULL
        """)
        print(f"Total items with LLM root cause: {count}")

    finally:
        await conn.close()

    # 4. Generate summary for report generators
    print()
    print("=" * 70)
    print("4. GENERATING REPORT DATA")
    print("=" * 70)

    # Group extractions by trade for reports
    by_trade = defaultdict(list)
    for ext in extractions:
        if not ext.get("success"):
            continue
        trade = ext.get("trade") or "unspecified"
        trade_lower = trade.lower()

        # Categorize by trade
        if any(t in trade_lower for t in ["drywall", "framing", "interior", "finishes", "architectural"]):
            by_trade["drywall"].append(ext)
        elif any(t in trade_lower for t in ["concrete", "structural", "civil"]):
            by_trade["concrete"].append(ext)
        elif any(t in trade_lower for t in ["mechanical", "hvac", "plumbing"]):
            by_trade["mep"].append(ext)
        elif any(t in trade_lower for t in ["electrical"]):
            by_trade["electrical"].append(ext)
        else:
            by_trade["other"].append(ext)

    print("\nExtractions by trade:")
    for trade, items in sorted(by_trade.items(), key=lambda x: len(x[1]), reverse=True):
        print(f"  {trade}: {len(items)}")

    # Save trade-grouped data
    trade_data_path = REPORTS_DIR / "extractions_by_trade.json"
    # Convert to serializable format
    trade_data = {trade: items for trade, items in by_trade.items()}
    with open(trade_data_path, 'w', encoding='utf-8') as f:
        json.dump(trade_data, f, indent=2, default=str)
    print(f"\nTrade-grouped data saved to: {trade_data_path}")

    print()
    print("=" * 70)
    print("PROCESSING COMPLETE")
    print("=" * 70)
    print(f"\nOutput files:")
    print(f"  - {cluster_path}")
    print(f"  - {patterns_path}")
    print(f"  - {trade_data_path}")
    print(f"\nDatabase updated with {updated} LLM root causes")


if __name__ == "__main__":
    asyncio.run(main())
