/**
 * Voice Diary Routes
 * API endpoints for voice diary processing and project-scoped persistence
 */

const express = require('express');
const router = express.Router();
const voiceDiaryController = require('../controllers/voice-diary.controller');
const { authenticate, requireAdmin, loadAccessibleProjects } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(authenticate);
// Loads req.accessibleProjectIds (null for system admins) used to scope
// every project-bound read/write below
router.use(loadAccessibleProjects);

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

// POST /api/voice-diary/process - Full processing pipeline: categorize,
// title, persist the note + snippets, recompute daily summary. Requires
// projectId in the body.
router.post('/process', (req, res, next) =>
  voiceDiaryController.process(req, res, next)
);

// GET /api/voice-diary/notes - List notes (+ snippets) for a project.
// Requires ?projectId=
router.get('/notes', (req, res, next) =>
  voiceDiaryController.listNotes(req, res, next)
);

// DELETE /api/voice-diary/notes/:id - Delete a note (cascades to snippets)
router.delete('/notes/:id', (req, res, next) =>
  voiceDiaryController.deleteNoteById(req, res, next)
);

// GET /api/voice-diary/summary - Get a daily summary. Requires
// ?projectId=&date=, optional &userId=
router.get('/summary', (req, res, next) =>
  voiceDiaryController.getSummary(req, res, next)
);

// PATCH /api/voice-diary/snippets/:id - Edit a snippet's content
router.patch('/snippets/:id', (req, res, next) =>
  voiceDiaryController.updateSnippetContent(req, res, next)
);

// DELETE /api/voice-diary/snippets/:id - Remove a snippet
router.delete('/snippets/:id', (req, res, next) =>
  voiceDiaryController.deleteSnippetById(req, res, next)
);

// GET /api/voice-diary/categories - Get available categories
router.get('/categories', (req, res) =>
  voiceDiaryController.getCategories(req, res)
);

// POST /api/voice-diary/tool-feedback - Process tool feedback
router.post('/tool-feedback', (req, res, next) =>
  voiceDiaryController.processToolFeedback(req, res, next)
);

// POST /api/voice-diary/translate - Translate text between languages
router.post('/translate', (req, res, next) =>
  voiceDiaryController.translateText(req, res, next)
);

// POST /api/voice-diary/feedback - Submit feedback
router.post('/feedback', (req, res, next) =>
  voiceDiaryController.submitFeedback(req, res, next)
);

// Admin routes
// GET /api/voice-diary/admin/feedback - Get all feedback (admin only)
router.get('/admin/feedback', requireAdmin, (req, res, next) =>
  voiceDiaryController.getAllFeedback(req, res, next)
);

module.exports = router;
