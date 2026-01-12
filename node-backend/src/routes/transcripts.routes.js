const express = require('express');
const router = express.Router();
const transcriptController = require('../controllers/transcript.controller');

/**
 * POST /api/transcripts/parse
 * Parse a transcript and return structured daily log data
 */
router.post('/parse', (req, res, next) => {
  transcriptController.parseTranscript(req, res, next);
});

/**
 * POST /api/transcripts/auto-fill/:dailyLogId
 * Auto-fill an existing daily log from a transcript
 */
router.post('/auto-fill/:dailyLogId', (req, res, next) => {
  transcriptController.autoFillDailyLog(req, res, next);
});

/**
 * POST /api/transcripts/create-daily-log
 * Create a new daily log from a transcript
 */
router.post('/create-daily-log', (req, res, next) => {
  transcriptController.createDailyLogFromTranscript(req, res, next);
});

module.exports = router;
