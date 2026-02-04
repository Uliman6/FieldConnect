const prisma = require('./prisma');
const eventIndexer = require('./event-indexer.service');
const similarityService = require('./similarity.service');
const embeddingService = require('./embedding.service');

/**
 * Insights Service
 * Unified system for capturing, indexing, and finding patterns in construction insights
 * from events, pending issues, inspection notes, and manual entries.
 */
class InsightsService {
  /**
   * Create an insight from an event
   * @param {string} eventId - Event ID to create insight from
   * @param {boolean} isTest - Whether this is test data (defaults to project.isTest if not provided)
   * @returns {Object} Created insight
   */
  async createFromEvent(eventId, isTest = null) {
    console.log(`[insights] createFromEvent called for event: ${eventId}`);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { project: true }
    });

    if (!event) {
      console.error(`[insights] Event not found: ${eventId}`);
      throw new Error(`Event not found: ${eventId}`);
    }

    console.log(`[insights] Found event: title="${event.title}", projectId=${event.projectId}, hasDescription=${!!event.description}`);

    // Check if insight already exists for this event
    const existing = await prisma.insight.findFirst({
      where: { sourceType: 'event', sourceId: eventId }
    });

    if (existing) {
      console.log(`[insights] Insight already exists for event ${eventId}: ${existing.id}`);
      return existing;
    }

    // Use project.isTest if isTest not explicitly provided
    const testFlag = isTest !== null ? isTest : (event.project?.isTest || false);

    // Extract keywords using the event indexer
    // Include description for events created from daily logs that don't have transcripts
    const text = `${event.transcriptText || ''} ${event.description || ''} ${event.title || ''} ${event.notes || ''}`;
    const extracted = eventIndexer.extractAllKeywords(text);

    // Determine category based on extracted issue types
    const category = this.determineCategory(extracted.issueTypes);

    // Build keywords summary
    const keywordsSummary = eventIndexer.buildKeywordsSummary(extracted);

    // Generate title if needed
    const title = event.title && event.title !== 'Untitled Event'
      ? event.title
      : eventIndexer.generateSmartTitle(event.transcriptText);

    // Use event description for follow-up reason (cleaner than raw text)
    // Falls back to extracted action items if no description
    const followUpReason = event.description || extracted.followUpReason || null;

    const insight = await prisma.insight.create({
      data: {
        sourceType: 'event',
        sourceId: eventId,
        projectId: event.projectId,
        dailyLogId: event.linkedDailyLogId,
        title,
        description: event.description || event.notes,
        rawText: event.transcriptText || event.description || event.notes,
        category,
        severity: event.severity,
        inspectors: extracted.inspectors,
        trades: extracted.trades,
        materials: extracted.materials,
        issueTypes: extracted.issueTypes,
        locations: extracted.locations,
        ahj: extracted.ahj,
        systems: extracted.systems,
        costImpact: extracted.costImpact,
        needsFollowUp: extracted.needsFollowUp,
        followUpReason,
        isResolved: event.isResolved || false,
        keywordsSummary,
        isTest: testFlag
      }
    });

    console.log(`[insights] Created insight from event: ${insight.id}, title="${insight.title}", projectId=${insight.projectId}`);
    console.log(`[insights] Insight data: description="${(insight.description || '').substring(0, 100)}", trades=${JSON.stringify(insight.trades)}, isTest=${insight.isTest}`);

    // Generate embedding async (non-blocking)
    this.generateAndSaveEmbedding(insight.id).catch(err =>
      console.error(`[insights] Background embedding failed: ${err.message}`)
    );

    return insight;
  }

  /**
   * Create an insight from a pending issue
   * @param {string} pendingIssueId - PendingIssue ID
   * @param {boolean} isTest - Whether this is test data (defaults to project.isTest if not provided)
   * @returns {Object} Created insight
   */
  async createFromPendingIssue(pendingIssueId, isTest = null) {
    const issue = await prisma.pendingIssue.findUnique({
      where: { id: pendingIssueId },
      include: {
        dailyLog: {
          include: { project: true }
        }
      }
    });

    if (!issue) {
      throw new Error(`Pending issue not found: ${pendingIssueId}`);
    }

    // Check if insight already exists
    const existing = await prisma.insight.findFirst({
      where: { sourceType: 'pending_issue', sourceId: pendingIssueId }
    });

    if (existing) {
      return existing;
    }

    // Use project.isTest if isTest not explicitly provided
    const testFlag = isTest !== null ? isTest : (issue.dailyLog?.project?.isTest || false);

    // Extract keywords from description
    const text = `${issue.title || ''} ${issue.description || ''}`;
    const extracted = eventIndexer.extractAllKeywords(text);

    // Add the issue's category to extracted issue types
    if (issue.category && !extracted.issueTypes.includes(issue.category)) {
      extracted.issueTypes.push(issue.category);
    }

    // Add location if not extracted
    if (issue.location && !extracted.locations.includes(issue.location.toLowerCase())) {
      extracted.locations.push(issue.location.toLowerCase());
    }

    const category = this.determineCategory(extracted.issueTypes);
    const keywordsSummary = eventIndexer.buildKeywordsSummary(extracted);

    const insight = await prisma.insight.create({
      data: {
        sourceType: 'pending_issue',
        sourceId: pendingIssueId,
        projectId: issue.dailyLog.projectId,
        dailyLogId: issue.dailyLogId,
        dailyLogDate: issue.dailyLog.date,
        title: issue.title || 'Pending Issue',
        description: issue.description,
        rawText: issue.description,
        category,
        severity: issue.severity,
        inspectors: extracted.inspectors,
        trades: extracted.trades,
        materials: extracted.materials,
        issueTypes: extracted.issueTypes,
        locations: extracted.locations,
        ahj: extracted.ahj,
        systems: extracted.systems,
        costImpact: extracted.costImpact,
        needsFollowUp: true, // Pending issues always need follow-up
        followUpReason: issue.description,
        followUpDueDate: issue.dueDate,
        isResolved: false,
        keywordsSummary,
        isTest: testFlag
      }
    });

    console.log(`[insights] Created insight from pending issue: ${insight.id}`);

    // Generate embedding async (non-blocking)
    this.generateAndSaveEmbedding(insight.id).catch(err =>
      console.error(`[insights] Background embedding failed: ${err.message}`)
    );

    return insight;
  }

  /**
   * Create an insight from an inspection note
   * @param {string} inspectionNoteId - InspectionNote ID
   * @param {boolean} isTest - Whether this is test data (defaults to project.isTest if not provided)
   * @returns {Object} Created insight
   */
  async createFromInspectionNote(inspectionNoteId, isTest = null) {
    const note = await prisma.inspectionNote.findUnique({
      where: { id: inspectionNoteId },
      include: {
        dailyLog: {
          include: { project: true }
        }
      }
    });

    if (!note) {
      throw new Error(`Inspection note not found: ${inspectionNoteId}`);
    }

    // Check if insight already exists
    const existing = await prisma.insight.findFirst({
      where: { sourceType: 'inspection_note', sourceId: inspectionNoteId }
    });

    if (existing) {
      return existing;
    }

    // Use project.isTest if isTest not explicitly provided
    const testFlag = isTest !== null ? isTest : (note.dailyLog?.project?.isTest || false);

    // Extract keywords
    const text = `${note.inspectionType || ''} ${note.notes || ''} ${note.result || ''}`;
    const extracted = eventIndexer.extractAllKeywords(text);

    // Add inspector if present
    if (note.inspectorName && !extracted.inspectors.includes(note.inspectorName)) {
      extracted.inspectors.push(note.inspectorName);
    }

    // Add AHJ if present
    if (note.ahj && !extracted.ahj.includes(note.ahj)) {
      extracted.ahj.push(note.ahj);
    }

    // Determine category and severity based on result
    let category = 'observation';
    let severity = 'low';

    if (note.result) {
      const lowerResult = note.result.toLowerCase();
      if (lowerResult.includes('fail') || lowerResult.includes('deficient')) {
        category = 'issue';
        severity = 'high';
        extracted.issueTypes.push('code_violation');
      } else if (lowerResult.includes('pass') || lowerResult.includes('approved')) {
        category = 'observation';
        severity = 'low';
      }
    }

    const keywordsSummary = eventIndexer.buildKeywordsSummary(extracted);

    const insight = await prisma.insight.create({
      data: {
        sourceType: 'inspection_note',
        sourceId: inspectionNoteId,
        projectId: note.dailyLog.projectId,
        dailyLogId: note.dailyLogId,
        dailyLogDate: note.dailyLog.date,
        title: `${note.inspectionType || 'Inspection'}: ${note.result || 'No Result'}`,
        description: note.notes,
        rawText: note.notes,
        category,
        severity,
        inspectors: extracted.inspectors,
        trades: extracted.trades,
        materials: extracted.materials,
        issueTypes: extracted.issueTypes,
        locations: extracted.locations,
        ahj: extracted.ahj,
        systems: extracted.systems,
        costImpact: extracted.costImpact,
        needsFollowUp: note.followUpNeeded || false,
        followUpReason: note.followUpNeeded ? note.notes : null,
        isResolved: !note.followUpNeeded,
        keywordsSummary,
        isTest: testFlag
      }
    });

    console.log(`[insights] Created insight from inspection note: ${insight.id}`);

    // Generate embedding async (non-blocking)
    this.generateAndSaveEmbedding(insight.id).catch(err =>
      console.error(`[insights] Background embedding failed: ${err.message}`)
    );

    return insight;
  }

  /**
   * Create a manual insight
   * @param {Object} data - Insight data
   * @returns {Object} Created insight
   */
  async createManualInsight(data) {
    const {
      projectId,
      dailyLogId,
      title,
      description,
      category = 'observation',
      severity = 'medium',
      isTest = false
    } = data;

    // Extract keywords from description
    const text = `${title || ''} ${description || ''}`;
    const extracted = eventIndexer.extractAllKeywords(text);
    const keywordsSummary = eventIndexer.buildKeywordsSummary(extracted);

    // Use description for follow-up reason if follow-up is needed
    const followUpReason = extracted.needsFollowUp ? description : null;

    const insight = await prisma.insight.create({
      data: {
        sourceType: 'manual',
        projectId,
        dailyLogId,
        title,
        description,
        rawText: description,
        category,
        severity,
        inspectors: extracted.inspectors,
        trades: extracted.trades,
        materials: extracted.materials,
        issueTypes: extracted.issueTypes,
        locations: extracted.locations,
        ahj: extracted.ahj,
        systems: extracted.systems,
        costImpact: extracted.costImpact,
        needsFollowUp: extracted.needsFollowUp,
        followUpReason,
        keywordsSummary,
        isTest
      }
    });

    console.log(`[insights] Created manual insight: ${insight.id}`);

    // Generate embedding async (non-blocking)
    this.generateAndSaveEmbedding(insight.id).catch(err =>
      console.error(`[insights] Background embedding failed: ${err.message}`)
    );

    return insight;
  }

  /**
   * Index all unindexed items from daily logs
   * @param {boolean} isTest - Mark as test data
   * @returns {Object} Summary of indexed items
   */
  async indexAllFromDailyLogs(isTest = false) {
    const results = {
      pendingIssues: { indexed: 0, errors: 0 },
      inspectionNotes: { indexed: 0, errors: 0 },
      events: { indexed: 0, errors: 0 }
    };

    // Index pending issues
    const pendingIssues = await prisma.pendingIssue.findMany({
      where: {
        NOT: {
          id: {
            in: (await prisma.insight.findMany({
              where: { sourceType: 'pending_issue' },
              select: { sourceId: true }
            })).map(i => i.sourceId).filter(Boolean)
          }
        }
      },
      select: { id: true }
    });

    for (const issue of pendingIssues) {
      try {
        await this.createFromPendingIssue(issue.id, isTest);
        results.pendingIssues.indexed++;
      } catch (err) {
        console.error(`Error indexing pending issue ${issue.id}:`, err.message);
        results.pendingIssues.errors++;
      }
    }

    // Index inspection notes
    const inspectionNotes = await prisma.inspectionNote.findMany({
      where: {
        NOT: {
          id: {
            in: (await prisma.insight.findMany({
              where: { sourceType: 'inspection_note' },
              select: { sourceId: true }
            })).map(i => i.sourceId).filter(Boolean)
          }
        }
      },
      select: { id: true }
    });

    for (const note of inspectionNotes) {
      try {
        await this.createFromInspectionNote(note.id, isTest);
        results.inspectionNotes.indexed++;
      } catch (err) {
        console.error(`Error indexing inspection note ${note.id}:`, err.message);
        results.inspectionNotes.errors++;
      }
    }

    // Index events - include events with transcriptText, description, OR title
    const events = await prisma.event.findMany({
      where: {
        OR: [
          { transcriptText: { not: null } },
          { description: { not: null } },
          { title: { not: null } }
        ],
        NOT: {
          id: {
            in: (await prisma.insight.findMany({
              where: { sourceType: 'event' },
              select: { sourceId: true }
            })).map(i => i.sourceId).filter(Boolean)
          }
        }
      },
      select: { id: true }
    });

    for (const event of events) {
      try {
        await this.createFromEvent(event.id, isTest);
        results.events.indexed++;
      } catch (err) {
        console.error(`Error indexing event ${event.id}:`, err.message);
        results.events.errors++;
      }
    }

    console.log('[insights] Indexing complete:', results);
    return results;
  }

  /**
   * Find similar insights
   * @param {string} insightId - Insight ID to find similar for
   * @param {Object} options - Search options
   * @returns {Array} Similar insights
   */
  async findSimilar(insightId, options = {}) {
    const { limit = 5, includeTest = false } = options;

    const insight = await prisma.insight.findUnique({
      where: { id: insightId }
    });

    if (!insight) {
      throw new Error(`Insight not found: ${insightId}`);
    }

    // Get all insights to compare (excluding source and optionally test data)
    const whereClause = {
      id: { not: insightId }
    };

    if (!includeTest) {
      whereClause.isTest = false;
    }

    const candidates = await prisma.insight.findMany({
      where: whereClause,
      include: {
        project: { select: { id: true, name: true } }
      }
    });

    // Score each candidate
    const scored = candidates.map(candidate => {
      const score = this.calculateSimilarityScore(insight, candidate);
      return { ...candidate, similarityScore: score.total, scoreBreakdown: score.breakdown };
    });

    // Filter and sort
    return scored
      .filter(c => c.similarityScore > 0.3)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, limit)
      .map(c => ({
        id: c.id,
        title: c.title,
        category: c.category,
        severity: c.severity,
        sourceType: c.sourceType,
        createdAt: c.createdAt,
        project: c.project,
        similarityScore: Math.round(c.similarityScore * 100) / 100,
        scoreBreakdown: c.scoreBreakdown
      }));
  }

  /**
   * Calculate similarity score between two insights
   */
  calculateSimilarityScore(source, candidate) {
    const breakdown = {};
    let total = 0;

    // Same category (0.2)
    if (source.category === candidate.category) {
      breakdown.category = 0.2;
      total += 0.2;
    }

    // Same severity (0.1)
    if (source.severity === candidate.severity) {
      breakdown.severity = 0.1;
      total += 0.1;
    }

    // Trade overlap (0.25)
    const tradeOverlap = this.calculateArrayOverlap(source.trades, candidate.trades);
    if (tradeOverlap > 0) {
      breakdown.trades = tradeOverlap * 0.25;
      total += breakdown.trades;
    }

    // Issue type overlap (0.25)
    const issueOverlap = this.calculateArrayOverlap(source.issueTypes, candidate.issueTypes);
    if (issueOverlap > 0) {
      breakdown.issueTypes = issueOverlap * 0.25;
      total += breakdown.issueTypes;
    }

    // Location overlap (0.15)
    const locationOverlap = this.calculateArrayOverlap(source.locations, candidate.locations);
    if (locationOverlap > 0) {
      breakdown.locations = locationOverlap * 0.15;
      total += breakdown.locations;
    }

    // System overlap (0.15)
    const systemOverlap = this.calculateArrayOverlap(source.systems, candidate.systems);
    if (systemOverlap > 0) {
      breakdown.systems = systemOverlap * 0.15;
      total += breakdown.systems;
    }

    // Keywords summary overlap (0.3)
    if (source.keywordsSummary && candidate.keywordsSummary) {
      const sourceWords = new Set(source.keywordsSummary.toLowerCase().split(/\s+/));
      const candidateWords = new Set(candidate.keywordsSummary.toLowerCase().split(/\s+/));

      let overlap = 0;
      sourceWords.forEach(word => {
        if (candidateWords.has(word) && word.length > 3) overlap++;
      });

      const keywordScore = overlap / Math.max(sourceWords.size, 1);
      breakdown.keywords = keywordScore * 0.3;
      total += breakdown.keywords;
    }

    return { total: Math.min(total, 1.0), breakdown };
  }

  /**
   * Calculate overlap between two JSON arrays
   */
  calculateArrayOverlap(arr1, arr2) {
    if (!arr1 || !arr2 || !Array.isArray(arr1) || !Array.isArray(arr2)) {
      return 0;
    }
    if (arr1.length === 0 || arr2.length === 0) {
      return 0;
    }

    const set1 = new Set(arr1.map(s => s.toLowerCase()));
    const set2 = new Set(arr2.map(s => s.toLowerCase()));

    let overlap = 0;
    set1.forEach(item => {
      if (set2.has(item)) overlap++;
    });

    return overlap / Math.max(set1.size, set2.size);
  }

  /**
   * Determine category based on issue types
   */
  determineCategory(issueTypes) {
    if (!issueTypes || issueTypes.length === 0) {
      return 'observation';
    }

    if (issueTypes.includes('safety')) return 'safety';
    if (issueTypes.includes('cost_impact')) return 'cost_impact';
    if (issueTypes.includes('delay')) return 'delay';
    if (issueTypes.includes('rework')) return 'rework';
    if (issueTypes.includes('quality')) return 'quality';
    if (issueTypes.includes('code_violation')) return 'issue';

    return 'issue';
  }

  /**
   * Search insights with filters - comprehensive search across ALL fields
   * @param {Object} filters - Search filters
   * @returns {Array} Matching insights
   */
  async search(filters = {}) {
    const {
      query,
      projectId,
      category,
      severity,
      sourceType,
      needsFollowUp,
      isResolved,
      isTest,
      startDate,
      endDate,
      limit = 100
    } = filters;

    console.log('[insights/search] Starting search with:', { query, projectId, isTest, sourceType, category });

    // Build base where clause (non-text filters)
    const baseWhere = {};
    if (projectId) baseWhere.projectId = projectId;

    // Handle comma-separated category values (e.g., "quality,rework")
    if (category) {
      const categories = category.split(',').map(c => c.trim()).filter(Boolean);
      if (categories.length === 1) {
        baseWhere.category = categories[0];
      } else if (categories.length > 1) {
        baseWhere.category = { in: categories };
      }
    }

    if (severity) baseWhere.severity = severity;

    // Handle comma-separated sourceType values (e.g., "event,pending_issue")
    if (sourceType) {
      const sourceTypes = sourceType.split(',').map(s => s.trim()).filter(Boolean);
      if (sourceTypes.length === 1) {
        baseWhere.sourceType = sourceTypes[0];
      } else if (sourceTypes.length > 1) {
        baseWhere.sourceType = { in: sourceTypes };
      }
    }

    if (needsFollowUp !== undefined) baseWhere.needsFollowUp = needsFollowUp;
    if (isResolved !== undefined) baseWhere.isResolved = isResolved;
    if (isTest !== undefined) baseWhere.isTest = isTest;
    if (startDate) baseWhere.createdAt = { gte: new Date(startDate) };
    if (endDate) baseWhere.createdAt = { ...baseWhere.createdAt, lte: new Date(endDate) };

    // If no text query, just return filtered results
    if (!query || query.trim().length === 0) {
      console.log('[insights/search] No query, returning all with filters');
      const insights = await prisma.insight.findMany({
        where: baseWhere,
        include: { project: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit
      });
      console.log(`[insights/search] Found ${insights.length} results`);
      return insights;
    }

    // Text search: Get all insights matching base filters, then search client-side
    // This ensures we search ALL fields including JSON arrays (trades, systems, etc.)
    console.log('[insights/search] Fetching candidates for text search');
    const candidates = await prisma.insight.findMany({
      where: baseWhere,
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`[insights/search] Got ${candidates.length} candidates, searching for: "${query}"`);

    // Filter out common/generic words that match too broadly
    const stopWords = ['items', 'item', 'things', 'thing', 'stuff', 'related', 'all', 'any',
                       'the', 'a', 'an', 'for', 'with', 'about', 'find', 'show', 'list',
                       'get', 'search', 'query', 'look', 'need', 'want', 'please'];

    const queryLower = query.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.includes(w));

    // If all words were filtered out, try with the original words (minus very short ones)
    const searchWords = queryWords.length > 0
      ? queryWords
      : queryLower.split(/\s+/).filter(w => w.length > 2);

    console.log(`[insights/search] Search words after filtering: [${searchWords.join(', ')}]`);

    if (searchWords.length === 0) {
      console.log(`[insights/search] No valid search words, returning empty`);
      return [];
    }

    // Score each candidate by how many fields match
    const scored = candidates.map(insight => {
      let score = 0;
      const matchedFields = [];
      const matchedWords = new Set();

      // Helper to check if text contains query words and track which ones
      const textMatches = (text, fieldWeight) => {
        if (!text) return 0;
        const textLower = text.toLowerCase();
        let fieldScore = 0;
        searchWords.forEach(word => {
          if (textLower.includes(word)) {
            fieldScore += fieldWeight;
            matchedWords.add(word);
          }
        });
        return fieldScore;
      };

      // Helper to check if JSON array contains query words
      const arrayMatches = (arr, fieldWeight) => {
        if (!arr || !Array.isArray(arr)) return 0;
        let fieldScore = 0;
        arr.forEach(item => {
          if (typeof item === 'string') {
            const itemLower = item.toLowerCase();
            searchWords.forEach(word => {
              if (itemLower.includes(word)) {
                fieldScore += fieldWeight;
                matchedWords.add(word);
              }
            });
          }
        });
        return fieldScore;
      };

      // Check all text fields (higher weight for title)
      const titleScore = textMatches(insight.title, 10);
      if (titleScore > 0) { score += titleScore; matchedFields.push('title'); }

      const descScore = textMatches(insight.description, 5);
      if (descScore > 0) { score += descScore; matchedFields.push('description'); }

      const rawScore = textMatches(insight.rawText, 3);
      if (rawScore > 0) { score += rawScore; matchedFields.push('rawText'); }

      const kwScore = textMatches(insight.keywordsSummary, 2);
      if (kwScore > 0) { score += kwScore; matchedFields.push('keywordsSummary'); }

      // Check JSON array fields
      const tradeScore = arrayMatches(insight.trades, 4);
      if (tradeScore > 0) { score += tradeScore; matchedFields.push('trades'); }

      const sysScore = arrayMatches(insight.systems, 4);
      if (sysScore > 0) { score += sysScore; matchedFields.push('systems'); }

      const matScore = arrayMatches(insight.materials, 3);
      if (matScore > 0) { score += matScore; matchedFields.push('materials'); }

      const locScore = arrayMatches(insight.locations, 3);
      if (locScore > 0) { score += locScore; matchedFields.push('locations'); }

      // Check sourceType (e.g., "inspection" should match "inspection_note")
      if (insight.sourceType) {
        const stLower = insight.sourceType.toLowerCase();
        searchWords.forEach(word => {
          if (stLower.includes(word)) {
            score += 5;
            matchedFields.push('sourceType');
            matchedWords.add(word);
          }
        });
      }

      return {
        ...insight,
        _score: score,
        _matchedFields: matchedFields,
        _matchedWords: Array.from(matchedWords)
      };
    });

    // Require minimum score (at least one meaningful match in an important field)
    const MIN_SCORE = 5;
    const results = scored
      .filter(r => r._score >= MIN_SCORE)
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)
      .map(({ _score, _matchedFields, _matchedWords, ...insight }) => insight);

    console.log(`[insights/search] Found ${results.length} matching results`);
    if (results.length > 0) {
      console.log(`[insights/search] Top result: "${results[0].title}" (matched: ${scored.find(s => s.id === results[0].id)?._matchedFields?.join(', ')})`);
    }

    return results;
  }

  /**
   * Get insights statistics
   * @param {Object} options - Query options
   * @returns {Object} Statistics
   */
  async getStats(options = {}) {
    const { projectId, isTest } = options;

    const whereClause = {};
    if (projectId) whereClause.projectId = projectId;
    if (isTest !== undefined) whereClause.isTest = isTest;

    const [
      total,
      byCategory,
      bySeverity,
      bySourceType,
      needsFollowUp,
      unresolved,
      withCostImpact,
      insights
    ] = await Promise.all([
      prisma.insight.count({ where: whereClause }),
      prisma.insight.groupBy({
        by: ['category'],
        where: whereClause,
        _count: true
      }),
      prisma.insight.groupBy({
        by: ['severity'],
        where: whereClause,
        _count: true
      }),
      prisma.insight.groupBy({
        by: ['sourceType'],
        where: whereClause,
        _count: true
      }),
      prisma.insight.count({ where: { ...whereClause, needsFollowUp: true } }),
      prisma.insight.count({ where: { ...whereClause, isResolved: false } }),
      prisma.insight.count({ where: { ...whereClause, costImpact: { not: null } } }),
      prisma.insight.findMany({
        where: whereClause,
        select: {
          trades: true,
          issueTypes: true,
          systems: true,
          costImpact: true
        }
      })
    ]);

    // Aggregate keyword frequencies
    const tradeCounts = {};
    const issueCounts = {};
    const systemCounts = {};
    let totalCostImpact = 0;

    for (const insight of insights) {
      if (Array.isArray(insight.trades)) {
        for (const trade of insight.trades) {
          tradeCounts[trade] = (tradeCounts[trade] || 0) + 1;
        }
      }
      if (Array.isArray(insight.issueTypes)) {
        for (const issue of insight.issueTypes) {
          issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        }
      }
      if (Array.isArray(insight.systems)) {
        for (const system of insight.systems) {
          systemCounts[system] = (systemCounts[system] || 0) + 1;
        }
      }
      if (insight.costImpact) {
        totalCostImpact += insight.costImpact;
      }
    }

    return {
      total,
      byCategory: byCategory.map(c => ({ category: c.category, count: c._count })),
      bySeverity: bySeverity.map(s => ({ severity: s.severity, count: s._count })),
      bySourceType: bySourceType.map(s => ({ sourceType: s.sourceType, count: s._count })),
      needsFollowUp,
      unresolved,
      withCostImpact,
      totalCostImpact,
      topTrades: this.sortByCount(tradeCounts, 10),
      topIssueTypes: this.sortByCount(issueCounts, 10),
      topSystems: this.sortByCount(systemCounts, 10)
    };
  }

  /**
   * Clear all test data
   * @returns {Object} Deletion summary
   */
  async clearTestData() {
    const [insights, patterns] = await Promise.all([
      prisma.insight.deleteMany({ where: { isTest: true } }),
      prisma.insightPattern.deleteMany({ where: { isTest: true } })
    ]);

    console.log(`[insights] Cleared test data: ${insights.count} insights, ${patterns.count} patterns`);
    return { insights: insights.count, patterns: patterns.count };
  }

  sortByCount(counts, limit) {
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }

  /**
   * Generate and save embedding for an insight (async, non-blocking)
   * @param {string} insightId - Insight ID
   * @returns {Promise<boolean>} Success status
   */
  async generateAndSaveEmbedding(insightId) {
    try {
      const insight = await prisma.insight.findUnique({
        where: { id: insightId }
      });

      if (!insight) {
        console.log(`[insights] Insight not found for embedding: ${insightId}`);
        return false;
      }

      const result = await embeddingService.generateInsightEmbedding(insight);

      if (result.success) {
        await prisma.insight.update({
          where: { id: insightId },
          data: { embedding: result.embedding }
        });
        console.log(`[insights] Saved embedding for insight: ${insightId}`);
        return true;
      } else {
        console.log(`[insights] Could not generate embedding: ${result.error}`);
        return false;
      }
    } catch (error) {
      console.error(`[insights] Error saving embedding: ${error.message}`);
      return false;
    }
  }

  /**
   * Find similar insights using embeddings (semantic search)
   * Falls back to keyword-based similarity if embeddings not available
   * @param {string} insightId - Insight ID
   * @param {Object} options - Search options
   * @returns {Array} Similar insights
   */
  async findSimilarWithEmbeddings(insightId, options = {}) {
    const { limit = 10, threshold = 0.75, includeTest = false, crossProject = true } = options;

    const insight = await prisma.insight.findUnique({
      where: { id: insightId }
    });

    if (!insight) {
      throw new Error(`Insight not found: ${insightId}`);
    }

    // If source insight has no embedding, generate one
    let queryEmbedding = insight.embedding;
    if (!queryEmbedding) {
      const embResult = await embeddingService.generateInsightEmbedding(insight);
      if (embResult.success) {
        queryEmbedding = embResult.embedding;
        // Save it for future use
        await prisma.insight.update({
          where: { id: insightId },
          data: { embedding: embResult.embedding }
        });
      }
    }

    // Build where clause
    const whereClause = {
      id: { not: insightId },
      embedding: { not: null }
    };

    if (!includeTest) {
      whereClause.isTest = false;
    }

    if (!crossProject) {
      whereClause.projectId = insight.projectId;
    }

    // Get candidates with embeddings
    const candidates = await prisma.insight.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        category: true,
        severity: true,
        sourceType: true,
        projectId: true,
        createdAt: true,
        embedding: true,
        trades: true,
        systems: true,
        issueTypes: true,
        project: { select: { id: true, name: true } }
      }
    });

    if (!queryEmbedding || candidates.length === 0) {
      // Fall back to keyword-based similarity
      console.log('[insights] No embeddings available, falling back to keyword similarity');
      return this.findSimilar(insightId, { limit, includeTest });
    }

    // Calculate similarity scores using embeddings
    const scored = candidates.map(candidate => {
      const similarity = embeddingService.cosineSimilarity(queryEmbedding, candidate.embedding);
      return {
        id: candidate.id,
        title: candidate.title,
        category: candidate.category,
        severity: candidate.severity,
        sourceType: candidate.sourceType,
        createdAt: candidate.createdAt,
        project: candidate.project,
        trades: candidate.trades,
        systems: candidate.systems,
        issueTypes: candidate.issueTypes,
        similarity: Math.round(similarity * 100) / 100
      };
    });

    // Filter by threshold and sort
    return scored
      .filter(s => s.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Find similar insights by text query using embeddings
   * @param {string} queryText - Text to find similar insights for
   * @param {Object} options - Search options
   * @returns {Array} Similar insights
   */
  async findSimilarByText(queryText, options = {}) {
    const { limit = 10, threshold = 0.7, projectId, includeTest = true } = options;

    // Generate embedding for query text
    const embResult = await embeddingService.generateEmbedding(queryText);

    if (!embResult.success) {
      console.log('[insights] Could not generate query embedding, falling back to comprehensive text search');
      // Use the improved search which checks ALL fields including JSON arrays
      // Don't filter by isTest - show all results
      return this.search({ query: queryText, limit, projectId });
    }

    // Build where clause
    const whereClause = {
      embedding: { not: null }
    };

    if (!includeTest) {
      whereClause.isTest = false;
    }

    if (projectId) {
      whereClause.projectId = projectId;
    }

    // Get all insights with embeddings
    const candidates = await prisma.insight.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        severity: true,
        sourceType: true,
        projectId: true,
        createdAt: true,
        embedding: true,
        trades: true,
        systems: true,
        issueTypes: true,
        costImpact: true,
        project: { select: { id: true, name: true } }
      }
    });

    if (candidates.length === 0) {
      console.log('[insights] No insights with embeddings found, falling back to text search');
      return this.search({ query: queryText, limit, projectId });
    }

    // Calculate similarity scores
    const scored = candidates.map(candidate => {
      const similarity = embeddingService.cosineSimilarity(embResult.embedding, candidate.embedding);
      return {
        ...candidate,
        embedding: undefined, // Don't return the embedding
        similarity: Math.round(similarity * 100) / 100
      };
    });

    // Filter by threshold and sort
    return scored
      .filter(s => s.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Backfill embeddings for all insights that don't have them
   * @param {Object} options - Options
   * @returns {Object} Results summary
   */
  async backfillEmbeddings(options = {}) {
    const { batchSize = 50, isTest } = options;

    const whereClause = { embedding: null };
    if (isTest !== undefined) {
      whereClause.isTest = isTest;
    }

    const insights = await prisma.insight.findMany({
      where: whereClause,
      select: { id: true },
      take: batchSize
    });

    const results = { processed: 0, success: 0, failed: 0 };

    for (const insight of insights) {
      results.processed++;
      const success = await this.generateAndSaveEmbedding(insight.id);
      if (success) {
        results.success++;
      } else {
        results.failed++;
      }
    }

    console.log(`[insights] Backfill embeddings: ${results.success}/${results.processed} successful`);
    return results;
  }
}

module.exports = new InsightsService();
