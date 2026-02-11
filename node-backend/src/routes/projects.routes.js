const express = require('express');
const router = express.Router();
const projectsController = require('../controllers/projects.controller');
const { authenticate, requireRole, loadAccessibleProjects, requireProjectAdmin, requireProjectOwner } = require('../middleware/auth.middleware');

// All project routes require authentication
router.use(authenticate);

/**
 * GET /api/projects
 * List projects (only those user has access to)
 */
router.get('/', loadAccessibleProjects, (req, res, next) => {
  projectsController.list(req, res, next);
});

/**
 * POST /api/projects/consolidate
 * Merge duplicate projects (admin only)
 */
router.post('/consolidate', requireRole('ADMIN'), (req, res, next) => {
  projectsController.consolidate(req, res, next);
});

/**
 * GET /api/projects/:id
 * Get a single project (requires project access)
 */
router.get('/:id', loadAccessibleProjects, (req, res, next) => {
  projectsController.get(req, res, next);
});

/**
 * POST /api/projects
 * Create a new project (creator becomes OWNER)
 */
router.post('/', loadAccessibleProjects, (req, res, next) => {
  projectsController.create(req, res, next);
});

/**
 * PATCH /api/projects/:id
 * Update a project (requires project admin role)
 */
router.patch('/:id', loadAccessibleProjects, (req, res, next) => {
  projectsController.update(req, res, next);
});

/**
 * DELETE /api/projects/:id
 * Delete a project (requires project owner role or system admin)
 */
router.delete('/:id', loadAccessibleProjects, (req, res, next) => {
  projectsController.delete(req, res, next);
});

/**
 * POST /api/projects/:id/members
 * Add a member to a project
 */
router.post('/:id/members', loadAccessibleProjects, (req, res, next) => {
  projectsController.addMember(req, res, next);
});

/**
 * DELETE /api/projects/:id/members/:userId
 * Remove a member from a project
 */
router.delete('/:id/members/:userId', loadAccessibleProjects, (req, res, next) => {
  projectsController.removeMember(req, res, next);
});

/**
 * PATCH /api/projects/:id/members/:userId
 * Update a member's role in a project
 */
router.patch('/:id/members/:userId', loadAccessibleProjects, (req, res, next) => {
  projectsController.updateMemberRole(req, res, next);
});

/**
 * GET /api/projects/:id/members
 * List all members of a project
 */
router.get('/:id/members', loadAccessibleProjects, (req, res, next) => {
  projectsController.listMembers(req, res, next);
});

module.exports = router;
