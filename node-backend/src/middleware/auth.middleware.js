const authService = require('../services/auth.service');

// Middleware to verify JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = authService.verifyToken(token);

    const user = await authService.getUserById(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Middleware to check role permissions
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Role-based permission shortcuts
const requireAdmin = requireRole('ADMIN');
const requireEditor = requireRole('ADMIN', 'EDITOR');
const requireViewer = requireRole('ADMIN', 'EDITOR', 'VIEWER');

// Optional authentication - continues even without valid token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = authService.verifyToken(token);
      const user = await authService.getUserById(decoded.id);

      if (user && user.isActive) {
        req.user = user;
      }
    }
  } catch (error) {
    // Token invalid or expired, continue without user
  }

  next();
};

module.exports = {
  authenticate,
  requireRole,
  requireAdmin,
  requireEditor,
  requireViewer,
  optionalAuth,
};
