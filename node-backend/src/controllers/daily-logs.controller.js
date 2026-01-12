const prisma = require('../services/prisma');

/**
 * Daily Logs Controller - CRUD operations for daily logs
 */
class DailyLogsController {
  /**
   * GET /api/daily-logs
   * List daily logs (optionally filtered by project)
   */
  async list(req, res, next) {
    try {
      const { project_id, status, start_date, end_date, limit = 50 } = req.query;

      const whereClause = {};

      if (project_id) {
        whereClause.projectId = project_id;
      }
      if (status) {
        whereClause.status = status;
      }
      if (start_date || end_date) {
        whereClause.date = {};
        if (start_date) whereClause.date.gte = new Date(start_date);
        if (end_date) whereClause.date.lte = new Date(end_date);
      }

      const dailyLogs = await prisma.dailyLog.findMany({
        where: whereClause,
        orderBy: { date: 'desc' },
        take: parseInt(limit),
        include: {
          project: {
            select: { id: true, name: true, number: true }
          },
          _count: {
            select: {
              tasks: true,
              pendingIssues: true,
              inspectionNotes: true
            }
          }
        }
      });

      res.json(dailyLogs);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/daily-logs/:id
   * Get a single daily log with all nested data
   */
  async get(req, res, next) {
    try {
      const { id } = req.params;

      const dailyLog = await prisma.dailyLog.findUnique({
        where: { id },
        include: {
          project: true,
          tasks: true,
          visitors: true,
          equipment: true,
          materials: true,
          pendingIssues: true,
          inspectionNotes: true,
          additionalWorkEntries: true
        }
      });

      if (!dailyLog) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Daily log not found'
        });
      }

      res.json(dailyLog);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/daily-logs
   * Create a new daily log
   */
  async create(req, res, next) {
    try {
      const {
        project_id,
        date,
        prepared_by,
        status,
        daily_totals_workers,
        daily_totals_hours,
        weather,
        tasks,
        visitors,
        equipment,
        materials,
        pending_issues,
        inspection_notes,
        additional_work_entries
      } = req.body;

      if (!project_id) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'project_id is required'
        });
      }

      if (!date) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'date is required'
        });
      }

      // Verify project exists
      const project = await prisma.project.findUnique({
        where: { id: project_id }
      });

      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Project not found'
        });
      }

      const dailyLog = await prisma.dailyLog.create({
        data: {
          projectId: project_id,
          date: new Date(date),
          preparedBy: prepared_by,
          status: status || 'draft',
          dailyTotalsWorkers: daily_totals_workers,
          dailyTotalsHours: daily_totals_hours,
          weather: weather || null,
          tasks: tasks ? {
            create: tasks.map(t => ({
              companyName: t.company_name,
              workers: t.workers,
              hours: t.hours,
              taskDescription: t.task_description,
              notes: t.notes
            }))
          } : undefined,
          visitors: visitors ? {
            create: visitors.map(v => ({
              time: v.time,
              companyName: v.company_name,
              visitorName: v.visitor_name,
              notes: v.notes
            }))
          } : undefined,
          equipment: equipment ? {
            create: equipment.map(e => ({
              equipmentType: e.equipment_type,
              quantity: e.quantity,
              hours: e.hours,
              notes: e.notes
            }))
          } : undefined,
          materials: materials ? {
            create: materials.map(m => ({
              material: m.material,
              quantity: m.quantity,
              unit: m.unit,
              supplier: m.supplier,
              notes: m.notes
            }))
          } : undefined,
          pendingIssues: pending_issues ? {
            create: pending_issues.map(i => ({
              title: i.title,
              description: i.description,
              category: i.category,
              severity: i.severity,
              assignee: i.assignee,
              dueDate: i.due_date ? new Date(i.due_date) : null,
              externalEntity: i.external_entity,
              location: i.location
            }))
          } : undefined,
          inspectionNotes: inspection_notes ? {
            create: inspection_notes.map(n => ({
              inspectorName: n.inspector_name,
              ahj: n.ahj,
              inspectionType: n.inspection_type,
              result: n.result,
              notes: n.notes,
              followUpNeeded: n.follow_up_needed
            }))
          } : undefined,
          additionalWorkEntries: additional_work_entries ? {
            create: additional_work_entries.map(a => ({
              category: a.category,
              description: a.description
            }))
          } : undefined
        },
        include: {
          project: true,
          tasks: true,
          visitors: true,
          equipment: true,
          materials: true,
          pendingIssues: true,
          inspectionNotes: true,
          additionalWorkEntries: true
        }
      });

      res.status(201).json(dailyLog);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/daily-logs/:id
   * Update a daily log
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const {
        date,
        prepared_by,
        status,
        daily_totals_workers,
        daily_totals_hours,
        weather
      } = req.body;

      const dailyLog = await prisma.dailyLog.update({
        where: { id },
        data: {
          ...(date !== undefined && { date: new Date(date) }),
          ...(prepared_by !== undefined && { preparedBy: prepared_by }),
          ...(status !== undefined && { status }),
          ...(daily_totals_workers !== undefined && { dailyTotalsWorkers: daily_totals_workers }),
          ...(daily_totals_hours !== undefined && { dailyTotalsHours: daily_totals_hours }),
          ...(weather !== undefined && { weather })
        },
        include: {
          project: true,
          tasks: true,
          visitors: true,
          equipment: true,
          materials: true,
          pendingIssues: true,
          inspectionNotes: true,
          additionalWorkEntries: true
        }
      });

      res.json(dailyLog);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/daily-logs/:id
   * Delete a daily log (cascades nested data)
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;

      await prisma.dailyLog.delete({
        where: { id }
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/daily-logs/:id/tasks
   * Add a task to a daily log
   */
  async addTask(req, res, next) {
    try {
      const { id } = req.params;
      const { company_name, workers, hours, task_description, notes } = req.body;

      const task = await prisma.task.create({
        data: {
          dailyLogId: id,
          companyName: company_name,
          workers,
          hours,
          taskDescription: task_description,
          notes
        }
      });

      res.status(201).json(task);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/daily-logs/:id/pending-issues
   * Add a pending issue to a daily log
   */
  async addPendingIssue(req, res, next) {
    try {
      const { id } = req.params;
      const { title, description, category, severity, assignee, due_date, external_entity, location } = req.body;

      const issue = await prisma.pendingIssue.create({
        data: {
          dailyLogId: id,
          title,
          description,
          category,
          severity,
          assignee,
          dueDate: due_date ? new Date(due_date) : null,
          externalEntity: external_entity,
          location
        }
      });

      res.status(201).json(issue);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DailyLogsController();
