const transcriptParser = require('../services/transcript-parser.service');
const transcriptionService = require('../services/transcription.service');
const prisma = require('../services/prisma');

/**
 * Transcript Controller - Parse transcripts and auto-fill daily logs
 */
class TranscriptController {
  /**
   * POST /api/transcripts/transcribe
   * Transcribe audio file to text
   */
  async transcribeAudio(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Audio file is required. Send as "audio" field.'
        });
      }

      const { language } = req.body;

      const result = await transcriptionService.transcribe(
        req.file.buffer,
        req.file.originalname,
        { language }
      );

      if (!result.success) {
        return res.status(500).json({
          error: 'Transcription Error',
          message: result.error
        });
      }

      // Generate a title from the transcription
      const title = transcriptionService.generateTitle(result.text);

      res.json({
        success: true,
        text: result.text,
        title: title
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/transcripts/status
   * Check if transcription is available
   */
  async getTranscriptionStatus(req, res, next) {
    try {
      const available = transcriptionService.isAvailable();
      res.json({
        available,
        message: available
          ? 'Transcription service is available'
          : 'Transcription service unavailable. OPENAI_API_KEY not configured.'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/transcripts/parse
   * Parse a transcript and return structured data
   */
  async parseTranscript(req, res, next) {
    try {
      const { transcript } = req.body;

      if (!transcript) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'transcript is required'
        });
      }

      const parsed = transcriptParser.parseTranscript(transcript);

      res.json({
        success: true,
        parsed
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/transcripts/auto-fill/:dailyLogId
   * Parse transcript and update daily log with extracted data
   */
  async autoFillDailyLog(req, res, next) {
    try {
      const { dailyLogId } = req.params;
      const { transcript, merge = true } = req.body;

      if (!transcript) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'transcript is required'
        });
      }

      // Verify daily log exists
      const dailyLog = await prisma.dailyLog.findUnique({
        where: { id: dailyLogId },
        include: {
          tasks: true,
          inspectionNotes: true,
          pendingIssues: true
        }
      });

      if (!dailyLog) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Daily log not found'
        });
      }

      // Parse the transcript
      const parsed = transcriptParser.parseTranscript(transcript);

      // Update weather
      if (parsed.weather) {
        const currentWeather = dailyLog.weather || {};
        const newWeather = merge ? { ...currentWeather, ...parsed.weather } : parsed.weather;
        // Remove null values
        Object.keys(newWeather).forEach(key => {
          if (newWeather[key] === null) delete newWeather[key];
        });

        await prisma.dailyLog.update({
          where: { id: dailyLogId },
          data: {
            weather: newWeather,
            dailyTotalsWorkers: parsed.dailyTotals?.daily_totals_workers || dailyLog.dailyTotalsWorkers,
            dailyTotalsHours: parsed.dailyTotals?.daily_totals_hours || dailyLog.dailyTotalsHours
          }
        });
      }

      // Add tasks
      if (parsed.tasks && parsed.tasks.length > 0) {
        for (const task of parsed.tasks) {
          await prisma.task.create({
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

      // Add inspection notes
      if (parsed.inspectionNotes && parsed.inspectionNotes.length > 0) {
        for (const note of parsed.inspectionNotes) {
          await prisma.inspectionNote.create({
            data: {
              dailyLogId,
              inspectorName: note.inspector_name,
              inspectionType: note.inspection_type,
              result: note.result,
              notes: note.notes,
              followUpNeeded: note.follow_up_needed
            }
          });
        }
      }

      // Add pending issues
      if (parsed.pendingIssues && parsed.pendingIssues.length > 0) {
        for (const issue of parsed.pendingIssues) {
          await prisma.pendingIssue.create({
            data: {
              dailyLogId,
              title: issue.title,
              description: issue.description,
              category: issue.category,
              severity: issue.severity,
              assignee: issue.assignee,
              location: issue.location
            }
          });
        }
      }

      // Fetch updated daily log
      const updatedLog = await prisma.dailyLog.findUnique({
        where: { id: dailyLogId },
        include: {
          project: true,
          tasks: true,
          inspectionNotes: true,
          pendingIssues: true,
          visitors: true,
          equipment: true,
          materials: true,
          additionalWorkEntries: true
        }
      });

      res.json({
        success: true,
        message: 'Daily log auto-filled from transcript',
        parsed: {
          tasksAdded: parsed.tasks?.length || 0,
          inspectionsAdded: parsed.inspectionNotes?.length || 0,
          issuesAdded: parsed.pendingIssues?.length || 0,
          weather: parsed.weather
        },
        dailyLog: updatedLog
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/transcripts/create-daily-log
   * Create a new daily log from a transcript
   */
  async createDailyLogFromTranscript(req, res, next) {
    try {
      const { projectId, date, transcript, preparedBy } = req.body;

      if (!projectId || !transcript) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'projectId and transcript are required'
        });
      }

      // Verify project exists
      const project = await prisma.project.findUnique({
        where: { id: projectId }
      });

      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Project not found'
        });
      }

      // Parse the transcript
      const parsed = transcriptParser.parseTranscript(transcript);

      // Create daily log
      const dailyLog = await prisma.dailyLog.create({
        data: {
          projectId,
          date: date ? new Date(date) : new Date(),
          preparedBy: preparedBy || '',
          status: 'draft',
          weather: parsed.weather || {},
          dailyTotalsWorkers: parsed.dailyTotals?.daily_totals_workers || 0,
          dailyTotalsHours: parsed.dailyTotals?.daily_totals_hours || 0,
          tasks: {
            create: (parsed.tasks || []).map(t => ({
              companyName: t.company_name,
              workers: t.workers,
              hours: t.hours,
              taskDescription: t.task_description,
              notes: t.notes
            }))
          },
          inspectionNotes: {
            create: (parsed.inspectionNotes || []).map(n => ({
              inspectorName: n.inspector_name,
              inspectionType: n.inspection_type,
              result: n.result,
              notes: n.notes,
              followUpNeeded: n.follow_up_needed
            }))
          },
          pendingIssues: {
            create: (parsed.pendingIssues || []).map(i => ({
              title: i.title,
              description: i.description,
              category: i.category,
              severity: i.severity,
              assignee: i.assignee,
              location: i.location
            }))
          }
        },
        include: {
          project: true,
          tasks: true,
          inspectionNotes: true,
          pendingIssues: true
        }
      });

      res.status(201).json({
        success: true,
        message: 'Daily log created from transcript',
        dailyLog
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new TranscriptController();
