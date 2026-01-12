const prisma = require('./prisma');

/**
 * Similarity Service - Finds similar events using keyword matching
 */
class SimilarityService {
  // Weights for different matching criteria
  static WEIGHTS = {
    SAME_EVENT_TYPE: 0.3,
    SAME_LOCATION: 0.2,
    SAME_TRADE_VENDOR: 0.25,
    SAME_INSPECTOR: 0.2,
    TEXT_SIMILARITY: 0.5 // Maximum contribution from text similarity
  };

  // Common stop words to exclude from keyword extraction
  static STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
    'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
    'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'not', 'only', 'same', 'so', 'than', 'too',
    'very', 'just', 'also', 'now', 'here', 'there', 'then', 'once'
  ]);

  /**
   * Find similar events for a given event ID
   * @param {string} eventId - The event ID to find similar events for
   * @param {number} limit - Maximum number of results
   * @returns {Array} Array of similar events with scores
   */
  async findSimilarByEventId(eventId, limit = 5) {
    const event = await prisma.event.findUnique({
      where: { id: eventId }
    });

    if (!event) {
      throw new Error('Event not found');
    }

    return this.findSimilar(event, limit);
  }

  /**
   * Find similar events for given text
   * @param {string} text - Text to find similar events for
   * @param {string} projectId - Optional project ID to filter by
   * @param {number} limit - Maximum number of results
   * @returns {Array} Array of similar events with scores
   */
  async findSimilarByText(text, projectId = null, limit = 5) {
    const pseudoEvent = {
      id: null,
      transcriptText: text,
      projectId
    };

    return this.findSimilar(pseudoEvent, limit);
  }

  /**
   * Core similarity finding logic
   * @param {Object} sourceEvent - Event to compare against
   * @param {number} limit - Maximum results
   * @returns {Array} Similar events with scores
   */
  async findSimilar(sourceEvent, limit = 5) {
    // Extract keywords from source event
    const sourceKeywords = this.extractKeywords(
      `${sourceEvent.transcriptText || ''} ${sourceEvent.title || ''} ${sourceEvent.notes || ''}`
    );

    // Build query to find candidate events
    const whereClause = {
      // Exclude the source event itself
      NOT: sourceEvent.id ? { id: sourceEvent.id } : undefined
    };

    // If we have a project ID, optionally filter to same project first
    // For now, search across all projects for better results

    // Get all events to compare
    const candidates = await prisma.event.findMany({
      where: whereClause,
      include: {
        project: {
          select: { id: true, name: true }
        }
      }
    });

    // Score each candidate
    const scoredCandidates = candidates.map(candidate => {
      const score = this.calculateSimilarityScore(sourceEvent, candidate, sourceKeywords);
      return {
        ...candidate,
        similarityScore: score.total,
        scoreBreakdown: score.breakdown,
        matchedKeywords: score.matchedKeywords
      };
    });

    // Filter and sort by score
    return scoredCandidates
      .filter(c => c.similarityScore > 0.3)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, limit)
      .map(c => ({
        id: c.id,
        title: c.title,
        eventType: c.eventType,
        severity: c.severity,
        location: c.location,
        tradeVendor: c.tradeVendor,
        transcriptText: c.transcriptText?.substring(0, 200) + (c.transcriptText?.length > 200 ? '...' : ''),
        createdAt: c.createdAt,
        project: c.project,
        similarityScore: Math.round(c.similarityScore * 100) / 100,
        scoreBreakdown: c.scoreBreakdown,
        matchedKeywords: c.matchedKeywords
      }));
  }

  /**
   * Calculate similarity score between two events
   */
  calculateSimilarityScore(source, candidate, sourceKeywords) {
    const breakdown = {};
    let total = 0;

    // 1. Same event type
    if (source.eventType && candidate.eventType &&
        source.eventType.toLowerCase() === candidate.eventType.toLowerCase()) {
      breakdown.eventType = SimilarityService.WEIGHTS.SAME_EVENT_TYPE;
      total += breakdown.eventType;
    }

    // 2. Same location
    if (source.location && candidate.location &&
        this.fuzzyMatch(source.location, candidate.location)) {
      breakdown.location = SimilarityService.WEIGHTS.SAME_LOCATION;
      total += breakdown.location;
    }

    // 3. Same trade/vendor
    if (source.tradeVendor && candidate.tradeVendor &&
        this.fuzzyMatch(source.tradeVendor, candidate.tradeVendor)) {
      breakdown.tradeVendor = SimilarityService.WEIGHTS.SAME_TRADE_VENDOR;
      total += breakdown.tradeVendor;
    }

    // 4. Text similarity (keyword overlap)
    const candidateKeywords = this.extractKeywords(
      `${candidate.transcriptText || ''} ${candidate.title || ''} ${candidate.notes || ''}`
    );

    const { score: textScore, matched } = this.calculateKeywordOverlap(sourceKeywords, candidateKeywords);
    breakdown.textSimilarity = textScore * SimilarityService.WEIGHTS.TEXT_SIMILARITY;
    total += breakdown.textSimilarity;

    return {
      total: Math.min(total, 1.0), // Cap at 1.0
      breakdown,
      matchedKeywords: matched
    };
  }

  /**
   * Extract meaningful keywords from text
   */
  extractKeywords(text) {
    if (!text) return new Set();

    // Tokenize and clean
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !SimilarityService.STOP_WORDS.has(word))
      .filter(word => !/^\d+$/.test(word)); // Remove pure numbers

    return new Set(words);
  }

  /**
   * Extract potential entity names (capitalized words in original text)
   */
  extractEntities(text) {
    if (!text) return [];

    // Find capitalized words/phrases that might be names
    const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    const matches = text.match(entityPattern) || [];

    // Also look for company indicators
    const companyPattern = /\b[\w\s]+(?:Inc|LLC|Corp|Company|Co|Ltd|Construction|Electric|Plumbing|HVAC)\b/gi;
    const companyMatches = text.match(companyPattern) || [];

    return [...new Set([...matches, ...companyMatches])];
  }

  /**
   * Calculate keyword overlap score
   */
  calculateKeywordOverlap(set1, set2) {
    if (set1.size === 0 || set2.size === 0) {
      return { score: 0, matched: [] };
    }

    const matched = [];
    set1.forEach(word => {
      if (set2.has(word)) {
        matched.push(word);
      }
    });

    // Jaccard similarity
    const union = new Set([...set1, ...set2]);
    const score = matched.length / union.size;

    return { score, matched };
  }

  /**
   * Fuzzy string matching for names/locations
   */
  fuzzyMatch(str1, str2) {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    // Exact match
    if (s1 === s2) return true;

    // One contains the other
    if (s1.includes(s2) || s2.includes(s1)) return true;

    // Levenshtein distance for short strings
    if (s1.length < 20 && s2.length < 20) {
      const distance = this.levenshteinDistance(s1, s2);
      const maxLen = Math.max(s1.length, s2.length);
      return (distance / maxLen) < 0.3; // Less than 30% different
    }

    return false;
  }

  /**
   * Levenshtein distance calculation
   */
  levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Full-text search for events
   */
  async searchEvents(query, filters = {}) {
    const { projectId, eventType, severity, startDate, endDate, limit = 20 } = filters;

    // Build search terms
    const searchTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 2)
      .filter(term => !SimilarityService.STOP_WORDS.has(term));

    if (searchTerms.length === 0) {
      return [];
    }

    // Build where clause
    const whereClause = {
      AND: [
        // Text search across multiple fields
        {
          OR: searchTerms.flatMap(term => [
            { transcriptText: { contains: term, mode: 'insensitive' } },
            { title: { contains: term, mode: 'insensitive' } },
            { notes: { contains: term, mode: 'insensitive' } },
            { location: { contains: term, mode: 'insensitive' } },
            { tradeVendor: { contains: term, mode: 'insensitive' } }
          ])
        }
      ]
    };

    // Add filters
    if (projectId) {
      whereClause.AND.push({ projectId });
    }
    if (eventType) {
      whereClause.AND.push({ eventType });
    }
    if (severity) {
      whereClause.AND.push({ severity });
    }
    if (startDate) {
      whereClause.AND.push({ createdAt: { gte: new Date(startDate) } });
    }
    if (endDate) {
      whereClause.AND.push({ createdAt: { lte: new Date(endDate) } });
    }

    const events = await prisma.event.findMany({
      where: whereClause,
      include: {
        project: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    // Add relevance scoring based on match count
    return events.map(event => {
      const allText = `${event.transcriptText || ''} ${event.title || ''} ${event.notes || ''}`.toLowerCase();
      const matchCount = searchTerms.filter(term => allText.includes(term)).length;
      const relevance = matchCount / searchTerms.length;

      // Create highlighted snippet
      let snippet = event.transcriptText || event.notes || '';
      const highlightedTerms = [];
      searchTerms.forEach(term => {
        if (snippet.toLowerCase().includes(term)) {
          highlightedTerms.push(term);
        }
      });

      return {
        ...event,
        transcriptText: snippet.substring(0, 300) + (snippet.length > 300 ? '...' : ''),
        relevanceScore: Math.round(relevance * 100) / 100,
        matchedTerms: highlightedTerms
      };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}

module.exports = new SimilarityService();
