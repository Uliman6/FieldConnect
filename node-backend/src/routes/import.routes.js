const express = require('express');
const router = express.Router();
const importController = require('../controllers/import.controller');
const { uploadJsonMemory } = require('../middleware/upload.middleware');

/**
 * POST /api/import/json
 * Import JSON export file or body
 */
router.post('/json', uploadJsonMemory.single('file'), (req, res, next) => {
  importController.importJson(req, res, next);
});

/**
 * GET /api/import/history
 * Get import history
 */
router.get('/history', (req, res, next) => {
  importController.getImportHistory(req, res, next);
});

module.exports = router;
