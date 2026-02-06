const prisma = require('../services/prisma');
const { getUserProjectAccess } = require('../middleware/auth.middleware');

/**
 * Projects Controller - CRUD operations for projects with access control
 */
class ProjectsController {
  /**
   * GET /api/projects
   * List projects the user has access to
   * Query params: is_test (true/false) - filter by test flag
   */
  async list(req, res, next) {
    try {
      const { is_test } = req.query;

      const whereClause = {};
      if (is_test !== undefined) {
        whereClause.isTest = is_test === 'true';
      }

      // Filter by accessible projects (from loadAccessibleProjects middleware)
      if (req.accessibleProjectIds !== null) {
        whereClause.id = { in: req.accessibleProjectIds };
      }

      const projects = await prisma.project.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              dailyLogs: true,
              events: true
            }
          },
          members: {
            select: {
              userId: true,
              role: true
            }
          }
        }
      });

      res.json(projects);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/projects/:id
   * Get a single project with stats (requires access)
   */
  async get(req, res, next) {
    try {
      const { id } = req.params;

      // Check access
      const access = await getUserProjectAccess(req.user.id, id);
      if (!access) {
        return res.status(403).json({ error: 'You do not have access to this project' });
      }

      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              dailyLogs: true,
              events: true
            }
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true
                }
              }
            }
          }
        }
      });

      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Project not found'
        });
      }

      // Get recent activity
      const recentLogs = await prisma.dailyLog.findMany({
        where: { projectId: id },
        orderBy: { date: 'desc' },
        take: 5,
        select: {
          id: true,
          date: true,
          status: true,
          preparedBy: true
        }
      });

      const recentEvents = await prisma.event.findMany({
        where: { projectId: id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          eventType: true,
          severity: true,
          createdAt: true
        }
      });

      res.json({
        ...project,
        recentLogs,
        recentEvents,
        userRole: access.role
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/projects
   * Create a new project (creator becomes OWNER)
   * Accepts client-provided ID for local-first architecture
   */
  async create(req, res, next) {
    try {
      const { id, name, number, address } = req.body;

      if (!name) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Project name is required'
        });
      }

      // If client provided an ID, check if it already exists (idempotent create)
      if (id) {
        const existing = await prisma.project.findUnique({ where: { id } });
        if (existing) {
          // Return existing project (idempotent)
          return res.status(200).json(existing);
        }
      }

      // Create project and add creator as OWNER in a transaction
      const result = await prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            ...(id && { id }), // Use client-provided ID if available
            name,
            number,
            address,
            companyId: req.user.companyId // Associate with user's company
          }
        });

        // Add creator as OWNER
        await tx.userProject.create({
          data: {
            userId: req.user.id,
            projectId: project.id,
            role: 'OWNER'
          }
        });

        return project;
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/projects/:id
   * Update a project (requires ADMIN or OWNER role)
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { name, number, address, is_test } = req.body;

      // Check access - need ADMIN or OWNER role
      const access = await getUserProjectAccess(req.user.id, id);
      if (!access || (!access.isSystemAdmin && !['OWNER', 'ADMIN'].includes(access.role))) {
        return res.status(403).json({ error: 'Insufficient permissions to update this project' });
      }

      const project = await prisma.project.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(number !== undefined && { number }),
          ...(address !== undefined && { address }),
          ...(is_test !== undefined && { isTest: is_test })
        }
      });

      res.json(project);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/projects/:id
   * Delete a project (requires OWNER role or system admin)
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;

      // Check access - need OWNER role or system admin
      const access = await getUserProjectAccess(req.user.id, id);
      if (!access || (!access.isSystemAdmin && access.role !== 'OWNER')) {
        return res.status(403).json({ error: 'Only project owners can delete projects' });
      }

      await prisma.project.delete({
        where: { id }
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/projects/:id/members
   * Add a member to a project (requires ADMIN or OWNER role)
   */
  async addMember(req, res, next) {
    try {
      const { id } = req.params;
      const { userId, email, role = 'MEMBER' } = req.body;

      // Check access
      const access = await getUserProjectAccess(req.user.id, id);
      if (!access || (!access.isSystemAdmin && !['OWNER', 'ADMIN'].includes(access.role))) {
        return res.status(403).json({ error: 'Insufficient permissions to add members' });
      }

      // Find user by ID or email
      let targetUserId = userId;
      if (!targetUserId && email) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          return res.status(404).json({ error: 'User not found with that email' });
        }
        targetUserId = user.id;
      }

      if (!targetUserId) {
        return res.status(400).json({ error: 'userId or email is required' });
      }

      // Validate role
      const validRoles = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      }

      // Only owners can add other owners/admins
      if (['OWNER', 'ADMIN'].includes(role) && access.role !== 'OWNER' && !access.isSystemAdmin) {
        return res.status(403).json({ error: 'Only project owners can add admins or owners' });
      }

      // Create membership (upsert to handle existing)
      const membership = await prisma.userProject.upsert({
        where: {
          userId_projectId: { userId: targetUserId, projectId: id }
        },
        update: { role },
        create: {
          userId: targetUserId,
          projectId: id,
          role
        },
        include: {
          user: {
            select: { id: true, email: true, name: true }
          }
        }
      });

      res.status(201).json(membership);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/projects/:id/members/:userId
   * Remove a member from a project
   */
  async removeMember(req, res, next) {
    try {
      const { id, userId } = req.params;

      // Check access
      const access = await getUserProjectAccess(req.user.id, id);
      if (!access || (!access.isSystemAdmin && !['OWNER', 'ADMIN'].includes(access.role))) {
        return res.status(403).json({ error: 'Insufficient permissions to remove members' });
      }

      // Can't remove yourself if you're the only owner
      if (userId === req.user.id) {
        const owners = await prisma.userProject.count({
          where: { projectId: id, role: 'OWNER' }
        });
        if (owners <= 1) {
          return res.status(400).json({ error: 'Cannot remove the last owner. Transfer ownership first.' });
        }
      }

      await prisma.userProject.delete({
        where: {
          userId_projectId: { userId, projectId: id }
        }
      });

      res.status(204).send();
    } catch (err) {
      if (err.code === 'P2025') {
        return res.status(404).json({ error: 'Member not found in this project' });
      }
      next(err);
    }
  }

  /**
   * PATCH /api/projects/:id/members/:userId
   * Update a member's role in a project
   */
  async updateMemberRole(req, res, next) {
    try {
      const { id, userId } = req.params;
      const { role } = req.body;

      // Check access - only owners can change roles
      const access = await getUserProjectAccess(req.user.id, id);
      if (!access || (!access.isSystemAdmin && access.role !== 'OWNER')) {
        return res.status(403).json({ error: 'Only project owners can change member roles' });
      }

      const validRoles = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      }

      const membership = await prisma.userProject.update({
        where: {
          userId_projectId: { userId, projectId: id }
        },
        data: { role },
        include: {
          user: {
            select: { id: true, email: true, name: true }
          }
        }
      });

      res.json(membership);
    } catch (err) {
      if (err.code === 'P2025') {
        return res.status(404).json({ error: 'Member not found in this project' });
      }
      next(err);
    }
  }

  /**
   * GET /api/projects/:id/members
   * List all members of a project
   */
  async listMembers(req, res, next) {
    try {
      const { id } = req.params;

      // Check access
      const access = await getUserProjectAccess(req.user.id, id);
      if (!access) {
        return res.status(403).json({ error: 'You do not have access to this project' });
      }

      const members = await prisma.userProject.findMany({
        where: { projectId: id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true
            }
          }
        },
        orderBy: [
          { role: 'asc' }, // OWNER first
          { createdAt: 'asc' }
        ]
      });

      res.json(members);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/projects/consolidate
   * Merge duplicate projects (same name) into one - admin only
   */
  async consolidate(req, res, next) {
    try {
      // Get all projects
      const projects = await prisma.project.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          _count: {
            select: { events: true, dailyLogs: true }
          }
        }
      });

      // Group by name (case-insensitive)
      const projectsByName = {};
      for (const project of projects) {
        const key = project.name.toLowerCase();
        if (!projectsByName[key]) {
          projectsByName[key] = [];
        }
        projectsByName[key].push(project);
      }

      const results = {
        consolidated: [],
        errors: []
      };

      // For each group with duplicates, consolidate
      for (const [name, group] of Object.entries(projectsByName)) {
        if (group.length <= 1) continue;

        // Keep the first (oldest) as canonical
        const canonical = group[0];
        const duplicates = group.slice(1);

        console.log(`[consolidate] Merging ${duplicates.length} duplicates into "${canonical.name}" (${canonical.id})`);

        try {
          // Move all events from duplicates to canonical
          for (const dup of duplicates) {
            await prisma.event.updateMany({
              where: { projectId: dup.id },
              data: { projectId: canonical.id }
            });

            await prisma.dailyLog.updateMany({
              where: { projectId: dup.id },
              data: { projectId: canonical.id }
            });

            // Delete the duplicate project
            await prisma.project.delete({
              where: { id: dup.id }
            });

            console.log(`[consolidate] Deleted duplicate project ${dup.id}`);
          }

          results.consolidated.push({
            name: canonical.name,
            canonicalId: canonical.id,
            mergedCount: duplicates.length,
            duplicateIds: duplicates.map(d => d.id)
          });
        } catch (err) {
          console.error(`[consolidate] Error merging "${name}":`, err);
          results.errors.push({
            name,
            error: err.message
          });
        }
      }

      res.json({
        message: 'Project consolidation complete',
        ...results
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ProjectsController();
