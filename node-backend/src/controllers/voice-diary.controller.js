/**
 * Voice Diary Controller
 * Handles API endpoints for voice note processing
 */

const voiceDiaryService = require('../services/voice-diary.service');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const voiceDiaryController = {
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

  async process(req, res, next) {
    try {
      const { transcript, existingSnippets = [], noteCount = 1 } = req.body;
      if (!transcript) {
        return res.status(400).json({ error: 'Validation Error', message: 'transcript is required' });
      }
      console.log('[voice-diary] Full processing pipeline starting...');
      const newSnippets = await voiceDiaryService.categorizeTranscript(transcript);
      console.log('[voice-diary] New snippets:', newSnippets.length);
      const { title, cleanedTranscript } = await voiceDiaryService.generateNoteTitle(transcript, newSnippets);
      console.log('[voice-diary] Generated title:', title);
      const allSnippets = [...existingSnippets, ...newSnippets];
      const summary = await voiceDiaryService.generateDailySummary(allSnippets, noteCount);
      console.log('[voice-diary] Summary generated, hasMinimumInfo:', summary.hasMinimumInfo);
      const formSuggestions = voiceDiaryService.matchFormTemplates(allSnippets);
      console.log('[voice-diary] Form suggestions:', formSuggestions.length);
      res.json({
        success: true,
        newSnippets,
        title,
        cleanedTranscript,
        summary: summary.summary,
        hasMinimumInfo: summary.hasMinimumInfo,
        formSuggestions,
      });
    } catch (error) {
      console.error('[voice-diary] Processing error:', error);
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

  async saveEntry(req, res, next) {
    try {
      const { id, projectId, projectName, transcriptText, cleanedText, category, audioUrl, audioDuration, snippets } = req.body;
      const userId = req.user && req.user.id;
      const userName = req.user && req.user.name;
      if (!transcriptText) {
        return res.status(400).json({ error: 'Validation Error', message: 'transcriptText is required' });
      }
      console.log('[voice-diary] Saving entry for user:', userName || userId, 'id:', id || 'new');

      // Use upsert to prevent duplicates when syncing across devices
      const entry = await prisma.voiceDiaryEntry.upsert({
        where: { id: id || 'non-existent-id' },
        update: {
          // Update existing entry (in case content changed)
          transcriptText,
          cleanedText,
          category,
        },
        create: {
          id: id || undefined, // Use provided ID or let Prisma generate
          userId,
          userName,
          projectId,
          projectName,
          transcriptText,
          cleanedText,
          category,
          audioUrl,
          audioDuration,
        },
        include: { snippets: true },
      });

      // Handle snippets separately with upsert
      if (snippets && snippets.length > 0) {
        for (const s of snippets) {
          await prisma.voiceDiarySnippet.upsert({
            where: { id: s.id || 'non-existent-id' },
            update: {
              category: s.category,
              content: s.content,
              scope: s.scope || null,
            },
            create: {
              id: s.id || undefined,
              entryId: entry.id,
              category: s.category,
              content: s.content,
              scope: s.scope || null,
            },
          });
        }
      }

      // Fetch updated entry with snippets
      const updatedEntry = await prisma.voiceDiaryEntry.findUnique({
        where: { id: entry.id },
        include: { snippets: true },
      });

      console.log('[voice-diary] Entry saved with', updatedEntry?.snippets?.length || 0, 'snippets');
      res.json({ success: true, id: entry.id, snippetCount: updatedEntry?.snippets?.length || 0 });
    } catch (error) {
      console.error('[voice-diary] Entry save error:', error);
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

  async getAllEntries(req, res, next) {
    try {
      console.log('[voice-diary] Admin fetching all entries');
      const entries = await prisma.voiceDiaryEntry.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { snippets: true },
      });
      const transformedEntries = entries.map(e => ({
        id: e.id,
        userId: e.userId,
        userName: e.userName,
        projectName: e.projectName,
        transcriptText: e.transcriptText,
        createdAt: e.createdAt.toISOString(),
        snippets: e.snippets.map(s => ({
          id: s.id,
          category: s.category,
          content: s.content,
          scope: s.scope,
        })),
      }));
      res.json(transformedEntries);
    } catch (error) {
      console.error('[voice-diary] Admin entries fetch error:', error);
      next(error);
    }
  },

  // Get entries for the current user (for syncing across devices)
  async getMyEntries(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { projectId, since } = req.query;
      console.log('[voice-diary] Fetching entries for user:', userId, 'project:', projectId, 'since:', since);

      const where = { userId };
      if (projectId) {
        where.projectId = projectId;
      }
      if (since) {
        where.createdAt = { gte: new Date(since) };
      }

      const entries = await prisma.voiceDiaryEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { snippets: true },
      });

      const transformedEntries = entries.map(e => ({
        id: e.id,
        projectId: e.projectId,
        projectName: e.projectName,
        transcriptText: e.transcriptText,
        cleanedText: e.cleanedText,
        createdAt: e.createdAt.toISOString(),
        snippets: e.snippets.map(s => ({
          id: s.id,
          category: s.category,
          content: s.content,
          scope: s.scope,
          createdAt: s.createdAt.toISOString(),
        })),
      }));

      console.log('[voice-diary] Returning', transformedEntries.length, 'entries');
      res.json({ success: true, entries: transformedEntries });
    } catch (error) {
      console.error('[voice-diary] Get my entries error:', error);
      next(error);
    }
  },

  // Save or update a daily summary
  async saveSummary(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id, date, projectId, summary, voiceNoteCount, hasMinimumInfo } = req.body;
      if (!date || !projectId || !summary) {
        return res.status(400).json({ error: 'Validation Error', message: 'date, projectId, and summary are required' });
      }

      console.log('[voice-diary] Saving summary for user:', userId, 'date:', date, 'project:', projectId);

      const savedSummary = await prisma.voiceDiarySummary.upsert({
        where: {
          date_projectId_userId: { date, projectId, userId },
        },
        update: {
          summary,
          voiceNoteCount: voiceNoteCount || 0,
          hasMinimumInfo: hasMinimumInfo || false,
        },
        create: {
          id: id || undefined,
          date,
          projectId,
          userId,
          summary,
          voiceNoteCount: voiceNoteCount || 0,
          hasMinimumInfo: hasMinimumInfo || false,
        },
      });

      res.json({ success: true, id: savedSummary.id });
    } catch (error) {
      console.error('[voice-diary] Save summary error:', error);
      next(error);
    }
  },

  // Get summaries for the current user
  async getMySummaries(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { projectId } = req.query;
      console.log('[voice-diary] Fetching summaries for user:', userId, 'project:', projectId);

      const where = { userId };
      if (projectId) {
        where.projectId = projectId;
      }

      const summaries = await prisma.voiceDiarySummary.findMany({
        where,
        orderBy: { date: 'desc' },
        take: 100,
      });

      const transformedSummaries = summaries.map(s => ({
        id: s.id,
        date: s.date,
        projectId: s.projectId,
        userId: s.userId,
        summary: s.summary,
        voiceNoteCount: s.voiceNoteCount,
        hasMinimumInfo: s.hasMinimumInfo,
        lastUpdatedAt: s.updatedAt.toISOString(),
      }));

      console.log('[voice-diary] Returning', transformedSummaries.length, 'summaries');
      res.json({ success: true, summaries: transformedSummaries });
    } catch (error) {
      console.error('[voice-diary] Get summaries error:', error);
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

  // Get entries for current user only (user-scoped)
  async getMyEntries(req, res, next) {
    try {
      const userId = req.user && req.user.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      console.log('[voice-diary] Fetching entries for user:', userId);
      const entries = await prisma.voiceDiaryEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const transformedEntries = entries.map(e => ({
        id: e.id,
        userId: e.userId,
        userName: e.userName,
        projectId: e.projectId,
        projectName: e.projectName,
        transcriptText: e.transcriptText,
        cleanedText: e.cleanedText,
        category: e.category,
        createdAt: e.createdAt.toISOString(),
      }));
      res.json(transformedEntries);
    } catch (error) {
      console.error('[voice-diary] User entries fetch error:', error);
      next(error);
    }
  },
};

module.exports = voiceDiaryController;
