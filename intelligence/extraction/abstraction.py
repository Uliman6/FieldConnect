"""
RFI Abstraction Module - Extract core scope and key terms from RFI text.

This module provides scalable abstraction of construction RFIs:
1. Rule-based noise stripping (instant, free)
2. LLM summarization for scope + key terms (batch, cached)
3. Issue type classification

The abstracted summary is used for better semantic matching.
"""

import re
import json
import asyncio
import logging
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class RFIAbstraction:
    """Abstracted representation of an RFI."""
    scope_summary: str          # 1-2 sentence summary of the core issue
    key_terms: list[str]        # Technical terms for matching
    issue_type: str             # Category: dimension, material, coordination, etc.
    drawing_refs: list[str]     # Referenced drawings/details
    original_length: int        # Length of original text


# Noise patterns to strip from RFI text before processing
NOISE_PATTERNS = [
    # Project-specific identifiers
    (r'D0-A20007-00 LPSC Phase \d', ''),
    (r'SLP1\s*-\s*RFI[- ]?\d+(?:\.\d+)?(?:\s*-[^-\n]+)?', ''),  # SLP1 - RFI-1234 - Title
    (r'Created by .+? with Autodesk[^.]*\.?', ''),
    (r'Page \d+ of \d+', ''),
    (r'RFI detail #\d+', ''),

    # Timestamps and metadata
    (r'on [A-Z][a-z]+ \d+, \d{4} at \d+:\d+ [AP]M [A-Z]+', ''),
    (r'[A-Z][a-z]+ \d+, \d{4}', ''),  # Date patterns

    # Section headers (we want content, not headers)
    (r'^Reference:\s*', '', re.MULTILINE),
    (r'^Referenced Documents?:\s*', '', re.MULTILINE),
    (r'^Referenced Attachments?:\s*', '', re.MULTILINE),
    (r'^Background:\s*', '', re.MULTILINE),
    (r'^Question:\s*', '', re.MULTILINE),
    (r'^Post on:\s*', '', re.MULTILINE),
    (r'^POST TO:\s*', '', re.MULTILINE),
    (r'^REF:\s*', '', re.MULTILINE),

    # Procedural phrases that add no semantic value
    (r'This is a confirming RFI\.?\s*', ''),
    (r'Please confirm it is acceptable to\s+', 'Is it acceptable to '),
    (r'Please confirm that\s+', ''),
    (r'Please confirm\s+', ''),
    (r'Please advise\.?\s*', ''),
    (r'Please see attached\.?\s*', ''),
    (r'Please review the attached\.?\s*', ''),
    (r'See attached\.?\s*', ''),

    # Email/correspondence noise
    (r'Email [Cc]orrespondence between [^.]+\.?\s*', ''),
    (r'Per conversation with [^,]+,\s*', ''),
    (r'Per discussions? between [^,]+,\s*', ''),
    (r'As discussed on \d+/\d+(?:/\d+)?,?\s*', ''),

    # Company names and roles (keep generic)
    (r'\(DPR Construction\)', ''),
    (r'\(DES Architects[^)]*\)', ''),
    (r'DPR Construction', 'contractor'),
    (r'GPLA', 'structural engineer'),
    (r'SEOR', 'structural engineer'),
]


# Issue type patterns for classification
ISSUE_TYPE_PATTERNS = {
    'dimension_clarification': [
        r'dimension', r'width', r'height', r'length', r'clearance', r'depth',
        r'thickness', r'size', r'spacing', r'offset', r'elevation', r'slope',
    ],
    'material_substitution': [
        r'substitute', r'substitution', r'equivalent', r'alternate', r'acceptable product',
        r'in lieu of', r'instead of', r'or equal',
    ],
    'detail_conflict': [
        r'conflict', r'discrepancy', r'contradiction', r"doesn't match", r'do not match',
        r'inconsistent', r'different from', r'differs from', r'mismatch',
    ],
    'coordination': [
        r'clash', r'interference', r'routing', r'coordination', r'coordinate',
        r'conflicts with', r'obstructs', r'blocked by',
    ],
    'missing_information': [
        r'missing', r'not shown', r'not indicated', r'not specified', r'unclear',
        r'not provided', r'no detail', r'not called out',
    ],
    'confirmation': [
        r'confirm', r'verify', r'acceptable to proceed', r'is it acceptable',
        r'approval', r'please advise',
    ],
    'remediation': [
        r'repair', r'remediat', r'fix', r'damaged', r'defect', r'correct',
        r'as-built', r'deviat', r'out of tolerance',
    ],
    'installation_method': [
        r'how to install', r'installation method', r'sequence', r'procedure',
        r'attach', r'connection', r'weld', r'bolt', r'anchor',
    ],
}


def strip_noise(text: str) -> str:
    """
    Remove noise patterns from RFI text.

    This is the first step in abstraction - removing project-specific
    identifiers, procedural phrases, and metadata that don't contribute
    to semantic matching.
    """
    if not text:
        return ""

    result = text

    for pattern_tuple in NOISE_PATTERNS:
        if len(pattern_tuple) == 2:
            pattern, replacement = pattern_tuple
            flags = 0
        else:
            pattern, replacement, flags = pattern_tuple

        result = re.sub(pattern, replacement, result, flags=flags | re.IGNORECASE)

    # Normalize whitespace
    result = re.sub(r'\s+', ' ', result)
    result = result.strip()

    return result


def extract_clean_question(text: str) -> str:
    """
    Extract the actual question/issue from RFI text for display.

    This is more aggressive than strip_noise() - it removes all
    reference headers, RFI identifiers, and procedural language
    to extract just the core question being asked.

    Use this for:
    - Displaying RFI summaries to users
    - CSV exports for review
    - Search result snippets

    Args:
        text: Raw RFI text (question_text or raw_text)

    Returns:
        Cleaned question text suitable for display
    """
    if not text:
        return ""

    result = text

    # Remove ALL SLP1 - RFI patterns wherever they appear
    # Pattern: SLP1 - RFI0123 - Title or SLP1 - RFI 0123 - Title
    # These add no value for question display
    result = re.sub(
        r'SLP1\s*-\s*RFI[- ]?\d+(?:\.\d+)?(?:\s*-[^:.\n]+)?:?\s*',
        '', result, flags=re.IGNORECASE
    )

    # Reference: SLP1 - RFI... pattern (captures to Question:)
    result = re.sub(
        r'Reference:\s*SLP1\s*-\s*RFI[^Q]*(?=Question:)',
        '', result, flags=re.IGNORECASE
    )

    # Remove standalone RFI-XXXX patterns at start with various prefixes/suffixes
    # Handles: "RFI 0132 -", "SVOP RFI-086", "RFI-319 DPR Markup;", etc.
    result = re.sub(
        r'^,?\s*(?:DPR\s+|SVOP\s+)?RFI[- ]?\d+(?:\.\d+)?(?:\s+(?:DPR\s+)?(?:Markup|Response))?[;]?(?:\s*[-:][^:.\n]+)?:?\s*',
        '', result, flags=re.IGNORECASE
    )

    # Remove "BLDGSITE -" and "Onsite -" prefixes
    result = re.sub(
        r'^(?:BLDGSITE|Onsite|Offsite)\s*[-–]\s*',
        '', result, flags=re.IGNORECASE
    )

    # Remove mid-text "RFI XXXX shows" or "per RFI XXXX" patterns - but keep the rest
    result = re.sub(
        r'\b(?:per\s+)?RFI[- ]?\d+(?:\.\d+)?\s+(?:shows?|states?|indicates?)\s+',
        '', result, flags=re.IGNORECASE
    )

    # Remove all types of reference headers with their content up to "Question:" if present
    # Handles: Reference:, Reference Drawing:, Referenced Documents:, Reference Details:, etc.
    ref_to_question = re.search(
        r'^(?:Reference[ds]?(?:\s+(?:Drawing|Detail|Document|Sheet|Attachment)s?)?|Ref|REF):\s*.+?(?=Question:)',
        result, flags=re.IGNORECASE | re.DOTALL
    )
    if ref_to_question:
        result = result[ref_to_question.end():]

    # Remove remaining reference headers at the start (all variants)
    result = re.sub(
        r'^(?:Reference[ds]?(?:\s+(?:Drawing|Detail|Document|Sheet|Attachment)s?)?|Ref|REF):\s*',
        '', result, flags=re.IGNORECASE
    )

    # Also remove mid-text reference lines that start on their own line
    result = re.sub(
        r'\n(?:Reference[ds]?(?:\s+(?:Drawing|Detail|Document|Sheet|Attachment)s?)?|Ref):\s*[^\n]+',
        '\n', result, flags=re.IGNORECASE
    )

    # Remove sheet references at the very start (A2.01, S5.3, E1.00, etc.)
    result = re.sub(
        r'^[A-Z]\d+\.\d+[A-Z]?(?:\s*,\s*[A-Z]\d+\.\d+[A-Z]?)*\s*',
        '', result
    )

    # Remove "Offsite" or "Onsite" prefixes with codes (e.g., "Offsite C6.6")
    result = re.sub(
        r'^(?:Offsite|Onsite)\s+[A-Z]\d+(?:\.\d+)?\s*',
        '', result, flags=re.IGNORECASE
    )

    # Remove "Site - Offsite Current Set:" boilerplate
    result = re.sub(
        r'^Site\s*[-–]\s*(?:Offsite|Onsite)?\s*(?:Current\s+Set:?)?\s*',
        '', result, flags=re.IGNORECASE
    )

    # Remove standalone drawing codes like "C6.6" or "M-101" at the start
    result = re.sub(
        r'^[A-Z]-?\d+(?:\.\d+)?\s+',
        '', result
    )

    # Find "Question:" marker and extract from there
    question_match = re.search(r'Question:\s*(.+)', result, flags=re.IGNORECASE | re.DOTALL)
    if question_match:
        result = question_match.group(1)

    # If there's a "Background:" followed by "Question:", remove Background section
    bg_then_q = re.search(
        r'Background:.*?Question:\s*',
        result, flags=re.IGNORECASE | re.DOTALL
    )
    if bg_then_q:
        result = result[bg_then_q.end():]

    # Remove "Post on:" / "POST TO:" lines
    result = re.sub(r'(?:Post on|POST TO):\s*[^\n]+\n?', '', result, flags=re.IGNORECASE)

    # Remove "Please see attached" type endings
    result = re.sub(r'\s*Please see attached\.?\s*$', '', result, flags=re.IGNORECASE)
    result = re.sub(r'\s*See attached\.?\s*$', '', result, flags=re.IGNORECASE)
    result = re.sub(r'\s*Please review the attached\.?\s*$', '', result, flags=re.IGNORECASE)

    # Remove common procedural starts (but keep the actual content)
    result = re.sub(r'^Please confirm (?:it is )?acceptable to\s+', '', result, flags=re.IGNORECASE)
    result = re.sub(r'^Please confirm that\s+', '', result, flags=re.IGNORECASE)
    result = re.sub(r'^Please confirm\s+', '', result, flags=re.IGNORECASE)
    result = re.sub(r'^Please advise\s+', '', result, flags=re.IGNORECASE)
    result = re.sub(r'^Please review\s+', '', result, flags=re.IGNORECASE)

    # Remove working days / metadata lines that sometimes appear
    result = re.sub(
        r'Working Days Date Created:.*?(?:Reason|$)',
        '', result, flags=re.IGNORECASE | re.DOTALL
    )

    # Clean up whitespace
    result = re.sub(r'\s+', ' ', result)
    result = result.strip()

    # If we stripped too much (less than 20 chars) but original had content,
    # fall back to basic cleaning
    if len(result) < 20 and len(text) > 30:
        # Just remove Reference header and normalize
        fallback = re.sub(
            r'^(?:Reference|Ref|Referenced Documents?):[^Q]*(?:Question:)?\s*',
            '', text, flags=re.IGNORECASE
        )
        fallback = re.sub(r'\s+', ' ', fallback).strip()
        if len(fallback) > len(result):
            result = fallback

    return result


def is_revision_of(ref1: str, ref2: str) -> bool:
    """
    Check if two RFI references are revisions of the same RFI.

    Examples of revisions (should return True):
    - RFI-0030 and RFI-0030.1
    - RFI-0030.1 and RFI-0030.2
    - RFI-133 and RFI-133.4

    Examples of different RFIs (should return False):
    - RFI-0030 and RFI-0031
    - RFI-30 and RFI-130

    Args:
        ref1: First RFI reference (e.g., "RFI-0030.1")
        ref2: Second RFI reference (e.g., "RFI-0030")

    Returns:
        True if they are revisions of the same base RFI
    """
    if not ref1 or not ref2:
        return False

    # Normalize to lowercase
    r1 = ref1.lower().strip()
    r2 = ref2.lower().strip()

    # If identical, they're the same (not a "match" scenario)
    if r1 == r2:
        return True

    # Extract base RFI number (before any .revision suffix)
    # Pattern: RFI-0030.1 -> RFI-0030, RFI-133.4 -> RFI-133
    def get_base(ref: str) -> str:
        # Remove revision suffix (.1, .2, etc.)
        match = re.match(r'^(rfi-?\d+)(?:\.\d+)?$', ref, re.IGNORECASE)
        if match:
            return match.group(1).lower()
        return ref.lower()

    base1 = get_base(r1)
    base2 = get_base(r2)

    return base1 == base2


def filter_revision_matches(
    query_ref: str,
    candidates: list[dict],
    ref_field: str = "source_ref"
) -> list[dict]:
    """
    Filter out candidates that are revisions of the query RFI.

    Use this after similarity search to remove matches that are
    just different revisions of the same RFI (e.g., RFI-0030.1
    matching RFI-0030).

    Args:
        query_ref: The query RFI reference (e.g., "RFI-0030.1")
        candidates: List of candidate dicts with source_ref field
        ref_field: Field name containing the RFI reference

    Returns:
        Filtered list with revisions removed
    """
    if not query_ref:
        return candidates

    return [
        c for c in candidates
        if not is_revision_of(query_ref, c.get(ref_field, ""))
    ]


def extract_drawing_refs(text: str) -> list[str]:
    """Extract drawing/detail references from text."""
    refs = []

    # Pattern: Detail X/SheetName or X/SheetName
    detail_pattern = r'(?:Detail\s+)?(\d+)/([A-Z]\d+(?:\.\d+)?(?:[A-Z])?)'
    for match in re.finditer(detail_pattern, text, re.IGNORECASE):
        refs.append(f"{match.group(1)}/{match.group(2)}")

    # Pattern: Sheet references like A2.01, S5.3, E1.00
    sheet_pattern = r'\b([A-Z]\d+\.\d+(?:[A-Z])?)\b'
    for match in re.finditer(sheet_pattern, text):
        if match.group(1) not in refs:
            refs.append(match.group(1))

    return list(set(refs))[:10]  # Limit to 10 refs


def classify_issue_type(text: str) -> str:
    """
    Classify RFI into issue type based on keyword patterns.

    Returns the most likely issue type.
    """
    text_lower = text.lower()
    scores = {}

    for issue_type, patterns in ISSUE_TYPE_PATTERNS.items():
        score = sum(1 for p in patterns if re.search(p, text_lower))
        if score > 0:
            scores[issue_type] = score

    if not scores:
        return 'general'

    return max(scores, key=scores.get)


# LLM Summarization prompt
ABSTRACTION_PROMPT = """You are a construction document analyst. Extract the core technical issue from this RFI (Request for Information).

RFI TEXT:
{text}

Respond in this exact JSON format:
{{
  "scope": "<1-2 sentence summary of the core technical issue, without project references or procedural language>",
  "terms": ["<technical term 1>", "<technical term 2>", ...],
  "issue_type": "<one of: dimension, material, detail_conflict, coordination, missing_info, confirmation, remediation, installation>"
}}

Focus on:
- The specific construction element (beam, column, plate, duct, etc.)
- The technical problem (dimension mismatch, weld access, clearance, etc.)
- Key technical terms for matching similar issues

Do NOT include:
- Project names or RFI numbers
- "Please confirm" or other procedural phrases
- Drawing sheet numbers (unless critical to the issue)

Example:
Input: "Reference: SLP1 - RFI0806 - B1 Splice Plate Width Clarification. The width provided for the Splice Plate is the same as the Primary Plate. This will not provide a step to achieve the fillet weld on 3 sides as noted on S6.2. Please confirm acceptable to proceed."

Output: {{"scope": "Splice plate width matches primary plate, preventing the required step for 3-sided fillet weld access", "terms": ["splice plate", "fillet weld", "weld access", "plate width", "connection detail"], "issue_type": "detail_conflict"}}
"""


async def abstract_with_llm(
    text: str,
    client,  # OpenAI client
    model: str = "gpt-4o-mini"
) -> Optional[RFIAbstraction]:
    """
    Use LLM to generate abstracted summary of RFI.

    Args:
        text: The RFI text (ideally already noise-stripped)
        client: OpenAI client instance
        model: Model to use (default: gpt-4o-mini for cost efficiency)

    Returns:
        RFIAbstraction with scope, terms, and issue type
    """
    # First strip noise
    cleaned = strip_noise(text)

    if len(cleaned) < 20:
        logger.warning("Text too short after noise stripping")
        return None

    # Truncate if too long (save tokens)
    if len(cleaned) > 2000:
        cleaned = cleaned[:2000] + "..."

    prompt = ABSTRACTION_PROMPT.format(text=cleaned)

    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.1,
            response_format={"type": "json_object"}
        )

        content = response.choices[0].message.content
        data = json.loads(content)

        return RFIAbstraction(
            scope_summary=data.get("scope", ""),
            key_terms=data.get("terms", []),
            issue_type=data.get("issue_type", "general"),
            drawing_refs=extract_drawing_refs(text),
            original_length=len(text),
        )

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response as JSON: {e}")
        return None
    except Exception as e:
        logger.error(f"LLM abstraction failed: {e}")
        return None


def abstract_rule_based(text: str) -> RFIAbstraction:
    """
    Rule-based abstraction fallback (no LLM, instant).

    Used when LLM is not available or for quick processing.
    """
    cleaned = strip_noise(text)
    drawing_refs = extract_drawing_refs(text)
    issue_type = classify_issue_type(cleaned)

    # Extract key terms using simple noun phrase patterns
    # This is a simplified version - could be enhanced with spaCy
    key_terms = []

    # Technical noun phrases (adjective + noun patterns)
    term_patterns = [
        r'\b(splice plate|base plate|cover plate|shear plate|collector plate)\b',
        r'\b(fillet weld|butt weld|plug weld|slot weld)\b',
        r'\b(anchor bolt|expansion bolt|through bolt|lag bolt)\b',
        r'\b(shear wall|retaining wall|curtain wall|parapet wall)\b',
        r'\b(floor drain|trench drain|roof drain|area drain)\b',
        r'\b(control joint|expansion joint|construction joint|cold joint)\b',
        r'\b(waterproofing|fireproofing|soundproofing|weatherproofing)\b',
        r'\b(conduit|ductwork|piping|cable tray)\b',
        r'\b(footing|foundation|slab|deck|beam|column|girder)\b',
        r'\b(elevation|dimension|clearance|tolerance|spacing)\b',
    ]

    for pattern in term_patterns:
        matches = re.findall(pattern, cleaned, re.IGNORECASE)
        key_terms.extend(matches)

    key_terms = list(set(t.lower() for t in key_terms))[:10]

    # Create a simple scope summary (first sentence or truncated)
    sentences = re.split(r'[.!?]+', cleaned)
    scope = sentences[0].strip() if sentences else cleaned[:200]
    if len(scope) > 200:
        scope = scope[:197] + "..."

    return RFIAbstraction(
        scope_summary=scope,
        key_terms=key_terms,
        issue_type=issue_type,
        drawing_refs=drawing_refs,
        original_length=len(text),
    )


def abstraction_to_json(abstraction: RFIAbstraction) -> dict:
    """Convert abstraction to JSON-serializable dict."""
    return {
        "scope_summary": abstraction.scope_summary,
        "key_terms": abstraction.key_terms,
        "issue_type": abstraction.issue_type,
        "drawing_refs": abstraction.drawing_refs,
        "original_length": abstraction.original_length,
    }


def json_to_abstraction(data: dict) -> RFIAbstraction:
    """Convert JSON dict back to RFIAbstraction."""
    return RFIAbstraction(
        scope_summary=data.get("scope_summary", ""),
        key_terms=data.get("key_terms", []),
        issue_type=data.get("issue_type", "general"),
        drawing_refs=data.get("drawing_refs", []),
        original_length=data.get("original_length", 0),
    )
