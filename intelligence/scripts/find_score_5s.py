#!/usr/bin/env python3
"""
Aggressively search for Score 5 RFIs across the ENTIRE dataset.
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

VALIDATED_SCORE_5 = [
    ("Southline Office", "RFI-2028"),
    ("Southline Office", "RFI-1268"),
    ("Southline Office", "RFI-1993"),
    ("Southline Office", "RFI-2119"),
]

# More aggressive prompt that recognizes Score 5 patterns
AGGRESSIVE_PROMPT = """Analyze this construction RFI for learning value.

RFI: {rfi_number}
Project: {project}
Trade: {trade}

Question:
{question_text}

Resolution:
{resolution_text}

TASK: Score learning value. If this RFI describes a CRITICAL issue, give it a 5.

Return JSON:
{{
    "learning_value": {{
        "score": <1-5>,
        "reasoning": "<why>"
    }},
    "summary": {{
        "one_line": "<summary>",
        "lesson_type": "<code_violation|safety_issue|damage_occurred|structural_issue|cascade_failure|repeated_pattern|coordination_gap|design_error|routine>"
    }},
    "actionability": {{
        "level": "<high|medium|low>",
        "specific_action": "<action>"
    }}
}}

SCORE 5 CRITERIA - Give 5 if ANY of these apply:
1. CODE VIOLATION: Inspector rejected, failed inspection, non-compliant installation, ADA violation, fire code issue
2. SAFETY INCIDENT: Fall hazard, injury risk, near-miss, unsafe condition discovered
3. PHYSICAL DAMAGE: Water damage, structural cracking, spalling, equipment damaged, PT cable blowout
4. STRUCTURAL CONCERN: Rebar issues, embedment failures, seismic non-compliance, load capacity problems
5. CASCADE FAILURE: One issue caused multiple systems to fail or require rework
6. REPEATED PATTERN: Same issue occurring multiple times or across projects
7. MAJOR REWORK: Significant demolition and reinstallation required
8. FIRE/LIFE SAFETY: Fire rating compromised, smoke barriers affected, egress issues

SCORE 4.5: Would have been Score 5 if not caught in time, or important pattern with broad applicability
SCORE 4: Notable coordination gap or design error with clear prevention
SCORE 3: Standard field issue
SCORE 2-1: Routine clarification

BE WILLING TO GIVE 5s - these are critical lessons that prevent future failures."""


async def search_critical_patterns(conn) -> list[dict]:
    """Search for RFIs with critical patterns."""

    exclusion = " OR ".join([f"(source_project_name = '{p}' AND source_ref = '{r}')" for p, r in VALIDATED_SCORE_5])

    # Multiple targeted queries for different critical patterns
    queries = [
        # Code violations
        f"""SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category, cost_impact
            FROM intelligence.items WHERE question_text IS NOT NULL AND NOT ({exclusion})
            AND (question_text ILIKE '%inspector%reject%' OR question_text ILIKE '%failed inspection%'
                 OR question_text ILIKE '%code violation%' OR question_text ILIKE '%not per code%'
                 OR question_text ILIKE '%non-compliant%' OR question_text ILIKE '%does not comply%'
                 OR question_text ILIKE '%ADA%' OR question_text ILIKE '%fire marshal%')
            LIMIT 30""",

        # Structural/safety damage
        f"""SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category, cost_impact
            FROM intelligence.items WHERE question_text IS NOT NULL AND NOT ({exclusion})
            AND (question_text ILIKE '%crack%' OR question_text ILIKE '%spall%'
                 OR question_text ILIKE '%blow%out%' OR question_text ILIKE '%PT cable%'
                 OR question_text ILIKE '%structural damage%' OR question_text ILIKE '%collapse%'
                 OR question_text ILIKE '%deform%' OR question_text ILIKE '%buckl%')
            LIMIT 30""",

        # Water damage
        f"""SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category, cost_impact
            FROM intelligence.items WHERE question_text IS NOT NULL AND NOT ({exclusion})
            AND (question_text ILIKE '%water intrusion%' OR question_text ILIKE '%water damage%'
                 OR question_text ILIKE '%flooding%' OR question_text ILIKE '%leak%damage%'
                 OR question_text ILIKE '%moisture%penetrat%' OR question_text ILIKE '%water enter%')
            LIMIT 20""",

        # Safety hazards
        f"""SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category, cost_impact
            FROM intelligence.items WHERE question_text IS NOT NULL AND NOT ({exclusion})
            AND (question_text ILIKE '%safety hazard%' OR question_text ILIKE '%fall hazard%'
                 OR question_text ILIKE '%trip hazard%' OR question_text ILIKE '%unsafe%'
                 OR question_text ILIKE '%injury%' OR question_text ILIKE '%danger%'
                 OR question_text ILIKE '%egress%' OR question_text ILIKE '%emergency exit%')
            LIMIT 20""",

        # Fire/smoke issues
        f"""SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category, cost_impact
            FROM intelligence.items WHERE question_text IS NOT NULL AND NOT ({exclusion})
            AND (question_text ILIKE '%fire rating%' OR question_text ILIKE '%fire stop%'
                 OR question_text ILIKE '%smoke barrier%' OR question_text ILIKE '%fire damper%'
                 OR question_text ILIKE '%fire separation%' OR question_text ILIKE '%fire wall%'
                 OR question_text ILIKE '%smoke compartment%')
            LIMIT 25""",

        # Rework/remediation
        f"""SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category, cost_impact
            FROM intelligence.items WHERE question_text IS NOT NULL AND NOT ({exclusion})
            AND (question_text ILIKE '%remediat%' OR question_text ILIKE '%remove and replace%'
                 OR question_text ILIKE '%demolish%reinstall%' OR question_text ILIKE '%redo %'
                 OR question_text ILIKE '%already installed%incorrect%'
                 OR question_text ILIKE '%installed wrong%' OR question_text ILIKE '%misinstall%')
            LIMIT 25""",

        # Seismic/structural compliance
        f"""SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category, cost_impact
            FROM intelligence.items WHERE question_text IS NOT NULL AND NOT ({exclusion})
            AND (question_text ILIKE '%seismic%' OR question_text ILIKE '%lateral%'
                 OR question_text ILIKE '%shear wall%' OR question_text ILIKE '%moment frame%'
                 OR question_text ILIKE '%anchor%fail%' OR question_text ILIKE '%embed%miss%')
            LIMIT 25""",

        # Electrical safety
        f"""SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category, cost_impact
            FROM intelligence.items WHERE question_text IS NOT NULL AND NOT ({exclusion})
            AND (question_text ILIKE '%electrical%hazard%' OR question_text ILIKE '%shock%'
                 OR question_text ILIKE '%arc flash%' OR question_text ILIKE '%ground fault%'
                 OR question_text ILIKE '%exposed wire%' OR question_text ILIKE '%energized%')
            LIMIT 15""",

        # Tolerance/misalignment issues
        f"""SELECT id, source_ref, source_project_name, question_text, resolution_text, trade_category, cost_impact
            FROM intelligence.items WHERE question_text IS NOT NULL AND NOT ({exclusion})
            AND (question_text ILIKE '%out of tolerance%' OR question_text ILIKE '%misalign%'
                 OR question_text ILIKE '%plumb%' OR question_text ILIKE '%level%exceed%'
                 OR question_text ILIKE '%not square%' OR question_text ILIKE '%offset%exceed%')
            LIMIT 20""",
    ]

    all_rfis = []
    seen_ids = set()

    for query in queries:
        try:
            rows = await conn.fetch(query)
            for r in rows:
                if r['id'] not in seen_ids:
                    seen_ids.add(r['id'])
                    all_rfis.append(dict(r))
        except Exception as e:
            print(f"Query error: {e}")

    print(f"Found {len(all_rfis)} unique candidates across all patterns")
    return all_rfis


async def score_rfi(rfi: dict, semaphore: asyncio.Semaphore) -> dict:
    async with semaphore:
        try:
            prompt = AGGRESSIVE_PROMPT.format(
                rfi_number=rfi["source_ref"],
                project=rfi["source_project_name"],
                trade=rfi["trade_category"] or "Not specified",
                question_text=rfi["question_text"][:2500],
                resolution_text=(rfi["resolution_text"] or "No resolution")[:1000]
            )

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a construction safety and quality analyst. Your job is to identify CRITICAL issues that represent important lessons. Be willing to give Score 5 when the criteria are met - code violations, safety issues, damage, structural concerns, or cascade failures deserve 5s."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                max_tokens=500,
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
            return {"rfi_id": str(rfi["id"]), "rfi_number": rfi["source_ref"], "success": False, "error": str(e)}


def generate_form(results: list[dict], output_path: Path):
    score_5s = sorted([r for r in results if r.get("learning_value", {}).get("score") == 5],
                      key=lambda x: x.get("co_amount", 0), reverse=True)
    score_45s = sorted([r for r in results if r.get("learning_value", {}).get("score") == 4.5],
                       key=lambda x: x.get("co_amount", 0), reverse=True)[:20]

    def esc(t):
        if not t: return ""
        return str(t).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Score 5 Search Results</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;padding:20px}}
.container{{max-width:1200px;margin:0 auto}}
h1{{color:#fff;margin-bottom:8px}}
.subtitle{{color:#94a3b8;margin-bottom:20px}}
.stats{{background:linear-gradient(135deg,#dc2626,#9333ea);padding:15px 20px;border-radius:8px;margin-bottom:20px;display:flex;gap:30px}}
.stat{{text-align:center}}.stat-value{{font-size:28px;font-weight:bold}}.stat-label{{font-size:11px;opacity:0.9}}
.validated{{background:#166534;border-radius:8px;padding:12px;margin-bottom:20px}}
.validated h3{{color:#86efac;font-size:13px;margin-bottom:8px}}
.validated-list{{display:flex;gap:8px;flex-wrap:wrap}}
.validated-item{{background:#14532d;padding:3px 8px;border-radius:4px;font-size:11px}}
.section{{padding:12px 15px;border-radius:6px;font-weight:bold;color:white;margin:20px 0 12px;display:flex;justify-content:space-between}}
.section.s5{{background:linear-gradient(135deg,#dc2626,#991b1b)}}.section.s45{{background:linear-gradient(135deg,#ea580c,#9a3412)}}
.card{{background:#1e293b;border-radius:8px;margin-bottom:12px;border-left:4px solid #ef4444}}
.card.s45{{border-left-color:#f97316}}
.card-header{{background:#0f172a;padding:12px 15px;display:flex;justify-content:space-between;align-items:center;cursor:pointer}}
.card-header:hover{{background:#1e293b}}
.main{{display:flex;align-items:center;gap:12px;flex-wrap:wrap}}
.co{{font-size:15px;font-weight:bold;color:#22c55e;min-width:90px}}
.rfi-id{{font-weight:bold;color:#fff}}
.project{{background:#334155;padding:2px 8px;border-radius:4px;font-size:11px;color:#94a3b8}}
.type{{padding:2px 6px;border-radius:3px;font-size:9px;font-weight:bold;text-transform:uppercase}}
.type.code_violation,.type.safety_issue{{background:#7f1d1d;color:#fecaca}}
.type.damage_occurred,.type.structural_issue{{background:#7c2d12;color:#fed7aa}}
.badge{{padding:4px 10px;border-radius:10px;font-weight:bold;font-size:12px;color:white}}
.badge.s5{{background:#dc2626}}.badge.s45{{background:#ea580c}}
.content{{padding:15px;display:none}}.content.open{{display:block}}
.text-box{{background:#0f172a;padding:10px;border-radius:4px;font-size:13px;margin-bottom:10px;border:1px solid #334155;max-height:150px;overflow-y:auto;white-space:pre-wrap}}
.text-label{{font-size:10px;color:#64748b;margin-bottom:3px;text-transform:uppercase}}
.summary{{background:#312e81;border:1px solid #4338ca;border-radius:6px;padding:10px;margin:10px 0}}
.summary-label{{font-size:9px;color:#a5b4fc;text-transform:uppercase}}
.summary-text{{font-size:13px;color:#e0e7ff;margin-top:3px}}
.reasoning{{background:#1e1b4b;border:1px solid #4338ca;border-radius:6px;padding:10px;margin:10px 0}}
.feedback{{background:#1e3a5f;border:2px solid #3b82f6;border-radius:6px;padding:12px;margin-top:12px}}
.feedback h4{{color:#93c5fd;margin-bottom:10px;font-size:12px}}
.agree-row{{display:flex;gap:6px;margin-bottom:10px}}
.agree-btn{{flex:1;padding:8px;border:2px solid #475569;border-radius:4px;background:#1e293b;color:#e2e8f0;cursor:pointer;font-size:12px}}
.agree-btn:hover{{border-color:#3b82f6}}
.agree-btn.selected.agree{{background:#166534;border-color:#22c55e}}
.agree-btn.selected.disagree{{background:#7f1d1d;border-color:#ef4444}}
.fb-row{{display:flex;gap:10px}}
.fb-group{{flex:1}}
.fb-group label{{display:block;font-size:11px;color:#93c5fd;margin-bottom:3px}}
.fb-group select,.fb-group textarea{{width:100%;padding:6px;border:1px solid #475569;border-radius:4px;background:#0f172a;color:#e2e8f0;font-size:12px}}
.fb-group textarea{{min-height:40px}}
.export{{background:#1e293b;border-radius:8px;padding:12px 15px;margin-top:25px;position:sticky;bottom:15px;display:flex;gap:8px;align-items:center}}
.export-btn{{background:#3b82f6;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-size:13px}}
.export-btn:hover{{background:#2563eb}}.export-btn.sec{{background:#475569}}
.output{{flex:1;background:#0f172a;color:#94a3b8;padding:8px;border-radius:4px;font-family:monospace;font-size:10px;max-height:80px;overflow-y:auto;display:none}}
.output.visible{{display:block}}
</style></head><body>
<div class="container">
<h1>Score 5 Search Results</h1>
<p class="subtitle">Aggressive search for critical issues across entire dataset</p>
<div class="stats">
<div class="stat"><div class="stat-value">{len(results)}</div><div class="stat-label">Searched</div></div>
<div class="stat"><div class="stat-value" style="color:#fecaca">{len(score_5s)}</div><div class="stat-label">NEW Score 5</div></div>
<div class="stat"><div class="stat-value" style="color:#fed7aa">{len(score_45s)}</div><div class="stat-label">Score 4.5</div></div>
</div>
<div class="validated"><h3>Already Validated Score 5s (Excluded)</h3><div class="validated-list">
"""
    for p, r in VALIDATED_SCORE_5:
        html += f'<span class="validated-item">{r} ({p})</span>'

    html += '</div></div><div id="rfis">'

    idx = 0
    if score_5s:
        html += f'<div class="section s5">NEW CRITICAL (Score 5) <span>{len(score_5s)}</span></div>'
        for rfi in score_5s:
            html += gen_card(rfi, idx, 5, esc)
            idx += 1

    if score_45s:
        html += f'<div class="section s45">IMPORTANT (Score 4.5) <span>{len(score_45s)}</span></div>'
        for rfi in score_45s:
            html += gen_card(rfi, idx, 4.5, esc)
            idx += 1

    html += """</div>
<div class="export">
<button class="export-btn" onclick="exp()">Export</button>
<button class="export-btn sec" onclick="copy()">Copy</button>
<button class="export-btn sec" onclick="expAll()">Expand All</button>
<div class="output" id="out"></div>
</div></div>
<script>
const ag={};
function tog(i){document.getElementById('c'+i).classList.toggle('open')}
function expAll(){document.querySelectorAll('.content').forEach(c=>c.classList.add('open'))}
function setAg(i,v){ag[i]=v;document.querySelector(`[data-i="${i}"]`).querySelectorAll('.agree-btn').forEach(b=>b.classList.remove('selected','agree','disagree'));event.target.classList.add('selected',v)}
function exp(){
const fb=[];document.querySelectorAll('.card').forEach(c=>{const i=c.dataset.i;if(!ag[i])return;
fb.push({rfi:c.querySelector('.rfi-id').textContent,project:c.querySelector('.project').textContent,score:c.querySelector('.badge').textContent,agreement:ag[i],your_score:document.getElementById('s'+i)?.value||null,notes:document.getElementById('n'+i)?.value||null})});
const out=document.getElementById('out');out.textContent=JSON.stringify({date:new Date().toISOString(),count:fb.length,feedback:fb},null,2);out.classList.add('visible')}
function copy(){const out=document.getElementById('out');if(!out.textContent)exp();navigator.clipboard.writeText(out.textContent).then(()=>alert('Copied!'))}
</script></body></html>"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)


def gen_card(rfi, idx, score, esc):
    lv = rfi.get("learning_value", {})
    summary = rfi.get("summary", {})
    act = rfi.get("actionability", {})
    sc = "s5" if score == 5 else "s45"
    lt = summary.get("lesson_type", "unknown")

    return f"""
<div class="card {sc}" data-i="{idx}">
<div class="card-header" onclick="tog({idx})">
<div class="main">
<span class="co">${rfi.get('co_amount',0):,.0f}</span>
<span class="rfi-id">{esc(rfi.get('rfi_number',''))}</span>
<span class="project">{esc(rfi.get('project','')[:25])}</span>
<span class="type {lt}">{lt.replace('_',' ')}</span>
</div>
<span class="badge {sc}">Score {score}</span>
</div>
<div class="content" id="c{idx}">
<div class="text-label">Question</div>
<div class="text-box">{esc((rfi.get('question_text') or '')[:800])}</div>
<div class="text-label">Resolution</div>
<div class="text-box">{esc((rfi.get('resolution_text') or 'N/A')[:400])}</div>
<div class="summary"><div class="summary-label">Summary</div><div class="summary-text">{esc(summary.get('one_line',''))}</div></div>
<div class="reasoning"><div class="summary-label">Why Score {score}</div><div class="summary-text">{esc(lv.get('reasoning',''))}</div></div>
<div class="summary"><div class="summary-label">Action</div><div class="summary-text">{esc(act.get('specific_action',''))}</div></div>
<div class="feedback"><h4>Feedback</h4>
<div class="agree-row">
<button class="agree-btn" onclick="setAg({idx},'agree')">Agree</button>
<button class="agree-btn" onclick="setAg({idx},'disagree')">Disagree</button>
</div>
<div class="fb-row">
<div class="fb-group"><label>Your Score</label><select id="s{idx}"><option value="">Keep {score}</option><option value="5">5</option><option value="4.5">4.5</option><option value="4">4</option><option value="3">3</option></select></div>
<div class="fb-group"><label>Notes</label><textarea id="n{idx}" placeholder="Why?"></textarea></div>
</div></div></div></div>"""


async def main():
    print("=" * 80)
    print("AGGRESSIVE SCORE 5 SEARCH")
    print("=" * 80)
    print("Searching entire dataset for critical issues...")
    print()

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        rfis = await search_critical_patterns(conn)

        print(f"\nScoring {len(rfis)} candidates...")
        semaphore = asyncio.Semaphore(15)

        results = []
        for i in range(0, len(rfis), 15):
            batch = rfis[i:i+15]
            batch_results = await asyncio.gather(*[score_rfi(r, semaphore) for r in batch])
            results.extend(batch_results)

            # Count 5s so far
            fives = sum(1 for r in results if r.get("success") and r.get("learning_value", {}).get("score") == 5)
            print(f"  {min(i+15, len(rfis))}/{len(rfis)} - Found {fives} Score 5s so far")

        successful = [r for r in results if r.get("success")]

        # Distribution
        dist = {}
        for r in successful:
            s = r.get("learning_value", {}).get("score", 0)
            dist[s] = dist.get(s, 0) + 1

        print("\n" + "=" * 80)
        print("FINAL DISTRIBUTION")
        print("=" * 80)
        for s in [5, 4.5, 4, 3, 2, 1]:
            if s in dist:
                print(f"  Score {s}: {dist[s]}")

        # Save
        output = {"generated_at": datetime.now().isoformat(), "total": len(successful), "distribution": dist, "results": successful}
        json_path = REPORTS_DIR / "score_5_search.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        form_path = REPORTS_DIR / "score_5_feedback.html"
        generate_form(successful, form_path)
        print(f"\nFeedback form: {form_path}")

        # Show all 5s
        fives = [r for r in successful if r.get("learning_value", {}).get("score") == 5]
        if fives:
            print("\n" + "=" * 80)
            print(f"ALL NEW SCORE 5 RFIs ({len(fives)})")
            print("=" * 80)
            for r in sorted(fives, key=lambda x: x.get("co_amount", 0), reverse=True):
                lt = r.get("summary", {}).get("lesson_type", "")
                print(f"\n{r['rfi_number']} ({r['project'][:25]}) - ${r.get('co_amount',0):,.0f}")
                print(f"  Type: {lt}")
                print(f"  {r.get('summary',{}).get('one_line','')[:100]}")
                print(f"  Why 5: {r.get('learning_value',{}).get('reasoning','')[:120]}")
        else:
            print("\nNo new Score 5s found - may need to adjust criteria further")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
