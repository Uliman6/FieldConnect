#!/usr/bin/env python3
"""Search for actual CO numbers and amounts in the data."""

import asyncio
import os
import sys
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg


async def main():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Search for PCO/COR numbers in text
        print("SEARCHING FOR CHANGE ORDER NUMBERS IN RFI TEXT...")
        print("=" * 80)

        rows = await conn.fetch("""
            SELECT source_ref, source_project_name, question_text, resolution_text
            FROM intelligence.items
            WHERE question_text ~* '(PCO|COR|CO-|CO #|change order)[- ]?[0-9]+'
               OR resolution_text ~* '(PCO|COR|CO-|CO #|change order)[- ]?[0-9]+'
            LIMIT 30
        """)

        print(f"Found {len(rows)} RFIs mentioning CO/PCO numbers\n")

        for r in rows:
            text = (r["question_text"] or "") + " " + (r["resolution_text"] or "")
            # Find CO numbers
            matches = re.findall(r"(PCO|COR|CO-|CO #|change order)[- ]?([0-9]+)", text, re.IGNORECASE)
            if matches:
                print(f"\n[{r['source_ref']}] {r['source_project_name']}")
                print(f"  CO References: {[f'{m[0]}-{m[1]}' for m in matches]}")

        # Search for dollar amounts in CO-related RFIs
        print("\n" + "=" * 80)
        print("SEARCHING FOR DOLLAR AMOUNTS IN CO RFIs...")
        print("=" * 80)

        rows = await conn.fetch("""
            SELECT source_ref, source_project_name,
                   COALESCE(question_text, '') || ' ' || COALESCE(resolution_text, '') as full_text
            FROM intelligence.items
            WHERE resulted_in_co = true
              AND (question_text ILIKE '%$%' OR resolution_text ILIKE '%$%')
            LIMIT 20
        """)

        for r in rows:
            text = r["full_text"]
            # Find dollar amounts
            amounts = re.findall(r"\$[\d,]+(?:\.\d{2})?", text)
            if amounts:
                print(f"\n[{r['source_ref']}] {r['source_project_name']}")
                print(f"  Dollar amounts mentioned: {amounts}")
                # Show context
                for amt in amounts[:2]:
                    idx = text.find(amt)
                    if idx >= 0:
                        snippet = text[max(0, idx-30):idx+50]
                        snippet = re.sub(r'\s+', ' ', snippet).strip()
                        print(f"    Context: ...{snippet}...")

        # Check what CO data structure we have
        print("\n" + "=" * 80)
        print("DATA STRUCTURE CHECK")
        print("=" * 80)

        # Count by resulted_in_co
        co_counts = await conn.fetch("""
            SELECT
                source_project_name,
                COUNT(*) FILTER (WHERE resulted_in_co = true) as co_count,
                COUNT(*) as total
            FROM intelligence.items
            GROUP BY source_project_name
            ORDER BY co_count DESC
        """)

        print("\nCO flags by project:")
        for r in co_counts:
            print(f"  {r['source_project_name']}: {r['co_count']} COs / {r['total']} total RFIs")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
