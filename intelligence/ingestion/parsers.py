"""
PDF parsers for Autodesk Construction Cloud (ACC) exports.
Handles RFIs and Issues (Punch Lists) from ACC PDF exports.
"""

import re
import os
from pathlib import Path
from datetime import datetime
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract all text from a PDF file using PyMuPDF."""
    import fitz  # PyMuPDF

    text_parts = []
    try:
        doc = fitz.open(pdf_path)
        for page in doc:
            text_parts.append(page.get_text())
        doc.close()
    except Exception as e:
        logger.error(f"Error extracting text from {pdf_path}: {e}")
        return ""

    return "\n".join(text_parts)


def parse_date(date_str: str) -> Optional[str]:
    """Parse various date formats to ISO format (YYYY-MM-DD)."""
    if not date_str or date_str == "—" or date_str == "-":
        return None

    # Common formats in ACC exports
    formats = [
        "%b %d, %Y",           # Jan 3, 2025
        "%B %d, %Y",           # January 3, 2025
        "%m/%d/%Y",            # 01/03/2025
        "%Y-%m-%d",            # 2025-01-03
    ]

    # Remove time portion if present
    date_str = re.sub(r',?\s*\d{1,2}:\d{2}\s*(AM|PM)?\s*(HST|PST|EST|UTC)?', '', date_str).strip()

    # Remove "by Name (Company)" portion - common in ACC exports
    date_str = re.sub(r'\s+by\s+.+$', '', date_str).strip()

    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    logger.warning(f"Could not parse date: {date_str}")
    return None


def extract_field(text: str, field_name: str, multiline: bool = False) -> Optional[str]:
    """Extract a field value from ACC PDF text."""
    # Pattern: field_name followed by value (possibly on next line)
    if multiline:
        pattern = rf'{re.escape(field_name)}\s*\n?(.*?)(?=\n[A-Z][a-z]|\n\n|\Z)'
    else:
        pattern = rf'{re.escape(field_name)}\s+(.+?)(?:\n|$)'

    match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
    if match:
        value = match.group(1).strip()
        if value and value != "—" and value != "-":
            return value
    return None


def parse_rfi_pdf(pdf_path: str, project_id: str, project_name: str) -> Optional[dict]:
    """
    Parse an RFI PDF from Autodesk Construction Cloud export.

    Returns a standardized dict with RFI data.
    """
    text = extract_text_from_pdf(pdf_path)
    if not text:
        return None

    # Extract RFI number and title from header
    # Pattern: #1 Abbott Alameda 1420 HBP - Door Hardware Confirmation
    title_match = re.search(r'#(\d+(?:\.\d+)?)\s+(.+?)(?=\nStatus|\n\n)', text, re.DOTALL)

    rfi_number = None
    title = None
    if title_match:
        rfi_number = title_match.group(1)
        title = title_match.group(2).strip().replace('\n', ' ')

    # Extract standard fields
    status = extract_field(text, "Status")
    created_on = extract_field(text, "Created on")
    answered_on = extract_field(text, "Answered")
    priority = extract_field(text, "Priority")
    discipline = extract_field(text, "Discipline")
    location = extract_field(text, "Location")

    # Extract Question section
    question_match = re.search(
        r'Question\s*\n(.*?)(?=Official response|References and Attachments|Impact|\Z)',
        text,
        re.DOTALL | re.IGNORECASE
    )
    question_text = question_match.group(1).strip() if question_match else None

    # Extract Official Response
    response_match = re.search(
        r'Official response\s*\n(.*?)(?=References and Attachments|By\s+\w+|Impact|\Z)',
        text,
        re.DOTALL | re.IGNORECASE
    )
    response_text = response_match.group(1).strip() if response_match else None

    # Extract Impact fields
    cost_impact_match = re.search(r'Cost impact\s+(Yes|No)', text, re.IGNORECASE)
    cost_impact = cost_impact_match.group(1).lower() == "yes" if cost_impact_match else False

    schedule_impact_match = re.search(r'Schedule impact\s+(Yes|No)', text, re.IGNORECASE)
    schedule_impact = schedule_impact_match.group(1).lower() == "yes" if schedule_impact_match else False

    # Parse created date
    item_date = parse_date(created_on) if created_on else None

    # Build raw text for embedding (combine question + response)
    raw_text_parts = []
    if title:
        raw_text_parts.append(title)
    if question_text:
        raw_text_parts.append(question_text)
    raw_text = "\n\n".join(raw_text_parts)

    if not raw_text:
        logger.warning(f"No text content found in RFI: {pdf_path}")
        return None

    return {
        "source_type": "rfi",
        "source_ref": f"RFI-{rfi_number}" if rfi_number else None,
        "source_project_id": project_id,
        "source_project_name": project_name,
        "raw_text": raw_text,
        "item_date": item_date,
        "trade_category": discipline.lower() if discipline else None,
        "severity": priority.lower() if priority else None,
        "resolution_text": response_text,
        "cost_impact": None,  # Could be dollar amount if available
        "resulted_in_co": cost_impact,
        "schedule_impact_days": None,
        "metadata": {
            "title": title,
            "status": status,
            "created_on": created_on,
            "answered_on": answered_on,
            "location": location,
            "cost_impact_flag": cost_impact,
            "schedule_impact_flag": schedule_impact,
            "pdf_path": pdf_path,
        }
    }


def parse_issue_pdf(pdf_path: str, project_id: str, project_name: str) -> Optional[dict]:
    """
    Parse an Issue/Punch List PDF from Autodesk Construction Cloud export.

    Returns a standardized dict with issue data.
    """
    text = extract_text_from_pdf(pdf_path)
    if not text:
        return None

    # Extract issue number and title from header
    # Pattern: #100: Punch List or #100 - Description
    title_match = re.search(r'#(\d+)(?::|:?\s*[-–]?\s*)(.+?)(?=\nStatus|\n\n)', text, re.DOTALL)

    issue_number = None
    title = None
    if title_match:
        issue_number = title_match.group(1)
        title = title_match.group(2).strip().replace('\n', ' ')

    # Extract standard fields
    status = extract_field(text, "Status")
    issue_type = extract_field(text, "Type")
    description = extract_field(text, "Description")
    assigned_to = extract_field(text, "Assigned to")
    created_by = extract_field(text, "Created by")
    created_on = extract_field(text, "Created on")
    location = extract_field(text, "Location")
    location_details = extract_field(text, "Location details")
    due_date = extract_field(text, "Due date")
    placement = extract_field(text, "Placement")
    root_cause = extract_field(text, "Root cause")
    severity = extract_field(text, "Severity")

    # Parse dates
    item_date = parse_date(created_on) if created_on else None

    # Determine trade from assigned_to (subcontractor name often indicates trade)
    trade_category = None
    if assigned_to:
        trade_category = infer_trade_from_company(assigned_to)

    # Build raw text for embedding
    raw_text_parts = []
    if description:
        raw_text_parts.append(description)
    if location_details:
        raw_text_parts.append(f"Location: {location_details}")
    if placement:
        raw_text_parts.append(f"Drawing: {placement}")

    raw_text = "\n".join(raw_text_parts)

    if not raw_text:
        logger.warning(f"No text content found in issue: {pdf_path}")
        return None

    return {
        "source_type": "punch_list",
        "source_ref": f"ISSUE-{issue_number}" if issue_number else None,
        "source_project_id": project_id,
        "source_project_name": project_name,
        "raw_text": raw_text,
        "item_date": item_date,
        "trade_category": trade_category,
        "severity": severity.lower() if severity else None,
        "resolution_text": None,  # Punch lists typically don't have resolution text
        "cost_impact": None,
        "resulted_in_co": False,
        "schedule_impact_days": None,
        "metadata": {
            "title": title,
            "status": status,
            "issue_type": issue_type,
            "assigned_to": assigned_to,
            "created_by": created_by,
            "created_on": created_on,
            "location": location,
            "location_details": location_details,
            "due_date": due_date,
            "placement": placement,
            "root_cause": root_cause,
            "pdf_path": pdf_path,
        }
    }


def infer_trade_from_company(company_name: str) -> Optional[str]:
    """Infer trade category from subcontractor company name."""
    company_lower = company_name.lower()

    trade_keywords = {
        "electrical": ["electric", "power", "lighting"],
        "plumbing": ["plumb", "pipe", "drain"],
        "mechanical": ["mechanical", "hvac", "air condition", "heating"],
        "fire_protection": ["fire", "sprinkler"],
        "drywall": ["drywall", "gyp", "plaster", "partition"],
        "flooring": ["floor", "tile", "carpet"],
        "painting": ["paint", "coating", "finish"],
        "roofing": ["roof"],
        "glazing": ["glass", "glaz", "window", "curtainwall"],
        "concrete": ["concrete", "mason"],
        "structural_steel": ["steel", "iron"],
        "carpentry": ["carpent", "millwork", "cabinet"],
        "elevator": ["elevator", "lift"],
        "low_voltage": ["low voltage", "data", "security", "av ", "audio"],
    }

    for trade, keywords in trade_keywords.items():
        for kw in keywords:
            if kw in company_lower:
                return trade

    return None


def scan_project_folder(
    project_folder: str,
    project_id: str,
    project_name: str
) -> list[dict]:
    """
    Scan a project folder for RFIs and Issues PDFs.

    Handles two folder structures:
    Structure A (subfolders):
    project_folder/
    ├── RFIs/
    │   └── 1 - RFI Title/
    │       └── 1 - RFI Title.pdf

    Structure B (flat):
    project_folder/
    ├── RFIs/
    │   └── #1 - RFI Title.pdf
    """
    items = []
    project_path = Path(project_folder)

    # Scan RFIs folder
    rfis_path = project_path / "RFIs"
    if rfis_path.exists():
        logger.info(f"Scanning RFIs in {rfis_path}")

        # First, check for direct PDFs in the folder (flat structure)
        for pdf_file in rfis_path.glob("*.pdf"):
            try:
                parsed = parse_rfi_pdf(str(pdf_file), project_id, project_name)
                if parsed:
                    items.append(parsed)
                    logger.debug(f"Parsed RFI: {parsed.get('source_ref')}")
            except Exception as e:
                logger.error(f"Error parsing RFI {pdf_file}: {e}")

        # Then, check for subfolders (nested structure)
        for rfi_folder in rfis_path.iterdir():
            if rfi_folder.is_dir():
                # Find PDF inside the folder
                for pdf_file in rfi_folder.glob("*.pdf"):
                    try:
                        parsed = parse_rfi_pdf(str(pdf_file), project_id, project_name)
                        if parsed:
                            items.append(parsed)
                            logger.debug(f"Parsed RFI: {parsed.get('source_ref')}")
                    except Exception as e:
                        logger.error(f"Error parsing RFI {pdf_file}: {e}")

    # Scan Issues folder (punch lists)
    issues_path = project_path / "Issues"
    if issues_path.exists():
        logger.info(f"Scanning Issues in {issues_path}")
        # Handle nested structure (Issues/Closed/100 - Punch List/)
        for subdir in issues_path.rglob("*"):
            if subdir.is_dir():
                for pdf_file in subdir.glob("*.pdf"):
                    try:
                        parsed = parse_issue_pdf(str(pdf_file), project_id, project_name)
                        if parsed:
                            items.append(parsed)
                            logger.debug(f"Parsed Issue: {parsed.get('source_ref')}")
                    except Exception as e:
                        logger.error(f"Error parsing Issue {pdf_file}: {e}")

    # Scan PC folder (alternative punch list format - direct PDFs)
    pc_path = project_path / "PC"
    if pc_path.exists():
        logger.info(f"Scanning PC folder in {pc_path}")
        for pdf_file in pc_path.glob("*.pdf"):
            try:
                # PC folder seems to have RFI-style PDFs based on naming
                parsed = parse_rfi_pdf(str(pdf_file), project_id, project_name)
                if parsed:
                    items.append(parsed)
                    logger.debug(f"Parsed PC item: {parsed.get('source_ref')}")
            except Exception as e:
                logger.error(f"Error parsing PC item {pdf_file}: {e}")

    logger.info(f"Found {len(items)} items in {project_name}")
    return items


def scan_all_projects(data_folder: str, company_id: str) -> list[dict]:
    """
    Scan all project folders in the data directory.

    Args:
        data_folder: Path to folder containing project subfolders
        company_id: Company ID to assign to all items

    Returns:
        List of parsed items from all projects
    """
    all_items = []
    data_path = Path(data_folder)

    for project_folder in data_path.iterdir():
        if project_folder.is_dir():
            project_name = project_folder.name
            # Create a slug-style project ID from the name
            project_id = re.sub(r'[^a-z0-9]+', '-', project_name.lower()).strip('-')

            logger.info(f"Processing project: {project_name}")
            items = scan_project_folder(str(project_folder), project_id, project_name)

            # Add company_id to each item
            for item in items:
                item["company_id"] = company_id

            all_items.extend(items)

    logger.info(f"Total items parsed: {len(all_items)}")
    return all_items
