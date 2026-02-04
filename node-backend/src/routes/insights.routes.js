const express = require('express');
const router = express.Router();
const insightsController = require('../controllers/insights.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(authenticate);

// Index all items from daily logs into insights
// POST /api/insights/index-all
router.post('/index-all', requireRole('ADMIN', 'EDITOR'), insightsController.indexAll);

// Backfill embeddings for existing insights
// POST /api/insights/backfill-embeddings
router.post('/backfill-embeddings', requireRole('ADMIN'), insightsController.backfillEmbeddings);

// Get insights statistics
// GET /api/insights/stats
router.get('/stats', insightsController.getStats);

// Clear test data
// DELETE /api/insights/test-data
router.delete('/test-data', requireRole('ADMIN'), insightsController.clearTestData);

// Find similar insights by text
// POST /api/insights/find-similar-by-text
router.post('/find-similar-by-text', insightsController.findSimilarByText);

// Natural language query for insights
// POST /api/insights/query
// Example: "create a list of all items for next building inspection"
router.post('/query', insightsController.nlQuery);

// Debug endpoint - shows database state (events & insights counts)
// GET /api/insights/debug
router.get('/debug', insightsController.debug);

// Create insight from event
// POST /api/insights/from-event/:eventId
router.post('/from-event/:eventId', requireRole('ADMIN', 'EDITOR'), insightsController.createFromEvent);

// Create insight from pending issue
// POST /api/insights/from-pending-issue/:pendingIssueId
router.post('/from-pending-issue/:pendingIssueId', requireRole('ADMIN', 'EDITOR'), insightsController.createFromPendingIssue);

// Create insight from inspection note
// POST /api/insights/from-inspection-note/:inspectionNoteId
router.post('/from-inspection-note/:inspectionNoteId', requireRole('ADMIN', 'EDITOR'), insightsController.createFromInspectionNote);

// Search insights
// GET /api/insights
router.get('/', insightsController.search);

// Create manual insight
// POST /api/insights
router.post('/', requireRole('ADMIN', 'EDITOR'), insightsController.createManual);

// Get insight by ID
// GET /api/insights/:id
router.get('/:id', insightsController.getById);

// Find similar insights
// GET /api/insights/:id/similar
router.get('/:id/similar', insightsController.findSimilar);

// Update insight
// PATCH /api/insights/:id
router.patch('/:id', requireRole('ADMIN', 'EDITOR'), insightsController.update);

// Delete insight
// DELETE /api/insights/:id
router.delete('/:id', requireRole('ADMIN'), insightsController.deleteInsight);

module.exports = router;
