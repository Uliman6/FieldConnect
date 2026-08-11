#!/usr/bin/env python3
"""
Find and score high-value RFIs - targeting specific patterns that indicate
critical issues (code violations, damage, safety, etc.)
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

# Already validated Score 5 RFIs
VALIDATED_SCORE_5 = [
    ("Southline Office", "RFI-2028"),
    ("Southline Office", "RFI-1268"),
    ("Southline Office", "RFI-1993"),
    ("Southline Office", "RFI-2119"),
]

SCORING_PROMPT = """You are a construction analyst. Analyze this RFI for learning value.

RFI Question:
{question_text}

Resolution:
{resolution_text}

Project: {project}
Trade: {trade}

TASK: Score learning value 1-5. Be calibrated but not overly conservative.

Return JSON:
{{
    "learning_value": {{
        "score": <1-5>,
        "reasoning": "<why this score>"
    }},
    "applicability_scope": {{
        "level": "<broad|category_specific|narrow>",
        "project_types": ["<types>"]
    }},
    "actionability": {{
        "level": "<high|medium|low>",
        "specific_action": "<action>",
        "action_phase": "<design|preconstruction|construction|closeout>"
    }},
    "root_cause_clarity": {{
        "level": "<clear|partial|unclear>",
        "root_cause": "<cause>"
    }},
    "summary": {{
        "one_line": "<summary>",
        "lesson_type": "<code_violation|safety_issue|damage_occurred|coordination_gap|design_error|field_discovery|scope_change|routine_clarification>"
    }}
}}

SCORING GUIDE:

**SCORE 5 - CRITICAL**:
- Actual code/safety violation discovered and required correction
- Physical damage occurred (water intrusion, structural damage, equipment damage)
- Inspector rejection or failed inspection
- Remediation of non-compliant installed work required
- Cascade failure affecting multiple systems

**SCORE 4.5 - IMPORTANT CHECK**:
- Would have been code violation if not caught
- Pattern that repeats across multiple projects
- Expensive coordination failure with clear prevention
- Near-miss safety concern
- Issue with broad applicability

**SCORE 4 - NOTABLE**:
- Significant coordination gap with moderate impact
- Design error caught in field
- Clear preventive action exists
- Trade damage or rework required

**SCORE 3 - WORTH TRACKING**:
- Standard coordination issues
- Field discoveries requiring adjustment
- Design clarifications with minor impact

**SCORE 2-1 - ROUTINE**:
- Simple clarifications
- Administrative questions
- Expected variations"""


async def fetch_high_value_candidates(conn) -> list[dict]:
    """Fetch RFIs with patterns indicating high learning value."""

    # Build exclusion for validated 5s
    exclusion = " OR ".join([
        f"(source_project_name = '{p}' AND source_ref = '{r}')"
        for p, r in VALIDATED_SCORE_5
    ])

    # Search for high-value patterns
    query = f"""
        SELECT id, source_ref, source_project_name,
               question_text, resolution_text, trade_category,
               cost_impact
        FROM intelligence.items
        WHERE question_text IS NOT NULL
          AND NOT ({exclusion})
          AND (
            -- Code/Safety violations
            question_text ILIKE '%code violation%'
            OR question_text ILIKE '%non-compliant%'
            OR question_text ILIKE '%not compliant%'
            OR question_text ILIKE '%does not comply%'
            OR question_text ILIKE '%inspector reject%'
            OR question_text ILIKE '%failed inspection%'
            OR question_text ILIKE '%ADA%violation%'
            OR question_text ILIKE '%fire marshal%'
            OR question_text ILIKE '%building official%reject%'

            -- Damage occurred
            OR question_text ILIKE '%water intrusion%'
            OR question_text ILIKE '%water damage%'
            OR question_text ILIKE '%water entered%'
            OR question_text ILIKE '%leak%damage%'
            OR question_text ILIKE '%flood%'
            OR question_text ILIKE '%structural damage%'
            OR question_text ILIKE '%crack%concrete%'
            OR question_text ILIKE '%spall%'
            OR question_text ILIKE '%blow%out%'
            OR question_text ILIKE '%PT cable%'
            OR question_text ILIKE '%damaged%during%'

            -- Safety issues
            OR question_text ILIKE '%safety hazard%'
            OR question_text ILIKE '%safety concern%'
            OR question_text ILIKE '%safety violation%'
            OR question_text ILIKE '%fall hazard%'
            OR question_text ILIKE '%trip hazard%'
            OR question_text ILIKE '%fire rating%compromis%'
            OR question_text ILIKE '%egress%blocked%'
            OR question_text ILIKE '%emergency%access%'

            -- Rework/Remediation
            OR question_text ILIKE '%remediat%'
            OR question_text ILIKE '%remove and replace%'
            OR question_text ILIKE '%demo%reinstall%'
            OR question_text ILIKE '%rework%'
            OR question_text ILIKE '%redo%'
            OR question_text ILIKE '%already installed%'
            OR question_text ILIKE '%installed incorrect%'
            OR question_text ILIKE '%wrong location%'
            OR question_text ILIKE '%misalign%'

            -- Coordination failures
            OR question_text ILIKE '%conflict%between%'
            OR question_text ILIKE '%clash%'
            OR question_text ILIKE '%coordination%fail%'
            OR question_text ILIKE '%trade damage%'
            OR question_text ILIKE '%damaged by%'

            -- Seismic/structural
            OR question_text ILIKE '%seismic%'
            OR question_text ILIKE '%structural%integrity%'
            OR question_text ILIKE '%load%exceed%'

            -- Expensive ones might have lessons
            OR cost_impact > 200000
          )
        ORDER BY
            CASE
                WHEN question_text ILIKE '%code violation%' THEN 1
                WHEN question_text ILIKE '%safety%' THEN 2
                WHEN question_text ILIKE '%damage%' THEN 3
                WHEN question_text ILIKE '%remediat%' THEN 4
                ELSE 5
            END,
            cost_impact DESC NULLS LAST
        LIMIT 80
    """

    rows = await conn.fetch(query)
    return [dict(r) for r in rows]


async def score_rfi(rfi: dict, semaphore: asyncio.Semaphore) -> dict:
    """Score a single RFI."""
    async with semaphore:
        try:
            prompt = SCORING_PROMPT.format(
                question_text=rfi["question_text"][:3000],
                resolution_text=(rfi["resolution_text"] or "No resolution")[:1500],
                trade=rfi["trade_category"] or "Not specified",
                project=rfi["source_project_name"]
            )

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a calibrated construction analyst. Give Score 5 for actual violations/damage/safety issues. Score 4.5 for important preventable issues with broad lessons. Score 4 for notable coordination gaps. Be fair but discriminating."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.15,
                max_tokens=700,
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

            return result

        except Exception as e:
            return {
                "rfi_id": str(rfi["id"]),
                "rfi_number": rfi["source_ref"],
                "success": False,
                "error": str(e)
            }


def generate_feedback_form(results: list[dict], output_path: Path):
    """Generate feedback form."""

    score_5s = [r for r in results if r.get("learning_value", {}).get("score") == 5]
    score_45s = [r for r in results if r.get("learning_value", {}).get("score") == 4.5]
    score_4s = [r for r in results if r.get("learning_value", {}).get("score") == 4][:15]

    score_5s.sort(key=lambda x: x.get("co_amount", 0), reverse=True)
    score_45s.sort(key=lambda x: x.get("co_amount", 0), reverse=True)

    html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>High-Value RFIs - Feedback</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #fff; margin-bottom: 10px; }
        .subtitle { color: #94a3b8; margin-bottom: 20px; }

        .stats-bar { background: linear-gradient(135deg, #7c3aed 0%, #db2777 100%); padding: 15px 20px; border-radius: 8px; margin-bottom: 20px; display: flex; gap: 30px; flex-wrap: wrap; }
        .stat { text-align: center; }
        .stat-value { font-size: 28px; font-weight: bold; }
        .stat-label { font-size: 11px; opacity: 0.9; }

        .validated-box { background: #166534; border-radius: 8px; padding: 12px 15px; margin-bottom: 20px; }
        .validated-box h3 { color: #86efac; font-size: 14px; margin-bottom: 8px; }
        .validated-list { display: flex; gap: 10px; flex-wrap: wrap; }
        .validated-item { background: #14532d; padding: 4px 10px; border-radius: 4px; font-size: 12px; }

        .section-header { padding: 12px 15px; border-radius: 6px; font-weight: bold; color: white; margin-top: 25px; margin-bottom: 12px; display: flex; justify-content: space-between; }
        .section-header.score-5 { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); }
        .section-header.score-45 { background: linear-gradient(135deg, #ea580c 0%, #9a3412 100%); }
        .section-header.score-4 { background: linear-gradient(135deg, #ca8a04 0%, #854d0e 100%); }

        .rfi-card { background: #1e293b; border-radius: 8px; margin-bottom: 12px; overflow: hidden; border-left: 4px solid #475569; }
        .rfi-card.score-5 { border-left-color: #ef4444; }
        .rfi-card.score-45 { border-left-color: #f97316; }
        .rfi-card.score-4 { border-left-color: #eab308; }

        .rfi-header { background: #0f172a; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; cursor: pointer; }
        .rfi-header:hover { background: #1e293b; }
        .rfi-main { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .co-amount { font-size: 15px; font-weight: bold; color: #22c55e; min-width: 90px; }
        .rfi-id { font-weight: bold; color: #fff; }
        .rfi-project { background: #334155; padding: 2px 8px; border-radius: 4px; font-size: 11px; color: #94a3b8; }
        .lesson-type { padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: bold; text-transform: uppercase; background: #374151; color: #9ca3af; }
        .lesson-type.code_violation, .lesson-type.safety_issue { background: #7f1d1d; color: #fecaca; }
        .lesson-type.damage_occurred { background: #7c2d12; color: #fed7aa; }

        .score-badge { padding: 4px 10px; border-radius: 10px; font-weight: bold; font-size: 12px; color: white; }
        .score-badge.score-5 { background: #dc2626; }
        .score-badge.score-45 { background: #ea580c; }
        .score-badge.score-4 { background: #ca8a04; }

        .rfi-content { padding: 15px; display: none; }
        .rfi-content.open { display: block; }

        .text-box { background: #0f172a; padding: 10px; border-radius: 4px; font-size: 13px; margin-bottom: 10px; border: 1px solid #334155; max-height: 120px; overflow-y: auto; white-space: pre-wrap; }
        .text-label { font-size: 10px; font-weight: 600; color: #64748b; margin-bottom: 3px; text-transform: uppercase; }

        .summary-box { background: #312e81; border: 1px solid #4338ca; border-radius: 6px; padding: 10px; margin: 10px 0; }
        .summary-label { font-size: 9px; color: #a5b4fc; text-transform: uppercase; }
        .summary-text { font-size: 13px; color: #e0e7ff; margin-top: 3px; }

        .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 10px 0; }
        .info-box { background: #0f172a; padding: 8px; border-radius: 4px; border: 1px solid #334155; }
        .info-label { font-size: 9px; color: #64748b; text-transform: uppercase; }
        .info-value { font-size: 12px; color: #e2e8f0; margin-top: 2px; }

        .reasoning-box { background: #1e1b4b; border: 1px solid #4338ca; border-radius: 6px; padding: 10px; margin: 10px 0; }
        .reasoning-label { font-size: 9px; color: #a5b4fc; text-transform: uppercase; }
        .reasoning-text { font-size: 12px; color: #c7d2fe; margin-top: 3px; }

        .feedback-section { background: #1e3a5f; border: 2px solid #3b82f6; border-radius: 6px; padding: 12px; margin-top: 12px; }
        .feedback-section h4 { color: #93c5fd; margin-bottom: 10px; font-size: 12px; }
        .agree-row { display: flex; gap: 6px; margin-bottom: 10px; }
        .agree-btn { flex: 1; padding: 8px; border: 2px solid #475569; border-radius: 4px; background: #1e293b; color: #e2e8f0; cursor: pointer; font-size: 12px; }
        .agree-btn:hover { border-color: #3b82f6; }
        .agree-btn.selected.agree { background: #166534; border-color: #22c55e; }
        .agree-btn.selected.disagree { background: #7f1d1d; border-color: #ef4444; }
        .agree-btn.selected.partial { background: #713f12; border-color: #f59e0b; }

        .feedback-row { display: flex; gap: 10px; }
        .feedback-group { flex: 1; }
        .feedback-group label { display: block; font-size: 11px; color: #93c5fd; margin-bottom: 3px; }
        .feedback-group select, .feedback-group textarea { width: 100%; padding: 6px; border: 1px solid #475569; border-radius: 4px; background: #0f172a; color: #e2e8f0; font-size: 12px; }
        .feedback-group textarea { min-height: 40px; }

        .export-bar { background: #1e293b; border-radius: 8px; padding: 12px 15px; margin-top: 25px; position: sticky; bottom: 15px; display: flex; gap: 8px; align-items: center; }
        .export-btn { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; }
        .export-btn:hover { background: #2563eb; }
        .export-btn.secondary { background: #475569; }
        .output-area { flex: 1; background: #0f172a; color: #94a3b8; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 10px; max-height: 80px; overflow-y: auto; display: none; }
        .output-area.visible { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>High-Value RFIs - Targeted Search</h1>
        <p class="subtitle">RFIs with patterns indicating critical issues, damage, or safety concerns</p>

        <div class="stats-bar">
            <div class="stat"><div class="stat-value">""" + str(len(results)) + """</div><div class="stat-label">Searched</div></div>
            <div class="stat"><div class="stat-value" style="color:#fecaca;">""" + str(len(score_5s)) + """</div><div class="stat-label">NEW Score 5</div></div>
            <div class="stat"><div class="stat-value" style="color:#fed7aa;">""" + str(len(score_45s)) + """</div><div class="stat-label">Score 4.5</div></div>
            <div class="stat"><div class="stat-value" style="color:#fef08a;">""" + str(len(score_4s)) + """</div><div class="stat-label">Score 4</div></div>
        </div>

        <div class="validated-box">
            <h3>Already Validated Score 5s (Excluded)</h3>
            <div class="validated-list">
"""
    for p, r in VALIDATED_SCORE_5:
        html += f'                <span class="validated-item">{r} ({p})</span>\n'

    html += """            </div>
        </div>

        <div id="rfi-container">
"""

    idx = 0

    if score_5s:
        html += f'<div class="section-header score-5">NEW CRITICAL (Score 5) <span>{len(score_5s)}</span></div>\n'
        for rfi in score_5s:
            html += generate_card(rfi, idx, 5)
            idx += 1

    if score_45s:
        html += f'<div class="section-header score-45">IMPORTANT CHECKS (Score 4.5) <span>{len(score_45s)}</span></div>\n'
        for rfi in score_45s:
            html += generate_card(rfi, idx, 4.5)
            idx += 1

    if score_4s:
        html += f'<div class="section-header score-4">NOTABLE (Score 4) <span>{len(score_4s)}</span></div>\n'
        for rfi in score_4s:
            html += generate_card(rfi, idx, 4)
            idx += 1

    html += """
        </div>

        <div class="export-bar">
            <button class="export-btn" onclick="exportFeedback()">Export</button>
            <button class="export-btn secondary" onclick="copyFeedback()">Copy</button>
            <button class="export-btn secondary" onclick="expandAll()">Expand All</button>
            <div class="output-area" id="output"></div>
        </div>
    </div>

    <script>
        const agreements = {};
        function toggle(i) { document.getElementById('c'+i).classList.toggle('open'); }
        function expandAll() { document.querySelectorAll('.rfi-content').forEach(c=>c.classList.add('open')); }
        function setAgreement(i,v) {
            agreements[i]=v;
            document.querySelector(`[data-i="${i}"]`).querySelectorAll('.agree-btn').forEach(b=>b.classList.remove('selected','agree','disagree','partial'));
            event.target.classList.add('selected',v);
        }
        function exportFeedback() {
            const fb=[];
            document.querySelectorAll('.rfi-card').forEach(c=>{
                const i=c.dataset.i;
                if(!agreements[i])return;
                fb.push({
                    rfi:c.querySelector('.rfi-id').textContent,
                    project:c.querySelector('.rfi-project').textContent,
                    score:c.querySelector('.score-badge').textContent,
                    agreement:agreements[i],
                    your_score:document.getElementById('s'+i)?.value||null,
                    notes:document.getElementById('n'+i)?.value||null
                });
            });
            const out=document.getElementById('output');
            out.textContent=JSON.stringify({date:new Date().toISOString(),count:fb.length,feedback:fb},null,2);
            out.classList.add('visible');
        }
        function copyFeedback() {
            const out=document.getElementById('output');
            if(!out.textContent)exportFeedback();
            navigator.clipboard.writeText(out.textContent).then(()=>alert('Copied!'));
        }
    </script>
</body>
</html>
"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Feedback form: {output_path}")


def generate_card(rfi: dict, idx: int, score: float) -> str:
    lv = rfi.get("learning_value", {})
    app = rfi.get("applicability_scope", {})
    act = rfi.get("actionability", {})
    rc = rfi.get("root_cause_clarity", {})
    summary = rfi.get("summary", {})

    sc = "score-5" if score == 5 else ("score-45" if score == 4.5 else "score-4")
    lt = summary.get("lesson_type", "unknown")

    def esc(t):
        if not t: return ""
        return str(t).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

    return f"""
            <div class="rfi-card {sc}" data-i="{idx}">
                <div class="rfi-header" onclick="toggle({idx})">
                    <div class="rfi-main">
                        <span class="co-amount">${rfi.get('co_amount',0):,.0f}</span>
                        <span class="rfi-id">{esc(rfi.get('rfi_number',''))}</span>
                        <span class="rfi-project">{esc(rfi.get('project','')[:25])}</span>
                        <span class="lesson-type {lt}">{lt.replace('_',' ')}</span>
                    </div>
                    <span class="score-badge {sc}">Score {score}</span>
                </div>
                <div class="rfi-content" id="c{idx}">
                    <div class="text-label">Question</div>
                    <div class="text-box">{esc((rfi.get('question_text') or '')[:600])}</div>
                    <div class="text-label">Resolution</div>
                    <div class="text-box">{esc((rfi.get('resolution_text') or 'N/A')[:300])}</div>
                    <div class="summary-box">
                        <div class="summary-label">Summary</div>
                        <div class="summary-text">{esc(summary.get('one_line',''))}</div>
                    </div>
                    <div class="grid-3">
                        <div class="info-box"><div class="info-label">Applicability</div><div class="info-value">{app.get('level','?').upper()}</div></div>
                        <div class="info-box"><div class="info-label">Actionability</div><div class="info-value">{act.get('level','?').upper()}</div></div>
                        <div class="info-box"><div class="info-label">Root Cause</div><div class="info-value">{rc.get('level','?').upper()}</div></div>
                    </div>
                    <div class="info-box"><div class="info-label">Action</div><div class="info-value">{esc((act.get('specific_action') or '')[:100])}</div></div>
                    <div class="reasoning-box">
                        <div class="reasoning-label">Why this score</div>
                        <div class="reasoning-text">{esc(lv.get('reasoning',''))}</div>
                    </div>
                    <div class="feedback-section">
                        <h4>Feedback</h4>
                        <div class="agree-row">
                            <button class="agree-btn" onclick="setAgreement({idx},'agree')">Agree</button>
                            <button class="agree-btn" onclick="setAgreement({idx},'partial')">Partial</button>
                            <button class="agree-btn" onclick="setAgreement({idx},'disagree')">Disagree</button>
                        </div>
                        <div class="feedback-row">
                            <div class="feedback-group">
                                <label>Your Score</label>
                                <select id="s{idx}">
                                    <option value="">Keep {score}</option>
                                    <option value="5">5</option>
                                    <option value="4.5">4.5</option>
                                    <option value="4">4</option>
                                    <option value="3">3</option>
                                    <option value="2">2</option>
                                </select>
                            </div>
                            <div class="feedback-group">
                                <label>Notes</label>
                                <textarea id="n{idx}" placeholder="Why?"></textarea>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
"""


async def main():
    print("=" * 80)
    print("FIND HIGH-VALUE RFIs - TARGETED SEARCH")
    print("=" * 80)

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        rfis = await fetch_high_value_candidates(conn)
        print(f"Found {len(rfis)} high-value candidates")

        print("\nScoring...")
        semaphore = asyncio.Semaphore(10)

        results = []
        for i in range(0, len(rfis), 10):
            batch = rfis[i:i+10]
            batch_results = await asyncio.gather(*[score_rfi(r, semaphore) for r in batch])
            results.extend(batch_results)
            print(f"  {min(i+10, len(rfis))}/{len(rfis)}")

        successful = [r for r in results if r.get("success")]

        # Distribution
        dist = {}
        for r in successful:
            s = r.get("learning_value", {}).get("score", 0)
            dist[s] = dist.get(s, 0) + 1

        print("\n" + "=" * 80)
        print("DISTRIBUTION")
        print("=" * 80)
        for s in [5, 4.5, 4, 3, 2, 1]:
            if s in dist:
                print(f"  Score {s}: {dist[s]} {'#' * dist[s]}")

        # Save
        output = {
            "generated_at": datetime.now().isoformat(),
            "search_type": "high_value_patterns",
            "total": len(successful),
            "distribution": dist,
            "results": successful
        }

        json_path = REPORTS_DIR / "high_value_scoring.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        form_path = REPORTS_DIR / "high_value_feedback.html"
        generate_feedback_form(successful, form_path)

        # Show 5s and 4.5s
        high = [r for r in successful if r.get("learning_value", {}).get("score", 0) >= 4.5]
        if high:
            print("\n" + "=" * 80)
            print("SCORE 5 and 4.5 RFIs")
            print("=" * 80)
            for r in sorted(high, key=lambda x: (-x.get("learning_value",{}).get("score",0), -x.get("co_amount",0))):
                s = r.get("learning_value", {}).get("score")
                lt = r.get("summary", {}).get("lesson_type", "")
                print(f"\nScore {s} | ${r['co_amount']:,.0f} | {r['rfi_number']} ({r['project'][:20]})")
                print(f"  Type: {lt}")
                print(f"  {r.get('summary',{}).get('one_line','')[:80]}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
