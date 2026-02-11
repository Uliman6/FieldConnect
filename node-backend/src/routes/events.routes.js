const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/events.controller');
const templatesController = require('../controllers/templates.controller');
const schemaDataController = require('../controllers/schema-data.controller');
const photosController = require('../controllers/photos.controller');
const { authenticate, requireRole, loadAccessibleProjects } = require('../middleware/auth.middleware');

// All event routes require authentication
router.use(authenticate);

/**
 * GET /api/events/search
 * Full-text search across events (must come before :id route)
 */
router.get('/search', loadAccessibleProjects, (req, res, next) => {
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

// ============================================
// CHECKLIST ROUTES (Punch Lists & RFIs)
// ============================================

/**
 * GET /api/events/checklist
 * List punch lists and RFIs with status filtering
 * Query params: category (PUNCH_LIST|RFI), project_id, status (OPEN|IN_PROGRESS|CLOSED), limit
 */
router.get('/checklist', (req, res, next) => {
  eventsController.listChecklist(req, res, next);
});

/**
 * PATCH /api/events/:id/status
 * Update item status (creates audit comment)
 * Body: { status: 'OPEN'|'IN_PROGRESS'|'CLOSED', comment?: string, changedBy?: string }
 */
router.patch('/:id/status', (req, res, next) => {
  eventsController.updateStatus(req, res, next);
});

/**
 * GET /api/events/:id/comments
 * Get revision history/comments for an event
 */
router.get('/:id/comments', (req, res, next) => {
  eventsController.getComments(req, res, next);
});

/**
 * POST /api/events/:id/comments
 * Add a comment/follow-up to an event
 * Body: { text, authorName? }
 */
router.post('/:id/comments', (req, res, next) => {
  eventsController.addComment(req, res, next);
});

/**
 * DELETE /api/events/:id/comments/:commentId
 * Delete a comment
 */
router.delete('/:id/comments/:commentId', (req, res, next) => {
  eventsController.deleteComment(req, res, next);
});

/**
 * GET /api/events
 * List events with filters
 */
router.get('/', loadAccessibleProjects, (req, res, next) => {
  eventsController.list(req, res, next);
});

/**
 * GET /api/events/:id
 * Get a single event
 */
router.get('/:id', loadAccessibleProjects, (req, res, next) => {
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
router.post('/', loadAccessibleProjects, (req, res, next) => {
  eventsController.create(req, res, next);
});

/**
 * PATCH /api/events/:id
 * Update an event
 */
router.patch('/:id', loadAccessibleProjects, (req, res, next) => {
  eventsController.update(req, res, next);
});

/**
 * DELETE /api/events/:id
 * Delete an event
 */
router.delete('/:id', loadAccessibleProjects, (req, res, next) => {
  eventsController.delete(req, res, next);
});

// ============================================
// TEMPLATE ROUTES
// ============================================

/**
 * POST /api/events/:eventId/template
 * Attach a template to an event
 */
router.post('/:eventId/template', (req, res, next) => {
  templatesController.attachTemplateToEvent(req, res, next);
});

/**
 * GET /api/events/:eventId/template-data
 * Get template data for an event
 */
router.get('/:eventId/template-data', (req, res, next) => {
  templatesController.getEventTemplateData(req, res, next);
});

/**
 * PATCH /api/events/:eventId/template-data
 * Update template field values for an event
 */
router.patch('/:eventId/template-data', (req, res, next) => {
  templatesController.updateEventTemplateData(req, res, next);
});

/**
 * GET /api/events/:eventId/filled-pdf
 * Download filled PDF for an event
 */
router.get('/:eventId/filled-pdf', (req, res, next) => {
  templatesController.getFilledPdf(req, res, next);
});

// ============================================
// SCHEMA DATA ROUTES (Apply to Document)
// ============================================

/**
 * POST /api/events/:eventId/apply-schema
 * Apply a document schema to an event - AI extracts fields from transcript
 */
router.post('/:eventId/apply-schema', (req, res, next) => {
  schemaDataController.applySchema(req, res, next);
});

/**
 * GET /api/events/:eventId/schema-data
 * Get schema data (extracted fields) for an event
 */
router.get('/:eventId/schema-data', (req, res, next) => {
  schemaDataController.getSchemaData(req, res, next);
});

/**
 * PATCH /api/events/:eventId/schema-data
 * Update schema data field values (manual edit)
 */
router.patch('/:eventId/schema-data', (req, res, next) => {
  schemaDataController.updateSchemaData(req, res, next);
});

/**
 * DELETE /api/events/:eventId/schema-data
 * Remove schema data from event
 */
router.delete('/:eventId/schema-data', (req, res, next) => {
  schemaDataController.removeSchemaData(req, res, next);
});

/**
 * POST /api/events/:eventId/re-extract
 * Re-extract fields from transcript using same schema
 */
router.post('/:eventId/re-extract', (req, res, next) => {
  schemaDataController.reExtract(req, res, next);
});

/**
 * POST /api/events/:eventId/generate-pdf
 * Generate PDF from schema data
 */
router.post('/:eventId/generate-pdf', (req, res, next) => {
  schemaDataController.generatePdf(req, res, next);
});

/**
 * GET /api/events/:eventId/download-pdf
 * Download generated PDF
 */
router.get('/:eventId/download-pdf', (req, res, next) => {
  schemaDataController.downloadPdf(req, res, next);
});

// ============================================
// PHOTOS ROUTES
// ============================================

/**
 * GET /api/events/:eventId/photos
 * Get all photos for an event
 */
router.get('/:eventId/photos', (req, res, next) => {
  photosController.getEventPhotos(req, res, next);
});

module.exports = router;
