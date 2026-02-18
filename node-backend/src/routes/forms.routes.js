const express = require('express');
const router = express.Router();
const formsController = require('../controllers/forms.controller');
const { authenticate, optionalAuth, loadAccessibleProjects } = require('../middleware/auth.middleware');

// Template routes (templates are global, but forms are project-scoped)
router.get('/templates', optionalAuth, formsController.getTemplates);
router.get('/templates/:id', optionalAuth, formsController.getTemplate);
router.post('/templates', authenticate, formsController.createTemplate);
router.post('/templates/seed', formsController.seedDefaultTemplates); // No auth for initial setup
router.post('/templates/update', authenticate, formsController.updateDefaultTemplates); // Update existing templates

// OCR for nameplate photos (must be before /:id routes)
router.post('/ocr/nameplate', authenticate, formsController.extractNameplateOcr);

// Form instance routes - require authentication and project access
router.get('/', authenticate, loadAccessibleProjects, formsController.getForms);
router.get('/:id', authenticate, loadAccessibleProjects, formsController.getForm);
router.post('/', authenticate, loadAccessibleProjects, formsController.createForm);
router.put('/:id', authenticate, loadAccessibleProjects, formsController.updateForm);
router.delete('/:id', authenticate, loadAccessibleProjects, formsController.deleteForm);

// PDF generation - require authentication and project access
router.get('/:id/pdf', authenticate, loadAccessibleProjects, formsController.generateFormPdf);

module.exports = router;
