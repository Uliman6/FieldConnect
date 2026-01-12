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

module.exports = router;
