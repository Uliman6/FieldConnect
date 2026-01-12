const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes
router.get('/me', authenticate, authController.getCurrentUser);

// Admin-only routes
router.get('/users', authenticate, requireAdmin, authController.getAllUsers);
router.patch('/users/:id', authenticate, requireAdmin, authController.updateUser);
router.delete('/users/:id', authenticate, requireAdmin, authController.deleteUser);

module.exports = router;
