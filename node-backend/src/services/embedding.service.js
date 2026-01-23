/**
 * Embedding Service - OpenAI text embeddings for semantic similarity
 * Uses text-embedding-3-small model (1536 dimensions)
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

class EmbeddingService {
  /**
   * Check if embedding service is available
   */
  isAvailable() {
    return !!OPENAI_API_KEY;
  }

  /**
   * Generate embedding for text using OpenAI API
   * @param {string} text - Text to embed
   * @returns {Promise<{success: boolean, embedding?: number[], error?: string}>}
   */
  async generateEmbedding(text) {
    if (!this.isAvailable()) {
      console.log('[embedding] OpenAI API key not configured, skipping embedding');
      return { success: false, error: 'OpenAI API key not configured' };
    }

    if (!text || text.trim().length === 0) {
      return { success: false, error: 'Empty text provided' };
    }

    try {
      // Truncate text if too long (max ~8000 tokens for embedding model)
      const truncatedText = text.substring(0, 30000);

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: truncatedText,
          model: EMBEDDING_MODEL
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[embedding] OpenAI API error:', response.status, errorText);
        return { success: false, error: `OpenAI API error: ${response.status}` };
      }

      const data = await response.json();
      const embedding = data.data?.[0]?.embedding;

      if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
        return { success: false, error: 'Invalid embedding response' };
      }

      console.log(`[embedding] Generated ${EMBEDDING_DIMENSIONS}-dim embedding for ${truncatedText.length} chars`);
      return { success: true, embedding };
    } catch (error) {
      console.error('[embedding] Error generating embedding:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate embedding for an insight based on its content
   * @param {object} insight - Insight object with title, description, rawText, etc.
   * @returns {Promise<{success: boolean, embedding?: number[], error?: string}>}
   */
  async generateInsightEmbedding(insight) {
    // Combine relevant text fields for embedding
    const textParts = [
      insight.title,
      insight.description,
      insight.rawText,
      // Include extracted entities as context
      insight.trades?.length ? `Trades: ${insight.trades.join(', ')}` : '',
      insight.materials?.length ? `Materials: ${insight.materials.join(', ')}` : '',
      insight.systems?.length ? `Systems: ${insight.systems.join(', ')}` : '',
      insight.locations?.length ? `Locations: ${insight.locations.join(', ')}` : '',
      insight.issueTypes?.length ? `Issue types: ${insight.issueTypes.join(', ')}` : '',
      insight.category ? `Category: ${insight.category}` : ''
    ].filter(Boolean);

    const combinedText = textParts.join('\n');
    return this.generateEmbedding(combinedText);
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   * @param {number[]} a - First embedding vector
   * @param {number[]} b - Second embedding vector
   * @returns {number} Similarity score between 0 and 1
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Find similar insights by comparing embeddings
   * @param {number[]} queryEmbedding - Embedding to compare against
   * @param {Array<{id: string, embedding: number[]}>} candidates - Candidate insights with embeddings
   * @param {number} threshold - Minimum similarity score (0-1)
   * @param {number} limit - Maximum results to return
   * @returns {Array<{id: string, similarity: number}>}
   */
  findSimilar(queryEmbedding, candidates, threshold = 0.7, limit = 10) {
    if (!queryEmbedding || !candidates?.length) {
      return [];
    }

    const results = candidates
      .filter(c => c.embedding && Array.isArray(c.embedding))
      .map(candidate => ({
        id: candidate.id,
        similarity: this.cosineSimilarity(queryEmbedding, candidate.embedding)
      }))
      .filter(r => r.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return results;
  }

  /**
   * Find similar insights by text query
   * @param {string} queryText - Text to find similar insights for
   * @param {Array<{id: string, embedding: number[]}>} candidates - Candidate insights with embeddings
   * @param {number} threshold - Minimum similarity score (0-1)
   * @param {number} limit - Maximum results to return
   * @returns {Promise<Array<{id: string, similarity: number}>>}
   */
  async findSimilarByText(queryText, candidates, threshold = 0.7, limit = 10) {
    const embeddingResult = await this.generateEmbedding(queryText);

    if (!embeddingResult.success) {
      console.log('[embedding] Could not generate query embedding, falling back to empty results');
      return [];
    }

    return this.findSimilar(embeddingResult.embedding, candidates, threshold, limit);
  }
}

module.exports = new EmbeddingService();
