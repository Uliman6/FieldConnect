/**
 * Transcription Service - Audio to text using OpenAI Whisper
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TRANSCRIPTION_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';

class TranscriptionService {
  /**
   * Check if transcription is available (API key configured)
   */
  isAvailable() {
    return !!OPENAI_API_KEY;
  }

  /**
   * Transcribe audio buffer using OpenAI Whisper
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {string} filename - Original filename (for mime type detection)
   * @param {object} options - Optional settings
   * @returns {Promise<{success: boolean, text?: string, error?: string}>}
   */
  async transcribe(audioBuffer, filename, options = {}) {
    if (!OPENAI_API_KEY) {
      return {
        success: false,
        error: 'OpenAI API key not configured. Set OPENAI_API_KEY environment variable.'
      };
    }

    try {
      // Determine mime type from filename
      const ext = filename.toLowerCase().split('.').pop();
      const mimeTypes = {
        'webm': 'audio/webm',
        'mp4': 'audio/mp4',
        'm4a': 'audio/m4a',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'aac': 'audio/aac'
      };
      const mimeType = mimeTypes[ext] || 'audio/webm';

      // Create form data for OpenAI API
      const FormData = require('form-data');
      const formData = new FormData();

      // Append audio file
      formData.append('file', audioBuffer, {
        filename: filename,
        contentType: mimeType
      });

      // Use whisper-1 model (standard Whisper)
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'json');

      // Add language hint if provided
      if (options.language) {
        formData.append('language', options.language);
      }

      console.log(`[transcription] Sending ${audioBuffer.length} bytes to OpenAI Whisper`);

      // Make the API request
      const response = await fetch(TRANSCRIPTION_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          ...formData.getHeaders()
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[transcription] API error:', response.status, errorText);
        return {
          success: false,
          error: `Transcription failed: ${response.status} - ${errorText}`
        };
      }

      const result = await response.json();
      const transcribedText = result.text?.trim() ?? '';

      console.log('[transcription] Success, text length:', transcribedText.length);

      return {
        success: true,
        text: transcribedText
      };
    } catch (error) {
      console.error('[transcription] Error:', error);
      return {
        success: false,
        error: error.message || 'Transcription failed'
      };
    }
  }

  /**
   * Generate a concise title from transcription text
   * @param {string} transcript - Full transcription text
   * @param {number} maxLength - Maximum title length
   * @returns {string}
   */
  generateTitle(transcript, maxLength = 50) {
    if (!transcript || !transcript.trim()) {
      return 'Untitled';
    }

    const cleaned = transcript.trim();

    if (cleaned.length <= maxLength) {
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    // Try to find a natural break point
    const firstSentence = cleaned.match(/^[^.!?]+[.!?]?/)?.[0] ?? '';
    if (firstSentence.length > 0 && firstSentence.length <= maxLength) {
      const title = firstSentence.trim().replace(/[.!?]+$/, '');
      return title.charAt(0).toUpperCase() + title.slice(1);
    }

    // Truncate at word boundary
    let truncated = cleaned.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.5) {
      truncated = truncated.substring(0, lastSpace);
    }

    truncated = truncated.replace(/[,.:;!?\s]+$/, '');
    return truncated.charAt(0).toUpperCase() + truncated.slice(1) + '...';
  }
}

module.exports = new TranscriptionService();
