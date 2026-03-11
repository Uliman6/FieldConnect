"""
LLM-as-Judge labeling - use GPT to automatically label relevance.

This is useful for:
1. Quick initial labeling to bootstrap the process
2. Validating your manual labels
3. Scaling up when you have many pairs to label

Usage:
    python -m evaluation.llm_labeler --sample 50

You should still manually review a subset to validate LLM labels.
"""

import asyncio
import json
import argparse
from pathlib import Path
from datetime import datetime

# Add parent to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from config import get_openai_client


LABELING_PROMPT = """You are evaluating whether two construction issues are relevant to each other.

QUERY (new field observation):
Project: {query_project}
Reference: {query_ref}
Trade: {query_trade}
Text: {query_text}

CANDIDATE (historical RFI/issue):
Project: {candidate_project}
Reference: {candidate_ref}
Trade: {candidate_trade}
Text: {candidate_text}
Resolution: {candidate_resolution}

Evaluate relevance based on:
1. Would the resolution from the historical issue help address the new observation?
2. Are these fundamentally similar problems (not just surface-level word overlap)?
3. Would a project manager want to see this historical issue when encountering the new observation?

Respond with ONLY one of these labels:
- highly_relevant: Same or very similar issue. Resolution directly applies.
- somewhat_relevant: Related issue. Some lessons might apply.
- not_relevant: Different issue. No useful connection.

Also provide a brief (1 sentence) reasoning.

Format your response as:
LABEL: <label>
REASONING: <reasoning>
"""


async def label_with_llm(query: dict, candidate: dict) -> dict:
    """Use LLM to label a single query-candidate pair."""
    client = get_openai_client()

    prompt = LABELING_PROMPT.format(
        query_project=query.get("project", ""),
        query_ref=query.get("ref", ""),
        query_trade=query.get("trade", ""),
        query_text=query.get("text", "")[:500],
        candidate_project=candidate.get("project", ""),
        candidate_ref=candidate.get("ref", ""),
        candidate_trade=candidate.get("trade", ""),
        candidate_text=candidate.get("text", "")[:500],
        candidate_resolution=candidate.get("resolution", "")[:200],
    )

    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=100,
            temperature=0.1,
        )

        content = response.choices[0].message.content.strip()

        # Parse response
        label = None
        reasoning = None

        for line in content.split("\n"):
            line = line.strip()
            if line.upper().startswith("LABEL:"):
                label_text = line.split(":", 1)[1].strip().lower()
                if "highly" in label_text:
                    label = "highly_relevant"
                elif "somewhat" in label_text:
                    label = "somewhat_relevant"
                else:
                    label = "not_relevant"
            elif line.upper().startswith("REASONING:"):
                reasoning = line.split(":", 1)[1].strip()

        return {
            "relevance": label or "not_relevant",
            "reasoning": reasoning,
            "llm_labeled": True,
        }

    except Exception as e:
        print(f"  Error calling LLM: {e}")
        return {
            "relevance": None,
            "reasoning": f"Error: {str(e)}",
            "llm_labeled": False,
        }


async def run_llm_labeling(sample_size: int = None, overwrite: bool = False):
    """Run LLM labeling on unlabeled pairs."""
    print("=" * 60)
    print("LLM-AS-JUDGE LABELING")
    print("=" * 60)

    data_file = Path(__file__).parent / "data" / "labeling_tasks.json"
    if not data_file.exists():
        print(f"No data file found. Run `python -m evaluation.run generate` first.")
        return

    with open(data_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    tasks = data.get("tasks", [])

    # Count unlabeled
    pairs_to_label = []
    for task in tasks:
        for candidate in task.get("candidates", []):
            if overwrite or candidate.get("relevance") is None:
                pairs_to_label.append((task, candidate))

    if not pairs_to_label:
        print("All pairs already labeled. Use --overwrite to re-label.")
        return

    # Sample if requested
    if sample_size and sample_size < len(pairs_to_label):
        import random
        pairs_to_label = random.sample(pairs_to_label, sample_size)

    print(f"Labeling {len(pairs_to_label)} pairs...")
    print("(This uses GPT-4o-mini, cost is minimal)")

    labeled_count = 0
    for i, (task, candidate) in enumerate(pairs_to_label):
        print(f"  [{i+1}/{len(pairs_to_label)}] {candidate.get('ref', 'unknown')[:40]}...", end=" ")

        result = await label_with_llm(task["query"], candidate)

        if result.get("relevance"):
            candidate["relevance"] = result["relevance"]
            candidate["reasoning"] = result["reasoning"]
            candidate["llm_labeled"] = True
            labeled_count += 1
            print(f"-> {result['relevance']}")
        else:
            print("-> ERROR")

        # Rate limiting
        await asyncio.sleep(0.1)

    # Save
    data["llm_labeled_at"] = datetime.now().isoformat()
    with open(data_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"\nLabeled {labeled_count} pairs")
    print(f"Saved to: {data_file}")

    # Summary
    label_counts = {"highly_relevant": 0, "somewhat_relevant": 0, "not_relevant": 0}
    for task in tasks:
        for c in task.get("candidates", []):
            rel = c.get("relevance")
            if rel in label_counts:
                label_counts[rel] += 1

    print("\nLabel distribution:")
    for label, count in label_counts.items():
        print(f"  {label}: {count}")

    print("""
IMPORTANT: LLM labels are a starting point, not ground truth.
Review a sample manually to validate the LLM's judgments.

Next: python -m evaluation.run evaluate
    """)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", type=int, help="Only label N random pairs")
    parser.add_argument("--overwrite", action="store_true", help="Re-label already labeled pairs")
    args = parser.parse_args()

    asyncio.run(run_llm_labeling(args.sample, args.overwrite))
