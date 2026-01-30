const prisma = require('../services/prisma');

/**
 * Projects Controller - CRUD operations for projects
 */
class ProjectsController {
  /**
   * GET /api/projects
   * List all projects
   * Query params: is_test (true/false) - filter by test flag
   */
  async list(req, res, next) {
    try {
      const { is_test } = req.query;

      const whereClause = {};
      if (is_test !== undefined) {
        whereClause.isTest = is_test === 'true';
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
   * Get a single project with stats
   */
  async get(req, res, next) {
    try {
      const { id } = req.params;

      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              dailyLogs: true,
              events: true
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
        recentEvents
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/projects
   * Create a new project
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

      const project = await prisma.project.create({
        data: {
          ...(id && { id }), // Use client-provided ID if available
          name,
          number,
          address
        }
      });

      res.status(201).json(project);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/projects/:id
   * Update a project
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { name, number, address, is_test } = req.body;

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
   * Delete a project (cascades to logs and events)
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;

      await prisma.project.delete({
        where: { id }
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/projects/consolidate
   * Merge duplicate projects (same name) into one
   * Moves all events and daily logs to the canonical project
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
