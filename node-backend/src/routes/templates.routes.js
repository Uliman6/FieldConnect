const express = require('express');
const router = express.Router();
const multer = require('multer');
const templatesController = require('../controllers/templates.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Configure multer for PDF uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// All routes require authentication
router.use(authMiddleware);

// Template CRUD routes
router.post('/', upload.single('pdf'), templatesController.uploadTemplate);
router.get('/', templatesController.getTemplates);
router.get('/:id', templatesController.getTemplateById);
router.put('/:id', upload.single('pdf'), templatesController.updateTemplate);
router.delete('/:id', templatesController.deleteTemplate);
router.get('/:id/download', templatesController.downloadTemplate);

module.exports = router;
