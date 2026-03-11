"""
Different retrieval approaches to test and compare.

Each approach takes a query and returns ranked candidates with scores.
"""

import math
import numpy as np
from collections import Counter
from typing import Optional

# Add parent to path for imports
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from extraction.keywords import extract_keywords, tokenize


# =============================================================================
# APPROACH 1: BM25 (Sparse Retrieval Baseline)
# =============================================================================

class BM25:
    """
    BM25 ranking function - the standard baseline for text retrieval.

    BM25 is essentially TF-IDF with better term frequency saturation
    and document length normalization.
    """

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        """
        Args:
            k1: Term frequency saturation parameter (1.2-2.0 typical)
            b: Length normalization parameter (0.75 typical)
        """
        self.k1 = k1
        self.b = b
        self.doc_freqs = {}  # term -> number of docs containing term
        self.doc_lens = []   # length of each document
        self.avg_doc_len = 0
        self.corpus_size = 0
        self.docs = []       # tokenized documents
        self.doc_ids = []    # original document IDs

    def fit(self, documents: list[dict], text_field: str = "text"):
        """
        Fit BM25 on a corpus of documents.

        Args:
            documents: List of dicts with 'id' and text_field
            text_field: Field containing the text to index
        """
        self.docs = []
        self.doc_ids = []
        self.doc_freqs = Counter()
        self.doc_lens = []

        for doc in documents:
            doc_id = doc.get("id")
            text = doc.get(text_field, "") or ""
            tokens = tokenize(text)

            self.docs.append(tokens)
            self.doc_ids.append(doc_id)
            self.doc_lens.append(len(tokens))

            # Count document frequency (unique terms per doc)
            unique_terms = set(tokens)
            for term in unique_terms:
                self.doc_freqs[term] += 1

        self.corpus_size = len(self.docs)
        self.avg_doc_len = sum(self.doc_lens) / self.corpus_size if self.corpus_size > 0 else 0

    def _idf(self, term: str) -> float:
        """Calculate IDF for a term."""
        df = self.doc_freqs.get(term, 0)
        if df == 0:
            return 0
        # BM25 IDF formula
        return math.log((self.corpus_size - df + 0.5) / (df + 0.5) + 1)

    def score(self, query: str, doc_idx: int) -> float:
        """Score a single document against a query."""
        query_tokens = tokenize(query)
        doc_tokens = self.docs[doc_idx]
        doc_len = self.doc_lens[doc_idx]

        # Term frequencies in this document
        tf = Counter(doc_tokens)

        score = 0.0
        for term in query_tokens:
            if term not in tf:
                continue

            term_freq = tf[term]
            idf = self._idf(term)

            # BM25 scoring formula
            numerator = term_freq * (self.k1 + 1)
            denominator = term_freq + self.k1 * (1 - self.b + self.b * doc_len / self.avg_doc_len)
            score += idf * (numerator / denominator)

        return score

    def rank(self, query: str, top_k: int = 20) -> list[tuple[str, float]]:
        """
        Rank all documents against a query.

        Returns:
            List of (doc_id, score) tuples, sorted by score descending
        """
        scores = []
        for idx in range(self.corpus_size):
            score = self.score(query, idx)
            if score > 0:
                scores.append((self.doc_ids[idx], score))

        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]


# =============================================================================
# APPROACH 2: Embedding Similarity (Dense Retrieval)
# =============================================================================

def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    v1 = np.array(vec1)
    v2 = np.array(vec2)
    dot = np.dot(v1, v2)
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(dot / (norm1 * norm2))


class EmbeddingRetriever:
    """
    Dense retrieval using pre-computed embeddings.
    """

    def __init__(self):
        self.doc_ids = []
        self.embeddings = []  # List of numpy arrays

    def fit(self, documents: list[dict], embedding_field: str = "embedding"):
        """
        Fit on documents with pre-computed embeddings.

        Args:
            documents: List of dicts with 'id' and embedding_field
            embedding_field: Field containing the embedding vector
        """
        self.doc_ids = []
        self.embeddings = []

        for doc in documents:
            emb = doc.get(embedding_field)
            if emb is not None and len(emb) > 0:
                self.doc_ids.append(doc.get("id"))
                self.embeddings.append(np.array(emb))

    def rank(self, query_embedding: list[float], top_k: int = 20) -> list[tuple[str, float]]:
        """
        Rank documents by cosine similarity to query embedding.

        Returns:
            List of (doc_id, score) tuples, sorted by score descending
        """
        if not self.embeddings:
            return []

        query_vec = np.array(query_embedding)
        scores = []

        for idx, doc_emb in enumerate(self.embeddings):
            sim = cosine_similarity(query_vec, doc_emb)
            scores.append((self.doc_ids[idx], sim))

        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]


# =============================================================================
# APPROACH 3: Keyword Match (Current System's Core Signal)
# =============================================================================

class KeywordRetriever:
    """
    Retrieval based on keyword overlap using the data-driven keyword index.
    """

    def __init__(self):
        self.doc_ids = []
        self.doc_keywords = []  # List of keyword sets
        self.doc_texts = []

    def fit(self, documents: list[dict], text_field: str = "text"):
        """
        Extract keywords from all documents.
        """
        self.doc_ids = []
        self.doc_keywords = []
        self.doc_texts = []

        for doc in documents:
            text = doc.get(text_field, "") or ""
            keywords = extract_keywords(text)

            self.doc_ids.append(doc.get("id"))
            self.doc_keywords.append(keywords)
            self.doc_texts.append(text)

    def rank(self, query: str, top_k: int = 20) -> list[tuple[str, float]]:
        """
        Rank documents by keyword overlap.

        Scoring:
        - 0 matches: 0.0
        - 1 match: 0.4
        - 2 matches: 0.7
        - 3+ matches: 0.85+
        """
        query_keywords = extract_keywords(query)
        if not query_keywords:
            return []

        scores = []
        for idx, doc_keywords in enumerate(self.doc_keywords):
            matched = query_keywords & doc_keywords
            match_count = len(matched)

            if match_count == 0:
                score = 0.0
            elif match_count == 1:
                score = 0.4
            elif match_count == 2:
                score = 0.7
            else:
                score = min(1.0, 0.85 + (match_count - 3) * 0.05)

            if score > 0:
                scores.append((self.doc_ids[idx], score, list(matched)))

        scores.sort(key=lambda x: x[1], reverse=True)
        return [(doc_id, score) for doc_id, score, _ in scores[:top_k]]


# =============================================================================
# APPROACH 4: Hybrid (BM25 + Embeddings)
# =============================================================================

class HybridRetriever:
    """
    Combines BM25 and embedding similarity with configurable weights.
    """

    def __init__(
        self,
        bm25_weight: float = 0.5,
        embedding_weight: float = 0.5,
    ):
        self.bm25_weight = bm25_weight
        self.embedding_weight = embedding_weight
        self.bm25 = BM25()
        self.embedding_retriever = EmbeddingRetriever()

    def fit(
        self,
        documents: list[dict],
        text_field: str = "text",
        embedding_field: str = "embedding"
    ):
        """Fit both retrievers."""
        self.bm25.fit(documents, text_field)
        self.embedding_retriever.fit(documents, embedding_field)

        # Store doc_ids for merging
        self.all_doc_ids = set(self.bm25.doc_ids) | set(self.embedding_retriever.doc_ids)

    def rank(
        self,
        query: str,
        query_embedding: Optional[list[float]] = None,
        top_k: int = 20
    ) -> list[tuple[str, float]]:
        """
        Rank using combined BM25 and embedding scores.
        """
        # Get BM25 scores
        bm25_results = self.bm25.rank(query, top_k=100)
        bm25_scores = {doc_id: score for doc_id, score in bm25_results}

        # Normalize BM25 scores to 0-1
        if bm25_scores:
            max_bm25 = max(bm25_scores.values())
            if max_bm25 > 0:
                bm25_scores = {k: v / max_bm25 for k, v in bm25_scores.items()}

        # Get embedding scores
        emb_scores = {}
        if query_embedding is not None:
            emb_results = self.embedding_retriever.rank(query_embedding, top_k=100)
            emb_scores = {doc_id: score for doc_id, score in emb_results}

        # Combine scores
        combined = {}
        all_ids = set(bm25_scores.keys()) | set(emb_scores.keys())

        for doc_id in all_ids:
            bm25_score = bm25_scores.get(doc_id, 0)
            emb_score = emb_scores.get(doc_id, 0)
            combined[doc_id] = (
                self.bm25_weight * bm25_score +
                self.embedding_weight * emb_score
            )

        # Sort and return
        ranked = sorted(combined.items(), key=lambda x: x[1], reverse=True)
        return ranked[:top_k]


# =============================================================================
# APPROACH 5: Full Hybrid (Current System - All Signals)
# =============================================================================

class FullHybridRetriever:
    """
    Full hybrid with all signals: BM25, embeddings, keywords, phase, entities.
    This mirrors the current production ranking logic.
    """

    def __init__(
        self,
        weights: Optional[dict] = None
    ):
        self.weights = weights or {
            "keyword": 0.35,
            "semantic": 0.30,
            "bm25": 0.20,  # Added BM25 to the mix
            "phase": 0.10,
            "entity": 0.05,
        }
        self.bm25 = BM25()
        self.embedding_retriever = EmbeddingRetriever()
        self.keyword_retriever = KeywordRetriever()
        self.doc_metadata = {}  # id -> {phase, entities, etc.}

    def fit(
        self,
        documents: list[dict],
        text_field: str = "text",
        embedding_field: str = "embedding"
    ):
        """Fit all retrievers and store metadata."""
        self.bm25.fit(documents, text_field)
        self.embedding_retriever.fit(documents, embedding_field)
        self.keyword_retriever.fit(documents, text_field)

        # Store metadata
        for doc in documents:
            self.doc_metadata[doc.get("id")] = {
                "phase": doc.get("phase"),
                "trade": doc.get("trade"),
                "entities": doc.get("entities", []),
            }

    def _phase_score(self, query_phase: Optional[str], doc_phase: Optional[str]) -> float:
        """Score based on construction phase proximity."""
        if not query_phase or not doc_phase:
            return 0.5  # Neutral

        phases = [
            "preconstruction", "sitework", "foundation", "structure",
            "envelope", "mep_rough_in", "interior_finishes",
            "mep_trim_out", "commissioning", "closeout"
        ]

        try:
            q_idx = phases.index(query_phase)
            d_idx = phases.index(doc_phase)
            distance = abs(q_idx - d_idx)

            if distance == 0:
                return 1.0
            elif distance == 1:
                return 0.85
            elif distance == 2:
                return 0.6
            else:
                return max(0.2, 1.0 - distance * 0.15)
        except ValueError:
            return 0.5

    def _entity_score(self, query_entities: set, doc_entities: set) -> float:
        """Score based on entity overlap."""
        if not query_entities or not doc_entities:
            return 0.0

        overlap = len(query_entities & doc_entities)
        union = len(query_entities | doc_entities)

        if union == 0:
            return 0.0
        return overlap / union  # Jaccard similarity

    def rank(
        self,
        query: str,
        query_embedding: Optional[list[float]] = None,
        query_phase: Optional[str] = None,
        query_entities: Optional[set] = None,
        top_k: int = 20
    ) -> list[tuple[str, float, dict]]:
        """
        Rank using all signals.

        Returns:
            List of (doc_id, final_score, score_breakdown) tuples
        """
        # Get individual scores
        bm25_results = dict(self.bm25.rank(query, top_k=100))
        keyword_results = dict(self.keyword_retriever.rank(query, top_k=100))

        emb_results = {}
        if query_embedding:
            emb_results = dict(self.embedding_retriever.rank(query_embedding, top_k=100))

        # Normalize BM25
        if bm25_results:
            max_bm25 = max(bm25_results.values())
            if max_bm25 > 0:
                bm25_results = {k: v / max_bm25 for k, v in bm25_results.items()}

        # Combine
        all_ids = set(bm25_results.keys()) | set(keyword_results.keys()) | set(emb_results.keys())

        ranked = []
        for doc_id in all_ids:
            bm25_score = bm25_results.get(doc_id, 0)
            keyword_score = keyword_results.get(doc_id, 0)
            semantic_score = emb_results.get(doc_id, 0)

            meta = self.doc_metadata.get(doc_id, {})
            phase_score = self._phase_score(query_phase, meta.get("phase"))

            doc_entities = set(meta.get("entities", []))
            entity_score = self._entity_score(query_entities or set(), doc_entities)

            # Weighted combination
            final_score = (
                self.weights.get("keyword", 0) * keyword_score +
                self.weights.get("semantic", 0) * semantic_score +
                self.weights.get("bm25", 0) * bm25_score +
                self.weights.get("phase", 0) * phase_score +
                self.weights.get("entity", 0) * entity_score
            )

            breakdown = {
                "bm25": bm25_score,
                "keyword": keyword_score,
                "semantic": semantic_score,
                "phase": phase_score,
                "entity": entity_score,
            }

            ranked.append((doc_id, final_score, breakdown))

        ranked.sort(key=lambda x: x[1], reverse=True)
        return ranked[:top_k]


# =============================================================================
# Factory function to get retriever by name
# =============================================================================

def get_retriever(name: str, **kwargs):
    """
    Get a retriever instance by name.

    Args:
        name: One of 'bm25', 'embedding', 'keyword', 'hybrid', 'full_hybrid'
        **kwargs: Passed to retriever constructor
    """
    retrievers = {
        "bm25": BM25,
        "embedding": EmbeddingRetriever,
        "keyword": KeywordRetriever,
        "hybrid": HybridRetriever,
        "full_hybrid": FullHybridRetriever,
    }

    if name not in retrievers:
        raise ValueError(f"Unknown retriever: {name}. Choose from: {list(retrievers.keys())}")

    return retrievers[name](**kwargs)
