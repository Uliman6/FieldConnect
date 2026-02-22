const prisma = require('../services/prisma');
const pdfGenerator = require('../services/pdf-generator.service');
const schemaPdfService = require('../services/schema-pdf.service');
const archiver = require('archiver');

class ReportsController {
  /**
   * Check if user has access to a project
   */
  _checkProjectAccess(req, projectId) {
    // If accessibleProjectIds is null, user is admin with access to all
    if (req.accessibleProjectIds === null) return true;
    // Check if projectId is in user's accessible projects
    return req.accessibleProjectIds.includes(projectId);
  }

  async generateDailyLogReport(req, res, next) {
    try {
      const { id } = req.params;
      const dailyLog = await prisma.dailyLog.findUnique({
        where: { id },
        include: {
          project: true, tasks: true, visitors: true, equipment: true,
          materials: true, pendingIssues: true, inspectionNotes: true,
          additionalWorkEntries: true, photos: true
        }
      });
      if (!dailyLog) {
        return res.status(404).json({ error: 'Not Found', message: 'Daily log not found' });
      }
      // ACCESS CONTROL: Check if user has access to this project
      if (!this._checkProjectAccess(req, dailyLog.projectId)) {
        return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this project' });
      }
      const doc = await pdfGenerator.generateDailyLogReport(dailyLog, dailyLog.project, dailyLog.photos || []);
      const projectNum = dailyLog.project.number || 'report';
      const dateStr = new Date(dailyLog.date).toISOString().split('T')[0];
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="daily-log-' + projectNum + '-' + dateStr + '.pdf"');
      doc.pipe(res);
    } catch (err) { next(err); }
  }

  async previewDailyLogReport(req, res, next) {
    try {
      const { id } = req.params;
      const dailyLog = await prisma.dailyLog.findUnique({
        where: { id },
        include: {
          project: true, tasks: true, visitors: true, equipment: true,
          materials: true, pendingIssues: true, inspectionNotes: true,
          additionalWorkEntries: true, photos: true
        }
      });
      if (!dailyLog) {
        return res.status(404).json({ error: 'Not Found', message: 'Daily log not found' });
      }
      // ACCESS CONTROL: Check if user has access to this project
      if (!this._checkProjectAccess(req, dailyLog.projectId)) {
        return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this project' });
      }
      const doc = await pdfGenerator.generateDailyLogReport(dailyLog, dailyLog.project, dailyLog.photos || []);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      doc.pipe(res);
    } catch (err) { next(err); }
  }

  async bulkExport(req, res, next) {
    try {
      const { type, ids } = req.body;
      console.log('[bulk-export] Request:', { type, ids: ids?.length });
      if (!type || !ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Bad Request', message: 'type and ids array are required' });
      }
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err) => {
        console.error('[bulk-export] Archive error:', err);
        if (!res.headersSent) {
          return res.status(500).json({ error: 'Archive Error', message: err.message });
        }
      });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="' + type + '-export-' + Date.now() + '.zip"');
      archive.pipe(res);
      let addedCount = 0;
      if (type === 'daily_log') {
        // ACCESS CONTROL: Pass accessible project IDs to filter
        addedCount = await this._addDailyLogsToArchive(archive, ids, req.accessibleProjectIds);
      } else if (type === 'punch_list' || type === 'rfi') {
        // ACCESS CONTROL: Pass accessible project IDs to filter
        addedCount = await this._addChecklistItemsToArchive(archive, ids, type, req.accessibleProjectIds);
      } else if (type === 'form') {
        // ACCESS CONTROL: Pass accessible project IDs to filter
        addedCount = await this._addFormsToArchive(archive, ids, req.accessibleProjectIds);
      }
      console.log('[bulk-export] Added ' + addedCount + ' files to archive');
      if (addedCount === 0) {
        archive.append('No documents were available for export.', { name: 'README.txt' });
      }
      archive.finalize();
    } catch (err) {
      console.error('[bulk-export] Error:', err);
      next(err);
    }
  }

  async bulkExportProject(req, res, next) {
    try {
      const { projectId } = req.params;
      const { type } = req.query;
      console.log('[bulk-export-project] Request:', { projectId, type });
      if (!type) {
        return res.status(400).json({ error: 'Bad Request', message: 'type query parameter is required' });
      }
      // ACCESS CONTROL: Check if user has access to this project
      if (!this._checkProjectAccess(req, projectId)) {
        return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this project' });
      }
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        return res.status(404).json({ error: 'Not Found', message: 'Project not found' });
      }
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err) => {
        console.error('[bulk-export-project] Archive error:', err);
        if (!res.headersSent) {
          return res.status(500).json({ error: 'Archive Error', message: err.message });
        }
      });
      const safeName = project.name.replace(/[^a-zA-Z0-9]/g, '-');
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="' + safeName + '-' + type + '-export.zip"');
      archive.pipe(res);
      let addedCount = 0;
      if (type === 'daily_log') {
        const dailyLogs = await prisma.dailyLog.findMany({ where: { projectId }, select: { id: true }, orderBy: { date: 'desc' } });
        console.log('[bulk-export-project] Found ' + dailyLogs.length + ' daily logs');
        if (dailyLogs.length > 0) addedCount = await this._addDailyLogsToArchive(archive, dailyLogs.map(l => l.id), null);
      } else if (type === 'punch_list' || type === 'rfi') {
        const events = await prisma.event.findMany({
          where: { projectId, schemaData: { isNot: null } },
          include: { schemaData: { include: { schema: true } } },
          orderBy: { createdAt: 'desc' }
        });
        console.log('[bulk-export-project] Found ' + events.length + ' events with schemaData');
        const filteredEvents = events.filter(e => {
          const docType = e.schemaData?.schema?.documentType;
          if (type === 'punch_list') return docType === 'PUNCH_LIST';
          if (type === 'rfi') return docType === 'RFI';
          return false;
        });
        console.log('[bulk-export-project] Filtered to ' + filteredEvents.length + ' ' + type + ' events');
        if (filteredEvents.length > 0) addedCount = await this._addChecklistItemsToArchive(archive, filteredEvents.map(e => e.id), type, null);
      } else if (type === 'form') {
        const forms = await prisma.formInstance.findMany({
          where: { projectId },
          select: { id: true },
          orderBy: { createdAt: 'desc' }
        });
        console.log('[bulk-export-project] Found ' + forms.length + ' forms');
        if (forms.length > 0) addedCount = await this._addFormsToArchive(archive, forms.map(f => f.id), null);
      }
      console.log('[bulk-export-project] Added ' + addedCount + ' files to archive');
      if (addedCount === 0) {
        archive.append('No documents were available for export.', { name: 'README.txt' });
      }
      archive.finalize();
    } catch (err) {
      console.error('[bulk-export-project] Error:', err);
      next(err);
    }
  }

  async _addDailyLogsToArchive(archive, ids, accessibleProjectIds) {
    let addedCount = 0;
    for (const id of ids) {
      try {
        const dailyLog = await prisma.dailyLog.findUnique({
          where: { id },
          include: { project: true, tasks: true, visitors: true, equipment: true, materials: true, pendingIssues: true, inspectionNotes: true, additionalWorkEntries: true, photos: true }
        });
        if (!dailyLog) continue;
        // ACCESS CONTROL: Skip if user doesn't have access to this project
        if (accessibleProjectIds !== null && !accessibleProjectIds.includes(dailyLog.projectId)) {
          console.log('[bulk-export] Skipping daily log ' + id + ' - no access to project');
          continue;
        }
        const doc = await pdfGenerator.generateDailyLogReport(dailyLog, dailyLog.project, dailyLog.photos || []);
        const dateStr = new Date(dailyLog.date).toISOString().split('T')[0];
        const filename = 'daily-log-' + dateStr + '.pdf';
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        await new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); });
        archive.append(Buffer.concat(chunks), { name: filename });
        addedCount++;
      } catch (err) { console.error('Failed to add daily log ' + id + ':', err); }
    }
    return addedCount;
  }

  async _addChecklistItemsToArchive(archive, ids, type, accessibleProjectIds) {
    const fs = require('fs');
    let addedCount = 0;
    console.log('[bulk-export] Processing ' + ids.length + ' ' + type + ' items');
    for (const id of ids) {
      try {
        const event = await prisma.event.findUnique({
          where: { id },
          include: { project: true, schemaData: { include: { schema: true } } }
        });
        if (!event) {
          console.log('[bulk-export] Event not found: ' + id);
          continue;
        }
        // ACCESS CONTROL: Skip if user doesn't have access to this project
        if (accessibleProjectIds !== null && !accessibleProjectIds.includes(event.projectId)) {
          console.log('[bulk-export] Skipping event ' + id + ' - no access to project');
          continue;
        }
        if (!event.schemaData) {
          console.log('[bulk-export] No schemaData for event: ' + id);
          continue;
        }
        console.log('[bulk-export] Generating PDF for event: ' + id + ' (docType: ' + event.schemaData?.schema?.documentType + ')');
        try {
          const { filePath, fileName } = await schemaPdfService.generatePdf(id);
          console.log('[bulk-export] PDF generated: ' + filePath);
          const title = event.schemaData?.fieldValues?.title || event.title || id;
          const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
          const archiveFilename = type + '-' + safeTitle + '.pdf';
          if (fs.existsSync(filePath)) {
            archive.file(filePath, { name: archiveFilename });
            addedCount++;
            console.log('[bulk-export] Added ' + type + ': ' + archiveFilename);
          } else {
            console.error('[bulk-export] PDF file not found at: ' + filePath);
          }
        } catch (pdfErr) {
          console.error('[bulk-export] Failed to generate PDF for ' + type + ' ' + id + ':', pdfErr.message, pdfErr.stack);
        }
      } catch (err) {
        console.error('[bulk-export] Failed to add ' + type + ' ' + id + ':', err.message, err.stack);
      }
    }
    return addedCount;
  }

  async _addFormsToArchive(archive, ids, accessibleProjectIds) {
    const { generatePreTaskPlanPdf, generateGenericFormPdf } = require('../services/form-pdf.service');
    let addedCount = 0;
    console.log('[bulk-export] Processing ' + ids.length + ' forms');
    for (const id of ids) {
      try {
        const form = await prisma.formInstance.findUnique({
          where: { id },
          include: {
            template: true
          }
        });
        if (!form) {
          console.log('[bulk-export] Form not found: ' + id);
          continue;
        }
        // ACCESS CONTROL: Skip if user doesn't have access to this project
        if (accessibleProjectIds !== null && !accessibleProjectIds.includes(form.projectId)) {
          console.log('[bulk-export] Skipping form ' + id + ' - no access to project');
          continue;
        }
        // Get project for PDF generation
        const project = await prisma.project.findUnique({ where: { id: form.projectId } });
        if (!project) {
          console.log('[bulk-export] Project not found for form: ' + id);
          continue;
        }
        console.log('[bulk-export] Generating PDF for form: ' + id + ' (template: ' + form.template?.name + ')');
        try {
          // Generate PDF based on template type
          let pdfBuffer;
          if (form.template?.name === 'Pre-Task Plan') {
            pdfBuffer = await generatePreTaskPlanPdf(form, project);
          } else {
            pdfBuffer = await generateGenericFormPdf(form, project);
          }
          const formName = form.name || form.template?.name || 'Form';
          const safeTitle = formName.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
          const dateStr = new Date(form.createdAt).toISOString().split('T')[0];
          const archiveFilename = safeTitle + '-' + dateStr + '.pdf';
          archive.append(pdfBuffer, { name: archiveFilename });
          addedCount++;
          console.log('[bulk-export] Added form: ' + archiveFilename);
        } catch (pdfErr) {
          console.error('[bulk-export] Failed to generate PDF for form ' + id + ':', pdfErr.message);
        }
      } catch (err) {
        console.error('[bulk-export] Failed to add form ' + id + ':', err.message);
      }
    }
    return addedCount;
  }
}

module.exports = new ReportsController();
