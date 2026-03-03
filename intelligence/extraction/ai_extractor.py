"""
AI-based entity extraction using OpenAI gpt-4o-mini.

Extracts complex entities that are difficult to capture with regex:
- Trade names and categories
- Material types
- Brand names
- People/company names
- Issue classifications
"""

import json
import logging
from typing import Optional

from config import settings, get_async_openai_client

logger = logging.getLogger(__name__)


# Prompt for entity extraction
EXTRACTION_PROMPT = """You are a construction industry expert extracting structured data from RFI (Request for Information) and punch list items.

Extract the following entities from the text. Return ONLY a JSON object with these keys:

{
  "trades": ["list of trade names involved, e.g., electrical, mechanical, plumbing, drywall, concrete"],
  "materials": ["list of materials mentioned, e.g., drywall, concrete, steel, glass, copper pipe"],
  "brands": ["list of brand/manufacturer names, e.g., Trane, Honeywell, Armstrong, USG"],
  "people": ["list of people mentioned with their roles if known, e.g., 'John Smith (PM)', 'Luis Teran (Architect)'"],
  "companies": ["list of company names, e.g., DPR Construction, ACCO Engineered Systems"],
  "issue_type": "one of: design_clarification, coordination, workmanship, material_defect, code_compliance, field_condition, schedule, or null",
  "primary_trade": "the main trade responsible, or null"
}

Rules:
- Only include entities explicitly mentioned in the text
- For trades, use standard construction trade names:
  * concrete: grade beam, foundation, footing, slab, retaining wall, shear wall, rebar, formwork
  * structural_steel: steel beams, columns, joists, metal decking
  * mechanical/HVAC: ductwork, VAV, AHU, chiller, boiler
  * electrical: conduit, panels, switchgear, lighting
  * plumbing: piping, drains, waste, water lines
  * fire_protection: sprinklers, fire alarm, smoke detectors
  * curtainwall: glazing, mullions, storefront, glass
  * drywall, painting, flooring, roofing, etc.
- IMPORTANT: Grade beams, foundations, footings, slabs are CONCRETE trade, NOT structural_steel
- For issue_type, choose the most appropriate category
- If an entity type has no matches, use an empty array [] or null
- Return ONLY valid JSON, no other text

Text to analyze:
"""


async def extract_entities_with_ai(text: str, timeout: float = 30.0) -> Optional[dict]:
    """
    Extract entities from text using OpenAI gpt-4o-mini.

    Args:
        text: Text to analyze
        timeout: Request timeout in seconds

    Returns:
        Dict with extracted entities or None if extraction failed
    """
    if not text or len(text.strip()) < 10:
        return None

    if not settings.openai_api_key:
        logger.warning("OpenAI API key not configured")
        return None

    try:
        # Get async client
        client = get_async_openai_client()

        # Truncate very long texts
        truncated_text = text[:4000] if len(text) > 4000 else text

        response = await client.chat.completions.create(
            model=settings.extraction_model,
            messages=[
                {
                    "role": "system",
                    "content": "You are a construction industry expert. Extract entities and return ONLY valid JSON."
                },
                {
                    "role": "user",
                    "content": EXTRACTION_PROMPT + truncated_text
                }
            ],
            temperature=0.1,
            max_tokens=500,
            timeout=timeout
        )

        content = response.choices[0].message.content.strip()

        # Parse JSON response
        # Handle potential markdown code blocks
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        result = json.loads(content)

        # Validate and normalize result
        return normalize_ai_result(result)

    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse AI response as JSON: {e}")
        return None
    except Exception as e:
        logger.error(f"AI extraction failed: {e}")
        return None


def normalize_ai_result(result: dict) -> dict:
    """
    Normalize and validate AI extraction result.
    """
    normalized = {
        "trades": [],
        "materials": [],
        "brands": [],
        "people": [],
        "companies": [],
        "issue_type": None,
        "primary_trade": None
    }

    # Normalize trades
    if isinstance(result.get("trades"), list):
        normalized["trades"] = [
            normalize_trade_name(t) for t in result["trades"]
            if isinstance(t, str) and t.strip()
        ]

    # Normalize materials
    if isinstance(result.get("materials"), list):
        normalized["materials"] = [
            m.lower().strip() for m in result["materials"]
            if isinstance(m, str) and m.strip()
        ]

    # Brands (keep original casing)
    if isinstance(result.get("brands"), list):
        normalized["brands"] = [
            b.strip() for b in result["brands"]
            if isinstance(b, str) and b.strip()
        ]

    # People
    if isinstance(result.get("people"), list):
        normalized["people"] = [
            p.strip() for p in result["people"]
            if isinstance(p, str) and p.strip()
        ]

    # Companies
    if isinstance(result.get("companies"), list):
        normalized["companies"] = [
            c.strip() for c in result["companies"]
            if isinstance(c, str) and c.strip()
        ]

    # Issue type
    valid_issue_types = {
        "design_clarification", "coordination", "workmanship",
        "material_defect", "code_compliance", "field_condition", "schedule"
    }
    issue_type = result.get("issue_type")
    if isinstance(issue_type, str) and issue_type.lower() in valid_issue_types:
        normalized["issue_type"] = issue_type.lower()

    # Primary trade
    primary = result.get("primary_trade")
    if isinstance(primary, str) and primary.strip():
        normalized["primary_trade"] = normalize_trade_name(primary)

    return normalized


def normalize_trade_name(trade: str) -> str:
    """
    Normalize trade name to standard form.
    """
    trade_lower = trade.lower().strip()

    # Common trade name mappings
    mappings = {
        "hvac": "mechanical",
        "heating": "mechanical",
        "air conditioning": "mechanical",
        "ac": "mechanical",
        "a/c": "mechanical",
        "mech": "mechanical",
        "elec": "electrical",
        "elect": "electrical",
        "electric": "electrical",
        "plumb": "plumbing",
        "fire sprinkler": "fire_protection",
        "sprinkler": "fire_protection",
        "fire suppression": "fire_protection",
        "fp": "fire_protection",
        "gyp": "drywall",
        "gypsum": "drywall",
        "gypsum board": "drywall",
        "sheetrock": "drywall",
        "gwb": "drywall",
        "paint": "painting",
        "painter": "painting",
        "floor": "flooring",
        "floors": "flooring",
        "tile": "flooring",
        "carpet": "flooring",
        "ceiling": "acoustical_ceiling",
        "act": "acoustical_ceiling",
        "acoustical": "acoustical_ceiling",
        # Structural steel
        "steel": "structural_steel",
        "iron": "structural_steel",
        "ironworker": "structural_steel",
        "structural": "structural_steel",
        # Concrete (IMPORTANT: grade beam, foundation, etc. are CONCRETE not steel)
        "concrete": "concrete",
        "grade beam": "concrete",
        "grade beams": "concrete",
        "foundation": "concrete",
        "foundations": "concrete",
        "footing": "concrete",
        "footings": "concrete",
        "slab": "concrete",
        "slabs": "concrete",
        "retaining wall": "concrete",
        "shear wall": "concrete",
        "cmu": "masonry",
        "masonry": "masonry",
        "block": "masonry",
        "rebar": "concrete",
        "reinforcing": "concrete",
        "formwork": "concrete",
        "shotcrete": "concrete",
        # Curtainwall/Glazing
        "cw": "curtainwall",
        "curtain wall": "curtainwall",
        "glazing": "curtainwall",
        "glass": "curtainwall",
        "storefront": "curtainwall",
        "mullion": "curtainwall",
        # Roofing/Waterproofing
        "roof": "roofing",
        "roofer": "roofing",
        "waterproofing": "waterproofing",
        "wp": "waterproofing",
        "membrane": "waterproofing",
        # Fire alarm
        "fa": "fire_alarm",
        "fire alarm": "fire_alarm",
        "smoke detector": "fire_alarm",
        # Low voltage
        "low voltage": "low_voltage",
        "lv": "low_voltage",
        "data": "low_voltage",
        "telecom": "low_voltage",
        "av": "low_voltage",
        "audio visual": "low_voltage",
        "security": "low_voltage",
        # Conveying
        "elevator": "conveying",
        "escalator": "conveying",
        # Millwork
        "millwork": "millwork",
        "casework": "millwork",
        "cabinets": "millwork",
        # Doors
        "door": "doors_hardware",
        "doors": "doors_hardware",
        "hardware": "doors_hardware",
        "frame": "doors_hardware",
        "frames": "doors_hardware",
    }

    return mappings.get(trade_lower, trade_lower.replace(" ", "_"))


# Synchronous wrapper for non-async contexts
def extract_entities_with_ai_sync(text: str, timeout: float = 30.0) -> Optional[dict]:
    """
    Synchronous wrapper for AI entity extraction.
    """
    import asyncio

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(extract_entities_with_ai(text, timeout))


# Batch extraction for efficiency
async def extract_entities_batch(
    texts: list[str],
    batch_size: int = 5,
    timeout: float = 30.0
) -> list[Optional[dict]]:
    """
    Extract entities from multiple texts.

    Args:
        texts: List of texts to analyze
        batch_size: Number of concurrent requests
        timeout: Per-request timeout

    Returns:
        List of extraction results (same order as input)
    """
    import asyncio

    results = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        batch_results = await asyncio.gather(
            *[extract_entities_with_ai(text, timeout) for text in batch],
            return_exceptions=True
        )

        for result in batch_results:
            if isinstance(result, Exception):
                logger.error(f"Batch extraction error: {result}")
                results.append(None)
            else:
                results.append(result)

    return results
