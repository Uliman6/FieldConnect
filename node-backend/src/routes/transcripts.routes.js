const express = require('express');
const router = express.Router();
const transcriptController = require('../controllers/transcript.controller');
const { uploadAudioMemory } = require('../middleware/upload.middleware');

/**
 * POST /api/transcripts/transcribe
 * Transcribe audio file to text using OpenAI Whisper
 */
router.post('/transcribe', uploadAudioMemory.single('audio'), (req, res, next) => {
  transcriptController.transcribeAudio(req, res, next);
});

/**
 * GET /api/transcripts/status
 * Check if transcription service is available
 */
router.get('/status', (req, res, next) => {
  transcriptController.getTranscriptionStatus(req, res, next);
});

/**
 * POST /api/transcripts/parse
 * Parse a transcript and return structured daily log data
 */
router.post('/parse', (req, res, next) => {
  transcriptController.parseTranscript(req, res, next);
});

/**
 * POST /api/transcripts/parse-event
 * Parse an event transcript using AI for intelligent extraction
 * Returns: title, event_type, severity, action_items, location, trade_vendor
 */
router.post('/parse-event', (req, res, next) => {
  transcriptController.parseEvent(req, res, next);
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
