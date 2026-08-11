#!/usr/bin/env python3
"""Debug script to trace RFI extraction - v2 with more detail."""

import pandas as pd
import re
from pathlib import Path
from collections import defaultdict

CSV_PATH = Path(r"C:\Users\uluck\OneDrive\Masaüstü\Stanford\Entrepreneurship\Lessons Learned\co_logs_all_projects.csv")

def trace_rfi(rfi_num: str, project_filter: str = None):
    """Trace extraction for a specific RFI."""

    df = pd.read_csv(CSV_PATH, encoding='utf-8-sig')

    print(f"TRACING RFI-{rfi_num} EXTRACTION")
    print("=" * 80)

    rfi_total = 0.0
    mentions = 0

    for idx, row in df.iterrows():
        if project_filter and row['project'] != project_filter:
            continue

        description = str(row.get('description', ''))

        # Check if this RFI is mentioned at all
        patterns = [f"RFI {rfi_num}", f"RFI-{rfi_num}", f"RFI{rfi_num.zfill(4)}"]
        if not any(p.lower() in description.lower() for p in patterns):
            continue

        # Split by line item codes
        line_items = re.split(r'(?=C[TQC][WO]?-?\d{3,4}\s|OCW-\d{3}\s)', description)

        for item in line_items:
            if not item.strip():
                continue

            item_lower = item.lower()

            # Skip deducts
            if 'defer' in item_lower or 'deduct' in item_lower or 'credit' in item_lower:
                continue

            # Skip allowance draws
            if 'allowance draw' in item_lower or 'allowance usage' in item_lower:
                continue

            # Find RFI references - include the full match to see the context
            rfi_matches = re.findall(r'(RFI[- #]*\d+(?:\.\d+)?)', item, re.IGNORECASE)
            rfi_nums_only = re.findall(r'RFI[- #]*(\d+(?:\.\d+)?)', item, re.IGNORECASE)

            if rfi_num not in rfi_nums_only:
                continue

            mentions += 1
            print(f"\nMention #{mentions} - Row {idx}, PCI: {row.get('pci_no', '')}:")
            print(f"  RFI references found: {rfi_matches}")
            print(f"  Line item (full): {item[:400]}")

            # Extract amounts - IMPROVED: require at least 2 digits before decimal
            # This filters out version numbers like "4.09"
            amounts_with_sign = re.findall(r'(-?\d{2,3}(?:,\d{3})*\.\d{2})', item)
            print(f"  Amounts (2+ digits before decimal): {amounts_with_sign}")

            # Parse amounts
            parsed_amounts = []
            for amt_str in amounts_with_sign:
                try:
                    amt = float(amt_str.replace(',', ''))
                    parsed_amounts.append(amt)
                except:
                    pass

            # Filter
            positive_amounts = [a for a in parsed_amounts if a > 0]

            # Filter round numbers (likely cumulative totals)
            likely_line_item_amounts = []
            for amt in positive_amounts:
                if amt >= 100000:
                    if amt % 10000 == 0 or amt % 25000 == 0:
                        print(f"    SKIPPING round: ${amt:,.0f}")
                        continue
                likely_line_item_amounts.append(amt)

            # Also skip amounts under $100 (probably not line items)
            valid_amounts = [a for a in likely_line_item_amounts if a >= 100]
            if not valid_amounts:
                valid_amounts = likely_line_item_amounts

            if valid_amounts:
                line_amt = min(valid_amounts)
                print(f"  -> SELECTED (min): ${line_amt:,.2f}")
                rfi_total += line_amt
            else:
                print(f"  -> NO VALID AMOUNTS")

    print("\n" + "=" * 80)
    print(f"TOTAL FOR RFI-{rfi_num}: ${rfi_total:,.2f} ({mentions} mentions)")
    print("=" * 80)

    return rfi_total


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        rfi = sys.argv[1]
        project = sys.argv[2] if len(sys.argv) > 2 else None
        trace_rfi(rfi, project)
    else:
        # Default: trace the top problematic RFIs
        print("\n")
        trace_rfi("1674", "Southline Office")
