const prisma = require('../services/prisma');
const pdfGenerator = require('../services/pdf-generator.service');
const schemaPdfService = require('../services/schema-pdf.service');
const archiver = require('archiver');

class ReportsController {
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
      if (\!dailyLog) {
        return res.status(404).json({ error: 'Not Found', message: 'Daily log not found' });
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
      if (\!dailyLog) {
        return res.status(404).json({ error: 'Not Found', message: 'Daily log not found' });
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
      if (\!type || \!ids || \!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Bad Request', message: 'type and ids array are required' });
      }
      const archive = archiver('zip', { zlib: { level: 9 } });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="' + type + '-export-' + Date.now() + '.zip"');
      archive.pipe(res);
      if (type === 'daily_log') {
        await this._addDailyLogsToArchive(archive, ids);
      } else if (type === 'punch_list' || type === 'rfi') {
        await this._addChecklistItemsToArchive(archive, ids, type);
      }
      archive.finalize();
    } catch (err) { next(err); }
  }

  async bulkExportProject(req, res, next) {
    try {
      const { projectId } = req.params;
      const { type } = req.query;
      if (\!type) {
        return res.status(400).json({ error: 'Bad Request', message: 'type query parameter is required' });
      }
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (\!project) {
        return res.status(404).json({ error: 'Not Found', message: 'Project not found' });
      }
      const archive = archiver('zip', { zlib: { level: 9 } });
      const safeName = project.name.replace(/[^a-zA-Z0-9]/g, '-');
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="' + safeName + '-' + type + '-export.zip"');
      archive.pipe(res);
      if (type === 'daily_log') {
        const dailyLogs = await prisma.dailyLog.findMany({ where: { projectId }, select: { id: true }, orderBy: { date: 'desc' } });
        if (dailyLogs.length > 0) await this._addDailyLogsToArchive(archive, dailyLogs.map(l => l.id));
      } else if (type === 'punch_list' || type === 'rfi') {
        const events = await prisma.event.findMany({
          where: { projectId, schemaData: { isNot: null } },
          include: { schemaData: { include: { schema: true } } },
          orderBy: { createdAt: 'desc' }
        });
        const filteredEvents = events.filter(e => {
          const docType = e.schemaData?.schema?.documentType;
          if (type === 'punch_list') return docType === 'PUNCH_LIST';
          if (type === 'rfi') return docType === 'RFI';
          return false;
        });
        if (filteredEvents.length > 0) await this._addChecklistItemsToArchive(archive, filteredEvents.map(e => e.id), type);
      }
      archive.finalize();
    } catch (err) { next(err); }
  }

  async _addDailyLogsToArchive(archive, ids) {
    for (const id of ids) {
      try {
        const dailyLog = await prisma.dailyLog.findUnique({
          where: { id },
          include: { project: true, tasks: true, visitors: true, equipment: true, materials: true, pendingIssues: true, inspectionNotes: true, additionalWorkEntries: true, photos: true }
        });
        if (\!dailyLog) continue;
        const doc = await pdfGenerator.generateDailyLogReport(dailyLog, dailyLog.project, dailyLog.photos || []);
        const dateStr = new Date(dailyLog.date).toISOString().split('T')[0];
        const filename = 'daily-log-' + dateStr + '.pdf';
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        await new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); });
        archive.append(Buffer.concat(chunks), { name: filename });
      } catch (err) { console.error('Failed to add daily log ' + id + ':', err); }
    }
  }

  async _addChecklistItemsToArchive(archive, ids, type) {
    const fs = require('fs');
    for (const id of ids) {
      try {
        const event = await prisma.event.findUnique({ where: { id }, include: { project: true, schemaData: true } });
        if (\!event?.schemaData) continue;
        try {
          const { filePath, fileName } = await schemaPdfService.generatePdf(id);
          const title = event.schemaData?.fieldValues?.title || event.title || id;
          const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
          const archiveFilename = type + '-' + safeTitle + '.pdf';
          if (fs.existsSync(filePath)) {
            archive.file(filePath, { name: archiveFilename });
            console.log('[bulk-export] Added ' + type + ': ' + archiveFilename);
          }
        } catch (pdfErr) { console.error('[bulk-export] Failed to generate PDF for ' + type + ' ' + id + ':', pdfErr.message); }
      } catch (err) { console.error('[bulk-export] Failed to add ' + type + ' ' + id + ':', err); }
    }
  }
}

module.exports = new ReportsController();
