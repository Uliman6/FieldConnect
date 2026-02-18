/**
 * Project Invitations Routes
 * User-facing routes for accepting/declining invitations
 * Note: Project-scoped invitation routes are in projects.routes.js
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const invitationsController = require('../controllers/project-invitations.controller');

// All routes require authentication
router.use(authenticate);

// User invitation routes (for the current user)
router.get('/invitations/me', invitationsController.getMyInvitations);
router.post('/invitations/:invitationId/accept', invitationsController.acceptInvitation);
router.post('/invitations/:invitationId/decline', invitationsController.declineInvitation);
router.delete('/invitations/:invitationId', invitationsController.cancelInvitation);

module.exports = router;
