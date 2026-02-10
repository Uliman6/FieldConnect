const insightsService = require('../services/insights.service');
const nlQueryService = require('../services/nl-query.service');
const insightsPdfService = require('../services/insights-pdf.service');

/**
 * Insights Controller
 * Handles API requests for the unified insights system
 */

/**
 * Index all items from daily logs into insights
 * POST /api/insights/index-all
 */
async function indexAll(req, res) {
  try {
    const { isTest = false } = req.body;
    const results = await insightsService.indexAllFromDailyLogs(isTest);
    res.json({
      success: true,
      message: 'Indexing complete',
      results
    });
  } catch (error) {
    console.error('Error indexing insights:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Reindex all existing insights with updated extraction logic
 * POST /api/insights/reindex-all
 */
async function reindexAll(req, res) {
  try {
    const results = await insightsService.reindexAll();
    res.json({
      success: true,
      message: 'Reindexing complete',
      results
    });
  } catch (error) {
    console.error('Error reindexing insights:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create insight from event
 * POST /api/insights/from-event/:eventId
 */
async function createFromEvent(req, res) {
  try {
    const { eventId } = req.params;
    const { isTest = false } = req.body;
    const insight = await insightsService.createFromEvent(eventId, isTest);
    res.json(insight);
  } catch (error) {
    console.error('Error creating insight from event:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
}

/**
 * Create insight from pending issue
 * POST /api/insights/from-pending-issue/:pendingIssueId
 */
async function createFromPendingIssue(req, res) {
  try {
    const { pendingIssueId } = req.params;
    const { isTest = false } = req.body;
    const insight = await insightsService.createFromPendingIssue(pendingIssueId, isTest);
    res.json(insight);
  } catch (error) {
    console.error('Error creating insight from pending issue:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
}

/**
 * Create insight from inspection note
 * POST /api/insights/from-inspection-note/:inspectionNoteId
 */
async function createFromInspectionNote(req, res) {
  try {
    const { inspectionNoteId } = req.params;
    const { isTest = false } = req.body;
    const insight = await insightsService.createFromInspectionNote(inspectionNoteId, isTest);
    res.json(insight);
  } catch (error) {
    console.error('Error creating insight from inspection note:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
}

/**
 * Create manual insight
 * POST /api/insights
 */
async function createManual(req, res) {
  try {
    const { projectId, dailyLogId, title, description, category, severity, isTest } = req.body;

    if (!projectId || !title) {
      return res.status(400).json({ error: 'projectId and title are required' });
    }

    const insight = await insightsService.createManualInsight({
      projectId,
      dailyLogId,
      title,
      description,
      category,
      severity,
      isTest
    });

    res.status(201).json(insight);
  } catch (error) {
    console.error('Error creating manual insight:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Search insights
 * GET /api/insights
 */
async function search(req, res) {
  try {
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
      limit
    } = req.query;

    const filters = {
      query,
      projectId,
      category,
      severity,
      sourceType,
      needsFollowUp: needsFollowUp === 'true' ? true : needsFollowUp === 'false' ? false : undefined,
      isResolved: isResolved === 'true' ? true : isResolved === 'false' ? false : undefined,
      isTest: isTest === 'true' ? true : isTest === 'false' ? false : undefined,
      startDate,
      endDate,
      limit: limit ? parseInt(limit) : undefined
    };

    console.log('[insights/search] Filters:', JSON.stringify(filters));

    const insights = await insightsService.search(filters);

    console.log(`[insights/search] Returning ${insights.length} insights`);

    res.json(insights);
  } catch (error) {
    console.error('Error searching insights:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get insight by ID
 * GET /api/insights/:id
 */
async function getById(req, res) {
  try {
    const { id } = req.params;
    const prisma = require('../services/prisma');

    const insight = await prisma.insight.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } }
      }
    });

    if (!insight) {
      return res.status(404).json({ error: 'Insight not found' });
    }

    res.json(insight);
  } catch (error) {
    console.error('Error getting insight:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Find similar insights
 * GET /api/insights/:id/similar
 */
async function findSimilar(req, res) {
  try {
    const { id } = req.params;
    const { limit, includeTest } = req.query;

    const similar = await insightsService.findSimilar(id, {
      limit: limit ? parseInt(limit) : undefined,
      includeTest: includeTest === 'true'
    });

    res.json(similar);
  } catch (error) {
    console.error('Error finding similar insights:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
}

/**
 * Get insights statistics
 * GET /api/insights/stats
 */
async function getStats(req, res) {
  try {
    const { projectId, isTest } = req.query;

    const stats = await insightsService.getStats({
      projectId,
      isTest: isTest === 'true' ? true : isTest === 'false' ? false : undefined
    });

    res.json(stats);
  } catch (error) {
    console.error('Error getting insights stats:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Update insight
 * PATCH /api/insights/:id
 */
async function update(req, res) {
  try {
    const { id } = req.params;
    const { isResolved, needsFollowUp, followUpReason, followUpDueDate, severity, category } = req.body;

    const prisma = require('../services/prisma');

    const updateData = {};
    if (isResolved !== undefined) {
      updateData.isResolved = isResolved;
      if (isResolved) {
        updateData.resolvedAt = new Date();
      }
    }
    if (needsFollowUp !== undefined) updateData.needsFollowUp = needsFollowUp;
    if (followUpReason !== undefined) updateData.followUpReason = followUpReason;
    if (followUpDueDate !== undefined) updateData.followUpDueDate = new Date(followUpDueDate);
    if (severity !== undefined) updateData.severity = severity;
    if (category !== undefined) updateData.category = category;

    const insight = await prisma.insight.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true } }
      }
    });

    res.json(insight);
  } catch (error) {
    console.error('Error updating insight:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Insight not found' });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * Delete insight
 * DELETE /api/insights/:id
 */
async function deleteInsight(req, res) {
  try {
    const { id } = req.params;
    const prisma = require('../services/prisma');

    await prisma.insight.delete({ where: { id } });
    res.json({ success: true, message: 'Insight deleted' });
  } catch (error) {
    console.error('Error deleting insight:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Insight not found' });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * Clear all test data
 * DELETE /api/insights/test-data
 */
async function clearTestData(req, res) {
  try {
    const results = await insightsService.clearTestData();
    res.json({
      success: true,
      message: 'Test data cleared',
      ...results
    });
  } catch (error) {
    console.error('Error clearing test data:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Find similar insights by text query (uses embeddings if available)
 * POST /api/insights/find-similar-by-text
 */
async function findSimilarByText(req, res) {
  try {
    const { text, projectId, limit, includeTest, threshold } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    // Try embedding-based search first (semantic similarity)
    const embeddingResults = await insightsService.findSimilarByText(text, {
      limit: limit || 10,
      threshold: threshold || 0.7,
      projectId,
      includeTest: includeTest === true
    });

    // Also extract keywords for display
    const eventIndexer = require('../services/event-indexer.service');
    const extracted = eventIndexer.extractAllKeywords(text);

    res.json({
      query: text,
      extracted,
      searchMethod: embeddingResults.length > 0 ? 'embedding' : 'keyword',
      results: embeddingResults
    });
  } catch (error) {
    console.error('Error finding similar by text:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Backfill embeddings for existing insights
 * POST /api/insights/backfill-embeddings
 */
async function backfillEmbeddings(req, res) {
  try {
    const { batchSize, isTest } = req.body;

    const results = await insightsService.backfillEmbeddings({
      batchSize: batchSize || 50,
      isTest
    });

    res.json({
      success: true,
      message: 'Embedding backfill complete',
      ...results
    });
  } catch (error) {
    console.error('Error backfilling embeddings:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Natural language query for insights
 * POST /api/insights/query
 */
async function nlQuery(req, res) {
  try {
    const { query, projectId, includeTest = false, format = 'list' } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Query required',
        message: 'Please provide a search query'
      });
    }

    const result = await nlQueryService.processQuery(query, {
      projectId,
      includeTest
    });

    // If checklist format requested, include formatted output
    if (format === 'checklist' || result.parsed?.outputFormat === 'checklist' || result.parsed?.outputFormat === 'report') {
      result.formatted = nlQueryService.formatAsChecklist(result.results, {
        title: `Results for: ${query}`,
        groupBy: result.parsed?.category !== 'all' ? 'severity' : 'category'
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Error processing NL query:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Debug endpoint - shows database state
 * GET /api/insights/debug
 */
async function debug(req, res) {
  try {
    const prisma = require('../services/prisma');

    const [
      totalEvents,
      eventsWithTranscript,
      eventsWithDescription,
      eventsWithTitle,
      totalInsights,
      insightsBySourceType,
      sampleInsights,
      sampleEvents
    ] = await Promise.all([
      prisma.event.count(),
      prisma.event.count({ where: { transcriptText: { not: null } } }),
      prisma.event.count({ where: { description: { not: null } } }),
      prisma.event.count({ where: { title: { not: null } } }),
      prisma.insight.count(),
      prisma.insight.groupBy({ by: ['sourceType'], _count: true }),
      prisma.insight.findMany({ take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, sourceType: true, projectId: true, isTest: true } }),
      prisma.event.findMany({ take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, description: true, projectId: true } })
    ]);

    res.json({
      events: {
        total: totalEvents,
        withTranscript: eventsWithTranscript,
        withDescription: eventsWithDescription,
        withTitle: eventsWithTitle,
        sample: sampleEvents
      },
      insights: {
        total: totalInsights,
        bySourceType: insightsBySourceType,
        sample: sampleInsights
      }
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Export insights as PDF or JSON
 * GET /api/insights/export
 */
async function exportInsights(req, res) {
  try {
    const {
      format = 'pdf',
      projectId,
      category,
      sourceType,
      trade,
      issueType,
      system,
      severity,
      isResolved,
      needsFollowUp,
      isTest
    } = req.query;

    // Build filters for search
    const filters = {
      projectId,
      category,
      sourceType,
      severity,
      isResolved: isResolved === 'true' ? true : isResolved === 'false' ? false : undefined,
      needsFollowUp: needsFollowUp === 'true' ? true : needsFollowUp === 'false' ? false : undefined,
      isTest: isTest === 'true' ? true : isTest === 'false' ? false : undefined,
      limit: 500 // Max items for export
    };

    // Text search for trade, issueType, or system
    if (trade || issueType || system) {
      filters.query = [trade, issueType, system].filter(Boolean).join(' ');
    }

    console.log('[insights/export] Filters:', JSON.stringify(filters));

    // Fetch insights
    const insights = await insightsService.search(filters);
    console.log(`[insights/export] Found ${insights.length} insights`);

    if (format === 'pdf') {
      // Get project name if projectId provided
      let projectName = null;
      if (projectId) {
        const prisma = require('../services/prisma');
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { name: true }
        });
        projectName = project?.name;
      }

      // Generate PDF
      const pdfDoc = insightsPdfService.generateInsightsChecklist(insights, {
        filters: { category, sourceType, trade, issueType, system, severity },
        projectName
      });

      // Set response headers for PDF download
      const filename = `insights-export-${new Date().toISOString().split('T')[0]}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Pipe PDF stream to response
      pdfDoc.pipe(res);
    } else {
      // Return JSON
      res.json({
        count: insights.length,
        filters: { category, sourceType, trade, issueType, system, severity },
        insights
      });
    }
  } catch (error) {
    console.error('Error exporting insights:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  indexAll,
  reindexAll,
  backfillEmbeddings,
  createFromEvent,
  createFromPendingIssue,
  createFromInspectionNote,
  createManual,
  search,
  getById,
  findSimilar,
  findSimilarByText,
  getStats,
  update,
  deleteInsight,
  clearTestData,
  nlQuery,
  debug,
  exportInsights
};
