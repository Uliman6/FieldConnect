/**
 * Voice Diary Routes
 * API endpoints for voice diary processing
 */

const express = require('express');
const router = express.Router();
const voiceDiaryController = require('../controllers/voice-diary.controller');
const { authenticate } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(authenticate);

// POST /api/voice-diary/categorize - Categorize a transcript
router.post('/categorize', (req, res, next) =>
  voiceDiaryController.categorize(req, res, next)
);

// POST /api/voice-diary/summarize - Generate daily summary
router.post('/summarize', (req, res, next) =>
  voiceDiaryController.summarize(req, res, next)
);

// POST /api/voice-diary/match-forms - Match to form templates
router.post('/match-forms', (req, res, next) =>
  voiceDiaryController.matchForms(req, res, next)
);

// POST /api/voice-diary/process - Full processing pipeline
router.post('/process', (req, res, next) =>
  voiceDiaryController.process(req, res, next)
);

// GET /api/voice-diary/categories - Get available categories
router.get('/categories', (req, res) =>
  voiceDiaryController.getCategories(req, res)
);

module.exports = router;
