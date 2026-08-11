#!/usr/bin/env python3
"""
Generate Concrete Trade CO Report

Analyzes concrete-related RFIs that resulted in change orders,
using LLM-extracted root causes for specific, actionable insights.
"""

import asyncio
import os
import sys
import re
import json
from pathlib import Path
from datetime import datetime
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg

REPORTS_DIR = Path(__file__).parent.parent / "reports"
REPORTS_DIR.mkdir(exist_ok=True)

# Flag to enable/disable LLM root cause usage
USE_LLM_ROOT_CAUSES = True

# Concrete-specific subcategories
SUBCATEGORIES = {
    "embed_anchor": {
        "name": "Embeds & Anchors",
        "keywords": ["embed", "anchor", "dowel", "bolt", "insert", "plate", "connection",
                     "cast-in", "post-installed", "hilti", "simpson", "seismic brac"],
        "description": "Embed plates, anchor bolts, dowels, and cast-in connections"
    },
    "rebar_reinforcement": {
        "name": "Rebar & Reinforcement",
        "keywords": ["rebar", "reinforcement", "bar", "#4", "#5", "#6", "#8", "stirrup",
                     "tie", "splice", "lap", "coupler", "development length", "wwf"],
        "description": "Reinforcing steel placement, splices, and detailing"
    },
    "slab_pour": {
        "name": "Slab & Pour Sequence",
        "keywords": ["slab", "pour", "placement", "sequence", "joint", "cold joint",
                     "construction joint", "topping", "sog", "sod", "elevated", "deck"],
        "description": "Slab pours, sequences, joints, and placement issues"
    },
    "formwork_shoring": {
        "name": "Formwork & Shoring",
        "keywords": ["formwork", "form", "shoring", "reshoring", "stripping", "stripped",
                     "falsework", "blockout", "sleeves"],
        "description": "Formwork design, stripping times, and shoring requirements"
    },
    "footing_foundation": {
        "name": "Footings & Foundations",
        "keywords": ["footing", "foundation", "pile", "caisson", "grade beam", "mat",
                     "spread footing", "pier", "excavation", "subgrade"],
        "description": "Foundation systems, footings, and below-grade concrete"
    },
    "wall_column": {
        "name": "Walls & Columns",
        "keywords": ["column", "wall", "shear wall", "core wall", "pilaster",
                     "opening", "penetration", "blockout"],
        "description": "Concrete walls, columns, and vertical elements"
    },
    "curb_misc": {
        "name": "Curbs & Miscellaneous",
        "keywords": ["curb", "housekeeping pad", "equipment pad", "trench", "pit",
                     "depression", "threshold", "ramp", "stair", "tread"],
        "description": "Curbs, pads, pits, depressions, and miscellaneous concrete"
    },
    "tolerance_finish": {
        "name": "Tolerances & Finishes",
        "keywords": ["tolerance", "flatness", "levelness", "ff", "fl", "finish",
                     "broom", "trowel", "exposed", "architectural", "chip", "patch"],
        "description": "Surface tolerances, flatness requirements, and finishes"
    },
    "waterproofing_joint": {
        "name": "Waterproofing & Joints",
        "keywords": ["waterproof", "waterstop", "expansion joint", "control joint",
                     "sealant", "caulk", "membrane", "dampproof", "bituthene"],
        "description": "Waterproofing, waterstops, and joint treatments"
    },
    "pt_post_tension": {
        "name": "Post-Tensioning",
        "keywords": ["pt", "post-tension", "tendon", "strand", "stressing",
                     "duct", "unbonded", "cable"],
        "description": "Post-tensioned concrete systems and details"
    }
}


# Specific root cause patterns - ordered by specificity (most specific first)
ROOT_CAUSE_PATTERNS = [
    # Existing conditions - specific types
    (r"existing (footing|foundation|column|beam|slab).*?(exposed|discovered|found|noticed)",
     "Existing structure differs from drawings - discovered during demo/excavation"),
    (r"existing.*?condition.*?(differ|not match|conflict|varies)",
     "As-built conditions don't match drawings"),
    (r"(existing|current).*?(framing|ceiling|height).*?(only|different|shorter|taller)",
     "Existing framing/structure dimensions differ from assumed"),
    (r"(existing|as-built).*?elevation.*?(differ|higher|lower|not match)",
     "Existing elevation differs from design"),
    (r"existing.*?(mep|pipe|conduit|duct).*?(conflict|in the way|needs to be)",
     "Existing MEP routing conflicts with new work"),
    (r"(demo|demolition).*?(noticed|found|discovered|revealed)",
     "Demolition revealed unforeseen conditions"),

    # Coordination issues - specific types
    (r"(mep|electrical|plumb|mechanical|hvac).*?(conflict|clash|coordinate|penetrat)",
     "MEP penetration/routing conflicts with structural elements"),
    (r"(seismic|anchor|brace).*?(not shown|missing|not provided|no detail)",
     "Seismic anchorage/bracing details not provided in drawings"),
    (r"(sleeve|penetrat|opening|blockout).*?(location|coordinate|conflict|missing)",
     "Sleeve/penetration locations not coordinated or missing"),
    (r"(steel|beam|column).*?(connect|attach|anchor).*?(concrete|slab|footing)",
     "Steel-to-concrete connection detail missing or unclear"),

    # Drawing deficiencies - specific types
    (r"detail.*?(not show|not provided|missing|unclear|no .* provided)",
     "Required detail not shown on drawings"),
    (r"(reinforc|rebar|wwf).*?(not shown|not provided|missing|no .* detail)",
     "Reinforcement requirements not detailed"),
    (r"dimension.*?(conflict|differ|not match|discrepancy)",
     "Dimensional conflicts between drawings"),
    (r"(spec|specification).*?(conflict|unclear|missing|not match)",
     "Specification conflicts or omissions"),
    (r"(plan|section|detail).*?(differ|conflict|not match|contradict)",
     "Conflicts between plan and section/detail views"),

    # Tolerance/placement issues
    (r"(tolerance|out of|deviat|misalign).*?(slab|footing|column|wall)",
     "Concrete placement tolerance deviation"),
    (r"(layout|location).*?(shift|move|relocate|differ).*?\d",
     "Layout differs from design - requires adjustment"),
    (r"(anchor|embed|insert).*?(miss|wrong location|tolerance)",
     "Embed/anchor placement deviation"),
    (r"(blew out|blow.?out|spall|damage).*?(cable|tendon|strand|concrete)",
     "PT cable blowout or concrete damage during stressing"),

    # Sequencing/schedule issues
    (r"(sequence|sequenc|pour.*order|construction.*joint)",
     "Pour sequence or construction joint location issue"),
    (r"(defer|submit|approval|permit).*?(delay|not yet|pending)",
     "Deferred submittal delaying work"),
    (r"(shore|shoring).*?(before|prior|sequence|support)",
     "Shoring sequence/requirements unclear"),

    # Design changes/revisions
    (r"(add|added|new).*?(not.*original|after|bid|contract)",
     "Added scope not in original contract"),
    (r"(oac|meeting|discussion).*?(confirm|proceed|direct)",
     "Field direction given during OAC/coordination meeting"),
    (r"(owner|client|tenant).*?(request|change|revise|modify)",
     "Owner-requested change"),
    (r"(code|inspector|city).*?(require|direct|instruct)",
     "Code/inspector-required change"),

    # Access/installation issues
    (r"(access|reach|install).*?(conflict|cannot|unable|difficult)",
     "Installation access restricted by existing conditions"),
    (r"(work around|accommodate|avoid).*?(brace|shore|support)",
     "Work sequence conflicts with temporary bracing/shoring"),
]


def categorize_rfi(text: str) -> list[str]:
    """Categorize RFI text into concrete subcategories."""
    text_lower = text.lower()
    matches = []
    for cat_id, info in SUBCATEGORIES.items():
        if any(kw in text_lower for kw in info["keywords"]):
            matches.append(cat_id)
    return matches if matches else ["uncategorized"]


def extract_root_causes(text: str) -> list[str]:
    """Extract specific root cause patterns from RFI text."""
    text_lower = text.lower()
    # Normalize whitespace for better regex matching
    text_lower = re.sub(r'\s+', ' ', text_lower)

    causes = []
    matched_patterns = set()

    for pattern, cause in ROOT_CAUSE_PATTERNS:
        if cause not in matched_patterns:
            if re.search(pattern, text_lower):
                causes.append(cause)
                matched_patterns.add(cause)

    # If no specific patterns matched, try to extract key phrases
    if not causes:
        # Look for question keywords to infer issue type
        if re.search(r'please (confirm|clarify|provide)', text_lower):
            if 'confirm' in text_lower and 'acceptable' in text_lower:
                causes.append("Contractor proposing alternate approach - needs approval")
            elif 'provide' in text_lower and 'detail' in text_lower:
                causes.append("Detail/information not provided in contract documents")
            elif 'clarify' in text_lower:
                causes.append("Drawing ambiguity requires clarification")

    # Still no causes? Note what type of question it is
    if not causes:
        if 'attached' in text_lower or 'see picture' in text_lower or 'photo' in text_lower:
            causes.append("Field condition documented - requires design response")
        else:
            causes.append("Design clarification required")

    return causes[:3]  # Limit to top 3 causes


def extract_fix_type(resolution: str) -> list[str]:
    """Extract fix type from resolution text."""
    res_lower = resolution.lower()
    fixes = []

    if "proceed" in res_lower or "acceptable" in res_lower or "approved" in res_lower:
        fixes.append("Approved as proposed")
    if "no exception" in res_lower:
        fixes.append("Approved - no exceptions")
    if "provide" in res_lower or "add" in res_lower or "install" in res_lower:
        fixes.append("Additional work required")
    if "repair" in res_lower or "patch" in res_lower:
        fixes.append("Repair/patch required")
    if "relocate" in res_lower or "move" in res_lower or "shift" in res_lower:
        fixes.append("Relocate element")
    if "demo" in res_lower or "remove" in res_lower:
        fixes.append("Demo/remove existing")
    if "infill" in res_lower or "grout" in res_lower:
        fixes.append("Infill/grout")
    if "epoxy" in res_lower or "adhesive" in res_lower:
        fixes.append("Epoxy/adhesive anchor")
    if "see attached" in res_lower or "see markup" in res_lower or "attached pdf" in res_lower:
        fixes.append("Per attached ASK/detail")
    if "coordinate" in res_lower or "work with" in res_lower:
        fixes.append("Coordinate with other trades")
    if "delegated" in res_lower or "submit" in res_lower:
        fixes.append("Delegated design - submit calcs")

    return fixes if fixes else ["See response for detail"]


async def fetch_concrete_cos(conn) -> list[dict]:
    """Fetch all concrete-related RFIs that resulted in COs, including LLM root causes."""
    rows = await conn.fetch("""
        SELECT
            source_ref,
            source_project_name,
            question_text,
            resolution_text,
            trade_category,
            cost_impact,
            resulted_in_co,
            llm_root_cause
        FROM intelligence.items
        WHERE resulted_in_co = true
          AND (trade_category ILIKE '%concrete%'
            OR trade_category ILIKE '%structural%'
            OR trade_category ILIKE '%civil%'
            OR question_text ILIKE '%concrete%'
            OR question_text ILIKE '%rebar%'
            OR question_text ILIKE '%slab%'
            OR question_text ILIKE '%footing%'
            OR question_text ILIKE '%formwork%'
            OR question_text ILIKE '%pour%'
            OR question_text ILIKE '%embed%'
            OR question_text ILIKE '%anchor%'
            OR question_text ILIKE '%dowel%'
            OR question_text ILIKE '%post-tension%'
            OR question_text ILIKE '%shoring%'
            OR question_text ILIKE '%foundation%'
            OR question_text ILIKE '%curb%')
        ORDER BY source_project_name, source_ref
    """)
    return [dict(r) for r in rows]


def analyze_cos(rfis: list[dict]) -> dict:
    """Analyze COs and return structured data, using LLM root causes when available."""

    by_category = defaultdict(list)
    llm_used = 0
    fallback_used = 0

    for rfi in rfis:
        text = rfi["question_text"] or ""
        resolution = rfi["resolution_text"] or ""
        llm_data = rfi.get("llm_root_cause")

        # Parse LLM root cause if available (it's stored as JSONB)
        if USE_LLM_ROOT_CAUSES and llm_data:
            if isinstance(llm_data, str):
                try:
                    llm_data = json.loads(llm_data)
                except:
                    llm_data = None

        # Get root causes - prefer LLM data
        if USE_LLM_ROOT_CAUSES and llm_data and llm_data.get("specific_condition"):
            # Use LLM-extracted specific condition as root cause
            specific_condition = llm_data.get("specific_condition", "")
            impact = llm_data.get("impact", "")
            llm_category = llm_data.get("category", "")
            llm_subcategory = llm_data.get("standardized_subcategory", "")
            prevention = llm_data.get("prevention_action", "")

            root_causes = [specific_condition]
            if impact and impact != specific_condition:
                root_causes.append(f"Impact: {impact}")

            llm_used += 1
        else:
            # Fallback to keyword patterns
            root_causes = extract_root_causes(text)
            llm_category = None
            llm_subcategory = None
            prevention = None
            fallback_used += 1

        # Categorize - use LLM subcategory if available, else keyword-based
        if USE_LLM_ROOT_CAUSES and llm_data and llm_data.get("standardized_subcategory"):
            # Map LLM standardized subcategory to our categories
            std_subcat = llm_data.get("standardized_subcategory", "").lower()
            if "embed" in std_subcat or "anchor" in std_subcat or "structural" in std_subcat:
                categories = ["embed_anchor"]
            elif "reinforc" in std_subcat or "rebar" in std_subcat:
                categories = ["rebar_reinforcement"]
            elif "slab" in std_subcat or "pour" in std_subcat or "sequence" in std_subcat:
                categories = ["slab_pour"]
            elif "form" in std_subcat or "shoring" in std_subcat:
                categories = ["formwork_shoring"]
            elif "footing" in std_subcat or "foundation" in std_subcat or "elevation" in std_subcat:
                categories = ["footing_foundation"]
            elif "wall" in std_subcat or "column" in std_subcat:
                categories = ["wall_column"]
            elif "curb" in std_subcat or "pad" in std_subcat or "stair" in std_subcat:
                categories = ["curb_misc"]
            elif "tolerance" in std_subcat or "finish" in std_subcat:
                categories = ["tolerance_finish"]
            elif "waterproof" in std_subcat or "joint" in std_subcat:
                categories = ["waterproofing_joint"]
            elif "tension" in std_subcat or "pt" in std_subcat or "cable" in std_subcat:
                categories = ["pt_post_tension"]
            else:
                categories = categorize_rfi(text)
        else:
            categories = categorize_rfi(text)

        fixes = extract_fix_type(resolution)

        costs = re.findall(r'\$[\d,]+(?:\.\d{2})?[kK]?', text + " " + resolution)

        # Clean text but don't truncate
        clean_question = re.sub(r'\s+', ' ', text).strip()
        clean_resolution = re.sub(r'\s+', ' ', resolution).strip()

        rfi_data = {
            "rfi_number": rfi["source_ref"],
            "project": rfi["source_project_name"],
            "trade": rfi["trade_category"],
            "question": clean_question,  # Full text
            "resolution": clean_resolution,  # Full text
            "root_causes": root_causes,
            "fixes": fixes,
            "cost_estimates": costs,
            "llm_category": llm_category if USE_LLM_ROOT_CAUSES else None,
            "llm_subcategory": llm_subcategory if USE_LLM_ROOT_CAUSES else None,
            "prevention_action": prevention if USE_LLM_ROOT_CAUSES else None
        }

        for cat in categories:
            by_category[cat].append(rfi_data)

    # Log LLM usage stats
    print(f"  LLM root causes used: {llm_used}")
    print(f"  Fallback patterns used: {fallback_used}")

    summary = {}
    for cat_id, cat_rfis in by_category.items():
        if cat_id == "uncategorized":
            continue

        projects = list(set(r["project"] for r in cat_rfis))

        cause_counts = defaultdict(int)
        for r in cat_rfis:
            for cause in r["root_causes"]:
                cause_counts[cause] += 1

        fix_counts = defaultdict(int)
        for r in cat_rfis:
            for fix in r["fixes"]:
                fix_counts[fix] += 1

        summary[cat_id] = {
            "name": SUBCATEGORIES.get(cat_id, {}).get("name", cat_id),
            "description": SUBCATEGORIES.get(cat_id, {}).get("description", ""),
            "co_count": len(cat_rfis),
            "projects": projects,
            "project_count": len(projects),
            "root_causes": dict(sorted(cause_counts.items(), key=lambda x: x[1], reverse=True)),
            "fixes": dict(sorted(fix_counts.items(), key=lambda x: x[1], reverse=True)),
            "examples": cat_rfis[:5]  # Top 5 examples
        }

    return {
        "generated_at": datetime.now().isoformat(),
        "trade": "Concrete",
        "total_cos": len(rfis),
        "categories": dict(sorted(summary.items(), key=lambda x: x[1]["co_count"], reverse=True)),
        "uncategorized_count": len(by_category.get("uncategorized", []))
    }


def escape_html(text: str) -> str:
    """Escape HTML special characters."""
    return (text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;"))


def generate_html_report(analysis: dict, output_path: Path):
    """Generate HTML report with full RFI text."""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Concrete Trade - Change Order Root Cause Analysis</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }}
        .container {{ max-width: 1400px; margin: 0 auto; }}
        h1 {{ color: #1a1a2e; margin-bottom: 5px; }}
        .timestamp {{ color: #666; font-size: 14px; margin-bottom: 30px; }}

        .summary-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }}
        .stat-card {{
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            text-align: center;
        }}
        .stat-value {{ font-size: 36px; font-weight: bold; color: #1a1a2e; }}
        .stat-label {{ color: #666; font-size: 14px; }}

        .category-section {{
            background: white;
            border-radius: 12px;
            margin-bottom: 25px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
        }}
        .category-header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
        }}
        .category-title {{ font-size: 20px; margin-bottom: 5px; }}
        .category-desc {{ opacity: 0.8; font-size: 14px; }}
        .category-stats {{
            display: flex;
            gap: 30px;
            margin-top: 15px;
            font-size: 14px;
        }}

        .analysis-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            padding: 20px;
        }}
        @media (max-width: 800px) {{
            .analysis-grid {{ grid-template-columns: 1fr; }}
        }}

        .analysis-box {{
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
        }}
        .analysis-box h4 {{
            color: #1a1a2e;
            margin-bottom: 10px;
            font-size: 14px;
            text-transform: uppercase;
        }}
        .cause-item, .fix-item {{
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e9ecef;
            font-size: 13px;
        }}
        .cause-item:last-child, .fix-item:last-child {{ border-bottom: none; }}
        .cause-count {{
            background: #e74c3c;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            flex-shrink: 0;
            margin-left: 10px;
        }}
        .fix-count {{
            background: #27ae60;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            flex-shrink: 0;
            margin-left: 10px;
        }}

        .examples-section {{
            padding: 20px;
            border-top: 1px solid #eee;
        }}
        .examples-section h4 {{ color: #1a1a2e; margin-bottom: 15px; }}
        .example-card {{
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 0 8px 8px 0;
        }}
        .example-header {{
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            flex-wrap: wrap;
            gap: 10px;
        }}
        .example-rfi {{ font-weight: bold; color: #1a1a2e; }}
        .example-project {{ color: #666; font-size: 13px; }}

        .example-question {{
            color: #333;
            font-size: 13px;
            margin-bottom: 10px;
            background: white;
            padding: 12px;
            border-radius: 6px;
            border: 1px solid #e9ecef;
            white-space: pre-wrap;
            max-height: 300px;
            overflow-y: auto;
        }}
        .example-resolution {{
            color: #1a5f2a;
            font-size: 13px;
            margin-bottom: 10px;
            background: #f0fff4;
            padding: 12px;
            border-radius: 6px;
            border: 1px solid #c6f6d5;
            white-space: pre-wrap;
        }}
        .example-resolution strong {{
            color: #166534;
        }}

        .example-causes {{ display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }}
        .cause-tag {{
            background: #fee2e2;
            color: #991b1b;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
        }}
        .fix-tag {{
            background: #dcfce7;
            color: #166534;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
        }}

        .key-insights {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 12px;
            padding: 25px;
            margin-top: 30px;
        }}
        .key-insights h2 {{ margin-bottom: 15px; }}
        .insight-item {{
            background: rgba(255,255,255,0.2);
            padding: 12px 15px;
            border-radius: 8px;
            margin-bottom: 10px;
        }}

        .toggle-btn {{
            background: #667eea;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            margin-top: 5px;
        }}
        .toggle-btn:hover {{ background: #5a67d8; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Concrete Trade - Change Order Root Cause Analysis</h1>
        <p class="timestamp">Generated: {analysis['generated_at'][:19].replace('T', ' ')}</p>

        <div class="summary-grid">
            <div class="stat-card">
                <div class="stat-value">{analysis['total_cos']}</div>
                <div class="stat-label">Total Concrete COs</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{len(analysis['categories'])}</div>
                <div class="stat-label">Issue Categories</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{len(set(p for c in analysis['categories'].values() for p in c['projects']))}</div>
                <div class="stat-label">Projects Affected</div>
            </div>
        </div>
"""

    for cat_id, cat_data in analysis["categories"].items():
        html += f"""
        <div class="category-section">
            <div class="category-header">
                <div class="category-title">{cat_data['name']}</div>
                <div class="category-desc">{cat_data['description']}</div>
                <div class="category-stats">
                    <span><strong>{cat_data['co_count']}</strong> Change Orders</span>
                    <span><strong>{cat_data['project_count']}</strong> Projects</span>
                </div>
            </div>

            <div class="analysis-grid">
                <div class="analysis-box">
                    <h4>Root Causes</h4>
"""
        for cause, count in list(cat_data['root_causes'].items())[:8]:
            html += f"""
                    <div class="cause-item">
                        <span>{escape_html(cause)}</span>
                        <span class="cause-count">{count}</span>
                    </div>
"""
        html += """
                </div>
                <div class="analysis-box">
                    <h4>Typical Resolutions</h4>
"""
        for fix, count in list(cat_data['fixes'].items())[:6]:
            html += f"""
                    <div class="fix-item">
                        <span>{escape_html(fix)}</span>
                        <span class="fix-count">{count}</span>
                    </div>
"""
        html += """
                </div>
            </div>

            <div class="examples-section">
                <h4>Example RFIs (Full Text)</h4>
"""
        for ex in cat_data['examples'][:3]:
            question_escaped = escape_html(ex['question'])
            resolution_escaped = escape_html(ex['resolution']) if ex['resolution'] else "No resolution recorded"

            html += f"""
                <div class="example-card">
                    <div class="example-header">
                        <span class="example-rfi">{escape_html(ex['rfi_number'])}</span>
                        <span class="example-project">{escape_html(ex['project'])}</span>
                    </div>
                    <div class="example-question">{question_escaped}</div>
                    <div class="example-resolution"><strong>Resolution:</strong> {resolution_escaped}</div>
                    <div class="example-causes">
"""
            for cause in ex['root_causes'][:2]:  # Limit to avoid overflow
                html += f'                        <span class="cause-tag">{escape_html(cause[:150] + "..." if len(cause) > 150 else cause)}</span>\n'
            for fix in ex['fixes'][:2]:
                html += f'                        <span class="fix-tag">{escape_html(fix)}</span>\n'
            if ex.get('prevention_action'):
                html += f'                        <span class="fix-tag" style="background:#fef3c7;color:#92400e;">Prevention: {escape_html(ex["prevention_action"][:100])}</span>\n'
            html += """
                    </div>
                </div>
"""
        html += """
            </div>
        </div>
"""

    # Key insights - aggregate top causes
    top_causes = defaultdict(int)
    for cat in analysis['categories'].values():
        for cause, count in cat['root_causes'].items():
            top_causes[cause] += count
    sorted_causes = sorted(top_causes.items(), key=lambda x: x[1], reverse=True)[:5]

    html += """
        <div class="key-insights">
            <h2>Top Root Causes Across All Categories</h2>
"""
    for i, (cause, count) in enumerate(sorted_causes, 1):
        html += f"""
            <div class="insight-item">
                <strong>#{i}:</strong> {escape_html(cause)} <em>({count} occurrences)</em>
            </div>
"""
    html += """
            <div class="insight-item" style="margin-top: 20px;">
                <strong>Prevention Strategy:</strong> For TI/renovation projects, budget for existing condition surveys before concrete work.
                Verify embed/anchor locations with steel and MEP before pour. Request seismic anchorage details early if not shown on drawings.
            </div>
        </div>
    </div>
</body>
</html>
"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"HTML report saved: {output_path}")


async def main():
    print("Generating Concrete CO Report...")
    print("=" * 60)

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        print("Fetching concrete COs...")
        rfis = await fetch_concrete_cos(conn)
        print(f"Found {len(rfis)} concrete-related COs")

        print("Analyzing root causes with specific pattern matching...")
        analysis = analyze_cos(rfis)

        # Save JSON
        json_path = REPORTS_DIR / "concrete_co_analysis.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(analysis, f, indent=2, ensure_ascii=False)
        print(f"JSON saved: {json_path}")

        # Generate HTML
        html_path = REPORTS_DIR / "concrete_co_analysis.html"
        generate_html_report(analysis, html_path)

        print("\n" + "=" * 60)
        print("REPORT SUMMARY")
        print("=" * 60)
        print(f"\nTotal COs analyzed: {analysis['total_cos']}")
        print(f"Categories identified: {len(analysis['categories'])}")

        # Show top root causes
        top_causes = defaultdict(int)
        for cat in analysis['categories'].values():
            for cause, count in cat['root_causes'].items():
                top_causes[cause] += count

        print("\nTop Root Causes:")
        for cause, count in sorted(top_causes.items(), key=lambda x: x[1], reverse=True)[:5]:
            print(f"  - {cause}: {count}")

        print("\nBy Category:")
        for cat_id, cat_data in analysis['categories'].items():
            print(f"  - {cat_data['name']}: {cat_data['co_count']} COs across {cat_data['project_count']} projects")

        print(f"\nReports saved to: {REPORTS_DIR}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
