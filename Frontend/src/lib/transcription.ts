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
 * Extracts the PROBLEM/ISSUE, not the location
 * @param transcript - The full transcription text
 * @param maxLength - Maximum length for the title (default: 50)
 * @returns A concise title describing the problem
 */
export function generateTitleFromTranscript(
  transcript: string,
  maxLength: number = 50
): string {
  if (!transcript || !transcript.trim()) {
    return 'Untitled Event';
  }

  const cleaned = transcript.trim();
  const lower = cleaned.toLowerCase();

  // Try to extract the actual PROBLEM from common patterns
  // Pattern: "[location] do not/does not/doesn't [problem]"
  const negativePatterns = [
    /(?:do\s+not|does\s+not|doesn't|don't|won't|can't|cannot|isn't|aren't)\s+([^,.!?]+)/i,
    /(?:not\s+)([^,.!?]+(?:properly|correctly|fully|completely))/i,
    /(?:is|are|was|were)\s+([^,.!?]*(?:broken|damaged|missing|leaking|stuck|loose|cracked|defective)[^,.!?]*)/i,
  ];

  for (const pattern of negativePatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      let problem = match[1].trim();
      // Clean up the problem description
      problem = problem
        .replace(/^(fully\s+|properly\s+|correctly\s+)/i, '')
        .replace(/,\s*creating.*$/i, '')
        .trim();

      // Format: "Not [doing something]" or "[thing] not working"
      if (problem.length > 3 && problem.length <= maxLength) {
        // Check if it starts with a verb - add "Not" prefix
        if (/^(close|open|work|function|seal|lock|latch)/i.test(problem)) {
          const title = 'Not ' + problem.toLowerCase() + ' properly';
          return title.charAt(0).toUpperCase() + title.slice(1);
        }
        return problem.charAt(0).toUpperCase() + problem.slice(1);
      }
    }
  }

  // Pattern: "creating a [issue]" or "causing [issue]"
  const causingMatch = cleaned.match(/(?:creating|causing|resulting\s+in)\s+(?:a\s+)?([^,.!?]+(?:issue|problem|concern|hazard|delay))/i);
  if (causingMatch && causingMatch[1]) {
    const title = causingMatch[1].trim();
    if (title.length <= maxLength) {
      return title.charAt(0).toUpperCase() + title.slice(1);
    }
  }

  // Pattern: "[something] is/are [problem state]"
  const stateMatch = cleaned.match(/(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:is|are)\s+([^,.!?]*(?:broken|damaged|missing|leaking|stuck|loose|blocked|clogged))/i);
  if (stateMatch && stateMatch[1] && stateMatch[2]) {
    const title = `${stateMatch[1]} ${stateMatch[2]}`.trim();
    if (title.length <= maxLength) {
      return title.charAt(0).toUpperCase() + title.slice(1);
    }
  }

  // Fallback: If we can identify it's about a specific item, extract just the issue
  // Remove location prefixes like "The [thing] at/on/in [location]"
  const withoutLocation = cleaned
    .replace(/^(?:the\s+)?(?:\w+\s+)?(?:at|on|in)\s+(?:the\s+)?(?:female|male|women'?s?|men'?s?)?\s*(?:bathroom|restroom|room|floor|level|area|building|wing)[^,.]*/i, '')
    .replace(/^[,.\s]+/, '')
    .trim();

  if (withoutLocation.length > 10 && withoutLocation.length < cleaned.length) {
    // Found something after removing location
    const firstPart = withoutLocation.match(/^[^.!?]+/)?.[0] ?? '';
    if (firstPart.length > 5 && firstPart.length <= maxLength) {
      return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
    }
  }

  // Last resort: take first meaningful clause but try to skip location-only starts
  const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim());
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    // Skip if it's just a location reference
    if (/^(?:the\s+)?(?:\w+\s+)?(?:at|on|in|near)\s+/i.test(trimmed) && trimmed.length < 30) {
      continue;
    }
    if (trimmed.length > 5 && trimmed.length <= maxLength) {
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }
    // Take first meaningful part
    const firstClause = trimmed.match(/^[^,]+/)?.[0] ?? '';
    if (firstClause.length > 5 && firstClause.length <= maxLength) {
      return firstClause.charAt(0).toUpperCase() + firstClause.slice(1);
    }
  }

  // Ultimate fallback: truncate intelligently
  let truncated = cleaned.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.5) {
    truncated = truncated.substring(0, lastSpace);
  }
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
/**
 * Parse daily log transcript to extract structured data
 * Extracts tasks, issues, inspections, materials, equipment, etc.
 */
export interface DailyLogTranscriptData {
  summary: string;
  tasks: Array<{
    company_name?: string;
    workers?: number;
    hours?: number;
    task_description: string;
    notes?: string;
  }>;
  pending_issues: Array<{
    title: string;
    description?: string;
    category?: string;
    severity?: string;
    location?: string;
  }>;
  inspection_notes: Array<{
    inspection_type?: string;
    inspector_name?: string;
    result?: string;
    notes?: string;
    follow_up_needed?: boolean;
  }>;
  materials: Array<{
    material: string;
    quantity?: number;
    unit?: string;
    supplier?: string;
    notes?: string;
  }>;
  equipment: Array<{
    equipment_type: string;
    quantity?: number;
    hours?: number;
    notes?: string;
  }>;
  visitors: Array<{
    visitor_name?: string;
    company_name?: string;
    time?: string;
    notes?: string;
  }>;
  additional_work: Array<{
    category?: string;
    description: string;
  }>;
  daily_totals: {
    workers?: number;
    hours?: number;
  };
}

// Trade/company patterns for task extraction
const TRADE_COMPANY_PATTERNS = [
  /(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:crew|team|guys|workers|people|had|were|was|did|worked|installed|completed|finished|continued|started)/gi,
  /(\w+(?:\s+\w+)?)\s+(?:electricians?|plumbers?|carpenters?|masons?|roofers?|painters?|drywallers?|framers?|hvac|mechanical)/gi,
];

// Issue/problem patterns
const ISSUE_PATTERNS = [
  /(?:issue|problem|concern|delay|waiting|hold\s*up|can't|cannot|unable|need|missing|broken|damaged|incorrect|wrong)[\s:]+([^.!?]+)/gi,
  /(?:we|they)\s+(?:have|had|ran\s+into|discovered|found|noticed)\s+(?:a\s+|an\s+)?(?:issue|problem|concern)[\s:]*([^.!?]+)/gi,
];

// Inspection patterns
const INSPECTION_PATTERNS = [
  /(?:inspection|inspector|inspected)[\s:]+([^.!?]+)/gi,
  /(\w+)\s+(?:inspection|inspector)\s+(?:passed|failed|came|arrived|visited|scheduled)/gi,
  /(?:passed|failed|scheduled)\s+(?:the\s+)?(\w+)\s+inspection/gi,
];

// Material/delivery patterns
const MATERIAL_PATTERNS = [
  /(?:delivered|received|got|arrived)[\s:]+([^.!?]+(?:materials?|supplies|lumber|concrete|steel|rebar|drywall|insulation|pipe|wire|cable)[^.!?]*)/gi,
  /(\d+)\s+(?:units?|pieces?|sheets?|yards?|tons?|loads?|pallets?|bundles?)\s+(?:of\s+)?([^.!?,]+)/gi,
];

// Equipment patterns
const EQUIPMENT_PATTERNS = [
  /(?:used|using|rented|had|brought\s+in)[\s:]+(?:a\s+|the\s+)?(\w+(?:\s+\w+)?)\s*(?:crane|lift|loader|excavator|forklift|boom|scaffolding|equipment)/gi,
  /(crane|lift|loader|excavator|forklift|boom|scaffolding|backhoe|bulldozer|compactor)\s+(?:was|were|on\s+site|arrived|used)/gi,
];

// Visitor patterns
const VISITOR_PATTERNS = [
  /(?:visited|visit\s+from|came\s+by|stopped\s+by|met\s+with)[\s:]+([^.!?,]+)/gi,
  /(\w+(?:\s+\w+)?)\s+(?:from\s+)?(\w+(?:\s+\w+)?)\s+(?:visited|came|stopped|was\s+on\s+site)/gi,
];

// Number extraction patterns
const NUMBER_PATTERNS = {
  workers: /(\d+)\s*(?:workers?|guys?|people|men|crew\s*members?)/i,
  hours: /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i,
  quantity: /(\d+(?:\.\d+)?)\s*(?:units?|pieces?|sheets?|yards?|tons?|loads?|pallets?)/i,
};

/**
 * Parse a daily log voice transcription into structured data
 */
export function parseDailyLogTranscript(transcript: string): DailyLogTranscriptData {
  if (!transcript || !transcript.trim()) {
    return {
      summary: '',
      tasks: [],
      pending_issues: [],
      inspection_notes: [],
      materials: [],
      equipment: [],
      visitors: [],
      additional_work: [],
      daily_totals: {},
    };
  }

  const text = transcript.trim();
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());

  const result: DailyLogTranscriptData = {
    summary: text.length > 500 ? text.substring(0, 500) + '...' : text,
    tasks: [],
    pending_issues: [],
    inspection_notes: [],
    materials: [],
    equipment: [],
    visitors: [],
    additional_work: [],
    daily_totals: {},
  };

  // Track what we've already extracted to avoid duplicates
  const seenTasks = new Set<string>();
  const seenIssues = new Set<string>();

  // Extract tasks from sentences mentioning work activities
  const workKeywords = /(?:installed|completed|finished|worked\s+on|continued|started|poured|framed|wired|plumbed|painted|set|placed|laid|hung|mounted)/i;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    // Check for work activity
    if (workKeywords.test(trimmed)) {
      // Try to extract company/trade name
      let companyName: string | undefined;
      for (const pattern of TRADE_COMPANY_PATTERNS) {
        pattern.lastIndex = 0;
        const match = pattern.exec(trimmed);
        if (match && match[1]) {
          companyName = match[1].trim();
          break;
        }
      }

      // Extract worker count and hours
      const workersMatch = trimmed.match(NUMBER_PATTERNS.workers);
      const hoursMatch = trimmed.match(NUMBER_PATTERNS.hours);

      const taskKey = trimmed.toLowerCase().substring(0, 50);
      if (!seenTasks.has(taskKey)) {
        seenTasks.add(taskKey);
        result.tasks.push({
          company_name: companyName,
          workers: workersMatch ? parseInt(workersMatch[1]) : undefined,
          hours: hoursMatch ? parseFloat(hoursMatch[1]) : undefined,
          task_description: trimmed.charAt(0).toUpperCase() + trimmed.slice(1),
        });
      }
    }

    // Check for issues/problems
    for (const pattern of ISSUE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(trimmed)) !== null) {
        const issueText = match[1]?.trim();
        if (issueText && issueText.length > 10) {
          const issueKey = issueText.toLowerCase().substring(0, 50);
          if (!seenIssues.has(issueKey)) {
            seenIssues.add(issueKey);
            result.pending_issues.push({
              title: issueText.length > 60
                ? issueText.substring(0, 60) + '...'
                : issueText.charAt(0).toUpperCase() + issueText.slice(1),
              description: trimmed,
              category: detectIssueCategory(trimmed),
              severity: detectIssueSeverity(trimmed),
            });
          }
        }
      }
    }

    // Check for inspections
    if (/inspect/i.test(trimmed)) {
      const resultMatch = trimmed.match(/(?:passed|failed|partial)/i);
      const typeMatch = trimmed.match(/(\w+)\s+inspection/i);

      result.inspection_notes.push({
        inspection_type: typeMatch ? typeMatch[1] : 'General',
        result: resultMatch ? resultMatch[0].charAt(0).toUpperCase() + resultMatch[0].slice(1).toLowerCase() : undefined,
        notes: trimmed,
        follow_up_needed: /failed|follow\s*up|reschedule/i.test(trimmed),
      });
    }

    // Check for materials/deliveries
    if (/deliver|received|arrived|got\s+in|shipment/i.test(trimmed)) {
      const quantityMatch = trimmed.match(/(\d+)\s+(\w+)/);
      result.materials.push({
        material: trimmed.length > 100 ? trimmed.substring(0, 100) : trimmed,
        quantity: quantityMatch ? parseInt(quantityMatch[1]) : undefined,
        unit: quantityMatch ? quantityMatch[2] : undefined,
      });
    }

    // Check for equipment
    if (/crane|lift|loader|excavator|forklift|boom|scaffolding|equipment/i.test(trimmed)) {
      const equipMatch = trimmed.match(/(crane|lift|loader|excavator|forklift|boom|scaffolding|backhoe|bulldozer)/i);
      if (equipMatch) {
        result.equipment.push({
          equipment_type: equipMatch[1].charAt(0).toUpperCase() + equipMatch[1].slice(1).toLowerCase(),
          notes: trimmed,
        });
      }
    }

    // Check for visitors
    if (/visit|came\s+by|stopped\s+by|met\s+with|on\s+site/i.test(trimmed)) {
      const visitorMatch = trimmed.match(/(?:visit\s+from|met\s+with|came\s+by)\s+([^,.\n]+)/i);
      if (visitorMatch) {
        result.visitors.push({
          visitor_name: visitorMatch[1].trim(),
          notes: trimmed,
        });
      }
    }
  }

  // Calculate daily totals from tasks
  let totalWorkers = 0;
  let totalHours = 0;
  for (const task of result.tasks) {
    if (task.workers) totalWorkers += task.workers;
    if (task.hours) totalHours += task.hours;
  }

  if (totalWorkers > 0 || totalHours > 0) {
    result.daily_totals = {
      workers: totalWorkers || undefined,
      hours: totalHours || undefined,
    };
  }

  // If no structured data extracted, add the whole transcript as a task description
  if (result.tasks.length === 0 && result.pending_issues.length === 0 && text.length > 20) {
    result.tasks.push({
      task_description: text,
      notes: 'Transcribed from voice recording',
    });
  }

  return result;
}

/**
 * Detect issue category from text
 */
function detectIssueCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/safety|hazard|osha|ppe|injur/i.test(lower)) return 'Safety';
  if (/quality|defect|rework|punch/i.test(lower)) return 'QAQC';
  if (/delay|schedule|behind|late|waiting/i.test(lower)) return 'Schedule';
  if (/material|delivery|supply|order/i.test(lower)) return 'Procurement';
  if (/inspect|code|permit/i.test(lower)) return 'Inspection';
  if (/design|drawing|plan|spec/i.test(lower)) return 'Design';
  if (/coordinat|conflict|clash/i.test(lower)) return 'Coordination';
  return 'Other';
}

/**
 * Detect issue severity from text
 */
function detectIssueSeverity(text: string): string {
  const lower = text.toLowerCase();
  if (/urgent|critical|emergency|stop\s+work|immediate|serious|major/i.test(lower)) return 'High';
  if (/minor|small|slight|fyi|note/i.test(lower)) return 'Low';
  return 'Medium';
}

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

  // Extract action items with better deduplication
  const actionItems: string[] = [];
  const seenActions = new Set<string>();
  const allMatches: Array<{ action: string; start: number; end: number }> = [];

  // First, collect all potential action items with their positions
  for (const pattern of ACTION_ITEM_PATTERNS) {
    pattern.lastIndex = 0; // Reset regex state
    let match;
    while ((match = pattern.exec(transcript)) !== null) {
      const action = match[1].trim();
      // Clean up and normalize
      let normalized = action
        .replace(/^(that\s+|we\s+|they\s+|i\s+)/i, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Skip fragments that are just "they are aware" type phrases
      if (/^(they|we|he|she|it)\s+(is|are|was|were)\s+/i.test(normalized)) {
        continue;
      }

      // Skip if it's just a continuation phrase
      if (/^(aware|informed|notified|told)\s+(of|about)?\s*(this|that|the)?\s*(issue|problem)?$/i.test(normalized)) {
        continue;
      }

      if (normalized.length > 10 && normalized.length < 200) {
        allMatches.push({
          action: normalized,
          start: match.index,
          end: match.index + match[0].length
        });
      }
    }
  }

  // Sort by start position
  allMatches.sort((a, b) => a.start - b.start);

  // Remove overlapping matches (keep the longer/earlier one)
  const filteredMatches: typeof allMatches = [];
  for (const current of allMatches) {
    // Check if this overlaps with any existing match
    const overlaps = filteredMatches.some(existing =>
      (current.start >= existing.start && current.start < existing.end) ||
      (current.end > existing.start && current.end <= existing.end) ||
      (current.start <= existing.start && current.end >= existing.end)
    );

    if (!overlaps) {
      filteredMatches.push(current);
    }
  }

  // Add unique action items
  for (const { action } of filteredMatches) {
    const key = action.toLowerCase();
    // Also check if this is a substring of an existing action
    const isSubstring = Array.from(seenActions).some(existing =>
      existing.includes(key) || key.includes(existing)
    );

    if (!seenActions.has(key) && !isSubstring) {
      seenActions.add(key);
      // Capitalize first letter and format nicely
      const formatted = action.charAt(0).toUpperCase() + action.slice(1);
      actionItems.push(formatted);
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
