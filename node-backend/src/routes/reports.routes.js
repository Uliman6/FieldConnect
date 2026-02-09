const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');

/**
 * GET /api/reports/daily-log/:id
 * Generate and download PDF report for a daily log
 */
router.get('/daily-log/:id', (req, res, next) => {
  reportsController.generateDailyLogReport(req, res, next);
});

/**
 * GET /api/reports/daily-log/:id/preview
 * Preview PDF report inline
 */
router.get('/daily-log/:id/preview', (req, res, next) => {
  reportsController.previewDailyLogReport(req, res, next);
});

/**
 * POST /api/reports/bulk-export
 * Bulk export multiple documents as a ZIP file
 * Body: { type: 'daily_log' | 'punch_list' | 'rfi', ids: string[] }
 */
router.post('/bulk-export', (req, res, next) => {
  reportsController.bulkExport(req, res, next);
});

/**
 * GET /api/reports/bulk-export/project/:projectId
 * Export all documents of a type for a project
 * Query: type=daily_log|punch_list|rfi
 */
router.get('/bulk-export/project/:projectId', (req, res, next) => {
  reportsController.bulkExportProject(req, res, next);
});

module.exports = router;
