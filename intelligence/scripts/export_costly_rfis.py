#!/usr/bin/env python3
"""Export costliest RFIs analysis and create feedback form."""

import asyncio
import os
import sys
import json
import csv
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg

REPORTS_DIR = Path(__file__).parent.parent / "reports"


def escape_html(text):
    if not text:
        return ''
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


async def main():
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))

    # Load scoring data
    with open(REPORTS_DIR / 'impact_scoring_v2.json', 'r', encoding='utf-8') as f:
        scoring = json.load(f)

    # Create scoring lookup
    score_lookup = {}
    for result in scoring['results']:
        key = (result['project'], result['rfi_number'])
        score_lookup[key] = result

    # Get all RFIs with CO amounts
    rows = await conn.fetch('''
        SELECT id, source_ref, source_project_name, cost_impact,
               question_text, resolution_text, trade_category
        FROM intelligence.items
        WHERE cost_impact > 0
        ORDER BY cost_impact DESC
    ''')

    # Build comprehensive data
    rfis_data = []
    for row in rows:
        key = (row['source_project_name'], row['source_ref'])
        scoring_data = score_lookup.get(key, {})

        lv = scoring_data.get('learning_value', {})
        app = scoring_data.get('applicability_scope', {})
        act = scoring_data.get('actionability', {})
        rc = scoring_data.get('root_cause_clarity', {})
        summary = scoring_data.get('summary', {})

        rfis_data.append({
            'rfi_number': row['source_ref'],
            'project': row['source_project_name'],
            'trade': row['trade_category'] or '',
            'co_amount': float(row['cost_impact']),
            'current_score': lv.get('score', 'N/A'),
            'score_reasoning': lv.get('reasoning', ''),
            'applicability': app.get('level', ''),
            'applicability_types': ', '.join(app.get('project_types', [])),
            'actionability': act.get('level', ''),
            'specific_action': act.get('specific_action', ''),
            'action_phase': act.get('action_phase', ''),
            'root_cause_clarity': rc.get('level', ''),
            'root_cause': rc.get('root_cause', ''),
            'summary': summary.get('one_line', ''),
            'lesson_type': summary.get('lesson_type', ''),
            'question_text': row['question_text'] or '',
            'resolution_text': row['resolution_text'] or '',
            'flag': 'UNDERSCORE?' if (lv.get('score', 0) or 0) <= 3 and float(row['cost_impact']) > 50000 else ''
        })

    # Export to JSON
    json_output = {
        'generated_at': str(asyncio.get_event_loop().time()),
        'total_rfis': len(rfis_data),
        'total_co_amount': sum(r['co_amount'] for r in rfis_data),
        'by_project': {},
        'rfis': rfis_data
    }

    # Aggregate by project
    for rfi in rfis_data:
        p = rfi['project']
        if p not in json_output['by_project']:
            json_output['by_project'][p] = {'count': 0, 'total_co': 0, 'rfis': []}
        json_output['by_project'][p]['count'] += 1
        json_output['by_project'][p]['total_co'] += rfi['co_amount']
        json_output['by_project'][p]['rfis'].append(rfi['rfi_number'])

    json_path = REPORTS_DIR / 'costly_rfis_analysis.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(json_output, f, indent=2, ensure_ascii=False)
    print(f"Exported JSON: {json_path}")

    # Export to CSV
    csv_path = REPORTS_DIR / 'costly_rfis_analysis.csv'
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'rfi_number', 'project', 'trade', 'co_amount', 'current_score',
            'applicability', 'actionability', 'root_cause_clarity',
            'specific_action', 'summary', 'flag', 'question_text'
        ])
        writer.writeheader()
        for rfi in rfis_data:
            writer.writerow({
                'rfi_number': rfi['rfi_number'],
                'project': rfi['project'],
                'trade': rfi['trade'],
                'co_amount': rfi['co_amount'],
                'current_score': rfi['current_score'],
                'applicability': rfi['applicability'],
                'actionability': rfi['actionability'],
                'root_cause_clarity': rfi['root_cause_clarity'],
                'specific_action': rfi['specific_action'][:100] if rfi['specific_action'] else '',
                'summary': rfi['summary'][:100] if rfi['summary'] else '',
                'flag': rfi['flag'],
                'question_text': rfi['question_text'][:300] if rfi['question_text'] else ''
            })
    print(f"Exported CSV: {csv_path}")

    # Generate feedback form HTML
    html = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Costly RFIs - Review & Rescore</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; line-height: 1.5; }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { color: #fff; margin-bottom: 10px; }
        .subtitle { color: #888; margin-bottom: 20px; }

        .stats-bar { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; margin-bottom: 25px; display: flex; gap: 30px; flex-wrap: wrap; }
        .stat { text-align: center; }
        .stat-value { font-size: 28px; font-weight: bold; }
        .stat-label { font-size: 12px; opacity: 0.8; }

        .project-section { margin-bottom: 30px; }
        .project-header { background: #2d2d44; padding: 15px 20px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center; }
        .project-name { font-size: 18px; font-weight: bold; color: #fff; }
        .project-stats { font-size: 14px; color: #aaa; }

        .rfi-card { background: #252538; border-radius: 0 0 8px 8px; margin-bottom: 2px; overflow: hidden; border-left: 4px solid #667eea; }
        .rfi-card.flagged { border-left-color: #ef4444; }
        .rfi-card.score-5 { border-left-color: #dc2626; }
        .rfi-card.score-45 { border-left-color: #f97316; }
        .rfi-card.score-4 { border-left-color: #eab308; }
        .rfi-card.score-3 { border-left-color: #22c55e; }
        .rfi-card.score-2 { border-left-color: #64748b; }

        .rfi-header { background: #1e1e2e; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; cursor: pointer; }
        .rfi-header:hover { background: #2a2a3e; }
        .rfi-main-info { display: flex; align-items: center; gap: 15px; }
        .co-amount { font-size: 18px; font-weight: bold; color: #22c55e; min-width: 120px; }
        .rfi-id { font-weight: bold; color: #fff; }
        .rfi-trade { background: #3d3d5c; padding: 2px 8px; border-radius: 4px; font-size: 11px; color: #aaa; }
        .current-score { padding: 4px 12px; border-radius: 12px; font-weight: bold; font-size: 13px; }
        .current-score.score-5 { background: #dc2626; color: white; }
        .current-score.score-45 { background: #f97316; color: white; }
        .current-score.score-4 { background: #eab308; color: black; }
        .current-score.score-3 { background: #22c55e; color: white; }
        .current-score.score-2 { background: #64748b; color: white; }
        .current-score.score-na { background: #374151; color: #9ca3af; }
        .flag-badge { background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }

        .rfi-details { display: none; padding: 20px; border-top: 1px solid #3d3d5c; }
        .rfi-details.open { display: block; }

        .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 15px; }
        .detail-box { background: #1e1e2e; padding: 12px; border-radius: 6px; }
        .detail-label { font-size: 10px; color: #888; text-transform: uppercase; margin-bottom: 4px; }
        .detail-value { font-size: 13px; color: #ddd; }

        .text-section { margin-bottom: 15px; }
        .text-section-label { font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 5px; }
        .text-content { background: #1e1e2e; padding: 12px; border-radius: 6px; font-size: 13px; color: #ccc; max-height: 150px; overflow-y: auto; white-space: pre-wrap; }

        .feedback-section { background: #1a365d; border: 2px solid #3182ce; border-radius: 8px; padding: 15px; margin-top: 15px; }
        .feedback-section h4 { color: #90cdf4; margin-bottom: 12px; font-size: 14px; }
        .feedback-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 12px; }
        .feedback-group label { display: block; font-size: 11px; color: #90cdf4; margin-bottom: 4px; }
        .feedback-group select, .feedback-group textarea { width: 100%; padding: 8px; border: 1px solid #4a5568; border-radius: 4px; background: #2d3748; color: #fff; font-size: 13px; }
        .feedback-group textarea { min-height: 60px; resize: vertical; }

        .export-bar { background: #2d2d44; border-radius: 8px; padding: 15px 20px; margin-top: 30px; position: sticky; bottom: 15px; display: flex; gap: 10px; align-items: center; }
        .export-btn { background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; }
        .export-btn:hover { background: #5a67d8; }
        .export-btn.secondary { background: #4a5568; }
        .output-area { flex: 1; background: #1a1a2e; color: #a0aec0; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 11px; max-height: 100px; overflow-y: auto; display: none; }
        .output-area.visible { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Costly RFIs - Review & Rescore</h1>
        <p class="subtitle">RFIs with Change Order amounts - sorted by CO value</p>
'''

    # Stats
    total_co = sum(r['co_amount'] for r in rfis_data)
    flagged_count = sum(1 for r in rfis_data if r['flag'])

    html += f'''
        <div class="stats-bar">
            <div class="stat"><div class="stat-value">{len(rfis_data)}</div><div class="stat-label">RFIs with CO Data</div></div>
            <div class="stat"><div class="stat-value">${total_co/1000000:.1f}M</div><div class="stat-label">Total CO Amount</div></div>
            <div class="stat"><div class="stat-value">{flagged_count}</div><div class="stat-label">Flagged for Review</div></div>
            <div class="stat"><div class="stat-value">{len(json_output['by_project'])}</div><div class="stat-label">Projects</div></div>
        </div>
'''

    # Group by project
    by_project = {}
    for rfi in rfis_data:
        p = rfi['project']
        if p not in by_project:
            by_project[p] = []
        by_project[p].append(rfi)

    # Sort projects by total CO
    sorted_projects = sorted(by_project.items(), key=lambda x: sum(r['co_amount'] for r in x[1]), reverse=True)

    idx = 0
    for project, rfis in sorted_projects:
        project_total = sum(r['co_amount'] for r in rfis)

        html += f'''
        <div class="project-section">
            <div class="project-header">
                <span class="project-name">{escape_html(project)}</span>
                <span class="project-stats">{len(rfis)} RFIs | ${project_total:,.0f} Total CO</span>
            </div>
'''

        for rfi in rfis:
            score = rfi['current_score']
            score_class = 'score-na'
            if score == 5:
                score_class = 'score-5'
            elif score == 4.5:
                score_class = 'score-45'
            elif score == 4:
                score_class = 'score-4'
            elif score == 3:
                score_class = 'score-3'
            elif score in [1, 2]:
                score_class = 'score-2'

            card_class = f"rfi-card {score_class}"
            if rfi['flag']:
                card_class += " flagged"

            html += f'''
            <div class="{card_class}" data-idx="{idx}">
                <div class="rfi-header" onclick="toggleDetails({idx})">
                    <div class="rfi-main-info">
                        <span class="co-amount">${rfi['co_amount']:,.0f}</span>
                        <span class="rfi-id">{escape_html(rfi['rfi_number'])}</span>
                        <span class="rfi-trade">{escape_html(rfi['trade']) or 'N/A'}</span>
                        {f'<span class="flag-badge">REVIEW</span>' if rfi['flag'] else ''}
                    </div>
                    <span class="current-score {score_class}">Score {score}</span>
                </div>
                <div class="rfi-details" id="details-{idx}">
                    <div class="detail-grid">
                        <div class="detail-box">
                            <div class="detail-label">Summary</div>
                            <div class="detail-value">{escape_html(rfi['summary']) or 'N/A'}</div>
                        </div>
                        <div class="detail-box">
                            <div class="detail-label">Applicability</div>
                            <div class="detail-value">{escape_html(rfi['applicability']).upper() or 'N/A'}</div>
                        </div>
                        <div class="detail-box">
                            <div class="detail-label">Actionability</div>
                            <div class="detail-value">{escape_html(rfi['actionability']).upper() or 'N/A'}</div>
                        </div>
                        <div class="detail-box">
                            <div class="detail-label">Root Cause Clarity</div>
                            <div class="detail-value">{escape_html(rfi['root_cause_clarity']).upper() or 'N/A'}</div>
                        </div>
                    </div>
                    <div class="detail-grid">
                        <div class="detail-box" style="grid-column: span 2;">
                            <div class="detail-label">Specific Action</div>
                            <div class="detail-value">{escape_html(rfi['specific_action']) or 'N/A'}</div>
                        </div>
                        <div class="detail-box" style="grid-column: span 2;">
                            <div class="detail-label">Root Cause</div>
                            <div class="detail-value">{escape_html(rfi['root_cause']) or 'N/A'}</div>
                        </div>
                    </div>
                    <div class="detail-grid">
                        <div class="detail-box">
                            <div class="detail-label">Score Reasoning</div>
                            <div class="detail-value">{escape_html(rfi['score_reasoning'][:300]) if rfi['score_reasoning'] else 'N/A'}</div>
                        </div>
                    </div>
                    <div class="text-section">
                        <div class="text-section-label">Question</div>
                        <div class="text-content">{escape_html(rfi['question_text'])}</div>
                    </div>
                    <div class="text-section">
                        <div class="text-section-label">Resolution</div>
                        <div class="text-content">{escape_html(rfi['resolution_text'][:500]) if rfi['resolution_text'] else 'N/A'}</div>
                    </div>
                    <div class="feedback-section">
                        <h4>Your Feedback</h4>
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
                                    <option value="1">1 - No Learning</option>
                                </select>
                            </div>
                            <div class="feedback-group">
                                <label>Applicability</label>
                                <select id="app-{idx}">
                                    <option value="">Keep</option>
                                    <option value="broad">Broad</option>
                                    <option value="category_specific">Category Specific</option>
                                    <option value="narrow">Narrow</option>
                                </select>
                            </div>
                            <div class="feedback-group">
                                <label>Actionability</label>
                                <select id="act-{idx}">
                                    <option value="">Keep</option>
                                    <option value="high">High</option>
                                    <option value="medium">Medium</option>
                                    <option value="low">Low</option>
                                </select>
                            </div>
                        </div>
                        <div class="feedback-group">
                            <label>Notes / Suggested Action</label>
                            <textarea id="notes-{idx}" placeholder="Why change score? What's the real lesson here?"></textarea>
                        </div>
                    </div>
                </div>
            </div>
'''
            idx += 1

        html += '        </div>\n'

    html += '''
        <div class="export-bar">
            <button class="export-btn" onclick="exportFeedback()">Export Feedback JSON</button>
            <button class="export-btn secondary" onclick="copyToClipboard()">Copy to Clipboard</button>
            <button class="export-btn secondary" onclick="expandAll()">Expand All</button>
            <div class="output-area" id="output-area"></div>
        </div>
    </div>
    <script>
        function toggleDetails(idx) {
            const details = document.getElementById('details-' + idx);
            details.classList.toggle('open');
        }

        function expandAll() {
            document.querySelectorAll('.rfi-details').forEach(d => d.classList.add('open'));
        }

        function exportFeedback() {
            const feedback = [];
            document.querySelectorAll('.rfi-card').forEach((card, idx) => {
                const scoreEl = document.getElementById('score-' + idx);
                const appEl = document.getElementById('app-' + idx);
                const actEl = document.getElementById('act-' + idx);
                const notesEl = document.getElementById('notes-' + idx);

                if (scoreEl.value || appEl.value || actEl.value || notesEl.value) {
                    const rfiId = card.querySelector('.rfi-id').textContent;
                    const coAmount = card.querySelector('.co-amount').textContent;
                    const currentScore = card.querySelector('.current-score').textContent.replace('Score ', '');

                    feedback.push({
                        rfi_number: rfiId,
                        co_amount: coAmount,
                        current_score: currentScore,
                        new_score: scoreEl.value || null,
                        new_applicability: appEl.value || null,
                        new_actionability: actEl.value || null,
                        notes: notesEl.value || null
                    });
                }
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
'''

    form_path = REPORTS_DIR / 'costly_rfis_feedback.html'
    with open(form_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Feedback form: {form_path}")

    # Show mismatch analysis
    print("\n" + "=" * 70)
    print("CO MAPPING ANALYSIS - POTENTIAL MISMATCHES")
    print("=" * 70)

    # Check CoreSite specifically
    print("\nCoresite RFIs in database:")
    coresite_db = await conn.fetch('''
        SELECT source_ref, cost_impact
        FROM intelligence.items
        WHERE source_project_name = 'CoreSite Data Center'
          AND resulted_in_co = true
        ORDER BY source_ref
        LIMIT 20
    ''')
    for r in coresite_db[:10]:
        print(f"  {r['source_ref']}: ${float(r['cost_impact'] or 0):,.0f}")

    print(f"\n  ... total {len(coresite_db)} CoreSite RFIs in DB")

    await conn.close()

    print("\n" + "=" * 70)
    print("EXPORTS COMPLETE")
    print("=" * 70)
    print(f"  JSON: {json_path}")
    print(f"  CSV: {csv_path}")
    print(f"  Feedback Form: {form_path}")


if __name__ == "__main__":
    asyncio.run(main())
