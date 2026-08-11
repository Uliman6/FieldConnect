#!/usr/bin/env python3
"""
Import CO amounts - v8 Validated.

FIXES from v7:
- Skip "Allowance Draw" entries (these are draws against allowances, not RFI-specific costs)
- Skip "Allowance" tracking entries
- Better detection of actual line item costs vs cumulative totals
- Added detailed debug mode for validation
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

# Debug mode - set to True to see detailed extraction
DEBUG_RFIS = set()  # Add RFI numbers to debug, e.g., {'968', '125', '54'}


def extract_rfi_costs_from_description(description: str, debug: bool = False) -> dict:
    """
    Parse description to extract individual RFI costs.

    The description contains multiple line items like:
    "CT0011 31 - Electrical System (CEI) - Includes additional cost to implement changes per "RFI 54 -
    Wall Shift at Bus Duct Riser - 244B Added Opening". ... 14-0100 5,993.00 09/22/2025"

    We need to:
    1. Find each RFI mention
    2. Extract the dollar amount associated with that specific line item
    3. Skip deducts/defers (negative amounts or "defer" keyword)
    4. Skip allowance draws (these are allowance tracking, not actual RFI costs)

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
            if debug:
                print(f"  SKIP (deduct/defer): {item[:80]}...")
            continue

        # Skip allowance draws - these are draws against allowances, not actual RFI costs
        if 'allowance draw' in item_lower or 'allowance usage' in item_lower:
            if debug:
                print(f"  SKIP (allowance draw): {item[:80]}...")
            continue

        # Skip items that are primarily allowance tracking (e.g., "Allowance - RFI123")
        # But don't skip items where allowance is incidental (e.g., "Cost per RFI 54, includes allowance for...")
        if re.search(r'allowance\s*-\s*rfi', item_lower) or re.search(r'allowance\s+draw', item_lower):
            if debug:
                print(f"  SKIP (allowance tracking): {item[:80]}...")
            continue

        # Find RFI references in this line item
        rfi_matches = re.findall(r'RFI[- #]*(\d+(?:\.\d+)?)', item, re.IGNORECASE)

        if not rfi_matches:
            continue

        # Check if any of the RFIs we're debugging are in this item
        should_debug = debug or any(rfi in DEBUG_RFIS for rfi in rfi_matches)

        # Extract amounts WITH their signs (look for negative amounts too)
        # Pattern: optional negative sign, then amount with format X,XXX.XX
        amounts_with_sign = re.findall(r'(-?\d{1,3}(?:,\d{3})*\.\d{2})', item)

        if not amounts_with_sign:
            if should_debug:
                print(f"  NO AMOUNTS in: {item[:100]}...")
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
            if should_debug:
                print(f"  SKIP (all negative): {item[:80]}...")
            continue

        # IMPROVED LOGIC:
        # The line item cost is typically NOT the largest amount (that's often cumulative)
        # Look for pattern: smaller amounts before larger ones indicate line item vs cumulative
        # Also: amounts that look like "round numbers" (100000, 500000) are often allowances

        # Filter out likely cumulative/allowance amounts
        likely_line_item_amounts = []
        for amt in positive_amounts:
            # Skip very round numbers that are likely allowances (100k, 250k, 500k, 1M, etc.)
            if amt >= 100000:
                # Check if it's a "round" number (divisible by 10000 or 25000)
                if amt % 10000 == 0 or amt % 25000 == 0:
                    if should_debug:
                        print(f"  SKIP ROUND AMT: ${amt:,.2f}")
                    continue
            likely_line_item_amounts.append(amt)

        if not likely_line_item_amounts:
            if should_debug:
                print(f"  SKIP (only round amounts): {positive_amounts}")
            continue

        # Take the smallest non-trivial amount as the line item cost
        # (amounts under $100 are likely not line item costs - could be markup percentages)
        valid_amounts = [a for a in likely_line_item_amounts if a >= 100]

        if not valid_amounts:
            valid_amounts = likely_line_item_amounts

        line_item_amount = min(valid_amounts) if valid_amounts else None

        if line_item_amount and line_item_amount > 0:
            for rfi_num in rfi_matches:
                if '.' in rfi_num:
                    parts = rfi_num.split('.')
                    normalized = f"RFI-{int(parts[0])}.{parts[1]}"
                else:
                    normalized = f"RFI-{int(rfi_num)}"

                if should_debug:
                    print(f"  FOUND {normalized}: ${line_item_amount:,.2f} from item: {item[:60]}...")
                    print(f"    All amounts in item: {[f'${a:,.2f}' for a in parsed_amounts]}")

                rfi_costs[normalized] += line_item_amount

    return dict(rfi_costs)


def parse_csv_for_rfi_costs(csv_path: Path, debug: bool = False) -> dict:
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
        rfi_costs = extract_rfi_costs_from_description(description, debug=debug)

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


def manual_validate_rfi(csv_path: Path, project: str, rfi_num: str) -> list:
    """
    Manually search CSV for all mentions of an RFI and extract costs.
    Returns list of (row_index, amount, context) tuples.
    """
    df = pd.read_csv(csv_path, encoding='utf-8-sig')

    results = []

    # Normalize RFI number for search
    rfi_num_clean = rfi_num.replace('RFI-', '').replace('RFI', '')

    # Build search patterns
    patterns = [
        f'RFI {rfi_num_clean}',
        f'RFI-{rfi_num_clean}',
        f'RFI#{rfi_num_clean}',
        f'RFI{rfi_num_clean.zfill(4)}',  # RFI0054
        f'RFI-{rfi_num_clean.zfill(4)}',  # RFI-0054
    ]

    for idx, row in df.iterrows():
        if row['project'] != project:
            continue

        description = str(row.get('description', ''))

        # Check if this row mentions our RFI
        found = False
        for pattern in patterns:
            if pattern.lower() in description.lower():
                found = True
                break

        if not found:
            continue

        # Extract context around the RFI mention
        for pattern in patterns:
            match = re.search(rf'({re.escape(pattern)}[^C]{{0,200}})', description, re.IGNORECASE)
            if match:
                context = match.group(1)

                # Find amounts in this context
                amounts = re.findall(r'(\d{1,3}(?:,\d{3})*\.\d{2})', context)

                results.append({
                    'row': idx,
                    'pci_no': row.get('pci_no', ''),
                    'amounts': amounts,
                    'context': context[:150],
                    'full_desc_len': len(description),
                    'is_deduct': 'deduct' in context.lower() or 'defer' in context.lower() or 'credit' in context.lower(),
                    'is_allowance': 'allowance' in context.lower()
                })
                break

    return results


async def main():
    print("=" * 80)
    print("IMPORT CO AMOUNTS - V8 VALIDATED")
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

    # Manual validation of top 10 overall
    print("\n" + "=" * 80)
    print("MANUAL VALIDATION OF TOP 10 RFIs")
    print("=" * 80)

    # Flatten all RFIs with project info
    all_rfis = []
    for project, rfis in project_rfi_costs.items():
        for rfi, amt in rfis.items():
            all_rfis.append((project, rfi, amt))

    # Sort by amount descending
    all_rfis.sort(key=lambda x: x[2], reverse=True)

    print("\nTop 10 RFIs with manual validation:")
    for i, (project, rfi, extracted_amt) in enumerate(all_rfis[:10], 1):
        print(f"\n{i}. {rfi} @ {project}")
        print(f"   Extracted amount: ${extracted_amt:,.2f}")

        # Manual validation
        rfi_num = rfi.replace('RFI-', '')
        manual_results = manual_validate_rfi(CSV_PATH, project, rfi_num)

        print(f"   Manual search found {len(manual_results)} mentions:")
        manual_total = 0
        for result in manual_results:
            status = ""
            if result['is_deduct']:
                status = " [DEDUCT - should skip]"
            elif result['is_allowance']:
                status = " [ALLOWANCE - check if draw]"

            amounts_str = ', '.join([f"${a}" for a in result['amounts']]) if result['amounts'] else "no amounts"
            print(f"      PCI {result['pci_no']}: {amounts_str}{status}")
            print(f"         Context: {result['context'][:100]}...")

            # Sum non-deduct amounts (take first/smallest as line item)
            if not result['is_deduct'] and result['amounts']:
                amts = [float(a.replace(',', '')) for a in result['amounts']]
                # Filter round allowance amounts
                amts = [a for a in amts if not (a >= 100000 and (a % 10000 == 0 or a % 25000 == 0))]
                if amts:
                    manual_total += min(amts)

        print(f"   Manual total (smallest per mention, excl deducts): ${manual_total:,.2f}")

        match_status = "MATCH" if abs(extracted_amt - manual_total) < 1 else "MISMATCH"
        if match_status == "MISMATCH":
            diff = extracted_amt - manual_total
            print(f"   >>> {match_status}: Diff = ${diff:,.2f}")
        else:
            print(f"   >>> {match_status}")

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
        print("TOP 20 RFIs BY CO AMOUNT (after import)")
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

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
