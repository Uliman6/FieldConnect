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
      const systemPrompt = `You are a construction daily log document writer. Convert casual voice transcriptions into professional construction documentation.

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
CRITICAL: PROFESSIONAL DOCUMENTATION STANDARDS
═══════════════════════════════════════════════════════════════

1. TASK DESCRIPTIONS - Must describe the WORK, not just location:
   ❌ BAD: "the northwest side of the building erecting steel"
   ❌ BAD: "four hours into their shift"
   ❌ BAD: "the electrical room for the most part"
   ✅ GOOD: "Steel beam and column erection on northwest building elevation"
   ✅ GOOD: "Concrete foundation work (stopped early due to weather)"
   ✅ GOOD: "Electrical panel installation and lighting control wiring"

2. ZERO PRONOUNS - Replace ALL pronouns with actual names:
   ❌ BAD: "their guys were supporting the inspection"
   ❌ BAD: "they had to come back"
   ❌ BAD: "two of their workers"
   ✅ GOOD: "2 EIG Electric workers supported inspection"
   ✅ GOOD: "DPR Concrete returning Saturday"
   ✅ GOOD: "SNS Steel crew installing welds"

3. INSPECTION NOTES - Concise, factual statements:
   ❌ BAD: "Jason Kim inspecting welds that SNS was installing"
   ❌ BAD: "so two of their guys were supporting the inspection"
   ✅ GOOD: "Weld inspection for SNS Steel installation"
   ✅ GOOD: "Electrical room inspection; 2 EIG Electric workers provided support"

4. ISSUE TITLES - Extract the ACTUAL PROBLEM, not location:
   The title should describe WHAT is wrong, not WHERE it is.
   ❌ BAD: "Female bathroom on level 1 has an issue"
   ❌ BAD: "Problem in the electrical room"
   ❌ BAD: "Third floor issue"
   ❌ BAD: "Door issue"
   ✅ GOOD: "Door not closing properly"
   ✅ GOOD: "Water leak at ceiling penetration"
   ✅ GOOD: "Missing fire caulking at pipe sleeves"
   ✅ GOOD: "HVAC duct damage from other trades"
   ✅ GOOD: "Incorrect outlet placement per plans"

   If a company is responsible, add prefix: "[Company] - [Problem]"
   ✅ GOOD: "DPR Concrete - Weather delay on foundation pour"
   ✅ GOOD: "EIG Electric - Rework needed for outlet spacing"

5. ISSUE DESCRIPTIONS - Professional, specific details:
   Include: what's wrong, impact, what needs to happen
   ❌ BAD: "They will have to come back Saturday for overtime"
   ❌ BAD: "There's an issue with the door"
   ✅ GOOD: "Door in female restroom (Level 1) not latching properly. Hardware adjustment required."
   ✅ GOOD: "DPR Concrete returning Saturday for overtime to complete foundation work due to weather delay"

6. ISSUE LOCATION - Always populate if mentioned:
   Extract the specific location to the 'location' field
   ✅ GOOD: "Level 1 - Female Restroom"
   ✅ GOOD: "Third Floor - Electrical Room"
   ✅ GOOD: "Northwest corner - Grid A-3"

7. REMOVE ALL FILLER LANGUAGE:
   Remove: "for the most part", "as well as", "kind of", "basically", "so", "um"
   Remove: "we had", "they were", "going to be"

8. COMPLETE SENTENCES OR PROPER PHRASES:
   Every description must make sense on its own without context.
   Start with the work activity, not location.

9. USE NULL for unknown values, never placeholder text.`;

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

    // Normalize pending issues
    if (Array.isArray(parsed.pending_issues)) {
      normalized.pendingIssues = parsed.pending_issues.map(i => {
        const assignee = i.assignee || '';
        return {
          title: this.cleanText(i.title || i.name || 'Untitled Issue', assignee),
          description: this.cleanText(i.description || '', assignee),
          category: i.category || 'Other',
          severity: this.normalizeSeverity(i.severity),
          assignee: assignee,
          location: i.location || ''
        };
      }).filter(i => i.title || i.description);
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
}

module.exports = new TranscriptParserService();
