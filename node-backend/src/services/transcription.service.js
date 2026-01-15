/**
 * Transcription Service - Audio to text using Whisper
 * Supports Groq (free, fast) and OpenAI as fallback
 */

// Groq is preferred (free tier), OpenAI as fallback
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Determine which provider to use
const useGroq = !!GROQ_API_KEY;
const API_KEY = GROQ_API_KEY || OPENAI_API_KEY;
const TRANSCRIPTION_ENDPOINT = useGroq
  ? 'https://api.groq.com/openai/v1/audio/transcriptions'
  : 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = useGroq ? 'whisper-large-v3' : 'whisper-1';
const PROVIDER_NAME = useGroq ? 'Groq' : 'OpenAI';

class TranscriptionService {
  /**
   * Check if transcription is available (API key configured)
   */
  isAvailable() {
    return !!API_KEY;
  }

  /**
   * Get current provider info
   */
  getProviderInfo() {
    return {
      provider: PROVIDER_NAME,
      model: WHISPER_MODEL,
      available: this.isAvailable()
    };
  }

  /**
   * Transcribe audio buffer using Whisper (Groq or OpenAI)
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {string} filename - Original filename (for mime type detection)
   * @param {object} options - Optional settings
   * @returns {Promise<{success: boolean, text?: string, error?: string}>}
   */
  async transcribe(audioBuffer, filename, options = {}) {
    if (!API_KEY) {
      return {
        success: false,
        error: 'No transcription API key configured. Set GROQ_API_KEY or OPENAI_API_KEY environment variable.'
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

      // Use native FormData and Blob (Node.js 18+) for compatibility with native fetch
      const formData = new FormData();

      // Create a Blob from the buffer and append to form
      const audioBlob = new Blob([audioBuffer], { type: mimeType });
      formData.append('file', audioBlob, filename);

      // Use appropriate Whisper model
      formData.append('model', WHISPER_MODEL);
      formData.append('response_format', 'json');

      // Add language hint if provided
      if (options.language) {
        formData.append('language', options.language);
      }

      console.log(`[transcription] Sending ${audioBuffer.length} bytes to ${PROVIDER_NAME} Whisper (${WHISPER_MODEL})`);

      // Make the API request using native fetch with native FormData
      const response = await fetch(TRANSCRIPTION_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[transcription] ${PROVIDER_NAME} API error:`, response.status, errorText);
        return {
          success: false,
          error: `Transcription failed: ${response.status} - ${errorText}`
        };
      }

      const result = await response.json();
      const transcribedText = result.text?.trim() ?? '';

      console.log(`[transcription] Success via ${PROVIDER_NAME}, text length:`, transcribedText.length);

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
