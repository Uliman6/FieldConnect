#!/usr/bin/env python3
"""
Re-score RFIs with more discriminating criteria.

Based on feedback:
- Score 5: ONLY for actual code violations, safety incidents, or damage that occurred
- Score 4.5: Preventable errors with clear lessons, but not critical
- Score 4 and below: Routine clarifications, coordination questions

Excludes already-validated Score 5 RFIs.
"""

import asyncio
import os
import sys
import json
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

# Already validated Score 5 RFIs - exclude from re-scoring
VALIDATED_SCORE_5 = [
    ("Southline Office", "RFI-2028"),  # Safety barrier - police rejection
    ("Southline Office", "RFI-1268"),  # Seismic code violation
    ("Southline Office", "RFI-1993"),  # Electrical code violation
    ("Southline Office", "RFI-2119"),  # Water intrusion elevator
]

DISCRIMINATING_PROMPT = """You are a construction analyst reviewing RFIs for lessons learned. Be VERY discriminating with scores.

RFI Question:
{question_text}

Resolution:
{resolution_text}

Project: {project}
Trade: {trade}
CO Amount: ${co_amount:,.0f}

TASK: Score this RFI's learning value. Most RFIs are routine (score 2-3). Reserve high scores for genuinely critical issues.

Return JSON:
{{
    "learning_value": {{
        "score": <1-5>,
        "reasoning": "<why this specific score>"
    }},
    "applicability_scope": {{
        "level": "<broad|category_specific|narrow>",
        "project_types": ["<which project types>"],
        "reasoning": "<who should know about this?>"
    }},
    "actionability": {{
        "level": "<high|medium|low>",
        "specific_action": "<concrete preventive action>",
        "action_phase": "<design|preconstruction|construction|closeout>"
    }},
    "root_cause_clarity": {{
        "level": "<clear|partial|unclear>",
        "root_cause": "<what actually caused this>"
    }},
    "summary": {{
        "one_line": "<one sentence summary>",
        "lesson_type": "<code_violation|safety_issue|damage_occurred|coordination_gap|design_error|field_discovery|scope_change|routine_clarification>"
    }}
}}

STRICT SCORING CRITERIA:

**SCORE 5 - CRITICAL** (Reserve for these ONLY):
- ACTUAL code violation discovered (not just clarification needed)
- Safety incident or near-miss that occurred
- Physical damage that happened (water intrusion, structural damage, equipment damage)
- Inspector rejection or failed inspection
- Required remediation of installed work due to non-compliance
Examples: "Police rejected installation", "Seismic code violation post-pour", "Water entered elevator shaft"

**SCORE 4.5 - IMPORTANT CHECK** (Use sparingly):
- Prevented a code violation through RFI (caught before it happened)
- Clear pattern that repeats across projects
- Expensive rework due to coordination failure
- Issue that could have caused safety problem if not caught
NOT for: Routine coordination, missing details, standard clarifications

**SCORE 4 - NOTABLE**:
- Coordination gap between trades with moderate cost impact
- Design error caught during construction
- Field conditions differ significantly from drawings
NOT for: Simple clarifications, expected TI conditions

**SCORE 3 - WORTH TRACKING**:
- Minor coordination issues
- Standard field discoveries
- Typical design clarifications

**SCORE 2 - ROUTINE**:
- "Please confirm dimension"
- "Detail not shown on drawing"
- Simple material substitution questions

**SCORE 1 - NO LEARNING**:
- Administrative questions
- Already-known issues being documented

BE DISCRIMINATING: If unsure between scores, choose the LOWER score. High CO amount alone does NOT justify high learning score - the LESSON must be valuable."""


async def fetch_rfis_to_rescore(conn) -> list[dict]:
    """Fetch RFIs to re-score, excluding validated ones."""

    # Build exclusion clause - use OR to exclude ANY of the validated RFIs
    exclusion_conditions = " OR ".join([
        f"(source_project_name = '{p}' AND source_ref = '{r}')"
        for p, r in VALIDATED_SCORE_5
    ])

    query = f"""
        SELECT id, source_ref, source_project_name,
               question_text, resolution_text, trade_category,
               cost_impact
        FROM intelligence.items
        WHERE cost_impact > 0
          AND question_text IS NOT NULL
          AND NOT ({exclusion_conditions})
        ORDER BY cost_impact DESC
        LIMIT 100
    """

    rows = await conn.fetch(query)
    return [dict(r) for r in rows]


async def score_rfi(rfi: dict, semaphore: asyncio.Semaphore) -> dict:
    """Score a single RFI with discriminating criteria."""
    async with semaphore:
        try:
            prompt = DISCRIMINATING_PROMPT.format(
                question_text=rfi["question_text"][:3000],
                resolution_text=(rfi["resolution_text"] or "No resolution recorded")[:1500],
                trade=rfi["trade_category"] or "Not specified",
                project=rfi["source_project_name"],
                co_amount=float(rfi["cost_impact"] or 0)
            )

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a discriminating construction analyst. Most RFIs are routine (score 2-3). Only give score 5 for ACTUAL violations, damage, or safety incidents that occurred. Score 4.5 is for important checks that prevented problems. Be skeptical of high scores."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,  # Lower temperature for more consistent scoring
                max_tokens=800,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            result["rfi_id"] = str(rfi["id"])
            result["rfi_number"] = rfi["source_ref"]
            result["project"] = rfi["source_project_name"]
            result["trade"] = rfi["trade_category"]
            result["co_amount"] = float(rfi["cost_impact"] or 0)
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
                "co_amount": float(rfi["cost_impact"] or 0),
                "success": False,
                "error": str(e)
            }


def generate_feedback_form(scored_rfis: list[dict], validated_5s: list[dict], output_path: Path):
    """Generate feedback form with new 5s and 4.5s."""

    # Separate by score
    new_5s = [r for r in scored_rfis if r.get("learning_value", {}).get("score") == 5]
    score_45s = [r for r in scored_rfis if r.get("learning_value", {}).get("score") == 4.5]
    score_4s = [r for r in scored_rfis if r.get("learning_value", {}).get("score") == 4][:20]  # Limit 4s

    # Sort by CO amount within each group
    new_5s.sort(key=lambda x: x.get("co_amount", 0), reverse=True)
    score_45s.sort(key=lambda x: x.get("co_amount", 0), reverse=True)
    score_4s.sort(key=lambda x: x.get("co_amount", 0), reverse=True)

    html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discriminating Scoring - Feedback Form</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; line-height: 1.5; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #fff; margin-bottom: 10px; }
        .subtitle { color: #94a3b8; margin-bottom: 20px; }

        .stats-bar { background: linear-gradient(135deg, #1e3a5f 0%, #312e81 100%); padding: 15px 20px; border-radius: 8px; margin-bottom: 20px; display: flex; gap: 25px; flex-wrap: wrap; }
        .stat { text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; }
        .stat-label { font-size: 11px; opacity: 0.8; }
        .stat-value.critical { color: #ef4444; }
        .stat-value.important { color: #f97316; }
        .stat-value.notable { color: #eab308; }

        .validated-section { background: #166534; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
        .validated-section h3 { color: #86efac; margin-bottom: 10px; }
        .validated-item { background: #14532d; padding: 8px 12px; border-radius: 4px; margin-bottom: 5px; font-size: 13px; }

        .section-header { padding: 12px 15px; border-radius: 6px; font-weight: bold; color: white; margin-top: 25px; margin-bottom: 12px; font-size: 16px; display: flex; justify-content: space-between; align-items: center; }
        .section-header.score-5 { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); }
        .section-header.score-45 { background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); }
        .section-header.score-4 { background: linear-gradient(135deg, #ca8a04 0%, #a16207 100%); }
        .section-count { background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 12px; font-size: 13px; }

        .rfi-card { background: #1e293b; border-radius: 8px; margin-bottom: 15px; overflow: hidden; border-left: 4px solid #475569; }
        .rfi-card.score-5 { border-left-color: #ef4444; }
        .rfi-card.score-45 { border-left-color: #f97316; }
        .rfi-card.score-4 { border-left-color: #eab308; }

        .rfi-header { background: #0f172a; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; cursor: pointer; }
        .rfi-header:hover { background: #1e293b; }
        .rfi-main { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .co-amount { font-size: 16px; font-weight: bold; color: #22c55e; min-width: 100px; }
        .rfi-id { font-weight: bold; color: #fff; }
        .rfi-project { background: #334155; padding: 3px 10px; border-radius: 4px; font-size: 11px; color: #94a3b8; }
        .lesson-type { padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
        .lesson-type.code_violation { background: #7f1d1d; color: #fecaca; }
        .lesson-type.safety_issue { background: #7f1d1d; color: #fecaca; }
        .lesson-type.damage_occurred { background: #7c2d12; color: #fed7aa; }
        .lesson-type.coordination_gap { background: #713f12; color: #fef08a; }
        .lesson-type.design_error { background: #365314; color: #d9f99d; }
        .lesson-type.routine_clarification { background: #1e3a5f; color: #93c5fd; }

        .score-badge { padding: 4px 12px; border-radius: 12px; font-weight: bold; font-size: 13px; color: white; }
        .score-badge.score-5 { background: #dc2626; }
        .score-badge.score-45 { background: #ea580c; }
        .score-badge.score-4 { background: #ca8a04; }

        .rfi-content { padding: 15px; display: none; }
        .rfi-content.open { display: block; }

        .text-box { background: #0f172a; padding: 12px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; border: 1px solid #334155; line-height: 1.6; max-height: 150px; overflow-y: auto; }
        .text-label { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 4px; text-transform: uppercase; }

        .analysis-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin: 15px 0; }
        .analysis-box { background: #0f172a; padding: 10px; border-radius: 6px; border: 1px solid #334155; }
        .analysis-label { font-size: 10px; color: #64748b; text-transform: uppercase; }
        .analysis-value { font-size: 14px; color: #e2e8f0; font-weight: 500; margin-top: 2px; }
        .analysis-detail { font-size: 12px; color: #94a3b8; margin-top: 4px; }

        .reasoning-box { background: #1e1b4b; border: 1px solid #4338ca; border-radius: 6px; padding: 12px; margin: 10px 0; }
        .reasoning-box .label { font-size: 10px; color: #a5b4fc; text-transform: uppercase; }
        .reasoning-box .text { font-size: 13px; color: #e0e7ff; margin-top: 4px; }

        .feedback-section { background: #1e3a5f; border: 2px solid #3b82f6; border-radius: 8px; padding: 15px; margin-top: 15px; }
        .feedback-section h4 { color: #93c5fd; margin-bottom: 12px; font-size: 13px; }
        .agree-row { display: flex; gap: 8px; margin-bottom: 12px; }
        .agree-btn { flex: 1; padding: 10px; border: 2px solid #475569; border-radius: 6px; background: #1e293b; color: #e2e8f0; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s; }
        .agree-btn:hover { border-color: #3b82f6; background: #1e3a5f; }
        .agree-btn.selected.agree { background: #166534; border-color: #22c55e; color: #86efac; }
        .agree-btn.selected.disagree { background: #7f1d1d; border-color: #ef4444; color: #fecaca; }
        .agree-btn.selected.partial { background: #713f12; border-color: #f59e0b; color: #fef3c7; }

        .feedback-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
        .feedback-group label { display: block; font-size: 12px; font-weight: 600; color: #93c5fd; margin-bottom: 4px; }
        .feedback-group select, .feedback-group textarea { width: 100%; padding: 8px; border: 1px solid #475569; border-radius: 6px; background: #0f172a; color: #e2e8f0; font-size: 13px; }
        .feedback-group textarea { min-height: 60px; resize: vertical; }

        .export-section { background: #1e293b; border-radius: 8px; padding: 15px 20px; margin-top: 30px; position: sticky; bottom: 15px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .export-btn { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; }
        .export-btn:hover { background: #2563eb; }
        .export-btn.secondary { background: #475569; }
        .output-area { flex: 1; min-width: 200px; background: #0f172a; color: #94a3b8; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 11px; max-height: 100px; overflow-y: auto; display: none; }
        .output-area.visible { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Discriminating Scoring - Review</h1>
        <p class="subtitle">Stricter criteria applied. Review NEW Score 5s and 4.5s.</p>

        <div class="stats-bar">
            <div class="stat"><div class="stat-value">{total}</div><div class="stat-label">Total Scored</div></div>
            <div class="stat"><div class="stat-value critical">{new_5s}</div><div class="stat-label">NEW Score 5</div></div>
            <div class="stat"><div class="stat-value important">{score_45s}</div><div class="stat-label">Score 4.5</div></div>
            <div class="stat"><div class="stat-value notable">{score_4s}</div><div class="stat-label">Score 4</div></div>
            <div class="stat"><div class="stat-value" style="color:#22c55e;">4</div><div class="stat-label">Already Validated 5s</div></div>
        </div>

        <div class="validated-section">
            <h3>Already Validated Score 5s (Not Shown)</h3>
"""

    for p, r in VALIDATED_SCORE_5:
        html += f'            <div class="validated-item">{r} ({p})</div>\n'

    html += """        </div>

        <div id="rfi-container">
"""

    idx = 0

    # New Score 5s
    if new_5s:
        html += f'<div class="section-header score-5">NEW CRITICAL (Score 5) <span class="section-count">{len(new_5s)} RFIs</span></div>\n'
        for rfi in new_5s:
            html += generate_rfi_card(rfi, idx, 5)
            idx += 1

    # Score 4.5s
    if score_45s:
        html += f'<div class="section-header score-45">IMPORTANT CHECKS (Score 4.5) <span class="section-count">{len(score_45s)} RFIs</span></div>\n'
        for rfi in score_45s[:30]:  # Limit to 30
            html += generate_rfi_card(rfi, idx, 4.5)
            idx += 1

    # Score 4s (sample)
    if score_4s:
        html += f'<div class="section-header score-4">NOTABLE (Score 4) - Sample <span class="section-count">{len(score_4s)} shown</span></div>\n'
        for rfi in score_4s:
            html += generate_rfi_card(rfi, idx, 4)
            idx += 1

    html += """
        </div>

        <div class="export-section">
            <button class="export-btn" onclick="exportFeedback()">Export Feedback</button>
            <button class="export-btn secondary" onclick="copyToClipboard()">Copy</button>
            <button class="export-btn secondary" onclick="expandAll()">Expand All</button>
            <div class="output-area" id="output-area"></div>
        </div>
    </div>

    <script>
        const agreements = {};

        function toggleCard(idx) {
            const content = document.getElementById('content-' + idx);
            content.classList.toggle('open');
        }

        function expandAll() {
            document.querySelectorAll('.rfi-content').forEach(c => c.classList.add('open'));
        }

        function setAgreement(idx, value) {
            agreements[idx] = value;
            const card = document.querySelector(`[data-idx="${idx}"]`);
            card.querySelectorAll('.agree-btn').forEach(btn => btn.classList.remove('selected', 'agree', 'disagree', 'partial'));
            event.target.classList.add('selected', value);
        }

        function exportFeedback() {
            const feedback = [];
            document.querySelectorAll('.rfi-card').forEach((card) => {
                const idx = card.dataset.idx;
                const agreement = agreements[idx];
                if (!agreement) return;

                feedback.push({
                    rfi_number: card.querySelector('.rfi-id').textContent,
                    project: card.querySelector('.rfi-project').textContent,
                    co_amount: card.querySelector('.co-amount').textContent,
                    current_score: card.querySelector('.score-badge').textContent,
                    agreement: agreement,
                    your_score: document.getElementById('score-' + idx)?.value || null,
                    notes: document.getElementById('notes-' + idx)?.value || null
                });
            });

            const output = {
                feedback_date: new Date().toISOString(),
                total_reviewed: feedback.length,
                feedback: feedback
            };

            const area = document.getElementById('output-area');
            area.textContent = JSON.stringify(output, null, 2);
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

    # Replace placeholders
    html = html.replace("{total}", str(len(scored_rfis)))
    html = html.replace("{new_5s}", str(len(new_5s)))
    html = html.replace("{score_45s}", str(len(score_45s)))
    html = html.replace("{score_4s}", str(len(score_4s)))

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Feedback form saved: {output_path}")


def generate_rfi_card(rfi: dict, idx: int, score: float) -> str:
    """Generate HTML for a single RFI card."""

    lv = rfi.get("learning_value", {})
    app = rfi.get("applicability_scope", {})
    act = rfi.get("actionability", {})
    rc = rfi.get("root_cause_clarity", {})
    summary = rfi.get("summary", {})

    score_class = f"score-{int(score)}" if score == int(score) else "score-45"
    lesson_type = summary.get("lesson_type", "unknown").replace("_", " ")
    lesson_class = summary.get("lesson_type", "unknown")

    return f"""
            <div class="rfi-card {score_class}" data-idx="{idx}">
                <div class="rfi-header" onclick="toggleCard({idx})">
                    <div class="rfi-main">
                        <span class="co-amount">${rfi.get('co_amount', 0):,.0f}</span>
                        <span class="rfi-id">{escape_html(rfi.get('rfi_number', ''))}</span>
                        <span class="rfi-project">{escape_html(rfi.get('project', '')[:30])}</span>
                        <span class="lesson-type {lesson_class}">{lesson_type}</span>
                    </div>
                    <span class="score-badge {score_class}">Score {score}</span>
                </div>
                <div class="rfi-content" id="content-{idx}">
                    <div class="text-label">Question</div>
                    <div class="text-box">{escape_html((rfi.get('question_text') or '')[:800])}</div>

                    <div class="text-label">Resolution</div>
                    <div class="text-box">{escape_html((rfi.get('resolution_text') or 'No resolution')[:400])}</div>

                    <div class="reasoning-box">
                        <div class="label">AI Summary</div>
                        <div class="text">{escape_html(summary.get('one_line', ''))}</div>
                    </div>

                    <div class="analysis-grid">
                        <div class="analysis-box">
                            <div class="analysis-label">Applicability</div>
                            <div class="analysis-value">{app.get('level', '?').upper()}</div>
                            <div class="analysis-detail">{', '.join(app.get('project_types', []))[:50]}</div>
                        </div>
                        <div class="analysis-box">
                            <div class="analysis-label">Actionability</div>
                            <div class="analysis-value">{act.get('level', '?').upper()}</div>
                            <div class="analysis-detail">{escape_html((act.get('specific_action') or '')[:60])}</div>
                        </div>
                        <div class="analysis-box">
                            <div class="analysis-label">Root Cause</div>
                            <div class="analysis-value">{rc.get('level', '?').upper()}</div>
                            <div class="analysis-detail">{escape_html((rc.get('root_cause') or '')[:60])}</div>
                        </div>
                    </div>

                    <div class="reasoning-box">
                        <div class="label">Learning Value Reasoning</div>
                        <div class="text">{escape_html(lv.get('reasoning', ''))}</div>
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
                                <label>Your Score</label>
                                <select id="score-{idx}">
                                    <option value="">Keep as {score}</option>
                                    <option value="5">5 - Critical</option>
                                    <option value="4.5">4.5 - Important Check</option>
                                    <option value="4">4 - Notable</option>
                                    <option value="3">3 - Worth Tracking</option>
                                    <option value="2">2 - Routine</option>
                                </select>
                            </div>
                            <div class="feedback-group">
                                <label>Notes</label>
                                <textarea id="notes-{idx}" placeholder="Why agree/disagree?"></textarea>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
"""


def escape_html(text):
    if not text:
        return ""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


async def main():
    print("=" * 80)
    print("DISCRIMINATING RE-SCORING")
    print("=" * 80)
    print("Stricter criteria: Score 5 ONLY for actual violations/damage/safety")
    print(f"Excluding {len(VALIDATED_SCORE_5)} already-validated Score 5 RFIs")
    print()

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Fetch RFIs
        rfis = await fetch_rfis_to_rescore(conn)
        print(f"RFIs to re-score: {len(rfis)}")

        # Score with LLM
        print("\nScoring with discriminating criteria...")
        semaphore = asyncio.Semaphore(10)

        results = []
        for i in range(0, len(rfis), 10):
            batch = rfis[i:i+10]
            batch_results = await asyncio.gather(
                *[score_rfi(rfi, semaphore) for rfi in batch]
            )
            results.extend(batch_results)
            print(f"  Processed {min(i+10, len(rfis))}/{len(rfis)}")

        successful = [r for r in results if r.get("success")]

        # Calculate cost
        total_input = sum(r.get("tokens_used", {}).get("input", 0) for r in successful)
        total_output = sum(r.get("tokens_used", {}).get("output", 0) for r in successful)
        cost = (total_input * 0.15 + total_output * 0.60) / 1_000_000

        print(f"\nScoring complete: {len(successful)} successful, ${cost:.4f}")

        # Distribution
        score_dist = {5: 0, 4.5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
        for r in successful:
            score = r.get("learning_value", {}).get("score", 0)
            if score in score_dist:
                score_dist[score] += 1

        print("\n" + "=" * 80)
        print("SCORE DISTRIBUTION (Discriminating)")
        print("=" * 80)
        for score in [5, 4.5, 4, 3, 2, 1]:
            bar = "#" * score_dist[score]
            print(f"  Score {score}: {score_dist[score]:3d} {bar}")

        # Show new 5s
        new_5s = [r for r in successful if r.get("learning_value", {}).get("score") == 5]
        if new_5s:
            print("\n" + "=" * 80)
            print(f"NEW SCORE 5 RFIs ({len(new_5s)})")
            print("=" * 80)
            for r in sorted(new_5s, key=lambda x: x.get("co_amount", 0), reverse=True):
                lesson = r.get("summary", {}).get("lesson_type", "unknown")
                print(f"\n${r['co_amount']:>12,.0f} | {r['rfi_number']} ({r['project'][:25]})")
                print(f"  Type: {lesson}")
                print(f"  Summary: {r.get('summary', {}).get('one_line', '')[:80]}")
                print(f"  Why 5: {r.get('learning_value', {}).get('reasoning', '')[:100]}")

        # Save results
        output = {
            "generated_at": datetime.now().isoformat(),
            "scoring_type": "discriminating",
            "validated_5s": [{"project": p, "rfi": r} for p, r in VALIDATED_SCORE_5],
            "total_scored": len(successful),
            "cost_usd": cost,
            "score_distribution": score_dist,
            "results": successful
        }

        json_path = REPORTS_DIR / "discriminating_scoring.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"\nResults saved: {json_path}")

        # Generate feedback form
        form_path = REPORTS_DIR / "discriminating_feedback.html"
        generate_feedback_form(successful, VALIDATED_SCORE_5, form_path)

    finally:
        await conn.close()

    print("\n" + "=" * 80)
    print("DONE - Open the feedback form to review")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
