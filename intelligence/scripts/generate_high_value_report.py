#!/usr/bin/env python3
"""
Generate High-Value RFI Report

Focuses ONLY on high-priority RFIs that can teach us something:
- Field errors/damage
- Concrete misplacement
- Owner requests (track patterns)
- Safety/code violations

Filters out routine "missing detail" and "field conditions differ" noise.
"""

import asyncio
import os
import sys
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


def escape_html(text: str) -> str:
    """Escape HTML special characters."""
    if not text:
        return ""
    return (text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;"))


async def main():
    print("=" * 70)
    print("HIGH-VALUE RFI REPORT")
    print("=" * 70)

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Fetch high-value RFIs
        rows = await conn.fetch("""
            SELECT
                source_ref,
                source_project_name,
                question_text,
                resolution_text,
                trade_category,
                cost_impact,
                llm_root_cause
            FROM intelligence.items
            WHERE resulted_in_co = true
              AND llm_root_cause->>'priority' = 'high'
            ORDER BY
                llm_root_cause->>'issue_type',
                source_project_name,
                source_ref
        """)

        print(f"Found {len(rows)} high-value RFIs")

        # Also fetch some medium priority for comparison
        medium_rows = await conn.fetch("""
            SELECT
                source_ref,
                source_project_name,
                question_text,
                resolution_text,
                trade_category,
                llm_root_cause
            FROM intelligence.items
            WHERE resulted_in_co = true
              AND llm_root_cause->>'priority' = 'medium'
            ORDER BY source_project_name, source_ref
            LIMIT 20
        """)

        print(f"Found {len(medium_rows)} medium-priority RFIs (showing 20)")

        # Group by issue type
        by_issue_type = defaultdict(list)
        for row in rows:
            rfi = dict(row)
            llm_data = rfi.get("llm_root_cause") or {}
            if isinstance(llm_data, str):
                llm_data = json.loads(llm_data)
            issue_type = llm_data.get("issue_type", "Unknown")
            by_issue_type[issue_type].append(rfi)

        # Group medium by issue type too
        medium_by_type = defaultdict(list)
        for row in medium_rows:
            rfi = dict(row)
            llm_data = rfi.get("llm_root_cause") or {}
            if isinstance(llm_data, str):
                llm_data = json.loads(llm_data)
            issue_type = llm_data.get("issue_type", "Unknown")
            medium_by_type[issue_type].append(rfi)

        # Generate HTML report
        html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>High-Value RFI Analysis</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f0f2f5;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        .container { max-width: 1200px; margin: 0 auto; }

        h1 { color: #1a1a2e; margin-bottom: 5px; }
        .subtitle { color: #666; margin-bottom: 30px; }

        .summary-box {
            background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
            color: white;
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 30px;
        }
        .summary-box h2 { margin-bottom: 15px; }
        .summary-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 20px;
        }
        .stat { text-align: center; }
        .stat-value { font-size: 36px; font-weight: bold; }
        .stat-label { opacity: 0.8; font-size: 14px; }

        .issue-section {
            background: white;
            border-radius: 12px;
            margin-bottom: 25px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .issue-header {
            background: #dc2626;
            color: white;
            padding: 20px;
        }
        .issue-header.medium {
            background: #d97706;
        }
        .issue-title { font-size: 20px; margin-bottom: 5px; }
        .issue-count { opacity: 0.9; font-size: 14px; }

        .rfi-card {
            padding: 20px;
            border-bottom: 1px solid #eee;
        }
        .rfi-card:last-child { border-bottom: none; }

        .rfi-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            flex-wrap: wrap;
            gap: 10px;
        }
        .rfi-id {
            font-weight: bold;
            font-size: 16px;
            color: #1a1a2e;
        }
        .rfi-project {
            background: #e5e7eb;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 13px;
            color: #374151;
        }
        .rfi-trade {
            background: #dbeafe;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 13px;
            color: #1e40af;
        }

        .rfi-question {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 15px;
            font-size: 14px;
            border-left: 4px solid #dc2626;
        }
        .rfi-resolution {
            background: #f0fdf4;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 15px;
            font-size: 14px;
            border-left: 4px solid #22c55e;
        }
        .rfi-resolution strong { color: #166534; }

        .llm-insight {
            background: #fef3c7;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #f59e0b;
        }
        .llm-insight .label {
            font-weight: 600;
            color: #92400e;
            font-size: 12px;
            text-transform: uppercase;
            margin-bottom: 5px;
        }
        .llm-insight .condition { color: #78350f; margin-bottom: 8px; }
        .llm-insight .impact { color: #a16207; font-size: 13px; }

        .analysis-prompt {
            background: #fef2f2;
            padding: 15px;
            border-radius: 8px;
            margin-top: 15px;
            border: 2px dashed #dc2626;
        }
        .analysis-prompt strong { color: #991b1b; }

        .key-questions {
            background: #1a1a2e;
            color: white;
            border-radius: 12px;
            padding: 25px;
            margin-top: 30px;
        }
        .key-questions h2 { margin-bottom: 15px; }
        .question-item {
            background: rgba(255,255,255,0.1);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 10px;
        }
        .question-item:last-child { margin-bottom: 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>High-Value RFI Analysis</h1>
        <p class="subtitle">Focus on RFIs that can teach us something - not routine noise</p>

        <div class="summary-box">
            <h2>Why These RFIs Matter</h2>
            <p style="margin-bottom: 20px; opacity: 0.9;">
                These are NOT routine "missing detail" or "field conditions differ" RFIs.
                These are issues that could cause significant harm, weren't caught early,
                or show patterns we can learn from.
            </p>
            <div class="summary-stats">
                <div class="stat">
                    <div class="stat-value">""" + str(len(rows)) + """</div>
                    <div class="stat-label">High-Value RFIs</div>
                </div>
                <div class="stat">
                    <div class="stat-value">""" + str(len(by_issue_type)) + """</div>
                    <div class="stat-label">Issue Categories</div>
                </div>
                <div class="stat">
                    <div class="stat-value">""" + str(len(set(r["source_project_name"] for r in rows))) + """</div>
                    <div class="stat-label">Projects Affected</div>
                </div>
            </div>
        </div>
"""

        # Add sections for each high-value issue type
        for issue_type, rfis in sorted(by_issue_type.items(), key=lambda x: len(x[1]), reverse=True):
            projects = list(set(r["source_project_name"] for r in rfis))

            html += f"""
        <div class="issue-section">
            <div class="issue-header">
                <div class="issue-title">{escape_html(issue_type)}</div>
                <div class="issue-count">{len(rfis)} RFIs across {len(projects)} projects</div>
            </div>
"""
            # Show RFIs - diverse projects
            shown_projects = set()
            shown_count = 0
            for rfi in rfis:
                # Prioritize showing different projects
                if rfi["source_project_name"] in shown_projects and shown_count >= 3:
                    continue

                shown_projects.add(rfi["source_project_name"])
                shown_count += 1

                llm_data = rfi.get("llm_root_cause") or {}
                if isinstance(llm_data, str):
                    llm_data = json.loads(llm_data)

                specific_condition = llm_data.get("specific_condition", "")
                impact = llm_data.get("impact", "")
                analysis_notes = llm_data.get("analysis_notes", "")

                html += f"""
            <div class="rfi-card">
                <div class="rfi-header">
                    <span class="rfi-id">{escape_html(rfi['source_ref'])}</span>
                    <span class="rfi-project">{escape_html(rfi['source_project_name'])}</span>
                    <span class="rfi-trade">{escape_html(rfi['trade_category'] or 'Not specified')}</span>
                </div>

                <div class="rfi-question">{escape_html(rfi['question_text'] or '')}</div>

                <div class="rfi-resolution">
                    <strong>Resolution:</strong> {escape_html(rfi['resolution_text'] or 'No resolution recorded')}
                </div>
"""
                if specific_condition or impact:
                    html += f"""
                <div class="llm-insight">
                    <div class="label">LLM Analysis</div>
                    <div class="condition"><strong>Condition:</strong> {escape_html(specific_condition)}</div>
                    <div class="impact"><strong>Impact:</strong> {escape_html(impact)}</div>
                </div>
"""

                if analysis_notes:
                    html += f"""
                <div class="analysis-prompt">
                    <strong>{escape_html(analysis_notes)}</strong>
                </div>
"""
                html += """
            </div>
"""

                if shown_count >= 5:  # Max 5 per category
                    break

            html += """
        </div>
"""

        # Add medium priority section
        if medium_by_type:
            html += """
        <h2 style="margin: 30px 0 20px; color: #1a1a2e;">Medium Priority - Worth Tracking</h2>
"""
            for issue_type, rfis in sorted(medium_by_type.items(), key=lambda x: len(x[1]), reverse=True)[:2]:
                html += f"""
        <div class="issue-section">
            <div class="issue-header medium">
                <div class="issue-title">{escape_html(issue_type)}</div>
                <div class="issue-count">{len(rfis)} examples</div>
            </div>
"""
                # Show 2 examples per type, diverse projects
                shown_projects = set()
                for rfi in rfis[:4]:
                    if rfi["source_project_name"] in shown_projects:
                        continue
                    shown_projects.add(rfi["source_project_name"])

                    html += f"""
            <div class="rfi-card">
                <div class="rfi-header">
                    <span class="rfi-id">{escape_html(rfi['source_ref'])}</span>
                    <span class="rfi-project">{escape_html(rfi['source_project_name'])}</span>
                </div>
                <div class="rfi-question">{escape_html((rfi['question_text'] or '')[:500])}</div>
            </div>
"""
                    if len(shown_projects) >= 2:
                        break

                html += """
        </div>
"""

        # Key questions section
        html += """
        <div class="key-questions">
            <h2>Questions to Investigate</h2>

            <div class="question-item">
                <strong>For Field Errors/Damage:</strong><br>
                What caused the failure? Was there a sequence issue? Material defect?
                Has this happened on other projects with similar conditions?
            </div>

            <div class="question-item">
                <strong>For Concrete Misplacement:</strong><br>
                Why was concrete placed incorrectly? Survey error? Communication gap?
                What was the fix cost compared to getting it right the first time?
            </div>

            <div class="question-item">
                <strong>For Owner Requests:</strong><br>
                Who is this owner? Have they made similar requests on other projects?
                Can we anticipate this for future bids?
            </div>

            <div class="question-item">
                <strong>For Safety/Code Violations:</strong><br>
                How did this get missed in design review? What process change would catch it earlier?
            </div>
        </div>
    </div>
</body>
</html>
"""

        # Save HTML
        html_path = REPORTS_DIR / "high_value_rfis.html"
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"\nHTML report saved: {html_path}")

        # Save JSON
        json_output = {
            "generated_at": datetime.now().isoformat(),
            "total_high_value": len(rows),
            "by_issue_type": {
                issue_type: [{
                    "rfi_number": r["source_ref"],
                    "project": r["source_project_name"],
                    "trade": r["trade_category"],
                    "question": r["question_text"],
                    "resolution": r["resolution_text"],
                    "llm_data": r.get("llm_root_cause")
                } for r in rfis]
                for issue_type, rfis in by_issue_type.items()
            }
        }
        json_path = REPORTS_DIR / "high_value_rfis.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(json_output, f, indent=2, ensure_ascii=False, default=str)
        print(f"JSON data saved: {json_path}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
