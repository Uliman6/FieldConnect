"""Similarity module for embeddings and semantic search."""

from similarity.embeddings import (
    generate_embedding,
    generate_embedding_async,
    batch_embed,
    batch_embed_async,
    batch_embed_with_rate_limit,
    build_embedding_input
)

from similarity.search import (
    cosine_similarity,
    compute_similarities,
    search_similar,
    search_and_rank,
    get_candidates_with_embeddings,
    get_entities_for_candidates
)

from similarity.tiered_search import (
    tiered_search_and_rank,
    extract_search_keywords,
    get_related_trades,
    load_trade_adjacencies,
    TIER_BOOSTS
)

from similarity.ranking import (
    calculate_phase_score,
    calculate_entity_overlap_score,
    calculate_outcome_score,
    calculate_recency_score,
    compute_ranking_score,
    rank_candidates,
    explain_ranking,
    DEFAULT_WEIGHTS,
    PHASE_ORDER
)

from similarity.pipeline import (
    generate_embeddings_for_items,
    get_embedding_statistics
)

__all__ = [
    # Embedding generation
    "generate_embedding",
    "generate_embedding_async",
    "batch_embed",
    "batch_embed_async",
    "batch_embed_with_rate_limit",
    "build_embedding_input",
    # Similarity search
    "cosine_similarity",
    "compute_similarities",
    "search_similar",
    "search_and_rank",
    "get_candidates_with_embeddings",
    "get_entities_for_candidates",
    # Tiered search
    "tiered_search_and_rank",
    "extract_search_keywords",
    "get_related_trades",
    "load_trade_adjacencies",
    "TIER_BOOSTS",
    # Ranking
    "calculate_phase_score",
    "calculate_entity_overlap_score",
    "calculate_outcome_score",
    "calculate_recency_score",
    "compute_ranking_score",
    "rank_candidates",
    "explain_ranking",
    "DEFAULT_WEIGHTS",
    "PHASE_ORDER",
    # Pipeline
    "generate_embeddings_for_items",
    "get_embedding_statistics",
]
