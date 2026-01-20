const express = require('express');
const router = express.Router();
const multer = require('multer');
const documentSchemaController = require('../controllers/document-schema.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Configure multer for document uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOCX, and TXT files are allowed'), false);
    }
  }
});

// All routes require authentication
router.use(authenticate);

// Schema CRUD routes
router.post('/', upload.single('document'), documentSchemaController.learnSchema);
router.get('/', documentSchemaController.getSchemas);
router.get('/:id', documentSchemaController.getSchemaById);
router.put('/:id', documentSchemaController.updateSchema);
router.delete('/:id', documentSchemaController.deleteSchema);

// Analysis endpoint (preview without saving)
router.post('/analyze', upload.single('document'), documentSchemaController.analyzeDocument);

module.exports = router;
