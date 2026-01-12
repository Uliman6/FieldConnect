const prisma = require('../services/prisma');
const pdfGenerator = require('../services/pdf-generator.service');

/**
 * Reports Controller - Handles PDF report generation
 */
class ReportsController {
  /**
   * GET /api/reports/daily-log/:id
   * Generate PDF report for a daily log
   */
  async generateDailyLogReport(req, res, next) {
    try {
      const { id } = req.params;

      // Fetch daily log with all related data
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

      // Generate PDF
      const doc = pdfGenerator.generateDailyLogReport(dailyLog, dailyLog.project);

      // Set response headers for PDF download
      const filename = `daily-log-${dailyLog.project.number || 'report'}-${new Date(dailyLog.date).toISOString().split('T')[0]}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Pipe PDF to response
      doc.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/reports/daily-log/:id/preview
   * Preview PDF in browser (inline)
   */
  async previewDailyLogReport(req, res, next) {
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

      const doc = pdfGenerator.generateDailyLogReport(dailyLog, dailyLog.project);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');

      doc.pipe(res);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ReportsController();
