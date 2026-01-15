// Audio transcription service - uses backend API for transcription
// Backend handles OpenAI Whisper calls securely

import { Platform } from 'react-native';
import { useAuthStore } from './auth-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Get auth token for API requests
 */
function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}

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
    const token = getAuthToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}/api/transcripts/status`, { headers });
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

    // Get auth token for authenticated request
    const token = getAuthToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}/api/transcripts/transcribe`, {
      method: 'POST',
      headers,
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

/**
 * Analyze transcript and extract event metadata
 * Returns event type, severity, and action items
 */
export interface EventAnalysis {
  eventType: 'Delay' | 'Quality' | 'Safety' | 'Inspection' | 'Material' | 'Equipment' | 'Coordination' | 'Other';
  severity: 'Low' | 'Medium' | 'High';
  actionItems: string[];
  location?: string;
  tradeVendor?: string;
}

// Keyword patterns for event type classification
const EVENT_TYPE_PATTERNS: Record<string, RegExp[]> = {
  Safety: [
    /safety/i, /hazard/i, /injur/i, /accident/i, /osha/i, /ppe/i,
    /fall\s+protection/i, /unsafe/i, /danger/i, /emergency/i, /first\s+aid/i,
    /fire/i, /evacuat/i, /protective/i, /violation/i,
  ],
  Delay: [
    /delay/i, /behind\s+schedule/i, /late/i, /waiting/i, /hold\s*up/i,
    /postpone/i, /reschedule/i, /push\s*back/i, /slipp/i, /slow/i,
    /not\s+ready/i, /can't\s+start/i, /unable\s+to\s+proceed/i,
  ],
  Quality: [
    /quality/i, /defect/i, /deficient/i, /rework/i, /redo/i, /fix/i,
    /incorrect/i, /wrong/i, /not\s+to\s+spec/i, /out\s+of\s+tolerance/i,
    /punch\s*list/i, /reject/i, /fail/i, /damage/i, /crack/i,
  ],
  Inspection: [
    /inspection/i, /inspector/i, /ahj/i, /authority/i, /code/i,
    /compliance/i, /permit/i, /certificate/i, /approval/i, /review/i,
    /sign\s*off/i, /passed/i, /failed/i, /examine/i,
  ],
  Material: [
    /material/i, /deliver/i, /shipment/i, /order/i, /supply/i,
    /out\s+of\s+stock/i, /missing/i, /short/i, /wrong\s+material/i,
    /procurement/i, /vendor/i, /supplier/i,
  ],
  Equipment: [
    /equipment/i, /machine/i, /tool/i, /crane/i, /forklift/i,
    /broken/i, /malfunction/i, /not\s+working/i, /repair/i,
    /maintenance/i, /rental/i,
  ],
  Coordination: [
    /coordinat/i, /conflict/i, /schedule\s+conflict/i, /overlap/i,
    /communication/i, /meeting/i, /discuss/i, /clarif/i,
    /rfi/i, /change\s+order/i, /scope/i, /drawing/i, /plan/i,
  ],
};

// Keywords that indicate high severity
const HIGH_SEVERITY_PATTERNS = [
  /urgent/i, /critical/i, /emergency/i, /immediate/i, /asap/i,
  /serious/i, /major/i, /significant/i, /stop\s+work/i, /shut\s*down/i,
  /injur/i, /accident/i, /danger/i, /violation/i, /legal/i, /lawsuit/i,
  /deadline/i, /must/i, /required/i, /mandatory/i,
];

// Keywords that indicate low severity
const LOW_SEVERITY_PATTERNS = [
  /minor/i, /small/i, /slight/i, /little/i, /fyi/i, /note/i,
  /heads\s+up/i, /just\s+wanted/i, /when\s+you\s+get\s+a\s+chance/i,
  /eventually/i, /sometime/i, /low\s+priority/i,
];

// Patterns to extract action items
const ACTION_ITEM_PATTERNS = [
  /need\s+to\s+([^.!?]+)/gi,
  /needs\s+to\s+([^.!?]+)/gi,
  /have\s+to\s+([^.!?]+)/gi,
  /has\s+to\s+([^.!?]+)/gi,
  /should\s+([^.!?]+)/gi,
  /must\s+([^.!?]+)/gi,
  /please\s+([^.!?]+)/gi,
  /make\s+sure\s+([^.!?]+)/gi,
  /ensure\s+([^.!?]+)/gi,
  /follow\s+up\s+(?:on\s+|with\s+)?([^.!?]+)/gi,
  /action\s+(?:item|needed|required)[:;]?\s*([^.!?]+)/gi,
  /todo[:;]?\s*([^.!?]+)/gi,
  /remind\s+(?:me\s+)?to\s+([^.!?]+)/gi,
  /don't\s+forget\s+to\s+([^.!?]+)/gi,
  /(?:we|they|someone)\s+(?:need|needs)\s+to\s+([^.!?]+)/gi,
  /get\s+(?:a\s+)?([^.!?]+(?:quote|estimate|approval|sign\s*off)[^.!?]*)/gi,
  /schedule\s+([^.!?]+)/gi,
  /call\s+([^.!?]+)/gi,
  /contact\s+([^.!?]+)/gi,
  /notify\s+([^.!?]+)/gi,
  /order\s+([^.!?]+)/gi,
  /request\s+([^.!?]+)/gi,
];

// Trade/vendor patterns
const TRADE_PATTERNS = [
  /electrician/i, /plumber/i, /hvac/i, /mechanical/i, /drywall/i,
  /painter/i, /carpenter/i, /mason/i, /roofer/i, /glazier/i,
  /flooring/i, /tile/i, /concrete/i, /steel/i, /iron\s*worker/i,
  /framer/i, /insulation/i, /fire\s*protection/i, /sprinkler/i,
  /elevator/i, /landscap/i, /excavat/i, /demoli/i,
];

/**
 * Analyze transcript text and extract intelligent metadata
 */
export function analyzeTranscript(transcript: string): EventAnalysis {
  if (!transcript || !transcript.trim()) {
    return {
      eventType: 'Other',
      severity: 'Medium',
      actionItems: [],
    };
  }

  const text = transcript.toLowerCase();

  // Determine event type
  let eventType: EventAnalysis['eventType'] = 'Other';
  let maxMatches = 0;

  for (const [type, patterns] of Object.entries(EVENT_TYPE_PATTERNS)) {
    const matches = patterns.filter(p => p.test(text)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      eventType = type as EventAnalysis['eventType'];
    }
  }

  // Determine severity
  let severity: EventAnalysis['severity'] = 'Medium';
  const hasHighSeverity = HIGH_SEVERITY_PATTERNS.some(p => p.test(text));
  const hasLowSeverity = LOW_SEVERITY_PATTERNS.some(p => p.test(text));

  if (hasHighSeverity && !hasLowSeverity) {
    severity = 'High';
  } else if (hasLowSeverity && !hasHighSeverity) {
    severity = 'Low';
  }

  // Safety events default to high severity
  if (eventType === 'Safety' && severity !== 'Low') {
    severity = 'High';
  }

  // Extract action items
  const actionItems: string[] = [];
  const seenActions = new Set<string>();

  for (const pattern of ACTION_ITEM_PATTERNS) {
    pattern.lastIndex = 0; // Reset regex state
    let match;
    while ((match = pattern.exec(transcript)) !== null) {
      const action = match[1].trim();
      // Clean up and normalize
      const normalized = action
        .replace(/^(that\s+|we\s+|they\s+|i\s+)/i, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (normalized.length > 5 && normalized.length < 200) {
        const key = normalized.toLowerCase();
        if (!seenActions.has(key)) {
          seenActions.add(key);
          // Capitalize first letter
          actionItems.push(normalized.charAt(0).toUpperCase() + normalized.slice(1));
        }
      }
    }
  }

  // Extract trade/vendor if mentioned
  let tradeVendor: string | undefined;
  for (const pattern of TRADE_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      tradeVendor = match[0].charAt(0).toUpperCase() + match[0].slice(1).toLowerCase();
      break;
    }
  }

  // Extract location if mentioned
  let location: string | undefined;
  const locationMatch = transcript.match(
    /(?:at|on|in|near)\s+(?:the\s+)?(?:level|floor|room|area|zone|building|wing|section)\s*(\d+|[a-z])?/i
  );
  if (locationMatch) {
    location = locationMatch[0].replace(/^(at|on|in|near)\s+/i, '');
    location = location.charAt(0).toUpperCase() + location.slice(1);
  }

  return {
    eventType,
    severity,
    actionItems: actionItems.slice(0, 5), // Limit to 5 action items
    location,
    tradeVendor,
  };
}
