"""
Keyword extraction for construction text.

Keywords are extracted from the actual database content using build_keyword_index.py.
This ensures we match on terms that actually appear in the data, not a manually
curated list that will always be incomplete.

The keyword index is loaded from data/keyword_index.json which is built by
analyzing all RFI/punch list text in the database.
"""

import json
import re
from pathlib import Path
from typing import Optional

# Load keyword index from data file
_KEYWORD_INDEX = None


def _load_keyword_index() -> dict:
    """Load keyword index from JSON file."""
    global _KEYWORD_INDEX
    if _KEYWORD_INDEX is not None:
        return _KEYWORD_INDEX

    index_path = Path(__file__).parent.parent / "data" / "keyword_index.json"
    if index_path.exists():
        with open(index_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            _KEYWORD_INDEX = {
                "unigrams": set(data.get("unigrams", {}).keys()),
                "bigrams": set(data.get("bigrams", {}).keys()),
                "trigrams": set(data.get("trigrams", {}).keys()),
                "all_keywords": set(data.get("all_keywords", [])),
            }
    else:
        # Fallback to empty index if file doesn't exist
        _KEYWORD_INDEX = {
            "unigrams": set(),
            "bigrams": set(),
            "trigrams": set(),
            "all_keywords": set(),
        }

    return _KEYWORD_INDEX


def get_keyword_index() -> dict:
    """Get the loaded keyword index."""
    return _load_keyword_index()


def tokenize(text: str) -> list[str]:
    """Tokenize text into lowercase words."""
    if not text:
        return []
    # Remove special characters, keep alphanumeric and spaces
    text = re.sub(r'[^\w\s\-/]', ' ', text.lower())
    # Split on whitespace
    tokens = text.split()
    return [t for t in tokens if len(t) > 1]


def extract_ngrams(tokens: list[str], n: int) -> list[str]:
    """Extract n-grams from token list."""
    if len(tokens) < n:
        return []
    return [" ".join(tokens[i:i+n]) for i in range(len(tokens) - n + 1)]


def extract_keywords(text: str) -> set[str]:
    """
    Extract keywords from text using the data-driven keyword index.

    Returns:
        Set of keywords found in the text
    """
    if not text:
        return set()

    index = _load_keyword_index()
    tokens = tokenize(text)
    found = set()

    # Check unigrams
    for token in tokens:
        if token in index["unigrams"]:
            found.add(token)

    # Check bigrams
    for bigram in extract_ngrams(tokens, 2):
        if bigram in index["bigrams"]:
            found.add(bigram)

    # Check trigrams
    for trigram in extract_ngrams(tokens, 3):
        if trigram in index["trigrams"]:
            found.add(trigram)

    return found


def extract_all_keywords_flat(text: str) -> set[str]:
    """
    Extract all keywords as a flat set.
    Alias for extract_keywords for backward compatibility.
    """
    return extract_keywords(text)


def calculate_keyword_overlap(
    query_keywords: set[str],
    candidate_text: str
) -> dict:
    """
    Calculate keyword overlap between query keywords and candidate text.

    Returns:
        Dict with:
        - matched_keywords: list of keywords found in both
        - match_count: number of matches
        - query_coverage: fraction of query keywords matched
        - score: normalized score 0-1
    """
    if not query_keywords:
        return {
            "matched_keywords": [],
            "match_count": 0,
            "query_coverage": 0.0,
            "score": 0.0
        }

    candidate_keywords = extract_keywords(candidate_text)

    matched = query_keywords & candidate_keywords

    match_count = len(matched)
    query_coverage = match_count / len(query_keywords) if query_keywords else 0

    # Score: emphasize having multiple matches
    # 1 match = 0.4, 2 matches = 0.7, 3+ matches = 0.85+
    if match_count == 0:
        score = 0.0
    elif match_count == 1:
        score = 0.4
    elif match_count == 2:
        score = 0.7
    else:
        score = min(1.0, 0.85 + (match_count - 3) * 0.05)

    return {
        "matched_keywords": list(matched),
        "match_count": match_count,
        "query_coverage": query_coverage,
        "score": score
    }


def get_primary_trade(text: str) -> Optional[str]:
    """
    Determine the primary trade from text.
    Returns the first significant keyword found.
    """
    keywords = extract_keywords(text)
    if not keywords:
        return None
    # Return shortest keyword (likely most specific)
    return min(keywords, key=len)


# Quick test
if __name__ == "__main__":
    test_texts = [
        "The curtainwall installer is asking about mullion alignment tolerances at Level 3 north side",
        "City fire marshal wants additional smoke detectors in the electrical rooms on every floor",
        "Rebar placement in the foundation wall doesn't match the structural drawings",
        "Plumbing rough-in locations don't match the architectural reflected ceiling plan",
        "Grade beam conflicts with the plumbing routes",
        "Please provide updated furniture drawings to coordinate power pole location",
        "IMP metal facade panels have been dented. Please advise a fix",
    ]

    print("Testing keyword extraction with data-driven index:\n")
    for text in test_texts:
        keywords = extract_keywords(text)
        print(f"Text: {text}")
        print(f"Keywords: {keywords}")
        print()
