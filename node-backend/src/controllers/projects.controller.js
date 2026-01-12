const prisma = require('../services/prisma');

/**
 * Projects Controller - CRUD operations for projects
 */
class ProjectsController {
  /**
   * GET /api/projects
   * List all projects
   */
  async list(req, res, next) {
    try {
      const projects = await prisma.project.findMany({
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
   */
  async create(req, res, next) {
    try {
      const { name, number, address } = req.body;

      if (!name) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Project name is required'
        });
      }

      const project = await prisma.project.create({
        data: {
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
      const { name, number, address } = req.body;

      const project = await prisma.project.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(number !== undefined && { number }),
          ...(address !== undefined && { address })
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
}

module.exports = new ProjectsController();
