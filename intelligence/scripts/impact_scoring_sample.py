#!/usr/bin/env python3
"""
Impact Scoring - Sample Extraction

Pulls 50 diverse RFIs and runs them through LLM with impact-focused scoring.
Generates interactive feedback form for user calibration.
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
REPORTS_DIR.mkdir(exist_ok=True)

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

IMPACT_SCORING_PROMPT = """You are a construction project analyst. Analyze this RFI that resulted in a change order.

RFI Question:
{question_text}

Resolution:
{resolution_text}

Project: {project}
Trade: {trade}

TASK: Score this RFI on impact and learning value. BE DISCRIMINATING - most RFIs are routine (1-2), but some genuinely deserve high scores (4-5).

Return JSON:
{{
    "impact_scope": {{
        "score": <1-5>,
        "reasoning": "<why this score>",
        "trades_affected": ["<list trades that had to adjust>"]
    }},
    "rework_level": {{
        "level": "<none|minor|significant|major>",
        "reasoning": "<what existing work was undone or redone?>",
        "rework_description": "<specific rework if any>"
    }},
    "cost_driver": {{
        "type": "<clarification|adjustment|rework|redesign|scope_addition>",
        "reasoning": "<why this classification>"
    }},
    "learning_value": {{
        "score": <1-5>,
        "reasoning": "<can we prevent this on future projects? be specific>",
        "prevention_action": "<specific action to prevent recurrence>"
    }},
    "root_cause_depth": {{
        "level": "<surface|process|systemic>",
        "reasoning": "<is this a missing detail, coordination gap, or design flaw?>"
    }},
    "cascade_risk": {{
        "has_cascade": <true|false>,
        "reasoning": "<did this change trigger other changes? affect fire ratings, smoke compartments, other systems?>"
    }},
    "summary": {{
        "one_line": "<one sentence summary of the actual issue>",
        "is_routine": <true|false>,
        "why_or_why_not": "<explain why this is or isn't routine>"
    }}
}}

SCORING GUIDE - Learning Value (1-5):
- 1: Completely routine - "please confirm dimension", simple clarification
- 2: Standard occurrence - missing detail, typical TI existing conditions differ
- 3: Worth tracking - notable coordination gap, could improve process
- 4: Important lesson - FIELD ERROR, expensive rework, preventable with better process
- 5: Critical - DAMAGE, SAFETY ISSUE, CASCADE EFFECT, must prevent recurrence

HIGH VALUE SIGNALS (score 4-5):
- Field damage: PT cable blowout, concrete cracking, spalling, structural damage
- Construction errors: Concrete placed wrong, embeds missed, sleeves damaged
- Cascade effects: One change forces multiple trades to rework (fire ratings, smoke compartments)
- Safety/code violations discovered in field
- Expensive remediation: Coring through PT beams, major rework
- Repeated failures: Same issue on multiple pours or locations

LOW VALUE SIGNALS (score 1-2):
- "Please confirm..." simple clarifications
- "Detail not shown on drawings" - routine missing info
- "Existing conditions differ" in TI projects - expected
- Single trade adjusts slightly - no rework

Impact Scope (1-5):
- 1: Single trade, simple confirmation
- 2: Single trade, minor adjustment
- 3: Multiple trades coordinate
- 4: Multiple systems affected, significant work
- 5: Cascade across building systems, major rework

Root Cause Depth:
- surface: Missing detail on drawings (routine)
- process: Coordination gap between trades/phases (notable)
- systemic: Fundamental design flaw, repeated failure, or field error (critical)"""


async def fetch_diverse_sample(conn, sample_size=50) -> list[dict]:
    """Fetch a diverse sample of RFIs across projects and categories."""

    # Get all CO RFIs
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
          AND length(question_text) > 100
        ORDER BY source_project_name, source_ref
    """)

    all_rfis = [dict(r) for r in rows]

    # Group by project
    by_project = {}
    for rfi in all_rfis:
        proj = rfi["source_project_name"]
        if proj not in by_project:
            by_project[proj] = []
        by_project[proj].append(rfi)

    print(f"Found {len(all_rfis)} RFIs across {len(by_project)} projects")

    # Sample proportionally from each project, ensuring diversity
    sample = []
    projects = list(by_project.keys())

    # First, ensure at least 3 from each project (if available)
    for proj in projects:
        proj_rfis = by_project[proj]
        n_from_proj = min(3, len(proj_rfis))
        sample.extend(random.sample(proj_rfis, n_from_proj))

    # Fill remaining slots randomly
    remaining = sample_size - len(sample)
    if remaining > 0:
        already_sampled = set(r["id"] for r in sample)
        candidates = [r for r in all_rfis if r["id"] not in already_sampled]
        if candidates:
            additional = random.sample(candidates, min(remaining, len(candidates)))
            sample.extend(additional)

    # Shuffle to mix projects
    random.shuffle(sample)

    return sample[:sample_size]


async def score_rfi(rfi: dict, semaphore: asyncio.Semaphore) -> dict:
    """Score a single RFI using GPT-4o-mini."""
    async with semaphore:
        try:
            prompt = IMPACT_SCORING_PROMPT.format(
                question_text=rfi["question_text"][:3000],
                resolution_text=(rfi["resolution_text"] or "No resolution recorded")[:1500],
                trade=rfi["trade_category"] or "Not specified",
                project=rfi["source_project_name"]
            )

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a construction project analyst assessing RFI impact and learning value. Be critical - most RFIs are routine."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=800,
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


def generate_feedback_form(scored_rfis: list[dict], output_path: Path):
    """Generate interactive HTML feedback form."""

    html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Impact Scoring Feedback</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f0f2f5;
            padding: 20px;
            line-height: 1.5;
            color: #333;
        }
        .container { max-width: 1200px; margin: 0 auto; }

        h1 { color: #1a1a2e; margin-bottom: 10px; }
        .subtitle { color: #666; margin-bottom: 20px; }

        .instructions {
            background: #e8f4fd;
            border: 1px solid #b8daff;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 25px;
        }
        .instructions h3 { color: #004085; margin-bottom: 10px; }
        .instructions p { color: #004085; margin-bottom: 8px; }

        .progress-bar {
            background: #e5e7eb;
            height: 10px;
            border-radius: 5px;
            margin-bottom: 10px;
            overflow: hidden;
        }
        .progress-fill {
            background: linear-gradient(90deg, #10b981, #059669);
            height: 100%;
            transition: width 0.3s;
        }
        .progress-text { text-align: center; color: #666; margin-bottom: 20px; }

        .rfi-card {
            background: white;
            border-radius: 12px;
            margin-bottom: 25px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .rfi-header {
            background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%);
            color: white;
            padding: 15px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
        }
        .rfi-id { font-weight: bold; font-size: 16px; }
        .rfi-project {
            background: rgba(255,255,255,0.2);
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 13px;
        }

        .rfi-content { padding: 20px; }

        .text-section {
            margin-bottom: 15px;
        }
        .text-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #666;
            margin-bottom: 5px;
            font-weight: 600;
        }
        .text-box {
            background: #f8f9fa;
            padding: 12px;
            border-radius: 6px;
            font-size: 13px;
            max-height: 150px;
            overflow-y: auto;
            border: 1px solid #e9ecef;
        }
        .text-box.resolution {
            background: #f0fdf4;
            border-color: #bbf7d0;
        }

        .llm-scores {
            background: #fefce8;
            border: 1px solid #fef08a;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
        }
        .llm-scores h4 {
            color: #854d0e;
            margin-bottom: 12px;
            font-size: 14px;
        }

        .score-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
        }
        .score-item {
            background: white;
            padding: 10px;
            border-radius: 6px;
            border: 1px solid #fef08a;
        }
        .score-label {
            font-size: 11px;
            color: #92400e;
            text-transform: uppercase;
            margin-bottom: 4px;
        }
        .score-value {
            font-weight: bold;
            color: #1a1a2e;
            font-size: 14px;
        }
        .score-reasoning {
            font-size: 12px;
            color: #666;
            margin-top: 4px;
        }

        .llm-summary {
            background: #fef3c7;
            padding: 12px;
            border-radius: 6px;
            margin-top: 12px;
        }
        .llm-summary .label { font-weight: 600; color: #92400e; }
        .llm-summary .value { color: #78350f; }
        .routine-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
            margin-left: 8px;
        }
        .routine-badge.yes { background: #dcfce7; color: #166534; }
        .routine-badge.no { background: #fee2e2; color: #991b1b; }

        .feedback-section {
            background: #eff6ff;
            border: 2px solid #3b82f6;
            border-radius: 8px;
            padding: 20px;
        }
        .feedback-section h4 {
            color: #1e40af;
            margin-bottom: 15px;
        }

        .feedback-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 15px;
        }
        @media (max-width: 600px) {
            .feedback-row { grid-template-columns: 1fr; }
        }

        .feedback-group label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: #1e40af;
            margin-bottom: 5px;
        }
        .feedback-group select, .feedback-group input, .feedback-group textarea {
            width: 100%;
            padding: 8px 10px;
            border: 1px solid #93c5fd;
            border-radius: 6px;
            font-size: 14px;
            font-family: inherit;
        }
        .feedback-group select:focus, .feedback-group input:focus, .feedback-group textarea:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
        }
        .feedback-group textarea {
            min-height: 60px;
            resize: vertical;
        }
        .feedback-group .hint {
            font-size: 11px;
            color: #6b7280;
            margin-top: 3px;
        }

        .agree-row {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        }
        .agree-btn {
            flex: 1;
            padding: 10px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            background: white;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
        }
        .agree-btn:hover { border-color: #3b82f6; }
        .agree-btn.selected.agree {
            background: #dcfce7;
            border-color: #22c55e;
            color: #166534;
        }
        .agree-btn.selected.disagree {
            background: #fee2e2;
            border-color: #ef4444;
            color: #991b1b;
        }
        .agree-btn.selected.partial {
            background: #fef3c7;
            border-color: #f59e0b;
            color: #92400e;
        }

        .export-section {
            background: #1e3a5f;
            color: white;
            border-radius: 12px;
            padding: 25px;
            margin-top: 30px;
            position: sticky;
            bottom: 20px;
        }
        .export-section h3 { margin-bottom: 15px; }
        .export-btn {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            margin-right: 10px;
        }
        .export-btn:hover { background: #2563eb; }
        .export-btn.secondary {
            background: transparent;
            border: 2px solid #3b82f6;
        }

        .output-area {
            background: #0f172a;
            color: #e2e8f0;
            padding: 15px;
            border-radius: 8px;
            margin-top: 15px;
            font-family: monospace;
            font-size: 12px;
            max-height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
            display: none;
        }
        .output-area.visible { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Impact Scoring Calibration</h1>
        <p class="subtitle">Review LLM scores and provide feedback to calibrate the model</p>

        <div class="instructions">
            <h3>How to provide feedback:</h3>
            <p><strong>1. Review the RFI</strong> - Read the question and resolution</p>
            <p><strong>2. Check LLM scores</strong> - See how the model scored impact, learning value, etc.</p>
            <p><strong>3. Agree/Disagree/Partial</strong> - Tell us if the scoring is right</p>
            <p><strong>4. Correct if needed</strong> - Provide your scores if you disagree</p>
            <p><strong>5. Add notes</strong> - Explain your reasoning for corrections</p>
        </div>

        <div class="progress-text">Reviewed: <span id="progress-count">0</span> / <span id="total-count">""" + str(len(scored_rfis)) + """</span></div>
        <div class="progress-bar">
            <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
        </div>

        <div id="rfi-container">
"""

    for idx, rfi in enumerate(scored_rfis):
        if not rfi.get("success"):
            continue

        impact_score = rfi.get("impact_scope", {}).get("score", "?")
        learning_score = rfi.get("learning_value", {}).get("score", "?")
        rework_level = rfi.get("rework_level", {}).get("level", "?")
        cost_driver = rfi.get("cost_driver", {}).get("type", "?")
        root_depth = rfi.get("root_cause_depth", {}).get("level", "?")
        is_routine = rfi.get("summary", {}).get("is_routine", True)
        one_line = rfi.get("summary", {}).get("one_line", "")
        why_routine = rfi.get("summary", {}).get("why_or_why_not", "")

        html += f"""
            <div class="rfi-card" data-idx="{idx}">
                <div class="rfi-header">
                    <span class="rfi-id">{rfi.get('rfi_number', 'Unknown')}</span>
                    <span class="rfi-project">{rfi.get('project', 'Unknown')}</span>
                </div>

                <div class="rfi-content">
                    <div class="text-section">
                        <div class="text-label">RFI Question</div>
                        <div class="text-box">{escape_html(rfi.get('question_text', '')[:1500])}</div>
                    </div>

                    <div class="text-section">
                        <div class="text-label">Resolution</div>
                        <div class="text-box resolution">{escape_html(rfi.get('resolution_text', 'No resolution') or 'No resolution')[:800]}</div>
                    </div>

                    <div class="llm-scores">
                        <h4>LLM Assessment</h4>
                        <div class="score-grid">
                            <div class="score-item">
                                <div class="score-label">Impact Scope</div>
                                <div class="score-value">{impact_score}/5</div>
                                <div class="score-reasoning">{escape_html(rfi.get('impact_scope', {}).get('reasoning', '')[:100])}</div>
                            </div>
                            <div class="score-item">
                                <div class="score-label">Learning Value</div>
                                <div class="score-value">{learning_score}/5</div>
                                <div class="score-reasoning">{escape_html(rfi.get('learning_value', {}).get('reasoning', '')[:100])}</div>
                            </div>
                            <div class="score-item">
                                <div class="score-label">Rework Level</div>
                                <div class="score-value">{rework_level}</div>
                                <div class="score-reasoning">{escape_html(rfi.get('rework_level', {}).get('reasoning', '')[:100])}</div>
                            </div>
                            <div class="score-item">
                                <div class="score-label">Cost Driver</div>
                                <div class="score-value">{cost_driver}</div>
                            </div>
                            <div class="score-item">
                                <div class="score-label">Root Cause Depth</div>
                                <div class="score-value">{root_depth}</div>
                            </div>
                            <div class="score-item">
                                <div class="score-label">Cascade Risk</div>
                                <div class="score-value">{'Yes' if rfi.get('cascade_risk', {}).get('has_cascade') else 'No'}</div>
                            </div>
                        </div>

                        <div class="llm-summary">
                            <span class="label">Summary:</span> <span class="value">{escape_html(one_line)}</span>
                            <span class="routine-badge {'yes' if is_routine else 'no'}">{'ROUTINE' if is_routine else 'NOT ROUTINE'}</span>
                            <br><span class="label">Why:</span> <span class="value" style="font-size:12px;">{escape_html(why_routine[:200])}</span>
                        </div>
                    </div>

                    <div class="feedback-section">
                        <h4>Your Feedback</h4>

                        <div class="agree-row">
                            <button class="agree-btn" onclick="setAgreement({idx}, 'agree')">✓ Agree with LLM</button>
                            <button class="agree-btn" onclick="setAgreement({idx}, 'partial')">~ Partially Agree</button>
                            <button class="agree-btn" onclick="setAgreement({idx}, 'disagree')">✗ Disagree</button>
                        </div>

                        <div class="feedback-row">
                            <div class="feedback-group">
                                <label>Your Impact Score (1-5)</label>
                                <select id="impact-{idx}">
                                    <option value="">Keep LLM score ({impact_score})</option>
                                    <option value="1">1 - Single trade, simple</option>
                                    <option value="2">2 - Single trade, adjustment</option>
                                    <option value="3">3 - Multi-trade coordination</option>
                                    <option value="4">4 - Multiple systems affected</option>
                                    <option value="5">5 - Cascade, major rework</option>
                                </select>
                            </div>
                            <div class="feedback-group">
                                <label>Your Learning Value (1-5)</label>
                                <select id="learning-{idx}">
                                    <option value="">Keep LLM score ({learning_score})</option>
                                    <option value="1">1 - Completely routine</option>
                                    <option value="2">2 - Standard occurrence</option>
                                    <option value="3">3 - Worth tracking</option>
                                    <option value="4">4 - Important lesson</option>
                                    <option value="5">5 - Critical, must prevent</option>
                                </select>
                            </div>
                        </div>

                        <div class="feedback-row">
                            <div class="feedback-group">
                                <label>Is this actually routine?</label>
                                <select id="routine-{idx}">
                                    <option value="">Keep LLM assessment</option>
                                    <option value="yes">Yes - routine, skip</option>
                                    <option value="no">No - worth analyzing</option>
                                </select>
                            </div>
                            <div class="feedback-group">
                                <label>Correct Category (if wrong)</label>
                                <input type="text" id="category-{idx}" placeholder="e.g., Spatial Conflict - Mechanical & Structural">
                            </div>
                        </div>

                        <div class="feedback-group">
                            <label>Notes / Reasoning</label>
                            <textarea id="notes-{idx}" placeholder="Explain why you agree/disagree, what the LLM missed, etc."></textarea>
                            <div class="hint">Help calibrate the model by explaining your reasoning</div>
                        </div>
                    </div>
                </div>
            </div>
"""

    html += """
        </div>

        <div class="export-section">
            <h3>Export Your Feedback</h3>
            <p style="margin-bottom: 15px; opacity: 0.8;">When done, export and paste back to Claude for model refinement.</p>
            <button class="export-btn" onclick="exportFeedback()">Export Feedback (JSON)</button>
            <button class="export-btn secondary" onclick="copyToClipboard()">Copy to Clipboard</button>
            <div class="output-area" id="output-area"></div>
        </div>
    </div>

    <script>
        const agreements = {};
        const totalRfis = """ + str(len([r for r in scored_rfis if r.get("success")])) + """;

        function setAgreement(idx, value) {
            agreements[idx] = value;

            // Update button styles
            const card = document.querySelector(`[data-idx="${idx}"]`);
            card.querySelectorAll('.agree-btn').forEach(btn => btn.classList.remove('selected', 'agree', 'disagree', 'partial'));
            event.target.classList.add('selected', value);

            updateProgress();
        }

        function updateProgress() {
            const reviewed = Object.keys(agreements).length;
            document.getElementById('progress-count').textContent = reviewed;
            document.getElementById('progress-fill').style.width = `${(reviewed / totalRfis) * 100}%`;
        }

        function exportFeedback() {
            const feedback = [];

            document.querySelectorAll('.rfi-card').forEach((card, idx) => {
                const agreement = agreements[idx];
                if (!agreement) return; // Skip unreviewed

                feedback.push({
                    rfi_index: idx,
                    rfi_number: card.querySelector('.rfi-id').textContent,
                    project: card.querySelector('.rfi-project').textContent,
                    agreement: agreement,
                    your_impact_score: document.getElementById(`impact-${idx}`).value || null,
                    your_learning_score: document.getElementById(`learning-${idx}`).value || null,
                    your_routine_assessment: document.getElementById(`routine-${idx}`).value || null,
                    your_category: document.getElementById(`category-${idx}`).value || null,
                    notes: document.getElementById(`notes-${idx}`).value || null
                });
            });

            const output = {
                feedback_date: new Date().toISOString(),
                total_reviewed: feedback.length,
                agreements: {
                    agree: feedback.filter(f => f.agreement === 'agree').length,
                    partial: feedback.filter(f => f.agreement === 'partial').length,
                    disagree: feedback.filter(f => f.agreement === 'disagree').length
                },
                feedback: feedback
            };

            const outputArea = document.getElementById('output-area');
            outputArea.textContent = JSON.stringify(output, null, 2);
            outputArea.classList.add('visible');
        }

        function copyToClipboard() {
            const outputArea = document.getElementById('output-area');
            if (!outputArea.textContent) exportFeedback();
            navigator.clipboard.writeText(outputArea.textContent).then(() => {
                alert('Copied! Paste this back to Claude.');
            });
        }
    </script>
</body>
</html>
"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Feedback form saved: {output_path}")


def escape_html(text: str) -> str:
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
    print("IMPACT SCORING - SAMPLE EXTRACTION")
    print("=" * 70)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Fetch diverse sample
        print("Fetching diverse sample of 50 RFIs...")
        sample = await fetch_diverse_sample(conn, sample_size=50)
        print(f"Selected {len(sample)} RFIs from {len(set(r['source_project_name'] for r in sample))} projects")

        # Score with LLM
        print("\nScoring with GPT-4o-mini...")
        semaphore = asyncio.Semaphore(10)

        results = []
        for i in range(0, len(sample), 10):
            batch = sample[i:i+10]
            batch_results = await asyncio.gather(
                *[score_rfi(rfi, semaphore) for rfi in batch]
            )
            results.extend(batch_results)
            print(f"  Processed {min(i+10, len(sample))}/{len(sample)}")

        # Calculate stats
        successful = [r for r in results if r.get("success")]
        failed = [r for r in results if not r.get("success")]

        total_input = sum(r.get("tokens_used", {}).get("input", 0) for r in successful)
        total_output = sum(r.get("tokens_used", {}).get("output", 0) for r in successful)
        cost = (total_input * 0.15 + total_output * 0.60) / 1_000_000

        print(f"\nScoring complete:")
        print(f"  Successful: {len(successful)}")
        print(f"  Failed: {len(failed)}")
        print(f"  Tokens: {total_input + total_output:,}")
        print(f"  Cost: ${cost:.4f}")

        # Show distribution
        print("\n" + "=" * 70)
        print("INITIAL DISTRIBUTION")
        print("=" * 70)

        routine_count = sum(1 for r in successful if r.get("summary", {}).get("is_routine"))
        print(f"\nRoutine: {routine_count} ({100*routine_count/len(successful):.1f}%)")
        print(f"Not Routine: {len(successful) - routine_count} ({100*(len(successful)-routine_count)/len(successful):.1f}%)")

        # Impact distribution
        impact_dist = {}
        for r in successful:
            score = r.get("impact_scope", {}).get("score", 0)
            impact_dist[score] = impact_dist.get(score, 0) + 1
        print("\nImpact Scope Distribution:")
        for score in sorted(impact_dist.keys()):
            print(f"  {score}: {impact_dist[score]}")

        # Learning value distribution
        learning_dist = {}
        for r in successful:
            score = r.get("learning_value", {}).get("score", 0)
            learning_dist[score] = learning_dist.get(score, 0) + 1
        print("\nLearning Value Distribution:")
        for score in sorted(learning_dist.keys()):
            print(f"  {score}: {learning_dist[score]}")

        # Save results
        output = {
            "generated_at": datetime.now().isoformat(),
            "sample_size": len(sample),
            "successful": len(successful),
            "failed": len(failed),
            "cost_usd": cost,
            "results": successful
        }

        json_path = REPORTS_DIR / "impact_scoring_sample.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"\nResults saved: {json_path}")

        # Generate feedback form
        form_path = REPORTS_DIR / "impact_scoring_feedback.html"
        generate_feedback_form(successful, form_path)

    finally:
        await conn.close()

    print("\n" + "=" * 70)
    print("DONE - Open the feedback form to review and calibrate")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
