"""
Regex patterns for extracting construction entities from text.

Handles:
- Spec sections (CSI MasterFormat)
- Drawing references
- RFI/submittal references
- Measurements and quantities
- Common construction abbreviations
"""

import re
from typing import Optional


# CSI MasterFormat Spec Section patterns
# Format: XX XX XX or XX-XX-XX or XXXXXX
SPEC_SECTION_PATTERNS = [
    # Standard format: 09 21 16
    re.compile(r'\b(\d{2})\s+(\d{2})\s+(\d{2})\b'),
    # Hyphenated: 09-21-16
    re.compile(r'\b(\d{2})-(\d{2})-(\d{2})\b'),
    # Compact: 092116
    re.compile(r'\b(\d{6})\b'),
    # Two-part: 09 21 or Section 09
    re.compile(r'\b[Ss]ection\s+(\d{2})\s*(\d{2})?\b'),
    # Division reference: Division 09
    re.compile(r'\b[Dd]ivision\s+(\d{1,2})\b'),
]

# CSI Division names for context
CSI_DIVISIONS = {
    "00": "Procurement and Contracting",
    "01": "General Requirements",
    "02": "Existing Conditions",
    "03": "Concrete",
    "04": "Masonry",
    "05": "Metals",
    "06": "Wood, Plastics, Composites",
    "07": "Thermal and Moisture Protection",
    "08": "Openings",
    "09": "Finishes",
    "10": "Specialties",
    "11": "Equipment",
    "12": "Furnishings",
    "13": "Special Construction",
    "14": "Conveying Equipment",
    "21": "Fire Suppression",
    "22": "Plumbing",
    "23": "HVAC",
    "25": "Integrated Automation",
    "26": "Electrical",
    "27": "Communications",
    "28": "Electronic Safety and Security",
    "31": "Earthwork",
    "32": "Exterior Improvements",
    "33": "Utilities",
}


def extract_spec_sections(text: str) -> list[dict]:
    """
    Extract CSI MasterFormat spec section references from text.

    Returns list of dicts with:
    - value: the spec section number
    - division: CSI division name
    - match_text: original matched text
    """
    results = []
    text_upper = text.upper()

    # Standard format: 09 21 16
    for match in re.finditer(r'\b(\d{2})\s+(\d{2})\s+(\d{2})\b', text):
        div = match.group(1)
        section = f"{match.group(1)} {match.group(2)} {match.group(3)}"
        results.append({
            "value": section,
            "division": CSI_DIVISIONS.get(div, "Unknown"),
            "match_text": match.group(0)
        })

    # Hyphenated: 09-21-16
    for match in re.finditer(r'\b(\d{2})-(\d{2})-(\d{2})\b', text):
        div = match.group(1)
        section = f"{match.group(1)} {match.group(2)} {match.group(3)}"
        if section not in [r["value"] for r in results]:
            results.append({
                "value": section,
                "division": CSI_DIVISIONS.get(div, "Unknown"),
                "match_text": match.group(0)
            })

    # Section XX or Section XX XX
    for match in re.finditer(r'[Ss]ection\s+(\d{2})\s*(\d{2})?', text):
        div = match.group(1)
        if match.group(2):
            section = f"{match.group(1)} {match.group(2)} 00"
        else:
            section = f"{match.group(1)} 00 00"
        if section not in [r["value"] for r in results]:
            results.append({
                "value": section,
                "division": CSI_DIVISIONS.get(div, "Unknown"),
                "match_text": match.group(0)
            })

    return results


# Drawing reference patterns
DRAWING_PATTERNS = [
    # Sheet with number: A2.1, M-101, E1.01, SK-001
    re.compile(r'\b([ASMEPCLGD])-?(\d{1,3})\.?(\d{1,2})?\b', re.IGNORECASE),
    # SK (sketch): SK-001, SK001, SK 001
    re.compile(r'\b(SK)[\s\-]?(\d{1,4})\b', re.IGNORECASE),
    # ASI (Architect's Supplemental Instruction)
    re.compile(r'\b(ASI)[\s\-]?(\d{1,4})\b', re.IGNORECASE),
    # Detail reference: Detail 5/A2.1
    re.compile(r'\b[Dd]etail\s+(\d+)/([A-Z]\d+\.?\d*)\b', re.IGNORECASE),
    # Sheet reference: Sheet A-101
    re.compile(r'\b[Ss]heet\s+([A-Z][\-\d\.]+)\b', re.IGNORECASE),
]


def extract_drawing_refs(text: str) -> list[dict]:
    """
    Extract drawing references from text.

    Returns list of dicts with:
    - value: normalized drawing reference
    - type: type of drawing (architectural, structural, mechanical, etc.)
    - match_text: original matched text
    """
    results = []
    seen = set()

    # Drawing prefix meanings
    prefix_types = {
        'A': 'architectural',
        'S': 'structural',
        'M': 'mechanical',
        'E': 'electrical',
        'P': 'plumbing',
        'C': 'civil',
        'L': 'landscape',
        'G': 'general',
        'D': 'detail',
    }

    # Standard drawing refs: A2.1, M-101, etc.
    for match in re.finditer(r'\b([ASMEPCLGD])-?(\d{1,3})\.?(\d{1,2})?\b', text, re.IGNORECASE):
        prefix = match.group(1).upper()
        num = match.group(2)
        sub = match.group(3) or ""

        if sub:
            value = f"{prefix}{num}.{sub}"
        else:
            value = f"{prefix}-{num}"

        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": prefix_types.get(prefix, "drawing"),
                "match_text": match.group(0)
            })

    # SK references
    for match in re.finditer(r'\b(SK)[\s\-]?(\d{1,4})\b', text, re.IGNORECASE):
        value = f"SK-{match.group(2)}"
        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": "sketch",
                "match_text": match.group(0)
            })

    # ASI references
    for match in re.finditer(r'\b(ASI)[\s\-]?(\d{1,4})\b', text, re.IGNORECASE):
        value = f"ASI-{match.group(2)}"
        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": "asi",
                "match_text": match.group(0)
            })

    # Detail references
    for match in re.finditer(r'\b[Dd]etail\s+(\d+)/([A-Z]\d+\.?\d*)\b', text, re.IGNORECASE):
        value = f"Detail {match.group(1)}/{match.group(2).upper()}"
        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": "detail",
                "match_text": match.group(0)
            })

    # Sheet references
    for match in re.finditer(r'\b[Ss]heet\s+([A-Z][\-\d\.]+)\b', text, re.IGNORECASE):
        value = f"Sheet {match.group(1).upper()}"
        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": "sheet",
                "match_text": match.group(0)
            })

    return results


# RFI/Submittal reference patterns
def extract_rfi_refs(text: str) -> list[dict]:
    """Extract RFI references from text."""
    results = []
    seen = set()

    # RFI-001, RFI 001, RFI#001
    for match in re.finditer(r'\bRFI[\s\-#]?(\d{1,5})\b', text, re.IGNORECASE):
        value = f"RFI-{match.group(1)}"
        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": "rfi",
                "match_text": match.group(0)
            })

    return results


def extract_submittal_refs(text: str) -> list[dict]:
    """Extract submittal references from text."""
    results = []
    seen = set()

    # Submittal references with spec sections
    for match in re.finditer(r'\b[Ss]ubmittal[\s\-#]?(\d[\d\.\-\s]+)\b', text):
        value = f"Submittal {match.group(1).strip()}"
        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": "submittal",
                "match_text": match.group(0)
            })

    return results


# Room/location patterns
# Direction keywords for compound locations
DIRECTIONS = r'(?:north|south|east|west|ne|nw|se|sw|n|s|e|w)'
LOCATION_TYPES = r'(?:entryway|entrance|entry|lobby|corridor|hallway|stairwell|stair|elevator|' \
                 r'restroom|bathroom|kitchen|break\s*room|office|conference|storage|closet|' \
                 r'mechanical\s*room|electrical\s*room|loading\s*dock|exit|side|wing|tower)'

def extract_locations(text: str) -> list[dict]:
    """Extract room and location references from text."""
    results = []
    seen = set()

    # Room numbers: Room 101, Rm 101, RM-101
    for match in re.finditer(r'\b[Rr](?:oom|m|M)[\s\-#]?(\d{1,4}[A-Z]?)\b', text):
        value = f"Room {match.group(1)}"
        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": "room",
                "match_text": match.group(0)
            })

    # Level/Floor with optional direction and location type
    # e.g., "Level 1 east entryway", "Level 3 north side", "Floor 2 lobby"
    level_pattern = rf'\b([Ll]evel|[Ff]loor)\s+(\d{{1,2}}|[BGMLPRbgmlpr]\d?)(?:\s+{DIRECTIONS})?(?:\s+{LOCATION_TYPES})?\b'
    for match in re.finditer(level_pattern, text, re.IGNORECASE):
        # Capture the full match for compound locations
        full_match = match.group(0)
        level_type = "Level" if match.group(1).lower() == "level" else "Floor"
        level_num = match.group(2).upper()

        # Normalize the value but keep full context
        value = f"{level_type} {level_num}"
        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": level_type.lower(),
                "match_text": full_match.strip(),
                "full_location": full_match.strip()  # Keep full compound location
            })

    # Direction + location type combinations (e.g., "east entryway", "north lobby")
    for match in re.finditer(rf'\b({DIRECTIONS})\s+({LOCATION_TYPES})\b', text, re.IGNORECASE):
        value = f"{match.group(1).lower()} {match.group(2).lower()}"
        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": "area",
                "match_text": match.group(0)
            })

    # Standalone location types (lobby, corridor, etc.)
    for match in re.finditer(rf'\b({LOCATION_TYPES})\b', text, re.IGNORECASE):
        value = match.group(1).lower().replace(" ", "_")
        # Only add if we haven't captured a more specific version
        base_value = value.replace("_", " ")
        if value not in seen and not any(base_value in s for s in seen):
            seen.add(value)
            results.append({
                "value": value,
                "type": "location_type",
                "match_text": match.group(0)
            })

    # Grid line references: Grid A, Grid 1, Gridline A/1
    for match in re.finditer(r'\b[Gg]rid(?:line)?[\s\-]?([A-Z]|\d{1,2})(?:[/\-]([A-Z]|\d{1,2}))?\b', text):
        if match.group(2):
            value = f"Grid {match.group(1)}/{match.group(2)}"
        else:
            value = f"Grid {match.group(1)}"
        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": "grid",
                "match_text": match.group(0)
            })

    # Area references: Area A, Area 1
    for match in re.finditer(r'\b[Aa]rea\s+([A-Z]|\d{1,2})\b', text):
        value = f"Area {match.group(1)}"
        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": "area",
                "match_text": match.group(0)
            })

    # Tier references (common in parking structures): Tier 1, Tier 2
    for match in re.finditer(r'\b[Tt]ier\s+(\d{1,2})\b', text):
        value = f"Tier {match.group(1)}"
        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": "tier",
                "match_text": match.group(0)
            })

    # Roof references
    for match in re.finditer(r'\b(roof|rooftop|penthouse)\b', text, re.IGNORECASE):
        value = match.group(1).lower()
        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": "level",
                "match_text": match.group(0)
            })

    # Basement references
    for match in re.finditer(r'\b(basement|[Bb]\d?)\b', text):
        value = match.group(1).upper() if len(match.group(1)) <= 2 else match.group(1).lower()
        if value not in seen:
            seen.add(value)
            results.append({
                "value": value,
                "type": "level",
                "match_text": match.group(0)
            })

    return results


# Measurement patterns
def extract_measurements(text: str) -> list[dict]:
    """Extract measurements from text."""
    results = []

    # Dimensions: 12'-0", 12'6", 12 ft, 12 feet
    for match in re.finditer(r'\b(\d+)[\'′][\s\-]?(\d+)?[\"″]?\b', text):
        feet = match.group(1)
        inches = match.group(2) or "0"
        value = f"{feet}'-{inches}\""
        results.append({
            "value": value,
            "type": "dimension",
            "match_text": match.group(0)
        })

    # Metric: 300mm, 3.5m, 100cm
    for match in re.finditer(r'\b(\d+(?:\.\d+)?)\s*(mm|cm|m)\b', text, re.IGNORECASE):
        value = f"{match.group(1)}{match.group(2).lower()}"
        results.append({
            "value": value,
            "type": "dimension_metric",
            "match_text": match.group(0)
        })

    return results


# All-in-one extraction
def extract_all_regex_entities(text: str) -> dict[str, list[dict]]:
    """
    Extract all regex-based entities from text.

    Returns dict with entity types as keys.
    """
    return {
        "spec_section": extract_spec_sections(text),
        "drawing_ref": extract_drawing_refs(text),
        "rfi_ref": extract_rfi_refs(text),
        "submittal_ref": extract_submittal_refs(text),
        "location": extract_locations(text),
        "measurement": extract_measurements(text),
    }
