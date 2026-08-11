#!/usr/bin/env python3
"""
Import CO amounts - v7 Line Item Parsing.

FIXES from v6:
- Parses individual line items from description to get RFI-specific costs
- Does NOT use chosen_amount (which is the total change order amount)
- Extracts the specific dollar amount for each RFI mentioned
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


def extract_rfi_costs_from_description(description: str) -> dict:
    """
    Parse description to extract individual RFI costs.

    The description contains multiple line items like:
    "CT0011 31 - Electrical System (CEI) - Includes additional cost to implement changes per "RFI 54 -
    Wall Shift at Bus Duct Riser - 244B Added Opening". ... 14-0100 5,993.00 09/22/2025"

    We need to:
    1. Find each RFI mention
    2. Extract the dollar amount associated with that specific line item
    3. Skip deducts/defers (negative amounts or "defer" keyword)

    Returns dict of {rfi_number: amount}
    """
    if not description or pd.isna(description):
        return {}

    description = str(description)
    rfi_costs = defaultdict(float)

    # Split by common line item delimiters (the CT/CQ/CC/OCW codes that start new items)
    line_items = re.split(r'(?=C[TQC][WO]?-?\d{3,4}\s|OCW-\d{3}\s)', description)

    for item in line_items:
        if not item.strip():
            continue

        item_lower = item.lower()

        # Skip deducts/defers
        if 'defer' in item_lower or 'deduct' in item_lower or 'credit' in item_lower:
            continue

        # Find RFI references in this line item
        rfi_matches = re.findall(r'RFI[- #]*(\d+(?:\.\d+)?)', item, re.IGNORECASE)

        if not rfi_matches:
            continue

        # Extract amounts WITH their signs (look for negative amounts too)
        # Pattern: optional negative sign, then amount
        amounts_with_sign = re.findall(r'(-?\d{1,3}(?:,\d{3})*\.\d{2})', item)

        if not amounts_with_sign:
            continue

        # Parse amounts
        parsed_amounts = []
        for amt_str in amounts_with_sign:
            try:
                amt = float(amt_str.replace(',', ''))
                parsed_amounts.append(amt)
            except:
                pass

        if not parsed_amounts:
            continue

        # If ALL amounts in this line item are negative, skip it (it's a deduct)
        positive_amounts = [a for a in parsed_amounts if a > 0]
        if not positive_amounts:
            continue

        # The line item amount is typically the first positive amount under 1M
        line_item_amount = None
        for amt in positive_amounts:
            if amt < 1_000_000:  # Less than 1M is likely a line item cost
                line_item_amount = amt
                break

        if line_item_amount is None and positive_amounts:
            line_item_amount = min(positive_amounts)

        if line_item_amount and line_item_amount > 0:
            for rfi_num in rfi_matches:
                if '.' in rfi_num:
                    parts = rfi_num.split('.')
                    normalized = f"RFI-{int(parts[0])}.{parts[1]}"
                else:
                    normalized = f"RFI-{int(rfi_num)}"

                rfi_costs[normalized] += line_item_amount

    return dict(rfi_costs)


def parse_csv_for_rfi_costs(csv_path: Path) -> dict:
    """Parse CSV and extract RFI-specific costs from descriptions."""

    df = pd.read_csv(csv_path, encoding='utf-8-sig')
    print(f"Loaded {len(df)} rows from CSV")

    # Collect all RFI costs by project
    project_rfi_costs = defaultdict(lambda: defaultdict(float))

    stats = {
        'total_rows': len(df),
        'rows_with_rfis': 0,
        'total_line_items': 0,
    }

    for idx, row in df.iterrows():
        project = row['project']
        description = row.get('description', '')

        # Extract RFI-specific costs from this row's description
        rfi_costs = extract_rfi_costs_from_description(description)

        if rfi_costs:
            stats['rows_with_rfis'] += 1
            stats['total_line_items'] += len(rfi_costs)

            for rfi, amount in rfi_costs.items():
                project_rfi_costs[project][rfi] += amount

    print(f"\nParsing Stats:")
    print(f"  Total rows: {stats['total_rows']}")
    print(f"  Rows with RFI line items: {stats['rows_with_rfis']}")
    print(f"  Total RFI line items found: {stats['total_line_items']}")

    return dict(project_rfi_costs)


async def main():
    print("=" * 80)
    print("IMPORT CO AMOUNTS - V7 LINE ITEM PARSING")
    print("=" * 80)

    # Parse CSV
    print("\n" + "=" * 80)
    print("PARSING CSV - EXTRACTING RFI-SPECIFIC COSTS FROM DESCRIPTIONS")
    print("=" * 80)

    project_rfi_costs = parse_csv_for_rfi_costs(CSV_PATH)

    # Show summary
    print("\n" + "=" * 80)
    print("RESULTS BY PROJECT")
    print("=" * 80)

    total_rfis = 0
    total_amount = 0

    for project in sorted(project_rfi_costs.keys()):
        rfis = project_rfi_costs[project]
        proj_total = sum(rfis.values())
        total_rfis += len(rfis)
        total_amount += proj_total

        print(f"\n{project}:")
        print(f"  RFIs: {len(rfis)}")
        print(f"  Total: ${proj_total:,.0f}")

        # Top 5
        top_5 = sorted(rfis.items(), key=lambda x: x[1], reverse=True)[:5]
        print(f"  Top 5:")
        for rfi, amt in top_5:
            print(f"    {rfi}: ${amt:,.0f}")

    print(f"\n{'='*80}")
    print(f"TOTAL: {total_rfis} RFIs, ${total_amount:,.0f}")
    print(f"{'='*80}")

    # Import to database
    print("\n" + "=" * 80)
    print("IMPORTING TO DATABASE")
    print("=" * 80)

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Get all RFIs from database
        db_rfis = await conn.fetch("""
            SELECT id, source_ref, source_project_name
            FROM intelligence.items
        """)

        print(f"Database has {len(db_rfis)} total RFIs")

        # Create lookup
        db_lookup = {}
        for rfi in db_rfis:
            key = (rfi['source_project_name'], rfi['source_ref'])
            db_lookup[key] = rfi

        # Clear existing
        await conn.execute("UPDATE intelligence.items SET cost_impact = NULL WHERE cost_impact IS NOT NULL")
        print("Cleared existing cost_impact values")

        # Match and update
        matched = 0
        total_imported = 0
        unmatched = []

        for project, rfis in project_rfi_costs.items():
            for rfi_num, amount in rfis.items():
                if amount <= 0:
                    continue

                # Generate format variants
                variants = [rfi_num]
                match = re.match(r'RFI-(\d+)(?:\.(\d+))?', rfi_num)
                if match:
                    base_num = int(match.group(1))
                    decimal_part = match.group(2)

                    if decimal_part:
                        variants.extend([
                            f"RFI-{base_num}.{decimal_part}",
                            f"RFI-{base_num:04d}.{decimal_part}",
                            f"RFI-{base_num:03d}.{decimal_part}",
                        ])
                    else:
                        variants.extend([
                            f"RFI-{base_num}",
                            f"RFI-{base_num:04d}",
                            f"RFI-{base_num:03d}",
                            f"RFI-{base_num:02d}",
                        ])

                found = False
                for variant in variants:
                    key = (project, variant)
                    if key in db_lookup:
                        db_rfi = db_lookup[key]

                        await conn.execute("""
                            UPDATE intelligence.items
                            SET cost_impact = $1, resulted_in_co = true
                            WHERE id = $2
                        """, Decimal(str(amount)), db_rfi['id'])

                        matched += 1
                        total_imported += amount
                        found = True
                        break

                if not found:
                    unmatched.append({
                        'project': project,
                        'rfi': rfi_num,
                        'amount': amount
                    })

        print(f"\nMatched and imported: {matched} RFIs")
        print(f"Total imported: ${total_imported:,.0f}")
        print(f"Unmatched: {len(unmatched)}")

        # Show top 20
        print("\n" + "=" * 80)
        print("TOP 20 RFIs BY CO AMOUNT")
        print("=" * 80)

        top_rfis = await conn.fetch("""
            SELECT source_ref, source_project_name, cost_impact
            FROM intelligence.items
            WHERE cost_impact > 0
            ORDER BY cost_impact DESC
            LIMIT 20
        """)

        for rfi in top_rfis:
            print(f"  ${float(rfi['cost_impact']):>12,.0f} | {rfi['source_ref']:15} | {rfi['source_project_name']}")

        # Verify RFI 54
        print("\n" + "=" * 80)
        print("VERIFICATION - RFI 54 at CoreSite")
        print("=" * 80)

        rfi54 = await conn.fetchrow("""
            SELECT source_ref, cost_impact
            FROM intelligence.items
            WHERE source_project_name = 'CoreSite Data Center' AND source_ref = 'RFI-54'
        """)
        if rfi54:
            print(f"RFI-54 cost: ${float(rfi54['cost_impact']):,.2f}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
