"""
Embedding generation using OpenAI's text-embedding-3-small model.

Supports both sync and async batch processing with rate limiting.
"""

import asyncio
import logging
from typing import Optional
from config import get_openai_client, get_async_openai_client, settings

logger = logging.getLogger(__name__)

# Rate limiting settings
MAX_TOKENS_PER_MINUTE = 1_000_000  # OpenAI's tier 1 limit
TOKENS_PER_TEXT_ESTIMATE = 150  # Conservative average for construction descriptions
BATCH_SIZE = 100  # Max texts per API call (OpenAI allows 2048 but smaller is safer)
REQUESTS_PER_MINUTE = 500  # Stay under the RPM limit


def generate_embedding(text: str) -> list[float]:
    """
    Generate a 1536-dimensional embedding for the given text.

    Args:
        text: The text to embed

    Returns:
        List of 1536 floats representing the embedding
    """
    client = get_openai_client()
    response = client.embeddings.create(
        model=settings.embedding_model,
        input=text
    )
    return response.data[0].embedding


def batch_embed(texts: list[str]) -> list[list[float]]:
    """
    Generate embeddings for multiple texts in a single API call.
    OpenAI supports up to 2048 inputs per call.

    Args:
        texts: List of texts to embed

    Returns:
        List of embeddings (each is a list of 1536 floats)
    """
    if not texts:
        return []

    client = get_openai_client()
    response = client.embeddings.create(
        model=settings.embedding_model,
        input=texts
    )
    return [item.embedding for item in response.data]


async def generate_embedding_async(text: str) -> list[float]:
    """
    Async version of generate_embedding.
    """
    client = get_async_openai_client()
    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=text
    )
    return response.data[0].embedding


async def batch_embed_async(texts: list[str]) -> list[list[float]]:
    """
    Async version of batch_embed.
    """
    if not texts:
        return []

    client = get_async_openai_client()
    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=texts
    )
    return [item.embedding for item in response.data]


async def batch_embed_with_rate_limit(
    texts: list[str],
    batch_size: int = BATCH_SIZE,
    delay_between_batches: float = 0.2
) -> list[list[float]]:
    """
    Generate embeddings for a large number of texts with rate limiting.

    Args:
        texts: List of texts to embed
        batch_size: Number of texts per API call
        delay_between_batches: Seconds to wait between batches

    Returns:
        List of embeddings in the same order as input texts
    """
    if not texts:
        return []

    all_embeddings = []
    total_batches = (len(texts) + batch_size - 1) // batch_size

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        batch_num = (i // batch_size) + 1

        try:
            embeddings = await batch_embed_async(batch)
            all_embeddings.extend(embeddings)

            if batch_num % 10 == 0 or batch_num == total_batches:
                logger.info(f"Embedding progress: {batch_num}/{total_batches} batches")

            # Rate limiting delay
            if i + batch_size < len(texts):
                await asyncio.sleep(delay_between_batches)

        except Exception as e:
            logger.error(f"Batch {batch_num} failed: {e}")
            # Add None for failed embeddings
            all_embeddings.extend([None] * len(batch))

    return all_embeddings


def build_embedding_input(
    normalized_text: str,
    entities: Optional[list] = None,
    project_phase: Optional[str] = None,
    issue_type: Optional[str] = None
) -> str:
    """
    Build a rich embedding input by combining normalized text with entity context.
    This creates more meaningful embeddings that capture semantic relationships.

    Args:
        normalized_text: The cleaned/normalized description text
        entities: List of extracted entities (dicts with entity_type and normalized_value)
        project_phase: Current project phase (e.g., "envelope", "mep_rough_in")
        issue_type: Type of issue (e.g., "workmanship", "coordination")

    Returns:
        Combined string optimized for embedding
    """
    parts = [normalized_text]

    if entities:
        trades = [e["normalized_value"] for e in entities if e.get("entity_type") == "trade"]
        materials = [e["normalized_value"] for e in entities if e.get("entity_type") == "material"]
        locations = [e["normalized_value"] for e in entities if e.get("entity_type") == "location"]

        if trades:
            parts.append(f"Trades: {', '.join(trades)}")
        if materials:
            parts.append(f"Materials: {', '.join(materials)}")
        if locations:
            parts.append(f"Location: {', '.join(locations)}")

    if project_phase:
        parts.append(f"Phase: {project_phase}")

    if issue_type:
        parts.append(f"Issue type: {issue_type}")

    return " | ".join(parts)
