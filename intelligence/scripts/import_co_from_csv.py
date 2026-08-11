#!/usr/bin/env python3
"""
Import CO amounts from co_logs_all_projects.csv into the database.
"""

import asyncio
import os
import sys
import re
from pathlib import Path
from decimal import Decimal

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg
import pandas as pd

CSV_PATH = Path(r"C:\Users\uluck\OneDrive\Masaüstü\Stanford\Entrepreneurship\Lessons Learned\co_logs_all_projects.csv")


def normalize_rfi_number(rfi_num: str) -> list[str]:
    """
    Normalize RFI number to match database format.
    Returns multiple possible formats to try matching.
    """
    # Extract the number part
    match = re.match(r'RFI-?(\d+(?:\.\d+)?)', rfi_num, re.IGNORECASE)
    if not match:
        return [rfi_num]

    num = match.group(1)

    variants = []

    if '.' in num:
        # Handle decimal RFI numbers (e.g., 76.1)
        parts = num.split('.')
        base = int(parts[0])
        decimal = parts[1]
        variants.append(f"RFI-{base}.{decimal}")
        variants.append(f"RFI-{base:04d}.{decimal}")  # With leading zeros
    else:
        base = int(num)
        variants.append(f"RFI-{base}")
        variants.append(f"RFI-{base:04d}")  # With leading zeros (e.g., RFI-0259)
        variants.append(f"RFI-{base:03d}")  # 3-digit padding
        variants.append(f"RFI-{base:02d}")  # 2-digit padding

    return variants


async def main():
    print("=" * 70)
    print("IMPORT CO AMOUNTS FROM CSV")
    print("=" * 70)

    # Load CSV
    df = pd.read_csv(CSV_PATH, encoding='utf-8-sig')
    print(f"Loaded {len(df)} rows from CSV")

    # Extract RFI-CO mappings
    rfi_cos = []
    for _, row in df.iterrows():
        rfi_ref = row.get('rfi_reference', '')
        if pd.notna(rfi_ref) and rfi_ref:
            # Parse amount
            amount_str = str(row.get('chosen_amount', '0')).replace(',', '')
            try:
                amount = float(amount_str)
            except:
                amount = 0

            if amount <= 0:
                continue

            # Parse RFI number(s)
            rfi_matches = re.findall(r'RFI[- #]?(\d+(?:\.\d+)?)', str(rfi_ref), re.IGNORECASE)
            for rfi_num in rfi_matches:
                rfi_cos.append({
                    'project': row['project'],
                    'rfi_number': f'RFI-{rfi_num}',
                    'amount': amount
                })

    print(f"Extracted {len(rfi_cos)} RFI-CO mappings with amounts > 0")

    # Connect to database
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Get all RFIs from database
        db_rfis = await conn.fetch("""
            SELECT id, source_ref, source_project_name
            FROM intelligence.items
            WHERE resulted_in_co = true
        """)

        print(f"Database has {len(db_rfis)} RFIs marked as resulted_in_co")

        # Create lookup by project + RFI number variants
        db_lookup = {}
        for rfi in db_rfis:
            # Store under original ref
            key = (rfi['source_project_name'], rfi['source_ref'])
            db_lookup[key] = rfi

        # Match and update
        matched = 0
        updated = 0
        total_amount = 0
        unmatched = []

        for ra in rfi_cos:
            # Try different RFI number formats
            variants = normalize_rfi_number(ra['rfi_number'])
            found = False

            for variant in variants:
                key = (ra['project'], variant)
                if key in db_lookup:
                    db_rfi = db_lookup[key]

                    # Update cost_impact
                    await conn.execute("""
                        UPDATE intelligence.items
                        SET cost_impact = $1
                        WHERE id = $2
                    """, Decimal(str(ra['amount'])), db_rfi['id'])

                    matched += 1
                    updated += 1
                    total_amount += ra['amount']
                    found = True
                    break

            if not found:
                unmatched.append(ra)

        print(f"\n{'='*70}")
        print(f"RESULTS")
        print(f"{'='*70}")
        print(f"Matched: {matched} RFIs")
        print(f"Updated: {updated} records")
        print(f"Total CO amount imported: ${total_amount:,.2f}")
        print(f"Unmatched: {len(unmatched)} RFIs")

        # Show distribution by project
        print("\n" + "=" * 70)
        print("UPDATED AMOUNTS BY PROJECT")
        print("=" * 70)

        project_totals = await conn.fetch("""
            SELECT source_project_name,
                   COUNT(*) as count,
                   SUM(cost_impact) as total,
                   AVG(cost_impact) as avg,
                   MAX(cost_impact) as max
            FROM intelligence.items
            WHERE cost_impact > 0
            GROUP BY source_project_name
            ORDER BY total DESC
        """)

        for p in project_totals:
            print(f"\n{p['source_project_name']}")
            print(f"  Count: {p['count']}")
            print(f"  Total: ${float(p['total'] or 0):,.2f}")
            print(f"  Avg: ${float(p['avg'] or 0):,.2f}")
            print(f"  Max: ${float(p['max'] or 0):,.2f}")

        # Show top RFIs by amount
        print("\n" + "=" * 70)
        print("TOP 15 RFIs BY CO AMOUNT")
        print("=" * 70)

        top_rfis = await conn.fetch("""
            SELECT source_ref, source_project_name, cost_impact,
                   LEFT(question_text, 80) as question_preview
            FROM intelligence.items
            WHERE cost_impact > 0
            ORDER BY cost_impact DESC
            LIMIT 15
        """)

        for rfi in top_rfis:
            print(f"\n${float(rfi['cost_impact']):>12,.2f} | {rfi['source_ref']} ({rfi['source_project_name']})")
            print(f"    {rfi['question_preview']}...")

        # Show unmatched (first 20)
        if unmatched:
            print("\n" + "=" * 70)
            print(f"UNMATCHED RFI-CO MAPPINGS (first 20 of {len(unmatched)})")
            print("=" * 70)

            for ra in unmatched[:20]:
                print(f"  {ra['project']}: {ra['rfi_number']} = ${ra['amount']:,.2f}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
