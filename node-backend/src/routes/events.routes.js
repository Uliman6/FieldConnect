const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/events.controller');

/**
 * GET /api/events/search
 * Full-text search across events (must come before :id route)
 */
router.get('/search', (req, res, next) => {
  eventsController.search(req, res, next);
});

/**
 * GET /api/events/types
 * Get list of unique event types
 */
router.get('/types', (req, res, next) => {
  eventsController.getEventTypes(req, res, next);
});

/**
 * GET /api/events/severities
 * Get list of unique severities
 */
router.get('/severities', (req, res, next) => {
  eventsController.getSeverities(req, res, next);
});

/**
 * POST /api/events/find-similar
 * Find similar events by event_id or text
 */
router.post('/find-similar', (req, res, next) => {
  eventsController.findSimilar(req, res, next);
});

// ============================================
// INDEXED SEARCH ROUTES
// ============================================

/**
 * GET /api/events/indexed/search
 * Search events by indexed keywords (inspector, trade, material, etc.)
 * Query params: inspector, trade, material, issue_type, location, ahj, system,
 *               needs_follow_up, has_cost_impact, min_cost, max_cost, project_id
 */
router.get('/indexed/search', (req, res, next) => {
  eventsController.searchByKeywords(req, res, next);
});

/**
 * GET /api/events/indexed/follow-ups
 * Get all events that need follow-up
 * Query params: project_id, include_resolved, limit
 */
router.get('/indexed/follow-ups', (req, res, next) => {
  eventsController.getFollowUps(req, res, next);
});

/**
 * GET /api/events/indexed/stats
 * Get aggregated statistics from indexed events
 * Query params: project_id
 */
router.get('/indexed/stats', (req, res, next) => {
  eventsController.getIndexStats(req, res, next);
});

/**
 * POST /api/events/indexed/reindex
 * Re-index all events (admin operation)
 */
router.post('/indexed/reindex', (req, res, next) => {
  eventsController.reindexAll(req, res, next);
});

/**
 * GET /api/events
 * List events with filters
 */
router.get('/', (req, res, next) => {
  eventsController.list(req, res, next);
});

/**
 * GET /api/events/:id
 * Get a single event
 */
router.get('/:id', (req, res, next) => {
  eventsController.get(req, res, next);
});

/**
 * GET /api/events/:id/similar
 * Get similar events for a specific event
 */
router.get('/:id/similar', (req, res, next) => {
  eventsController.getSimilar(req, res, next);
});

/**
 * GET /api/events/:id/index
 * Get the index for a specific event
 */
router.get('/:id/index', (req, res, next) => {
  eventsController.getEventIndex(req, res, next);
});

/**
 * POST /api/events/:id/index
 * Index or re-index a single event
 */
router.post('/:id/index', (req, res, next) => {
  eventsController.indexEvent(req, res, next);
});

/**
 * PATCH /api/events/:id/follow-up
 * Update follow-up status for an event
 */
router.patch('/:id/follow-up', (req, res, next) => {
  eventsController.updateFollowUp(req, res, next);
});

/**
 * POST /api/events
 * Create a new event
 */
router.post('/', (req, res, next) => {
  eventsController.create(req, res, next);
});

/**
 * PATCH /api/events/:id
 * Update an event
 */
router.patch('/:id', (req, res, next) => {
  eventsController.update(req, res, next);
});

/**
 * DELETE /api/events/:id
 * Delete an event
 */
router.delete('/:id', (req, res, next) => {
  eventsController.delete(req, res, next);
});

module.exports = router;
