#!/usr/bin/env python3
"""
End-to-End Test for /analyze Endpoint

Tests whether the system can find relevant historical matches from raw
observation text alone - no trade filters, no keywords, no hints.

Simulates a real user speaking into the app.
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime
from typing import Optional
from dataclasses import dataclass, field

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import db
from evaluation.approaches import BM25
from alerts.privacy_guard import get_or_generate_abstraction, generate_match_reason
from extraction.abstraction import extract_clean_question


@dataclass
class AlertResult:
    """A single alert from analysis."""
    learning: str
    confidence: float
    tier: str
    match_reason: str
    source_trade: Optional[str]
    source_project: str
    source_ref: str
    is_cross_project: bool


@dataclass
class ScenarioResult:
    """Result of testing a single scenario."""
    scenario_id: str
    observation: str
    phase: str
    expected_trade: str  # From scenario definition (for comparison only)
    detected_trade: Optional[str]  # What the system detected
    trade_correct: bool
    alerts: list[AlertResult] = field(default_factory=list)
    processing_time_ms: float = 0
    error: Optional[str] = None


# BM25 index - loaded once
_bm25_index: Optional[BM25] = None
_corpus: Optional[list] = None
_corpus_by_id: Optional[dict] = None


async def load_corpus():
    """Load RFI corpus from database."""
    global _corpus, _corpus_by_id

    rows = await db.fetch("""
        SELECT
            id::text,
            source_ref,
            source_project_id,
            source_project_name,
            question_text,
            raw_text,
            trade_category,
            project_phase,
            resolution_text,
            cost_impact,
            schedule_impact_days,
            resulted_in_co,
            source_type,
            abstracted_summary
        FROM intelligence.items
        WHERE (question_text IS NOT NULL OR raw_text IS NOT NULL)
          AND LENGTH(COALESCE(question_text, raw_text)) > 30
        ORDER BY created_at DESC
        LIMIT 5000
    """)

    _corpus = []
    _corpus_by_id = {}

    for row in rows:
        doc = dict(row)
        doc["text"] = doc.get("question_text") or doc.get("raw_text") or ""
        _corpus.append(doc)
        _corpus_by_id[doc["id"]] = doc

    print(f"  Loaded {len(_corpus)} items for BM25 index")
    return _corpus


async def get_bm25_index() -> BM25:
    """Get or create the BM25 index."""
    global _bm25_index, _corpus

    if _bm25_index is None or _corpus is None:
        await load_corpus()
        _bm25_index = BM25()
        _bm25_index.fit(_corpus, text_field="text")
        print("  BM25 index built")

    return _bm25_index


def detect_trade_from_text(text: str) -> Optional[str]:
    """
    Detect trade category from observation text using weighted scoring.
    Prioritizes subject indicators (who is asking) over incidental mentions.
    """
    text_lower = text.lower()

    # Trade keywords with weights: (keyword, weight)
    # Higher weight = stronger indicator of that trade
    trade_keywords = {
        "electrical": [
            ("electrician", 10), ("electrical contractor", 10), ("electrical sub", 10),
            ("electrical", 5), ("panel location", 5), ("conduit", 4),
            ("wire", 3), ("circuit", 4), ("outlet", 3), ("transformer", 5),
        ],
        "mechanical": [
            ("mechanical contractor", 10), ("hvac contractor", 10), ("mechanical sub", 10),
            ("mechanical", 5), ("hvac", 6), ("duct", 4), ("air handler", 5),
            ("ahu", 4), ("vav", 5), ("diffuser", 4), ("nc rating", 6), ("acoustics", 5),
        ],
        "plumbing": [
            ("plumber", 10), ("plumbing contractor", 10), ("plumbing sub", 10),
            ("plumb", 5), ("pipe", 3), ("sewer", 5), ("riser", 4),
            ("fixture", 3), ("sanitary", 5), ("domestic water", 5),
        ],
        "concrete": [
            ("concrete contractor", 10), ("concrete sub", 10),
            ("concrete", 5), ("slab", 4), ("footing", 5), ("pour", 4),
            ("rebar", 5), ("formwork", 5), ("embed", 6),
        ],
        "structural": [
            ("steel erector", 10), ("structural engineer", 8), ("steel contractor", 10),
            ("structural", 5), ("steel", 4), ("beam", 3), ("column", 4),
            ("connection", 3), ("weld", 5), ("moment frame", 6),
        ],
        "glazing": [
            ("glazing contractor", 10), ("curtainwall installer", 10), ("glazier", 10),
            ("curtainwall", 8), ("mullion", 7), ("glass", 4), ("glazing", 6),
            ("window", 3), ("storefront", 5), ("unitized", 6),
        ],
        "drywall": [
            ("drywall sub", 10), ("drywall contractor", 10), ("framer", 8),
            ("drywall", 6), ("gypsum", 5), ("stud", 4), ("framing", 4),
            ("soffit", 5), ("ceiling", 3), ("gyp board", 5),
        ],
        "waterproofing": [
            ("waterproofing consultant", 12), ("waterproofing contractor", 10),
            ("waterproof", 8), ("membrane", 5), ("below grade", 6),
            ("dampproofing", 7), ("bentonite", 8), ("fluid applied", 6),
        ],
        "civil": [
            ("site contractor", 10), ("civil engineer", 8), ("excavation contractor", 10),
            ("storm drain", 8), ("storm", 5), ("site", 3), ("excavat", 5),
            ("utility", 4), ("grading", 5), ("underground", 5),
        ],
        "elevator": [
            ("elevator installer", 12), ("elevator contractor", 10), ("elevator sub", 10),
            ("elevator", 8), ("hoist", 6), ("cab", 4), ("pit", 4),
            ("hoistway", 7), ("elevator shaft", 8), ("machine room", 5),
        ],
        "doors": [
            ("door installer", 10), ("door sub", 10), ("hardware installer", 10),
            ("door", 5), ("hardware", 4), ("frame", 3), ("closer", 5),
            ("threshold", 4), ("hollow metal", 6), ("dfh", 7),
        ],
        "tile": [
            ("tile installer", 10), ("tile contractor", 10), ("tile sub", 10),
            ("tile", 6), ("grout", 5), ("schluter", 7), ("ceramic", 5),
            ("porcelain", 5), ("thinset", 6),
        ],
        "fire_protection": [
            ("fire protection contractor", 10), ("sprinkler contractor", 10),
            ("fire", 4), ("sprinkler", 6), ("smoke damper", 7),
            ("fire alarm", 6), ("suppression", 5),
        ],
        "roofing": [
            ("roofing contractor", 10), ("roofer", 10),
            ("roof", 5), ("roofing membrane", 7), ("flashing", 5),
            ("parapet", 4), ("tpo", 6), ("epdm", 6),
        ],
    }

    # Score each trade
    scores = {}
    for trade, keywords in trade_keywords.items():
        score = 0
        for kw, weight in keywords:
            if kw in text_lower:
                score += weight
        if score > 0:
            scores[trade] = score

    if not scores:
        return None

    # Return highest scoring trade
    sorted_trades = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return sorted_trades[0][0]


def determine_alert_tier(score: float, has_cost_impact: bool, has_co: bool) -> str:
    """Determine alert tier based on score and impact."""
    if score >= 0.8 or has_co:
        return "high"
    elif score >= 0.6 or has_cost_impact:
        return "medium"
    else:
        return "low"


async def analyze_observation(
    observation_text: str,
    phase: Optional[str] = None,
    project_id: str = "TEST_PROJECT",
    company_id: str = "TEST_COMPANY"
) -> tuple[list[AlertResult], Optional[str], float]:
    """
    Run analysis on an observation - NO trade filter, NO keyword hints.
    Returns (alerts, detected_trade, processing_time_ms)
    """
    start_time = time.time()

    # Detect trade from text (what system would do)
    detected_trade = detect_trade_from_text(observation_text)

    # Get BM25 index
    bm25 = await get_bm25_index()

    # Run BM25 search on raw observation
    bm25_results = bm25.rank(observation_text, top_k=50)

    # Normalize scores
    if bm25_results:
        max_score = max(score for _, score in bm25_results)
        if max_score > 0:
            bm25_results = [(doc_id, score / max_score) for doc_id, score in bm25_results]

    # Filter and score results
    scored_results = []

    for doc_id, score in bm25_results:
        doc = _corpus_by_id.get(doc_id)
        if not doc:
            continue

        # Filter out same project
        doc_project = doc.get("source_project_id") or ""
        if doc_project == project_id:
            continue

        # Trade boost (detected, not hardcoded)
        final_score = score
        doc_trade = (doc.get("trade_category") or "").lower()
        if detected_trade and detected_trade.lower() in doc_trade:
            final_score += 0.3

        # Phase boost
        doc_phase = doc.get("project_phase") or ""
        if phase and doc_phase == phase:
            final_score += 0.15

        scored_results.append((doc, final_score))

    # Sort by final score
    scored_results.sort(key=lambda x: x[1], reverse=True)

    # Generate alerts for top results
    alerts = []
    for doc, score in scored_results[:5]:
        if score < 0.3:  # Minimum threshold
            continue

        # Get or generate abstracted learning
        learning = doc.get("abstracted_summary")
        if not learning:
            learning = await get_or_generate_abstraction(
                item_id=doc["id"],
                source_text=doc.get("text", ""),
                resolution_text=doc.get("resolution_text"),
                cost_impact=doc.get("cost_impact"),
                schedule_impact_days=doc.get("schedule_impact_days"),
                resulted_in_co=doc.get("resulted_in_co", False)
            )

        if not learning:
            continue

        # Generate match reason
        match_reason = generate_match_reason(
            query_text=observation_text,
            matched_text=doc.get("text", ""),
            matched_trade=doc.get("trade_category"),
            matched_phase=doc.get("project_phase"),
            score=score
        )

        # Determine tier
        tier = determine_alert_tier(
            score=score,
            has_cost_impact=bool(doc.get("cost_impact")),
            has_co=doc.get("resulted_in_co", False)
        )

        # Check if cross-project
        doc_project = doc.get("source_project_name") or doc.get("source_project_id") or ""
        is_cross_project = doc_project != project_id

        alerts.append(AlertResult(
            learning=learning,
            confidence=round(min(score, 1.0), 2),
            tier=tier,
            match_reason=match_reason,
            source_trade=doc.get("trade_category"),
            source_project=doc_project[:30],
            source_ref=doc.get("source_ref", ""),
            is_cross_project=is_cross_project
        ))

    elapsed_ms = (time.time() - start_time) * 1000
    return alerts, detected_trade, elapsed_ms


def check_trade_match(expected: str, detected: Optional[str]) -> bool:
    """Check if detected trade matches expected (fuzzy with related trades)."""
    if not detected or not expected:
        return False

    expected_lower = expected.lower()
    detected_lower = detected.lower()

    # Direct match
    if detected_lower in expected_lower or expected_lower in detected_lower:
        return True

    # Related/equivalent trade mappings (expected -> acceptable detected values)
    # This accounts for multi-trade scenarios and corpus trade categories
    related = {
        "glazing": ["glazing", "curtainwall", "architectural"],
        "curtainwall": ["glazing", "architectural"],
        "structural": ["structural", "steel", "concrete"],
        "steel": ["structural", "steel"],
        "mep": ["mechanical", "electrical", "plumbing"],
        "elevator": ["elevator", "structural", "concrete"],  # elevator RFIs often tagged structural
        "elevator, concrete": ["elevator", "concrete", "structural"],
        "civil": ["civil", "storm", "site"],
        "door frame hardware": ["doors", "architectural"],
        "doors": ["doors", "architectural"],
        "concrete": ["concrete", "structural"],
        "concrete, structural": ["concrete", "structural"],
        "waterproofing": ["waterproofing", "architectural", "concrete"],  # waterproofing often under arch
        "drywall": ["drywall", "architectural"],
        "tile": ["tile", "flooring", "architectural"],
        "plumbing": ["plumbing", "mechanical"],
        "mechanical": ["mechanical", "fire_protection"],
    }

    # Check if detected is an acceptable match for expected
    for key, acceptable in related.items():
        if key in expected_lower:
            if detected_lower in acceptable:
                return True

    # Reverse check - expected might be a broader category
    if detected_lower in expected_lower.split(", "):
        return True

    return False


def generate_html_report(results: list[ScenarioResult], output_path: str):
    """Generate HTML report from test results."""

    # Calculate summary stats
    total = len(results)
    with_alerts = len([r for r in results if r.alerts])
    zero_alerts = len([r for r in results if not r.alerts])
    trade_correct = len([r for r in results if r.trade_correct])

    all_confidences = [a.confidence for r in results for a in r.alerts]
    avg_confidence = sum(all_confidences) / len(all_confidences) if all_confidences else 0

    cross_project_alerts = sum(1 for r in results for a in r.alerts if a.is_cross_project)
    total_alerts = sum(len(r.alerts) for r in results)
    cross_project_rate = (cross_project_alerts / total_alerts * 100) if total_alerts else 0

    # Scenarios with no results
    no_result_scenarios = [r for r in results if not r.alerts]

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>E2E Analysis Test Report</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            padding: 20px;
            line-height: 1.5;
        }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        h1 {{
            color: #1a1a2e;
            margin-bottom: 10px;
            font-size: 24px;
        }}
        .timestamp {{
            color: #666;
            font-size: 14px;
            margin-bottom: 30px;
        }}
        .summary-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }}
        .stat-card {{
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }}
        .stat-value {{
            font-size: 32px;
            font-weight: bold;
            color: #1a1a2e;
        }}
        .stat-label {{
            color: #666;
            font-size: 14px;
            margin-top: 5px;
        }}
        .stat-card.success .stat-value {{ color: #22c55e; }}
        .stat-card.warning .stat-value {{ color: #f59e0b; }}
        .stat-card.danger .stat-value {{ color: #ef4444; }}

        .scenario-card {{
            background: white;
            border-radius: 12px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
        }}
        .scenario-header {{
            padding: 20px;
            border-bottom: 1px solid #eee;
        }}
        .scenario-id {{
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }}
        .observation-text {{
            font-size: 16px;
            color: #1a1a2e;
            font-weight: 500;
            margin-bottom: 12px;
        }}
        .meta-row {{
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
            font-size: 14px;
        }}
        .meta-item {{
            display: flex;
            align-items: center;
            gap: 6px;
        }}
        .meta-label {{ color: #666; }}
        .meta-value {{ color: #1a1a2e; font-weight: 500; }}

        .badge {{
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }}
        .badge-success {{ background: #dcfce7; color: #166534; }}
        .badge-warning {{ background: #fef3c7; color: #92400e; }}
        .badge-danger {{ background: #fee2e2; color: #991b1b; }}
        .badge-info {{ background: #dbeafe; color: #1e40af; }}
        .badge-neutral {{ background: #f3f4f6; color: #374151; }}

        .alerts-section {{
            padding: 20px;
        }}
        .alerts-header {{
            font-size: 14px;
            font-weight: 600;
            color: #1a1a2e;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        .no-alerts {{
            color: #666;
            font-style: italic;
            padding: 20px;
            text-align: center;
            background: #fafafa;
            border-radius: 8px;
        }}

        .alert-item {{
            background: #fafafa;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 12px;
            border-left: 4px solid #e5e7eb;
        }}
        .alert-item.high {{ border-left-color: #ef4444; }}
        .alert-item.medium {{ border-left-color: #f59e0b; }}
        .alert-item.low {{ border-left-color: #22c55e; }}

        .alert-learning {{
            color: #1a1a2e;
            margin-bottom: 10px;
        }}
        .alert-meta {{
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            font-size: 13px;
            color: #666;
        }}
        .alert-meta-item {{
            display: flex;
            align-items: center;
            gap: 4px;
        }}

        .gaps-section {{
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin-top: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .gaps-title {{
            font-size: 18px;
            font-weight: 600;
            color: #1a1a2e;
            margin-bottom: 15px;
        }}
        .gap-item {{
            padding: 12px;
            background: #fef3c7;
            border-radius: 8px;
            margin-bottom: 10px;
        }}
        .gap-scenario {{
            font-weight: 500;
            color: #92400e;
        }}
        .gap-observation {{
            font-size: 14px;
            color: #78350f;
            margin-top: 5px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>E2E Analysis Test Report</h1>
        <p class="timestamp">Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>

        <div class="summary-grid">
            <div class="stat-card">
                <div class="stat-value">{total}</div>
                <div class="stat-label">Observations Tested</div>
            </div>
            <div class="stat-card success">
                <div class="stat-value">{with_alerts}</div>
                <div class="stat-label">Returned Alerts</div>
            </div>
            <div class="stat-card {"warning" if zero_alerts > 0 else "success"}">
                <div class="stat-value">{zero_alerts}</div>
                <div class="stat-label">Zero Results</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{avg_confidence:.0%}</div>
                <div class="stat-label">Avg Confidence</div>
            </div>
            <div class="stat-card {"success" if cross_project_rate > 80 else "warning"}">
                <div class="stat-value">{cross_project_rate:.0f}%</div>
                <div class="stat-label">Cross-Project Matches</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{trade_correct}/{total}</div>
                <div class="stat-label">Trade Detection Correct</div>
            </div>
        </div>
"""

    # Scenario cards
    for r in results:
        trade_badge = "badge-success" if r.trade_correct else "badge-warning"
        alerts_count = len(r.alerts)
        alerts_badge = "badge-success" if alerts_count > 0 else "badge-danger"

        html += f"""
        <div class="scenario-card">
            <div class="scenario-header">
                <div class="scenario-id">{r.scenario_id}</div>
                <div class="observation-text">"{r.observation}"</div>
                <div class="meta-row">
                    <div class="meta-item">
                        <span class="meta-label">Phase:</span>
                        <span class="badge badge-info">{r.phase or 'Not specified'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Expected Trade:</span>
                        <span class="badge badge-neutral">{r.expected_trade}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Detected Trade:</span>
                        <span class="badge {trade_badge}">{r.detected_trade or 'None'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Alerts:</span>
                        <span class="badge {alerts_badge}">{alerts_count}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Time:</span>
                        <span class="meta-value">{r.processing_time_ms:.0f}ms</span>
                    </div>
                </div>
            </div>

            <div class="alerts-section">
"""

        if r.alerts:
            html += f'<div class="alerts-header">Alerts Returned ({len(r.alerts)})</div>'
            for alert in r.alerts:
                cross_project_text = "Yes" if alert.is_cross_project else "No"
                html += f"""
                <div class="alert-item {alert.tier}">
                    <div class="alert-learning">{alert.learning}</div>
                    <div class="alert-meta">
                        <div class="alert-meta-item">
                            <strong>Confidence:</strong> {alert.confidence:.0%}
                        </div>
                        <div class="alert-meta-item">
                            <strong>Tier:</strong>
                            <span class="badge {"badge-danger" if alert.tier == "high" else "badge-warning" if alert.tier == "medium" else "badge-success"}">{alert.tier}</span>
                        </div>
                        <div class="alert-meta-item">
                            <strong>Source Trade:</strong> {alert.source_trade or 'Unknown'}
                        </div>
                        <div class="alert-meta-item">
                            <strong>Cross-Project:</strong> {cross_project_text}
                        </div>
                        <div class="alert-meta-item">
                            <strong>Reason:</strong> {alert.match_reason}
                        </div>
                    </div>
                </div>
"""
        else:
            html += '<div class="no-alerts">No relevant past issues found</div>'

        html += """
            </div>
        </div>
"""

    # Gaps section
    if no_result_scenarios:
        html += """
        <div class="gaps-section">
            <div class="gaps-title">Gaps: Observations with Zero Results</div>
            <p style="color: #666; margin-bottom: 15px;">These scenarios returned no alerts. Possible causes: missing historical data, retrieval failure, or threshold too high.</p>
"""
        for r in no_result_scenarios:
            html += f"""
            <div class="gap-item">
                <div class="gap-scenario">{r.scenario_id}</div>
                <div class="gap-observation">"{r.observation[:150]}{'...' if len(r.observation) > 150 else ''}"</div>
            </div>
"""
        html += "</div>"

    html += """
    </div>
</body>
</html>
"""

    # Write file
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"\nReport saved to: {output_path}")


async def main():
    print("=" * 70)
    print("E2E ANALYSIS TEST - NO TRADE HINTS")
    print("Testing if system can work from unstructured voice-style input alone")
    print("=" * 70)

    # Load scenarios
    scenarios_path = Path(__file__).parent.parent / "evaluation" / "scenarios_template.json"
    with open(scenarios_path) as f:
        data = json.load(f)

    scenarios = data["scenarios"]
    print(f"\nLoaded {len(scenarios)} scenarios")

    # Limit to first N for testing
    limit = int(os.getenv("E2E_LIMIT", "7"))
    scenarios = scenarios[:limit]
    print(f"Testing {len(scenarios)} scenarios (set E2E_LIMIT env var to change)")

    # Initialize database
    print("\nInitializing...")
    await db.init_db()

    results = []

    for i, scenario in enumerate(scenarios, 1):
        scenario_id = scenario["scenario_id"]
        observation = scenario["observation"]
        phase = scenario.get("phase")
        expected_trade = scenario.get("trade", "")

        print(f"\n[{i}/{len(scenarios)}] {scenario_id}")
        print(f"  Observation: {observation[:60]}...")

        try:
            alerts, detected_trade, elapsed = await analyze_observation(
                observation_text=observation,
                phase=phase,
                project_id="TEST_PROJECT",
                company_id="TEST_COMPANY"
            )

            trade_correct = check_trade_match(expected_trade, detected_trade)

            print(f"  Detected trade: {detected_trade or 'None'} ({'correct' if trade_correct else 'mismatch'})")
            print(f"  Alerts returned: {len(alerts)}")
            print(f"  Processing time: {elapsed:.0f}ms")

            results.append(ScenarioResult(
                scenario_id=scenario_id,
                observation=observation,
                phase=phase or "",
                expected_trade=expected_trade,
                detected_trade=detected_trade,
                trade_correct=trade_correct,
                alerts=alerts,
                processing_time_ms=elapsed
            ))

        except Exception as e:
            print(f"  ERROR: {e}")
            results.append(ScenarioResult(
                scenario_id=scenario_id,
                observation=observation,
                phase=phase or "",
                expected_trade=expected_trade,
                detected_trade=None,
                trade_correct=False,
                error=str(e)
            ))

    # Generate report
    report_path = Path(__file__).parent / "e2e_report.html"
    generate_html_report(results, str(report_path))

    # Print summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)

    with_alerts = len([r for r in results if r.alerts])
    zero_alerts = len([r for r in results if not r.alerts])

    print(f"\nObservations tested: {len(results)}")
    print(f"Returned alerts: {with_alerts}")
    print(f"Zero results: {zero_alerts}")

    if results:
        all_conf = [a.confidence for r in results for a in r.alerts]
        if all_conf:
            print(f"Avg confidence: {sum(all_conf)/len(all_conf):.0%}")

    if zero_alerts:
        print(f"\nGaps (zero results):")
        for r in results:
            if not r.alerts:
                print(f"  - {r.scenario_id}: {r.observation[:50]}...")

    await db.close_db()


if __name__ == "__main__":
    asyncio.run(main())
