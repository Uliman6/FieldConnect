#!/usr/bin/env python3
"""
Import CO amounts - v9 Final.

FIXES from v8:
- Fixed amount regex to properly capture full amounts (was incorrectly parsing 1,051,977 as 051,977)
- Filter out version numbers like "4.09" (amounts under $10)
- Skip allowance draws
- Skip round cumulative totals
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

    Returns dict of {rfi_number: amount}
    """
    if not description or pd.isna(description):
        return {}

    description = str(description)
    rfi_costs = defaultdict(float)

    # Split by common line item delimiters (the CT/CQ/CC/OCW codes that start new items)
    # Include .X suffix format like CQ0024.1
    line_items = re.split(r'(?=C[TQC][WO]?-?\d{3,4}(?:\.\d+)?\s|OCW-\d{3}\s)', description)

    for item in line_items:
        if not item.strip():
            continue

        item_lower = item.lower()

        # Skip deducts/defers
        if 'defer' in item_lower or 'deduct' in item_lower or 'credit' in item_lower:
            continue

        # Skip allowance draws - these are draws against allowances, not actual RFI costs
        if 'allowance draw' in item_lower or 'allowance usage' in item_lower:
            continue

        # Skip items that are primarily allowance tracking
        if re.search(r'allowance\s*-\s*rfi', item_lower) or re.search(r'allowance\s+draw', item_lower):
            continue

        # Find RFI references in this line item
        rfi_matches = re.findall(r'RFI[- #]*(\d+(?:\.\d+)?)', item, re.IGNORECASE)

        if not rfi_matches:
            continue

        # Extract amounts - properly capture all digits including leading millions
        # Pattern: optional negative, 1-3 digits, then optional groups of comma + 3 digits, then decimal + 2 digits
        amounts_with_sign = re.findall(r'(-?\d{1,3}(?:,\d{3})*\.\d{2})', item)

        if not amounts_with_sign:
            continue

        # Parse amounts
        parsed_amounts = []
        for amt_str in amounts_with_sign:
            try:
                amt = float(amt_str.replace(',', ''))
                # Filter out version numbers (amounts under $10)
                if amt >= 10:
                    parsed_amounts.append(amt)
            except:
                pass

        if not parsed_amounts:
            continue

        # If ALL amounts in this line item are negative, skip it (it's a deduct)
        positive_amounts = [a for a in parsed_amounts if a > 0]
        if not positive_amounts:
            continue

        # Filter out likely cumulative totals (round numbers over 100K)
        likely_line_item_amounts = []
        for amt in positive_amounts:
            if amt >= 100000:
                # Skip "round" numbers (divisible by 10000 or 25000)
                if amt % 10000 == 0 or amt % 25000 == 0:
                    continue
            likely_line_item_amounts.append(amt)

        if not likely_line_item_amounts:
            continue

        # Take the SMALLEST valid amount as the line item cost
        # (larger amounts are often cumulative running totals)
        line_item_amount = min(likely_line_item_amounts)

        if line_item_amount and line_item_amount > 0:
            # Use SET to avoid counting same RFI multiple times in same line item
            unique_rfis = set()
            for rfi_num in rfi_matches:
                if '.' in rfi_num:
                    parts = rfi_num.split('.')
                    normalized = f"RFI-{int(parts[0])}.{parts[1]}"
                else:
                    normalized = f"RFI-{int(rfi_num)}"
                unique_rfis.add(normalized)

            for normalized in unique_rfis:
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


def manual_validate_rfi(csv_path: Path, project: str, rfi_num: str) -> tuple:
    """
    Manually search CSV for all mentions of an RFI and calculate total.
    Returns (total_cost, list_of_line_items)
    """
    df = pd.read_csv(csv_path, encoding='utf-8-sig')

    # Normalize RFI number for search
    rfi_num_clean = rfi_num.replace('RFI-', '').replace('RFI', '')

    # Build search patterns
    patterns = [
        f'RFI {rfi_num_clean}',
        f'RFI-{rfi_num_clean}',
        f'RFI#{rfi_num_clean}',
        f'RFI{rfi_num_clean.zfill(4)}',
        f'RFI-{rfi_num_clean.zfill(4)}',
        f'RFI- {rfi_num_clean}',  # Handle "RFI- 1674" format
    ]

    total = 0.0
    line_items = []

    for idx, row in df.iterrows():
        if row['project'] != project:
            continue

        description = str(row.get('description', ''))

        # Check if this row mentions our RFI
        if not any(p.lower() in description.lower() for p in patterns):
            continue

        # Split into line items (include .X suffix format like CQ0024.1)
        items = re.split(r'(?=C[TQC][WO]?-?\d{3,4}(?:\.\d+)?\s|OCW-\d{3}\s)', description)

        for item in items:
            if not item.strip():
                continue

            item_lower = item.lower()

            # Skip deducts
            if 'defer' in item_lower or 'deduct' in item_lower or 'credit' in item_lower:
                continue

            # Skip allowance draws
            if 'allowance draw' in item_lower:
                continue

            # Check if this specific line item mentions the RFI
            rfi_nums = re.findall(r'RFI[- #]*(\d+(?:\.\d+)?)', item, re.IGNORECASE)
            if rfi_num_clean not in rfi_nums:
                continue

            # Extract amounts (filter version numbers < $10)
            amounts = re.findall(r'(-?\d{1,3}(?:,\d{3})*\.\d{2})', item)
            parsed = []
            for a in amounts:
                try:
                    val = float(a.replace(',', ''))
                    if val >= 10:  # Skip version numbers
                        parsed.append(val)
                except:
                    pass

            positive = [a for a in parsed if a > 0]

            # Filter round cumulative amounts
            filtered = []
            for a in positive:
                if a >= 100000 and (a % 10000 == 0 or a % 25000 == 0):
                    continue
                filtered.append(a)

            if filtered:
                amt = min(filtered)
                total += amt
                line_items.append({
                    'row': idx,
                    'pci': row.get('pci_no', ''),
                    'amount': amt,
                    'desc': item[:100]
                })

    return total, line_items


async def main():
    print("=" * 80)
    print("IMPORT CO AMOUNTS - V9 FINAL")
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

    validation_results = []
    print("\nTop 10 RFIs with manual validation:")

    for i, (project, rfi, extracted_amt) in enumerate(all_rfis[:10], 1):
        rfi_num = rfi.replace('RFI-', '')
        manual_total, line_items = manual_validate_rfi(CSV_PATH, project, rfi_num)

        match = abs(extracted_amt - manual_total) < 1
        status = "MATCH" if match else "MISMATCH"

        validation_results.append({
            'rank': i,
            'rfi': rfi,
            'project': project,
            'extracted': extracted_amt,
            'manual': manual_total,
            'match': match,
            'line_items': len(line_items)
        })

        print(f"\n{i}. {rfi} @ {project}")
        print(f"   Extracted: ${extracted_amt:,.2f}")
        print(f"   Manual:    ${manual_total:,.2f}")
        print(f"   Status:    {status}")
        print(f"   Line items: {len(line_items)}")

        if not match:
            print(f"   Difference: ${abs(extracted_amt - manual_total):,.2f}")

    # Summary
    matches = sum(1 for r in validation_results if r['match'])
    print(f"\n{'='*80}")
    print(f"VALIDATION SUMMARY: {matches}/10 matches")
    print("=" * 80)

    # Import to database only if validation is good
    if matches < 8:
        print("\n WARNING: Less than 8/10 matches. Review extraction logic before importing.")
        print("Skipping database import.")
        return

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

        # Verify known RFIs
        print("\n" + "=" * 80)
        print("VERIFICATION OF KEY RFIs")
        print("=" * 80)

        test_rfis = [
            ('CoreSite Data Center', 'RFI-54'),
            ('CoreSite Data Center', 'RFI-125'),
            ('Silicon Valley Office', 'RFI-145'),
        ]

        for project, rfi_ref in test_rfis:
            rfi = await conn.fetchrow("""
                SELECT source_ref, cost_impact
                FROM intelligence.items
                WHERE source_project_name = $1 AND source_ref = $2
            """, project, rfi_ref)
            if rfi:
                cost = float(rfi['cost_impact']) if rfi['cost_impact'] else 0
                print(f"  {rfi_ref} @ {project}: ${cost:,.2f}")
            else:
                print(f"  {rfi_ref} @ {project}: NOT FOUND")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
