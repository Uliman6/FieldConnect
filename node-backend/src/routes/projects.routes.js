const express = require('express');
const router = express.Router();
const projectsController = require('../controllers/projects.controller');

/**
 * GET /api/projects
 * List all projects
 */
router.get('/', (req, res, next) => {
  projectsController.list(req, res, next);
});

/**
 * GET /api/projects/:id
 * Get a single project
 */
router.get('/:id', (req, res, next) => {
  projectsController.get(req, res, next);
});

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/', (req, res, next) => {
  projectsController.create(req, res, next);
});

/**
 * PATCH /api/projects/:id
 * Update a project
 */
router.patch('/:id', (req, res, next) => {
  projectsController.update(req, res, next);
});

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
router.delete('/:id', (req, res, next) => {
  projectsController.delete(req, res, next);
});

module.exports = router;
