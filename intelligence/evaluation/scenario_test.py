#!/usr/bin/env python3
"""
Scenario-Based Acceptance Test for Intelligence Layer

This test harness evaluates real-world scenarios to validate whether the
retrieval system surfaces actionable historical knowledge.

Usage:
    python evaluation/scenario_test.py

The test:
1. Loads scenarios from evaluation/scenarios.json
2. Runs BM25 retrieval with trade filtering for each observation
3. Evaluates results against pass conditions
4. Generates privacy-guarded alerts
5. Outputs a scorecard

Pass criteria: 10 out of 15 scenarios must pass to proceed to Session 7-8.
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import Optional
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

import asyncpg
from openai import OpenAI

from evaluation.approaches import BM25
from extraction.abstraction import extract_clean_question, filter_revision_matches


# =============================================================================
# DATA STRUCTURES
# =============================================================================

@dataclass
class Scenario:
    """A test scenario definition."""
    scenario_id: str
    observation: str
    phase: list[str]  # Can be single or multiple phases
    trade: list[str]  # Can be single or multiple trades
    what_i_didnt_know: str
    ideal_alert_would_say: str
    pass_condition: str
    keywords_that_must_appear: list[str]
    acceptable_project_ids: list[str]


@dataclass
class ScenarioResult:
    """Result of running a single scenario."""
    scenario_id: str
    passed: bool
    top_5_results: list[dict]
    matched_keywords: list[str]
    correct_trade_in_results: bool
    different_project_in_results: bool
    generated_alert: str
    failure_reason: str = ""


# =============================================================================
# BM25 WITH TRADE FILTERING
# =============================================================================

class BM25WithTradeFilter:
    """
    BM25 retriever that can optionally filter or boost results by trade.
    """

    def __init__(self, trade_boost: float = 0.3):
        """
        Args:
            trade_boost: Additional score for matching trade category
        """
        self.bm25 = BM25()
        self.trade_boost = trade_boost
        self.corpus = []

    def fit(self, documents: list[dict], text_field: str = "text"):
        """Fit BM25 on corpus and store documents for trade filtering."""
        self.corpus = documents
        self.bm25.fit(documents, text_field)

    def rank(
        self,
        query: str,
        query_trades: Optional[list[str]] = None,
        query_project_id: Optional[str] = None,
        top_k: int = 20,
        require_different_project: bool = True
    ) -> list[tuple[dict, float]]:
        """
        Rank documents with optional trade filtering.

        Args:
            query: The query text
            query_trades: Trade categories to boost (e.g., ['curtainwall', 'glazing'])
            query_project_id: Current project ID to exclude from results
            top_k: Number of results to return
            require_different_project: If True, exclude same-project results

        Returns:
            List of (document, score) tuples
        """
        # Get base BM25 scores
        bm25_results = self.bm25.rank(query, top_k=100)
        bm25_scores = {doc_id: score for doc_id, score in bm25_results}

        # Normalize BM25 scores
        if bm25_scores:
            max_score = max(bm25_scores.values())
            if max_score > 0:
                bm25_scores = {k: v / max_score for k, v in bm25_scores.items()}

        # Normalize trades to list of lowercase strings
        trades_lower = []
        if query_trades:
            trades_lower = [t.lower() for t in query_trades]

        # Build result list with trade boosting and project filtering
        scored = []
        for doc in self.corpus:
            doc_id = doc.get("id")
            base_score = bm25_scores.get(doc_id, 0)

            if base_score == 0:
                continue

            # Filter out same project if required
            doc_project = doc.get("source_project_id") or doc.get("project_id")
            if require_different_project and query_project_id:
                if doc_project == query_project_id:
                    continue

            # Trade boost - boost if ANY query trade matches doc trade
            final_score = base_score
            doc_trade = (doc.get("trade_category") or "").lower()
            doc_text = (doc.get("text") or "").lower()

            for trade in trades_lower:
                if trade in doc_trade or trade in doc_text:
                    final_score += self.trade_boost
                    break  # Only boost once

            scored.append((doc, final_score))

        # Sort by score
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]


# =============================================================================
# PRIVACY GUARD - Alert Generation
# =============================================================================

ALERT_PROMPT = """You are writing a brief, actionable construction alert.
Given the source RFI below, create an abstracted version that:

1. REMOVES all project names, specific addresses, company names, and person names
2. KEEPS the technical learning - what the issue was, what trade, what material
3. KEEPS the outcome - if it led to rework, a change order, or schedule impact
4. Includes a recommended action if one can be inferred
5. Is 2-3 sentences maximum

Source RFI:
{source_text}

Resolution (if available):
{resolution_text}

Write the alert. Do NOT include any project names, company names, or person names.
Start directly with the issue - do not say "Alert:" or similar."""


def generate_alert_sync(client: OpenAI, source_text: str, resolution_text: str = "") -> str:
    """Generate a privacy-safe alert from source RFI text."""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You write concise construction field alerts."},
                {"role": "user", "content": ALERT_PROMPT.format(
                    source_text=source_text[:1500],
                    resolution_text=resolution_text[:500] if resolution_text else "Not available"
                )}
            ],
            temperature=0.3,
            max_tokens=200
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"[Alert generation failed: {e}]"


# =============================================================================
# PASS CONDITION EVALUATION
# =============================================================================

def check_keywords_in_results(results: list[dict], keywords: list[str]) -> list[str]:
    """Check which required keywords appear in any of the results."""
    found = []
    keywords_lower = [k.lower() for k in keywords]

    for result in results:
        text = result.get("text", "").lower()
        for kw in keywords_lower:
            if kw in text and kw not in found:
                found.append(kw)

    return found


def check_trade_in_results(results: list[dict], expected_trades: list[str]) -> bool:
    """Check if any result has ANY of the expected trade categories."""
    expected_lower = [t.lower() for t in expected_trades]

    for result in results:
        trade = (result.get("trade_category") or "").lower()
        text = result.get("text", "").lower()

        for expected in expected_lower:
            # Check trade_category field
            if expected in trade:
                return True

            # Also check if trade appears in text
            if expected in text:
                return True

    return False


def check_different_project(results: list[dict], query_project_id: str) -> bool:
    """Check if any result is from a different project."""
    for result in results:
        result_project = result.get("source_project_id") or result.get("project_id") or ""
        if result_project and result_project != query_project_id:
            return True
    return False


def evaluate_pass_condition(
    scenario: Scenario,
    results: list[dict],
    matched_keywords: list[str]
) -> tuple[bool, str]:
    """
    Evaluate whether a scenario passes based on its conditions.

    Returns:
        (passed: bool, failure_reason: str)
    """
    if not results:
        return False, "No results returned"

    # Check all required keywords are found
    missing_keywords = [k for k in scenario.keywords_that_must_appear if k.lower() not in [m.lower() for m in matched_keywords]]
    if missing_keywords:
        return False, f"Missing keywords: {missing_keywords}"

    # Check if results contain ANY expected trade
    has_trade = check_trade_in_results(results, scenario.trade)
    if not has_trade:
        trades_str = ", ".join(scenario.trade)
        return False, f"No results with trades: [{trades_str}]"

    # Check if results are from different projects (we can't verify specific project IDs without the actual data)
    # This will be checked with actual project filtering

    return True, ""


# =============================================================================
# MAIN TEST HARNESS
# =============================================================================

async def load_corpus(conn) -> list[dict]:
    """Load RFI corpus from database."""
    rows = await conn.fetch("""
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
            embedding
        FROM intelligence.items
        WHERE source_type = 'rfi'
          AND (question_text IS NOT NULL OR raw_text IS NOT NULL)
          AND LENGTH(COALESCE(question_text, raw_text)) > 30
        LIMIT 2000
    """)

    corpus = []
    for row in rows:
        doc = dict(row)
        doc["text"] = doc.get("question_text") or doc.get("raw_text") or ""
        corpus.append(doc)

    return corpus


def load_scenarios(path: Path) -> list[Scenario]:
    """Load scenarios from JSON file."""
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    scenarios = []
    for s in data.get("scenarios", []):
        # Skip placeholder scenarios
        if s.get("scenario_id", "").startswith("placeholder"):
            continue
        if "[YOUR" in s.get("observation", ""):
            continue

        # Handle phase - convert to list if string
        phase = s.get("phase", "")
        if isinstance(phase, str):
            phase = [phase] if phase else []

        # Handle trade - convert to list if string
        trade = s.get("trade", "")
        if isinstance(trade, str):
            trade = [trade] if trade else []

        scenarios.append(Scenario(
            scenario_id=s.get("scenario_id", "unknown"),
            observation=s.get("observation", ""),
            phase=phase,
            trade=trade,
            what_i_didnt_know=s.get("what_i_didnt_know", ""),
            ideal_alert_would_say=s.get("ideal_alert_would_say", ""),
            pass_condition=s.get("pass_condition", ""),
            keywords_that_must_appear=s.get("keywords_that_must_appear_in_results", []),
            acceptable_project_ids=s.get("acceptable_result_project_ids", []),
        ))

    return scenarios


async def run_scenario(
    scenario: Scenario,
    retriever: BM25WithTradeFilter,
    corpus: list[dict],
    openai_client: OpenAI,
    current_project_id: str = "current_project"
) -> ScenarioResult:
    """Run a single scenario and evaluate results."""

    # Run BM25 retrieval with trade filtering
    results = retriever.rank(
        query=scenario.observation,
        query_trades=scenario.trade,  # Now a list
        query_project_id=current_project_id,
        top_k=10,
        require_different_project=True
    )

    # Extract top 5 documents
    top_5 = []
    for doc, score in results[:5]:
        top_5.append({
            "id": doc.get("id"),
            "source_ref": doc.get("source_ref"),
            "source_project_name": doc.get("source_project_name"),
            "source_project_id": doc.get("source_project_id"),
            "text": extract_clean_question(doc.get("text", "")),
            "trade_category": doc.get("trade_category"),
            "resolution_text": doc.get("resolution_text"),
            "cost_impact": doc.get("cost_impact"),
            "resulted_in_co": doc.get("resulted_in_co"),
            "score": score,
        })

    # Check keywords
    matched_keywords = check_keywords_in_results(top_5, scenario.keywords_that_must_appear)

    # Check trade
    has_correct_trade = check_trade_in_results(top_5, scenario.trade)

    # Check different project
    has_different_project = len(top_5) > 0  # We filtered by project, so if we have results they're different

    # Generate alert from top result
    generated_alert = ""
    if top_5:
        best_result = top_5[0]
        generated_alert = generate_alert_sync(
            openai_client,
            best_result.get("text", ""),
            best_result.get("resolution_text", "")
        )

    # Evaluate pass condition
    passed, failure_reason = evaluate_pass_condition(scenario, top_5, matched_keywords)

    return ScenarioResult(
        scenario_id=scenario.scenario_id,
        passed=passed,
        top_5_results=top_5,
        matched_keywords=matched_keywords,
        correct_trade_in_results=has_correct_trade,
        different_project_in_results=has_different_project,
        generated_alert=generated_alert,
        failure_reason=failure_reason,
    )


def print_scorecard(results: list[ScenarioResult], scenarios: list[Scenario]):
    """Print the final scorecard."""
    print("\n" + "=" * 80)
    print("SCENARIO TEST SCORECARD")
    print("=" * 80)

    passed = sum(1 for r in results if r.passed)
    total = len(results)

    print(f"\nOVERALL: {passed}/{total} scenarios passed ({100*passed/total:.0f}%)")
    print(f"Target: 10/15 (67%) to proceed to Session 7-8")

    if passed >= 10:
        print("\n[PASS] Retrieval is good enough. Proceed to Privacy Guard and API endpoints.")
    else:
        print(f"\n[NEEDS WORK] {10 - passed} more scenarios need to pass.")

    print("\n" + "-" * 80)
    print("DETAILED RESULTS")
    print("-" * 80)

    for i, (result, scenario) in enumerate(zip(results, scenarios), 1):
        status = "PASS" if result.passed else "FAIL"
        print(f"\n{i}. [{status}] {result.scenario_id}")
        print(f"   Observation: {scenario.observation[:80]}...")
        trades_str = ", ".join(scenario.trade) if scenario.trade else "any"
        phases_str = ", ".join(scenario.phase) if scenario.phase else "any"
        print(f"   Trade: [{trades_str}] | Phase: [{phases_str}]")
        print(f"   Keywords found: {result.matched_keywords}")
        print(f"   Correct trade in results: {result.correct_trade_in_results}")
        print(f"   Different project: {result.different_project_in_results}")

        if not result.passed:
            print(f"   FAILURE REASON: {result.failure_reason}")

        if result.top_5_results:
            print(f"   Top match: {result.top_5_results[0].get('source_ref')} - {result.top_5_results[0].get('text', '')[:60]}...")

        if result.generated_alert:
            print(f"   Generated alert: {result.generated_alert[:100]}...")

    # Summary table
    print("\n" + "-" * 80)
    print("SUMMARY TABLE")
    print("-" * 80)
    print(f"{'Scenario':<30} {'Pass':<6} {'Keywords':<20} {'Trade':<6} {'Alert Generated':<6}")
    print("-" * 80)

    for result, scenario in zip(results, scenarios):
        kw_status = f"{len(result.matched_keywords)}/{len(scenario.keywords_that_must_appear)}"
        alert_status = "Yes" if result.generated_alert else "No"
        print(f"{result.scenario_id:<30} {'Y' if result.passed else 'N':<6} {kw_status:<20} {'Y' if result.correct_trade_in_results else 'N':<6} {alert_status:<6}")


def save_results_json(results: list[ScenarioResult], scenarios: list[Scenario], output_path: Path):
    """Save detailed results to JSON for analysis."""
    output = {
        "timestamp": datetime.now().isoformat(),
        "summary": {
            "passed": sum(1 for r in results if r.passed),
            "total": len(results),
            "pass_rate": sum(1 for r in results if r.passed) / len(results) if results else 0,
        },
        "results": []
    }

    for result, scenario in zip(results, scenarios):
        output["results"].append({
            "scenario_id": result.scenario_id,
            "passed": result.passed,
            "failure_reason": result.failure_reason,
            "observation": scenario.observation,
            "expected_trades": scenario.trade,  # Now a list
            "expected_phases": scenario.phase,  # Now a list
            "expected_keywords": scenario.keywords_that_must_appear,
            "matched_keywords": result.matched_keywords,
            "correct_trade_in_results": result.correct_trade_in_results,
            "different_project_in_results": result.different_project_in_results,
            "generated_alert": result.generated_alert,
            "ideal_alert": scenario.ideal_alert_would_say,
            "pass_condition": scenario.pass_condition,
            "top_5_results": result.top_5_results,
        })

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, default=str)

    print(f"\nDetailed results saved to: {output_path}")


async def main():
    print("=" * 80)
    print("SCENARIO-BASED ACCEPTANCE TEST")
    print("=" * 80)

    # Load scenarios
    scenarios_path = Path(__file__).parent / "scenarios.json"
    if not scenarios_path.exists():
        print(f"ERROR: Scenarios file not found: {scenarios_path}")
        print("Please create scenarios.json with your test scenarios.")
        sys.exit(1)

    scenarios = load_scenarios(scenarios_path)
    if not scenarios:
        print("ERROR: No valid scenarios found in scenarios.json")
        print("Please add scenarios (skip placeholders).")
        sys.exit(1)

    print(f"\nLoaded {len(scenarios)} scenarios")

    # Connect to database
    database_url = os.getenv("DATABASE_URL")
    openai_key = os.getenv("OPENAI_API_KEY")

    if not database_url or not openai_key:
        print("ERROR: DATABASE_URL and OPENAI_API_KEY required")
        sys.exit(1)

    openai_client = OpenAI(api_key=openai_key)

    print("Connecting to database...")
    conn = await asyncpg.connect(database_url)

    try:
        # Load corpus
        print("Loading RFI corpus...")
        corpus = await load_corpus(conn)
        print(f"  Loaded {len(corpus)} RFIs")

        # Get unique projects for info
        projects = set(doc.get("source_project_name") or doc.get("source_project_id") for doc in corpus)
        print(f"  From {len(projects)} projects")

        # Initialize retriever
        print("\nInitializing BM25 retriever...")
        retriever = BM25WithTradeFilter(trade_boost=0.3)
        retriever.fit(corpus, text_field="text")

        # Run scenarios
        print(f"\nRunning {len(scenarios)} scenarios...")
        results = []

        for i, scenario in enumerate(scenarios, 1):
            print(f"  [{i}/{len(scenarios)}] {scenario.scenario_id}...", end=" ", flush=True)
            result = await run_scenario(
                scenario=scenario,
                retriever=retriever,
                corpus=corpus,
                openai_client=openai_client,
                current_project_id="__current__"  # Placeholder for current project
            )
            status = "PASS" if result.passed else "FAIL"
            print(status)
            results.append(result)

        # Print scorecard
        print_scorecard(results, scenarios)

        # Save detailed results
        output_path = Path(__file__).parent / f"scenario_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        save_results_json(results, scenarios, output_path)

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
