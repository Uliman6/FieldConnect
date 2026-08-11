#!/usr/bin/env python3
"""
LLM-Based Root Cause Extraction

Processes RFIs that resulted in change orders through GPT-4o-mini
to extract specific, actionable root causes.

This is a one-time analysis to understand patterns, which will then
be used to improve keyword-based detection.
"""

import asyncio
import os
import sys
import json
from pathlib import Path
from datetime import datetime
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg
from openai import AsyncOpenAI

REPORTS_DIR = Path(__file__).parent.parent / "reports"
REPORTS_DIR.mkdir(exist_ok=True)

# Initialize OpenAI client
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

EXTRACTION_PROMPT = """Analyze this construction RFI (Request for Information) that resulted in a change order. Extract the root cause of why additional work/cost was needed.

RFI Text:
{question_text}

Resolution:
{resolution_text}

Trade/Scope: {trade}
Project: {project}

Extract the following in JSON format:
{{
    "specific_condition": "What specific condition or issue was discovered? Be precise (e.g., 'existing footing elevation 3 inches higher than designed sidewalk grade' not just 'elevation issue')",
    "impact": "What conflict or problem did this cause? (e.g., 'prevents ADA-compliant sidewalk slope', 'blocks MEP routing')",
    "root_cause_category": "One of: Existing Conditions Differ | Missing Drawing Detail | MEP Coordination Gap | Design Change/Addition | Code/Inspector Requirement | Dimensional Conflict | Scope Gap | Field Damage/Error | Owner Request | Other",
    "root_cause_subcategory": "More specific category (e.g., 'Existing elevation conflict', 'Blocking not detailed', 'Duct conflicts with framing')",
    "preventable": "yes/no - Could this have been caught earlier with better coordination or surveys?",
    "prevention_action": "What could prevent this in future? (e.g., 'Survey existing elevations before design', 'Request blocking layout at permit set')"
}}

Be specific and extract actual details from the text. Don't use generic descriptions."""


async def fetch_co_rfis(conn) -> list[dict]:
    """Fetch all RFIs that resulted in change orders."""
    rows = await conn.fetch("""
        SELECT
            id,
            source_ref,
            source_project_name,
            question_text,
            resolution_text,
            trade_category
        FROM intelligence.items
        WHERE resulted_in_co = true
          AND question_text IS NOT NULL
          AND length(question_text) > 50
        ORDER BY source_project_name, source_ref
    """)
    return [dict(r) for r in rows]


async def extract_root_cause(rfi: dict, semaphore: asyncio.Semaphore) -> dict:
    """Extract root cause from a single RFI using GPT-4o-mini."""
    async with semaphore:
        try:
            prompt = EXTRACTION_PROMPT.format(
                question_text=rfi["question_text"][:3000],  # Limit input size
                resolution_text=(rfi["resolution_text"] or "No resolution recorded")[:1000],
                trade=rfi["trade_category"] or "Not specified",
                project=rfi["source_project_name"]
            )

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a construction project analyst. Extract root causes from RFIs accurately and specifically."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,  # Low temperature for consistency
                max_tokens=500,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            result["rfi_id"] = str(rfi["id"])  # Convert UUID to string
            result["rfi_number"] = rfi["source_ref"]
            result["project"] = rfi["source_project_name"]
            result["trade"] = rfi["trade_category"]
            result["success"] = True

            # Track token usage
            result["tokens_used"] = {
                "input": response.usage.prompt_tokens,
                "output": response.usage.completion_tokens
            }

            return result

        except Exception as e:
            return {
                "rfi_id": str(rfi["id"]),  # Convert UUID to string
                "rfi_number": rfi["source_ref"],
                "project": rfi["source_project_name"],
                "success": False,
                "error": str(e)
            }


async def main():
    print("=" * 70)
    print("LLM ROOT CAUSE EXTRACTION")
    print("=" * 70)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Fetch all CO RFIs
        print("Fetching RFIs with change orders...")
        rfis = await fetch_co_rfis(conn)
        print(f"Found {len(rfis)} RFIs to process")
        print()

        # Process with concurrency limit (avoid rate limits)
        semaphore = asyncio.Semaphore(10)  # 10 concurrent requests

        print("Extracting root causes with GPT-4o-mini...")
        print("Progress: ", end="", flush=True)

        results = []
        total = len(rfis)

        # Process in batches for progress reporting
        batch_size = 50
        for i in range(0, total, batch_size):
            batch = rfis[i:i+batch_size]
            batch_results = await asyncio.gather(
                *[extract_root_cause(rfi, semaphore) for rfi in batch]
            )
            results.extend(batch_results)

            # Progress indicator
            processed = min(i + batch_size, total)
            print(f"\rProgress: {processed}/{total} ({100*processed//total}%)", end="", flush=True)

        print()  # New line after progress

        # Calculate stats
        successful = [r for r in results if r.get("success")]
        failed = [r for r in results if not r.get("success")]

        total_input_tokens = sum(r.get("tokens_used", {}).get("input", 0) for r in successful)
        total_output_tokens = sum(r.get("tokens_used", {}).get("output", 0) for r in successful)

        # Cost calculation (GPT-4o-mini pricing)
        input_cost = total_input_tokens * 0.15 / 1_000_000
        output_cost = total_output_tokens * 0.60 / 1_000_000
        total_cost = input_cost + output_cost

        print()
        print("=" * 70)
        print("EXTRACTION COMPLETE")
        print("=" * 70)
        print(f"Successful: {len(successful)}/{total}")
        print(f"Failed: {len(failed)}")
        print()
        print(f"Token Usage:")
        print(f"  Input:  {total_input_tokens:,} tokens")
        print(f"  Output: {total_output_tokens:,} tokens")
        print(f"  Total:  {total_input_tokens + total_output_tokens:,} tokens")
        print()
        print(f"Cost Estimate:")
        print(f"  Input:  ${input_cost:.4f}")
        print(f"  Output: ${output_cost:.4f}")
        print(f"  Total:  ${total_cost:.4f}")
        print()

        # Analyze categories
        print("=" * 70)
        print("ROOT CAUSE CATEGORY DISTRIBUTION")
        print("=" * 70)

        category_counts = defaultdict(int)
        subcategory_counts = defaultdict(int)
        preventable_counts = {"yes": 0, "no": 0, "unknown": 0}

        for r in successful:
            cat = r.get("root_cause_category", "Unknown")
            subcat = r.get("root_cause_subcategory", "Unknown")
            preventable = r.get("preventable", "unknown").lower()

            category_counts[cat] += 1
            subcategory_counts[subcat] += 1
            if preventable in preventable_counts:
                preventable_counts[preventable] += 1
            else:
                preventable_counts["unknown"] += 1

        print("\nBy Category:")
        for cat, count in sorted(category_counts.items(), key=lambda x: x[1], reverse=True):
            pct = 100 * count / len(successful)
            print(f"  {cat}: {count} ({pct:.1f}%)")

        print(f"\nPreventable: {preventable_counts['yes']} yes, {preventable_counts['no']} no")

        # Save full results to JSON
        output = {
            "generated_at": datetime.now().isoformat(),
            "total_rfis": total,
            "successful": len(successful),
            "failed": len(failed),
            "token_usage": {
                "input": total_input_tokens,
                "output": total_output_tokens,
                "total": total_input_tokens + total_output_tokens
            },
            "cost_usd": total_cost,
            "category_distribution": dict(category_counts),
            "subcategory_distribution": dict(sorted(subcategory_counts.items(), key=lambda x: x[1], reverse=True)[:30]),
            "preventable_distribution": preventable_counts,
            "extractions": successful,
            "errors": failed
        }

        output_path = REPORTS_DIR / "llm_root_cause_extraction.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"\nFull results saved to: {output_path}")

        # Save summary for quick reference
        summary_path = REPORTS_DIR / "root_cause_summary.json"
        summary = {
            "generated_at": datetime.now().isoformat(),
            "total_analyzed": len(successful),
            "categories": dict(sorted(category_counts.items(), key=lambda x: x[1], reverse=True)),
            "top_subcategories": dict(sorted(subcategory_counts.items(), key=lambda x: x[1], reverse=True)[:20]),
            "preventable_pct": 100 * preventable_counts["yes"] / len(successful) if successful else 0,
            "sample_extractions": successful[:10]  # First 10 as samples
        }
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        print(f"Summary saved to: {summary_path}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
