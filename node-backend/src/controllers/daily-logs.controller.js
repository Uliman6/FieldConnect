const prisma = require('../services/prisma');
const transcriptParser = require('../services/transcript-parser.service');

/**
 * Helper to parse date strings properly to avoid timezone issues
 * When given a date-only string like "2024-01-15", ensures we get the correct date
 */
function parseDate(dateInput) {
  if (!dateInput) return new Date();

  // If it's already a Date object, return it
  if (dateInput instanceof Date) return dateInput;

  // If it's a date-only string (YYYY-MM-DD), parse as UTC noon to avoid timezone issues
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return new Date(dateInput + 'T12:00:00.000Z');
  }

  // Otherwise, parse normally
  return new Date(dateInput);
}

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
          date: parseDate(date),
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
          ...(date !== undefined && { date: parseDate(date) }),
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
   * Delete a daily log (cascades nested data and linked events)
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;

      // First, delete any events linked to this daily log
      const deletedEvents = await prisma.event.deleteMany({
        where: { linkedDailyLogId: id }
      });

      if (deletedEvents.count > 0) {
        console.log(`[daily-logs] Deleted ${deletedEvents.count} linked events for daily log ${id}`);
      }

      // Then delete the daily log (cascades to tasks, issues, etc.)
      await prisma.dailyLog.delete({
        where: { id }
      });

      console.log(`[daily-logs] Daily log ${id} deleted successfully`);
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

  /**
   * POST /api/daily-logs/from-transcript
   * Create a new daily log from a voice transcript using AI parsing
   */
  async createFromTranscript(req, res, next) {
    try {
      const { project_id, transcript, date, prepared_by } = req.body;

      if (!project_id) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'project_id is required'
        });
      }

      if (!transcript) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'transcript is required'
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

      // Parse the transcript using AI
      const parsed = await transcriptParser.parseTranscriptWithAI(transcript, {
        projectName: project.name,
        date: date || new Date().toISOString()
      });

      if (parsed.error) {
        return res.status(400).json({
          error: 'Parse Error',
          message: parsed.error
        });
      }

      // Create the daily log with parsed data
      const dailyLog = await prisma.dailyLog.create({
        data: {
          projectId: project_id,
          date: parseDate(date),
          preparedBy: prepared_by || null,
          status: 'draft',
          dailyTotalsWorkers: parsed.dailyTotals?.daily_totals_workers || 0,
          dailyTotalsHours: parsed.dailyTotals?.daily_totals_hours || 0,
          weather: parsed.weather || null,
          tasks: parsed.tasks?.length > 0 ? {
            create: parsed.tasks.map(t => ({
              companyName: t.company_name || null,
              workers: t.workers || null,
              hours: t.hours || null,
              taskDescription: t.task_description || null,
              notes: t.notes || null
            }))
          } : undefined,
          visitors: parsed.visitors?.length > 0 ? {
            create: parsed.visitors.map(v => ({
              time: v.time || null,
              companyName: v.company_name || null,
              visitorName: v.visitor_name || null,
              notes: v.notes || null
            }))
          } : undefined,
          equipment: parsed.equipment?.length > 0 ? {
            create: parsed.equipment.map(e => ({
              equipmentType: e.equipment_type || null,
              quantity: e.quantity || null,
              hours: e.hours || null,
              notes: e.notes || null
            }))
          } : undefined,
          materials: parsed.materials?.length > 0 ? {
            create: parsed.materials.map(m => ({
              material: m.material || null,
              quantity: m.quantity || null,
              unit: m.unit || null,
              supplier: m.supplier || null,
              notes: m.notes || null
            }))
          } : undefined,
          pendingIssues: parsed.pendingIssues?.length > 0 ? {
            create: parsed.pendingIssues.map(i => ({
              title: i.title || 'Untitled Issue',
              description: i.description || null,
              category: i.category || null,
              severity: i.severity?.toLowerCase() || null,
              assignee: i.assignee || null,
              location: i.location || null
            }))
          } : undefined,
          inspectionNotes: parsed.inspectionNotes?.length > 0 ? {
            create: parsed.inspectionNotes.map(n => ({
              inspectorName: n.inspector_name || null,
              ahj: n.ahj || null,
              inspectionType: n.inspection_type || null,
              result: n.result || null,
              notes: n.notes || null,
              followUpNeeded: n.follow_up_needed || false
            }))
          } : undefined,
          additionalWorkEntries: parsed.additionalWork?.length > 0 ? {
            create: parsed.additionalWork.map(a => ({
              category: a.category || 'General',
              description: a.description || null
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

      res.status(201).json({
        ...dailyLog,
        _parsed: {
          rawTranscript: transcript,
          taskCount: parsed.tasks?.length || 0,
          issueCount: parsed.pendingIssues?.length || 0,
          inspectionCount: parsed.inspectionNotes?.length || 0
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/daily-logs/:id/parse-transcript
   * Parse a transcript and update an existing daily log with extracted data
   */
  async parseAndUpdateFromTranscript(req, res, next) {
    try {
      const { id } = req.params;
      const { transcript, merge = true } = req.body;

      if (!transcript) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'transcript is required'
        });
      }

      // Find existing daily log
      const existingLog = await prisma.dailyLog.findUnique({
        where: { id },
        include: { project: true }
      });

      if (!existingLog) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Daily log not found'
        });
      }

      // Parse the transcript using AI
      const parsed = await transcriptParser.parseTranscriptWithAI(transcript, {
        projectName: existingLog.project.name,
        date: existingLog.date.toISOString()
      });

      if (parsed.error) {
        return res.status(400).json({
          error: 'Parse Error',
          message: parsed.error
        });
      }

      // If not merging, delete existing nested data first
      if (!merge) {
        await prisma.$transaction([
          prisma.task.deleteMany({ where: { dailyLogId: id } }),
          prisma.visitor.deleteMany({ where: { dailyLogId: id } }),
          prisma.equipment.deleteMany({ where: { dailyLogId: id } }),
          prisma.material.deleteMany({ where: { dailyLogId: id } }),
          prisma.pendingIssue.deleteMany({ where: { dailyLogId: id } }),
          prisma.inspectionNote.deleteMany({ where: { dailyLogId: id } }),
          prisma.additionalWorkEntry.deleteMany({ where: { dailyLogId: id } })
        ]);
      }

      // Add new parsed data
      const updates = [];

      if (parsed.tasks?.length > 0) {
        updates.push(
          prisma.task.createMany({
            data: parsed.tasks.map(t => ({
              dailyLogId: id,
              companyName: t.company_name || null,
              workers: t.workers || null,
              hours: t.hours || null,
              taskDescription: t.task_description || null,
              notes: t.notes || null
            }))
          })
        );
      }

      if (parsed.visitors?.length > 0) {
        updates.push(
          prisma.visitor.createMany({
            data: parsed.visitors.map(v => ({
              dailyLogId: id,
              time: v.time || null,
              companyName: v.company_name || null,
              visitorName: v.visitor_name || null,
              notes: v.notes || null
            }))
          })
        );
      }

      if (parsed.equipment?.length > 0) {
        updates.push(
          prisma.equipment.createMany({
            data: parsed.equipment.map(e => ({
              dailyLogId: id,
              equipmentType: e.equipment_type || null,
              quantity: e.quantity || null,
              hours: e.hours || null,
              notes: e.notes || null
            }))
          })
        );
      }

      if (parsed.materials?.length > 0) {
        updates.push(
          prisma.material.createMany({
            data: parsed.materials.map(m => ({
              dailyLogId: id,
              material: m.material || null,
              quantity: m.quantity || null,
              unit: m.unit || null,
              supplier: m.supplier || null,
              notes: m.notes || null
            }))
          })
        );
      }

      if (parsed.pendingIssues?.length > 0) {
        updates.push(
          prisma.pendingIssue.createMany({
            data: parsed.pendingIssues.map(i => ({
              dailyLogId: id,
              title: i.title || 'Untitled Issue',
              description: i.description || null,
              category: i.category || null,
              severity: i.severity?.toLowerCase() || null,
              assignee: i.assignee || null,
              location: i.location || null
            }))
          })
        );
      }

      if (parsed.inspectionNotes?.length > 0) {
        updates.push(
          prisma.inspectionNote.createMany({
            data: parsed.inspectionNotes.map(n => ({
              dailyLogId: id,
              inspectorName: n.inspector_name || null,
              ahj: n.ahj || null,
              inspectionType: n.inspection_type || null,
              result: n.result || null,
              notes: n.notes || null,
              followUpNeeded: n.follow_up_needed || false
            }))
          })
        );
      }

      if (parsed.additionalWork?.length > 0) {
        updates.push(
          prisma.additionalWorkEntry.createMany({
            data: parsed.additionalWork.map(a => ({
              dailyLogId: id,
              category: a.category || 'General',
              description: a.description || null
            }))
          })
        );
      }

      // Execute all updates and update totals
      await prisma.$transaction([
        ...updates,
        prisma.dailyLog.update({
          where: { id },
          data: {
            dailyTotalsWorkers: parsed.dailyTotals?.daily_totals_workers || existingLog.dailyTotalsWorkers,
            dailyTotalsHours: parsed.dailyTotals?.daily_totals_hours || existingLog.dailyTotalsHours,
            weather: parsed.weather || existingLog.weather
          }
        })
      ]);

      // Fetch and return updated daily log
      const updatedLog = await prisma.dailyLog.findUnique({
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

      res.json({
        ...updatedLog,
        _parsed: {
          rawTranscript: transcript,
          taskCount: parsed.tasks?.length || 0,
          issueCount: parsed.pendingIssues?.length || 0,
          inspectionCount: parsed.inspectionNotes?.length || 0,
          merged: merge
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DailyLogsController();
