#!/usr/bin/env python3
"""Detailed trace of RFI-1674 to find all costs."""

import pandas as pd
import re
from pathlib import Path

CSV_PATH = Path(r"C:\Users\uluck\OneDrive\Masaüstü\Stanford\Entrepreneurship\Lessons Learned\co_logs_all_projects.csv")

def main():
    df = pd.read_csv(CSV_PATH, encoding='utf-8-sig')

    print("DETAILED TRACE OF RFI-1674")
    print("=" * 100)

    total = 0.0
    all_line_items = []

    for idx, row in df.iterrows():
        if row['project'] != 'Southline Office':
            continue

        description = str(row.get('description', ''))

        # Check if 1674 is mentioned
        if '1674' not in description:
            continue

        print(f"\n{'='*100}")
        print(f"ROW {idx}, PCI: {row.get('pci_no', '')}, Chosen Amount: {row.get('chosen_amount', '')}")
        print(f"{'='*100}")

        # Split into line items with the fixed pattern
        line_items = re.split(r'(?=C[TQC][WO]?-?\d{3,4}(?:\.\d+)?\s|OCW-\d{3}\s)', description)

        print(f"Total line items in this row: {len(line_items)}")

        for i, item in enumerate(line_items):
            if not item.strip():
                continue

            # Check if this line item mentions RFI 1674
            rfi_matches = re.findall(r'RFI[- #]*(\d+(?:\.\d+)?)', item, re.IGNORECASE)

            if '1674' not in rfi_matches:
                continue

            item_lower = item.lower()

            # Check for skips
            skip_reason = None
            if 'defer' in item_lower or 'deduct' in item_lower or 'credit' in item_lower:
                skip_reason = "DEDUCT/CREDIT"
            elif 'allowance draw' in item_lower:
                skip_reason = "ALLOWANCE DRAW"

            # Extract amounts
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

            # Filter round amounts
            filtered = []
            skipped_round = []
            for a in positive:
                if a >= 100000 and (a % 10000 == 0 or a % 25000 == 0):
                    skipped_round.append(a)
                    continue
                filtered.append(a)

            selected = min(filtered) if filtered else None

            print(f"\n  Line Item {i}:")
            print(f"    Text: {item[:200]}...")
            print(f"    RFI matches: {rfi_matches}")
            print(f"    All amounts: {amounts}")
            print(f"    Positive amounts: {[f'${a:,.2f}' for a in positive]}")
            if skipped_round:
                print(f"    Skipped (round): {[f'${a:,.2f}' for a in skipped_round]}")
            print(f"    Filtered amounts: {[f'${a:,.2f}' for a in filtered]}")

            if skip_reason:
                print(f"    >>> SKIPPED: {skip_reason}")
            elif selected:
                print(f"    >>> SELECTED: ${selected:,.2f}")
                total += selected
                all_line_items.append({
                    'row': idx,
                    'pci': row.get('pci_no', ''),
                    'amount': selected,
                    'text': item[:100]
                })
            else:
                print(f"    >>> NO VALID AMOUNT")

    print("\n" + "=" * 100)
    print("SUMMARY")
    print("=" * 100)
    print(f"\nTotal line items found: {len(all_line_items)}")
    print(f"Total amount: ${total:,.2f}")

    print("\nBreakdown:")
    for item in all_line_items:
        print(f"  Row {item['row']}, PCI {item['pci']}: ${item['amount']:,.2f}")
        print(f"    {item['text']}")


if __name__ == "__main__":
    main()
