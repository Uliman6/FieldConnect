#!/usr/bin/env python3
"""
Extract and store question_text from existing RFI raw_text.

This script:
1. Adds the question_text column if it doesn't exist
2. Extracts the actual question/issue from messy raw_text
3. Updates items with clean question_text for better matching and display

Run: python scripts/extract_questions.py
"""

import asyncio
import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import asyncpg


def extract_question_from_rfi_text(raw_text: str) -> str:
    """
    Extract the actual question/issue from messy RFI text.

    RFI text typically contains:
    - Header/title
    - "Created by X with Autodesk..." metadata
    - Reference drawings/docs
    - The actual QUESTION
    - Official response

    We want to extract the actual question/issue.
    """
    if not raw_text:
        return ""

    # Strategy 1: Look for "Question" section marker
    question_match = re.search(
        r'Question\s*\n(.*?)(?=Official response|References|Impact|Attachments|\Z)',
        raw_text,
        re.DOTALL | re.IGNORECASE
    )
    if question_match:
        question = question_match.group(1).strip()
        # Clean up the question text
        question = clean_extracted_text(question)
        if len(question) > 20:
            return question

    # Strategy 2: Look for Q1:, Q2:, etc. markers (common in multi-part RFIs)
    q_matches = re.findall(r'Q\d+[:\.]?\s*(.+?)(?=Q\d+[:\.]|A\d+[:\.]|\Z)', raw_text, re.DOTALL)
    if q_matches:
        questions = [clean_extracted_text(q) for q in q_matches]
        combined = "\n".join(q for q in questions if len(q) > 10)
        if combined:
            return combined

    # Strategy 3: Look for lines ending with "?" (actual questions)
    question_lines = re.findall(r'[^.\n]*\?', raw_text)
    if question_lines:
        # Filter out metadata lines
        real_questions = [
            q.strip() for q in question_lines
            if len(q) > 20
            and "Created by" not in q
            and "Autodesk" not in q
        ]
        if real_questions:
            return "\n".join(real_questions[:3])  # Take first 3 questions

    # Strategy 4: After title, take first substantive paragraph
    # Remove the "Created by... Autodesk" metadata
    cleaned = re.sub(r'Created by .+ with Autodesk.+?(?=\n\n|\Z)', '', raw_text, flags=re.DOTALL)
    cleaned = re.sub(r'Page \d+ of \d+', '', cleaned)
    cleaned = re.sub(r'RFI detail #\d+', '', cleaned)

    # Find first paragraph after references
    paragraphs = re.split(r'\n\n+', cleaned)
    for para in paragraphs:
        para = para.strip()
        # Skip short lines, reference lines, dates
        if len(para) < 30:
            continue
        if para.startswith('-') or para.startswith('Reference'):
            continue
        if re.match(r'^[A-Z]\d+\.', para):  # Drawing ref like S2.02
            continue
        return clean_extracted_text(para)

    # Fallback: return cleaned version of first 500 chars
    cleaned = clean_extracted_text(raw_text[:500])
    return cleaned


def extract_question_from_punch_text(raw_text: str) -> str:
    """
    Extract the description/issue from punch list text.
    """
    if not raw_text:
        return ""

    # Punch lists are usually cleaner - just return cleaned text
    return clean_extracted_text(raw_text)


def clean_extracted_text(text: str) -> str:
    """
    Clean up extracted text:
    - Remove Autodesk metadata
    - Remove page numbers
    - Remove excessive whitespace
    - Remove line prefixes like "- "
    """
    if not text:
        return ""

    # Remove Autodesk metadata
    text = re.sub(r'Created by .+ with Autodesk[^.]*\.?', '', text)
    text = re.sub(r'Autodesk[®™]? Construction Cloud[™]?', '', text)

    # Remove page numbers
    text = re.sub(r'Page \d+ of \d+', '', text)

    # Remove RFI detail headers
    text = re.sub(r'RFI detail #\d+', '', text)

    # Remove date/time stamps
    text = re.sub(r'on [A-Z][a-z]+ \d+, \d{4} at \d+:\d+ [AP]M [A-Z]+', '', text)

    # Remove leading dashes and bullets
    text = re.sub(r'^[\-•]\s*', '', text, flags=re.MULTILINE)

    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()

    return text


async def main():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    print("Connecting to database...")
    conn = await asyncpg.connect(database_url)

    # Step 1: Add column if it doesn't exist
    print("Adding question_text column if needed...")
    try:
        await conn.execute("""
            ALTER TABLE intelligence.items
            ADD COLUMN IF NOT EXISTS question_text TEXT
        """)
        print("  Column added/verified")
    except Exception as e:
        print(f"  Note: {e}")

    # Step 2: Get all items that need question extraction
    print("\nFetching items to process...")
    items = await conn.fetch("""
        SELECT id, source_type, raw_text
        FROM intelligence.items
        WHERE question_text IS NULL OR question_text = ''
    """)
    print(f"  Found {len(items)} items to process")

    # Step 3: Extract questions and update
    print("\nExtracting questions...")
    updated = 0
    for item in items:
        item_id = item['id']
        source_type = item['source_type']
        raw_text = item['raw_text'] or ""

        if source_type == 'rfi':
            question = extract_question_from_rfi_text(raw_text)
        else:
            question = extract_question_from_punch_text(raw_text)

        if question:
            await conn.execute("""
                UPDATE intelligence.items
                SET question_text = $1
                WHERE id = $2
            """, question, item_id)
            updated += 1

    print(f"  Updated {updated} items with extracted questions")

    # Step 4: Show some examples
    print("\n" + "="*60)
    print("SAMPLE EXTRACTED QUESTIONS:")
    print("="*60)

    samples = await conn.fetch("""
        SELECT source_ref, source_type, question_text
        FROM intelligence.items
        WHERE question_text IS NOT NULL AND question_text != ''
        ORDER BY RANDOM()
        LIMIT 5
    """)

    for s in samples:
        print(f"\n{s['source_ref']} ({s['source_type']}):")
        print(f"  {s['question_text'][:200]}{'...' if len(s['question_text'] or '') > 200 else ''}")

    await conn.close()
    print("\n[DONE] Question extraction complete")


if __name__ == "__main__":
    asyncio.run(main())
