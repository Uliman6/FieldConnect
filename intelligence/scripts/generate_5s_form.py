#!/usr/bin/env python3
"""Generate feedback form for score-5 results."""

import json
from pathlib import Path

REPORTS_DIR = Path(__file__).parent.parent / "reports"

with open(REPORTS_DIR / 'impact_scoring_v2.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

results = data['results']

# Sort by score descending
sorted_rfis = sorted(
    [r for r in results if r.get('success')],
    key=lambda x: x.get('learning_value', {}).get('score', 0),
    reverse=True
)

def escape_html(text):
    if not text:
        return ''
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

html = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Score 5 RFIs - Feedback Form</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; padding: 20px; line-height: 1.5; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #1a1a2e; margin-bottom: 10px; }
        .subtitle { color: #666; margin-bottom: 20px; }

        .stats-bar { background: #dc2626; color: white; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px; display: flex; gap: 25px; flex-wrap: wrap; }
        .stat { text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; }
        .stat-label { font-size: 11px; opacity: 0.9; }

        .section-header { padding: 12px 15px; border-radius: 6px; font-weight: bold; color: white; margin-top: 25px; margin-bottom: 12px; font-size: 16px; }
        .section-header.score-5 { background: #dc2626; }
        .section-header.score-45 { background: #f97316; }
        .section-header.score-4 { background: #ea580c; }
        .section-header.score-3 { background: #ca8a04; }

        .rfi-card { background: white; border-radius: 8px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; }
        .rfi-header { background: #f8fafc; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; gap: 8px; }
        .rfi-id { font-weight: bold; color: #1e3a5f; font-size: 15px; }
        .rfi-project { background: #dbeafe; padding: 3px 10px; border-radius: 4px; font-size: 12px; color: #1e40af; }
        .rfi-trade { background: #fef3c7; padding: 3px 10px; border-radius: 4px; font-size: 12px; color: #92400e; }
        .score-badge { padding: 4px 12px; border-radius: 12px; font-weight: bold; font-size: 13px; color: white; }
        .score-badge.score-5 { background: #dc2626; }
        .score-badge.score-45 { background: #f97316; }
        .score-badge.score-4 { background: #ea580c; }
        .score-badge.score-3 { background: #ca8a04; }

        .rfi-content { padding: 15px; }
        .text-box { background: #f8f9fa; padding: 12px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; border: 1px solid #e5e7eb; line-height: 1.6; white-space: pre-wrap; }
        .text-box.resolution { background: #f0fdf4; border-color: #bbf7d0; max-height: 150px; overflow-y: auto; }
        .text-label { font-size: 11px; font-weight: 600; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; }

        .dimensions { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 15px 0; }
        .dim-box { background: #fefce8; padding: 10px 12px; border-radius: 6px; border: 1px solid #fef08a; }
        .dim-box.action { background: #ecfdf5; border-color: #a7f3d0; }
        .dim-box.root { background: #eff6ff; border-color: #bfdbfe; }
        .dim-label { font-size: 10px; color: #78350f; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
        .dim-box.action .dim-label { color: #065f46; }
        .dim-box.root .dim-label { color: #1e40af; }
        .dim-value { font-size: 14px; color: #1f2937; font-weight: 500; margin-top: 3px; }
        .dim-detail { font-size: 12px; color: #6b7280; margin-top: 4px; }

        .summary-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 15px; border-radius: 6px; margin: 12px 0; }
        .summary-box .label { font-size: 10px; opacity: 0.8; text-transform: uppercase; }
        .summary-box .text { font-size: 14px; margin-top: 3px; }

        .feedback-section { background: #f1f5f9; border: 2px solid #94a3b8; border-radius: 8px; padding: 15px; margin-top: 15px; }
        .feedback-section h4 { color: #475569; margin-bottom: 12px; font-size: 13px; }
        .agree-row { display: flex; gap: 8px; margin-bottom: 12px; }
        .agree-btn { flex: 1; padding: 8px 12px; border: 2px solid #cbd5e1; border-radius: 6px; background: white; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s; }
        .agree-btn:hover { border-color: #3b82f6; background: #eff6ff; }
        .agree-btn.selected.agree { background: #dcfce7; border-color: #22c55e; color: #166534; }
        .agree-btn.selected.disagree { background: #fee2e2; border-color: #ef4444; color: #991b1b; }
        .feedback-group { margin-top: 10px; }
        .feedback-group label { display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px; }
        .feedback-group select, .feedback-group textarea { width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; }
        .feedback-group textarea { min-height: 50px; resize: vertical; }

        .export-section { background: #1e293b; color: white; border-radius: 8px; padding: 15px 20px; margin-top: 30px; position: sticky; bottom: 15px; }
        .export-btn { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; margin-right: 10px; }
        .export-btn:hover { background: #2563eb; }
        .output-area { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 6px; margin-top: 12px; font-family: monospace; font-size: 11px; max-height: 200px; overflow-y: auto; display: none; white-space: pre-wrap; }
        .output-area.visible { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Score 5 RFIs - Critical Learning</h1>
        <p class="subtitle">Review and provide feedback on top-tier learning opportunities</p>
'''

# Stats
score_counts = {5: 0, 4.5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
for r in sorted_rfis:
    s = r.get('learning_value', {}).get('score', 0)
    if s in score_counts:
        score_counts[s] += 1

html += f'''
        <div class="stats-bar">
            <div class="stat"><div class="stat-value">{len(sorted_rfis)}</div><div class="stat-label">Total Reviewed</div></div>
            <div class="stat"><div class="stat-value">{score_counts[5]}</div><div class="stat-label">Score 5 (Critical)</div></div>
            <div class="stat"><div class="stat-value">{score_counts[4.5]}</div><div class="stat-label">Score 4.5 (Checks)</div></div>
            <div class="stat"><div class="stat-value">{score_counts[4]}</div><div class="stat-label">Score 4 (Notable)</div></div>
            <div class="stat"><div class="stat-value">{score_counts[3]}</div><div class="stat-label">Score 3</div></div>
        </div>
        <div id="rfi-container">
'''

current_score = None
shown_counts = {5: 0, 4.5: 0, 4: 0, 3: 0}
limits = {5: 999, 4.5: 30, 4: 15, 3: 10}  # Show all 5s, 30 4.5s, 15 4s, 10 3s

for idx, rfi in enumerate(sorted_rfis):
    score = rfi.get('learning_value', {}).get('score', 0)

    # Only show scores 3 and above, with limits
    if score < 3:
        continue
    if score in shown_counts:
        if shown_counts[score] >= limits.get(score, 10):
            continue
        shown_counts[score] += 1

    if score != current_score:
        current_score = score
        labels = {5: 'CRITICAL (Score 5)', 4.5: 'IMPORTANT CHECKS (Score 4.5)', 4: 'NOTABLE (Score 4)', 3: 'WORTH TRACKING (Score 3)'}
        score_class = 'score-45' if score == 4.5 else f'score-{int(score)}'
        html += f'<div class="section-header {score_class}">{labels.get(score, f"Score {score}")}</div>\n'

    lv = rfi.get('learning_value', {})
    app = rfi.get('applicability_scope', {})
    act = rfi.get('actionability', {})
    rc = rfi.get('root_cause_clarity', {})
    summary = rfi.get('summary', {})

    question = escape_html(rfi.get('question_text', ''))
    resolution = escape_html((rfi.get('resolution_text') or '')[:600])
    trade = rfi.get('trade') or 'Not specified'

    html += f'''
            <div class="rfi-card" data-idx="{idx}">
                <div class="rfi-header">
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <span class="rfi-id">{escape_html(rfi['rfi_number'])}</span>
                        <span class="rfi-project">{escape_html(rfi['project'])}</span>
                        <span class="rfi-trade">{escape_html(trade)}</span>
                    </div>
                    <span class="score-badge {'score-45' if score == 4.5 else f'score-{int(score)}'}">Score {score}</span>
                </div>
                <div class="rfi-content">
                    <div class="text-label">Question</div>
                    <div class="text-box">{question}</div>

                    <div class="text-label">Resolution</div>
                    <div class="text-box resolution">{resolution if resolution else 'No resolution recorded'}</div>

                    <div class="summary-box">
                        <div class="label">AI Summary</div>
                        <div class="text">{escape_html(summary.get('one_line', ''))}</div>
                    </div>

                    <div class="dimensions">
                        <div class="dim-box">
                            <div class="dim-label">Applicability</div>
                            <div class="dim-value">{escape_html(app.get('level', '?')).upper()}</div>
                            <div class="dim-detail">{', '.join(app.get('project_types', []))}</div>
                        </div>
                        <div class="dim-box action">
                            <div class="dim-label">Actionability</div>
                            <div class="dim-value">{escape_html(act.get('level', '?')).upper()}</div>
                            <div class="dim-detail">{escape_html(act.get('specific_action', ''))[:100]}</div>
                        </div>
                        <div class="dim-box root">
                            <div class="dim-label">Root Cause</div>
                            <div class="dim-value">{escape_html(rc.get('level', '?')).upper()}</div>
                            <div class="dim-detail">{escape_html(rc.get('root_cause', ''))[:100]}</div>
                        </div>
                    </div>

                    <div class="dim-box" style="background:#fef2f2;border-color:#fecaca;margin-top:10px;">
                        <div class="dim-label" style="color:#991b1b;">Learning Value Reasoning</div>
                        <div class="dim-detail" style="color:#7f1d1d;">{escape_html(lv.get('reasoning', ''))}</div>
                    </div>

                    <div class="feedback-section">
                        <h4>Your Feedback</h4>
                        <div class="agree-row">
                            <button class="agree-btn" onclick="setAgreement({idx},'agree')">Agree with Score</button>
                            <button class="agree-btn" onclick="setAgreement({idx},'disagree')">Disagree</button>
                        </div>
                        <div class="feedback-group">
                            <label>Your Score (if different)</label>
                            <select id="score-{idx}">
                                <option value="">Keep as {score}</option>
                                <option value="5">5 - Critical</option>
                                <option value="4">4 - Important</option>
                                <option value="3">3 - Notable</option>
                                <option value="2">2 - Routine</option>
                                <option value="1">1 - No Learning</option>
                            </select>
                        </div>
                        <div class="feedback-group">
                            <label>Notes</label>
                            <textarea id="notes-{idx}" placeholder="Why do you agree/disagree? What would you change?"></textarea>
                        </div>
                    </div>
                </div>
            </div>
'''

html += '''
        </div>
        <div class="export-section">
            <button class="export-btn" onclick="exportFeedback()">Export Feedback JSON</button>
            <button class="export-btn" onclick="copyToClipboard()">Copy to Clipboard</button>
            <div class="output-area" id="output-area"></div>
        </div>
    </div>
    <script>
        const agreements = {};
        function setAgreement(idx, val) {
            agreements[idx] = val;
            const card = document.querySelector(`[data-idx="${idx}"]`);
            card.querySelectorAll('.agree-btn').forEach(b => b.classList.remove('selected','agree','disagree'));
            event.target.classList.add('selected', val);
        }
        function exportFeedback() {
            const fb = [];
            document.querySelectorAll('.rfi-card').forEach(card => {
                const idx = parseInt(card.dataset.idx);
                if (!agreements[idx]) return;
                fb.push({
                    rfi_number: card.querySelector('.rfi-id').textContent,
                    project: card.querySelector('.rfi-project').textContent,
                    original_score: parseInt(card.querySelector('.score-badge').textContent.replace('Score ', '')),
                    agreement: agreements[idx],
                    your_score: document.getElementById(`score-${idx}`)?.value || null,
                    notes: document.getElementById(`notes-${idx}`)?.value || null
                });
            });
            const out = {
                feedback_date: new Date().toISOString(),
                total_reviewed: fb.length,
                feedback: fb
            };
            const area = document.getElementById('output-area');
            area.textContent = JSON.stringify(out, null, 2);
            area.classList.add('visible');
        }
        function copyToClipboard() {
            const area = document.getElementById('output-area');
            if (!area.textContent) exportFeedback();
            navigator.clipboard.writeText(area.textContent).then(() => alert('Copied to clipboard!'));
        }
    </script>
</body>
</html>
'''

output_path = REPORTS_DIR / 'impact_scoring_5s_feedback.html'
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(html)

print(f'Generated: {output_path}')
print(f'Score 5s: {score_counts[5]}, Score 4.5s: {score_counts[4.5]}, Score 4s: {score_counts[4]}, Score 3s: {score_counts[3]}')
