const prisma = require('./prisma');
const eventIndexerService = require('./event-indexer.service');

/**
 * Import service - handles JSON import and data transformation
 */
class ImportService {
  /**
   * Import complete JSON export from the React app
   * @param {Object} data - Parsed JSON data
   * @param {string} filename - Original filename
   * @returns {Object} Import summary
   */
  async importJsonExport(data, filename) {
    const summary = {
      projectsCreated: 0,
      projectsUpdated: 0,
      logsImported: 0,
      eventsImported: 0,
      eventsIndexed: 0,
      errors: []
    };

    // Track imported event IDs for post-import indexing
    const importedEventIds = [];

    try {
      // Start transaction
      await prisma.$transaction(async (tx) => {
        // 1. Import Projects
        if (data.projects && Array.isArray(data.projects)) {
          for (const project of data.projects) {
            try {
              const result = await this.importProject(tx, project);
              if (result.created) summary.projectsCreated++;
              else summary.projectsUpdated++;
            } catch (err) {
              summary.errors.push(`Project ${project.id}: ${err.message}`);
            }
          }
        }

        // 2. Import Daily Logs
        // Handle nested structure: { project: {...}, daily_log: {...}, tasks: [...], ... }
        if (data.daily_logs && Array.isArray(data.daily_logs)) {
          for (const logEntry of data.daily_logs) {
            try {
              // Extract the actual log data and nested entities
              const log = logEntry.daily_log || logEntry;
              const nestedData = {
                tasks: logEntry.tasks || log.tasks,
                visitors: logEntry.visitors || log.visitors,
                equipment: logEntry.equipment || log.equipment,
                materials: logEntry.materials || log.materials,
                pending_issues: logEntry.pending_issues || log.pending_issues,
                inspection_notes: logEntry.inspection_notes || log.inspection_notes,
                additional_work_entries: logEntry.additional_work_entries || log.additional_work_entries
              };
              await this.importDailyLog(tx, log, nestedData);
              summary.logsImported++;
            } catch (err) {
              const logId = logEntry.daily_log?.id || logEntry.id;
              summary.errors.push(`DailyLog ${logId}: ${err.message}`);
            }
          }
        }

        // 3. Import Events
        // Handle nested structure: { event: {...}, project: {...}, metadata: {...} }
        if (data.events && Array.isArray(data.events)) {
          for (const eventEntry of data.events) {
            try {
              // Extract the actual event data
              const event = eventEntry.event || eventEntry;
              const eventId = await this.importEvent(tx, event);
              importedEventIds.push(eventId);
              summary.eventsImported++;
            } catch (err) {
              const eventId = eventEntry.event?.id || eventEntry.id;
              summary.errors.push(`Event ${eventId}: ${err.message}`);
            }
          }
        }
      });

      // 4. Index imported events (outside transaction for performance)
      for (const eventId of importedEventIds) {
        try {
          await eventIndexerService.indexEvent(eventId);
          summary.eventsIndexed++;
        } catch (err) {
          summary.errors.push(`Event indexing ${eventId}: ${err.message}`);
        }
      }

      // Log the import
      await prisma.importLog.create({
        data: {
          filename,
          projectsCreated: summary.projectsCreated,
          logsImported: summary.logsImported,
          eventsImported: summary.eventsImported,
          status: summary.errors.length > 0 ? 'completed_with_errors' : 'completed',
          errorMessage: summary.errors.length > 0 ? summary.errors.join('\n') : null
        }
      });

      return summary;
    } catch (err) {
      // Log failed import
      await prisma.importLog.create({
        data: {
          filename,
          status: 'failed',
          errorMessage: err.message
        }
      });
      throw err;
    }
  }

  /**
   * Import or update a project
   */
  async importProject(tx, project) {
    const existing = await tx.project.findUnique({
      where: { originalId: project.id }
    });

    if (existing) {
      await tx.project.update({
        where: { originalId: project.id },
        data: {
          name: project.name,
          number: project.number,
          address: project.address
        }
      });
      return { created: false, id: existing.id };
    }

    const created = await tx.project.create({
      data: {
        originalId: project.id,
        name: project.name,
        number: project.number,
        address: project.address
      }
    });
    return { created: true, id: created.id };
  }

  /**
   * Import a daily log with all nested data
   */
  async importDailyLog(tx, log, nestedData = null) {
    // Find the project by originalId
    const project = await tx.project.findUnique({
      where: { originalId: log.project_id }
    });

    if (!project) {
      throw new Error(`Project not found: ${log.project_id}`);
    }

    // Use nestedData if provided, otherwise use log itself
    const dataForNested = nestedData || log;

    // Check for existing log
    const existing = await tx.dailyLog.findUnique({
      where: { originalId: log.id }
    });

    if (existing) {
      // Delete existing nested data to replace
      await tx.task.deleteMany({ where: { dailyLogId: existing.id } });
      await tx.visitor.deleteMany({ where: { dailyLogId: existing.id } });
      await tx.equipment.deleteMany({ where: { dailyLogId: existing.id } });
      await tx.material.deleteMany({ where: { dailyLogId: existing.id } });
      await tx.pendingIssue.deleteMany({ where: { dailyLogId: existing.id } });
      await tx.inspectionNote.deleteMany({ where: { dailyLogId: existing.id } });
      await tx.additionalWorkEntry.deleteMany({ where: { dailyLogId: existing.id } });

      // Update the log
      await tx.dailyLog.update({
        where: { id: existing.id },
        data: {
          date: new Date(log.date),
          preparedBy: log.prepared_by,
          status: log.status,
          dailyTotalsWorkers: log.daily_totals_workers,
          dailyTotalsHours: log.daily_totals_hours,
          weather: log.weather || null
        }
      });

      // Re-create nested data
      await this.createNestedData(tx, existing.id, dataForNested);
      return existing.id;
    }

    // Create new daily log
    const dailyLog = await tx.dailyLog.create({
      data: {
        originalId: log.id,
        projectId: project.id,
        date: new Date(log.date),
        preparedBy: log.prepared_by,
        status: log.status,
        dailyTotalsWorkers: log.daily_totals_workers,
        dailyTotalsHours: log.daily_totals_hours,
        weather: log.weather || null
      }
    });

    await this.createNestedData(tx, dailyLog.id, dataForNested);
    return dailyLog.id;
  }

  /**
   * Create all nested data for a daily log
   */
  async createNestedData(tx, dailyLogId, log) {
    // Tasks
    if (log.tasks && Array.isArray(log.tasks)) {
      for (const task of log.tasks) {
        await tx.task.create({
          data: {
            dailyLogId,
            companyName: task.company_name,
            workers: task.workers,
            hours: task.hours,
            taskDescription: task.task_description,
            notes: task.notes
          }
        });
      }
    }

    // Visitors
    if (log.visitors && Array.isArray(log.visitors)) {
      for (const visitor of log.visitors) {
        await tx.visitor.create({
          data: {
            dailyLogId,
            time: visitor.time,
            companyName: visitor.company_name,
            visitorName: visitor.visitor_name,
            notes: visitor.notes
          }
        });
      }
    }

    // Equipment
    if (log.equipment && Array.isArray(log.equipment)) {
      for (const equip of log.equipment) {
        await tx.equipment.create({
          data: {
            dailyLogId,
            equipmentType: equip.equipment_type,
            quantity: equip.quantity,
            hours: equip.hours,
            notes: equip.notes
          }
        });
      }
    }

    // Materials
    if (log.materials && Array.isArray(log.materials)) {
      for (const material of log.materials) {
        await tx.material.create({
          data: {
            dailyLogId,
            material: material.material,
            quantity: material.quantity,
            unit: material.unit,
            supplier: material.supplier,
            notes: material.notes
          }
        });
      }
    }

    // Pending Issues
    if (log.pending_issues && Array.isArray(log.pending_issues)) {
      for (const issue of log.pending_issues) {
        await tx.pendingIssue.create({
          data: {
            dailyLogId,
            title: issue.title,
            description: issue.description,
            category: issue.category,
            severity: issue.severity,
            assignee: issue.assignee,
            dueDate: issue.due_date ? new Date(issue.due_date) : null,
            externalEntity: issue.external_entity,
            location: issue.location
          }
        });
      }
    }

    // Inspection Notes
    if (log.inspection_notes && Array.isArray(log.inspection_notes)) {
      for (const note of log.inspection_notes) {
        await tx.inspectionNote.create({
          data: {
            dailyLogId,
            inspectorName: note.inspector_name,
            ahj: note.ahj,
            inspectionType: note.inspection_type,
            result: note.result,
            notes: note.notes,
            followUpNeeded: note.follow_up_needed
          }
        });
      }
    }

    // Additional Work Entries
    if (log.additional_work_entries && Array.isArray(log.additional_work_entries)) {
      for (const entry of log.additional_work_entries) {
        await tx.additionalWorkEntry.create({
          data: {
            dailyLogId,
            category: entry.category,
            description: entry.description
          }
        });
      }
    }
  }

  /**
   * Import an event
   */
  async importEvent(tx, event) {
    // Find the project by originalId
    const project = await tx.project.findUnique({
      where: { originalId: event.project_id }
    });

    if (!project) {
      throw new Error(`Project not found: ${event.project_id}`);
    }

    // Check for existing event
    const existing = await tx.event.findUnique({
      where: { originalId: event.id }
    });

    if (existing) {
      await tx.event.update({
        where: { id: existing.id },
        data: {
          transcriptText: event.transcript_text,
          eventType: event.event_type,
          severity: event.severity,
          title: event.title,
          notes: event.notes,
          location: event.location,
          tradeVendor: event.trade_vendor,
          isResolved: event.is_resolved,
          audioFileId: event.audio_file_id
        }
      });
      return existing.id;
    }

    const created = await tx.event.create({
      data: {
        originalId: event.id,
        projectId: project.id,
        createdAt: event.created_at ? new Date(event.created_at) : new Date(),
        transcriptText: event.transcript_text,
        eventType: event.event_type,
        severity: event.severity,
        title: event.title,
        notes: event.notes,
        location: event.location,
        tradeVendor: event.trade_vendor,
        isResolved: event.is_resolved,
        audioFileId: event.audio_file_id
      }
    });
    return created.id;
  }
}

module.exports = new ImportService();
