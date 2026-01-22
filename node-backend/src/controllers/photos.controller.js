const prisma = require('../services/prisma');
const cloudinaryService = require('../services/cloudinary.service');

/**
 * Photos Controller - Upload, retrieve, and manage photos via Cloudinary
 */
class PhotosController {
  /**
   * POST /api/photos/upload
   * Upload a photo to Cloudinary and associate with an event or daily log
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
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Either event_id or daily_log_id is required'
        });
      }

      // Verify the associated entity exists
      if (event_id) {
        const event = await prisma.event.findUnique({ where: { id: event_id } });
        if (!event) {
          return res.status(404).json({
            error: 'Not Found',
            message: 'Event not found'
          });
        }
      }

      if (daily_log_id) {
        const dailyLog = await prisma.dailyLog.findUnique({ where: { id: daily_log_id } });
        if (!dailyLog) {
          return res.status(404).json({
            error: 'Not Found',
            message: 'Daily log not found'
          });
        }
      }

      // Upload to Cloudinary
      const uploadResult = await cloudinaryService.uploadBuffer(req.file.buffer, {
        folder: event_id ? `fieldconnect/events/${event_id}` : `fieldconnect/daily-logs/${daily_log_id}`
      });

      if (!uploadResult.success) {
        return res.status(500).json({
          error: 'Upload Error',
          message: uploadResult.error || 'Failed to upload to Cloudinary'
        });
      }

      // Create photo record with Cloudinary URL
      const photo = await prisma.photo.create({
        data: {
          fileName: req.file.originalname,
          filePath: uploadResult.url,
          cloudinaryPublicId: uploadResult.publicId,
          mimeType: req.file.mimetype,
          fileSize: uploadResult.bytes || req.file.size,
          caption: caption || null,
          eventId: event_id || null,
          dailyLogId: daily_log_id || null
        }
      });

      res.status(201).json(photo);
    } catch (err) {
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
   * Redirect to Cloudinary URL
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

      // Redirect to Cloudinary URL
      res.redirect(photo.filePath);
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
   * Delete a photo from Cloudinary and database
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

      // Delete from Cloudinary if we have the public ID
      if (photo.cloudinaryPublicId) {
        const deleteResult = await cloudinaryService.delete(photo.cloudinaryPublicId);
        if (!deleteResult.success) {
          console.error('[photos] Failed to delete from Cloudinary:', deleteResult.error);
        }
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
