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
      const { projectId, projectName, transcriptText, cleanedText, category, audioUrl, audioDuration } = req.body;
      const userId = req.user && req.user.id;
      const userName = req.user && req.user.name;
      if (!transcriptText) {
        return res.status(400).json({ error: 'Validation Error', message: 'transcriptText is required' });
      }
      console.log('[voice-diary] Saving entry for user:', userName || userId);
      const entry = await prisma.voiceDiaryEntry.create({
        data: { userId, userName, projectId, projectName, transcriptText, cleanedText, category, audioUrl, audioDuration },
      });
      res.json({ success: true, id: entry.id });
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
      const entries = await prisma.voiceDiaryEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
      const transformedEntries = entries.map(e => ({
        id: e.id,
        userId: e.userId,
        userName: e.userName,
        projectName: e.projectName,
        transcriptText: e.transcriptText,
        createdAt: e.createdAt.toISOString(),
      }));
      res.json(transformedEntries);
    } catch (error) {
      console.error('[voice-diary] Admin entries fetch error:', error);
      next(error);
    }
  },
};

module.exports = voiceDiaryController;
