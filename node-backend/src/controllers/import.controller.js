const importService = require('../services/import.service');

/**
 * Import Controller - Handles JSON import endpoints
 */
class ImportController {
  /**
   * POST /api/import/json
   * Import JSON export from React app
   */
  async importJson(req, res, next) {
    try {
      let jsonData;

      // Handle both file upload and direct JSON body
      if (req.file) {
        // File uploaded via multer
        const fileContent = req.file.buffer.toString('utf8');
        jsonData = JSON.parse(fileContent);
      } else if (req.body && Object.keys(req.body).length > 0) {
        // Direct JSON in request body
        jsonData = req.body;
      } else {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'No JSON data provided. Send a file or JSON body.'
        });
      }

      // Validate required structure
      if (!jsonData.projects && !jsonData.daily_logs && !jsonData.events) {
        return res.status(400).json({
          error: 'Invalid Format',
          message: 'JSON must contain at least one of: projects, daily_logs, events'
        });
      }

      const filename = req.file?.originalname || 'direct-upload.json';
      const summary = await importService.importJsonExport(jsonData, filename);

      res.status(200).json({
        success: true,
        message: 'Import completed',
        summary: {
          projectsCreated: summary.projectsCreated,
          projectsUpdated: summary.projectsUpdated,
          logsImported: summary.logsImported,
          eventsImported: summary.eventsImported,
          errorsCount: summary.errors.length,
          errors: summary.errors.length > 0 ? summary.errors : undefined
        }
      });
    } catch (err) {
      if (err instanceof SyntaxError) {
        return res.status(400).json({
          error: 'Invalid JSON',
          message: 'The uploaded file contains invalid JSON'
        });
      }
      next(err);
    }
  }

  /**
   * GET /api/import/history
   * Get import history
   */
  async getImportHistory(req, res, next) {
    try {
      const prisma = require('../services/prisma');
      const imports = await prisma.importLog.findMany({
        orderBy: { importedAt: 'desc' },
        take: 50
      });

      res.json(imports);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ImportController();
