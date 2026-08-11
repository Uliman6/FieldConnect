#!/usr/bin/env python3
"""
Impact Scoring - Targeted Run

Runs until we get target distribution:
- At least 1 score of 5
- At least 5 scores of 4
- More 3s
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
- 5: Critical - MAJOR DAMAGE, SAFETY VIOLATION, CASCADE across multiple systems, REPEATED FAILURE pattern

HIGH VALUE SIGNALS (score 4-5):
- Field damage: PT cable blowout, concrete cracking, spalling, structural damage
- Construction errors: Concrete placed wrong, embeds missed, sleeves damaged
- Cascade effects: One change forces multiple trades to rework (fire ratings, smoke compartments)
- Safety/code violations discovered in field
- Expensive remediation: Coring through PT beams, major rework
- Repeated failures: Same issue on multiple pours or locations

CRITICAL SIGNALS (score 5):
- Multiple systems cascade from one failure
- Safety incident or near-miss
- Repeated failure pattern (happened before on same project or others)
- Major structural remediation required
- Water intrusion causing damage
- Code violation that could have caused injury

LOW VALUE SIGNALS (score 1-2):
- "Please confirm..." simple clarifications
- "Detail not shown on drawings" - routine missing info
- "Existing conditions differ" in TI projects - expected
- Single trade adjusts slightly - no rework"""


async def fetch_targeted_rfis(conn) -> list[dict]:
    """Fetch RFIs targeting high-value ones plus random sample."""

    # First, get known high-value RFIs (field errors, damage, safety)
    high_value_rows = await conn.fetch("""
        SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category
        FROM intelligence.items
        WHERE resulted_in_co = true
          AND question_text IS NOT NULL
          AND (
            question_text ILIKE '%blow%out%'
            OR question_text ILIKE '%crack%'
            OR question_text ILIKE '%damage%'
            OR question_text ILIKE '%spall%'
            OR question_text ILIKE '%fail%'
            OR question_text ILIKE '%miss%embed%'
            OR question_text ILIKE '%miss%sleeve%'
            OR question_text ILIKE '%water%intru%'
            OR question_text ILIKE '%seep%'
            OR question_text ILIKE '%safety%'
            OR question_text ILIKE '%code%violation%'
            OR question_text ILIKE '%non%compliant%'
            OR question_text ILIKE '%inspector%reject%'
            OR question_text ILIKE '%remediation%'
            OR question_text ILIKE '%rework%'
            OR question_text ILIKE '%redo%'
            OR question_text ILIKE '%demo%reinstall%'
            OR question_text ILIKE '%tolerance%exceed%'
            OR question_text ILIKE '%out of tolerance%'
            OR question_text ILIKE '%misplace%'
            OR question_text ILIKE '%wrong location%'
          )
        ORDER BY random()
        LIMIT 30
    """)

    print(f"Found {len(high_value_rows)} potentially high-value RFIs")

    # Then get random sample for variety
    random_rows = await conn.fetch("""
        SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category
        FROM intelligence.items
        WHERE resulted_in_co = true
          AND question_text IS NOT NULL
          AND length(question_text) > 100
          AND id NOT IN (SELECT id FROM intelligence.items WHERE
            question_text ILIKE '%blow%out%'
            OR question_text ILIKE '%crack%'
            OR question_text ILIKE '%damage%')
        ORDER BY random()
        LIMIT 30
    """)

    print(f"Adding {len(random_rows)} random RFIs for variety")

    # Combine and dedupe
    all_rfis = [dict(r) for r in high_value_rows] + [dict(r) for r in random_rows]
    seen_ids = set()
    unique_rfis = []
    for rfi in all_rfis:
        if rfi['id'] not in seen_ids:
            seen_ids.add(rfi['id'])
            unique_rfis.append(rfi)

    return unique_rfis[:60]  # Cap at 60


async def score_rfi(rfi: dict, semaphore: asyncio.Semaphore) -> dict:
    """Score a single RFI."""
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
                    {"role": "system", "content": "You are a construction analyst. Be discriminating - most RFIs are routine, but some genuinely deserve high scores (4-5). Don't be afraid to give 5s for truly critical issues."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
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
                "success": False,
                "error": str(e)
            }


def generate_feedback_form(scored_rfis: list[dict], output_path: Path):
    """Generate interactive HTML feedback form - sorted by learning value."""

    # Sort by learning value (highest first)
    sorted_rfis = sorted(
        [r for r in scored_rfis if r.get("success")],
        key=lambda x: x.get("learning_value", {}).get("score", 0),
        reverse=True
    )

    html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Impact Scoring Feedback - Targeted</title>
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

        .stats-bar {
            background: #1e3a5f;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            margin-bottom: 25px;
            display: flex;
            gap: 30px;
            flex-wrap: wrap;
        }
        .stat { text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; }
        .stat-label { font-size: 12px; opacity: 0.8; }

        .section-header {
            background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 8px 8px 0 0;
            font-weight: bold;
            margin-top: 25px;
        }
        .section-header.score-4 { background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); }
        .section-header.score-3 { background: linear-gradient(135deg, #ca8a04 0%, #a16207 100%); }
        .section-header.score-2 { background: linear-gradient(135deg, #65a30d 0%, #4d7c0f 100%); }

        .rfi-card {
            background: white;
            border-radius: 0 0 8px 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .rfi-card.standalone { border-radius: 8px; }

        .rfi-header {
            background: #f8fafc;
            padding: 12px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #e2e8f0;
            flex-wrap: wrap;
            gap: 10px;
        }
        .rfi-id { font-weight: bold; color: #1e3a5f; }
        .rfi-project { color: #64748b; font-size: 13px; }
        .score-badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 13px;
        }
        .score-badge.score-5 { background: #dc2626; color: white; }
        .score-badge.score-4 { background: #ea580c; color: white; }
        .score-badge.score-3 { background: #ca8a04; color: white; }
        .score-badge.score-2 { background: #65a30d; color: white; }

        .rfi-content { padding: 15px 20px; }

        .text-box {
            background: #f8f9fa;
            padding: 12px;
            border-radius: 6px;
            font-size: 13px;
            max-height: 120px;
            overflow-y: auto;
            border: 1px solid #e9ecef;
            margin-bottom: 12px;
        }
        .text-label {
            font-size: 11px;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 4px;
            font-weight: 600;
        }

        .llm-analysis {
            background: #fefce8;
            border: 1px solid #fef08a;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
        }
        .llm-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 10px;
            margin-bottom: 10px;
        }
        .llm-item {
            background: white;
            padding: 8px;
            border-radius: 4px;
        }
        .llm-label { font-size: 10px; color: #92400e; text-transform: uppercase; }
        .llm-value { font-weight: 600; color: #1e3a5f; }
        .llm-reasoning { font-size: 12px; color: #64748b; margin-top: 8px; }

        .feedback-section {
            background: #eff6ff;
            border: 2px solid #3b82f6;
            border-radius: 8px;
            padding: 15px;
        }
        .feedback-section h4 { color: #1e40af; margin-bottom: 12px; font-size: 14px; }

        .agree-row {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
        }
        .agree-btn {
            flex: 1;
            padding: 8px;
            border: 2px solid #e5e7eb;
            border-radius: 6px;
            background: white;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
        }
        .agree-btn:hover { border-color: #3b82f6; }
        .agree-btn.selected.agree { background: #dcfce7; border-color: #22c55e; }
        .agree-btn.selected.disagree { background: #fee2e2; border-color: #ef4444; }
        .agree-btn.selected.partial { background: #fef3c7; border-color: #f59e0b; }

        .feedback-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }
        .feedback-group label { display: block; font-size: 12px; font-weight: 600; color: #1e40af; margin-bottom: 4px; }
        .feedback-group select, .feedback-group textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid #93c5fd;
            border-radius: 4px;
            font-size: 13px;
        }
        .feedback-group textarea { min-height: 50px; resize: vertical; margin-top: 10px; }

        .export-section {
            background: #1e3a5f;
            color: white;
            border-radius: 12px;
            padding: 20px;
            margin-top: 30px;
            position: sticky;
            bottom: 20px;
        }
        .export-btn {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            margin-right: 10px;
        }
        .output-area {
            background: #0f172a;
            color: #e2e8f0;
            padding: 12px;
            border-radius: 6px;
            margin-top: 12px;
            font-family: monospace;
            font-size: 11px;
            max-height: 200px;
            overflow-y: auto;
            display: none;
        }
        .output-area.visible { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Impact Scoring Calibration</h1>
        <p class="subtitle">Sorted by Learning Value (highest first) - Review and correct as needed</p>
"""

    # Count scores
    score_counts = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
    for r in sorted_rfis:
        score = r.get("learning_value", {}).get("score", 0)
        if score in score_counts:
            score_counts[score] += 1

    html += f"""
        <div class="stats-bar">
            <div class="stat"><div class="stat-value">{len(sorted_rfis)}</div><div class="stat-label">Total RFIs</div></div>
            <div class="stat"><div class="stat-value" style="color:#ef4444;">{score_counts[5]}</div><div class="stat-label">Score 5 (Critical)</div></div>
            <div class="stat"><div class="stat-value" style="color:#f97316;">{score_counts[4]}</div><div class="stat-label">Score 4 (Important)</div></div>
            <div class="stat"><div class="stat-value" style="color:#eab308;">{score_counts[3]}</div><div class="stat-label">Score 3 (Notable)</div></div>
            <div class="stat"><div class="stat-value" style="color:#84cc16;">{score_counts[2]}</div><div class="stat-label">Score 2 (Routine)</div></div>
        </div>

        <div id="rfi-container">
"""

    current_score = None
    for idx, rfi in enumerate(sorted_rfis):
        score = rfi.get("learning_value", {}).get("score", 0)

        # Add section header when score changes
        if score != current_score:
            current_score = score
            score_labels = {5: "CRITICAL (Score 5)", 4: "IMPORTANT (Score 4)", 3: "NOTABLE (Score 3)", 2: "ROUTINE (Score 2)", 1: "ROUTINE (Score 1)"}
            html += f"""
            <div class="section-header score-{score}">{score_labels.get(score, f'Score {score}')}</div>
"""

        lv = rfi.get("learning_value", {})
        impact = rfi.get("impact_scope", {})
        rework = rfi.get("rework_level", {})
        summary = rfi.get("summary", {})

        html += f"""
            <div class="rfi-card" data-idx="{idx}">
                <div class="rfi-header">
                    <div>
                        <span class="rfi-id">{rfi.get('rfi_number', 'Unknown')}</span>
                        <span class="rfi-project">({rfi.get('project', 'Unknown')[:30]})</span>
                    </div>
                    <span class="score-badge score-{score}">Learning: {score}/5</span>
                </div>

                <div class="rfi-content">
                    <div class="text-label">Question</div>
                    <div class="text-box">{escape_html(rfi.get('question_text', '')[:800])}</div>

                    <div class="llm-analysis">
                        <div class="llm-row">
                            <div class="llm-item">
                                <div class="llm-label">Impact Scope</div>
                                <div class="llm-value">{impact.get('score', '?')}/5</div>
                            </div>
                            <div class="llm-item">
                                <div class="llm-label">Rework Level</div>
                                <div class="llm-value">{rework.get('level', '?')}</div>
                            </div>
                            <div class="llm-item">
                                <div class="llm-label">Root Cause</div>
                                <div class="llm-value">{rfi.get('root_cause_depth', {}).get('level', '?')}</div>
                            </div>
                            <div class="llm-item">
                                <div class="llm-label">Cascade Risk</div>
                                <div class="llm-value">{'Yes' if rfi.get('cascade_risk', {}).get('has_cascade') else 'No'}</div>
                            </div>
                        </div>
                        <div class="llm-reasoning">
                            <strong>Summary:</strong> {escape_html(summary.get('one_line', ''))}<br>
                            <strong>Why this score:</strong> {escape_html(lv.get('reasoning', '')[:200])}
                        </div>
                    </div>

                    <div class="feedback-section">
                        <h4>Your Feedback</h4>
                        <div class="agree-row">
                            <button class="agree-btn" onclick="setAgreement({idx}, 'agree')">Agree</button>
                            <button class="agree-btn" onclick="setAgreement({idx}, 'partial')">Partial</button>
                            <button class="agree-btn" onclick="setAgreement({idx}, 'disagree')">Disagree</button>
                        </div>
                        <div class="feedback-row">
                            <div class="feedback-group">
                                <label>Your Learning Score</label>
                                <select id="learning-{idx}">
                                    <option value="">Keep ({score})</option>
                                    <option value="1">1 - Routine</option>
                                    <option value="2">2 - Standard</option>
                                    <option value="3">3 - Notable</option>
                                    <option value="4">4 - Important</option>
                                    <option value="5">5 - Critical</option>
                                </select>
                            </div>
                            <div class="feedback-group">
                                <label>Your Impact Score</label>
                                <select id="impact-{idx}">
                                    <option value="">Keep ({impact.get('score', '?')})</option>
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                    <option value="3">3</option>
                                    <option value="4">4</option>
                                    <option value="5">5</option>
                                </select>
                            </div>
                        </div>
                        <div class="feedback-group">
                            <textarea id="notes-{idx}" placeholder="Notes (why you agree/disagree)"></textarea>
                        </div>
                    </div>
                </div>
            </div>
"""

    html += """
        </div>

        <div class="export-section">
            <h3>Export Feedback</h3>
            <button class="export-btn" onclick="exportFeedback()">Export JSON</button>
            <button class="export-btn" onclick="copyToClipboard()">Copy to Clipboard</button>
            <div class="output-area" id="output-area"></div>
        </div>
    </div>

    <script>
        const agreements = {};

        function setAgreement(idx, value) {
            agreements[idx] = value;
            const card = document.querySelector(`[data-idx="${idx}"]`);
            card.querySelectorAll('.agree-btn').forEach(btn => btn.classList.remove('selected', 'agree', 'disagree', 'partial'));
            event.target.classList.add('selected', value);
        }

        function exportFeedback() {
            const feedback = [];
            document.querySelectorAll('.rfi-card').forEach((card, idx) => {
                const agreement = agreements[idx];
                if (!agreement) return;
                feedback.push({
                    rfi_index: idx,
                    rfi_number: card.querySelector('.rfi-id').textContent,
                    agreement: agreement,
                    your_learning_score: document.getElementById(`learning-${idx}`).value || null,
                    your_impact_score: document.getElementById(`impact-${idx}`).value || null,
                    notes: document.getElementById(`notes-${idx}`).value || null
                });
            });

            const output = {
                feedback_date: new Date().toISOString(),
                total_reviewed: feedback.length,
                feedback: feedback
            };

            const outputArea = document.getElementById('output-area');
            outputArea.textContent = JSON.stringify(output, null, 2);
            outputArea.classList.add('visible');
        }

        function copyToClipboard() {
            const outputArea = document.getElementById('output-area');
            if (!outputArea.textContent) exportFeedback();
            navigator.clipboard.writeText(outputArea.textContent).then(() => alert('Copied!'));
        }
    </script>
</body>
</html>
"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Feedback form saved: {output_path}")


def escape_html(text):
    if not text:
        return ""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


async def main():
    print("=" * 70)
    print("IMPACT SCORING - TARGETED RUN")
    print("=" * 70)
    print("Target: 1+ score-5, 5+ score-4, more 3s")
    print()

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Fetch targeted RFIs
        rfis = await fetch_targeted_rfis(conn)
        print(f"\nTotal RFIs to score: {len(rfis)}")

        # Score with LLM
        print("\nScoring with GPT-4o-mini...")
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

        # Calculate stats
        total_input = sum(r.get("tokens_used", {}).get("input", 0) for r in successful)
        total_output = sum(r.get("tokens_used", {}).get("output", 0) for r in successful)
        cost = (total_input * 0.15 + total_output * 0.60) / 1_000_000

        print(f"\nScoring complete: {len(successful)} successful, ${cost:.4f}")

        # Count by score
        score_dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        for r in successful:
            score = r.get("learning_value", {}).get("score", 0)
            if score in score_dist:
                score_dist[score] += 1

        print("\n" + "=" * 70)
        print("DISTRIBUTION")
        print("=" * 70)
        for score in [5, 4, 3, 2, 1]:
            marker = " <<<" if (score == 5 and score_dist[5] >= 1) or (score == 4 and score_dist[4] >= 5) else ""
            print(f"  Score {score}: {score_dist[score]}{marker}")

        target_met = score_dist[5] >= 1 and score_dist[4] >= 5
        print(f"\nTarget met: {'YES' if target_met else 'NO - may need to run again'}")

        # Save results
        output = {
            "generated_at": datetime.now().isoformat(),
            "sample_size": len(rfis),
            "successful": len(successful),
            "cost_usd": cost,
            "score_distribution": score_dist,
            "target_met": target_met,
            "results": successful
        }

        json_path = REPORTS_DIR / "impact_scoring_targeted.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"\nResults saved: {json_path}")

        # Generate feedback form
        form_path = REPORTS_DIR / "impact_scoring_feedback_targeted.html"
        generate_feedback_form(successful, form_path)

        # Show high-value RFIs
        print("\n" + "=" * 70)
        print("HIGH-VALUE RFIs")
        print("=" * 70)
        for r in successful:
            lv = r.get("learning_value", {})
            if lv.get("score", 0) >= 4:
                print(f"\n{r['rfi_number']} ({r['project'][:25]})")
                print(f"  Score: {lv.get('score')}/5")
                print(f"  Summary: {r.get('summary', {}).get('one_line', '')[:100]}")
                print(f"  Reason: {lv.get('reasoning', '')[:100]}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
