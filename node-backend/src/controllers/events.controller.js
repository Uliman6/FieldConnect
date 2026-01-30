const prisma = require('../services/prisma');
const similarityService = require('../services/similarity.service');
const eventIndexerService = require('../services/event-indexer.service');
const insightsService = require('../services/insights.service');

/**
 * Events Controller - CRUD + search + similarity + indexed search for events
 */
class EventsController {
  /**
   * GET /api/events
   * List events with filters
   */
  async list(req, res, next) {
    try {
      const {
        project_id,
        event_type,
        severity,
        is_resolved,
        trade_vendor,
        start_date,
        end_date,
        limit = 50
      } = req.query;

      const whereClause = {};

      if (project_id) whereClause.projectId = project_id;
      if (event_type) whereClause.eventType = event_type;
      if (severity) whereClause.severity = severity;
      if (is_resolved !== undefined) whereClause.isResolved = is_resolved === 'true';
      if (trade_vendor) whereClause.tradeVendor = { contains: trade_vendor, mode: 'insensitive' };

      if (start_date || end_date) {
        whereClause.createdAt = {};
        if (start_date) whereClause.createdAt.gte = new Date(start_date);
        if (end_date) whereClause.createdAt.lte = new Date(end_date);
      }

      const events = await prisma.event.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        include: {
          project: {
            select: { id: true, name: true, number: true }
          },
          schemaData: {
            include: {
              schema: {
                select: { id: true, name: true, documentType: true }
              }
            }
          }
        }
      });

      res.json(events);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/events/search
   * Full-text search across events
   */
  async search(req, res, next) {
    try {
      const { q, project_id, event_type, severity, start_date, end_date, limit = 20 } = req.query;

      if (!q || q.trim().length < 2) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Search query (q) must be at least 2 characters'
        });
      }

      const results = await similarityService.searchEvents(q, {
        projectId: project_id,
        eventType: event_type,
        severity,
        startDate: start_date,
        endDate: end_date,
        limit: parseInt(limit)
      });

      res.json({
        query: q,
        count: results.length,
        results
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/events/find-similar
   * Find similar events
   */
  async findSimilar(req, res, next) {
    try {
      const { event_id, text, project_id, limit = 5 } = req.body;

      if (!event_id && !text) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Either event_id or text is required'
        });
      }

      let results;
      if (event_id) {
        results = await similarityService.findSimilarByEventId(event_id, limit);
      } else {
        results = await similarityService.findSimilarByText(text, project_id, limit);
      }

      res.json({
        sourceEventId: event_id || null,
        sourceText: text ? text.substring(0, 100) + '...' : null,
        count: results.length,
        similarEvents: results
      });
    } catch (err) {
      if (err.message === 'Event not found') {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Source event not found'
        });
      }
      next(err);
    }
  }

  /**
   * GET /api/events/:id
   * Get a single event
   */
  async get(req, res, next) {
    try {
      const { id } = req.params;

      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          project: true,
          schemaData: {
            include: {
              schema: true
            }
          }
        }
      });

      if (!event) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Event not found'
        });
      }

      res.json(event);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/events/:id/similar
   * Get similar events for a specific event
   */
  async getSimilar(req, res, next) {
    try {
      const { id } = req.params;
      const { limit = 5 } = req.query;

      const results = await similarityService.findSimilarByEventId(id, parseInt(limit));

      res.json({
        sourceEventId: id,
        count: results.length,
        similarEvents: results
      });
    } catch (err) {
      if (err.message === 'Event not found') {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Event not found'
        });
      }
      next(err);
    }
  }

  /**
   * POST /api/events
   * Create a new event
   * Accepts client-provided ID for local-first architecture
   */
  async create(req, res, next) {
    try {
      const {
        id, // Client-provided ID for local-first sync
        project_id,
        transcript_text,
        event_type,
        severity,
        title,
        description,
        notes,
        location,
        trade_vendor,
        is_resolved,
        audio_file_id
      } = req.body;

      if (!project_id) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'project_id is required'
        });
      }

      // If client provided an ID, check if it already exists (idempotent create)
      if (id) {
        const existing = await prisma.event.findUnique({
          where: { id },
          include: { project: true }
        });
        if (existing) {
          // Return existing event (idempotent)
          return res.status(200).json(existing);
        }
      }

      // Verify project exists
      const project = await prisma.project.findUnique({
        where: { id: project_id }
      });

      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Project not found'
        });
      }

      const event = await prisma.event.create({
        data: {
          ...(id && { id }), // Use client-provided ID if available
          projectId: project_id,
          transcriptText: transcript_text,
          eventType: event_type,
          severity,
          title,
          description,
          notes,
          location,
          tradeVendor: trade_vendor,
          isResolved: is_resolved || false,
          audioFileId: audio_file_id
        },
        include: {
          project: true
        }
      });

      // Auto-index to insights if has transcript (async, non-blocking)
      // Pass project.isTest so test project data is properly flagged
      if (transcript_text) {
        insightsService.createFromEvent(event.id, project.isTest).catch(err =>
          console.error(`[events] Auto-index failed for event ${event.id}: ${err.message}`)
        );
      }

      res.status(201).json(event);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/events/:id
   * Update an event
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const {
        transcript_text,
        event_type,
        severity,
        title,
        description,
        notes,
        location,
        trade_vendor,
        is_resolved
      } = req.body;

      const event = await prisma.event.update({
        where: { id },
        data: {
          ...(transcript_text !== undefined && { transcriptText: transcript_text }),
          ...(event_type !== undefined && { eventType: event_type }),
          ...(severity !== undefined && { severity }),
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          ...(notes !== undefined && { notes }),
          ...(location !== undefined && { location }),
          ...(trade_vendor !== undefined && { tradeVendor: trade_vendor }),
          ...(is_resolved !== undefined && { isResolved: is_resolved })
        },
        include: {
          project: true
        }
      });

      // Auto-index to insights if transcript was added/updated (async, non-blocking)
      // Pass project.isTest so test project data is properly flagged
      if (transcript_text) {
        insightsService.createFromEvent(event.id, event.project?.isTest).catch(err =>
          console.error(`[events] Auto-index failed for event ${event.id}: ${err.message}`)
        );
      }

      res.json(event);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/events/:id
   * Delete an event
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;

      await prisma.event.delete({
        where: { id }
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/events/types
   * Get list of unique event types
   */
  async getEventTypes(req, res, next) {
    try {
      const types = await prisma.event.findMany({
        where: { eventType: { not: null } },
        select: { eventType: true },
        distinct: ['eventType']
      });

      res.json(types.map(t => t.eventType).filter(Boolean));
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/events/severities
   * Get list of unique severities
   */
  async getSeverities(req, res, next) {
    try {
      const severities = await prisma.event.findMany({
        where: { severity: { not: null } },
        select: { severity: true },
        distinct: ['severity']
      });

      res.json(severities.map(s => s.severity).filter(Boolean));
    } catch (err) {
      next(err);
    }
  }

  // ============================================
  // INDEXED SEARCH ENDPOINTS
  // ============================================

  /**
   * GET /api/events/indexed/search
   * Search events by indexed keywords (inspector, trade, material, etc.)
   */
  async searchByKeywords(req, res, next) {
    try {
      const {
        inspector,
        trade,
        material,
        issue_type,
        location,
        ahj,
        system,
        needs_follow_up,
        has_cost_impact,
        min_cost,
        max_cost,
        project_id,
        limit = 50
      } = req.query;

      const results = await eventIndexerService.searchByKeywords({
        inspector,
        trade,
        material,
        issueType: issue_type,
        location,
        ahj,
        system,
        needsFollowUp: needs_follow_up === 'true' ? true : needs_follow_up === 'false' ? false : undefined,
        hasCostImpact: has_cost_impact === 'true',
        minCost: min_cost ? parseFloat(min_cost) : undefined,
        maxCost: max_cost ? parseFloat(max_cost) : undefined,
        projectId: project_id,
        limit: parseInt(limit)
      });

      res.json({
        count: results.length,
        filters: { inspector, trade, material, issue_type, location, ahj, system },
        results
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/events/indexed/follow-ups
   * Get all events that need follow-up
   */
  async getFollowUps(req, res, next) {
    try {
      const { project_id, include_resolved = 'false', limit = 50 } = req.query;

      const results = await eventIndexerService.getEventsNeedingFollowUp({
        projectId: project_id,
        includeResolved: include_resolved === 'true',
        limit: parseInt(limit)
      });

      res.json({
        count: results.length,
        results
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/events/indexed/stats
   * Get aggregated statistics from indexed events
   */
  async getIndexStats(req, res, next) {
    try {
      const { project_id } = req.query;

      const stats = await eventIndexerService.getIndexStats(project_id);

      res.json(stats);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/events/indexed/reindex
   * Re-index all events (admin operation)
   */
  async reindexAll(req, res, next) {
    try {
      const result = await eventIndexerService.reindexAllEvents();

      res.json({
        message: 'Re-indexing complete',
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/events/:id/index
   * Index or re-index a single event
   */
  async indexEvent(req, res, next) {
    try {
      const { id } = req.params;

      const index = await eventIndexerService.indexEvent(id);

      res.json({
        message: 'Event indexed successfully',
        index
      });
    } catch (err) {
      if (err.message.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: err.message
        });
      }
      next(err);
    }
  }

  /**
   * GET /api/events/:id/index
   * Get the index for a specific event
   */
  async getEventIndex(req, res, next) {
    try {
      const { id } = req.params;

      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          index: true,
          project: { select: { id: true, name: true } }
        }
      });

      if (!event) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Event not found'
        });
      }

      res.json({
        eventId: event.id,
        title: event.title,
        project: event.project,
        index: event.index,
        isIndexed: !!event.index
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/events/:id/follow-up
   * Update follow-up status for an event
   */
  async updateFollowUp(req, res, next) {
    try {
      const { id } = req.params;
      const { needs_follow_up, follow_up_reason, follow_up_due_date } = req.body;

      // Check if event exists and has an index
      const event = await prisma.event.findUnique({
        where: { id },
        include: { index: true }
      });

      if (!event) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Event not found'
        });
      }

      // Create or update the index
      const updateData = {};
      if (needs_follow_up !== undefined) updateData.needsFollowUp = needs_follow_up;
      if (follow_up_reason !== undefined) updateData.followUpReason = follow_up_reason;
      if (follow_up_due_date !== undefined) {
        updateData.followUpDueDate = follow_up_due_date ? new Date(follow_up_due_date) : null;
      }

      let index;
      if (event.index) {
        index = await prisma.eventIndex.update({
          where: { eventId: id },
          data: updateData
        });
      } else {
        // Create new index with follow-up data
        const extracted = eventIndexerService.extractAllKeywords(
          `${event.transcriptText || ''} ${event.title || ''} ${event.notes || ''}`
        );
        index = await prisma.eventIndex.create({
          data: {
            eventId: id,
            inspectors: extracted.inspectors,
            trades: extracted.trades,
            materials: extracted.materials,
            issueTypes: extracted.issueTypes,
            locations: extracted.locations,
            ahj: extracted.ahj,
            systems: extracted.systems,
            costImpact: extracted.costImpact,
            keywordsSummary: eventIndexerService.buildKeywordsSummary(extracted),
            ...updateData
          }
        });
      }

      res.json({
        message: 'Follow-up status updated',
        index
      });
    } catch (err) {
      next(err);
    }
  }

  // ============================================
  // CHECKLIST ENDPOINTS (Punch Lists & RFIs)
  // ============================================

  /**
   * GET /api/events/checklist
   * List punch lists and RFIs with status filtering
   */
  async listChecklist(req, res, next) {
    try {
      const {
        category, // 'PUNCH_LIST' or 'RFI'
        project_id,
        status, // 'OPEN', 'IN_PROGRESS', 'CLOSED'
        limit = 50
      } = req.query;

      // Filter events that have schemaData with matching documentType
      const whereClause = {
        schemaData: {
          schema: {
            documentType: category
              ? category.toUpperCase()
              : { in: ['PUNCH_LIST', 'RFI'] }
          }
        }
      };

      if (project_id) {
        whereClause.projectId = project_id;
      }

      if (status) {
        whereClause.itemStatus = status.toUpperCase();
      }

      // Get events with schema data
      const events = await prisma.event.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        include: {
          project: { select: { id: true, name: true, number: true } },
          schemaData: {
            include: {
              schema: { select: { id: true, name: true, documentType: true } }
            }
          },
          _count: { select: { comments: true } }
        }
      });

      // Get status counts for dashboard
      const countsWhere = {
        schemaData: {
          schema: {
            documentType: category
              ? category.toUpperCase()
              : { in: ['PUNCH_LIST', 'RFI'] }
          }
        }
      };
      if (project_id) {
        countsWhere.projectId = project_id;
      }

      const counts = await prisma.event.groupBy({
        by: ['itemStatus'],
        where: countsWhere,
        _count: { id: true }
      });

      const statusCounts = {
        OPEN: 0,
        IN_PROGRESS: 0,
        CLOSED: 0
      };
      counts.forEach(c => {
        statusCounts[c.itemStatus] = c._count.id;
      });

      const total = statusCounts.OPEN + statusCounts.IN_PROGRESS + statusCounts.CLOSED;

      res.json({
        items: events,
        counts: {
          total,
          open: statusCounts.OPEN,
          inProgress: statusCounts.IN_PROGRESS,
          closed: statusCounts.CLOSED
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/events/:id/status
   * Update item status with optional comment
   */
  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, comment, author_name } = req.body;

      if (!status || !['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(status.toUpperCase())) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Valid status is required: OPEN, IN_PROGRESS, or CLOSED'
        });
      }

      const normalizedStatus = status.toUpperCase();

      // Get current event
      const event = await prisma.event.findUnique({
        where: { id }
      });

      if (!event) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Event not found'
        });
      }

      const previousStatus = event.itemStatus;

      // Update event status
      const updatedEvent = await prisma.event.update({
        where: { id },
        data: {
          itemStatus: normalizedStatus,
          statusChangedAt: new Date(),
          statusChangedBy: author_name || null,
          // Sync with isResolved for backward compatibility
          isResolved: normalizedStatus === 'CLOSED'
        },
        include: {
          project: { select: { id: true, name: true } },
          schemaData: {
            include: {
              schema: { select: { id: true, name: true, documentType: true } }
            }
          }
        }
      });

      // Create status change comment for audit trail
      const statusComment = await prisma.eventComment.create({
        data: {
          eventId: id,
          text: comment || `Status changed from ${previousStatus} to ${normalizedStatus}`,
          authorName: author_name || null,
          commentType: 'status_change',
          previousStatus,
          newStatus: normalizedStatus
        }
      });

      res.json({
        event: updatedEvent,
        comment: statusComment
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/events/:id/comments
   * Get comments/revision history for an event
   */
  async getComments(req, res, next) {
    try {
      const { id } = req.params;

      // Verify event exists
      const event = await prisma.event.findUnique({
        where: { id }
      });

      if (!event) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Event not found'
        });
      }

      const comments = await prisma.eventComment.findMany({
        where: { eventId: id },
        orderBy: { createdAt: 'desc' }
      });

      res.json(comments);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/events/:id/comments
   * Add a comment to an event
   */
  async addComment(req, res, next) {
    try {
      const { id } = req.params;
      const { text, author_name } = req.body;

      if (!text || text.trim().length === 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Comment text is required'
        });
      }

      // Verify event exists
      const event = await prisma.event.findUnique({
        where: { id }
      });

      if (!event) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Event not found'
        });
      }

      const comment = await prisma.eventComment.create({
        data: {
          eventId: id,
          text: text.trim(),
          authorName: author_name || null,
          commentType: 'comment'
        }
      });

      res.status(201).json(comment);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/events/:id/comments/:commentId
   * Delete a comment
   */
  async deleteComment(req, res, next) {
    try {
      const { id, commentId } = req.params;

      // Verify comment exists and belongs to event
      const comment = await prisma.eventComment.findFirst({
        where: { id: commentId, eventId: id }
      });

      if (!comment) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Comment not found'
        });
      }

      await prisma.eventComment.delete({
        where: { id: commentId }
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new EventsController();
