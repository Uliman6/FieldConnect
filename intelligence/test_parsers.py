"""
Test the PDF parsers with actual data from the LL Data folder.
"""

import sys
import os
import logging

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from ingestion.parsers import (
    parse_rfi_pdf,
    parse_issue_pdf,
    scan_project_folder,
    scan_all_projects
)
from ingestion.normalizer import normalize

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


def test_single_rfi():
    """Test parsing a single RFI PDF."""
    print("\n" + "="*60)
    print("TEST: Single RFI Parsing")
    print("="*60)

    pdf_path = r"C:\Users\uluck\LL Data\Abbott Alameda Office TI\RFIs\1 - Abbott Alameda 1420 HBP - Door Hardware Confirmation\1 - Abbott Alameda 1420 HBP - Door Hardware Confirmation.pdf"

    result = parse_rfi_pdf(pdf_path, "abbott-alameda", "Abbott Alameda Office TI")

    if result:
        print(f"\n[OK] Parsed RFI successfully!")
        print(f"  Source Ref: {result['source_ref']}")
        print(f"  Date: {result['item_date']}")
        print(f"  Raw Text (first 200 chars): {result['raw_text'][:200]}...")
        print(f"  Resolution: {result['resolution_text'][:100] if result['resolution_text'] else 'None'}...")
        print(f"  Metadata: {list(result['metadata'].keys())}")

        # Test normalization
        norm_result = normalize(result['raw_text'])
        print(f"\n  Normalized (first 200 chars): {norm_result['normalized_text'][:200]}...")
        if norm_result['replacements']:
            print(f"  Replacements: {norm_result['replacements'][:3]}")
    else:
        print("[ERROR] Failed to parse RFI")


def test_single_issue():
    """Test parsing a single Issue/Punch List PDF."""
    print("\n" + "="*60)
    print("TEST: Single Issue/Punch List Parsing")
    print("="*60)

    pdf_path = r"C:\Users\uluck\LL Data\Abbott Alameda Office TI\Issues\Closed\100 - Punch List\100 - Punch List.pdf"

    result = parse_issue_pdf(pdf_path, "abbott-alameda", "Abbott Alameda Office TI")

    if result:
        print(f"\n[OK] Parsed Issue successfully!")
        print(f"  Source Ref: {result['source_ref']}")
        print(f"  Date: {result['item_date']}")
        print(f"  Raw Text: {result['raw_text']}")
        print(f"  Trade: {result['trade_category']}")
        print(f"  Metadata: {result['metadata']}")
    else:
        print("[ERROR] Failed to parse Issue")


def test_scan_project():
    """Test scanning an entire project folder."""
    print("\n" + "="*60)
    print("TEST: Scan Project Folder")
    print("="*60)

    project_folder = r"C:\Users\uluck\LL Data\Abbott Alameda Office TI"
    items = scan_project_folder(project_folder, "abbott-alameda", "Abbott Alameda Office TI")

    print(f"\n[OK] Found {len(items)} items in project")

    # Count by type
    rfis = [i for i in items if i['source_type'] == 'rfi']
    punch_lists = [i for i in items if i['source_type'] == 'punch_list']

    print(f"  RFIs: {len(rfis)}")
    print(f"  Punch Lists: {len(punch_lists)}")

    # Show sample of each
    if rfis:
        print(f"\n  Sample RFI: {rfis[0]['source_ref']} - {rfis[0]['raw_text'][:80]}...")
    if punch_lists:
        print(f"  Sample Punch: {punch_lists[0]['source_ref']} - {punch_lists[0]['raw_text'][:80]}...")


def test_scan_all_projects():
    """Test scanning all projects."""
    print("\n" + "="*60)
    print("TEST: Scan All Projects")
    print("="*60)

    data_folder = r"C:\Users\uluck\LL Data"
    company_id = "test-company"

    items = scan_all_projects(data_folder, company_id)

    print(f"\n[OK] Total items across all projects: {len(items)}")

    # Group by project
    projects = {}
    for item in items:
        proj = item['source_project_name']
        if proj not in projects:
            projects[proj] = {'rfi': 0, 'punch_list': 0}
        projects[proj][item['source_type']] += 1

    print("\nBreakdown by project:")
    for proj, counts in sorted(projects.items()):
        print(f"  {proj}: {counts['rfi']} RFIs, {counts['punch_list']} punch lists")


if __name__ == "__main__":
    print("FieldConnect Intelligence - Parser Tests")
    print("========================================")

    test_single_rfi()
    test_single_issue()
    test_scan_project()
    test_scan_all_projects()

    print("\n" + "="*60)
    print("All tests completed!")
    print("="*60)
