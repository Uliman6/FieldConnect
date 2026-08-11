#!/usr/bin/env python3
"""
Impact Scoring - Refined with User Calibration

Includes new dimensions based on user feedback:
- Applicability Scope (broad vs TI-specific vs narrow)
- Actionability (specific action vs general awareness)
- Root Cause Clarity (do we know WHY it happened?)
"""

import asyncio
import os
import sys
import json
import random
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg
from openai import AsyncOpenAI

REPORTS_DIR = Path(__file__).parent.parent / "reports"

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

REFINED_PROMPT = """You are a construction project analyst scoring RFIs for learning value.

RFI Question:
{question_text}

Resolution:
{resolution_text}

Project: {project}
Trade: {trade}

TASK: Score this RFI on LEARNING VALUE - can this teach us something useful for future projects?

Return JSON:
{{
    "learning_value": {{
        "score": <1-5>,
        "reasoning": "<why this score - be specific about what can be learned>"
    }},
    "applicability_scope": {{
        "level": "<broad|category_specific|narrow>",
        "reasoning": "<does this apply to most projects, only certain types (TI, new construction), or very specific situations?>",
        "project_types": ["<list project types this applies to: TI, new_construction, data_center, office, residential, etc.>"]
    }},
    "actionability": {{
        "level": "<high|medium|low>",
        "reasoning": "<is there a specific action we can take, or just general awareness?>",
        "specific_action": "<if high/medium, what specific action? e.g., 'Add to shop drawing review checklist', 'Survey existing conditions before design'>",
        "action_phase": "<design|preconstruction|submittal_review|construction|closeout>"
    }},
    "root_cause_clarity": {{
        "level": "<clear|partial|unknown>",
        "reasoning": "<do we understand WHY this happened?>",
        "root_cause": "<if clear/partial, what was the root cause?>"
    }},
    "impact_scope": {{
        "score": <1-5>,
        "trades_affected": ["<list trades>"]
    }},
    "rework_level": "<none|minor|significant|major>",
    "summary": {{
        "one_line": "<one sentence summary>",
        "is_routine": <true|false>
    }}
}}

SCORING GUIDE - Learning Value (1-5):

Score 5 (Critical - Must Learn):
- CLEAR root cause identified AND broadly applicable
- Specific actionable prevention exists
- Safety/structural/code issue that could recur
- Example: "Rebar spacing didn't meet seismic code - add seismic check to submittal review"

Score 4 (Important Lesson):
- Clear root cause OR broadly applicable (not necessarily both)
- Actionable insight available
- Significant rework/cost that was preventable
- Example: "PT cable blowout during stressing - implement pre-stress inspection protocol"

Score 3 (Worth Tracking):
- Category-specific lesson (TI, data center, etc.)
- Moderate actionability - general process improvement
- Coordination gap that happens occasionally
- Example: "CMU waterproofing missed in TI - add to TI-specific checklist"

Score 2 (Standard/Routine):
- Narrow scope - very specific situation
- Low actionability - "be careful" without specific action
- Missing detail that's expected to vary
- Example: "Blocking not shown - routine coordination"

Score 1 (No Learning Value):
- Pure clarification request
- Routine field condition
- Nothing actionable or transferable

APPLICABILITY SCOPE:
- broad: Applies to most construction projects
- category_specific: Only applies to certain project types (TI, new construction, data centers)
- narrow: Very specific situation unlikely to repeat

ACTIONABILITY:
- high: Specific checklist item or process change ("Add embed verification to pre-pour checklist")
- medium: General awareness that helps ("Check for existing utilities before excavation")
- low: No specific action possible ("Don't make mistakes")

ROOT CAUSE CLARITY:
- clear: We know exactly why this happened
- partial: We have some understanding but not complete
- unknown: RFI describes the problem but not why it occurred

BE CRITICAL: Most RFIs are score 1-2. Only score 4-5 if there's genuine, actionable, transferable learning."""


async def fetch_diverse_sample(conn, sample_size=60) -> list[dict]:
    """Fetch diverse sample ensuring multiple projects represented."""

    # Get project distribution
    project_counts = await conn.fetch("""
        SELECT source_project_name, COUNT(*) as cnt
        FROM intelligence.items
        WHERE resulted_in_co = true AND question_text IS NOT NULL
        GROUP BY source_project_name
        ORDER BY cnt DESC
    """)

    print("Project distribution:")
    for p in project_counts:
        print(f"  {p['source_project_name']}: {p['cnt']}")

    # Fetch high-value candidates from ALL projects (not just Southline)
    high_value_rows = await conn.fetch("""
        SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category
        FROM intelligence.items
        WHERE resulted_in_co = true
          AND question_text IS NOT NULL
          AND (
            question_text ILIKE '%blow%out%'
            OR question_text ILIKE '%crack%'
            OR question_text ILIKE '%damage%'
            OR question_text ILIKE '%fail%'
            OR question_text ILIKE '%miss%embed%'
            OR question_text ILIKE '%water%intru%'
            OR question_text ILIKE '%safety%'
            OR question_text ILIKE '%code%'
            OR question_text ILIKE '%seismic%'
            OR question_text ILIKE '%fire%rat%'
            OR question_text ILIKE '%rework%'
            OR question_text ILIKE '%remediation%'
            OR question_text ILIKE '%non%compliant%'
            OR question_text ILIKE '%tolerance%'
          )
        ORDER BY source_project_name, random()
    """)

    print(f"\nFound {len(high_value_rows)} potentially high-value RFIs")

    # Group by project and take proportionally
    by_project = {}
    for row in high_value_rows:
        proj = row['source_project_name']
        if proj not in by_project:
            by_project[proj] = []
        by_project[proj].append(dict(row))

    # Take up to 15 from each project for high-value
    selected = []
    for proj, rfis in by_project.items():
        n = min(15, len(rfis))
        selected.extend(random.sample(rfis, n))
        print(f"  Selected {n} high-value from {proj}")

    # Fill with random from underrepresented projects
    remaining = sample_size - len(selected)
    if remaining > 0:
        selected_ids = set(r['id'] for r in selected)

        # Prioritize non-Southline projects
        random_rows = await conn.fetch("""
            SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category
            FROM intelligence.items
            WHERE resulted_in_co = true
              AND question_text IS NOT NULL
              AND length(question_text) > 100
              AND source_project_name != 'Southline Office'
            ORDER BY random()
            LIMIT 30
        """)

        for row in random_rows:
            if row['id'] not in selected_ids and len(selected) < sample_size:
                selected.append(dict(row))
                selected_ids.add(row['id'])

    random.shuffle(selected)
    return selected[:sample_size]


async def score_rfi(rfi: dict, semaphore: asyncio.Semaphore) -> dict:
    """Score a single RFI with refined prompt."""
    async with semaphore:
        try:
            prompt = REFINED_PROMPT.format(
                question_text=rfi["question_text"][:3000],
                resolution_text=(rfi["resolution_text"] or "No resolution recorded")[:1500],
                trade=rfi["trade_category"] or "Not specified",
                project=rfi["source_project_name"]
            )

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a construction analyst. Be very critical - most RFIs have low learning value. Only score 4-5 if there's genuine, actionable, broadly applicable learning with clear root cause."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.15,
                max_tokens=900,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            result["rfi_id"] = str(rfi["id"])
            result["rfi_number"] = rfi["source_ref"]
            result["project"] = rfi["source_project_name"]
            result["trade"] = rfi["trade_category"]
            result["question_text"] = rfi["question_text"]
            result["resolution_text"] = rfi["resolution_text"]
            result["success"] = True
            result["tokens_used"] = {
                "input": response.usage.prompt_tokens,
                "output": response.usage.completion_tokens
            }

            return result

        except Exception as e:
            return {
                "rfi_id": str(rfi["id"]),
                "rfi_number": rfi["source_ref"],
                "project": rfi["source_project_name"],
                "success": False,
                "error": str(e)
            }


def escape_html(text):
    if not text:
        return ""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def generate_feedback_form(scored_rfis: list[dict], output_path: Path):
    """Generate feedback form sorted by learning value."""

    sorted_rfis = sorted(
        [r for r in scored_rfis if r.get("success")],
        key=lambda x: x.get("learning_value", {}).get("score", 0),
        reverse=True
    )

    # Count by project
    project_counts = {}
    for r in sorted_rfis:
        p = r.get("project", "Unknown")
        project_counts[p] = project_counts.get(p, 0) + 1

    html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Refined Impact Scoring</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; padding: 20px; line-height: 1.5; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #1a1a2e; margin-bottom: 10px; }
        .subtitle { color: #666; margin-bottom: 20px; }

        .stats-bar { background: #1e3a5f; color: white; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px; display: flex; gap: 25px; flex-wrap: wrap; }
        .stat { text-align: center; }
        .stat-value { font-size: 22px; font-weight: bold; }
        .stat-label { font-size: 11px; opacity: 0.8; }

        .project-bar { background: white; padding: 10px 15px; border-radius: 6px; margin-bottom: 20px; display: flex; gap: 15px; flex-wrap: wrap; }
        .project-tag { padding: 4px 10px; border-radius: 4px; font-size: 12px; background: #e0e7ff; color: #3730a3; }

        .section-header { padding: 10px 15px; border-radius: 6px; font-weight: bold; color: white; margin-top: 20px; margin-bottom: 10px; }
        .section-header.score-5 { background: #dc2626; }
        .section-header.score-4 { background: #ea580c; }
        .section-header.score-3 { background: #ca8a04; }
        .section-header.score-2 { background: #65a30d; }

        .rfi-card { background: white; border-radius: 8px; margin-bottom: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
        .rfi-header { background: #f8fafc; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; gap: 8px; }
        .rfi-id { font-weight: bold; color: #1e3a5f; }
        .rfi-project { background: #dbeafe; padding: 2px 8px; border-radius: 4px; font-size: 11px; color: #1e40af; }
        .score-badge { padding: 3px 10px; border-radius: 12px; font-weight: bold; font-size: 12px; color: white; }
        .score-badge.score-5 { background: #dc2626; }
        .score-badge.score-4 { background: #ea580c; }
        .score-badge.score-3 { background: #ca8a04; }

        .rfi-content { padding: 12px 15px; }
        .text-box { background: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 12px; max-height: 100px; overflow-y: auto; margin-bottom: 10px; border: 1px solid #e5e7eb; }

        .dimensions { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 10px; }
        .dim-box { background: #fefce8; padding: 8px; border-radius: 4px; border: 1px solid #fef08a; }
        .dim-label { font-size: 10px; color: #92400e; text-transform: uppercase; font-weight: 600; }
        .dim-value { font-size: 13px; color: #78350f; font-weight: 500; }
        .dim-detail { font-size: 11px; color: #a16207; margin-top: 2px; }

        .action-box { background: #ecfdf5; padding: 10px; border-radius: 4px; border: 1px solid #a7f3d0; margin-bottom: 10px; }
        .action-label { font-size: 10px; color: #065f46; text-transform: uppercase; font-weight: 600; }
        .action-value { font-size: 13px; color: #047857; }

        .feedback-section { background: #eff6ff; border: 2px solid #3b82f6; border-radius: 6px; padding: 12px; }
        .feedback-section h4 { color: #1e40af; margin-bottom: 10px; font-size: 13px; }
        .agree-row { display: flex; gap: 6px; margin-bottom: 10px; }
        .agree-btn { flex: 1; padding: 6px; border: 2px solid #e5e7eb; border-radius: 4px; background: white; cursor: pointer; font-size: 12px; }
        .agree-btn:hover { border-color: #3b82f6; }
        .agree-btn.selected.agree { background: #dcfce7; border-color: #22c55e; }
        .agree-btn.selected.disagree { background: #fee2e2; border-color: #ef4444; }
        .agree-btn.selected.partial { background: #fef3c7; border-color: #f59e0b; }

        .feedback-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .feedback-group label { display: block; font-size: 11px; font-weight: 600; color: #1e40af; margin-bottom: 3px; }
        .feedback-group select, .feedback-group textarea { width: 100%; padding: 6px; border: 1px solid #93c5fd; border-radius: 4px; font-size: 12px; }
        .feedback-group textarea { min-height: 40px; margin-top: 8px; }

        .export-section { background: #1e3a5f; color: white; border-radius: 8px; padding: 15px; margin-top: 25px; position: sticky; bottom: 15px; }
        .export-btn { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 8px; }
        .output-area { background: #0f172a; color: #e2e8f0; padding: 10px; border-radius: 4px; margin-top: 10px; font-family: monospace; font-size: 10px; max-height: 150px; overflow-y: auto; display: none; }
        .output-area.visible { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Refined Impact Scoring</h1>
        <p class="subtitle">With applicability scope, actionability, and root cause clarity</p>
"""

    # Stats
    score_counts = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
    for r in sorted_rfis:
        s = r.get("learning_value", {}).get("score", 0)
        if s in score_counts:
            score_counts[s] += 1

    html += f"""
        <div class="stats-bar">
            <div class="stat"><div class="stat-value">{len(sorted_rfis)}</div><div class="stat-label">Total</div></div>
            <div class="stat"><div class="stat-value" style="color:#fca5a5;">{score_counts[5]}</div><div class="stat-label">Score 5</div></div>
            <div class="stat"><div class="stat-value" style="color:#fdba74;">{score_counts[4]}</div><div class="stat-label">Score 4</div></div>
            <div class="stat"><div class="stat-value" style="color:#fde047;">{score_counts[3]}</div><div class="stat-label">Score 3</div></div>
            <div class="stat"><div class="stat-value" style="color:#bef264;">{score_counts[2]}</div><div class="stat-label">Score 2</div></div>
        </div>

        <div class="project-bar">
            <strong style="color:#64748b;font-size:12px;">Projects:</strong>
"""
    for proj, cnt in sorted(project_counts.items(), key=lambda x: x[1], reverse=True):
        html += f'<span class="project-tag">{proj[:20]}: {cnt}</span>'

    html += """
        </div>
        <div id="rfi-container">
"""

    current_score = None
    for idx, rfi in enumerate(sorted_rfis):
        score = rfi.get("learning_value", {}).get("score", 0)

        if score != current_score:
            current_score = score
            labels = {5: "CRITICAL (5)", 4: "IMPORTANT (4)", 3: "NOTABLE (3)", 2: "ROUTINE (2)", 1: "ROUTINE (1)"}
            html += f'<div class="section-header score-{score}">{labels.get(score, f"Score {score}")}</div>\n'

        lv = rfi.get("learning_value", {})
        app = rfi.get("applicability_scope", {})
        act = rfi.get("actionability", {})
        rc = rfi.get("root_cause_clarity", {})
        impact = rfi.get("impact_scope", {})
        summary = rfi.get("summary", {})

        html += f"""
            <div class="rfi-card" data-idx="{idx}">
                <div class="rfi-header">
                    <div>
                        <span class="rfi-id">{rfi.get('rfi_number', '?')}</span>
                        <span class="rfi-project">{rfi.get('project', '?')[:25]}</span>
                    </div>
                    <span class="score-badge score-{score}">Learning: {score}/5</span>
                </div>
                <div class="rfi-content">
                    <div class="text-box">{escape_html(rfi.get('question_text', '')[:600])}</div>

                    <div class="dimensions">
                        <div class="dim-box">
                            <div class="dim-label">Applicability</div>
                            <div class="dim-value">{app.get('level', '?').upper()}</div>
                            <div class="dim-detail">{', '.join(app.get('project_types', []))[:40]}</div>
                        </div>
                        <div class="dim-box">
                            <div class="dim-label">Actionability</div>
                            <div class="dim-value">{act.get('level', '?').upper()}</div>
                            <div class="dim-detail">{act.get('action_phase', '')}</div>
                        </div>
                        <div class="dim-box">
                            <div class="dim-label">Root Cause</div>
                            <div class="dim-value">{rc.get('level', '?').upper()}</div>
                            <div class="dim-detail">{escape_html(rc.get('root_cause', '')[:50])}</div>
                        </div>
                        <div class="dim-box">
                            <div class="dim-label">Impact</div>
                            <div class="dim-value">{impact.get('score', '?')}/5</div>
                            <div class="dim-detail">Rework: {rfi.get('rework_level', '?')}</div>
                        </div>
                    </div>
"""

        if act.get('specific_action'):
            html += f"""
                    <div class="action-box">
                        <div class="action-label">Specific Action</div>
                        <div class="action-value">{escape_html(act.get('specific_action', '')[:150])}</div>
                    </div>
"""

        html += f"""
                    <div style="font-size:12px;color:#64748b;margin-bottom:10px;">
                        <strong>Summary:</strong> {escape_html(summary.get('one_line', '')[:120])}<br>
                        <strong>Why this score:</strong> {escape_html(lv.get('reasoning', '')[:150])}
                    </div>

                    <div class="feedback-section">
                        <h4>Your Feedback</h4>
                        <div class="agree-row">
                            <button class="agree-btn" onclick="setAgreement({idx},'agree')">Agree</button>
                            <button class="agree-btn" onclick="setAgreement({idx},'partial')">Partial</button>
                            <button class="agree-btn" onclick="setAgreement({idx},'disagree')">Disagree</button>
                        </div>
                        <div class="feedback-row">
                            <div class="feedback-group">
                                <label>Your Learning Score</label>
                                <select id="learning-{idx}">
                                    <option value="">Keep ({score})</option>
                                    <option value="1">1</option><option value="2">2</option>
                                    <option value="3">3</option><option value="4">4</option><option value="5">5</option>
                                </select>
                            </div>
                            <div class="feedback-group">
                                <label>Applicability</label>
                                <select id="scope-{idx}">
                                    <option value="">Keep ({app.get('level', '?')})</option>
                                    <option value="broad">Broad</option>
                                    <option value="category_specific">Category-specific</option>
                                    <option value="narrow">Narrow</option>
                                </select>
                            </div>
                        </div>
                        <div class="feedback-group">
                            <textarea id="notes-{idx}" placeholder="Notes..."></textarea>
                        </div>
                    </div>
                </div>
            </div>
"""

    html += """
        </div>
        <div class="export-section">
            <button class="export-btn" onclick="exportFeedback()">Export JSON</button>
            <button class="export-btn" onclick="copyToClipboard()">Copy</button>
            <div class="output-area" id="output-area"></div>
        </div>
    </div>
    <script>
        const agreements = {};
        function setAgreement(idx, val) {
            agreements[idx] = val;
            const card = document.querySelector(`[data-idx="${idx}"]`);
            card.querySelectorAll('.agree-btn').forEach(b => b.classList.remove('selected','agree','disagree','partial'));
            event.target.classList.add('selected', val);
        }
        function exportFeedback() {
            const fb = [];
            document.querySelectorAll('.rfi-card').forEach((card, idx) => {
                if (!agreements[idx]) return;
                fb.push({
                    rfi_index: idx,
                    rfi_number: card.querySelector('.rfi-id').textContent,
                    project: card.querySelector('.rfi-project').textContent,
                    agreement: agreements[idx],
                    your_learning_score: document.getElementById(`learning-${idx}`).value || null,
                    your_scope: document.getElementById(`scope-${idx}`).value || null,
                    notes: document.getElementById(`notes-${idx}`).value || null
                });
            });
            const out = { feedback_date: new Date().toISOString(), total_reviewed: fb.length, feedback: fb };
            const area = document.getElementById('output-area');
            area.textContent = JSON.stringify(out, null, 2);
            area.classList.add('visible');
        }
        function copyToClipboard() {
            const area = document.getElementById('output-area');
            if (!area.textContent) exportFeedback();
            navigator.clipboard.writeText(area.textContent).then(() => alert('Copied!'));
        }
    </script>
</body>
</html>
"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Feedback form: {output_path}")


async def main():
    print("=" * 70)
    print("REFINED IMPACT SCORING")
    print("=" * 70)
    print("New dimensions: applicability, actionability, root cause clarity")
    print()

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        rfis = await fetch_diverse_sample(conn, sample_size=60)
        print(f"\nTotal to score: {len(rfis)}")

        # Count by project
        by_proj = {}
        for r in rfis:
            p = r['source_project_name']
            by_proj[p] = by_proj.get(p, 0) + 1
        print("\nSample distribution:")
        for p, c in sorted(by_proj.items(), key=lambda x: x[1], reverse=True):
            print(f"  {p}: {c}")

        print("\nScoring...")
        semaphore = asyncio.Semaphore(10)
        results = []
        for i in range(0, len(rfis), 10):
            batch = rfis[i:i+10]
            batch_results = await asyncio.gather(*[score_rfi(rfi, semaphore) for rfi in batch])
            results.extend(batch_results)
            print(f"  {min(i+10, len(rfis))}/{len(rfis)}")

        successful = [r for r in results if r.get("success")]

        total_input = sum(r.get("tokens_used", {}).get("input", 0) for r in successful)
        total_output = sum(r.get("tokens_used", {}).get("output", 0) for r in successful)
        cost = (total_input * 0.15 + total_output * 0.60) / 1_000_000
        print(f"\nCost: ${cost:.4f}")

        # Distribution
        score_dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        for r in successful:
            s = r.get("learning_value", {}).get("score", 0)
            if s in score_dist:
                score_dist[s] += 1

        print("\n" + "=" * 70)
        print("DISTRIBUTION")
        print("=" * 70)
        for s in [5, 4, 3, 2, 1]:
            print(f"  Score {s}: {score_dist[s]}")

        # Save
        output = {
            "generated_at": datetime.now().isoformat(),
            "cost_usd": cost,
            "score_distribution": score_dist,
            "results": successful
        }
        json_path = REPORTS_DIR / "impact_scoring_refined.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"\nResults: {json_path}")

        form_path = REPORTS_DIR / "impact_scoring_refined_feedback.html"
        generate_feedback_form(successful, form_path)

        # Show 5s and 4s
        print("\n" + "=" * 70)
        print("SCORE 5 (CRITICAL)")
        print("=" * 70)
        for r in successful:
            if r.get("learning_value", {}).get("score") == 5:
                print(f"\n{r['rfi_number']} ({r['project']})")
                print(f"  Summary: {r.get('summary', {}).get('one_line', '')[:80]}")
                print(f"  Applicability: {r.get('applicability_scope', {}).get('level')}")
                print(f"  Actionability: {r.get('actionability', {}).get('level')}")
                print(f"  Action: {r.get('actionability', {}).get('specific_action', '')[:80]}")

        print("\n" + "=" * 70)
        print("SCORE 4 (IMPORTANT)")
        print("=" * 70)
        for r in successful:
            if r.get("learning_value", {}).get("score") == 4:
                print(f"\n{r['rfi_number']} ({r['project']})")
                print(f"  Summary: {r.get('summary', {}).get('one_line', '')[:80]}")
                print(f"  Applicability: {r.get('applicability_scope', {}).get('level')}")
                print(f"  Action: {r.get('actionability', {}).get('specific_action', '')[:60]}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
