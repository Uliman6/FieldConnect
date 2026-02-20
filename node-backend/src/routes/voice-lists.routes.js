const express = require('express');
const router = express.Router();
const voiceListsController = require('../controllers/voice-lists.controller');
const { authenticate, loadAccessibleProjects } = require('../middleware/auth.middleware');

// All voice list routes require authentication
router.use(authenticate);

/**
 * GET /api/voice-lists
 * List voice lists with filters
 * Query params: project_id, status, list_type, limit
 */
router.get('/', loadAccessibleProjects, (req, res, next) => {
  voiceListsController.list(req, res, next);
});

/**
 * POST /api/voice-lists
 * Create a new voice list
 * Body: { project_id, name, list_type, language, created_by_name }
 */
router.post('/', loadAccessibleProjects, (req, res, next) => {
  voiceListsController.create(req, res, next);
});

/**
 * GET /api/voice-lists/:id
 * Get a single voice list with sections and items
 */
router.get('/:id', loadAccessibleProjects, (req, res, next) => {
  voiceListsController.get(req, res, next);
});

/**
 * PUT /api/voice-lists/:id
 * Update a voice list
 * Body: { name, list_type, language, status, raw_transcript, recording_duration }
 */
router.put('/:id', loadAccessibleProjects, (req, res, next) => {
  voiceListsController.update(req, res, next);
});

/**
 * DELETE /api/voice-lists/:id
 * Delete a voice list
 */
router.delete('/:id', loadAccessibleProjects, (req, res, next) => {
  voiceListsController.delete(req, res, next);
});

/**
 * POST /api/voice-lists/:id/parse
 * Parse a transcript and add items to the voice list
 * Body: { transcript, append: boolean }
 */
router.post('/:id/parse', loadAccessibleProjects, (req, res, next) => {
  voiceListsController.parseTranscript(req, res, next);
});

/**
 * GET /api/voice-lists/:id/pdf
 * Download PDF for a voice list
 */
router.get('/:id/pdf', loadAccessibleProjects, (req, res, next) => {
  voiceListsController.downloadPdf(req, res, next);
});

// ============================================
// SECTION ROUTES
// ============================================

/**
 * POST /api/voice-lists/:id/sections
 * Add a section (via UI)
 * Body: { name, description }
 */
router.post('/:id/sections', loadAccessibleProjects, (req, res, next) => {
  voiceListsController.addSection(req, res, next);
});

/**
 * PUT /api/voice-lists/:id/sections/:sectionId
 * Update a section
 * Body: { name, description, order_index }
 */
router.put('/:id/sections/:sectionId', loadAccessibleProjects, (req, res, next) => {
  voiceListsController.updateSection(req, res, next);
});

/**
 * DELETE /api/voice-lists/:id/sections/:sectionId
 * Delete a section
 */
router.delete('/:id/sections/:sectionId', loadAccessibleProjects, (req, res, next) => {
  voiceListsController.deleteSection(req, res, next);
});

// ============================================
// ITEM ROUTES
// ============================================

/**
 * POST /api/voice-lists/:id/items
 * Add an item manually
 * Body: { section_id, raw_text, quantity, unit, description, category, notes }
 */
router.post('/:id/items', loadAccessibleProjects, (req, res, next) => {
  voiceListsController.addItem(req, res, next);
});

/**
 * PUT /api/voice-lists/:id/items/:itemId
 * Update an item
 * Body: { section_id, raw_text, quantity, unit, description, category, notes, order_index }
 */
router.put('/:id/items/:itemId', loadAccessibleProjects, (req, res, next) => {
  voiceListsController.updateItem(req, res, next);
});

/**
 * DELETE /api/voice-lists/:id/items/:itemId
 * Delete an item
 */
router.delete('/:id/items/:itemId', loadAccessibleProjects, (req, res, next) => {
  voiceListsController.deleteItem(req, res, next);
});

module.exports = router;
