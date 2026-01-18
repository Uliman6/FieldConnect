/**
 * Transcription Service - Audio to text using Whisper
 * Supports Groq (free, fast) with OpenAI as automatic fallback
 */

// Groq is preferred (free tier), OpenAI as fallback
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Provider configurations
const PROVIDERS = {
  groq: {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    model: 'whisper-large-v3',
    apiKey: GROQ_API_KEY,
  },
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'whisper-1',
    apiKey: OPENAI_API_KEY,
  },
};

// Suspicious responses that indicate rate limiting or errors
const SUSPICIOUS_RESPONSES = [
  'thank you',
  'thanks',
  'you',
  'bye',
  'hello',
  'hi',
  '',
];

// Minimum expected transcript length for audio > 1 second
const MIN_TRANSCRIPT_LENGTH = 15;

class TranscriptionService {
  /**
   * Check if transcription is available (API key configured)
   */
  isAvailable() {
    return !!(GROQ_API_KEY || OPENAI_API_KEY);
  }

  /**
   * Get current provider info
   */
  getProviderInfo() {
    const primaryProvider = GROQ_API_KEY ? 'Groq' : OPENAI_API_KEY ? 'OpenAI' : 'None';
    const hasBackup = GROQ_API_KEY && OPENAI_API_KEY;
    return {
      provider: primaryProvider,
      model: GROQ_API_KEY ? PROVIDERS.groq.model : PROVIDERS.openai.model,
      available: this.isAvailable(),
      hasBackup,
    };
  }

  /**
   * Check if a transcript looks suspicious (rate limited or error)
   */
  isSuspiciousTranscript(text, audioSize) {
    if (!text) return true;

    const normalizedText = text.toLowerCase().trim();

    // Check against known suspicious responses
    if (SUSPICIOUS_RESPONSES.includes(normalizedText)) {
      console.log(`[transcription] ⚠️  SUSPICIOUS RESPONSE: "${text}" - likely rate limited or audio issue`);
      return true;
    }

    // If audio is larger than 10KB, expect more than 15 chars
    if (audioSize > 10000 && text.length < MIN_TRANSCRIPT_LENGTH) {
      console.log(`[transcription] ⚠️  TRANSCRIPT TOO SHORT: ${text.length} chars for ${audioSize} bytes audio - possible rate limit`);
      return true;
    }

    return false;
  }

  /**
   * Make transcription request to a specific provider
   */
  async transcribeWithProvider(provider, audioBuffer, filename, mimeType, options = {}) {
    if (!provider.apiKey) {
      return { success: false, error: `No API key for ${provider.name}` };
    }

    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', audioBlob, filename);
    formData.append('model', provider.model);
    formData.append('response_format', 'json');

    if (options.language) {
      formData.append('language', options.language);
    }

    console.log(`[transcription] Sending ${audioBuffer.length} bytes to ${provider.name} (${provider.model})`);

    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[transcription] ${provider.name} API error:`, response.status, errorText);

      // Check for rate limit
      if (response.status === 429) {
        console.log(`[transcription] 🚫 ${provider.name} RATE LIMITED (429) - will try fallback if available`);
        return { success: false, error: 'Rate limited', rateLimited: true };
      }

      return { success: false, error: `${response.status} - ${errorText}` };
    }

    const result = await response.json();
    const transcribedText = result.text?.trim() ?? '';

    console.log(`[transcription] ${provider.name} returned: "${transcribedText.substring(0, 50)}..." (${transcribedText.length} chars)`);

    return { success: true, text: transcribedText };
  }

  /**
   * Transcribe audio buffer using Whisper (Groq with OpenAI fallback)
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {string} filename - Original filename (for mime type detection)
   * @param {object} options - Optional settings
   * @returns {Promise<{success: boolean, text?: string, error?: string, provider?: string}>}
   */
  async transcribe(audioBuffer, filename, options = {}) {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'No transcription API key configured. Set GROQ_API_KEY or OPENAI_API_KEY environment variable.'
      };
    }

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

    // Determine provider order (Groq first if available, then OpenAI)
    const providers = [];
    if (GROQ_API_KEY) providers.push(PROVIDERS.groq);
    if (OPENAI_API_KEY) providers.push(PROVIDERS.openai);

    console.log(`[transcription] Available providers: ${providers.map(p => p.name).join(', ') || 'NONE'}`);

    if (providers.length === 0) {
      console.error('[transcription] ❌ No transcription providers configured!');
      return {
        success: false,
        error: 'No transcription API keys configured'
      };
    }

    let lastError = null;
    let providerIndex = 0;

    for (const provider of providers) {
      providerIndex++;
      const isLastProvider = providerIndex === providers.length;

      try {
        const result = await this.transcribeWithProvider(provider, audioBuffer, filename, mimeType, options);

        if (result.success) {
          // Check if result looks suspicious
          if (this.isSuspiciousTranscript(result.text, audioBuffer.length)) {
            if (isLastProvider) {
              console.log(`[transcription] ⚠️  ${provider.name} returned suspicious result, NO MORE FALLBACKS available`);
            } else {
              console.log(`[transcription] ⚠️  ${provider.name} returned suspicious result, trying next provider...`);
            }
            lastError = `${provider.name} returned suspicious response: "${result.text}"`;
            continue; // Try next provider
          }

          console.log(`[transcription] ✅ SUCCESS via ${provider.name}, text length: ${result.text.length}`);
          return {
            success: true,
            text: result.text,
            provider: provider.name,
          };
        }

        // If rate limited or error, try next provider
        lastError = result.error;
        if (isLastProvider) {
          console.log(`[transcription] ❌ ${provider.name} failed: ${result.error}, NO MORE FALLBACKS`);
        } else {
          console.log(`[transcription] ⚠️  ${provider.name} failed: ${result.error}, trying next provider...`);
        }
      } catch (error) {
        lastError = error.message;
        console.error(`[transcription] ❌ ${provider.name} exception:`, error.message);
      }
    }

    // All providers failed
    console.error('[transcription] ❌ ALL PROVIDERS FAILED. Last error:', lastError);
    return {
      success: false,
      error: lastError || 'All transcription providers failed'
    };
  }

  /**
   * Generate a concise title from transcription text
   * Extracts the PROBLEM/ISSUE, not the location
   * @param {string} transcript - Full transcription text
   * @param {number} maxLength - Maximum title length
   * @returns {string}
   */
  generateTitle(transcript, maxLength = 50) {
    if (!transcript || !transcript.trim()) {
      return 'Untitled';
    }

    const cleaned = transcript.trim();

    // Try to extract the actual PROBLEM from common patterns
    // Pattern: "do not/doesn't [verb]" - extract the problem
    const negativePatterns = [
      /(?:do\s+not|does\s+not|doesn't|don't|won't|can't|cannot|isn't|aren't)\s+([^,.!?]+)/i,
      /(?:not\s+)([^,.!?]+(?:properly|correctly|fully|completely))/i,
      /(?:is|are|was|were)\s+([^,.!?]*(?:broken|damaged|missing|leaking|stuck|loose|cracked|defective)[^,.!?]*)/i,
    ];

    for (const pattern of negativePatterns) {
      const match = cleaned.match(pattern);
      if (match && match[1]) {
        let problem = match[1].trim()
          .replace(/^(fully\s+|properly\s+|correctly\s+)/i, '')
          .replace(/,\s*creating.*$/i, '')
          .trim();

        if (problem.length > 3 && problem.length <= maxLength) {
          // If it starts with a verb, format as "Not [verb]ing properly"
          if (/^(close|open|work|function|seal|lock|latch)/i.test(problem)) {
            const title = 'Not ' + problem.toLowerCase() + ' properly';
            return title.charAt(0).toUpperCase() + title.slice(1);
          }
          return problem.charAt(0).toUpperCase() + problem.slice(1);
        }
      }
    }

    // Pattern: "creating a [issue]"
    const causingMatch = cleaned.match(/(?:creating|causing|resulting\s+in)\s+(?:a\s+)?([^,.!?]+(?:issue|problem|concern|hazard|delay))/i);
    if (causingMatch && causingMatch[1]) {
      const title = causingMatch[1].trim();
      if (title.length <= maxLength) {
        return title.charAt(0).toUpperCase() + title.slice(1);
      }
    }

    // Pattern: "[thing] is [broken/damaged/etc]"
    const stateMatch = cleaned.match(/(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:is|are)\s+([^,.!?]*(?:broken|damaged|missing|leaking|stuck|loose|blocked|clogged))/i);
    if (stateMatch && stateMatch[1] && stateMatch[2]) {
      const title = `${stateMatch[1]} ${stateMatch[2]}`.trim();
      if (title.length <= maxLength) {
        return title.charAt(0).toUpperCase() + title.slice(1);
      }
    }

    // Remove location prefixes and try again
    const withoutLocation = cleaned
      .replace(/^(?:the\s+)?(?:\w+\s+)?(?:at|on|in)\s+(?:the\s+)?(?:female|male|women'?s?|men'?s?)?\s*(?:bathroom|restroom|room|floor|level|area|building|wing)[^,.]*/i, '')
      .replace(/^[,.\s]+/, '')
      .trim();

    if (withoutLocation.length > 10 && withoutLocation.length < cleaned.length) {
      const firstPart = withoutLocation.match(/^[^.!?]+/)?.[0] ?? '';
      if (firstPart.length > 5 && firstPart.length <= maxLength) {
        return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
      }
    }

    // Fallback: first sentence, but skip if just location
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
