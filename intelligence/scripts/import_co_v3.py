#!/usr/bin/env python3
"""
Import CO amounts from CSV - v3 with description parsing and deduplication.

Improvements over v2:
1. Searches BOTH rfi_reference column AND description column for RFI numbers
2. Handles various formats: "RFI 54", "RFI-54", "RFI #54", "RFI series 54", "RFIs 26.1, 44"
3. Sums up multiple COs that reference the same RFI
4. Shows detailed analysis of what was found in each column
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


def extract_rfi_numbers(text: str) -> list[str]:
    """
    Extract all RFI numbers from text.
    Handles various formats:
    - "RFI 54", "RFI-54", "RFI #54", "RFI#54"
    - "RFI series 54"
    - "RFIs 26.1, 44 and 9"
    - "per RFI 125"
    - "RFI-021" (with leading zeros)

    Returns normalized format like "RFI-54", "RFI-26.1"
    """
    if not text or pd.isna(text):
        return []

    text = str(text)
    rfis = []

    # Pattern 1: RFI followed by number (various separators)
    # Matches: RFI 54, RFI-54, RFI #54, RFI#54, RFI-021, RFI 76.1
    pattern1 = r'RFI[- #]*(\d+(?:\.\d+)?)'

    # Pattern 2: RFI series X
    pattern2 = r'RFI\s+series\s+(\d+(?:\.\d+)?)'

    # Find all matches
    for match in re.finditer(pattern1, text, re.IGNORECASE):
        rfi_num = match.group(1)
        # Normalize: remove leading zeros but keep decimal part
        if '.' in rfi_num:
            parts = rfi_num.split('.')
            normalized = f"RFI-{int(parts[0])}.{parts[1]}"
        else:
            normalized = f"RFI-{int(rfi_num)}"
        if normalized not in rfis:
            rfis.append(normalized)

    for match in re.finditer(pattern2, text, re.IGNORECASE):
        rfi_num = match.group(1)
        if '.' in rfi_num:
            parts = rfi_num.split('.')
            normalized = f"RFI-{int(parts[0])}.{parts[1]}"
        else:
            normalized = f"RFI-{int(rfi_num)}"
        if normalized not in rfis:
            rfis.append(normalized)

    return rfis


async def main():
    print("=" * 80)
    print("IMPORT CO AMOUNTS FROM CSV - V3 (Description Parsing + Aggregation)")
    print("=" * 80)

    # Load CSV
    df = pd.read_csv(CSV_PATH, encoding='utf-8-sig')
    print(f"Loaded {len(df)} rows from CSV")

    # Track sources of RFI references
    from_rfi_ref_col = 0
    from_description = 0

    # Extract and aggregate RFI-CO mappings
    # Key: (project, rfi_number) -> list of (amount, source, co_number)
    rfi_amounts = defaultdict(list)

    for idx, row in df.iterrows():
        project = row['project']

        # Parse amount - handle NaN and invalid values
        amount_raw = row.get('chosen_amount', 0)
        if pd.isna(amount_raw):
            continue

        amount_str = str(amount_raw).replace(',', '').replace('$', '').strip()
        try:
            amount = float(amount_str)
            if pd.isna(amount) or amount <= 0:
                continue
        except:
            continue

        co_number = row.get('pci_no', 'Unknown')

        # Track which RFIs we found from each source for this row
        rfis_from_ref = []
        rfis_from_desc = []

        # Source 1: rfi_reference column
        rfi_ref = row.get('rfi_reference', '')
        if rfi_ref and not pd.isna(rfi_ref):
            rfis_from_ref = extract_rfi_numbers(str(rfi_ref))

        # Source 2: description column
        description = row.get('description', '')
        if description and not pd.isna(description):
            rfis_from_desc = extract_rfi_numbers(str(description))

        # Combine unique RFIs from both sources
        all_rfis = set(rfis_from_ref + rfis_from_desc)

        # Track statistics
        if rfis_from_ref:
            from_rfi_ref_col += len(rfis_from_ref)
        if rfis_from_desc:
            # Count only those NOT also in rfi_reference
            unique_from_desc = set(rfis_from_desc) - set(rfis_from_ref)
            from_description += len(unique_from_desc)

        # Add to aggregation
        for rfi in all_rfis:
            source = []
            if rfi in rfis_from_ref:
                source.append('rfi_reference')
            if rfi in rfis_from_desc:
                source.append('description')

            rfi_amounts[(project, rfi)].append({
                'amount': amount,
                'source': '+'.join(source),
                'co_number': co_number
            })

    print(f"\nRFI references found:")
    print(f"  From rfi_reference column: {from_rfi_ref_col}")
    print(f"  Additional from description: {from_description}")
    print(f"  Unique (project, RFI) pairs: {len(rfi_amounts)}")

    # Show per-project stats with source breakdown
    by_project = defaultdict(lambda: {'rfis': [], 'from_ref': 0, 'from_desc': 0, 'multi_co': 0})

    for (project, rfi), entries in rfi_amounts.items():
        total = sum(e['amount'] for e in entries)
        by_project[project]['rfis'].append((rfi, total, len(entries)))

        # Track sources
        for e in entries:
            if 'rfi_reference' in e['source']:
                by_project[project]['from_ref'] += 1
            if 'description' in e['source'] and 'rfi_reference' not in e['source']:
                by_project[project]['from_desc'] += 1

        if len(entries) > 1:
            by_project[project]['multi_co'] += 1

    print("\n" + "=" * 80)
    print("PER-PROJECT ANALYSIS")
    print("=" * 80)

    for project in sorted(by_project.keys()):
        data = by_project[project]
        total_amount = sum(a for _, a, _ in data['rfis'])
        print(f"\n{project}:")
        print(f"  Unique RFIs: {len(data['rfis'])}")
        print(f"  From rfi_reference: {data['from_ref']}")
        print(f"  From description only: {data['from_desc']}")
        print(f"  RFIs with multiple COs: {data['multi_co']}")
        print(f"  Total CO amount: ${total_amount:,.0f}")

    # Connect to database
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Get ALL RFIs from database
        db_rfis = await conn.fetch("""
            SELECT id, source_ref, source_project_name
            FROM intelligence.items
        """)

        print(f"\nDatabase has {len(db_rfis)} total RFIs")

        # Create lookup with multiple format variants
        db_lookup = {}
        for rfi in db_rfis:
            key = (rfi['source_project_name'], rfi['source_ref'])
            db_lookup[key] = rfi

        # Clear existing CO amounts first
        await conn.execute("UPDATE intelligence.items SET cost_impact = NULL WHERE cost_impact IS NOT NULL")
        print("Cleared existing cost_impact values")

        # Match and update
        matched = 0
        total_amount = 0
        unmatched = []
        multi_co_examples = []

        for (project, rfi_num), entries in rfi_amounts.items():
            # Calculate total amount for this RFI
            total_rfi_amount = sum(e['amount'] for e in entries)

            # Generate format variants to try
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

                    # Update cost_impact with SUMMED amount AND set resulted_in_co = true
                    await conn.execute("""
                        UPDATE intelligence.items
                        SET cost_impact = $1, resulted_in_co = true
                        WHERE id = $2
                    """, Decimal(str(total_rfi_amount)), db_rfi['id'])

                    matched += 1
                    total_amount += total_rfi_amount
                    found = True

                    # Track multi-CO examples
                    if len(entries) > 1:
                        multi_co_examples.append({
                            'project': project,
                            'rfi': rfi_num,
                            'total': total_rfi_amount,
                            'cos': entries
                        })
                    break

            if not found:
                unmatched.append({
                    'project': project,
                    'rfi': rfi_num,
                    'amount': total_rfi_amount,
                    'num_cos': len(entries),
                    'tried': variants
                })

        print(f"\n{'='*80}")
        print(f"RESULTS")
        print(f"{'='*80}")
        print(f"Matched: {matched} RFIs")
        print(f"Total CO imported: ${total_amount:,.0f}")
        print(f"Unmatched: {len(unmatched)} RFIs")
        print(f"RFIs with multiple COs: {len(multi_co_examples)}")

        # Show examples of RFIs with multiple COs
        if multi_co_examples:
            print(f"\n{'='*80}")
            print(f"EXAMPLES: RFIs WITH MULTIPLE COs (showing first 10)")
            print(f"{'='*80}")

            for ex in sorted(multi_co_examples, key=lambda x: x['total'], reverse=True)[:10]:
                print(f"\n{ex['project']}: {ex['rfi']} - Total: ${ex['total']:,.0f}")
                for co in ex['cos']:
                    print(f"    {co['co_number']}: ${co['amount']:,.0f} (from {co['source']})")

        # Show per-project results
        print("\n" + "=" * 80)
        print("UPDATED AMOUNTS BY PROJECT")
        print("=" * 80)

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

        # Show unmatched (first 30)
        if unmatched:
            print("\n" + "=" * 80)
            print(f"UNMATCHED (first 30 of {len(unmatched)})")
            print("=" * 80)

            # Sort by amount
            unmatched.sort(key=lambda x: x['amount'], reverse=True)
            for item in unmatched[:30]:
                multi = f" ({item['num_cos']} COs)" if item['num_cos'] > 1 else ""
                print(f"  {item['project']}: {item['rfi']} = ${item['amount']:,.0f}{multi}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
