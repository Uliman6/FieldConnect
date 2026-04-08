/**
 * Voice Diary Controller
 * Handles API endpoints for voice note processing
 */

const voiceDiaryService = require('../services/voice-diary.service');

const voiceDiaryController = {
  /**
   * POST /api/voice-diary/categorize
   * Categorize a voice note transcript
   */
  async categorize(req, res, next) {
    try {
      const { transcript } = req.body;

      if (!transcript) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'transcript is required',
        });
      }

      console.log('[voice-diary] Categorizing transcript, length:', transcript.length);

      const snippets = await voiceDiaryService.categorizeTranscript(transcript);

      console.log('[voice-diary] Categorized into', snippets.length, 'snippets');

      res.json({
        success: true,
        snippets,
      });
    } catch (error) {
      console.error('[voice-diary] Categorization error:', error);
      next(error);
    }
  },

  /**
   * POST /api/voice-diary/summarize
   * Generate a daily summary from snippets
   */
  async summarize(req, res, next) {
    try {
      const { snippets, noteCount } = req.body;

      if (!Array.isArray(snippets)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'snippets array is required',
        });
      }

      console.log('[voice-diary] Generating summary from', snippets.length, 'snippets');

      const result = await voiceDiaryService.generateDailySummary(snippets, noteCount || 0);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error('[voice-diary] Summary error:', error);
      next(error);
    }
  },

  /**
   * POST /api/voice-diary/match-forms
   * Match snippets to form templates
   */
  async matchForms(req, res, next) {
    try {
      const { snippets } = req.body;

      if (!Array.isArray(snippets)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'snippets array is required',
        });
      }

      console.log('[voice-diary] Matching forms for', snippets.length, 'snippets');

      const suggestions = voiceDiaryService.matchFormTemplates(snippets);

      res.json({
        success: true,
        suggestions,
      });
    } catch (error) {
      console.error('[voice-diary] Form matching error:', error);
      next(error);
    }
  },

  /**
   * POST /api/voice-diary/process
   * Full processing pipeline: categorize + summarize + match forms + generate title
   */
  async process(req, res, next) {
    try {
      const { transcript, existingSnippets = [], noteCount = 1 } = req.body;

      if (!transcript) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'transcript is required',
        });
      }

      console.log('[voice-diary] Full processing pipeline starting...');

      // Step 1: Categorize new transcript
      const newSnippets = await voiceDiaryService.categorizeTranscript(transcript);
      console.log('[voice-diary] New snippets:', newSnippets.length);

      // Step 2: Generate intelligent title and cleaned transcript
      const { title, cleanedTranscript } = await voiceDiaryService.generateNoteTitle(transcript, newSnippets);
      console.log('[voice-diary] Generated title:', title);

      // Step 3: Combine with existing snippets
      const allSnippets = [...existingSnippets, ...newSnippets];

      // Step 4: Generate summary
      const summary = await voiceDiaryService.generateDailySummary(allSnippets, noteCount);
      console.log('[voice-diary] Summary generated, hasMinimumInfo:', summary.hasMinimumInfo);

      // Step 5: Match form templates
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

  /**
   * GET /api/voice-diary/categories
   * Get list of available categories
   */
  async getCategories(req, res) {
    res.json({
      success: true,
      categories: voiceDiaryService.VOICE_DIARY_CATEGORIES,
    });
  },
};

module.exports = voiceDiaryController;
