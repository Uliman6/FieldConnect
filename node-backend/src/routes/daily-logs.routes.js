const express = require('express');
const router = express.Router();
const dailyLogsController = require('../controllers/daily-logs.controller');

/**
 * GET /api/daily-logs
 * List daily logs (with optional filters)
 */
router.get('/', (req, res, next) => {
  dailyLogsController.list(req, res, next);
});

/**
 * GET /api/daily-logs/:id
 * Get a single daily log with all nested data
 */
router.get('/:id', (req, res, next) => {
  dailyLogsController.get(req, res, next);
});

/**
 * POST /api/daily-logs
 * Create a new daily log
 */
router.post('/', (req, res, next) => {
  dailyLogsController.create(req, res, next);
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

module.exports = router;
