// Audio transcription service - uses backend API for transcription
// Backend handles OpenAI Whisper calls securely

import { Platform } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  title?: string;
  error?: string;
}

export interface TranscriptionOptions {
  language?: string;
}

/**
 * Check if transcription service is available
 * Calls backend to verify API key is configured
 */
export async function isTranscriptionAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/transcripts/status`);
    if (!response.ok) return false;
    const data = await response.json();
    return data.available === true;
  } catch {
    return false;
  }
}

/**
 * Transcribe audio using backend API
 * Works for both web (blob URL) and native (file URI)
 */
export async function transcribeAudio(
  audioUri: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  try {
    console.log('[transcription] Starting transcription via backend API');

    const formData = new FormData();

    if (Platform.OS === 'web') {
      // Web: audioUri is a blob URL, fetch and append
      const response = await fetch(audioUri);
      const blob = await response.blob();

      // Determine filename from blob type
      const ext = blob.type.includes('webm') ? 'webm' :
                  blob.type.includes('mp4') ? 'm4a' :
                  blob.type.includes('wav') ? 'wav' : 'webm';

      formData.append('audio', blob, `recording.${ext}`);
    } else {
      // Native: append file URI directly (React Native style)
      const ext = audioUri.toLowerCase().includes('.wav') ? 'wav' :
                  audioUri.toLowerCase().includes('.mp3') ? 'mp3' :
                  audioUri.toLowerCase().includes('.webm') ? 'webm' : 'm4a';

      formData.append('audio', {
        uri: audioUri,
        type: `audio/${ext}`,
        name: `recording.${ext}`,
      } as any);
    }

    // Add language if specified
    if (options.language) {
      formData.append('language', options.language);
    }

    console.log('[transcription] Sending to backend...');

    const response = await fetch(`${API_URL}/api/transcripts/transcribe`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[transcription] API error:', response.status, errorData);
      return {
        success: false,
        error: errorData.message || `Transcription failed: ${response.status}`,
      };
    }

    const result = await response.json();
    console.log('[transcription] Success, text length:', result.text?.length || 0);

    return {
      success: true,
      text: result.text,
      title: result.title,
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
 * Transcribe with default settings
 */
export async function transcribeWithDefaults(
  audioUri: string,
  language?: string
): Promise<TranscriptionResult> {
  return transcribeAudio(audioUri, { language });
}

/**
 * Generate a concise title from transcription text
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
