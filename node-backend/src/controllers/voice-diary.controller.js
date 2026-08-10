/**
 * Voice Diary Controller
 * Handles API endpoints for voice note processing and project-scoped persistence
 */

const voiceDiaryService = require('../services/voice-diary.service');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * UTC day boundaries for a YYYY-MM-DD date string, used to filter
 * createdAt ranges. Matches the frontend's getTodayDate(), which is
 * also a UTC date string.
 */
function dayRange(dateStr) {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gte: start, lt: end };
}

function serializeSnippet(s) {
  return {
    id: s.id,
    noteId: s.noteId,
    category: s.category,
    scope: s.scope,
    content: s.content,
    edited: s.edited,
    createdAt: s.createdAt.toISOString(),
  };
}

function serializeNote(n) {
  return {
    id: n.id,
    projectId: n.projectId,
    userId: n.userId,
    userName: n.userName,
    title: n.title,
    transcriptText: n.transcriptText,
    cleanedTranscript: n.cleanedTranscript,
    duration: n.duration,
    version: n.version,
    previousVersionId: n.previousVersionId,
    createdAt: n.createdAt.toISOString(),
    snippets: (n.snippets || []).map(serializeSnippet),
  };
}

const voiceDiaryController = {
  /**
   * Whether the authenticated user has access to a project.
   * req.accessibleProjectIds is set by the loadAccessibleProjects middleware
   * (null means system admin - access to everything).
   */
  _checkProjectAccess(req, projectId) {
    if (!projectId) return false;
    if (req.accessibleProjectIds === null) return true;
    return Array.isArray(req.accessibleProjectIds) && req.accessibleProjectIds.includes(projectId);
  },

  async categorize(req, res, next) {
    try {
      const { transcript } = req.body;
      if (!transcript) {
        return res.status(400).json({ error: 'Validation Error', message: 'transcript is required' });
      }
      console.log('[voice-diary] Categorizing transcript, length:', transcript.length);
      const snippets = await voiceDiaryService.categorizeTranscript(transcript);
      console.log('[voice-diary] Categorized into', snippets.length, 'snippets');
      res.json({ success: true, snippets });
    } catch (error) {
      console.error('[voice-diary] Categorization error:', error);
      next(error);
    }
  },

  async summarize(req, res, next) {
    try {
      const { snippets, noteCount } = req.body;
      if (!Array.isArray(snippets)) {
        return res.status(400).json({ error: 'Validation Error', message: 'snippets array is required' });
      }
      console.log('[voice-diary] Generating summary from', snippets.length, 'snippets');
      const result = await voiceDiaryService.generateDailySummary(snippets, noteCount || 0);
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('[voice-diary] Summary error:', error);
      next(error);
    }
  },

  async matchForms(req, res, next) {
    try {
      const { snippets } = req.body;
      if (!Array.isArray(snippets)) {
        return res.status(400).json({ error: 'Validation Error', message: 'snippets array is required' });
      }
      console.log('[voice-diary] Matching forms for', snippets.length, 'snippets');
      const suggestions = voiceDiaryService.matchFormTemplates(snippets);
      res.json({ success: true, suggestions });
    } catch (error) {
      console.error('[voice-diary] Form matching error:', error);
      next(error);
    }
  },

  /**
   * Full processing pipeline: categorize + title the transcript, persist the
   * note and its snippets, recompute the user's daily summary for the
   * project, and return form suggestions. Requires a projectId the caller
   * has access to - this is the only way voice diary data gets written, so
   * every write is project-scoped by construction.
   */
  async process(req, res, next) {
    try {
      const { transcript, projectId, duration } = req.body;
      if (!transcript) {
        return res.status(400).json({ error: 'Validation Error', message: 'transcript is required' });
      }
      if (!projectId) {
        return res.status(400).json({ error: 'Validation Error', message: 'projectId is required' });
      }
      if (!this._checkProjectAccess(req, projectId)) {
        return res.status(403).json({ error: 'You do not have access to this project' });
      }

      const userId = req.user.id;
      const userName = req.user.name;

      console.log('[voice-diary] Full processing pipeline starting for project:', projectId);
      const newSnippets = await voiceDiaryService.categorizeTranscript(transcript);
      console.log('[voice-diary] New snippets:', newSnippets.length);
      const { title, cleanedTranscript } = await voiceDiaryService.generateNoteTitle(transcript, newSnippets);
      console.log('[voice-diary] Generated title:', title);

      const note = await prisma.$transaction(async (tx) => {
        const createdNote = await tx.voiceDiaryNote.create({
          data: {
            projectId,
            userId,
            userName,
            title,
            transcriptText: transcript,
            cleanedTranscript,
            duration: Number.isFinite(duration) ? Math.round(duration) : null,
          },
        });

        if (newSnippets.length > 0) {
          await tx.voiceDiarySnippet.createMany({
            data: newSnippets.map((s) => ({
              noteId: createdNote.id,
              projectId,
              userId,
              category: s.category,
              scope: s.scope || null,
              content: s.content,
            })),
          });
        }

        return createdNote;
      });

      const savedSnippets = await prisma.voiceDiarySnippet.findMany({
        where: { noteId: note.id },
        orderBy: { createdAt: 'asc' },
      });

      // Recompute this user's daily summary for the project using ALL of
      // today's snippets (not just this note's), same as before.
      const dateStr = note.createdAt.toISOString().split('T')[0];
      const { gte, lt } = dayRange(dateStr);

      const [daySnippets, dayNoteCount] = await Promise.all([
        prisma.voiceDiarySnippet.findMany({
          where: { projectId, userId, createdAt: { gte, lt } },
          select: { id: true, category: true, scope: true, content: true },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.voiceDiaryNote.count({ where: { projectId, userId, createdAt: { gte, lt } } }),
      ]);

      const summaryResult = await voiceDiaryService.generateDailySummary(daySnippets, dayNoteCount);
      console.log('[voice-diary] Summary generated, hasMinimumInfo:', summaryResult.hasMinimumInfo);

      const existingSummary = await prisma.voiceDiaryDailySummary.findFirst({
        where: { date: dateStr, projectId, userId },
      });
      const summaryRow = existingSummary
        ? await prisma.voiceDiaryDailySummary.update({
            where: { id: existingSummary.id },
            data: {
              summary: summaryResult.summary,
              hasMinimumInfo: summaryResult.hasMinimumInfo,
              voiceNoteCount: dayNoteCount,
            },
          })
        : await prisma.voiceDiaryDailySummary.create({
            data: {
              date: dateStr,
              projectId,
              userId,
              summary: summaryResult.summary,
              hasMinimumInfo: summaryResult.hasMinimumInfo,
              voiceNoteCount: dayNoteCount,
            },
          });

      const formSuggestions = voiceDiaryService.matchFormTemplates(daySnippets);
      console.log('[voice-diary] Form suggestions:', formSuggestions.length);

      res.json({
        success: true,
        note: serializeNote({ ...note, snippets: savedSnippets }),
        snippets: savedSnippets.map(serializeSnippet),
        summary: summaryRow.summary,
        hasMinimumInfo: summaryRow.hasMinimumInfo,
        formSuggestions,
      });
    } catch (error) {
      console.error('[voice-diary] Processing error:', error);
      next(error);
    }
  },

  /**
   * GET /api/voice-diary/notes?projectId=&date=
   * Requires projectId - there is no "list everything" mode for this
   * endpoint, so a missing/unselected project can never leak other
   * projects' notes.
   */
  async listNotes(req, res, next) {
    try {
      const projectId = req.query.projectId || req.query.project_id;
      if (!projectId) {
        return res.status(400).json({ error: 'Validation Error', message: 'projectId is required' });
      }
      if (!this._checkProjectAccess(req, projectId)) {
        return res.status(403).json({ error: 'You do not have access to this project' });
      }

      const where = { projectId };
      const date = req.query.date;
      if (date) {
        const { gte, lt } = dayRange(date);
        where.createdAt = { gte, lt };
      }

      const notes = await prisma.voiceDiaryNote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { snippets: { orderBy: { createdAt: 'asc' } } },
      });

      res.json({ success: true, notes: notes.map(serializeNote) });
    } catch (error) {
      console.error('[voice-diary] List notes error:', error);
      next(error);
    }
  },

  /**
   * GET /api/voice-diary/summary?projectId=&date=&userId=
   * userId omitted = project-level combined summary (currently unused by
   * the client, but supported); userId set = that user's personal summary.
   */
  async getSummary(req, res, next) {
    try {
      const projectId = req.query.projectId || req.query.project_id;
      const date = req.query.date;
      if (!projectId || !date) {
        return res.status(400).json({ error: 'Validation Error', message: 'projectId and date are required' });
      }
      if (!this._checkProjectAccess(req, projectId)) {
        return res.status(403).json({ error: 'You do not have access to this project' });
      }

      const userId = req.query.userId || req.query.user_id || null;
      const row = await prisma.voiceDiaryDailySummary.findFirst({ where: { date, projectId, userId } });

      if (!row) {
        return res.json({ success: true, summary: '', hasMinimumInfo: false, voiceNoteCount: 0, updatedAt: null });
      }

      res.json({
        success: true,
        summary: row.summary,
        hasMinimumInfo: row.hasMinimumInfo,
        voiceNoteCount: row.voiceNoteCount,
        updatedAt: row.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error('[voice-diary] Get summary error:', error);
      next(error);
    }
  },

  /**
   * PATCH /api/voice-diary/snippets/:id
   */
  async updateSnippetContent(req, res, next) {
    try {
      const { id } = req.params;
      const { content } = req.body;
      if (!content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ error: 'Validation Error', message: 'content is required' });
      }

      const snippet = await prisma.voiceDiarySnippet.findUnique({ where: { id }, select: { projectId: true } });
      if (!snippet) {
        return res.status(404).json({ error: 'Snippet not found' });
      }
      if (!this._checkProjectAccess(req, snippet.projectId)) {
        return res.status(403).json({ error: 'You do not have access to this project' });
      }

      const updated = await prisma.voiceDiarySnippet.update({
        where: { id },
        data: { content: content.trim(), edited: true },
      });

      res.json({ success: true, snippet: serializeSnippet(updated) });
    } catch (error) {
      console.error('[voice-diary] Update snippet error:', error);
      next(error);
    }
  },

  /**
   * DELETE /api/voice-diary/snippets/:id
   */
  async deleteSnippetById(req, res, next) {
    try {
      const { id } = req.params;

      const snippet = await prisma.voiceDiarySnippet.findUnique({ where: { id }, select: { projectId: true } });
      if (!snippet) {
        return res.status(404).json({ error: 'Snippet not found' });
      }
      if (!this._checkProjectAccess(req, snippet.projectId)) {
        return res.status(403).json({ error: 'You do not have access to this project' });
      }

      await prisma.voiceDiarySnippet.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      console.error('[voice-diary] Delete snippet error:', error);
      next(error);
    }
  },

  /**
   * DELETE /api/voice-diary/notes/:id
   * Snippets cascade-delete via the FK.
   */
  async deleteNoteById(req, res, next) {
    try {
      const { id } = req.params;

      const note = await prisma.voiceDiaryNote.findUnique({ where: { id }, select: { projectId: true } });
      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }
      if (!this._checkProjectAccess(req, note.projectId)) {
        return res.status(403).json({ error: 'You do not have access to this project' });
      }

      await prisma.voiceDiaryNote.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      console.error('[voice-diary] Delete note error:', error);
      next(error);
    }
  },

  async getCategories(req, res) {
    res.json({ success: true, categories: voiceDiaryService.VOICE_DIARY_CATEGORIES });
  },

  async submitFeedback(req, res, next) {
    try {
      const { text, audioUrl } = req.body;
      const userId = req.user && req.user.id;
      const userName = req.user && req.user.name;
      const userEmail = req.user && req.user.email;
      if (!text) {
        return res.status(400).json({ error: 'Validation Error', message: 'text is required' });
      }
      console.log('[voice-diary] Saving feedback from user:', userName || userId);
      const feedback = await prisma.voiceDiaryFeedback.create({
        data: { text, userId, userName, userEmail, audioUrl },
      });
      res.json({ success: true, id: feedback.id });
    } catch (error) {
      console.error('[voice-diary] Feedback error:', error);
      next(error);
    }
  },

  async getAllFeedback(req, res, next) {
    try {
      console.log('[voice-diary] Admin fetching all feedback');
      const feedback = await prisma.voiceDiaryFeedback.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
      const transformedFeedback = feedback.map(f => ({
        id: f.id,
        text: f.text,
        userId: f.userId,
        userName: f.userName,
        timestamp: f.createdAt.toISOString(),
      }));
      res.json(transformedFeedback);
    } catch (error) {
      console.error('[voice-diary] Admin feedback fetch error:', error);
      next(error);
    }
  },

  // Process tool feedback
  async processToolFeedback(req, res, next) {
    try {
      const { transcript, toolBrand } = req.body;
      if (!transcript || !toolBrand) {
        return res.status(400).json({ error: 'Validation Error', message: 'transcript and toolBrand are required' });
      }
      console.log('[voice-diary] Processing tool feedback for:', toolBrand);
      const snippets = await voiceDiaryService.categorizeToolFeedback(transcript, toolBrand);
      console.log('[voice-diary] Tool feedback categorized into', snippets.length, 'snippets');
      res.json({ success: true, snippets });
    } catch (error) {
      console.error('[voice-diary] Tool feedback error:', error);
      next(error);
    }
  },

  // Translate text between languages using AI
  async translateText(req, res, next) {
    try {
      const { text, fromLang = 'es', toLang = 'en' } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Validation Error', message: 'text is required' });
      }

      console.log(`[voice-diary] Translating text from ${fromLang} to ${toLang}, length: ${text.length}`);

      // Use GPT for translation
      const translatedText = await voiceDiaryService.translateText(text, fromLang, toLang);

      res.json({
        success: true,
        translatedText,
        fromLang,
        toLang
      });
    } catch (error) {
      console.error('[voice-diary] Translation error:', error);
      next(error);
    }
  },
};

module.exports = voiceDiaryController;
