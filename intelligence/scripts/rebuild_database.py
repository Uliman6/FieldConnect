#!/usr/bin/env python3
"""
Rebuild intelligence.items database from source RFI data and CO logs.

This script:
1. Clears existing items
2. Imports all RFIs from rfis_llm_enriched.csv
3. Applies CO costs using validated extraction logic
"""

import asyncio
import os
import sys
import re
import uuid
from pathlib import Path
from decimal import Decimal
from collections import defaultdict
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg
import pandas as pd
import json

# Source data paths
RFI_CSV_PATH = Path(r"C:\Users\uluck\OneDrive\Masaüstü\Stanford\Entrepreneurship\Lessons Learned\rfis_llm_enriched.csv")
CO_CSV_PATH = Path(r"C:\Users\uluck\OneDrive\Masaüstü\Stanford\Entrepreneurship\Lessons Learned\co_logs_all_projects.csv")

# Company ID (from existing data)
COMPANY_ID = "00000000-0000-0000-0000-000000000001"


def normalize_rfi_id(rfi_id, project_name: str) -> str:
    """Normalize RFI ID to standard format like RFI-0125 or RFI-1674."""
    if pd.isna(rfi_id):
        return None

    # Convert to string and clean
    rfi_str = str(rfi_id).strip()

    # Remove .0 suffix from float conversion
    if rfi_str.endswith('.0'):
        rfi_str = rfi_str[:-2]

    # Handle decimal RFIs like "125.1"
    if '.' in rfi_str:
        parts = rfi_str.split('.')
        base = int(float(parts[0]))
        decimal = parts[1]
        # Southline uses 4-digit format, others use variable
        if project_name == 'Southline Office':
            return f"RFI-{base:04d}.{decimal}"
        else:
            return f"RFI-{base}.{decimal}"
    else:
        base = int(float(rfi_str))
        if project_name == 'Southline Office':
            return f"RFI-{base:04d}"
        else:
            return f"RFI-{base}"


def parse_date(date_str):
    """Parse date string to date object."""
    if pd.isna(date_str) or not date_str:
        return None

    date_str = str(date_str).strip()

    # Try various formats
    formats = [
        '%Y-%m-%d',
        '%m/%d/%Y',
        '%m/%d/%y',
        '%Y-%m-%d %H:%M:%S',
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue

    return None


def extract_rfi_costs_from_description(description: str) -> dict:
    """
    Parse CO description to extract individual RFI costs.
    Returns dict of {rfi_number: amount}
    """
    if not description or pd.isna(description):
        return {}

    description = str(description)
    rfi_costs = defaultdict(float)

    # Split by line item codes (include .X suffix format like CQ0024.1)
    line_items = re.split(r'(?=C[TQC][WO]?-?\d{3,4}(?:\.\d+)?\s|OCW-\d{3}\s)', description)

    for item in line_items:
        if not item.strip():
            continue

        item_lower = item.lower()

        # Skip deducts/defers
        if 'defer' in item_lower or 'deduct' in item_lower or 'credit' in item_lower:
            continue

        # Skip allowance draws
        if 'allowance draw' in item_lower or 'allowance usage' in item_lower:
            continue

        if re.search(r'allowance\s*-\s*rfi', item_lower) or re.search(r'allowance\s+draw', item_lower):
            continue

        # Find RFI references
        rfi_matches = re.findall(r'RFI[- #]*(\d+(?:\.\d+)?)', item, re.IGNORECASE)

        if not rfi_matches:
            continue

        # Extract amounts
        amounts_with_sign = re.findall(r'(-?\d{1,3}(?:,\d{3})*\.\d{2})', item)

        if not amounts_with_sign:
            continue

        # Parse amounts (filter version numbers < $10)
        parsed_amounts = []
        for amt_str in amounts_with_sign:
            try:
                amt = float(amt_str.replace(',', ''))
                if amt >= 10:
                    parsed_amounts.append(amt)
            except:
                pass

        if not parsed_amounts:
            continue

        # Filter to positive amounts only
        positive_amounts = [a for a in parsed_amounts if a > 0]
        if not positive_amounts:
            continue

        # Filter out round cumulative totals (100K, 250K, 500K, etc.)
        likely_line_item_amounts = []
        for amt in positive_amounts:
            if amt >= 100000:
                if amt % 10000 == 0 or amt % 25000 == 0:
                    continue
            likely_line_item_amounts.append(amt)

        if not likely_line_item_amounts:
            continue

        # Take smallest as line item cost
        line_item_amount = min(likely_line_item_amounts)

        if line_item_amount and line_item_amount > 0:
            # Use SET to avoid counting same RFI multiple times
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


def parse_co_csv_for_costs(csv_path: Path) -> dict:
    """Parse CO CSV and extract RFI-specific costs."""
    df = pd.read_csv(csv_path, encoding='utf-8-sig')
    print(f"Loaded {len(df)} rows from CO CSV")

    project_rfi_costs = defaultdict(lambda: defaultdict(float))

    for idx, row in df.iterrows():
        project = row['project']
        description = row.get('description', '')

        rfi_costs = extract_rfi_costs_from_description(description)

        for rfi, amount in rfi_costs.items():
            project_rfi_costs[project][rfi] += amount

    return dict(project_rfi_costs)


async def main():
    print("=" * 80)
    print("REBUILD INTELLIGENCE DATABASE")
    print("=" * 80)

    # Load RFI data
    print("\n" + "=" * 80)
    print("STEP 1: LOADING RFI DATA")
    print("=" * 80)

    rfi_df = pd.read_csv(RFI_CSV_PATH, encoding='utf-8-sig')
    print(f"Loaded {len(rfi_df)} RFIs from CSV")

    # Parse CO costs
    print("\n" + "=" * 80)
    print("STEP 2: PARSING CO COSTS")
    print("=" * 80)

    project_rfi_costs = parse_co_csv_for_costs(CO_CSV_PATH)

    total_cos = sum(len(rfis) for rfis in project_rfi_costs.values())
    total_cost = sum(sum(rfis.values()) for rfis in project_rfi_costs.values())
    print(f"Found costs for {total_cos} RFIs totaling ${total_cost:,.0f}")

    # Connect to database
    print("\n" + "=" * 80)
    print("STEP 3: CONNECTING TO DATABASE")
    print("=" * 80)

    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Use hardcoded company_id
        company_id = uuid.UUID(COMPANY_ID)
        print(f"Using company_id: {company_id}")

        # Clear existing items
        print("\n" + "=" * 80)
        print("STEP 4: CLEARING EXISTING DATA")
        print("=" * 80)

        deleted = await conn.execute("DELETE FROM intelligence.items")
        print(f"Deleted existing items: {deleted}")

        # Import RFIs
        print("\n" + "=" * 80)
        print("STEP 5: IMPORTING RFIs")
        print("=" * 80)

        imported = 0
        skipped = 0
        costs_applied = 0

        for idx, row in rfi_df.iterrows():
            project_name = row['project_name']
            rfi_id = row['rfi_id']

            # Normalize RFI ID
            source_ref = normalize_rfi_id(rfi_id, project_name)
            if not source_ref:
                skipped += 1
                continue

            # Build raw_text from available fields
            raw_text_parts = []
            if pd.notna(row.get('rfi_title')):
                raw_text_parts.append(f"Title: {row['rfi_title']}")
            if pd.notna(row.get('question_text')):
                raw_text_parts.append(f"Question: {row['question_text']}")
            if pd.notna(row.get('official_response_text')):
                raw_text_parts.append(f"Response: {row['official_response_text']}")

            raw_text = "\n\n".join(raw_text_parts) if raw_text_parts else "No description available"

            # Parse dates
            item_date = parse_date(row.get('created_on_date'))

            # Get CO cost if available
            cost_impact = None
            resulted_in_co = False

            if project_name in project_rfi_costs:
                # Try different formats for matching
                rfi_num = source_ref.replace('RFI-', '')

                # Try exact match first
                if source_ref in project_rfi_costs[project_name]:
                    cost_impact = Decimal(str(project_rfi_costs[project_name][source_ref]))
                    resulted_in_co = True
                    costs_applied += 1
                else:
                    # Try without leading zeros
                    base_num = rfi_num.split('.')[0].lstrip('0') or '0'
                    decimal_part = rfi_num.split('.')[1] if '.' in rfi_num else None

                    for fmt in [f"RFI-{base_num}", f"RFI-{int(base_num)}"]:
                        if decimal_part:
                            fmt = f"{fmt}.{decimal_part}"
                        if fmt in project_rfi_costs[project_name]:
                            cost_impact = Decimal(str(project_rfi_costs[project_name][fmt]))
                            resulted_in_co = True
                            costs_applied += 1
                            break

            # Build metadata
            metadata = {}
            if pd.notna(row.get('llm_cause')):
                metadata['llm_cause'] = row['llm_cause']
            if pd.notna(row.get('llm_system')):
                metadata['llm_system'] = row['llm_system']
            if pd.notna(row.get('llm_confidence')):
                metadata['llm_confidence'] = row['llm_confidence']
            if pd.notna(row.get('llm_tags')):
                metadata['llm_tags'] = row['llm_tags']
            if pd.notna(row.get('rfi_file')):
                metadata['rfi_file'] = row['rfi_file']

            # Insert
            await conn.execute("""
                INSERT INTO intelligence.items (
                    id, company_id, source_project_id, source_project_name,
                    source_type, source_ref, raw_text, question_text,
                    item_date, trade_category, issue_type,
                    cost_impact, resulted_in_co,
                    abstracted_summary, metadata,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW()
                )
            """,
                uuid.uuid4(),
                company_id,
                project_name,  # source_project_id
                project_name,  # source_project_name
                'rfi',
                source_ref,
                raw_text,
                str(row.get('question_text', '')) if pd.notna(row.get('question_text')) else None,
                item_date,
                str(row.get('discipline', '')) if pd.notna(row.get('discipline')) else None,
                str(row.get('category', '')) if pd.notna(row.get('category')) else None,
                cost_impact,
                resulted_in_co,
                str(row.get('llm_summary', '')) if pd.notna(row.get('llm_summary')) else None,
                json.dumps(metadata) if metadata else None,
            )

            imported += 1

            if imported % 500 == 0:
                print(f"  Imported {imported} RFIs...")

        print(f"\nImported: {imported} RFIs")
        print(f"Skipped: {skipped}")
        print(f"Costs applied: {costs_applied}")

        # Create placeholder records for missing RFIs with CO costs
        print("\n" + "=" * 80)
        print("STEP 5b: CREATING PLACEHOLDERS FOR MISSING RFIs WITH CO COSTS")
        print("=" * 80)

        placeholders_created = 0
        for project_name, rfi_costs in project_rfi_costs.items():
            for rfi_ref, amount in rfi_costs.items():
                if amount <= 0:
                    continue

                # Check if this RFI exists in database
                existing = await conn.fetchrow("""
                    SELECT id FROM intelligence.items
                    WHERE source_project_name = $1 AND source_ref = $2
                """, project_name, rfi_ref)

                if not existing:
                    # Also try alternate formats
                    rfi_num = rfi_ref.replace('RFI-', '')
                    base_num = rfi_num.split('.')[0].lstrip('0') or '0'

                    alt_formats = [
                        f"RFI-{int(base_num):04d}",
                        f"RFI-{int(base_num)}",
                    ]
                    if '.' in rfi_num:
                        decimal = rfi_num.split('.')[1]
                        alt_formats = [
                            f"RFI-{int(base_num):04d}.{decimal}",
                            f"RFI-{int(base_num)}.{decimal}",
                        ]

                    found = False
                    for alt in alt_formats:
                        existing = await conn.fetchrow("""
                            SELECT id FROM intelligence.items
                            WHERE source_project_name = $1 AND source_ref = $2
                        """, project_name, alt)
                        if existing:
                            # Update with cost
                            await conn.execute("""
                                UPDATE intelligence.items
                                SET cost_impact = $1, resulted_in_co = true
                                WHERE id = $2
                            """, Decimal(str(amount)), existing['id'])
                            found = True
                            break

                    if not found:
                        # Create placeholder
                        source_ref_normalized = f"RFI-{int(base_num)}"
                        if '.' in rfi_num:
                            source_ref_normalized = f"RFI-{int(base_num)}.{rfi_num.split('.')[1]}"

                        await conn.execute("""
                            INSERT INTO intelligence.items (
                                id, company_id, source_project_id, source_project_name,
                                source_type, source_ref, raw_text,
                                cost_impact, resulted_in_co,
                                created_at, updated_at
                            ) VALUES (
                                $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
                            )
                        """,
                            uuid.uuid4(),
                            company_id,
                            project_name,
                            project_name,
                            'rfi',
                            source_ref_normalized,
                            f"RFI referenced in Change Order log but source document not available. Cost impact: ${amount:,.2f}",
                            Decimal(str(amount)),
                            True,
                        )
                        placeholders_created += 1

        print(f"Created {placeholders_created} placeholder records for missing RFIs")

        # Verify
        print("\n" + "=" * 80)
        print("STEP 6: VERIFICATION")
        print("=" * 80)

        # Count by project
        counts = await conn.fetch("""
            SELECT source_project_name, COUNT(*) as count,
                   COUNT(cost_impact) as with_cost,
                   SUM(cost_impact) as total_cost
            FROM intelligence.items
            GROUP BY source_project_name
            ORDER BY source_project_name
        """)

        print("\nRFIs by project:")
        for row in counts:
            cost = float(row['total_cost']) if row['total_cost'] else 0
            print(f"  {row['source_project_name']}: {row['count']} RFIs, {row['with_cost']} with costs, ${cost:,.0f}")

        # Top 20 by cost
        print("\n" + "=" * 80)
        print("TOP 20 RFIs BY COST")
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

        # Verify specific RFIs
        print("\n" + "=" * 80)
        print("VERIFICATION OF KEY RFIs")
        print("=" * 80)

        test_rfis = [
            ('CoreSite Data Center', 'RFI-125'),
            ('CoreSite Data Center', 'RFI-54'),
            ('Silicon Valley Office', 'RFI-145'),
            ('Southline Office', 'RFI-1674'),
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
                # Try alternate format
                alt_ref = rfi_ref.replace('RFI-', 'RFI-0') if len(rfi_ref.split('-')[1]) < 4 else rfi_ref
                rfi = await conn.fetchrow("""
                    SELECT source_ref, cost_impact
                    FROM intelligence.items
                    WHERE source_project_name = $1 AND source_ref LIKE $2
                """, project, f"%{rfi_ref.split('-')[1]}%")
                if rfi:
                    cost = float(rfi['cost_impact']) if rfi['cost_impact'] else 0
                    print(f"  {rfi['source_ref']} @ {project}: ${cost:,.2f}")
                else:
                    print(f"  {rfi_ref} @ {project}: NOT FOUND")

        # Total stats
        stats = await conn.fetchrow("""
            SELECT COUNT(*) as total,
                   COUNT(cost_impact) as with_cost,
                   SUM(cost_impact) as total_cost
            FROM intelligence.items
        """)

        print(f"\n{'='*80}")
        print(f"FINAL STATS")
        print(f"{'='*80}")
        print(f"Total RFIs: {stats['total']}")
        print(f"RFIs with cost impact: {stats['with_cost']}")
        print(f"Total cost impact: ${float(stats['total_cost']) if stats['total_cost'] else 0:,.0f}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
