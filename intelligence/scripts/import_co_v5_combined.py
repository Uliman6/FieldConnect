#!/usr/bin/env python3
"""
Import CO amounts - v5 Combined (CSV + PDF parsing).

This script combines the best of v3 (CSV parsing) and v4 (PDF parsing):
1. Parses CSV for issued change orders (most reliable source)
2. Parses PDFs for un-issued potential change items
3. Merges with issued amounts taking priority over un-issued
4. Sums multiple COs that reference the same RFI
"""

import asyncio
import os
import sys
import re
from pathlib import Path
from decimal import Decimal
from collections import defaultdict
from dataclasses import dataclass, field

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg
import pandas as pd

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False
    print("WARNING: pdfplumber not installed. Run: pip install pdfplumber")

# CSV path (from v3)
CSV_PATH = Path(r"C:\Users\uluck\OneDrive\Masaüstü\Stanford\Entrepreneurship\Lessons Learned\co_logs_all_projects.csv")

# PDF paths for un-issued items
CO_LOG_PDFS = {
    "Intuitive Surgical MOB": Path(r"C:\Users\uluck\LL Data\Intuitive Surgical MOB\CO Log\Intuitive Surgical CO log.pdf"),
    "CoreSite Data Center": Path(r"C:\Users\uluck\LL Data\CoreSite Data Center\CO Log\CoreSite CO Log.pdf"),
    "Southline Office": Path(r"C:\Users\uluck\LL Data\Southline Office\CO Log\Soutline Office CO Log.pdf"),
    "Silicon Valley Office": Path(r"C:\Users\uluck\LL Data\Silicon Valley Office\CO Log\Sub CO log.pdf"),
    "Abbott Alameda Office TI": Path(r"C:\Users\uluck\LL Data\Abbott Alameda Office TI\CO Log\Abbott Alameda CO Log.pdf"),
}


@dataclass
class RFICost:
    """Represents a cost associated with an RFI."""
    rfi_number: str
    amount: float
    status: str  # 'issued', 'approved', 'pending', 'rom', 'unissued'
    description: str = ""
    source: str = ""  # 'csv' or 'pdf'


@dataclass
class ProjectRFICosts:
    """All RFI costs for a project."""
    project: str
    issued: dict = field(default_factory=dict)  # rfi_number -> list of RFICost
    unissued: dict = field(default_factory=dict)  # rfi_number -> list of RFICost

    def add_issued(self, cost: RFICost):
        """Add an issued cost."""
        if cost.rfi_number not in self.issued:
            self.issued[cost.rfi_number] = []
        self.issued[cost.rfi_number].append(cost)

    def add_unissued(self, cost: RFICost):
        """Add an un-issued cost."""
        if cost.rfi_number not in self.unissued:
            self.unissued[cost.rfi_number] = []
        self.unissued[cost.rfi_number].append(cost)

    def get_final_amounts(self) -> dict:
        """Get final amounts with issued taking priority over unissued."""
        result = {}

        # First add all unissued
        for rfi, costs in self.unissued.items():
            total = sum(c.amount for c in costs if c.amount > 0)
            if total > 0:
                result[rfi] = {
                    'amount': total,
                    'status': 'unissued',
                    'costs': costs
                }

        # Then override with issued (takes priority)
        for rfi, costs in self.issued.items():
            total = sum(c.amount for c in costs if c.amount > 0)
            if total > 0:
                result[rfi] = {
                    'amount': total,
                    'status': 'issued',
                    'costs': costs
                }

        return result


def extract_rfi_numbers(text: str) -> list[str]:
    """Extract all RFI numbers from text."""
    if not text or pd.isna(text):
        return []

    text = str(text)
    rfis = []

    # Pattern 1: RFI followed by number (various separators)
    pattern1 = r'RFI[- #]*(\d+(?:\.\d+)?)'
    # Pattern 2: RFI series X
    pattern2 = r'RFI\s+series\s+(\d+(?:\.\d+)?)'

    for match in re.finditer(pattern1, text, re.IGNORECASE):
        rfi_num = match.group(1)
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


def parse_amount(amount_str: str) -> float:
    """Parse amount string to float."""
    if not amount_str:
        return 0.0

    cleaned = str(amount_str).replace(',', '').replace('$', '').replace('(', '-').replace(')', '').strip()

    try:
        return float(cleaned)
    except:
        return 0.0


def parse_csv_for_issued(csv_path: Path) -> dict:
    """Parse CSV for all issued change orders. Returns dict of project -> ProjectRFICosts."""
    results = {}

    df = pd.read_csv(csv_path, encoding='utf-8-sig')
    print(f"Loaded {len(df)} rows from CSV")

    for idx, row in df.iterrows():
        project = row['project']

        if project not in results:
            results[project] = ProjectRFICosts(project=project)

        # Parse amount
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

        # Extract RFIs from both rfi_reference and description columns
        rfis = set()

        rfi_ref = row.get('rfi_reference', '')
        if rfi_ref and not pd.isna(rfi_ref):
            rfis.update(extract_rfi_numbers(str(rfi_ref)))

        description = row.get('description', '')
        if description and not pd.isna(description):
            rfis.update(extract_rfi_numbers(str(description)))

        # Add costs
        for rfi in rfis:
            cost = RFICost(
                rfi_number=rfi,
                amount=amount,
                status='issued',
                description=str(description)[:100] if description else '',
                source='csv'
            )
            results[project].add_issued(cost)

    return results


def parse_pdf_for_unissued(pdf_path: Path, project: str) -> list[RFICost]:
    """Parse PDF for un-issued potential change items."""
    unissued_costs = []

    if not pdf_path.exists():
        print(f"  WARNING: PDF not found: {pdf_path}")
        return unissued_costs

    if not HAS_PDFPLUMBER:
        return unissued_costs

    try:
        with pdfplumber.open(pdf_path) as pdf:
            in_unissued_section = False

            for page in pdf.pages:
                text = page.extract_text()
                if not text:
                    continue

                lines = text.split('\n')

                for line in lines:
                    # Detect section headers
                    line_lower = line.lower()
                    if "outstanding un-issued" in line_lower or "un-issued potential change" in line_lower:
                        in_unissued_section = True
                        continue
                    elif "total issued subcontract" in line_lower or "sco no." in line_lower:
                        in_unissued_section = False
                        continue

                    # Only process un-issued section
                    if not in_unissued_section:
                        continue

                    # Extract RFI references
                    rfis = extract_rfi_numbers(line)
                    if not rfis:
                        continue

                    # Extract amounts
                    amounts_found = re.findall(r'-?[\d,]+\.\d{2}', line)
                    if amounts_found:
                        parsed = [parse_amount(a) for a in amounts_found]
                        positive = [p for p in parsed if p > 0]
                        if positive:
                            amount = max(positive)

                            # Determine status
                            if 'approved' in line_lower:
                                status = 'approved'
                            elif 'rom' in line_lower:
                                status = 'rom'
                            else:
                                status = 'pending'

                            for rfi in rfis:
                                cost = RFICost(
                                    rfi_number=rfi,
                                    amount=amount,
                                    status=status,
                                    description=line[:100],
                                    source='pdf'
                                )
                                unissued_costs.append(cost)

                # Also check tables for un-issued items
                tables = page.extract_tables()
                for table in tables:
                    if not table:
                        continue

                    header_row = table[0] if table else []
                    is_unissued_table = any(
                        'ROM' in str(cell) or 'Pending' in str(cell) or 'Approved' in str(cell)
                        for cell in header_row if cell
                    )

                    if not is_unissued_table:
                        continue

                    for row in table[1:]:
                        if not row:
                            continue

                        row_text = ' '.join(str(cell) for cell in row if cell)
                        rfis = extract_rfi_numbers(row_text)

                        if not rfis:
                            continue

                        # Extract amounts from row
                        amounts = []
                        for cell in row:
                            if cell:
                                amt = parse_amount(str(cell))
                                if amt > 0:
                                    amounts.append(amt)

                        if amounts:
                            amount = max(amounts)

                            for rfi in rfis:
                                # Check if we already have this (avoid duplicates)
                                existing = [c for c in unissued_costs if c.rfi_number == rfi and c.amount == amount]
                                if not existing:
                                    cost = RFICost(
                                        rfi_number=rfi,
                                        amount=amount,
                                        status='pending',
                                        description=row_text[:100],
                                        source='pdf'
                                    )
                                    unissued_costs.append(cost)

    except Exception as e:
        print(f"  ERROR parsing {pdf_path.name}: {e}")

    return unissued_costs


async def main():
    print("=" * 80)
    print("IMPORT CO AMOUNTS - V5 COMBINED (CSV + PDF)")
    print("=" * 80)

    # Step 1: Parse CSV for issued items
    print("\n" + "=" * 80)
    print("STEP 1: PARSING CSV FOR ISSUED CHANGE ORDERS")
    print("=" * 80)

    project_costs = parse_csv_for_issued(CSV_PATH)

    csv_stats = {}
    for project, costs in project_costs.items():
        issued_rfis = len(costs.issued)
        total = sum(sum(c.amount for c in cost_list) for cost_list in costs.issued.values())
        csv_stats[project] = {'rfis': issued_rfis, 'total': total}
        print(f"  {project}: {issued_rfis} RFIs, ${total:,.0f}")

    # Step 2: Parse PDFs for un-issued items
    print("\n" + "=" * 80)
    print("STEP 2: PARSING PDFs FOR UN-ISSUED POTENTIAL CHANGE ITEMS")
    print("=" * 80)

    for project, pdf_path in CO_LOG_PDFS.items():
        print(f"\n{project}:")
        print(f"  Path: {pdf_path}")

        if not pdf_path.exists():
            print(f"  FILE NOT FOUND")
            continue

        unissued = parse_pdf_for_unissued(pdf_path, project)
        print(f"  Un-issued items found: {len(unissued)}")

        if project not in project_costs:
            project_costs[project] = ProjectRFICosts(project=project)

        # Add un-issued costs
        for cost in unissued:
            project_costs[project].add_unissued(cost)

        # Show unique un-issued RFIs
        unique_unissued = set(c.rfi_number for c in unissued)
        print(f"  Unique un-issued RFIs: {len(unique_unissued)}")

        # Show how many are NEW (not in issued)
        new_rfis = unique_unissued - set(project_costs[project].issued.keys())
        print(f"  NEW RFIs (not in issued): {len(new_rfis)}")

        if new_rfis:
            total_new = sum(c.amount for c in unissued if c.rfi_number in new_rfis)
            print(f"  Total un-issued amount (new RFIs only): ${total_new:,.0f}")

    # Step 3: Summarize combined results
    print("\n" + "=" * 80)
    print("STEP 3: COMBINED RESULTS")
    print("=" * 80)

    for project, costs in sorted(project_costs.items()):
        final = costs.get_final_amounts()

        issued_only = sum(1 for v in final.values() if v['status'] == 'issued')
        unissued_only = sum(1 for v in final.values() if v['status'] == 'unissued')
        total_amount = sum(v['amount'] for v in final.values())

        print(f"\n{project}:")
        print(f"  Total unique RFIs: {len(final)}")
        print(f"    From issued (CSV): {issued_only}")
        print(f"    From un-issued only (PDF): {unissued_only}")
        print(f"  Total CO amount: ${total_amount:,.0f}")

    # Step 4: Import to database
    print("\n" + "=" * 80)
    print("STEP 4: IMPORTING TO DATABASE")
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
        matched_issued = 0
        matched_unissued = 0
        total_amount = 0
        unmatched = []

        for project, costs in project_costs.items():
            final = costs.get_final_amounts()

            for rfi_num, data in final.items():
                amount = data['amount']
                status = data['status']

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

                        if status == 'issued':
                            matched_issued += 1
                        else:
                            matched_unissued += 1
                        total_amount += amount
                        found = True
                        break

                if not found:
                    unmatched.append({
                        'project': project,
                        'rfi': rfi_num,
                        'amount': amount,
                        'status': status
                    })

        print(f"\n{'='*80}")
        print(f"FINAL RESULTS")
        print(f"{'='*80}")
        print(f"Matched (from issued/CSV): {matched_issued} RFIs")
        print(f"Matched (from un-issued/PDF): {matched_unissued} RFIs")
        print(f"Total matched: {matched_issued + matched_unissued} RFIs")
        print(f"Total CO imported: ${total_amount:,.0f}")
        print(f"Unmatched: {len(unmatched)} RFIs")

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

        # Show unmatched
        if unmatched:
            print("\n" + "=" * 80)
            print(f"UNMATCHED (first 30 of {len(unmatched)})")
            print("=" * 80)

            unmatched.sort(key=lambda x: x['amount'], reverse=True)
            for item in unmatched[:30]:
                status_tag = "[ISSUED]" if item['status'] == 'issued' else f"[{item['status'].upper()}]"
                print(f"  {item['project']}: {item['rfi']} = ${item['amount']:,.0f} {status_tag}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
