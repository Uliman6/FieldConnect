// Audio transcription service using OpenAI's GPT-4o-transcribe
// Uses gpt-4o-transcribe for high-quality transcription with speech understanding

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY;
const TRANSCRIPTION_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  error?: string;
}

export interface TranscriptionOptions {
  language?: string;
  model?: 'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe';
}

/**
 * Transcribe an audio file using OpenAI's GPT-4o-transcribe API
 * @param audioUri - Local file URI (e.g., file:///path/to/recording.m4a)
 * @param options - Optional transcription options (language, model)
 * @returns TranscriptionResult with success status and transcribed text or error
 */
export async function transcribeAudio(
  audioUri: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  // Check if API key is configured
  if (!OPENAI_API_KEY) {
    console.warn('[transcription] OpenAI API key not configured');
    return {
      success: false,
      error: 'OpenAI API key not configured. Please set up the API in the API tab.',
    };
  }

  try {
    console.log('[transcription] Starting transcription for:', audioUri);

    // Create FormData with the audio file
    const formData = new FormData();

    // Determine file extension and mime type
    const lowerUri = audioUri.toLowerCase();
    let mimeType = 'audio/m4a';
    let fileName = 'recording.m4a';

    if (lowerUri.includes('.wav')) {
      mimeType = 'audio/wav';
      fileName = 'recording.wav';
    } else if (lowerUri.includes('.mp3')) {
      mimeType = 'audio/mpeg';
      fileName = 'recording.mp3';
    } else if (lowerUri.includes('.webm')) {
      mimeType = 'audio/webm';
      fileName = 'recording.webm';
    }

    // Append file to FormData (React Native style)
    formData.append('file', {
      uri: audioUri,
      type: mimeType,
      name: fileName,
    } as any);

    // Use gpt-4o-transcribe for high-quality transcription
    // Can fall back to gpt-4o-mini-transcribe for faster/cheaper results
    const model = options.model ?? 'gpt-4o-transcribe';
    formData.append('model', model);
    formData.append('response_format', 'json');

    // Add language hint if provided
    if (options.language) {
      formData.append('language', options.language);
    }

    console.log(`[transcription] Using model: ${model}`);

    // Make the API request
    const response = await fetch(TRANSCRIPTION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[transcription] API error:', response.status, errorText);
      return {
        success: false,
        error: `Transcription failed: ${response.status}`,
      };
    }

    const result = await response.json();
    const transcribedText = result.text?.trim() ?? '';

    console.log('[transcription] Success, text length:', transcribedText.length);

    return {
      success: true,
      text: transcribedText,
    };
  } catch (error) {
    console.error('[transcription] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Transcription failed',
    };
  }
}

/**
 * Transcribe audio using gpt-4o-transcribe (full quality)
 */
export async function transcribeWithGpt4o(
  audioUri: string,
  language?: string
): Promise<TranscriptionResult> {
  return transcribeAudio(audioUri, { model: 'gpt-4o-transcribe', language });
}

/**
 * Transcribe audio using gpt-4o-mini-transcribe (faster/cheaper)
 */
export async function transcribeWithGpt4oMini(
  audioUri: string,
  language?: string
): Promise<TranscriptionResult> {
  return transcribeAudio(audioUri, { model: 'gpt-4o-mini-transcribe', language });
}

/**
 * Check if transcription is available (API key configured)
 */
export function isTranscriptionAvailable(): boolean {
  return !!OPENAI_API_KEY;
}

/**
 * Generate a concise title from transcription text
 * Extracts the most relevant part of the transcription to use as a title
 * @param transcript - The full transcription text
 * @param maxLength - Maximum length for the title (default: 50)
 * @returns A concise title extracted from the transcription
 */
export function generateTitleFromTranscript(
  transcript: string,
  maxLength: number = 50
): string {
  if (!transcript || !transcript.trim()) {
    return 'Untitled Event';
  }

  const cleaned = transcript.trim();

  // If it's short enough, use it as is
  if (cleaned.length <= maxLength) {
    // Capitalize first letter
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Try to find a natural break point (sentence end or comma)
  const firstSentence = cleaned.match(/^[^.!?]+[.!?]?/)?.[0] ?? '';
  if (firstSentence.length > 0 && firstSentence.length <= maxLength) {
    const title = firstSentence.trim().replace(/[.!?]+$/, '');
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  // Find break at comma or natural pause
  const firstClause = cleaned.match(/^[^,]+/)?.[0] ?? '';
  if (firstClause.length > 0 && firstClause.length <= maxLength) {
    return firstClause.charAt(0).toUpperCase() + firstClause.slice(1);
  }

  // Truncate at word boundary
  let truncated = cleaned.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.5) {
    truncated = truncated.substring(0, lastSpace);
  }

  // Remove trailing punctuation and add ellipsis
  truncated = truncated.replace(/[,.:;!?\s]+$/, '');

  return truncated.charAt(0).toUpperCase() + truncated.slice(1) + '...';
}

