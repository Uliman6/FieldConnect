"""
Keyword extraction for construction text.

Extracts domain-specific keywords that are critical for matching:
- Trade keywords (curtainwall, plumbing, electrical, concrete, etc.)
- Material keywords (drywall, rebar, mullion, ductwork, etc.)
- Issue keywords (conflict, leak, crack, damage, missing, etc.)
- System keywords (smoke detector, fire alarm, sprinkler, HVAC, etc.)
"""

import re
from typing import Optional

# Trade keywords - these are critical for matching
TRADE_KEYWORDS = {
    # Envelope/Glazing
    "curtainwall", "curtain wall", "glazing", "glass", "mullion", "storefront",
    "window", "fenestration", "spandrel", "vision glass", "IGU",

    # Concrete
    "concrete", "rebar", "reinforcement", "slab", "foundation", "footing",
    "grade beam", "CMU", "masonry", "shotcrete", "pour", "formwork",
    "retaining wall", "shear wall",

    # Structural
    "structural steel", "steel beam", "column", "joist", "decking",
    "HSS", "W-beam", "connection", "embed", "anchor",

    # MEP - Mechanical
    "HVAC", "ductwork", "duct", "VAV", "AHU", "diffuser", "grille",
    "mechanical", "chiller", "boiler", "RTU", "exhaust fan",

    # MEP - Electrical
    "electrical", "conduit", "panel", "switchgear", "transformer",
    "lighting", "receptacle", "junction box", "wire", "circuit",

    # MEP - Plumbing
    "plumbing", "pipe", "drain", "waste", "vent", "water",
    "sanitary", "storm", "domestic water", "hot water", "cold water",
    "hose bibb", "floor drain", "roof drain", "piping",

    # Fire Protection
    "fire protection", "sprinkler", "fire alarm", "smoke detector",
    "fire damper", "fire caulk", "firestopping", "fire rating",
    "fire marshal", "fire department", "smoke control",

    # Finishes
    "drywall", "gypsum", "GWB", "paint", "flooring", "tile",
    "ceiling", "ACT", "carpet", "VCT", "epoxy", "millwork",
    "casework", "countertop",

    # Roofing/Waterproofing
    "roofing", "membrane", "flashing", "waterproofing", "caulking",
    "sealant", "expansion joint", "roof drain",

    # Doors/Hardware
    "door", "hardware", "frame", "closer", "lockset", "hinges",
    "automatic door", "overhead door", "rolling door",

    # Conveying
    "elevator", "escalator", "lift", "hoist",
}

# Material keywords
MATERIAL_KEYWORDS = {
    "rebar", "steel", "concrete", "glass", "aluminum", "copper",
    "PVC", "cast iron", "galvanized", "stainless", "brass",
    "wood", "plywood", "MDF", "laminate", "granite", "marble",
    "ceramic", "porcelain", "rubber", "EPDM", "TPO", "adhesive",
    "grout", "mortar", "insulation", "fiberglass", "foam",
    "gypsum board", "cement board", "metal panel", "ACM",
}

# Issue/problem keywords - critical for understanding the nature of the issue
ISSUE_KEYWORDS = {
    "conflict", "clash", "interference", "coordination",
    "missing", "omitted", "not shown", "unclear",
    "damage", "damaged", "defect", "defective",
    "leak", "leaking", "water intrusion", "moisture",
    "crack", "cracking", "spalling",
    "alignment", "tolerance", "out of plumb", "out of level",
    "incorrect", "wrong", "error", "discrepancy",
    "RFI", "clarification", "confirmation",
    "change", "revision", "modification",
}

# Location keywords - help match by area
LOCATION_KEYWORDS = {
    # Levels/Floors
    "level", "floor", "tier", "roof", "basement", "penthouse",
    "rooftop", "mezzanine", "ground floor",
    # Areas/Rooms
    "lobby", "corridor", "hallway", "stairwell", "stair",
    "elevator", "shaft", "mechanical room", "electrical room",
    "restroom", "bathroom", "kitchen", "break room",
    "office", "conference room", "storage", "closet",
    "entryway", "entrance", "entry", "exit", "loading dock",
    # Directions
    "exterior", "interior", "north", "south", "east", "west",
    "northeast", "northwest", "southeast", "southwest",
    "north side", "south side", "east side", "west side",
    # Building elements
    "wing", "tower", "atrium", "courtyard",
    # Parking
    "parking", "garage", "parking structure",
}

# System/Equipment keywords
SYSTEM_KEYWORDS = {
    "smoke detector", "fire alarm", "sprinkler head", "fire extinguisher",
    "exit sign", "emergency light", "security camera", "access control",
    "thermostat", "sensor", "damper", "valve", "pump",
    "generator", "UPS", "switchboard", "panelboard",
    "ceiling tile", "light fixture", "diffuser",
}

# Compile all keywords into categories
ALL_KEYWORD_SETS = {
    "trade": TRADE_KEYWORDS,
    "material": MATERIAL_KEYWORDS,
    "issue": ISSUE_KEYWORDS,
    "location": LOCATION_KEYWORDS,
    "system": SYSTEM_KEYWORDS,
}


def extract_keywords(text: str) -> dict[str, list[str]]:
    """
    Extract construction keywords from text.

    Returns:
        Dict with categories as keys and lists of found keywords as values
    """
    if not text:
        return {}

    text_lower = text.lower()
    found = {}

    for category, keywords in ALL_KEYWORD_SETS.items():
        matches = []
        for keyword in keywords:
            # Use word boundary matching for single words
            # For multi-word phrases, just check if they're in the text
            if " " in keyword:
                if keyword in text_lower:
                    matches.append(keyword)
            else:
                pattern = rf'\b{re.escape(keyword)}\b'
                if re.search(pattern, text_lower):
                    matches.append(keyword)

        if matches:
            found[category] = matches

    return found


def extract_all_keywords_flat(text: str) -> set[str]:
    """
    Extract all keywords as a flat set.
    """
    keywords = extract_keywords(text)
    result = set()
    for category_keywords in keywords.values():
        result.update(category_keywords)
    return result


def calculate_keyword_overlap(
    query_keywords: set[str],
    candidate_text: str
) -> dict:
    """
    Calculate keyword overlap between query keywords and candidate text.

    Returns:
        Dict with:
        - matched_keywords: list of keywords found in both
        - match_count: number of matches
        - query_coverage: fraction of query keywords matched
        - score: normalized score 0-1
    """
    if not query_keywords:
        return {
            "matched_keywords": [],
            "match_count": 0,
            "query_coverage": 0.0,
            "score": 0.0
        }

    candidate_keywords = extract_all_keywords_flat(candidate_text)

    matched = query_keywords & candidate_keywords

    match_count = len(matched)
    query_coverage = match_count / len(query_keywords) if query_keywords else 0

    # Score: emphasize having multiple matches
    # 1 match = 0.3, 2 matches = 0.6, 3+ matches = 0.8+
    if match_count == 0:
        score = 0.0
    elif match_count == 1:
        score = 0.4
    elif match_count == 2:
        score = 0.7
    else:
        score = min(1.0, 0.8 + (match_count - 3) * 0.1)

    return {
        "matched_keywords": list(matched),
        "match_count": match_count,
        "query_coverage": query_coverage,
        "score": score
    }


def get_primary_trade(text: str) -> Optional[str]:
    """
    Determine the primary trade from text.
    Returns the most specific trade keyword found.
    """
    keywords = extract_keywords(text)
    trade_keywords = keywords.get("trade", [])

    if not trade_keywords:
        return None

    # Prioritize more specific terms
    priority_order = [
        "curtainwall", "curtain wall", "glazing",
        "fire protection", "sprinkler", "fire alarm", "smoke detector",
        "plumbing", "piping",
        "electrical", "conduit",
        "HVAC", "ductwork", "mechanical",
        "concrete", "rebar", "foundation", "grade beam",
        "structural steel", "steel beam",
        "drywall", "gypsum",
        "roofing", "waterproofing",
        "elevator",
    ]

    for term in priority_order:
        if term in trade_keywords:
            return term

    return trade_keywords[0] if trade_keywords else None


# Quick test
if __name__ == "__main__":
    test_texts = [
        "The curtainwall installer is asking about mullion alignment tolerances at Level 3 north side",
        "City fire marshal wants additional smoke detectors in the electrical rooms on every floor",
        "Rebar placement in the foundation wall doesn't match the structural drawings",
        "Plumbing rough-in locations don't match the architectural reflected ceiling plan",
        "Grade beam conflicts with the plumbing routes",
    ]

    for text in test_texts:
        print(f"\nText: {text}")
        keywords = extract_keywords(text)
        print(f"Keywords: {keywords}")
        print(f"Primary trade: {get_primary_trade(text)}")
