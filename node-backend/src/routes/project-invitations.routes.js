/**
 * Project Invitations Routes
 * Routes for inviting users to projects and managing memberships
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const invitationsController = require('../controllers/project-invitations.controller');

// All routes require authentication
router.use(authenticate);

// Project-scoped routes
router.post('/projects/:projectId/invitations', invitationsController.sendInvitation);
router.get('/projects/:projectId/invitations', invitationsController.getProjectInvitations);
router.get('/projects/:projectId/members', invitationsController.getProjectMembers);
router.delete('/projects/:projectId/members/:memberId', invitationsController.removeMember);

// User invitation routes (for the current user)
router.get('/invitations/me', invitationsController.getMyInvitations);
router.post('/invitations/:invitationId/accept', invitationsController.acceptInvitation);
router.post('/invitations/:invitationId/decline', invitationsController.declineInvitation);
router.delete('/invitations/:invitationId', invitationsController.cancelInvitation);

module.exports = router;
