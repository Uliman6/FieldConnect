const express = require('express');
const router = express.Router();
const dailyLogsController = require('../controllers/daily-logs.controller');
const photosController = require('../controllers/photos.controller');
const { authenticate, loadAccessibleProjects } = require('../middleware/auth.middleware');

// All daily log routes require authentication
router.use(authenticate);

/**
 * GET /api/daily-logs
 * List daily logs (with optional filters)
 */
router.get('/', loadAccessibleProjects, (req, res, next) => {
  dailyLogsController.list(req, res, next);
});

/**
 * POST /api/daily-logs
 * Create a new daily log
 */
router.post('/', (req, res, next) => {
  dailyLogsController.create(req, res, next);
});

/**
 * POST /api/daily-logs/from-transcript
 * Create a daily log from a voice transcript (AI-powered parsing)
 * NOTE: Must be before /:id route to avoid conflicts
 */
router.post('/from-transcript', (req, res, next) => {
  dailyLogsController.createFromTranscript(req, res, next);
});

/**
 * GET /api/daily-logs/:id
 * Get a single daily log with all nested data
 */
router.get('/:id', (req, res, next) => {
  dailyLogsController.get(req, res, next);
});

/**
 * PATCH /api/daily-logs/:id
 * Update a daily log
 */
router.patch('/:id', (req, res, next) => {
  dailyLogsController.update(req, res, next);
});

/**
 * DELETE /api/daily-logs/:id
 * Delete a daily log
 */
router.delete('/:id', (req, res, next) => {
  dailyLogsController.delete(req, res, next);
});

/**
 * POST /api/daily-logs/:id/tasks
 * Add a task to a daily log
 */
router.post('/:id/tasks', (req, res, next) => {
  dailyLogsController.addTask(req, res, next);
});

/**
 * POST /api/daily-logs/:id/pending-issues
 * Add a pending issue to a daily log
 */
router.post('/:id/pending-issues', (req, res, next) => {
  dailyLogsController.addPendingIssue(req, res, next);
});

/**
 * POST /api/daily-logs/:id/parse-transcript
 * Parse a transcript and update an existing daily log with extracted data
 */
router.post('/:id/parse-transcript', (req, res, next) => {
  dailyLogsController.parseAndUpdateFromTranscript(req, res, next);
});

// ============================================
// NESTED ITEM CRUD ROUTES
// ============================================

// Tasks
router.patch('/:id/tasks/:taskId', (req, res, next) => {
  dailyLogsController.updateTask(req, res, next);
});
router.delete('/:id/tasks/:taskId', (req, res, next) => {
  dailyLogsController.deleteTask(req, res, next);
});

// Pending Issues
router.patch('/:id/pending-issues/:issueId', (req, res, next) => {
  dailyLogsController.updatePendingIssue(req, res, next);
});
router.delete('/:id/pending-issues/:issueId', (req, res, next) => {
  dailyLogsController.deletePendingIssue(req, res, next);
});

// Visitors
router.post('/:id/visitors', (req, res, next) => {
  dailyLogsController.addVisitor(req, res, next);
});
router.patch('/:id/visitors/:visitorId', (req, res, next) => {
  dailyLogsController.updateVisitor(req, res, next);
});
router.delete('/:id/visitors/:visitorId', (req, res, next) => {
  dailyLogsController.deleteVisitor(req, res, next);
});

// Equipment
router.post('/:id/equipment', (req, res, next) => {
  dailyLogsController.addEquipment(req, res, next);
});
router.patch('/:id/equipment/:equipmentId', (req, res, next) => {
  dailyLogsController.updateEquipment(req, res, next);
});
router.delete('/:id/equipment/:equipmentId', (req, res, next) => {
  dailyLogsController.deleteEquipment(req, res, next);
});

// Materials
router.post('/:id/materials', (req, res, next) => {
  dailyLogsController.addMaterial(req, res, next);
});
router.patch('/:id/materials/:materialId', (req, res, next) => {
  dailyLogsController.updateMaterial(req, res, next);
});
router.delete('/:id/materials/:materialId', (req, res, next) => {
  dailyLogsController.deleteMaterial(req, res, next);
});

// Inspection Notes
router.post('/:id/inspection-notes', (req, res, next) => {
  dailyLogsController.addInspectionNote(req, res, next);
});
router.patch('/:id/inspection-notes/:noteId', (req, res, next) => {
  dailyLogsController.updateInspectionNote(req, res, next);
});
router.delete('/:id/inspection-notes/:noteId', (req, res, next) => {
  dailyLogsController.deleteInspectionNote(req, res, next);
});

// ============================================
// PHOTOS ROUTES
// ============================================

/**
 * GET /api/daily-logs/:dailyLogId/photos
 * Get all photos for a daily log
 */
router.get('/:dailyLogId/photos', (req, res, next) => {
  photosController.getDailyLogPhotos(req, res, next);
});

module.exports = router;
