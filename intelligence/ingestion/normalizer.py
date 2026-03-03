"""
Construction terminology normalizer.
Expands abbreviations, standardizes trade names, and normalizes brand references.
"""

import re
import os
from pathlib import Path
from typing import Optional
import yaml
import logging

logger = logging.getLogger(__name__)

# Global cache for terminology dictionary
_terminology: Optional[dict] = None


def load_terminology() -> dict:
    """Load the construction terminology dictionary from YAML."""
    global _terminology

    if _terminology is not None:
        return _terminology

    # Find the data directory relative to this file
    data_dir = Path(__file__).parent.parent / "data"
    terms_file = data_dir / "construction_terms.yaml"

    if not terms_file.exists():
        logger.warning(f"Terminology file not found: {terms_file}")
        _terminology = {"abbreviations": {}, "brands": {}, "trades": {}, "materials": {}}
        return _terminology

    with open(terms_file, "r", encoding="utf-8") as f:
        _terminology = yaml.safe_load(f)

    logger.info(f"Loaded terminology: {len(_terminology.get('abbreviations', {}))} abbreviations, "
                f"{len(_terminology.get('brands', {}))} brands, "
                f"{len(_terminology.get('trades', {}))} trades")

    return _terminology


def expand_abbreviations(text: str, terminology: dict) -> tuple[str, list[dict]]:
    """
    Expand construction abbreviations in text.

    Returns:
        Tuple of (expanded_text, list of replacements made)
    """
    replacements = []
    abbreviations = terminology.get("abbreviations", {})

    for abbrev, expansion in abbreviations.items():
        # Word-boundary aware replacement (case insensitive)
        # Avoid replacing inside other words (e.g., "CO" shouldn't replace in "CONCRETE")
        pattern = rf'\b{re.escape(abbrev)}\b'
        matches = list(re.finditer(pattern, text, re.IGNORECASE))

        if matches:
            text = re.sub(pattern, expansion, text, flags=re.IGNORECASE)
            replacements.append({
                "type": "abbreviation",
                "original": abbrev,
                "normalized": expansion,
                "count": len(matches)
            })

    return text, replacements


def normalize_brands(text: str, terminology: dict) -> tuple[str, list[dict]]:
    """
    Note brand names in text for entity extraction.
    We don't replace brands, but we track them.

    Returns:
        Tuple of (text unchanged, list of detected brands)
    """
    detected = []
    brands = terminology.get("brands", {})

    for brand, generic in brands.items():
        pattern = rf'\b{re.escape(brand)}\b'
        matches = list(re.finditer(pattern, text, re.IGNORECASE))

        if matches:
            detected.append({
                "type": "brand",
                "original": brand,
                "generic": generic,
                "count": len(matches)
            })

    return text, detected


def normalize_trades(text: str, terminology: dict) -> tuple[str, list[dict]]:
    """
    Standardize trade slang to official trade names.

    Returns:
        Tuple of (normalized_text, list of replacements)
    """
    replacements = []
    trades = terminology.get("trades", {})

    for slang, standard in trades.items():
        pattern = rf'\b{re.escape(slang)}\b'
        matches = list(re.finditer(pattern, text, re.IGNORECASE))

        if matches:
            text = re.sub(pattern, standard, text, flags=re.IGNORECASE)
            replacements.append({
                "type": "trade",
                "original": slang,
                "normalized": standard,
                "count": len(matches)
            })

    return text, replacements


def normalize_materials(text: str, terminology: dict) -> tuple[str, list[dict]]:
    """
    Standardize material synonyms.

    Returns:
        Tuple of (normalized_text, list of replacements)
    """
    replacements = []
    materials = terminology.get("materials", {})

    for standard_name, aliases in materials.items():
        if isinstance(aliases, list):
            for alias in aliases:
                pattern = rf'\b{re.escape(alias)}\b'
                matches = list(re.finditer(pattern, text, re.IGNORECASE))

                if matches:
                    # Replace alias with standard name (with spaces instead of underscores)
                    display_name = standard_name.replace("_", " ")
                    text = re.sub(pattern, display_name, text, flags=re.IGNORECASE)
                    replacements.append({
                        "type": "material",
                        "original": alias,
                        "normalized": display_name,
                        "count": len(matches)
                    })

    return text, replacements


def clean_text(text: str) -> str:
    """Basic text cleaning."""
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text)

    # Remove excessive punctuation
    text = re.sub(r'\.{2,}', '.', text)

    # Normalize dashes
    text = re.sub(r'[–—]', '-', text)

    return text.strip()


def normalize(text: str) -> dict:
    """
    Full normalization pipeline for construction text.

    Args:
        text: Raw text from RFI, punch list, or observation

    Returns:
        Dict with:
        - normalized_text: The cleaned and normalized text
        - replacements: List of all terminology replacements made
        - detected_brands: List of brand names detected
    """
    if not text:
        return {
            "normalized_text": "",
            "replacements": [],
            "detected_brands": []
        }

    terminology = load_terminology()

    # Start with cleaned text
    normalized = clean_text(text)

    # Convert to lowercase for consistency
    normalized = normalized.lower()

    all_replacements = []
    all_brands = []

    # Step 1: Expand abbreviations
    normalized, abbrev_replacements = expand_abbreviations(normalized, terminology)
    all_replacements.extend(abbrev_replacements)

    # Step 2: Detect brands (don't replace, just note them)
    _, brands = normalize_brands(normalized, terminology)
    all_brands.extend(brands)

    # Step 3: Normalize trade slang
    normalized, trade_replacements = normalize_trades(normalized, terminology)
    all_replacements.extend(trade_replacements)

    # Step 4: Normalize material synonyms
    normalized, material_replacements = normalize_materials(normalized, terminology)
    all_replacements.extend(material_replacements)

    # Final cleanup
    normalized = clean_text(normalized)

    return {
        "normalized_text": normalized,
        "replacements": all_replacements,
        "detected_brands": all_brands
    }


def normalize_text(text: str) -> str:
    """
    Simple interface - just return normalized text.

    Args:
        text: Raw text

    Returns:
        Normalized text string
    """
    result = normalize(text)
    return result["normalized_text"]


# Quick test
if __name__ == "__main__":
    test_texts = [
        "GWB installation at Level 2 needs QA/QC review",
        "The sparkies need to coordinate with HVAC guys on MEP rough-in",
        "Hilti anchors for curtainwall mullion connection per Sika sealant spec",
        "RFI for GC regarding sheetrock at breakroom - check ACT ceiling",
        "Tyvek WRB installation behind EIFS system",
    ]

    for text in test_texts:
        result = normalize(text)
        print(f"\nOriginal: {text}")
        print(f"Normalized: {result['normalized_text']}")
        if result['replacements']:
            print(f"Replacements: {result['replacements']}")
        if result['detected_brands']:
            print(f"Brands: {result['detected_brands']}")
