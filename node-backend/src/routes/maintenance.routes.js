const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenance.controller');
const { authenticate } = require('../middleware/auth.middleware');

// All maintenance routes require authentication
router.use(authenticate);

// ============================================
// VISIT ROUTES
// ============================================

/**
 * GET /api/maintenance/visits
 * List user's maintenance visits
 */
router.get('/visits', (req, res, next) => {
  maintenanceController.listVisits(req, res, next);
});

/**
 * POST /api/maintenance/visits
 * Create a new maintenance visit
 */
router.post('/visits', (req, res, next) => {
  maintenanceController.createVisit(req, res, next);
});

/**
 * GET /api/maintenance/visits/:id
 * Get a single visit with all pumps
 */
router.get('/visits/:id', (req, res, next) => {
  maintenanceController.getVisit(req, res, next);
});

/**
 * PUT /api/maintenance/visits/:id
 * Update a visit
 */
router.put('/visits/:id', (req, res, next) => {
  maintenanceController.updateVisit(req, res, next);
});

/**
 * DELETE /api/maintenance/visits/:id
 * Delete a visit and all associated pumps
 */
router.delete('/visits/:id', (req, res, next) => {
  maintenanceController.deleteVisit(req, res, next);
});

// ============================================
// VISIT FORM ROUTES (for Servis Raporu, etc.)
// ============================================

/**
 * POST /api/maintenance/visits/:id/forms
 * Create or update a form for a visit (stored in notes field as JSON)
 */
router.post('/visits/:id/forms', (req, res, next) => {
  maintenanceController.createVisitForm(req, res, next);
});

/**
 * GET /api/maintenance/visits/:id/forms/:formType
 * Get a specific form for a visit
 */
router.get('/visits/:id/forms/:formType', (req, res, next) => {
  maintenanceController.getVisitForm(req, res, next);
});

// ============================================
// AI UTILITIES
// ============================================

/**
 * POST /api/maintenance/cleanup-notes
 * Clean up raw voice transcriptions into a cohesive service report
 */
router.post('/cleanup-notes', (req, res, next) => {
  maintenanceController.cleanupNotes(req, res, next);
});

/**
 * GET /api/maintenance/visits/:id/pdf
 * Generate PDF for a visit (Bakim or Servis form)
 */
router.get('/visits/:id/pdf', (req, res, next) => {
  maintenanceController.generatePdf(req, res, next);
});

// ============================================
// PUMP ROUTES
// ============================================

/**
 * POST /api/maintenance/visits/:id/pumps
 * Add a pump to a visit
 */
router.post('/visits/:id/pumps', (req, res, next) => {
  maintenanceController.addPump(req, res, next);
});

/**
 * PUT /api/maintenance/pumps/:pumpId
 * Update a pump
 */
router.put('/pumps/:pumpId', (req, res, next) => {
  maintenanceController.updatePump(req, res, next);
});

/**
 * DELETE /api/maintenance/pumps/:pumpId
 * Delete a pump
 */
router.delete('/pumps/:pumpId', (req, res, next) => {
  maintenanceController.deletePump(req, res, next);
});

// ============================================
// PUMP COMPONENT ROUTES
// ============================================

/**
 * POST /api/maintenance/pumps/:pumpId/components
 * Add or update a component for a pump (upsert by componentType)
 */
router.post('/pumps/:pumpId/components', (req, res, next) => {
  maintenanceController.upsertPumpComponent(req, res, next);
});

/**
 * GET /api/maintenance/pumps/:pumpId/components
 * Get all components for a pump
 */
router.get('/pumps/:pumpId/components', (req, res, next) => {
  maintenanceController.getPumpComponents(req, res, next);
});

// ============================================
// PUMP FORM ROUTES (for future use)
// ============================================

/**
 * POST /api/maintenance/pumps/:pumpId/forms
 * Create a form for a pump
 */
router.post('/pumps/:pumpId/forms', (req, res, next) => {
  maintenanceController.createPumpForm(req, res, next);
});

/**
 * PUT /api/maintenance/forms/:formId
 * Update a pump form
 */
router.put('/forms/:formId', (req, res, next) => {
  maintenanceController.updatePumpForm(req, res, next);
});

module.exports = router;
