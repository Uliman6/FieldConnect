#!/usr/bin/env python3
"""
Import CO amounts from CO Log PDFs into the database.
Maps RFI numbers to change order amounts.
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
import pdfplumber

LL_DATA_DIR = Path(r"C:\Users\uluck\LL Data")

# Project name mapping (folder name -> database project name)
PROJECT_MAP = {
    "Abbott Alameda Office TI": "Abbott Alameda Office TI",
    "CoreSite Data Center": "CoreSite Data Center",
    "Intuitive Surgical MOB": "Intuitive Surgical MOB",
    "Silicon Valley Office": "Silicon Valley Office",
    "Southline Office": "Southline Office",
}


def extract_rfi_amounts_from_pdf(pdf_path: Path) -> list[dict]:
    """Extract RFI numbers and amounts from a CO Log PDF."""
    rfi_amounts = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            # Extract tables
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if not row:
                        continue

                    row_text = ' '.join([str(c) if c else '' for c in row])

                    # Find RFI number
                    rfi_match = re.search(r'RFI[- #]?(\d+(?:\.\d+)?)', row_text, re.IGNORECASE)
                    if not rfi_match:
                        continue

                    rfi_num = rfi_match.group(1)

                    # Find amounts - look for dollar values
                    # The "Approved Amt" column is typically what we want
                    amounts = []
                    for cell in row:
                        if cell:
                            cell_str = str(cell).replace(',', '').strip()
                            # Match numeric values that look like amounts
                            if re.match(r'^\d+\.?\d*$', cell_str):
                                try:
                                    val = float(cell_str)
                                    if val > 0:  # Ignore zero values
                                        amounts.append(val)
                                except:
                                    pass

                    if amounts:
                        # Take the largest amount (usually Approved Amt)
                        max_amount = max(amounts)
                        rfi_amounts.append({
                            'rfi_number': f"RFI-{rfi_num}",
                            'amount': max_amount,
                            'row_text': row_text[:100]
                        })

            # Also extract from text (catches items not in clean table format)
            text = page.extract_text()
            if text:
                # Pattern: RFI XX ... amount
                for match in re.finditer(
                    r'RFI[- #]?(\d+(?:\.\d+)?)[^\d]*?([\d,]+\.\d{2})',
                    text,
                    re.IGNORECASE
                ):
                    rfi_num = match.group(1)
                    amount_str = match.group(2).replace(',', '')
                    try:
                        amount = float(amount_str)
                        if amount > 100:  # Filter out tiny values
                            # Check if we already have this RFI
                            existing = [r for r in rfi_amounts if r['rfi_number'] == f"RFI-{rfi_num}"]
                            if not existing:
                                rfi_amounts.append({
                                    'rfi_number': f"RFI-{rfi_num}",
                                    'amount': amount,
                                    'row_text': match.group(0)[:100]
                                })
                    except:
                        pass

    return rfi_amounts


def normalize_rfi_number(rfi_num: str) -> str:
    """Normalize RFI number format to match database."""
    # Remove leading zeros and standardize format
    match = re.match(r'RFI-?(\d+(?:\.\d+)?)', rfi_num, re.IGNORECASE)
    if match:
        num = match.group(1)
        # Handle decimal RFI numbers (e.g., 76.1)
        if '.' in num:
            parts = num.split('.')
            return f"RFI-{int(parts[0])}.{parts[1]}"
        else:
            return f"RFI-{int(num)}"
    return rfi_num


async def main():
    print("=" * 70)
    print("IMPORT CO AMOUNTS FROM PDF LOGS")
    print("=" * 70)

    # Find all CO Log PDFs
    co_logs = []
    for project_dir in LL_DATA_DIR.iterdir():
        if project_dir.is_dir():
            co_log_dir = project_dir / "CO Log"
            if co_log_dir.exists():
                for pdf_file in co_log_dir.glob("*.pdf"):
                    project_name = PROJECT_MAP.get(project_dir.name, project_dir.name)
                    co_logs.append({
                        'path': pdf_file,
                        'project': project_name,
                        'folder': project_dir.name
                    })

    print(f"\nFound {len(co_logs)} CO Log PDFs:")
    for log in co_logs:
        print(f"  {log['project']}: {log['path'].name}")

    # Extract RFI amounts from each PDF
    all_rfi_amounts = []

    for log in co_logs:
        print(f"\nProcessing {log['project']}...")
        rfi_amounts = extract_rfi_amounts_from_pdf(log['path'])

        for ra in rfi_amounts:
            ra['project'] = log['project']
            # Normalize RFI number
            ra['rfi_number'] = normalize_rfi_number(ra['rfi_number'])

        print(f"  Found {len(rfi_amounts)} RFI-CO mappings")
        all_rfi_amounts.extend(rfi_amounts)

        # Show sample
        for ra in rfi_amounts[:5]:
            print(f"    {ra['rfi_number']}: ${ra['amount']:,.2f}")

    print(f"\n{'='*70}")
    print(f"TOTAL: {len(all_rfi_amounts)} RFI-CO mappings found")
    print("=" * 70)

    # Connect to database and update
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Get all RFIs from database to match
        db_rfis = await conn.fetch("""
            SELECT id, source_ref, source_project_name, cost_impact
            FROM intelligence.items
            WHERE resulted_in_co = true
        """)

        print(f"\nDatabase has {len(db_rfis)} RFIs marked as resulted_in_co")

        # Create lookup by project + RFI number
        db_lookup = {}
        for rfi in db_rfis:
            key = (rfi['source_project_name'], rfi['source_ref'])
            db_lookup[key] = rfi

        # Match and update
        matched = 0
        updated = 0
        total_amount = 0

        for ra in all_rfi_amounts:
            key = (ra['project'], ra['rfi_number'])
            if key in db_lookup:
                matched += 1
                db_rfi = db_lookup[key]

                # Update cost_impact
                await conn.execute("""
                    UPDATE intelligence.items
                    SET cost_impact = $1
                    WHERE id = $2
                """, Decimal(str(ra['amount'])), db_rfi['id'])

                updated += 1
                total_amount += ra['amount']

        print(f"\nMatched {matched} RFIs")
        print(f"Updated {updated} records with cost_impact")
        print(f"Total CO amount: ${total_amount:,.2f}")

        # Show distribution by project
        print("\n" + "=" * 70)
        print("UPDATED AMOUNTS BY PROJECT")
        print("=" * 70)

        project_totals = await conn.fetch("""
            SELECT source_project_name,
                   COUNT(*) as count,
                   SUM(cost_impact) as total,
                   AVG(cost_impact) as avg
            FROM intelligence.items
            WHERE cost_impact > 0
            GROUP BY source_project_name
            ORDER BY total DESC
        """)

        for p in project_totals:
            print(f"  {p['source_project_name']}")
            print(f"    Count: {p['count']}, Total: ${float(p['total'] or 0):,.2f}, Avg: ${float(p['avg'] or 0):,.2f}")

        # Show unmatched RFIs
        print("\n" + "=" * 70)
        print("UNMATCHED RFI-CO MAPPINGS (first 20)")
        print("=" * 70)

        unmatched = []
        for ra in all_rfi_amounts:
            key = (ra['project'], ra['rfi_number'])
            if key not in db_lookup:
                unmatched.append(ra)

        for ra in unmatched[:20]:
            print(f"  {ra['project']}: {ra['rfi_number']} = ${ra['amount']:,.2f}")

        if len(unmatched) > 20:
            print(f"  ... and {len(unmatched) - 20} more")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
