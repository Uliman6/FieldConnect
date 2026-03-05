"""
FieldConnect Intelligence Layer — Integration Test Suite
Run after Session 6 to validate every layer of the pipeline.

Usage:
    python tests/integration_test.py

Outputs:
    tests/test_report.html — open in browser to review results
"""

import asyncio
import json
import os
import sys
import time
from datetime import datetime

# Add parent dir to path so we can import service modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

# ============================================================
# CONFIGURATION — Update these before running
# ============================================================

# Your company_id in the intelligence DB
COMPANY_ID = "00000000-0000-0000-0000-000000000001"

# Pick a project_id that has the most data
PRIMARY_PROJECT_ID = "southline-office"

# Test observations — write these as if you were speaking them on a job site.
# Mix of trades, phases, and issue types. Add as many as you want.
TEST_OBSERVATIONS = [
    {
        "text": "The curtainwall installer is asking about mullion alignment tolerances at Level 3 north side",
        "phase": "envelope",
        "expected_trades": ["curtainwall"],
        "expected_entities": ["mullion"],
        "notes": "Should match any past curtainwall/glazing issues"
    },
    {
        "text": "City fire marshal wants additional smoke detectors in the electrical rooms on every floor",
        "phase": "mep_trim_out",
        "expected_trades": ["fire protection", "electrical"],
        "expected_entities": ["fire marshal", "smoke detector", "electrical room"],
        "notes": "Should match inspector-related items"
    },
    {
        "text": "Rebar placement in the foundation wall doesn't match the structural drawings",
        "phase": "foundation",
        "expected_trades": ["structural steel", "concrete"],
        "expected_entities": ["rebar", "foundation wall", "structural drawings"],
        "notes": "Should match RFIs about rebar/foundation coordination"
    },
    {
        "text": "The painters used a protective adhesive on the metal panels that left residue we can't remove",
        "phase": "interior_finishes",
        "expected_trades": ["painting and coatings"],
        "expected_entities": ["adhesive", "metal panels", "residue"],
        "notes": "Should match material damage/workmanship issues"
    },
    {
        "text": "Plumbing rough-in locations don't match the architectural reflected ceiling plan",
        "phase": "mep_rough_in",
        "expected_trades": ["mechanical piping"],
        "expected_entities": ["plumbing", "reflected ceiling plan"],
        "notes": "Should match coordination issues between trades"
    },
    {
        "text": "Grade beam conflicts with the plumbing routes",
        "phase": "underground_utilities",
        "expected_trades": ["mechanical piping"],
        "expected_entities": ["plumbing", "structural drawings"],
        "notes": "Should match coordination issues between trades"
    },
    # -------------------------------------------------------
    # ADD YOUR OWN TEST OBSERVATIONS BELOW
    # The more specific to your actual project data, the better.
    # Think of real situations you experienced as a PE.
    # -------------------------------------------------------
    # {
    #     "text": "...",
    #     "phase": "...",
    #     "expected_trades": [...],
    #     "expected_entities": [...],
    #     "notes": "..."
    # },
]

# ============================================================
# TEST RUNNER
# ============================================================

class TestReport:
    def __init__(self):
        self.sections = []
        self.start_time = time.time()

    def add_section(self, title, content, test_type="review"):
        """test_type: 'review' (manual), 'auto' (pass/fail), 'info'"""
        self.sections.append({
            "title": title,
            "content": content,
            "test_type": test_type,
            "timestamp": datetime.now().isoformat()
        })

    def render_html(self):
        elapsed = time.time() - self.start_time
        html = f"""<!DOCTYPE html>
<html>
<head>
<title>Intelligence Layer Test Report</title>
<style>
    body {{ font-family: -apple-system, system-ui, sans-serif; max-width: 1000px; margin: 40px auto; padding: 0 20px; background: #f5f5f5; }}
    h1 {{ color: #1a1a1a; border-bottom: 3px solid #2d6a4f; padding-bottom: 10px; }}
    h2 {{ color: #2d6a4f; margin-top: 40px; }}
    .section {{ background: white; border-radius: 8px; padding: 24px; margin: 16px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
    .review {{ border-left: 4px solid #f59e0b; }}
    .auto {{ border-left: 4px solid #3b82f6; }}
    .info {{ border-left: 4px solid #6b7280; }}
    .verdict {{ margin-top: 16px; padding: 12px; background: #f0f0f0; border-radius: 4px; }}
    .verdict label {{ font-weight: bold; margin-right: 16px; cursor: pointer; }}
    pre {{ background: #1a1a2e; color: #e0e0e0; padding: 16px; border-radius: 6px; overflow-x: auto; font-size: 13px; line-height: 1.5; }}
    .tag {{ display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin: 2px; }}
    .tag-trade {{ background: #dbeafe; color: #1e40af; }}
    .tag-entity {{ background: #dcfce7; color: #166534; }}
    .tag-phase {{ background: #fef3c7; color: #92400e; }}
    .score {{ font-size: 24px; font-weight: bold; }}
    .score-high {{ color: #16a34a; }}
    .score-medium {{ color: #f59e0b; }}
    .score-low {{ color: #dc2626; }}
    .alert-card {{ background: #fafafa; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 8px 0; }}
    .match-reason {{ color: #6b7280; font-style: italic; }}
    table {{ width: 100%; border-collapse: collapse; margin: 12px 0; }}
    th, td {{ text-align: left; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }}
    th {{ background: #f9fafb; font-weight: 600; }}
    .stat {{ display: inline-block; text-align: center; padding: 12px 24px; margin: 4px; background: #f9fafb; border-radius: 6px; }}
    .stat-number {{ font-size: 28px; font-weight: bold; color: #2d6a4f; }}
    .stat-label {{ font-size: 12px; color: #6b7280; }}
    .notes {{ background: #fffbeb; padding: 12px; border-radius: 4px; margin-top: 8px; font-size: 14px; }}
</style>
</head>
<body>
<h1>Intelligence Layer Test Report</h1>
<p>Generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}<br>
Runtime: {elapsed:.1f} seconds</p>
"""
        for section in self.sections:
            css_class = section["test_type"]
            html += f"""
<div class="section {css_class}">
<h2>{section["title"]}</h2>
{section["content"]}
"""
            if section["test_type"] == "review":
                html += """
<div class="verdict">
    <strong>Your verdict:</strong>
    <label><input type="radio" name="{}" value="pass"> ✅ Looks right</label>
    <label><input type="radio" name="{}" value="partial"> ⚠️ Partially right</label>
    <label><input type="radio" name="{}" value="fail"> ❌ Wrong</label>
    <br><br>
    <textarea placeholder="Notes on what's wrong or missing..." style="width:100%;height:60px;border:1px solid #ddd;border-radius:4px;padding:8px;" ></textarea>
</div>
""".format(section["title"], section["title"], section["title"])
            html += "</div>"

        html += """
<div class="section info">
<h2>Summary — What to Fix</h2>
<p>Scroll back through your verdicts. For anything marked ⚠️ or ❌:</p>
<ol>
<li><strong>Normalizer issues</strong> → Add terms to <code>data/construction_terms.yaml</code></li>
<li><strong>Entity extraction misses</strong> → Adjust the extraction prompt in <code>extraction/entity_extractor.py</code> or add regex patterns in <code>extraction/patterns.py</code></li>
<li><strong>Phase mapping wrong</strong> → Check your project schedule data and the activity-to-phase mappings in <code>data/phase_definitions.yaml</code></li>
<li><strong>Similarity results off</strong> → Check the embedding input construction in <code>similarity/embeddings.py</code> (are entities being included?)</li>
<li><strong>Ranking order wrong</strong> → Adjust weights in <code>similarity/ranker.py</code> (WEIGHTS dict)</li>
<li><strong>Good matches but ranked too low</strong> → Lower the score thresholds or adjust signal weights</li>
</ol>
</div>
</body></html>"""
        return html


async def run_tests():
    report = TestReport()

    # Import your service modules
    try:
        from config import settings, openai_client
        from ingestion.normalizer import normalize, normalize_text
        from extraction.ai_extractor import extract_entities_with_ai
        from extraction.regex_patterns import extract_all_regex_entities
        from similarity.embeddings import generate_embedding, generate_embedding_async, build_embedding_input
        from similarity.search import search_similar, search_and_rank, get_candidates_with_embeddings
        from similarity.ranking import rank_candidates, calculate_phase_score, PHASE_ORDER
    except ImportError as e:
        print(f"Import error: {e}")
        print("Adjust the imports in this script to match your actual module structure.")
        sys.exit(1)

    # Connect to database
    import asyncpg
    import db
    await db.init_db()  # Initialize our db module for search functions
    pool = await asyncpg.create_pool(settings.database_url)

    # ----------------------------------------------------------
    # TEST 1: Database Health
    # ----------------------------------------------------------
    print("Testing database health...")
    stats = {}
    async with pool.acquire() as conn:
        stats["total_items"] = await conn.fetchval("SELECT COUNT(*) FROM intelligence.items")
        stats["items_with_embeddings"] = await conn.fetchval(
            "SELECT COUNT(*) FROM intelligence.items WHERE embedding IS NOT NULL"
        )
        stats["total_entities"] = await conn.fetchval("SELECT COUNT(*) FROM intelligence.entities")
        stats["projects"] = await conn.fetchval(
            "SELECT COUNT(DISTINCT source_project_id) FROM intelligence.items"
        )
        stats["phases_covered"] = await conn.fetch(
            "SELECT project_phase, COUNT(*) as cnt FROM intelligence.items WHERE project_phase IS NOT NULL GROUP BY project_phase ORDER BY cnt DESC"
        )
        stats["source_types"] = await conn.fetch(
            "SELECT source_type, COUNT(*) as cnt FROM intelligence.items GROUP BY source_type ORDER BY cnt DESC"
        )
        stats["entity_types"] = await conn.fetch(
            "SELECT entity_type, COUNT(*) as cnt FROM intelligence.entities GROUP BY entity_type ORDER BY cnt DESC"
        )
        stats["schedules"] = await conn.fetchval("SELECT COUNT(*) FROM intelligence.project_schedules")

    content = f"""
<div style="display:flex;flex-wrap:wrap;gap:8px;">
    <div class="stat"><div class="stat-number">{stats['total_items']}</div><div class="stat-label">Total Items</div></div>
    <div class="stat"><div class="stat-number">{stats['items_with_embeddings']}</div><div class="stat-label">With Embeddings</div></div>
    <div class="stat"><div class="stat-number">{stats['total_entities']}</div><div class="stat-label">Entities Extracted</div></div>
    <div class="stat"><div class="stat-number">{stats['projects']}</div><div class="stat-label">Projects</div></div>
    <div class="stat"><div class="stat-number">{stats['schedules']}</div><div class="stat-label">Schedule Phases</div></div>
</div>
<h3>Items by Phase</h3>
<table><tr><th>Phase</th><th>Count</th></tr>
{"".join(f"<tr><td>{r['project_phase']}</td><td>{r['cnt']}</td></tr>" for r in stats['phases_covered'])}
</table>
<h3>Items by Source Type</h3>
<table><tr><th>Type</th><th>Count</th></tr>
{"".join(f"<tr><td>{r['source_type']}</td><td>{r['cnt']}</td></tr>" for r in stats['source_types'])}
</table>
<h3>Entities by Type</h3>
<table><tr><th>Entity Type</th><th>Count</th></tr>
{"".join(f"<tr><td>{r['entity_type']}</td><td>{r['cnt']}</td></tr>" for r in stats['entity_types'])}
</table>
"""
    missing_embeddings = stats['total_items'] - stats['items_with_embeddings']
    if missing_embeddings > 0:
        content += f'<div class="notes">⚠️ {missing_embeddings} items are missing embeddings. Run the embedding pipeline on those before continuing.</div>'
    if stats['schedules'] == 0:
        content += '<div class="notes">⚠️ No project schedules loaded. Phase mapping won\'t work without these.</div>'

    report.add_section("1. Database Health Check", content, "info")

    # ----------------------------------------------------------
    # TEST 2: Normalizer Quality
    # ----------------------------------------------------------
    print("Testing normalizer...")
    normalizer_tests = [
        ("The GC told us the GWB install on Level 3 is behind schedule", "should expand GC and GWB"),
        ("Sparkies haven't finished the rough-in on the MEP floor", "should normalize sparkies → electrical, expand MEP"),
        ("Hilti anchors failed the pull test at grid C-7", "should tag Hilti as brand, keep grid reference"),
        ("The painters left Tyvek exposed on the north elevation", "should tag Tyvek as weather resistant barrier"),
        ("CO #12 for the curtainwall mullion redesign was $45K", "should expand CO, keep dollar amount"),
    ]

    content = "<p>Testing normalization of construction terminology. Check that abbreviations expand correctly and trade slang is standardized.</p>"
    for raw_text, expectation in normalizer_tests:
        try:
            result = normalize(raw_text)
            normalized = result["normalized_text"]
            replacements = result.get("replacements", [])
            content += f"""
<div style="margin:12px 0;padding:12px;background:#f9fafb;border-radius:4px;">
    <strong>Input:</strong> {raw_text}<br>
    <strong>Normalized:</strong> {normalized}<br>
    <strong>Replacements:</strong> {replacements}<br>
    <span style="color:#6b7280;font-size:13px;">Expected: {expectation}</span>
</div>"""
        except Exception as e:
            content += f'<div class="notes">❌ Error normalizing "{raw_text}": {e}</div>'

    report.add_section("2. Normalizer Quality", content, "review")

    # ----------------------------------------------------------
    # TEST 3: Entity Extraction (Sample from DB)
    # ----------------------------------------------------------
    print("Testing entity extraction on stored items...")
    async with pool.acquire() as conn:
        # Get 10 items with their entities
        sample_items = await conn.fetch("""
            SELECT i.id, i.raw_text, i.question_text, i.normalized_text, i.source_type, i.project_phase, i.trade_category
            FROM intelligence.items i
            WHERE i.company_id = $1
            ORDER BY RANDOM()
            LIMIT 10
        """, COMPANY_ID)

    content = "<p>10 random items from your database with their extracted entities. Check that entities look correct for each item.</p>"

    for item in sample_items:
        async with pool.acquire() as conn:
            entities = await conn.fetch(
                "SELECT entity_type, entity_value, normalized_value, confidence FROM intelligence.entities WHERE item_id = $1 ORDER BY entity_type",
                item['id']
            )

        entity_tags = ""
        for e in entities:
            tag_class = "tag-trade" if e['entity_type'] == 'trade' else "tag-entity"
            entity_tags += f'<span class="tag {tag_class}">{e["entity_type"]}: {e["entity_value"]}</span> '

        content += f"""
<div style="margin:12px 0;padding:16px;background:#f9fafb;border-radius:6px;border-left:3px solid #2d6a4f;">
    <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">{item['source_type']} | Phase: {item['project_phase'] or 'unknown'} | Trade: {item['trade_category'] or 'unknown'}</div>
    <div style="margin-bottom:8px;">{(item.get('question_text') or item['raw_text'])[:300]}{'...' if len(item.get('question_text') or item['raw_text'] or '') > 300 else ''}</div>
    <div><strong>Entities ({len(entities)}):</strong> {entity_tags if entity_tags else '<em>None extracted</em>'}</div>
</div>"""

    report.add_section("3. Entity Extraction — Random Sample", content, "review")

    # ----------------------------------------------------------
    # TEST 4: Entity Extraction (Live — on test observations)
    # ----------------------------------------------------------
    print("Running live entity extraction on test observations...")
    content = "<p>Running entity extraction on your test observations in real time. Check that the right trades, materials, and people are detected.</p>"

    for obs in TEST_OBSERVATIONS:
        try:
            # Run through normalizer first
            norm_result = normalize(obs["text"])
            normalized = norm_result["normalized_text"]

            # Run regex patterns
            pattern_entities = extract_all_regex_entities(normalized)

            # Run LLM extraction
            llm_entities = await extract_entities_with_ai(normalized)

            expected_trades_html = " ".join(f'<span class="tag tag-trade">{t}</span>' for t in obs.get("expected_trades", []))
            expected_entities_html = " ".join(f'<span class="tag tag-entity">{e}</span>' for e in obs.get("expected_entities", []))

            # Format extracted entities from LLM (returns dict with trades, materials, brands, etc.)
            extracted_html = ""
            if llm_entities and isinstance(llm_entities, dict):
                for entity_type in ["trades", "materials", "brands", "people", "companies"]:
                    values = llm_entities.get(entity_type, [])
                    if values:
                        for v in values:
                            extracted_html += f'<span class="tag tag-entity">{entity_type}: {v}</span> '
                if llm_entities.get("issue_type"):
                    extracted_html += f'<span class="tag tag-trade">issue: {llm_entities["issue_type"]}</span> '
                if llm_entities.get("primary_trade"):
                    extracted_html += f'<span class="tag tag-trade">primary: {llm_entities["primary_trade"]}</span> '

            pattern_html = ""
            if pattern_entities:
                for entity_type, matches in pattern_entities.items():
                    for match in matches:
                        value = match.get("value", match.get("raw", "?"))
                        pattern_html += f'<span class="tag tag-phase">{entity_type}: {value}</span> '

            content += f"""
<div style="margin:16px 0;padding:16px;background:#f9fafb;border-radius:6px;">
    <div style="font-size:14px;margin-bottom:8px;">🎤 <strong>"{obs['text']}"</strong></div>
    <div style="font-size:12px;color:#6b7280;">Phase: <span class="tag tag-phase">{obs['phase']}</span></div>
    <table style="margin-top:8px;">
        <tr><th style="width:150px;">Layer</th><th>Results</th></tr>
        <tr><td>Normalized text</td><td style="font-size:13px;">{normalized}</td></tr>
        <tr><td>Regex patterns</td><td>{pattern_html or '<em>None</em>'}</td></tr>
        <tr><td>LLM extraction</td><td>{extracted_html or '<em>None</em>'}</td></tr>
        <tr><td>Expected trades</td><td>{expected_trades_html}</td></tr>
        <tr><td>Expected entities</td><td>{expected_entities_html}</td></tr>
    </table>
    <div class="notes">{obs.get('notes', '')}</div>
</div>"""
        except Exception as e:
            content += f'<div class="notes">❌ Error processing "{obs["text"][:50]}...": {e}</div>'

    report.add_section("4. Entity Extraction — Live Test Observations", content, "review")

    # ----------------------------------------------------------
    # TEST 5: Raw Similarity (semantic only, no re-ranking)
    # ----------------------------------------------------------
    print("Testing raw semantic similarity...")
    content = "<p>For each test observation, these are the top 5 results from embedding cosine similarity ONLY (no re-ranking). This shows whether the embeddings are capturing the right semantic meaning.</p>"

    for obs in TEST_OBSERVATIONS:
        try:
            norm_result = normalize(obs["text"])
            normalized = norm_result["normalized_text"]
            # Build embedding input
            embedding_input = build_embedding_input(normalized, project_phase=obs.get("phase"))
            embedding = await generate_embedding_async(embedding_input)

            # Use our search_similar function (semantic only)
            results = await search_similar(
                query_embedding=embedding,
                company_id=COMPANY_ID,
                top_k=5,
                min_score=0.2
            )

            content += f"""
<div style="margin:16px 0;padding:16px;background:#f9fafb;border-radius:6px;">
    <div style="margin-bottom:12px;">🎤 <strong>"{obs['text']}"</strong> <span class="tag tag-phase">{obs['phase']}</span></div>
    <table>
        <tr><th>#</th><th>Similarity</th><th>Type</th><th>Phase</th><th>Trade</th><th>Text (preview)</th></tr>
"""
            for i, r in enumerate(results):
                sim = r.get('semantic_score', 0)
                score_class = "score-high" if sim > 0.7 else "score-medium" if sim > 0.5 else "score-low"
                text_preview = (r.get('question_text') or r.get('raw_text') or '')[:120] + ('...' if len(r.get('question_text') or r.get('raw_text') or '') > 120 else '')
                content += f"""
        <tr>
            <td>{i+1}</td>
            <td><span class="{score_class}">{sim:.3f}</span></td>
            <td>{r.get('source_type', '—')}</td>
            <td>{r.get('project_phase') or '—'}</td>
            <td>{r.get('trade_category') or '—'}</td>
            <td style="font-size:13px;">{text_preview}</td>
        </tr>"""

            content += "</table>"
            content += f'<div class="notes">{obs.get("notes", "")}</div></div>'

        except Exception as e:
            content += f'<div class="notes">❌ Error: {e}</div>'

    report.add_section("5. Raw Similarity — Semantic Only", content, "review")

    # ----------------------------------------------------------
    # TEST 6: Full Ranked Results (all signals)
    # ----------------------------------------------------------
    print("Testing full ranking with all signals...")
    content = "<p>Full multi-signal ranking: semantic similarity + entity overlap + phase proximity + severity/outcome. This is what users would actually see.</p>"

    for obs in TEST_OBSERVATIONS:
        try:
            norm_result = normalize(obs["text"])
            normalized = norm_result["normalized_text"]

            # Extract entities from observation
            regex_entities = extract_all_regex_entities(normalized)
            # Convert to format expected by ranking (dict of type -> set of values)
            query_entities = {}
            for etype, matches in regex_entities.items():
                if matches:
                    query_entities[etype] = {m.get("value", "").lower() for m in matches}

            # Build embedding
            embedding_input = build_embedding_input(normalized, project_phase=obs.get("phase"))
            embedding = await generate_embedding_async(embedding_input)

            # Use our search_and_rank function with keyword matching
            ranked = await search_and_rank(
                query_embedding=embedding,
                company_id=COMPANY_ID,
                query_text=normalized,  # Pass text for keyword extraction
                top_k=5,
                min_semantic_score=0.2,
                min_final_score=0.2,
                query_phase=obs.get("phase"),
                query_entities=query_entities
            )

            content += f"""
<div style="margin:16px 0;padding:16px;background:white;border-radius:6px;border:1px solid #e5e7eb;">
    <div style="margin-bottom:12px;">🎤 <strong>"{obs['text']}"</strong> <span class="tag tag-phase">{obs['phase']}</span></div>
"""
            for i, r in enumerate(ranked[:5]):
                final = r.get('final_score', 0)
                keyword_score = r.get('keyword_score', 0)
                matched_keywords = r.get('matched_keywords', [])
                semantic = r.get('semantic_score', 0)
                phase_score = r.get('phase_score', 0)
                entity_score = r.get('entity_score', 0)
                outcome_score = r.get('outcome_score', 0)
                score_class = "score-high" if final > 0.7 else "score-medium" if final > 0.5 else "score-low"
                tier = "🔴 HIGH" if final > 0.80 else "🟡 MEDIUM" if final > 0.60 else "🔵 LOW" if final > 0.40 else "⚪ BELOW THRESHOLD"
                kw_display = ", ".join(matched_keywords[:3]) if matched_keywords else "none"

                content += f"""
    <div class="alert-card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="score {score_class}">{final:.3f}</span>
            <span style="font-size:12px;">{tier}</span>
        </div>
        <div style="font-size:12px;color:#166534;margin:4px 0;font-weight:bold;">
            KEYWORDS: {keyword_score:.2f} | Matched: {kw_display}
        </div>
        <div style="font-size:12px;color:#6b7280;margin:4px 0;">
            Semantic: {semantic:.3f} | Phase: {phase_score:.2f} | Entity: {entity_score:.2f} | Outcome: {outcome_score:.2f}
        </div>
        <div style="font-size:12px;color:#6b7280;margin:2px 0;">
            Project Phase: {r.get('project_phase', '—')} | Trade: {r.get('trade_category', '—')} | Type: {r.get('source_type', '—')}
        </div>
        <div style="margin:8px 0;font-size:14px;">{(r.get('question_text') or r.get('normalized_text') or r.get('raw_text') or '')[:200]}{'...' if len(r.get('question_text') or r.get('normalized_text') or r.get('raw_text') or '') > 200 else ''}</div>
        {f"<div style='font-size:12px;color:#dc2626;margin-top:4px;'>Cost impact: ${r['cost_impact']:,.0f}</div>" if r.get('cost_impact') else ""}
        {f"<div style='font-size:12px;color:#dc2626;'>Resulted in CO</div>" if r.get('resulted_in_co') else ""}
    </div>"""

            content += f'<div class="notes">{obs.get("notes", "")}</div></div>'

        except Exception as e:
            content += f'<div class="notes">❌ Error: {e}</div>'
            import traceback
            content += f'<pre>{traceback.format_exc()}</pre>'

    report.add_section("6. Full Ranked Results — All Signals", content, "review")

    # ----------------------------------------------------------
    # TEST 7: Phase Scoring Sanity Check
    # ----------------------------------------------------------
    print("Testing phase scoring logic...")
    content = "<p>Phase proximity scores for every combination. Verify the diagonal is 1.0, adjacent phases are ~0.7-0.8, and distant phases are low.</p>"
    content += "<table><tr><th>Current ↓ / Historical →</th>"
    for p in PHASE_ORDER:
        content += f"<th style='font-size:11px;'>{p[:8]}</th>"
    content += "</tr>"

    for current in PHASE_ORDER:
        content += f"<tr><td style='font-size:12px;font-weight:bold;'>{current}</td>"
        for historical in PHASE_ORDER:
            score = calculate_phase_score(current, historical)
            bg = f"rgba(45,106,79,{score})"
            content += f'<td style="text-align:center;background:{bg};color:{"white" if score > 0.5 else "black"};font-size:12px;">{score:.1f}</td>'
        content += "</tr>"
    content += "</table>"
    content += '<div class="notes">Key question: does the "next phase" bonus (0.8) make sense? Items from the phase you\'re about to enter should rank higher than items from phases you\'ve already completed.</div>'

    report.add_section("7. Phase Scoring Matrix", content, "review")

    # ----------------------------------------------------------
    # TEST 8: Entity Coverage Analysis
    # ----------------------------------------------------------
    print("Analyzing entity coverage...")
    async with pool.acquire() as conn:
        items_with_entities = await conn.fetchval("""
            SELECT COUNT(DISTINCT item_id) FROM intelligence.entities
            WHERE item_id IN (SELECT id FROM intelligence.items WHERE company_id = $1)
        """, COMPANY_ID)

        items_without_entities = stats['total_items'] - items_with_entities

        top_entities = await conn.fetch("""
            SELECT entity_type, normalized_value, COUNT(*) as cnt
            FROM intelligence.entities
            WHERE item_id IN (SELECT id FROM intelligence.items WHERE company_id = $1)
            GROUP BY entity_type, normalized_value
            ORDER BY cnt DESC
            LIMIT 30
        """, COMPANY_ID)

        # Items with zero entities
        orphan_items = await conn.fetch("""
            SELECT i.id, i.raw_text, i.question_text, i.source_type
            FROM intelligence.items i
            LEFT JOIN intelligence.entities e ON i.id = e.item_id
            WHERE i.company_id = $1 AND e.id IS NULL
            LIMIT 5
        """, COMPANY_ID)

    content = f"""
<div style="display:flex;gap:8px;margin-bottom:16px;">
    <div class="stat"><div class="stat-number">{items_with_entities}</div><div class="stat-label">Items WITH entities</div></div>
    <div class="stat"><div class="stat-number">{items_without_entities}</div><div class="stat-label">Items WITHOUT entities</div></div>
    <div class="stat"><div class="stat-number">{items_with_entities / max(stats['total_items'], 1) * 100:.0f}%</div><div class="stat-label">Coverage</div></div>
</div>
<h3>Top 30 Most Common Entities</h3>
<table><tr><th>Type</th><th>Value</th><th>Occurrences</th></tr>
{"".join(f"<tr><td>{e['entity_type']}</td><td>{e['normalized_value']}</td><td>{e['cnt']}</td></tr>" for e in top_entities)}
</table>
"""
    if orphan_items:
        content += "<h3>Items With Zero Entities (first 5)</h3><p>These items had nothing extracted. Check if the text is too short or if extraction missed them.</p>"
        for item in orphan_items:
            content += f'<div style="padding:8px;background:#fef2f2;margin:4px 0;border-radius:4px;font-size:13px;">[{item["source_type"]}] {(item.get("question_text") or item.get("raw_text") or "")[:200]}</div>'

    report.add_section("8. Entity Coverage Analysis", content, "review")

    # ----------------------------------------------------------
    # WRITE REPORT
    # ----------------------------------------------------------
    await pool.close()

    os.makedirs("tests", exist_ok=True)
    report_path = "tests/test_report.html"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report.render_html())

    print(f"\n[OK] Test report written to {report_path}")
    print(f"     Open it in your browser to review results.")
    print(f"     Total runtime: {time.time() - report.start_time:.1f}s")


if __name__ == "__main__":
    asyncio.run(run_tests())