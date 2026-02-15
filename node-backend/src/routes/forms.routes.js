const express = require('express');
const router = express.Router();
const formsController = require('../controllers/forms.controller');
const { authenticate, optionalAuth } = require('../middleware/auth.middleware');

// Template routes
router.get('/templates', optionalAuth, formsController.getTemplates);
router.get('/templates/:id', optionalAuth, formsController.getTemplate);
router.post('/templates', authenticate, formsController.createTemplate);
router.post('/templates/seed', formsController.seedDefaultTemplates); // No auth for initial setup

// Form instance routes
router.get('/', optionalAuth, formsController.getForms);
router.get('/:id', optionalAuth, formsController.getForm);
router.post('/', authenticate, formsController.createForm);
router.put('/:id', authenticate, formsController.updateForm);
router.delete('/:id', authenticate, formsController.deleteForm);

module.exports = router;
