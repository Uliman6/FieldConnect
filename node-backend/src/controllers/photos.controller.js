const prisma = require('../services/prisma');
const path = require('path');
const fs = require('fs').promises;

const UPLOAD_DIR = path.join(__dirname, '../../uploads/photos');

/**
 * Photos Controller - Upload, retrieve, and manage photos for Events and Daily Logs
 */
class PhotosController {
  /**
   * POST /api/photos/upload
   * Upload a photo and optionally associate with an event or daily log
   */
  async upload(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'No file uploaded'
        });
      }

      const { event_id, daily_log_id, caption } = req.body;

      // Validate that at least one association is provided
      if (!event_id && !daily_log_id) {
        // Clean up uploaded file
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Either event_id or daily_log_id is required'
        });
      }

      // Verify the associated entity exists
      if (event_id) {
        const event = await prisma.event.findUnique({ where: { id: event_id } });
        if (!event) {
          await fs.unlink(req.file.path).catch(() => {});
          return res.status(404).json({
            error: 'Not Found',
            message: 'Event not found'
          });
        }
      }

      if (daily_log_id) {
        const dailyLog = await prisma.dailyLog.findUnique({ where: { id: daily_log_id } });
        if (!dailyLog) {
          await fs.unlink(req.file.path).catch(() => {});
          return res.status(404).json({
            error: 'Not Found',
            message: 'Daily log not found'
          });
        }
      }

      // Create photo record
      const photo = await prisma.photo.create({
        data: {
          fileName: req.file.originalname,
          filePath: req.file.path,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
          caption: caption || null,
          eventId: event_id || null,
          dailyLogId: daily_log_id || null
        }
      });

      res.status(201).json(photo);
    } catch (err) {
      // Clean up file on error
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      next(err);
    }
  }

  /**
   * GET /api/photos/:id
   * Get photo metadata
   */
  async get(req, res, next) {
    try {
      const { id } = req.params;

      const photo = await prisma.photo.findUnique({
        where: { id },
        include: {
          event: { select: { id: true, title: true } },
          dailyLog: { select: { id: true, date: true } }
        }
      });

      if (!photo) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Photo not found'
        });
      }

      res.json(photo);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/photos/:id/file
   * Serve the actual photo file
   */
  async getFile(req, res, next) {
    try {
      const { id } = req.params;

      const photo = await prisma.photo.findUnique({
        where: { id }
      });

      if (!photo) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Photo not found'
        });
      }

      // Check if file exists
      try {
        await fs.access(photo.filePath);
      } catch {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Photo file not found on disk'
        });
      }

      res.setHeader('Content-Type', photo.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${photo.fileName}"`);
      res.sendFile(path.resolve(photo.filePath));
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/events/:eventId/photos
   * Get all photos for an event
   */
  async getEventPhotos(req, res, next) {
    try {
      const { eventId } = req.params;

      const photos = await prisma.photo.findMany({
        where: { eventId },
        orderBy: { createdAt: 'asc' }
      });

      res.json(photos);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/daily-logs/:dailyLogId/photos
   * Get all photos for a daily log
   */
  async getDailyLogPhotos(req, res, next) {
    try {
      const { dailyLogId } = req.params;

      const photos = await prisma.photo.findMany({
        where: { dailyLogId },
        orderBy: { createdAt: 'asc' }
      });

      res.json(photos);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/photos/:id
   * Update photo metadata (caption)
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { caption } = req.body;

      const photo = await prisma.photo.update({
        where: { id },
        data: {
          ...(caption !== undefined && { caption })
        }
      });

      res.json(photo);
    } catch (err) {
      if (err.code === 'P2025') {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Photo not found'
        });
      }
      next(err);
    }
  }

  /**
   * DELETE /api/photos/:id
   * Delete a photo
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;

      const photo = await prisma.photo.findUnique({
        where: { id }
      });

      if (!photo) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Photo not found'
        });
      }

      // Delete file from disk
      try {
        await fs.unlink(photo.filePath);
      } catch (err) {
        console.error('[photos] Failed to delete file:', err.message);
      }

      // Delete database record
      await prisma.photo.delete({
        where: { id }
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new PhotosController();
