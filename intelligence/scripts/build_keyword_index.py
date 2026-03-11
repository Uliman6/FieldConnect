#!/usr/bin/env python3
"""
Build keyword index from actual RFI/punch list data.

This script analyzes the text in the database and extracts:
1. Most frequent terms (unigrams, bigrams, trigrams)
2. Filters out common English stop words
3. Saves the keyword index for use in similarity matching

Run: python scripts/build_keyword_index.py
"""

import asyncio
import re
import json
import os
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import asyncpg

# Common English stop words to filter out
STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
    "with", "by", "from", "as", "is", "was", "are", "were", "been", "be", "have",
    "has", "had", "do", "does", "did", "will", "would", "could", "should", "may",
    "might", "must", "shall", "can", "need", "dare", "ought", "used", "it", "its",
    "this", "that", "these", "those", "i", "you", "he", "she", "we", "they", "me",
    "him", "her", "us", "them", "my", "your", "his", "our", "their", "mine", "yours",
    "hers", "ours", "theirs", "what", "which", "who", "whom", "whose", "where",
    "when", "why", "how", "all", "each", "every", "both", "few", "more", "most",
    "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so",
    "than", "too", "very", "just", "also", "now", "here", "there", "then",
    "if", "because", "until", "while", "during", "before", "after", "above",
    "below", "between", "under", "again", "further", "once", "any", "about",
    "into", "through", "over", "out", "up", "down", "off", "on", "re", "s", "t",
    "ll", "ve", "d", "m", "o", "y", "ain", "aren", "couldn", "didn", "doesn",
    "hadn", "hasn", "haven", "isn", "ma", "mightn", "mustn", "needn", "shan",
    "shouldn", "wasn", "weren", "won", "wouldn", "per", "via", "etc", "ie", "eg",
    # Common document words
    "please", "see", "attached", "reference", "ref", "note", "notes", "item",
    "items", "page", "date", "set", "current", "new", "existing", "proposed",
    "provide", "provided", "confirm", "confirmed", "review", "reviewed",
    "following", "shown", "showing", "shown", "based", "regarding", "related",
    # Numbers and units often not useful alone
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "one", "two", "three",
}

# Additional construction-irrelevant words
CONSTRUCTION_STOP_WORDS = {
    "acc", "autodesk", "construction", "cloud", "created", "updated",
    "project", "rfi", "punch", "list", "issue", "response", "official",
    "question", "answer", "status", "open", "closed", "pending", "draft",
    "submitted", "approved", "rejected", "ball", "court", "manager",
}

ALL_STOP_WORDS = STOP_WORDS | CONSTRUCTION_STOP_WORDS


def tokenize(text: str) -> list[str]:
    """Tokenize text into lowercase words."""
    if not text:
        return []
    # Remove special characters, keep alphanumeric and spaces
    text = re.sub(r'[^\w\s\-/]', ' ', text.lower())
    # Split on whitespace
    tokens = text.split()
    # Filter out very short tokens and stop words
    tokens = [t for t in tokens if len(t) > 1 and t not in ALL_STOP_WORDS]
    return tokens


def extract_ngrams(tokens: list[str], n: int) -> list[str]:
    """Extract n-grams from token list."""
    if len(tokens) < n:
        return []
    return [" ".join(tokens[i:i+n]) for i in range(len(tokens) - n + 1)]


def is_valid_ngram(ngram: str) -> bool:
    """Check if ngram is valid (not all stop words, not all numbers)."""
    words = ngram.split()
    # At least one word should not be a stop word
    if all(w in ALL_STOP_WORDS for w in words):
        return False
    # Should not be all numbers
    if all(w.isdigit() for w in words):
        return False
    # Should not start/end with common prepositions
    if words[0] in {"of", "the", "a", "an", "to", "for", "in", "on", "at", "by"}:
        return False
    if words[-1] in {"of", "the", "a", "an", "to", "for", "in", "on", "at", "by"}:
        return False
    return True


async def build_keyword_index():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    print("Connecting to database...")
    conn = await asyncpg.connect(database_url)

    # Fetch all text content
    print("Fetching text content from database...")
    rows = await conn.fetch("""
        SELECT question_text, normalized_text, raw_text
        FROM intelligence.items
        WHERE question_text IS NOT NULL OR normalized_text IS NOT NULL
    """)
    print(f"  Found {len(rows)} items")

    # Count terms
    unigram_counter = Counter()
    bigram_counter = Counter()
    trigram_counter = Counter()

    print("Analyzing text...")
    for row in rows:
        # Prefer question_text, fall back to normalized_text
        text = row['question_text'] or row['normalized_text'] or row['raw_text'] or ""
        tokens = tokenize(text)

        # Count unigrams
        for token in tokens:
            if len(token) > 2:  # Skip very short words
                unigram_counter[token] += 1

        # Count bigrams
        for bigram in extract_ngrams(tokens, 2):
            if is_valid_ngram(bigram):
                bigram_counter[bigram] += 1

        # Count trigrams
        for trigram in extract_ngrams(tokens, 3):
            if is_valid_ngram(trigram):
                trigram_counter[trigram] += 1

    await conn.close()

    # Filter to terms that appear at least N times
    MIN_UNIGRAM_COUNT = 5
    MIN_BIGRAM_COUNT = 3
    MIN_TRIGRAM_COUNT = 2

    frequent_unigrams = {k: v for k, v in unigram_counter.items() if v >= MIN_UNIGRAM_COUNT}
    frequent_bigrams = {k: v for k, v in bigram_counter.items() if v >= MIN_BIGRAM_COUNT}
    frequent_trigrams = {k: v for k, v in trigram_counter.items() if v >= MIN_TRIGRAM_COUNT}

    print(f"\nExtracted keywords:")
    print(f"  Unigrams (>={MIN_UNIGRAM_COUNT} occurrences): {len(frequent_unigrams)}")
    print(f"  Bigrams (>={MIN_BIGRAM_COUNT} occurrences): {len(frequent_bigrams)}")
    print(f"  Trigrams (>={MIN_TRIGRAM_COUNT} occurrences): {len(frequent_trigrams)}")

    # Build keyword index
    keyword_index = {
        "unigrams": dict(sorted(frequent_unigrams.items(), key=lambda x: -x[1])),
        "bigrams": dict(sorted(frequent_bigrams.items(), key=lambda x: -x[1])),
        "trigrams": dict(sorted(frequent_trigrams.items(), key=lambda x: -x[1])),
        "all_keywords": set(frequent_unigrams.keys()) | set(frequent_bigrams.keys()) | set(frequent_trigrams.keys()),
    }

    # Save to file
    output_path = Path(__file__).parent.parent / "data" / "keyword_index.json"
    output_path.parent.mkdir(exist_ok=True)

    # Convert set to list for JSON serialization
    keyword_index_json = {
        "unigrams": keyword_index["unigrams"],
        "bigrams": keyword_index["bigrams"],
        "trigrams": keyword_index["trigrams"],
        "all_keywords": sorted(keyword_index["all_keywords"]),
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(keyword_index_json, f, indent=2)

    print(f"\nKeyword index saved to: {output_path}")

    # Print top keywords
    print("\n" + "="*60)
    print("TOP 30 UNIGRAMS:")
    print("="*60)
    for term, count in list(keyword_index["unigrams"].items())[:30]:
        print(f"  {count:4d}  {term}")

    print("\n" + "="*60)
    print("TOP 30 BIGRAMS:")
    print("="*60)
    for term, count in list(keyword_index["bigrams"].items())[:30]:
        print(f"  {count:4d}  {term}")

    print("\n" + "="*60)
    print("TOP 20 TRIGRAMS:")
    print("="*60)
    for term, count in list(keyword_index["trigrams"].items())[:20]:
        print(f"  {count:4d}  {term}")

    print("\n[DONE] Keyword index built from data")
    return keyword_index


if __name__ == "__main__":
    asyncio.run(build_keyword_index())
