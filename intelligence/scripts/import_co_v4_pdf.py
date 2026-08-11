#!/usr/bin/env python3
"""
Import CO amounts from PDF files - v4 with PDF parsing for issued AND un-issued items.

This script:
1. Parses CO log PDFs directly (not just CSV export)
2. Captures BOTH issued change orders AND un-issued potential change items
3. Differentiates between issued vs pending/ROM/approved
4. If same RFI appears in both, issued amounts override
5. Sums multiple COs per RFI
"""

import asyncio
import os
import sys
import re
from pathlib import Path
from decimal import Decimal
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg

# Try to import PDF parsing libraries
try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False
    print("WARNING: pdfplumber not installed. Run: pip install pdfplumber")

try:
    import PyPDF2
    HAS_PYPDF2 = True
except ImportError:
    HAS_PYPDF2 = False


# Project CO log paths (verified actual paths)
CO_LOG_PATHS = {
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
    status: str  # 'issued', 'approved', 'pending', 'rom'
    description: str = ""
    pci_no: str = ""

    @property
    def is_issued(self) -> bool:
        return self.status == 'issued'


@dataclass
class ProjectRFICosts:
    """All RFI costs for a project."""
    project: str
    issued: dict = field(default_factory=dict)  # rfi_number -> list of RFICost
    unissued: dict = field(default_factory=dict)  # rfi_number -> list of RFICost

    def add_cost(self, cost: RFICost):
        if cost.is_issued:
            if cost.rfi_number not in self.issued:
                self.issued[cost.rfi_number] = []
            self.issued[cost.rfi_number].append(cost)
        else:
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
    if not text:
        return []

    rfis = []

    # Pattern: RFI followed by number (various formats)
    # RFI 54, RFI-54, RFI #54, RFI-021, RFI 76.1, RFI-039
    pattern = r'RFI[- #]*(\d+(?:\.\d+)?)'

    for match in re.finditer(pattern, str(text), re.IGNORECASE):
        rfi_num = match.group(1)
        # Normalize
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

    # Remove common formatting
    cleaned = str(amount_str).replace(',', '').replace('$', '').replace('(', '-').replace(')', '').strip()

    try:
        return float(cleaned)
    except:
        return 0.0


def parse_co_log_pdf(pdf_path: Path, project: str) -> ProjectRFICosts:
    """Parse a CO log PDF and extract all RFI costs."""
    result = ProjectRFICosts(project=project)

    if not pdf_path.exists():
        print(f"  WARNING: PDF not found: {pdf_path}")
        return result

    if not HAS_PDFPLUMBER:
        print(f"  ERROR: pdfplumber not installed, cannot parse {pdf_path.name}")
        return result

    try:
        with pdfplumber.open(pdf_path) as pdf:
            full_text = ""
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text += text + "\n"

            # Parse the text to find RFI references
            lines = full_text.split('\n')

            in_unissued_section = False
            current_pci = ""

            for i, line in enumerate(lines):
                # Detect section headers
                if "Outstanding Un-issued Potential Change" in line:
                    in_unissued_section = True
                    continue
                elif "Total Issued Subcontract Change Orders" in line:
                    in_unissued_section = False
                    continue
                elif "SCO No." in line and "PCI No." in line:
                    in_unissued_section = False
                    continue

                # Extract RFI references from the line
                rfis = extract_rfi_numbers(line)

                if not rfis:
                    continue

                # Try to extract amount from the line
                # Look for patterns like: $26,385.00 or 26,385.00 or amounts at end of line
                amount_patterns = [
                    r'\$?([\d,]+\.?\d*)\s*$',  # Amount at end
                    r'(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s+\d{2}/\d{2}/\d{4}',  # Amount before date
                    r'Approved Amt[:\s]*([\d,]+\.?\d*)',  # Approved amount
                    r'Pending Amt[:\s]*([\d,]+\.?\d*)',  # Pending amount
                    r'ROM Amt[:\s]*([\d,]+\.?\d*)',  # ROM amount
                ]

                amount = 0.0
                status = 'issued'

                if in_unissued_section:
                    # Try to parse unissued line format
                    # Format: PCI No. | Description | Cost Code | ROM Amt | Pending Amt | Approved Amt
                    parts = line.split()

                    # Look for amounts in the line
                    amounts_found = re.findall(r'-?[\d,]+\.\d{2}', line)

                    if amounts_found:
                        # Take the largest positive amount as the relevant one
                        parsed_amounts = [parse_amount(a) for a in amounts_found]
                        positive_amounts = [a for a in parsed_amounts if a > 0]
                        if positive_amounts:
                            amount = max(positive_amounts)

                    # Determine status based on position/context
                    if 'Approved' in line or 'approved' in line.lower():
                        status = 'approved'
                    elif 'Pending' in line or 'pending' in line.lower():
                        status = 'pending'
                    elif 'ROM' in line:
                        status = 'rom'
                    else:
                        status = 'pending'  # Default for unissued
                else:
                    # Issued section - look for amount
                    amounts_found = re.findall(r'-?[\d,]+\.\d{2}', line)
                    if amounts_found:
                        parsed_amounts = [parse_amount(a) for a in amounts_found]
                        positive_amounts = [a for a in parsed_amounts if a > 0]
                        if positive_amounts:
                            amount = max(positive_amounts)
                    status = 'issued'

                # Add costs for each RFI found
                for rfi in rfis:
                    if amount > 0:
                        cost = RFICost(
                            rfi_number=rfi,
                            amount=amount,
                            status=status,
                            description=line[:100],
                            pci_no=current_pci
                        )
                        result.add_cost(cost)

    except Exception as e:
        print(f"  ERROR parsing {pdf_path.name}: {e}")

    return result


def parse_co_log_pdf_tables(pdf_path: Path, project: str) -> ProjectRFICosts:
    """Parse CO log PDF using table extraction for better accuracy."""
    result = ProjectRFICosts(project=project)

    if not pdf_path.exists():
        print(f"  WARNING: PDF not found: {pdf_path}")
        return result

    if not HAS_PDFPLUMBER:
        print(f"  ERROR: pdfplumber not installed")
        return result

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                # Try to extract tables
                tables = page.extract_tables()

                for table in tables:
                    if not table:
                        continue

                    # Check if this is an unissued section table
                    header_row = table[0] if table else []
                    is_unissued_table = any('ROM' in str(cell) or 'Pending' in str(cell) or 'Approved' in str(cell)
                                           for cell in header_row if cell)

                    for row in table[1:]:  # Skip header
                        if not row:
                            continue

                        # Convert row to string for RFI extraction
                        row_text = ' '.join(str(cell) for cell in row if cell)
                        rfis = extract_rfi_numbers(row_text)

                        if not rfis:
                            continue

                        # Extract amounts from row
                        amounts = []
                        for cell in row:
                            if cell:
                                amt = parse_amount(str(cell))
                                if amt != 0:
                                    amounts.append(amt)

                        # Get the relevant amount (largest positive)
                        positive_amounts = [a for a in amounts if a > 0]
                        amount = max(positive_amounts) if positive_amounts else 0

                        if amount > 0:
                            status = 'pending' if is_unissued_table else 'issued'

                            for rfi in rfis:
                                cost = RFICost(
                                    rfi_number=rfi,
                                    amount=amount,
                                    status=status,
                                    description=row_text[:100]
                                )
                                result.add_cost(cost)

                # Also extract from plain text for items not in tables
                text = page.extract_text()
                if text:
                    in_unissued = False
                    for line in text.split('\n'):
                        if "Outstanding Un-issued" in line:
                            in_unissued = True
                        elif "Total Issued Subcontract" in line:
                            in_unissued = False

                        rfis = extract_rfi_numbers(line)
                        if rfis:
                            amounts = re.findall(r'([\d,]+\.\d{2})', line)
                            if amounts:
                                parsed = [parse_amount(a) for a in amounts]
                                positive = [p for p in parsed if p > 0]
                                if positive:
                                    amount = max(positive)
                                    status = 'pending' if in_unissued else 'issued'

                                    for rfi in rfis:
                                        # Check if we already have this from table parsing
                                        existing = result.issued.get(rfi, []) + result.unissued.get(rfi, [])
                                        if not any(c.amount == amount for c in existing):
                                            cost = RFICost(
                                                rfi_number=rfi,
                                                amount=amount,
                                                status=status,
                                                description=line[:100]
                                            )
                                            result.add_cost(cost)

    except Exception as e:
        print(f"  ERROR parsing {pdf_path.name}: {e}")
        import traceback
        traceback.print_exc()

    return result


async def main():
    print("=" * 80)
    print("IMPORT CO AMOUNTS FROM PDFs - V4 (Issued + Un-issued)")
    print("=" * 80)

    if not HAS_PDFPLUMBER:
        print("\nERROR: pdfplumber is required. Installing...")
        os.system("pip install pdfplumber")
        print("Please re-run the script after installation.")
        return

    # Parse all CO log PDFs
    all_project_costs = {}

    print("\nParsing CO log PDFs...")
    for project, pdf_path in CO_LOG_PATHS.items():
        print(f"\n{project}:")
        print(f"  Path: {pdf_path}")

        if pdf_path.exists():
            costs = parse_co_log_pdf_tables(pdf_path, project)
            all_project_costs[project] = costs

            final = costs.get_final_amounts()
            issued_count = len(costs.issued)
            unissued_count = len(costs.unissued)

            print(f"  Issued RFIs: {issued_count}")
            print(f"  Un-issued RFIs: {unissued_count}")
            print(f"  Final unique RFIs: {len(final)}")

            if final:
                total = sum(v['amount'] for v in final.values())
                print(f"  Total CO amount: ${total:,.0f}")
        else:
            print(f"  FILE NOT FOUND")

    # Connect to database
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # Get all RFIs from database
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

        # Clear existing CO amounts
        await conn.execute("UPDATE intelligence.items SET cost_impact = NULL WHERE cost_impact IS NOT NULL")
        print("Cleared existing cost_impact values")

        # Match and update
        matched_issued = 0
        matched_unissued = 0
        total_amount = 0
        unmatched = []

        for project, costs in all_project_costs.items():
            final_amounts = costs.get_final_amounts()

            for rfi_num, data in final_amounts.items():
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
        print(f"RESULTS")
        print(f"{'='*80}")
        print(f"Matched (issued): {matched_issued} RFIs")
        print(f"Matched (un-issued): {matched_unissued} RFIs")
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
