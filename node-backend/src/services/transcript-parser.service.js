/**
 * Transcript Parser Service
 * Extracts structured daily log data from voice transcripts
 * Supports both AI-powered parsing (Groq/OpenAI) and regex fallback
 */

// AI API configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const useGroqForParsing = !!GROQ_API_KEY;
const PARSING_API_KEY = GROQ_API_KEY || OPENAI_API_KEY;
const CHAT_ENDPOINT = useGroqForParsing
  ? 'https://api.groq.com/openai/v1/chat/completions'
  : 'https://api.openai.com/v1/chat/completions';
const CHAT_MODEL = useGroqForParsing ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

class TranscriptParserService {
  // Word to number mapping
  static WORD_NUMBERS = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
    'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
    'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
    'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
    'eighteen': 18, 'nineteen': 19, 'twenty': 20
  };

  // Common company suffixes to help identify company names
  static COMPANY_INDICATORS = [
    'concrete', 'steel', 'electric', 'electrical', 'plumbing', 'hvac',
    'landscaping', 'roofing', 'drywall', 'painting', 'flooring',
    'mechanical', 'construction', 'contractors', 'inc', 'llc', 'corp'
  ];

  // Weather condition keywords
  static WEATHER_CONDITIONS = [
    'sunny', 'clear', 'cloudy', 'partly cloudy', 'overcast',
    'rainy', 'rain', 'stormy', 'windy', 'foggy', 'snow', 'snowy'
  ];

  // Inspection result keywords
  static INSPECTION_RESULTS = ['pass', 'passed', 'fail', 'failed', 'approved', 'rejected', 'pending'];

  /**
   * Parse a transcript using AI for more accurate extraction
   * Falls back to regex-based parsing if AI is unavailable
   * @param {string} transcript - The voice transcript text
   * @param {object} context - Optional context (project name, date)
   * @returns {Promise<Object>} Structured daily log data
   */
  async parseTranscriptWithAI(transcript, context = {}) {
    if (!transcript || typeof transcript !== 'string') {
      console.error('[transcript-parser] No transcript provided or invalid type');
      return { error: 'No transcript provided' };
    }

    console.log('[transcript-parser] Starting parse, transcript length:', transcript.length);
    console.log('[transcript-parser] AI config - GROQ_API_KEY:', GROQ_API_KEY ? 'SET' : 'NOT SET');
    console.log('[transcript-parser] AI config - OPENAI_API_KEY:', OPENAI_API_KEY ? 'SET' : 'NOT SET');
    console.log('[transcript-parser] Using:', useGroqForParsing ? 'Groq' : (OPENAI_API_KEY ? 'OpenAI' : 'regex fallback'));

    // If no AI API key, fall back to regex parsing
    if (!PARSING_API_KEY) {
      console.log('[transcript-parser] WARNING: No AI API key configured, using regex parsing (limited accuracy)');
      const result = this.parseTranscript(transcript);
      console.log('[transcript-parser] Regex parse result - tasks:', result.tasks?.length || 0, 'weather:', result.weather ? 'found' : 'none');
      return result;
    }

    try {
      const systemPrompt = `You are a construction daily log transcription processor. Your ONLY job is to EXTRACT and ORGANIZE information from voice transcripts.

**CRITICAL: THIS IS A LEGAL DOCUMENT. YOU MUST NEVER INVENT, INFER, OR GUESS ANY INFORMATION.**

OUTPUT FORMAT: Valid JSON with these categories:
- tasks: [{company_name, workers (number), hours (number), task_description, notes}]
- visitors: [{time, visitor_name, company_name, notes}]
- equipment: [{equipment_type, quantity (number), hours (number), notes}]
- materials: [{material, quantity (number), unit, supplier, notes}]
- pending_issues: [{title, description, category, severity (low/medium/high/critical), assignee, location}]
- inspection_notes: [{inspector_name, ahj, inspection_type, result (pass/fail/partial/pending), notes, follow_up_needed (boolean)}]
- daily_totals: {total_workers (number), total_hours (number)}
- weather: {condition, temperature, precipitation}

═══════════════════════════════════════════════════════════════
ABSOLUTE RULE: ZERO HALLUCINATION
═══════════════════════════════════════════════════════════════

1. TASK DESCRIPTIONS - ONLY use exact words from the transcript:

   Example transcript: "DPR Concrete had 7 guys working 4 hours, stopped due to rain"
   ❌ HALLUCINATION: "Concrete foundation work" (NOT STATED)
   ❌ HALLUCINATION: "Concrete pouring" (NOT STATED)
   ✅ CORRECT: task_description = "" (empty - no work was described)
   ✅ CORRECT: notes = "Stopped due to rain"

   Example transcript: "Ulitzy Electric worked in the electrical room, 5 guys 8 hours"
   ❌ HALLUCINATION: "Electrical panel installation" (NOT STATED)
   ❌ HALLUCINATION: "Wiring and conduit work" (NOT STATED)
   ✅ CORRECT: task_description = "Work in electrical room"

   Example transcript: "A and B Landscaping planting shrubs and trees on northwest side"
   ✅ CORRECT: task_description = "Planting shrubs and trees on northwest side" (ACTUALLY STATED)

   **RULE: If the speaker did NOT describe what work was performed, leave task_description EMPTY.**
   **Do NOT guess based on company name. "Concrete company" does NOT mean "foundation work".**

2. NOTES FIELD - For additional context that WAS stated:
   - "Returning Saturday" (if stated)
   - "Stopped early due to weather" (if stated)
   - "Rework needed" (if stated)

3. ISSUE TITLES - Only create issues for problems EXPLICITLY mentioned:
   ❌ WRONG: Inventing issues not in transcript
   ✅ CORRECT: Only extract issues the speaker actually described

4. PRONOUNS - Replace with names from context:
   "They have to come back" → "[Company] returning [when]"

5. FILLER REMOVAL - Remove conversational language:
   Remove: "for the most part", "kind of", "basically", "so", "um", "we had", "they were"

6. NULL/EMPTY for missing data - NEVER invent:
   If information wasn't stated, use null or empty string.

═══════════════════════════════════════════════════════════════
CORRECT EXTRACTION EXAMPLES
═══════════════════════════════════════════════════════════════

INPUT: "DPR Concrete had 7 guys but only worked 4 hours because of rain. They have to come back Saturday."
OUTPUT task: { "company_name": "DPR Concrete", "workers": 7, "hours": 4, "task_description": "", "notes": "Stopped due to rain. Returning Saturday." }

INPUT: "Ulitzy Electric worked in the electrical room, 5 guys, 8 hours"
OUTPUT task: { "company_name": "Ulitzy Electric", "workers": 5, "hours": 8, "task_description": "Work in electrical room", "notes": "" }

INPUT: "A and B Landscaping planting shrubs and trees on the northwest side, 5 guys 8 hours"
OUTPUT task: { "company_name": "A and B Landscaping", "workers": 5, "hours": 8, "task_description": "Planting shrubs and trees on northwest side", "notes": "" }`;

      const userPrompt = `Parse this construction site daily log transcript:

${context.projectName ? `Project: ${context.projectName}` : ''}
${context.date ? `Date: ${context.date}` : ''}

TRANSCRIPT:
"""
${transcript}
"""

Return a JSON object with the structure described. Only include categories that have data.`;

      console.log(`[transcript-parser] Using AI parsing via ${useGroqForParsing ? 'Groq' : 'OpenAI'}`);

      const response = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PARSING_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[transcript-parser] AI API error:', response.status, errorText);
        console.log('[transcript-parser] Falling back to regex parsing due to API error');
        const result = this.parseTranscript(transcript);
        console.log('[transcript-parser] Regex fallback result - tasks:', result.tasks?.length || 0);
        return result;
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;

      if (!content) {
        console.error('[transcript-parser] No content in AI response');
        console.log('[transcript-parser] Falling back to regex parsing due to empty response');
        const result = this.parseTranscript(transcript);
        console.log('[transcript-parser] Regex fallback result - tasks:', result.tasks?.length || 0);
        return result;
      }

      const parsed = JSON.parse(content);
      console.log('[transcript-parser] AI parsing successful');
      console.log('[transcript-parser] AI extracted - tasks:', parsed.tasks?.length || 0, 'weather:', parsed.weather ? 'yes' : 'no');

      // Normalize the AI response to match expected structure
      const normalized = this.normalizeAIResponse(parsed, transcript);
      console.log('[transcript-parser] After normalization - tasks:', normalized.tasks?.length || 0, 'totals:', normalized.dailyTotals);
      return normalized;
    } catch (error) {
      console.error('[transcript-parser] AI parsing error:', error.message || error);
      console.log('[transcript-parser] Falling back to regex parsing due to exception');
      const result = this.parseTranscript(transcript);
      console.log('[transcript-parser] Regex fallback result - tasks:', result.tasks?.length || 0);
      return result;
    }
  }

  /**
   * Clean text by removing pronouns and conversational language
   * Makes notes professional and standalone
   */
  cleanText(text, contextName = null) {
    if (!text || typeof text !== 'string') return '';

    let cleaned = text.trim();

    // Remove filler words and conversational phrases
    cleaned = cleaned
      .replace(/^(so,?\s*|um,?\s*|uh,?\s*|well,?\s*|basically,?\s*|actually,?\s*|and then,?\s*)/gi, '')
      .replace(/,?\s*(um|uh|you know|basically|actually|kind of|sort of)\s*,?/gi, ' ')
      .replace(/\bfor the most part\b/gi, '')
      .replace(/\bas well as\b/gi, 'and')
      .replace(/\bgoing to be\b/gi, '')
      .replace(/\bthat was\b/gi, '')
      .replace(/\bwe had\b/gi, '')
      .replace(/\bthey were\b/gi, contextName ? `${contextName} was` : '')
      .trim();

    // Replace pronouns with context name if available
    if (contextName) {
      // Handle "their X" -> "CompanyName X" or "X workers" patterns
      cleaned = cleaned
        .replace(/\b(\d+)\s+of\s+their\s+(guys|workers|men|people)\b/gi, `$1 ${contextName} workers`)
        .replace(/\btwo\s+of\s+their\s+(guys|workers|men|people)\b/gi, `2 ${contextName} workers`)
        .replace(/\btheir\s+(guys|workers|men|people)\b/gi, `${contextName} workers`)
        .replace(/\btheir\b/gi, `${contextName}'s`)
        .replace(/\bthey\s+(had|have|were|are|will|would|should|could|did|do|need)\b/gi, `${contextName} $1`)
        .replace(/\bthey\b/gi, contextName)
        .replace(/\bthem\b/gi, contextName)
        .replace(/\bhis\b/gi, `${contextName}'s`)
        .replace(/\bher\b/gi, `${contextName}'s`)
        .replace(/\bhe\s+(was|is|had|has|will|would)\b/gi, `${contextName} $1`)
        .replace(/\bshe\s+(was|is|had|has|will|would)\b/gi, `${contextName} $1`);
    } else {
      // Remove pronouns when no context available
      cleaned = cleaned
        .replace(/\b(\d+)\s+of\s+their\s+(guys|workers|men|people)\b/gi, '$1 workers')
        .replace(/\btwo\s+of\s+their\s+(guys|workers|men|people)\b/gi, '2 workers')
        .replace(/\btheir\s+(guys|workers|men|people)\b/gi, 'workers')
        .replace(/\btheir\b/gi, 'the')
        .replace(/^they\s+(had|have|were|are|will|would|should|could|did|do)\s+to\s+/gi, '')
        .replace(/^they\s+(had|have|were|are|will|would|should|could|did|do)\s+/gi, '')
        .replace(/\bthey\b/gi, '')
        .replace(/\bthem\b/gi, '');
    }

    // Remove "we/our/us" references (internal team language)
    cleaned = cleaned
      .replace(/\bwe\s+(had|have|were|are|will|would|should|could|did|do)\s+/gi, '')
      .replace(/\bwe\s+/gi, '')
      .replace(/\bour\s+/gi, '')
      .replace(/\bus\b/gi, '');

    // Handle remaining "he/she" pronouns (often refers to inspector or supervisor)
    cleaned = cleaned
      .replace(/\band\s+he\s+said\s+(that\s+)?/gi, '. ')
      .replace(/\bhe\s+said\s+(that\s+)?/gi, '')
      .replace(/\bshe\s+said\s+(that\s+)?/gi, '')
      .replace(/\bhe\s+was\b/gi, 'was')
      .replace(/\bshe\s+was\b/gi, 'was')
      .replace(/\bhe\s+found\b/gi, 'Found')
      .replace(/\bshe\s+found\b/gi, 'Found')
      .replace(/\band\s+he\b/gi, '.')
      .replace(/\band\s+she\b/gi, '.');

    // Fix common grammar issues from pronoun removal
    cleaned = cleaned
      .replace(/\bcome\s+out\b/gi, 'came out')
      .replace(/\bwas\s+checking\b/gi, 'inspected')
      .replace(/\bwere\s+checking\b/gi, 'inspected');

    // Fix sentences that now start with lowercase or prepositions
    cleaned = cleaned
      .replace(/^\s*(the|on|in|at|for|to|with|from)\s+/i, (match) => match.trim() + ' ')
      .trim();

    // Remove leading articles/prepositions that make fragments
    if (/^(the|on|in|at)\s+\w+\s+(side|room|area|floor|level)/i.test(cleaned)) {
      // This is a location-only fragment, try to make it better
      cleaned = cleaned.replace(/^(the\s+)?/i, '');
    }

    // Clean up double spaces and punctuation
    cleaned = cleaned
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.])/g, '$1')
      .replace(/,\s*,/g, ',')
      .trim();

    // Capitalize first letter
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    // Remove trailing fragments
    cleaned = cleaned.replace(/\s+(and|or|the|a|an)\s*$/i, '');

    return cleaned;
  }

  /**
   * Format a task description to be professional
   * Ensures it describes WORK not just location
   */
  formatTaskDescription(description, companyName, location = null) {
    if (!description) return '';

    let formatted = this.cleanText(description, companyName);

    // Remove redundant action words that duplicate company trade
    const workType = this.inferWorkType(companyName);
    if (workType) {
      // Remove redundant "erecting steel" if company is steel, etc.
      formatted = formatted
        .replace(/\berecting\s+steel\b/gi, 'steel erection')
        .replace(/\binstalling\s+electrical\b/gi, 'electrical installation')
        .replace(/\bdoing\s+concrete\b/gi, 'concrete work')
        .replace(/\bbringing\s+in\s+soil\b/gi, 'soil delivery and placement');
    }

    // If description doesn't describe actual work, enhance it
    const timeOnly = /^(four|five|six|seven|eight|\d+)\s+hours?\s+(into|of)/i;
    if (timeOnly.test(formatted) && companyName) {
      const inferredWork = this.inferWorkType(companyName);
      if (inferredWork) {
        formatted = `${inferredWork} (partial day)`;
      }
    }

    // If description starts with a location, restructure it
    const locationStart = /^(on\s+)?(the\s+)?(north|south|east|west|northeast|northwest|southeast|southwest)?(west|east)?\s*(side|room|area|floor|level|exterior|interior)\s*(of\s+the\s+\w+)?\s*/i;
    const locationMatch = formatted.match(locationStart);
    if (locationMatch && companyName) {
      const inferredWork = this.inferWorkType(companyName);
      if (inferredWork) {
        // Get what comes after the location phrase
        const afterLocation = formatted.replace(locationStart, '').trim();
        // Build location string
        const direction = (locationMatch[3] || '') + (locationMatch[4] || '');
        const place = locationMatch[5] || '';
        const building = locationMatch[6] ? ' ' + locationMatch[6] : '';
        const locationStr = direction ? `${direction} ${place}${building}` : `${place}${building}`;

        // Combine work type with location and remaining description
        if (afterLocation && afterLocation.length > 3) {
          formatted = `${afterLocation} on ${locationStr}`.trim();
        } else {
          formatted = `${inferredWork} on ${locationStr}`.trim();
        }
      }
    }

    // Clean up double work type mentions
    if (workType) {
      const workLower = workType.toLowerCase();
      const regex = new RegExp(`${workLower}\\s+${workLower}`, 'gi');
      formatted = formatted.replace(regex, workType);
    }

    // Final cleanup
    formatted = formatted
      .replace(/\s+/g, ' ')
      .replace(/:\s*$/g, '')
      .trim();

    if (formatted.length > 0) {
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }

    return formatted;
  }

  /**
   * Infer work type from company name
   */
  inferWorkType(companyName) {
    if (!companyName) return null;
    const lower = companyName.toLowerCase();

    if (lower.includes('concrete')) return 'Concrete work';
    if (lower.includes('steel') || lower.includes('iron')) return 'Steel erection';
    if (lower.includes('electric')) return 'Electrical work';
    if (lower.includes('plumb')) return 'Plumbing work';
    if (lower.includes('hvac') || lower.includes('mechanical')) return 'HVAC installation';
    if (lower.includes('landscape') || lower.includes('landscaping')) return 'Landscaping';
    if (lower.includes('roof')) return 'Roofing work';
    if (lower.includes('drywall')) return 'Drywall installation';
    if (lower.includes('paint')) return 'Painting';
    if (lower.includes('glass') || lower.includes('glazing')) return 'Glazing work';
    if (lower.includes('fire') || lower.includes('sprinkler')) return 'Fire protection work';

    return null;
  }

  /**
   * Format inspection notes to be professional and concise
   */
  formatInspectionNotes(notes, inspectorName, inspectionType, relatedCompany = null) {
    if (!notes) return '';

    let formatted = notes.trim();

    // First, handle "so X of their guys" patterns before general cleaning
    formatted = formatted
      .replace(/\bso\s+(\d+|two|three|four|five)\s+of\s+their\s+(guys|workers|men)\s+were\s+supporting\s+(the\s+)?inspection/gi,
        (match, num, workers) => {
          const numVal = isNaN(num) ? { two: 2, three: 3, four: 4, five: 5 }[num.toLowerCase()] || num : num;
          const company = relatedCompany ? `${relatedCompany} ` : '';
          return `; ${numVal} ${company}workers provided support`;
        })
      .replace(/\bso\s+two\s+of\s+their\s+(guys|workers)\b/gi, relatedCompany ? `; 2 ${relatedCompany} workers` : '; 2 workers');

    // Clean with company context
    formatted = this.cleanText(formatted, relatedCompany);

    // Remove redundant inspector name mentions if already in inspector_name field
    if (inspectorName) {
      const escapedName = inspectorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      formatted = formatted
        .replace(new RegExp(`^${escapedName}\\s+(was\\s+)?inspecting\\s+`, 'i'), 'Inspected ')
        .replace(new RegExp(`${escapedName}\\s+inspecting\\s+`, 'gi'), 'Inspected ')
        .replace(new RegExp(`^${escapedName}\\s+`, 'i'), '');
    }

    // Clean up "inspecting X that Y was installing" patterns
    formatted = formatted
      .replace(/\bInspected\s+welds\s+that\s+(\w+)\s+(was\s+)?install(ing|ation)\b/gi, 'Weld inspection for $1 Steel')
      .replace(/\binspecting\s+welds\s+that\s+(\w+)\s+(was\s+)?install(ing|ation)\b/gi, 'Weld inspection for $1 Steel')
      .replace(/\bthat\s+(\w+)\s+(was\s+)?install(ing|ation)\b/gi, 'by $1')
      .replace(/\bwas\s+installing\b/gi, 'installation');

    // Remove "in the X room" redundancy when inspection type already says it
    if (inspectionType) {
      const typeLower = inspectionType.toLowerCase();
      if (typeLower === 'electrical') {
        formatted = formatted.replace(/\bin\s+the\s+electrical\s+room\s*/gi, '');
      }
    }

    // Clean up "were supporting the inspection"
    formatted = formatted
      .replace(/\bwere\s+supporting\s+(the\s+)?inspection\b/gi, 'provided inspection support');

    // Remove leading semicolons, clean up spacing and punctuation
    formatted = formatted
      .replace(/^[;\s]+/, '')
      .replace(/\s*;\s*/g, '; ')
      .replace(/\s+/g, ' ')
      .replace(/^;\s*/, '')
      .trim();

    // Capitalize first letter
    if (formatted.length > 0) {
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }

    return formatted;
  }

  /**
   * Normalize AI response to match expected daily log structure
   */
  normalizeAIResponse(parsed, rawTranscript) {
    const normalized = {
      weather: null,
      tasks: [],
      inspectionNotes: [],
      visitors: [],
      pendingIssues: [],
      equipment: [],
      materials: [],
      additionalWork: [],
      dailyTotals: { daily_totals_workers: 0, daily_totals_hours: 0 },
      rawTranscript: null // Don't store raw transcript in output
    };

    // Normalize tasks
    if (Array.isArray(parsed.tasks)) {
      normalized.tasks = parsed.tasks.map(t => {
        const companyName = t.company_name || t.companyName || '';
        const rawDescription = t.task_description || t.taskDescription || t.description || '';
        return {
          company_name: companyName,
          workers: this.parseNumber(String(t.workers || 0)),
          hours: this.parseNumber(String(t.hours || 0)),
          task_description: this.formatTaskDescription(rawDescription, companyName),
          notes: this.cleanText(t.notes || '', companyName)
        };
      }).filter(t => t.company_name || t.task_description);

      // Default hours to 8 if company and workers are specified but hours is missing
      // This is a safe assumption for a standard work day unless notes indicate otherwise
      for (const task of normalized.tasks) {
        if (task.company_name && task.workers > 0 && (!task.hours || task.hours === 0)) {
          task.hours = 8;
          console.log(`[transcript-parser] AI: Defaulting hours to 8 for ${task.company_name} (${task.workers} workers)`);
        }
      }
    }

    // Normalize visitors
    if (Array.isArray(parsed.visitors)) {
      normalized.visitors = parsed.visitors.map(v => ({
        time: v.time || '',
        visitor_name: v.visitor_name || v.visitorName || v.name || '',
        company_name: v.company_name || v.companyName || v.company || '',
        notes: this.cleanText(v.notes || '')
      })).filter(v => v.visitor_name || v.company_name);
    }

    // Normalize equipment
    if (Array.isArray(parsed.equipment)) {
      normalized.equipment = parsed.equipment.map(e => ({
        equipment_type: e.equipment_type || e.equipmentType || e.type || e.name || '',
        quantity: this.parseNumber(String(e.quantity || 1)),
        hours: this.parseNumber(String(e.hours || 0)),
        notes: this.cleanText(e.notes || '')
      })).filter(e => e.equipment_type);
    }

    // Normalize materials
    if (Array.isArray(parsed.materials)) {
      normalized.materials = parsed.materials.map(m => ({
        material: m.material || m.name || m.item || '',
        quantity: this.parseNumber(String(m.quantity || 0)),
        unit: m.unit || '',
        supplier: m.supplier || m.vendor || '',
        notes: this.cleanText(m.notes || '')
      })).filter(m => m.material);
    }

    // Normalize pending issues with deduplication
    if (Array.isArray(parsed.pending_issues)) {
      const seenIssues = new Map(); // Track unique issues by normalized title

      for (const i of parsed.pending_issues) {
        const assignee = i.assignee || '';
        const title = this.cleanText(i.title || i.name || 'Untitled Issue', assignee);
        const description = this.cleanText(i.description || '', assignee);
        const location = i.location || '';

        // Skip if no meaningful content
        if (!title && !description) continue;

        // Create a normalized key for deduplication (lowercase, trimmed)
        const titleKey = title.toLowerCase().trim();

        // Check if we've seen a similar issue
        if (seenIssues.has(titleKey)) {
          // If this one has more info (longer description or has location), use it instead
          const existing = seenIssues.get(titleKey);
          if (description.length > existing.description.length ||
              (location && !existing.location)) {
            seenIssues.set(titleKey, {
              title,
              description: description.length > existing.description.length ? description : existing.description,
              category: i.category || existing.category || 'Other',
              severity: this.normalizeSeverity(i.severity || existing.severity),
              assignee: assignee || existing.assignee,
              location: location || existing.location
            });
          }
        } else {
          seenIssues.set(titleKey, {
            title,
            description,
            category: i.category || 'Other',
            severity: this.normalizeSeverity(i.severity),
            assignee: assignee,
            location: location
          });
        }
      }

      normalized.pendingIssues = Array.from(seenIssues.values());
    }

    // Normalize inspection notes
    if (Array.isArray(parsed.inspection_notes)) {
      normalized.inspectionNotes = parsed.inspection_notes.map(n => {
        const inspectorName = n.inspector_name || n.inspectorName || n.inspector || '';
        const inspectionType = n.inspection_type || n.inspectionType || n.type || 'General';
        const relatedCompany = n.related_company || n.relatedCompany || n.company || null;
        return {
          inspector_name: inspectorName,
          ahj: n.ahj || n.authority || '',
          inspection_type: inspectionType,
          result: this.normalizeResult(n.result),
          notes: this.formatInspectionNotes(n.notes || '', inspectorName, inspectionType, relatedCompany),
          follow_up_needed: Boolean(n.follow_up_needed || n.followUpNeeded)
        };
      }).filter(n => n.inspector_name || n.inspection_type !== 'General');
    }

    // Normalize additional work
    if (Array.isArray(parsed.additional_work)) {
      normalized.additionalWork = parsed.additional_work.map(a => ({
        category: a.category || 'General',
        description: this.cleanText(a.description || '')
      })).filter(a => a.description);
    }

    // Normalize daily totals
    if (parsed.daily_totals) {
      normalized.dailyTotals = {
        daily_totals_workers: this.parseNumber(String(parsed.daily_totals.total_workers || 0)),
        daily_totals_hours: this.parseNumber(String(parsed.daily_totals.total_hours || 0))
      };
    }

    // Calculate totals from tasks if not provided
    if (normalized.dailyTotals.daily_totals_workers === 0 && normalized.tasks.length > 0) {
      normalized.dailyTotals = this.calculateTotals(normalized.tasks);
    }

    // Normalize weather - use field names that PDF generator expects
    if (parsed.weather) {
      normalized.weather = {
        condition: parsed.weather.condition || parsed.weather.sky_condition || null,
        temperature: parsed.weather.temperature || null,
        high: parsed.weather.high || parsed.weather.high_temp || null,
        low: parsed.weather.low || parsed.weather.low_temp || null,
        precipitation: parsed.weather.precipitation || null,
        wind: parsed.weather.wind || null,
        weather_delay: Boolean(parsed.weather.weather_delay || parsed.weather.delay),
        notes: parsed.weather.notes || null
      };
    }

    return normalized;
  }

  normalizeSeverity(severity) {
    if (!severity) return 'Medium';
    const s = severity.toLowerCase();
    if (['critical', 'high', 'medium', 'low'].includes(s)) {
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    return 'Medium';
  }

  normalizeResult(result) {
    if (!result) return 'Pending';
    const r = result.toLowerCase();
    if (r.includes('pass') || r.includes('approved')) return 'Passed';
    if (r.includes('fail') || r.includes('rejected')) return 'Failed';
    if (r.includes('partial')) return 'Partial';
    return 'Pending';
  }

  /**
   * Parse a transcript and extract structured daily log data (regex-based)
   * @param {string} transcript - The voice transcript text
   * @returns {Object} Structured daily log data
   */
  parseTranscript(transcript) {
    if (!transcript || typeof transcript !== 'string') {
      return { error: 'No transcript provided' };
    }

    // Extract tasks first as they provide context for issues
    const tasks = this.extractTasks(transcript);

    // Clean all task descriptions and notes using professional formatting
    const cleanedTasks = tasks.map(t => ({
      ...t,
      task_description: this.formatTaskDescription(t.task_description, t.company_name),
      notes: this.cleanText(t.notes, t.company_name)
    }));

    const inspections = this.extractInspections(transcript).map(i => ({
      ...i,
      notes: this.formatInspectionNotes(i.notes, i.inspector_name, i.inspection_type)
    }));

    const issues = this.extractIssues(transcript, tasks).map(i => ({
      ...i,
      title: this.cleanText(i.title, i.assignee),
      description: this.cleanText(i.description, i.assignee)
    }));

    const result = {
      weather: this.extractWeather(transcript),
      tasks: cleanedTasks,
      inspectionNotes: inspections,
      visitors: this.extractVisitors(transcript),
      pendingIssues: issues,
      dailyTotals: this.calculateTotals(tasks),
      rawTranscript: null // Don't include raw transcript
    };

    return result;
  }

  /**
   * Extract weather information
   */
  extractWeather(transcript) {
    const weather = {
      condition: null,
      temperature: null,
      high: null,
      low: null,
      precipitation: null,
      wind: null,
      weather_delay: false
    };

    const text = transcript.toLowerCase();

    // Extract sky condition
    for (const cond of TranscriptParserService.WEATHER_CONDITIONS) {
      if (text.includes(cond)) {
        weather.condition = cond.charAt(0).toUpperCase() + cond.slice(1);
        if (['rainy', 'rain', 'stormy', 'snow', 'snowy'].includes(cond)) {
          weather.precipitation = cond;
        }
        break;
      }
    }

    // Extract temperature (e.g., "50 degrees", "75°")
    const tempMatch = transcript.match(/(\d+)\s*(?:degrees?|°|fahrenheit|F\b)/i);
    if (tempMatch) {
      weather.temperature = parseInt(tempMatch[1]);
    }

    // Check for weather delay
    if (text.includes('stop working') || text.includes('stopped work') ||
        text.includes('weather delay') || text.includes('had to stop')) {
      weather.weather_delay = true;
    }

    // Extract wind info
    const windMatch = transcript.match(/wind[sy]?\s+(?:at\s+)?(\d+)\s*(?:mph|miles)/i);
    if (windMatch) {
      weather.wind = `${windMatch[1]} mph`;
    } else if (text.includes('windy')) {
      weather.wind = 'Windy';
    }

    return weather;
  }

  /**
   * Extract tasks/work performed
   */
  extractTasks(transcript) {
    const tasks = [];
    const foundCompanies = new Set();

    // Split by sentences
    const sentences = transcript.split(/[.!?]+/).filter(s => s.trim());

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const nextSentence = sentences[i + 1] || '';
      const combined = sentence + '. ' + nextSentence;

      // Look for various patterns:
      // "We have/had [Company] working..."
      // "Also have [Company] on site..."
      // "[Company] also on site..."
      // "[Company] was here..."
      const companyMatch = sentence.match(/(?:we (?:also )?(?:have|had)\s+|(?:also )?(?:have|had)\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)\s+(?:working|was working|were working|had to|on site|also on site|was here|were here)/i);

      if (companyMatch) {
        const companyName = this.cleanCompanyName(companyMatch[1]);
        if (companyName && !foundCompanies.has(companyName.toLowerCase()) &&
            this.looksLikeCompanyName(companyName)) {

          foundCompanies.add(companyName.toLowerCase());

          // Look for workers/hours in combined text using word-aware extraction
          const workInfo = this.extractWorkersHours(combined);

          // Extract task description
          const descMatch = sentence.match(/working\s+(?:on\s+)?(.+?)(?:\.|$)/i);
          const description = descMatch ? descMatch[1].trim() : '';

          tasks.push({
            company_name: companyName,
            workers: workInfo.workers,
            hours: workInfo.hours,
            task_description: description,
            notes: ''
          });
        }
      }
    }

    // Look for "They had X guys working Y hours" after company mentions and update zeros
    for (const task of tasks) {
      if (task.workers === 0 || task.hours === 0) {
        const companyIndex = transcript.toLowerCase().indexOf(task.company_name.toLowerCase());
        if (companyIndex !== -1) {
          const afterCompany = transcript.substring(companyIndex, companyIndex + 350);
          // Find "They had" sentence
          const theyMatch = afterCompany.match(/[Tt]hey\s+had\s+([^.]+)/);
          if (theyMatch) {
            const workInfo = this.extractWorkersHours(theyMatch[1]);
            if (task.workers === 0) task.workers = workInfo.workers;
            if (task.hours === 0) task.hours = workInfo.hours;
          }
        }
      }
    }

    // Default hours to 8 if company and workers are specified but hours is missing
    // This is a safe assumption for a standard work day unless notes indicate otherwise
    for (const task of tasks) {
      if (task.company_name && task.workers > 0 && (!task.hours || task.hours === 0)) {
        task.hours = 8;
        console.log(`[transcript-parser] Defaulting hours to 8 for ${task.company_name} (${task.workers} workers)`);
      }
    }

    return tasks;
  }

  /**
   * Extract inspection notes - only inspection-relevant information
   */
  extractInspections(transcript) {
    const inspections = [];
    const sentences = transcript.split(/[.!?]+/).map(s => s.trim()).filter(s => s);
    const processedInspectors = new Set();

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();

      // Skip if not inspection related
      if (!lowerSentence.includes('inspector') && !lowerSentence.includes('inspection') && !lowerSentence.includes('inspecting')) {
        continue;
      }

      // Extract inspector name if present
      const inspectorMatch = sentence.match(/(?:Special\s+)?Inspector\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      const inspectorName = inspectorMatch ? inspectorMatch[1].trim() : '';

      // Skip if we already processed this inspector
      if (inspectorName && processedInspectors.has(inspectorName.toLowerCase())) {
        continue;
      }
      if (inspectorName) {
        processedInspectors.add(inspectorName.toLowerCase());
      }

      // Determine inspection type
      let inspectionType = 'General';
      if (lowerSentence.includes('weld')) inspectionType = 'Welding';
      else if (lowerSentence.includes('electric')) inspectionType = 'Electrical';
      else if (lowerSentence.includes('plumb')) inspectionType = 'Plumbing';
      else if (lowerSentence.includes('fire')) inspectionType = 'Fire Safety';
      else if (lowerSentence.includes('structural')) inspectionType = 'Structural';
      else if (lowerSentence.includes('concrete')) inspectionType = 'Concrete';
      else if (lowerSentence.includes('hvac') || lowerSentence.includes('mechanical')) inspectionType = 'Mechanical';
      else if (lowerSentence.includes('roof')) inspectionType = 'Roofing';

      // Check for result
      let result = 'Pending';
      for (const res of TranscriptParserService.INSPECTION_RESULTS) {
        if (lowerSentence.includes(res)) {
          result = res.charAt(0).toUpperCase() + res.slice(1);
          break;
        }
      }

      // Build clean, relevant notes - just the inspection sentence
      let notes = sentence;

      // If inspector is named with context, build a clean note
      if (inspectorName && lowerSentence.includes('inspecting')) {
        // Extract what they were inspecting
        const inspectingMatch = sentence.match(/inspecting\s+([^.]+)/i);
        if (inspectingMatch) {
          notes = `${inspectorName} inspecting ${inspectingMatch[1].trim()}`;
        }
      } else {
        // Clean up generic inspection notes
        notes = sentence
          .replace(/^We\s+(?:also\s+)?had\s+/i, '')
          .replace(/^Also\s+had\s+/i, '')
          .replace(/^Had\s+/i, '');
        // Capitalize first letter
        notes = notes.charAt(0).toUpperCase() + notes.slice(1);
      }

      // Check follow-up needed
      const followUpNeeded = lowerSentence.includes('follow up') ||
                             lowerSentence.includes('return') ||
                             lowerSentence.includes('re-inspect') ||
                             result.toLowerCase() === 'failed';

      inspections.push({
        inspector_name: inspectorName,
        inspection_type: inspectionType,
        result,
        notes,
        follow_up_needed: followUpNeeded
      });
    }

    return inspections;
  }

  /**
   * Extract visitor information (excludes inspectors)
   */
  extractVisitors(transcript) {
    const visitors = [];
    const lowerTranscript = transcript.toLowerCase();

    // Get inspector names to exclude them from visitors
    const inspectorNames = new Set();
    const inspectorMatches = transcript.matchAll(/(?:Special\s+)?Inspector\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi);
    for (const match of inspectorMatches) {
      inspectorNames.add(match[1].toLowerCase());
    }

    // Look for explicit visitor patterns
    const visitorPattern = /(?:visitor|visited by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:from|of|with)\s+([A-Za-z\s]+?)(?:\s+on site|\s+visiting|\.|,)/gi;

    let match;
    while ((match = visitorPattern.exec(transcript)) !== null) {
      const visitorName = match[1].trim();
      // Skip if this person is an inspector
      if (inspectorNames.has(visitorName.toLowerCase())) {
        continue;
      }

      visitors.push({
        visitor_name: visitorName,
        company_name: match[2] ? match[2].trim() : '',
        time: '',
        notes: ''
      });
    }

    return visitors;
  }

  /**
   * Extract pending issues with full context
   */
  extractIssues(transcript, tasks = []) {
    const issues = [];
    const sentences = transcript.split(/[.!?]+/).map(s => s.trim()).filter(s => s);

    // Build context: track current company being discussed
    let currentCompany = null;
    const companyNames = tasks.map(t => t.company_name);

    // Weather context
    const weather = this.extractWeather(transcript);
    const weatherReason = weather.sky_condition ? `due to ${weather.sky_condition.toLowerCase()} weather` : '';

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const prevSentence = sentences[i - 1] || '';
      const nextSentence = sentences[i + 1] || '';
      const lowerSentence = sentence.toLowerCase();

      // Update current company context
      for (const company of companyNames) {
        if (sentence.toLowerCase().includes(company.toLowerCase())) {
          currentCompany = company;
          break;
        }
      }

      // Check for issue indicators
      const isStopWork = lowerSentence.includes('stop working') || lowerSentence.includes('had to stop');
      const isComeBack = lowerSentence.includes('come back') || lowerSentence.includes('return');
      const isOvertime = lowerSentence.includes('overtime');
      const isDelay = lowerSentence.includes('delay');
      const isProblem = lowerSentence.includes('problem') || lowerSentence.includes('issue');

      if (isStopWork || isComeBack || isOvertime || isDelay || isProblem) {
        // Resolve pronouns and build contextual description
        let description = sentence;
        let title = '';
        let affectedCompany = currentCompany;

        // Look for company in previous sentence if current has "they"
        if (lowerSentence.includes('they ') && !affectedCompany) {
          for (const company of companyNames) {
            if (prevSentence.toLowerCase().includes(company.toLowerCase())) {
              affectedCompany = company;
              break;
            }
          }
        }

        // Build clear description
        if (isStopWork) {
          title = affectedCompany ? `${affectedCompany} - Work Stoppage` : 'Work Stoppage';
          description = affectedCompany
            ? `${affectedCompany} had to stop working ${weatherReason}`.trim()
            : `Work stoppage ${weatherReason}`.trim();
          if (weather.weather_delay) {
            description += '. Weather delay recorded.';
          }
        } else if (isComeBack || isOvertime) {
          title = affectedCompany ? `${affectedCompany} - Overtime Required` : 'Overtime Required';
          // Replace "They" with company name
          description = sentence.replace(/^They\s+/i, affectedCompany ? `${affectedCompany} ` : 'The contractor ');
          if (weatherReason && isStopWork) {
            description = `${description} ${weatherReason}`.trim();
          }
        } else if (isDelay) {
          title = 'Schedule Delay';
          description = this.resolvePronouns(sentence, affectedCompany);
        } else {
          title = 'Issue Reported';
          description = this.resolvePronouns(sentence, affectedCompany);
        }

        // Determine severity
        let severity = 'Medium';
        if (lowerSentence.includes('critical') || lowerSentence.includes('urgent')) {
          severity = 'Critical';
        } else if (isOvertime || isComeBack) {
          severity = 'High';
        } else if (lowerSentence.includes('minor')) {
          severity = 'Low';
        }

        // Avoid duplicate issues - prefer more specific ones (with company name)
        const existingIndex = issues.findIndex(iss =>
          (iss.title.includes('Stoppage') && title.includes('Stoppage')) ||
          (iss.title.includes('Overtime') && title.includes('Overtime'))
        );

        // If we have a more specific version (with company), replace generic one
        if (existingIndex !== -1) {
          const existing = issues[existingIndex];
          // Keep the one with company name
          if (affectedCompany && !existing.assignee) {
            issues[existingIndex] = {
              title,
              description,
              category: this.categorizeIssue(sentence),
              severity,
              assignee: affectedCompany,
              location: this.extractLocation(sentence)
            };
          }
          // Skip if duplicate
        } else {
          issues.push({
            title,
            description,
            category: this.categorizeIssue(sentence),
            severity,
            assignee: affectedCompany || '',
            location: this.extractLocation(sentence)
          });
        }
      }
    }

    return issues;
  }

  /**
   * Resolve pronouns in a sentence
   */
  resolvePronouns(sentence, companyName) {
    if (!companyName) return sentence;
    return sentence
      .replace(/^They\s+/i, `${companyName} `)
      .replace(/\s+they\s+/gi, ` ${companyName} `)
      .replace(/^We\s+/i, 'The project team ')
      .replace(/\s+we\s+/gi, ' the project team ');
  }

  /**
   * Calculate daily totals from tasks
   */
  calculateTotals(tasks) {
    let totalWorkers = 0;
    let totalHours = 0;

    for (const task of tasks) {
      totalWorkers += task.workers || 0;
      totalHours += (task.workers || 0) * (task.hours || 0);
    }

    return {
      daily_totals_workers: totalWorkers,
      daily_totals_hours: totalHours
    };
  }

  // Helper methods

  /**
   * Parse a number from text (handles both digits and words)
   */
  parseNumber(text) {
    if (!text) return 0;
    const lower = text.toLowerCase().trim();

    // Check if it's a digit
    const digitMatch = lower.match(/\d+/);
    if (digitMatch) return parseInt(digitMatch[0]);

    // Check if it's a word number
    for (const [word, num] of Object.entries(TranscriptParserService.WORD_NUMBERS)) {
      if (lower.includes(word)) return num;
    }

    return 0;
  }

  /**
   * Extract workers and hours from text
   */
  extractWorkersHours(text) {
    const result = { workers: 0, hours: 0 };

    // Pattern: X guys/workers working Y hours
    // Handle both "5 guys" and "five guys"
    const numberWords = Object.keys(TranscriptParserService.WORD_NUMBERS).join('|');
    const numPattern = `(\\d+|${numberWords})`;

    // Workers pattern
    const workersRegex = new RegExp(`${numPattern}\\s*(?:guys?|workers?|men|people)`, 'i');
    const workersMatch = text.match(workersRegex);
    if (workersMatch) {
      result.workers = this.parseNumber(workersMatch[1]);
    }

    // Hours pattern
    const hoursRegex = new RegExp(`${numPattern}\\s*hours?`, 'i');
    const hoursMatch = text.match(hoursRegex);
    if (hoursMatch) {
      result.hours = this.parseNumber(hoursMatch[1]);
    }

    return result;
  }

  cleanCompanyName(name) {
    if (!name) return null;
    return name.trim()
      .replace(/^(we had|had)\s+/i, '')
      .replace(/\s+(was|were|had|working).*$/i, '')
      .trim();
  }

  looksLikeCompanyName(name) {
    if (!name || name.length < 2) return false;
    const lower = name.toLowerCase();

    // Check if contains company indicator
    for (const indicator of TranscriptParserService.COMPANY_INDICATORS) {
      if (lower.includes(indicator)) return true;
    }

    // Check if it's a proper noun (capitalized) and not a common word
    const commonWords = ['the', 'we', 'they', 'special', 'inspector', 'also', 'had', 'were', 'was'];
    return !commonWords.includes(lower) && /^[A-Z]/.test(name);
  }

  extractTaskDescription(transcript, companyName) {
    const pattern = new RegExp(
      `${companyName}[^.]*(?:working on|installing|erecting|doing|performing|completing)\\s+([^.]+)`,
      'i'
    );
    const match = transcript.match(pattern);
    return match ? match[1].trim() : '';
  }

  getContextAround(text, index, chars) {
    const start = Math.max(0, index - chars);
    const end = Math.min(text.length, index + chars);
    return text.substring(start, end);
  }

  categorizeIssue(text) {
    const lower = text.toLowerCase();
    if (lower.includes('weather') || lower.includes('rain') || lower.includes('wind')) return 'Weather';
    if (lower.includes('safety')) return 'Safety';
    if (lower.includes('quality') || lower.includes('defect')) return 'Quality';
    if (lower.includes('schedule') || lower.includes('delay')) return 'Schedule';
    if (lower.includes('material')) return 'Materials';
    return 'Other';
  }

  extractLocation(text) {
    const locationPatterns = [
      /(?:on the\s+)?(\w+\s+side)\s+of/i,
      /(?:in the\s+)?(\w+\s+room)/i,
      /(?:at the\s+)?(\w+\s+floor)/i,
      /(level\s+\d+)/i,
      /(basement|roof|exterior|interior)/i
    ];

    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return '';
  }

  /**
   * Parse an EVENT transcript using AI for intelligent extraction
   * Returns: title, event_type, severity, action_items, location, trade_vendor
   * @param {string} transcript - The voice transcript text
   * @param {object} context - Optional context (project name)
   * @returns {Promise<Object>} Structured event data
   */
  async parseEventWithAI(transcript, context = {}) {
    if (!transcript || typeof transcript !== 'string') {
      console.error('[event-parser] No transcript provided');
      return { error: 'No transcript provided' };
    }

    console.log('[event-parser] Starting AI parse, length:', transcript.length);

    // If no AI API key, return basic fallback
    if (!PARSING_API_KEY) {
      console.log('[event-parser] No AI key, using basic extraction');
      return this.parseEventBasic(transcript);
    }

    try {
      const systemPrompt = `You are a construction site event transcription processor. Your ONLY job is to EXTRACT and ORGANIZE information from voice transcripts.

**CRITICAL: THIS IS A LEGAL DOCUMENT. YOU MUST NEVER INVENT, INFER, OR GUESS ANY INFORMATION.**

OUTPUT FORMAT: Valid JSON with these fields:
{
  "title": "Brief title using ONLY words from the transcript (max 50 chars)",
  "event_type": "One of: Delay, Quality, Safety, Inspection, Material, Equipment, Coordination, Trade Damage, Productivity Gain, Milestone, Progress, Recognition, Other",
  "severity": "One of: Low, Medium, High",
  "action_items": ["Array of tasks ONLY if explicitly stated in transcript"],
  "location": "Location ONLY if stated in transcript",
  "trade_vendor": "Company/trade ONLY if mentioned in transcript",
  "duration": "Duration ONLY if stated in transcript",
  "summary": "Clean restatement using ONLY words/facts from the transcript"
}

═══════════════════════════════════════════════════════════════
ABSOLUTE RULE: ZERO HALLUCINATION
═══════════════════════════════════════════════════════════════

**THE SUMMARY MUST ONLY CONTAIN INFORMATION THAT WAS ACTUALLY STATED.**

Example transcript: "On the east side of the building, one of the metal panels was damaged. We need DPR Division 7 to come back and use paint to cover this up."

❌ HALLUCINATION summary: "Exterior metal panel on east elevation sustained impact damage during installation, requiring touch-up painting by DPR Division 7 subcontractor"
(WRONG: "impact damage during installation" was NOT stated)

✅ CORRECT summary: "Metal panel damaged on east side of building. DPR Division 7 to return and cover with paint."
(RIGHT: Only uses words/facts from the transcript)

═══════════════════════════════════════════════════════════════
TITLE RULES:
═══════════════════════════════════════════════════════════════
1. Use words from the transcript to describe what happened
2. Keep under 50 characters
3. Do NOT invent details

Example: "metal panel was damaged"
✅ GOOD: "Damaged metal panel - east side"
❌ BAD: "Impact damage to exterior cladding" (invented details)

═══════════════════════════════════════════════════════════════
ACTION ITEMS RULES:
═══════════════════════════════════════════════════════════════
1. ONLY include actions that were explicitly stated or clearly implied
2. Start with a verb (Contact, Notify, Schedule, etc.)
3. Maximum 3 items

Example: "need DPR Division 7 to come back and use paint to cover this up"
✅ GOOD: ["Contact DPR Division 7 to paint over damaged panel"]
❌ BAD: ["Document damage with photos", "File insurance claim"] (NOT stated)

═══════════════════════════════════════════════════════════════
OBSERVATION TYPE GUIDELINES:
═══════════════════════════════════════════════════════════════
ISSUES/PROBLEMS:
- Trade Damage: Use when damage is caused BY another trade, accidental collision, someone hit/broke something, pipe fell on something, damage during installation by others
- Quality: Use for workmanship defects, finish issues, NOT for damage caused by accidents
- Safety: Use for safety hazards, injuries, near-misses
- Delay: Use for schedule impacts, waiting on others
- Material: Use for material defects, shortages, wrong materials delivered
- Equipment: Use for equipment failures, breakdowns
- Coordination: Use for communication issues, scheduling conflicts between trades
- Inspection: Use for inspection-related events

POSITIVE OBSERVATIONS:
- Productivity Gain: Use for efficiency improvements, ahead of schedule work, faster than expected completion, productivity wins
- Milestone: Use for achievements, project milestones reached, significant completions
- Progress: Use for general progress updates, work completed, areas finished
- Recognition: Use for good work recognition, best practices observed, commendations, quality work by trades

═══════════════════════════════════════════════════════════════
SEVERITY GUIDELINES:
═══════════════════════════════════════════════════════════════
- High: Safety issues, work stoppages, significant delays, major damage
- Medium: Schedule impacts, coordination issues, quality concerns
- Low: Minor issues, cosmetic damage, FYI items`;

      const userPrompt = `Parse this construction site event recording:

${context.projectName ? `Project: ${context.projectName}` : ''}

TRANSCRIPT:
"""
${transcript}
"""

Return a JSON object with: title, event_type, severity, action_items, location, trade_vendor, duration, summary`;

      console.log('[event-parser] Calling AI...');

      const response = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PARSING_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[event-parser] AI API error:', response.status, errorText);
        return this.parseEventBasic(transcript);
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;

      if (!content) {
        console.error('[event-parser] No content in AI response');
        return this.parseEventBasic(transcript);
      }

      const parsed = JSON.parse(content);
      console.log('[event-parser] AI result:', {
        title: parsed.title,
        type: parsed.event_type,
        actions: parsed.action_items?.length || 0
      });

      // Normalize and validate the response
      return {
        title: parsed.title || 'Untitled Event',
        event_type: this.normalizeEventType(parsed.event_type),
        severity: this.normalizeSeverity(parsed.severity),
        action_items: this.normalizeActionItems(parsed.action_items),
        location: parsed.location || '',
        trade_vendor: parsed.trade_vendor || '',
        duration: parsed.duration || '',
        summary: parsed.summary || ''
      };

    } catch (error) {
      console.error('[event-parser] AI error:', error.message);
      return this.parseEventBasic(transcript);
    }
  }

  /**
   * Basic fallback event parsing without AI
   */
  parseEventBasic(transcript) {
    const firstSentence = transcript.match(/^[^.!?]+/)?.[0] || transcript.substring(0, 50);
    return {
      title: firstSentence.length > 50 ? firstSentence.substring(0, 47) + '...' : firstSentence,
      event_type: 'Other',
      severity: 'Medium',
      action_items: [],
      location: this.extractLocation(transcript),
      trade_vendor: '',
      duration: '',
      summary: transcript.substring(0, 200)
    };
  }

  normalizeEventType(type) {
    const valid = [
      // Issues/Problems
      'Delay', 'Quality', 'Safety', 'Inspection', 'Material', 'Equipment', 'Coordination', 'Trade Damage',
      // Positive Observations
      'Productivity Gain', 'Milestone', 'Progress', 'Recognition',
      // Generic
      'Other'
    ];
    if (!type) return 'Other';
    // Handle multi-word types specially
    const lowerType = type.toLowerCase();
    if (lowerType.includes('trade') && lowerType.includes('damage')) {
      return 'Trade Damage';
    }
    if (lowerType.includes('productivity') && lowerType.includes('gain')) {
      return 'Productivity Gain';
    }
    // Check for exact match (case-insensitive)
    const exactMatch = valid.find(v => v.toLowerCase() === lowerType);
    if (exactMatch) return exactMatch;
    // Try title case normalization for single words
    const normalized = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    return valid.includes(normalized) ? normalized : 'Other';
  }

  normalizeActionItems(items) {
    if (!Array.isArray(items)) return [];

    // Filter out fragments and duplicates
    const seen = new Set();
    return items
      .filter(item => {
        if (!item || typeof item !== 'string') return false;
        if (item.length < 10) return false;
        // Skip fragments
        if (/^(they|we|he|she|it)\s+(is|are|was|were)\s+/i.test(item)) return false;
        if (/^(aware|informed|notified)\s+(of|about)/i.test(item)) return false;

        const key = item.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3) // Max 3 action items
      .map(item => item.charAt(0).toUpperCase() + item.slice(1));
  }

  /**
   * Parse a Voice List transcript using AI for intelligent extraction
   * Supports Turkish, English, and Spanish
   * Handles section commands: "yeni bölüm", "new section", "nueva sección"
   * Returns: { sections: [...], items: [...] }
   * @param {string} transcript - The continuous voice transcript text
   * @param {object} context - Context including language ('en', 'tr', 'es'), projectName
   * @returns {Promise<Object>} Structured voice list data
   */
  async parseVoiceListWithAI(transcript, context = {}) {
    if (!transcript || typeof transcript !== 'string') {
      console.error('[voice-list-parser] No transcript provided');
      return { sections: [], items: [], error: 'No transcript provided' };
    }

    const language = context.language || 'en';
    console.log('[voice-list-parser] Starting AI parse, length:', transcript.length, 'language:', language);

    // If no AI API key, return basic fallback
    if (!PARSING_API_KEY) {
      console.log('[voice-list-parser] No AI key, using basic extraction');
      return this.parseVoiceListBasic(transcript, language);
    }

    try {
      const systemPrompt = this.getVoiceListSystemPrompt(language);
      const userPrompt = this.getVoiceListUserPrompt(transcript, context, language);

      console.log('[voice-list-parser] Calling AI via', useGroqForParsing ? 'Groq' : 'OpenAI');

      const response = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PARSING_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[voice-list-parser] AI API error:', response.status, errorText);
        return this.parseVoiceListBasic(transcript, language);
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;

      if (!content) {
        console.error('[voice-list-parser] No content in AI response');
        return this.parseVoiceListBasic(transcript, language);
      }

      const parsed = JSON.parse(content);
      console.log('[voice-list-parser] AI result:', {
        sections: parsed.sections?.length || 0,
        items: parsed.items?.length || 0
      });

      // Normalize and validate the response
      return this.normalizeVoiceListResponse(parsed);

    } catch (error) {
      console.error('[voice-list-parser] AI error:', error.message);
      return this.parseVoiceListBasic(transcript, language);
    }
  }

  /**
   * Get language-specific system prompt for voice list parsing
   */
  getVoiceListSystemPrompt(language) {
    const languageNames = {
      en: 'English',
      tr: 'Turkish',
      es: 'Spanish'
    };

    const sectionCommands = {
      en: '"new section [name]", "section [name]", "next section [name]"',
      tr: '"yeni bölüm [isim]", "bölüm [isim]", "sonraki bölüm [isim]"',
      es: '"nueva sección [nombre]", "sección [nombre]", "siguiente sección [nombre]"'
    };

    const unitMappings = {
      en: 'pieces/pcs → pcs, meters/m → m, feet/ft → ft, inches/in → in, yards → yd, rolls → roll, boxes → box, bags → bag, kg/kilograms → kg, lbs/pounds → lb',
      tr: 'adet/ad/tane → pcs, metre/m → m, parça → pcs, top/rulo → roll, kutu → box, torba/çuval → bag, kilo/kg → kg',
      es: 'piezas/pzs → pcs, metros/m → m, rollos → roll, cajas → box, bolsas → bag, kilos/kg → kg, libras/lbs → lb'
    };

    const exampleTranscript = {
      en: '2 rolls of black 2.5mm cable, 10 meters of red 6mm, new section breakers, 3 pieces 40 amp breakers',
      tr: '2.5 Siyah 10 metre, 6 Mavi 5 metre, yeni bölüm sigortalar, 3 adet 40 amper sigorta',
      es: '2.5 negro 10 metros, 6 azul 5 metros, nueva sección interruptores, 3 piezas interruptores de 40 amp'
    };

    return `You are a construction material list parser. Your job is to parse voice transcripts in ${languageNames[language]} into structured inventory items.

**INPUT**: Continuous voice recording of materials/items being listed
**OUTPUT**: JSON with sections and items arrays

═══════════════════════════════════════════════════════════════
SECTION DETECTION (${languageNames[language]}):
═══════════════════════════════════════════════════════════════
Detect section commands: ${sectionCommands[language]}

When a section command is detected:
1. Create a new section with the name following the command
2. Assign subsequent items to this section until the next section command

═══════════════════════════════════════════════════════════════
ITEM EXTRACTION RULES:
═══════════════════════════════════════════════════════════════
For each item spoken, extract:
1. raw_text: The exact words spoken (preserve original)
2. quantity: The number (if stated), otherwise null
3. unit: The unit of measurement (if stated), normalized: ${unitMappings[language]}
4. description: Clean description of the item
5. brand_name: Brand or manufacturer name if mentioned (e.g., "Schneider", "ABB", "Legrand", "Siemens")

IMPORTANT:
- If quantity is NOT explicitly stated, set quantity to null
- If unit is NOT explicitly stated, set unit to null
- If brand is NOT explicitly mentioned, set brand_name to null
- Always preserve the raw_text exactly as spoken
- Clean up filler words from description but keep technical terms
- Common electrical/construction brands: Schneider, ABB, Legrand, Siemens, Eaton, GE, Square D, Philips, Osram, etc.
- Do NOT extract or infer categories - users will add notes manually

═══════════════════════════════════════════════════════════════
EXAMPLE (${languageNames[language]}):
═══════════════════════════════════════════════════════════════
Input: "${exampleTranscript[language]}"

Output:
{
  "sections": [
    { "name": "${language === 'en' ? 'cables' : language === 'tr' ? 'kablolar' : 'cables'}", "order_index": 0, "created_via": "voice" },
    { "name": "${language === 'en' ? 'breakers' : language === 'tr' ? 'sigortalar' : 'interruptores'}", "order_index": 1, "created_via": "voice" }
  ],
  "items": [
    { "raw_text": "${language === 'en' ? '2 rolls of black 2.5mm cable' : language === 'tr' ? '2.5 Siyah 10 metre' : '2.5 negro 10 metros'}", "quantity": ${language === 'en' ? 2 : 10}, "unit": "${language === 'en' ? 'roll' : 'm'}", "description": "${language === 'en' ? 'Black 2.5mm cable' : language === 'tr' ? '2.5mm Siyah kablo' : 'Cable 2.5mm negro'}", "section_index": 0, "order_index": 0 },
    { "raw_text": "${language === 'en' ? '10 meters of red 6mm' : language === 'tr' ? '6 Mavi 5 metre' : '6 azul 5 metros'}", "quantity": ${language === 'en' ? 10 : 5}, "unit": "m", "description": "${language === 'en' ? 'Red 6mm cable' : language === 'tr' ? '6mm Mavi kablo' : 'Cable 6mm azul'}", "section_index": 0, "order_index": 1 },
    { "raw_text": "${language === 'en' ? '3 pieces 40 amp breakers' : language === 'tr' ? '3 adet 40 amper sigorta' : '3 piezas interruptores de 40 amp'}", "quantity": 3, "unit": "pcs", "description": "${language === 'en' ? '40 amp breaker' : language === 'tr' ? '40 amper sigorta' : 'Interruptor de 40 amp'}", "section_index": 1, "order_index": 0 }
  ]
}

═══════════════════════════════════════════════════════════════
SPECIAL COMMANDS TO DETECT:
═══════════════════════════════════════════════════════════════
${language === 'en' ? `
- "delete last" / "remove last" → Mark last item for deletion
- "save" / "done" → End of list marker
- "finish" / "stop" → End of recording marker
` : language === 'tr' ? `
- "son sil" / "sonuncuyu sil" → Mark last item for deletion
- "kaydet" / "tamam" → End of list marker
- "bitir" / "dur" → End of recording marker
` : `
- "eliminar último" / "borrar último" → Mark last item for deletion
- "guardar" / "listo" → End of list marker
- "terminar" / "parar" → End of recording marker
`}

If these commands are detected, include them in a separate "commands" array.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT:
═══════════════════════════════════════════════════════════════
{
  "sections": [
    { "name": "string", "order_index": number, "created_via": "voice" }
  ],
  "items": [
    {
      "raw_text": "string (exact spoken text)",
      "quantity": number | null,
      "unit": "string | null",
      "description": "string (cleaned description)",
      "brand_name": "string | null (brand/manufacturer if mentioned)",
      "section_index": number | null,
      "order_index": number
    }
  ],
  "commands": ["delete_last", "save", "finish"] // optional
}`;
  }

  /**
   * Get language-specific user prompt for voice list parsing
   */
  getVoiceListUserPrompt(transcript, context, language) {
    const labels = {
      en: { project: 'Project', listName: 'List Name', transcript: 'TRANSCRIPT' },
      tr: { project: 'Proje', listName: 'Liste Adı', transcript: 'TRANSKRİPT' },
      es: { project: 'Proyecto', listName: 'Nombre de lista', transcript: 'TRANSCRIPCIÓN' }
    };

    const label = labels[language] || labels.en;

    return `Parse this voice list recording:

${context.projectName ? `${label.project}: ${context.projectName}` : ''}
${context.listName ? `${label.listName}: ${context.listName}` : ''}

${label.transcript}:
"""
${transcript}
"""

Return a JSON object with sections and items arrays.`;
  }

  /**
   * Normalize voice list AI response
   */
  normalizeVoiceListResponse(parsed) {
    const result = {
      sections: [],
      items: [],
      commands: []
    };

    // Normalize sections
    if (Array.isArray(parsed.sections)) {
      result.sections = parsed.sections.map((s, index) => ({
        name: s.name || `Section ${index + 1}`,
        orderIndex: typeof s.order_index === 'number' ? s.order_index : index,
        createdVia: s.created_via || 'voice',
        description: s.description || null
      }));
    }

    // Normalize items
    if (Array.isArray(parsed.items)) {
      result.items = parsed.items.map((item, index) => ({
        rawText: item.raw_text || item.rawText || '',
        quantity: typeof item.quantity === 'number' ? item.quantity : null,
        unit: this.normalizeUnit(item.unit),
        description: item.description || item.raw_text || '',
        brandName: item.brand_name || item.brandName || null,
        sectionIndex: typeof item.section_index === 'number' ? item.section_index : null,
        orderIndex: typeof item.order_index === 'number' ? item.order_index : index,
        notes: item.notes || null,
        category: null // No longer extracted - users add notes manually
      })).filter(item => item.rawText || item.description);
    }

    // Normalize commands
    if (Array.isArray(parsed.commands)) {
      result.commands = parsed.commands.filter(cmd =>
        ['delete_last', 'save', 'finish'].includes(cmd)
      );
    }

    return result;
  }

  /**
   * Normalize unit to standard abbreviation
   */
  normalizeUnit(unit) {
    if (!unit) return null;

    const unitMap = {
      // Length
      'meters': 'm', 'meter': 'm', 'metre': 'm', 'metres': 'm', 'metro': 'm', 'metros': 'm',
      'feet': 'ft', 'foot': 'ft', 'ft': 'ft',
      'inches': 'in', 'inch': 'in', 'in': 'in',
      'yards': 'yd', 'yard': 'yd', 'yd': 'yd',
      // Quantity
      'pieces': 'pcs', 'piece': 'pcs', 'pcs': 'pcs', 'pc': 'pcs',
      'adet': 'pcs', 'ad': 'pcs', 'tane': 'pcs', 'parça': 'pcs',
      'piezas': 'pcs', 'pieza': 'pcs', 'pzs': 'pcs',
      // Rolls
      'rolls': 'roll', 'roll': 'roll', 'rulo': 'roll', 'top': 'roll', 'rollo': 'roll', 'rollos': 'roll',
      // Boxes
      'boxes': 'box', 'box': 'box', 'kutu': 'box', 'caja': 'box', 'cajas': 'box',
      // Bags
      'bags': 'bag', 'bag': 'bag', 'torba': 'bag', 'çuval': 'bag', 'bolsa': 'bag', 'bolsas': 'bag',
      // Weight
      'kilograms': 'kg', 'kilogram': 'kg', 'kg': 'kg', 'kilo': 'kg', 'kilos': 'kg',
      'pounds': 'lb', 'pound': 'lb', 'lbs': 'lb', 'lb': 'lb', 'libras': 'lb', 'libra': 'lb',
      // Other
      'sets': 'set', 'set': 'set', 'takım': 'set', 'juego': 'set', 'juegos': 'set',
      'pairs': 'pair', 'pair': 'pair', 'çift': 'pair', 'par': 'pair', 'pares': 'pair'
    };

    const lower = unit.toLowerCase().trim();
    return unitMap[lower] || unit;
  }

  /**
   * Basic fallback voice list parsing without AI
   */
  parseVoiceListBasic(transcript, language = 'en') {
    const result = {
      sections: [],
      items: [],
      commands: []
    };

    // Section command patterns by language
    const sectionPatterns = {
      en: /(?:new section|section|next section)[:\s]+([^,.]+)/gi,
      tr: /(?:yeni bölüm|bölüm|sonraki bölüm)[:\s]+([^,.]+)/gi,
      es: /(?:nueva sección|sección|siguiente sección)[:\s]+([^,.]+)/gi
    };

    const pattern = sectionPatterns[language] || sectionPatterns.en;

    // Find sections
    let match;
    let sectionIndex = 0;
    while ((match = pattern.exec(transcript)) !== null) {
      result.sections.push({
        name: match[1].trim(),
        orderIndex: sectionIndex++,
        createdVia: 'voice',
        description: null
      });
    }

    // Split transcript by common separators (comma, period, "and", etc.)
    const separators = {
      en: /[,.]|\band\b|\balso\b|\bnext\b/gi,
      tr: /[,.]|\bve\b|\bayrıca\b|\bsonra\b/gi,
      es: /[,.]|\by\b|\btambién\b|\bluego\b/gi
    };

    const sep = separators[language] || separators.en;
    const parts = transcript.split(sep).map(p => p.trim()).filter(p => p.length > 2);

    // Create items from parts (basic extraction)
    let itemIndex = 0;
    for (const part of parts) {
      // Skip section commands
      if (sectionPatterns[language].test(part)) continue;

      // Try to extract quantity (number at start or end)
      const qtyMatch = part.match(/^(\d+(?:\.\d+)?)\s+|(\d+(?:\.\d+)?)\s*$/);
      const quantity = qtyMatch ? parseFloat(qtyMatch[1] || qtyMatch[2]) : null;

      result.items.push({
        rawText: part,
        quantity,
        unit: null,
        description: part,
        sectionIndex: result.sections.length > 0 ? result.sections.length - 1 : null,
        orderIndex: itemIndex++,
        notes: null,
        category: null
      });
    }

    return result;
  }
}

module.exports = new TranscriptParserService();
