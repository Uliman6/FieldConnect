"""
Evaluation framework for testing retrieval approaches.

Workflow:
1. Run `python -m evaluation.generate_test_pairs` to create labeling tasks
2. Open `evaluation/data/labeling_tasks.json` and add your relevance labels
3. Run `python -m evaluation.evaluate` to compare approaches
4. Iterate: adjust weights, try new approaches, re-evaluate
"""
