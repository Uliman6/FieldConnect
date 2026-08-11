#!/usr/bin/env python3
"""
Categorize RFIs with Priority-Based Analysis

Uses user-defined categorization framework:
- Format: [Issue Type] - [Trade(s)]
- Priority levels: Routine (skip) vs High-Value (analyze deeply)

High-value RFIs are those that:
- Could cause more harm down the line
- Weren't caught early
- Can teach us something (why it happened, recurrence patterns)
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

# Issue types with priority classification
ISSUE_TYPES = {
    # LOW PRIORITY - Routine, nothing to learn
    "Detail Missing": {
        "priority": "routine",
        "patterns": [
            r"not shown", r"not provided", r"not detailed", r"not indicated",
            r"missing.*detail", r"no detail", r"detail.*missing",
            r"please provide", r"not called out"
        ],
        "description": "Drawing detail not provided - routine occurrence"
    },
    "Layout Missing": {
        "priority": "routine",
        "patterns": [
            r"layout.*not shown", r"location.*not", r"no layout",
            r"where.*install", r"confirm location"
        ],
        "description": "Locations/layout not shown on drawings"
    },
    "Detail Mismatch": {
        "priority": "routine",
        "patterns": [
            r"does not match", r"conflict.*between", r"discrepancy",
            r"inconsistent", r"differs from", r"contradict"
        ],
        "description": "Detail shown but doesn't match other docs/submittals"
    },
    "Field Conditions": {
        "priority": "routine",
        "patterns": [
            r"existing.*condition", r"field.*condition", r"as-built",
            r"existing.*differ", r"discovered.*existing", r"survey.*found"
        ],
        "description": "Existing/field conditions differ from design - standard in TI/reno"
    },

    # MEDIUM PRIORITY - Worth tracking
    "Design Mismatch": {
        "priority": "medium",
        "patterns": [
            r"design.*not.*work", r"cannot.*achieve", r"prevents.*compliance",
            r"ada.*compliance", r"code.*compliance", r"redesign required"
        ],
        "description": "Design doesn't work with actual conditions - may need redesign"
    },
    "Spatial Conflict": {
        "priority": "medium",
        "patterns": [
            r"conflict.*with", r"clashes.*with", r"interferes",
            r"insufficient.*clearance", r"routing.*conflict", r"penetrat.*conflict"
        ],
        "description": "Two systems conflict in space - coordination gap"
    },

    # HIGH PRIORITY - Dig deeper, learn from these
    "Field Error/Damage": {
        "priority": "high",
        "patterns": [
            r"blow.?out", r"ruptured", r"damaged", r"failed",
            r"incorrectly.*install", r"installed.*wrong", r"error",
            r"spall", r"crack", r"break"
        ],
        "description": "Something went wrong in field - HIGH VALUE for learning"
    },
    "Concrete Misplacement": {
        "priority": "high",
        "patterns": [
            r"pour.*incorrect", r"concrete.*short", r"slab.*not.*level",
            r"placed.*wrong", r"tolerance.*exceed", r"out of.*tolerance",
            r"misalign", r"curb.*gap", r"pour.*miss"
        ],
        "description": "Concrete placed incorrectly - investigate why and impact"
    },
    "Owner Request": {
        "priority": "high",
        "patterns": [
            r"owner.*request", r"client.*request", r"owner.*direct",
            r"tenant.*request", r"per owner", r"owner.*change"
        ],
        "description": "Owner-requested change - track patterns across jobs"
    },
    "Safety/Code Violation": {
        "priority": "high",
        "patterns": [
            r"safety", r"violation", r"non.?compliant", r"inspector.*reject",
            r"fail.*inspection", r"code.*violation"
        ],
        "description": "Safety or code issue discovered"
    }
}

# Trade detection patterns
TRADES = {
    "Concrete": [r"concrete", r"slab", r"footing", r"foundation", r"pour", r"rebar", r"pt", r"post.?tension"],
    "Drywall": [r"drywall", r"framing", r"stud", r"partition", r"gyp", r"blocking", r"ceiling"],
    "Steel": [r"steel", r"structural", r"beam", r"column", r"embed", r"anchor"],
    "Mechanical": [r"mechanical", r"hvac", r"duct", r"diffuser", r"vav", r"air handler"],
    "Electrical": [r"electrical", r"conduit", r"panel", r"circuit", r"outlet", r"receptacle"],
    "Plumbing": [r"plumbing", r"pipe", r"drain", r"waste", r"water", r"sanitary"],
    "Fire Protection": [r"fire", r"sprinkler", r"damper", r"smoke", r"alarm", r"rated"],
    "Low Voltage": [r"low voltage", r"data", r"telecom", r"av\b", r"security", r"card reader"],
    "Architectural": [r"architectural", r"finish", r"door", r"window", r"flashing", r"waterproof"]
}


def detect_issue_type(text: str) -> tuple[str, str]:
    """Detect issue type and priority from RFI text."""
    text_lower = text.lower()

    for issue_type, info in ISSUE_TYPES.items():
        for pattern in info["patterns"]:
            if re.search(pattern, text_lower):
                return issue_type, info["priority"]

    return "Unclassified", "routine"


def detect_trades(text: str, trade_category: str = None) -> list[str]:
    """Detect trades mentioned in RFI text."""
    text_lower = (text + " " + (trade_category or "")).lower()
    detected = []

    for trade, patterns in TRADES.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                detected.append(trade)
                break

    return detected if detected else ["General"]


def detect_spatial_conflict_trades(text: str) -> str:
    """For spatial conflicts, detect which two systems are conflicting."""
    text_lower = text.lower()
    trades = []

    # Check for MEP vs Structure patterns
    mep_keywords = ["duct", "pipe", "conduit", "panel", "equipment", "hvac", "plumbing", "electrical"]
    structure_keywords = ["beam", "column", "shear wall", "slab", "footing", "structural"]

    has_mep = any(kw in text_lower for kw in mep_keywords)
    has_structure = any(kw in text_lower for kw in structure_keywords)

    if has_mep and has_structure:
        # Determine which MEP
        if any(kw in text_lower for kw in ["duct", "hvac", "diffuser", "vav"]):
            trades.append("Mechanical")
        elif any(kw in text_lower for kw in ["pipe", "drain", "plumbing", "waste"]):
            trades.append("Plumbing")
        elif any(kw in text_lower for kw in ["conduit", "panel", "electrical"]):
            trades.append("Electrical")
        else:
            trades.append("MEP")
        trades.append("Structural")

    return " & ".join(trades) if trades else None


def categorize_rfi(rfi: dict) -> dict:
    """Categorize a single RFI using the new framework."""
    text = (rfi.get("question_text") or "") + " " + (rfi.get("resolution_text") or "")
    trade_cat = rfi.get("trade_category") or ""

    # Detect issue type and priority
    issue_type, priority = detect_issue_type(text)

    # Detect trades
    trades = detect_trades(text, trade_cat)

    # For spatial conflicts, try to identify the conflicting systems
    if issue_type == "Spatial Conflict":
        conflict_trades = detect_spatial_conflict_trades(text)
        if conflict_trades:
            subcategory = f"Spatial Conflict - {conflict_trades}"
        else:
            subcategory = f"Spatial Conflict - {' & '.join(trades[:2])}"
    else:
        primary_trade = trades[0] if trades else "General"
        subcategory = f"{issue_type} - {primary_trade}"

    # Extract additional context for high-priority items
    analysis_notes = None
    if priority == "high":
        if issue_type == "Field Error/Damage":
            analysis_notes = "INVESTIGATE: What caused this? Has it happened before on this or other projects?"
        elif issue_type == "Concrete Misplacement":
            analysis_notes = "INVESTIGATE: Why was concrete placed incorrectly? What was the fix cost? Frequency?"
        elif issue_type == "Owner Request":
            analysis_notes = "TRACK: Who is the owner? What did they request? Does this pattern across jobs?"

    return {
        "subcategory": subcategory,
        "issue_type": issue_type,
        "priority": priority,
        "trades": trades,
        "analysis_notes": analysis_notes
    }


async def main():
    print("=" * 70)
    print("PRIORITY-BASED RFI CATEGORIZATION")
    print("=" * 70)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Fetch all CO RFIs
        rows = await conn.fetch("""
            SELECT
                id,
                source_ref,
                source_project_name,
                question_text,
                resolution_text,
                trade_category,
                llm_root_cause
            FROM intelligence.items
            WHERE resulted_in_co = true
              AND question_text IS NOT NULL
            ORDER BY source_project_name, source_ref
        """)

        print(f"Processing {len(rows)} RFIs...")

        # Categorize all RFIs
        results = []
        priority_counts = defaultdict(int)
        issue_type_counts = defaultdict(int)
        subcategory_counts = defaultdict(int)

        high_value_rfis = []

        for row in rows:
            rfi = dict(row)
            categorization = categorize_rfi(rfi)

            priority_counts[categorization["priority"]] += 1
            issue_type_counts[categorization["issue_type"]] += 1
            subcategory_counts[categorization["subcategory"]] += 1

            result = {
                "rfi_id": str(rfi["id"]),
                "rfi_number": rfi["source_ref"],
                "project": rfi["source_project_name"],
                "trade_category": rfi["trade_category"],
                "question": (rfi["question_text"] or "")[:500],
                "resolution": (rfi["resolution_text"] or "")[:300],
                **categorization
            }

            # Collect high-value RFIs for detailed report
            if categorization["priority"] == "high":
                result["question_full"] = rfi["question_text"]
                result["resolution_full"] = rfi["resolution_text"]
                # Include LLM extraction if available
                if rfi.get("llm_root_cause"):
                    llm_data = rfi["llm_root_cause"]
                    if isinstance(llm_data, str):
                        try:
                            llm_data = json.loads(llm_data)
                        except:
                            llm_data = {}
                    result["llm_specific_condition"] = llm_data.get("specific_condition")
                    result["llm_impact"] = llm_data.get("impact")
                high_value_rfis.append(result)

            results.append(result)

        # Print summary
        print()
        print("=" * 70)
        print("PRIORITY DISTRIBUTION")
        print("=" * 70)
        for priority, count in sorted(priority_counts.items(), key=lambda x: x[1], reverse=True):
            pct = 100 * count / len(rows)
            marker = "  <<<" if priority == "high" else ""
            print(f"  {priority.upper()}: {count} ({pct:.1f}%){marker}")

        print()
        print("=" * 70)
        print("ISSUE TYPE DISTRIBUTION")
        print("=" * 70)
        for issue_type, count in sorted(issue_type_counts.items(), key=lambda x: x[1], reverse=True):
            priority = ISSUE_TYPES.get(issue_type, {}).get("priority", "unknown")
            marker = " [HIGH VALUE]" if priority == "high" else ""
            print(f"  {issue_type}: {count}{marker}")

        print()
        print("=" * 70)
        print(f"HIGH-VALUE RFIs: {len(high_value_rfis)}")
        print("=" * 70)
        for rfi in high_value_rfis[:10]:  # Show first 10
            print(f"\n  {rfi['rfi_number']} ({rfi['project'][:30]})")
            print(f"    Category: {rfi['subcategory']}")
            print(f"    Notes: {rfi['analysis_notes']}")

        # Save results
        output = {
            "generated_at": datetime.now().isoformat(),
            "total_rfis": len(rows),
            "priority_distribution": dict(priority_counts),
            "issue_type_distribution": dict(issue_type_counts),
            "subcategory_distribution": dict(sorted(subcategory_counts.items(), key=lambda x: x[1], reverse=True)),
            "high_value_rfis": high_value_rfis,
            "all_categorizations": results
        }

        output_path = REPORTS_DIR / "priority_categorization.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"\nFull results saved to: {output_path}")

        # Update database with new categorization
        print("\nUpdating database with priority categorization...")
        updated = 0
        for result in results:
            cat_data = {
                "subcategory": result["subcategory"],
                "issue_type": result["issue_type"],
                "priority": result["priority"],
                "trades": result["trades"],
                "analysis_notes": result.get("analysis_notes"),
                "categorized_at": datetime.now().isoformat()
            }

            # Update the llm_root_cause field with additional categorization
            await conn.execute("""
                UPDATE intelligence.items
                SET llm_root_cause = COALESCE(llm_root_cause, '{}'::jsonb) || $1::jsonb
                WHERE id = $2::uuid
            """, json.dumps(cat_data), result["rfi_id"])
            updated += 1

        print(f"Updated {updated} records")

    finally:
        await conn.close()

    print()
    print("=" * 70)
    print("DONE")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
