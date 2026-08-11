#!/usr/bin/env python3
"""Debug RFI-615 extraction."""

import pandas as pd
import re
from pathlib import Path
from collections import defaultdict

CSV_PATH = Path(r"C:\Users\uluck\OneDrive\Masaüstü\Stanford\Entrepreneurship\Lessons Learned\co_logs_all_projects.csv")


def extract_rfi_costs_from_description(description: str, verbose: bool = False) -> dict:
    if not description or pd.isna(description):
        return {}

    description = str(description)
    rfi_costs = defaultdict(float)

    # Split by common line item delimiters
    line_items = re.split(r'(?=C[TQC][WO]?-?\d{3,4}\s|OCW-\d{3}\s)', description)

    for item in line_items:
        if not item.strip():
            continue

        item_lower = item.lower()

        if 'defer' in item_lower or 'deduct' in item_lower or 'credit' in item_lower:
            if verbose and '615' in item:
                print(f"    SKIPPED (deduct/credit): {item[:100]}")
            continue

        if 'allowance draw' in item_lower or 'allowance usage' in item_lower:
            continue

        if re.search(r'allowance\s*-\s*rfi', item_lower) or re.search(r'allowance\s+draw', item_lower):
            continue

        rfi_matches = re.findall(r'RFI[- #]*(\d+(?:\.\d+)?)', item, re.IGNORECASE)

        if not rfi_matches:
            continue

        amounts_with_sign = re.findall(r'(-?\d{1,3}(?:,\d{3})*\.\d{2})', item)

        if not amounts_with_sign:
            continue

        parsed_amounts = []
        for amt_str in amounts_with_sign:
            try:
                amt = float(amt_str.replace(',', ''))
                if amt >= 10:  # Filter version numbers
                    parsed_amounts.append(amt)
            except:
                pass

        if not parsed_amounts:
            continue

        positive_amounts = [a for a in parsed_amounts if a > 0]
        if not positive_amounts:
            continue

        likely_line_item_amounts = []
        for amt in positive_amounts:
            if amt >= 100000:
                if amt % 10000 == 0 or amt % 25000 == 0:
                    continue
            likely_line_item_amounts.append(amt)

        if not likely_line_item_amounts:
            continue

        line_item_amount = min(likely_line_item_amounts)

        if line_item_amount and line_item_amount > 0:
            for rfi_num in rfi_matches:
                if '.' in rfi_num:
                    parts = rfi_num.split('.')
                    normalized = f'RFI-{int(parts[0])}.{parts[1]}'
                else:
                    normalized = f'RFI-{int(rfi_num)}'

                if verbose:
                    print(f"    Found {normalized}: ${line_item_amount:,.2f} from item: {item[:80]}...")

                rfi_costs[normalized] += line_item_amount

    return dict(rfi_costs)


def main():
    df = pd.read_csv(CSV_PATH, encoding='utf-8-sig')

    print('Processing all Southline Office rows for RFI-615')
    print('=' * 80)

    total_615 = 0.0
    project_costs = defaultdict(lambda: defaultdict(float))

    for idx, row in df.iterrows():
        project = row['project']
        description = str(row.get('description', ''))

        # Check if 615 is mentioned in a Southline row
        is_615_row = project == 'Southline Office' and '615' in description and 'RFI' in description.upper()

        costs = extract_rfi_costs_from_description(description, verbose=is_615_row)

        for rfi, amt in costs.items():
            project_costs[project][rfi] += amt

        if is_615_row and 'RFI-615' in costs:
            print(f"\nRow {idx}, PCI: {row.get('pci_no', '')}")
            print(f"  Added: ${costs['RFI-615']:,.2f}")
            total_615 += costs['RFI-615']

    print(f"\n{'='*80}")
    print(f"TOTAL RFI-615 from trace: ${total_615:,.2f}")
    print(f"{'='*80}")

    # Check what's in project_costs for RFI-615
    print(f"\nRFI-615 in project_costs: ${project_costs['Southline Office'].get('RFI-615', 0):,.2f}")

    # Check other 600-series RFIs
    print("\nAll 600-series RFIs in Southline:")
    for rfi, amt in sorted(project_costs['Southline Office'].items()):
        if rfi.startswith('RFI-6') and len(rfi.split('-')[1]) == 3:
            print(f"  {rfi}: ${amt:,.2f}")


if __name__ == "__main__":
    main()
