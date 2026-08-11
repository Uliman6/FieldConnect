#!/usr/bin/env python3
"""
Import CO amounts from CSV - v2 with better matching and duplicate handling.
"""

import asyncio
import os
import sys
import re
from pathlib import Path
from decimal import Decimal
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg
import pandas as pd

CSV_PATH = Path(r"C:\Users\uluck\OneDrive\Masaüstü\Stanford\Entrepreneurship\Lessons Learned\co_logs_all_projects.csv")


async def main():
    print("=" * 70)
    print("IMPORT CO AMOUNTS FROM CSV - V2")
    print("=" * 70)

    # Load CSV
    df = pd.read_csv(CSV_PATH, encoding='utf-8-sig')
    print(f"Loaded {len(df)} rows from CSV")

    # Extract and aggregate RFI-CO mappings
    # Key: (project, rfi_number) -> total amount
    rfi_amounts = defaultdict(float)

    for _, row in df.iterrows():
        rfi_ref = row.get('rfi_reference', '')
        if pd.isna(rfi_ref) or not rfi_ref:
            continue

        # Parse amount
        amount_str = str(row.get('chosen_amount', '0')).replace(',', '')
        try:
            amount = float(amount_str)
        except:
            amount = 0

        if amount <= 0:
            continue

        project = row['project']

        # Parse RFI number(s) - handles "RFI 54" format
        rfi_matches = re.findall(r'RFI[- #]?(\d+(?:\.\d+)?)', str(rfi_ref), re.IGNORECASE)
        for rfi_num in rfi_matches:
            # Normalize to "RFI-XX" format (no leading zeros for base number)
            if '.' in rfi_num:
                parts = rfi_num.split('.')
                normalized = f"RFI-{int(parts[0])}.{parts[1]}"
            else:
                normalized = f"RFI-{int(rfi_num)}"

            key = (project, normalized)
            rfi_amounts[key] += amount

    print(f"\nAggregated {len(rfi_amounts)} unique RFI-CO mappings")

    # Show per-project stats
    by_project = defaultdict(list)
    for (project, rfi), amount in rfi_amounts.items():
        by_project[project].append((rfi, amount))

    print("\nPer-project aggregated mappings:")
    for project, items in sorted(by_project.items()):
        total = sum(a for _, a in items)
        print(f"  {project}: {len(items)} RFIs, Total: ${total:,.0f}")

    # Connect to database
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Get ALL RFIs from database (not just resulted_in_co=true)
        # Some RFIs have CO amounts but aren't marked as resulted_in_co
        db_rfis = await conn.fetch("""
            SELECT id, source_ref, source_project_name
            FROM intelligence.items
        """)

        print(f"\nDatabase has {len(db_rfis)} total RFIs")

        # Create lookup
        db_lookup = {}
        for rfi in db_rfis:
            key = (rfi['source_project_name'], rfi['source_ref'])
            db_lookup[key] = rfi

        # Clear existing CO amounts first
        await conn.execute("UPDATE intelligence.items SET cost_impact = NULL WHERE cost_impact IS NOT NULL")
        print("Cleared existing cost_impact values")

        # Match and update - try multiple formats
        matched = 0
        total_amount = 0
        unmatched = []

        for (project, rfi_num), amount in rfi_amounts.items():
            # Generate variants to try
            variants = [rfi_num]

            # Extract number part
            match = re.match(r'RFI-(\d+)(?:\.(\d+))?', rfi_num)
            if match:
                base_num = int(match.group(1))
                decimal_part = match.group(2)

                if decimal_part:
                    # Handle decimal RFIs like RFI-52.2
                    variants.extend([
                        f"RFI-{base_num}.{decimal_part}",
                        f"RFI-{base_num:04d}.{decimal_part}",
                        f"RFI-{base_num:03d}.{decimal_part}",
                    ])
                else:
                    # Handle whole number RFIs
                    variants.extend([
                        f"RFI-{base_num}",
                        f"RFI-{base_num:04d}",  # 4-digit padding (Southline style)
                        f"RFI-{base_num:03d}",  # 3-digit padding
                        f"RFI-{base_num:02d}",  # 2-digit padding
                    ])

            found = False
            for variant in variants:
                key = (project, variant)
                if key in db_lookup:
                    db_rfi = db_lookup[key]

                    # Update cost_impact AND set resulted_in_co = true
                    await conn.execute("""
                        UPDATE intelligence.items
                        SET cost_impact = $1, resulted_in_co = true
                        WHERE id = $2
                    """, Decimal(str(amount)), db_rfi['id'])

                    matched += 1
                    total_amount += amount
                    found = True
                    break

            if not found:
                unmatched.append({'project': project, 'rfi': rfi_num, 'amount': amount, 'tried': variants})

        print(f"\n{'='*70}")
        print(f"RESULTS")
        print(f"{'='*70}")
        print(f"Matched: {matched} RFIs")
        print(f"Total CO imported: ${total_amount:,.0f}")
        print(f"Unmatched: {len(unmatched)} RFIs")

        # Show per-project results
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
            print(f"  Total: ${float(p['total'] or 0):,.0f}")
            print(f"  Avg: ${float(p['avg'] or 0):,.0f}")
            print(f"  Max: ${float(p['max'] or 0):,.0f}")

        # Show top RFIs
        print("\n" + "=" * 70)
        print("TOP 15 RFIs BY CO AMOUNT")
        print("=" * 70)

        top_rfis = await conn.fetch("""
            SELECT source_ref, source_project_name, cost_impact
            FROM intelligence.items
            WHERE cost_impact > 0
            ORDER BY cost_impact DESC
            LIMIT 15
        """)

        for rfi in top_rfis:
            print(f"  ${float(rfi['cost_impact']):>12,.0f} | {rfi['source_ref']:15} | {rfi['source_project_name']}")

        # Show unmatched
        if unmatched:
            print("\n" + "=" * 70)
            print(f"UNMATCHED (first 30 of {len(unmatched)})")
            print("=" * 70)

            # Sort by amount
            unmatched.sort(key=lambda x: x['amount'], reverse=True)
            for item in unmatched[:30]:
                print(f"  {item['project']}: {item['rfi']} = ${item['amount']:,.0f}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
