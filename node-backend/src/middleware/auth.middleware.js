const authService = require('../services/auth.service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

// ============================================
// PROJECT ACCESS CONTROL
// ============================================

/**
 * Get project ID from request (query, params, or body)
 */
const getProjectIdFromRequest = (req) => {
  return req.params.projectId ||
         req.query.projectId ||
         req.query.project_id ||
         req.body.projectId ||
         req.body.project_id;
};

/**
 * Check if user has access to a project
 * Returns the user's membership with role, or null if no access
 */
const getUserProjectAccess = async (userId, projectId) => {
  if (!userId || !projectId) return null;

  // System admins have access to all projects
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.role === 'ADMIN') {
    return { role: 'ADMIN', isSystemAdmin: true };
  }

  // Check project membership
  const membership = await prisma.userProject.findUnique({
    where: {
      userId_projectId: { userId, projectId }
    }
  });

  return membership;
};

/**
 * Middleware to require project access
 * Must be used after authenticate middleware
 * Extracts projectId from request and validates user has access
 */
const requireProjectAccess = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const projectId = getProjectIdFromRequest(req);

  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  // Verify project exists
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Check access
  const access = await getUserProjectAccess(req.user.id, projectId);

  if (!access) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }

  // Attach project and access info to request
  req.project = project;
  req.projectAccess = access;

  next();
};

/**
 * Middleware factory to require specific project roles
 * Example: requireProjectRole('OWNER', 'ADMIN') - allows owners and admins
 */
const requireProjectRole = (...allowedRoles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const projectId = getProjectIdFromRequest(req);

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    // Verify project exists
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // System admins bypass project role checks
    if (req.user.role === 'ADMIN') {
      req.project = project;
      req.projectAccess = { role: 'ADMIN', isSystemAdmin: true };
      return next();
    }

    // Check project membership
    const membership = await prisma.userProject.findUnique({
      where: {
        userId_projectId: { userId: req.user.id, projectId }
      }
    });

    if (!membership || !allowedRoles.includes(membership.role)) {
      return res.status(403).json({ error: 'Insufficient project permissions' });
    }

    req.project = project;
    req.projectAccess = membership;

    next();
  };
};

/**
 * Middleware to get user's accessible projects
 * Adds req.accessibleProjectIds array for filtering queries
 */
const loadAccessibleProjects = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // System admins can see all projects
  if (req.user.role === 'ADMIN') {
    req.accessibleProjectIds = null; // null means all projects
    return next();
  }

  // Get user's project memberships
  const memberships = await prisma.userProject.findMany({
    where: { userId: req.user.id },
    select: { projectId: true }
  });

  req.accessibleProjectIds = memberships.map(m => m.projectId);

  next();
};

// Role-based shortcuts for project access
const requireProjectOwner = requireProjectRole('OWNER');
const requireProjectAdmin = requireProjectRole('OWNER', 'ADMIN');
const requireProjectMember = requireProjectRole('OWNER', 'ADMIN', 'MEMBER');
const requireProjectViewer = requireProjectRole('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

module.exports = {
  authenticate,
  requireRole,
  requireAdmin,
  requireEditor,
  requireViewer,
  optionalAuth,
  // Project access
  getProjectIdFromRequest,
  getUserProjectAccess,
  requireProjectAccess,
  requireProjectRole,
  loadAccessibleProjects,
  requireProjectOwner,
  requireProjectAdmin,
  requireProjectMember,
  requireProjectViewer,
};
