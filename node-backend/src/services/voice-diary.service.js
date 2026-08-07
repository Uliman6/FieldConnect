/**
 * Voice Diary Service
 * Handles categorization, summarization, and form matching for voice notes
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// LEARNING: These are the categories defined in the product requirements
// They map to different aspects of construction daily work
const VOICE_DIARY_CATEGORIES = [
  'Safety',
  'Logistics',
  'Process',
  'Work Completed',
  'Work To Be Done',
  'Follow-up Items',
  'Issues',
  'Team',
  'Materials',
];

/**
 * Clean text to be professional and standalone (no pronouns, no filler words)
 * Adapted from FieldConnect's transcript-parser cleanText()
 */
function cleanTextProfessional(text) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text.trim();

  // Remove filler words and conversational phrases
  cleaned = cleaned
    .replace(/^(so,?\s*|um,?\s*|uh,?\s*|well,?\s*|basically,?\s*|actually,?\s*|and then,?\s*)/gi, '')
    .replace(/,?\s*(um|uh|you know|basically|actually|kind of|sort of|like)\s*,?/gi, ' ')
    .replace(/\bfor the most part\b/gi, '')
    .replace(/\bas well as\b/gi, 'and')
    .replace(/\bgoing to be\b/gi, '')
    .replace(/\bthat was\b/gi, '')
    .trim();

  // Remove "we/our/us" references (internal team language)
  cleaned = cleaned
    .replace(/\bwe\s+need\s+to\b/gi, '')
    .replace(/\bwe\s+have\s+to\b/gi, '')
    .replace(/\bwe\s+had\s+to\b/gi, '')
    .replace(/\bwe\s+(had|have|were|are|will|would|should|could|did|do)\s+/gi, '')
    .replace(/\bwe\s+/gi, '')
    .replace(/\bour\s+(own\s+)?/gi, '')
    .replace(/\bus\b/gi, '')
    .replace(/\bI\s+(had|have|need|will|would|should)\s+to\b/gi, '')
    .replace(/\bI\s+/gi, '');

  // Remove "they/their/them" references
  cleaned = cleaned
    .replace(/\bthey\s+(had|have|were|are|will|would|should|could|did|do|need)\s+to\b/gi, '')
    .replace(/\bthey\s+(had|have|were|are|will|would|should|could|did|do)\s+/gi, '')
    .replace(/\bthey\s+/gi, '')
    .replace(/\btheir\b/gi, 'the')
    .replace(/\bthem\b/gi, '');

  // Convert to action-oriented language
  cleaned = cleaned
    .replace(/\bneed\s+to\s+talk\s+to\b/gi, 'discuss with')
    .replace(/\bneed\s+to\s+check\s+(in\s+)?with\b/gi, 'follow up with')
    .replace(/\bhave\s+to\s+check\b/gi, 'verify')
    .replace(/\bneed\s+to\s+review\b/gi, 'review')
    .replace(/\bneed\s+to\s+/gi, '')
    .replace(/\bhave\s+to\s+/gi, '')
    .replace(/\bhad\s+to\s+/gi, '')
    .replace(/\bwant\s+to\s+/gi, '');

  // Fix "before then" and similar temporal phrases
  cleaned = cleaned
    .replace(/\bbefore\s+then,?\s*/gi, '')
    .replace(/\bafter\s+that,?\s*/gi, '')
    .replace(/\band\s+then\s+/gi, '')
    .replace(/\bso\s+then\s+/gi, '');

  // Clean up double spaces and punctuation
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/^\s*(and|or|but|so)\s+/i, '')
    .trim();

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Ensure ends with period
  if (cleaned && !/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }

  return cleaned;
}

/**
 * Categorize a voice note transcript into relevant categories
 * Returns snippets with their assigned categories
 * @param {string} transcript - The transcribed voice note text
 * @returns {Promise<Array<{category: string, content: string}>>}
 */
async function categorizeTranscript(transcript) {
  if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 10) {
    console.log('[voice-diary] Transcript too short to categorize');
    return [];
  }

  if (!OPENAI_API_KEY) {
    console.log('[voice-diary] No API key, using basic categorization');
    return basicCategorization(transcript);
  }

  try {
    const systemPrompt = `You are a construction site voice note processor. Your job is to DISSECT transcripts into individual, SHORT bullet points.

CRITICAL: EXTRACT SPECIFIC FACTS ONLY - DO NOT REPEAT THE WHOLE TRANSCRIPT

Each "content" field should be ONE SPECIFIC FACT (5-15 words max), NOT the entire transcript repeated.

CATEGORIES (use exactly these names):
- Safety: Safety concerns, hazards, PPE, incidents, near-misses
- Logistics: Deliveries, equipment moves, site access, staging
- Process: Work methods, procedures, sequencing, coordination
- Work Completed: Tasks finished today, areas completed
- Work To Be Done: Upcoming tasks, planned work
- Follow-up Items: Things to check on, pending decisions, callbacks
- Issues: Problems, delays, defects, concerns
- Team: Personnel, subcontractors, crew sizes, visitors
- Materials: Supplies, inventory, orders, shortages

SCOPE FIELD: Identify the trade/company for each item:
- Trades: Electrical, Plumbing, HVAC, Drywall, Concrete, Framing, Roofing, Painting, Flooring, Steel, Fire Protection
- Or use company name if mentioned (e.g., "ABC Electric", "Smith Plumbing")
- Or use: Site Work, Inspections, General, Coordination, Weather, Equipment

EXTRACTION RULES:
1. EACH item = ONE specific fact (5-15 words)
2. NEVER copy the whole transcript into content
3. SEPARATE different topics into different items
4. NO pronouns (we/our/they/their/I)
5. Professional third-person voice

CORRECT EXAMPLE:
Input: "So today electrical finished up on floor 3, we also had ABC Plumbing come out about that leak, need to follow up with them tomorrow. The concrete guys had 5 workers and got section B poured."

Output:
[
  {"category": "Work Completed", "scope": "Electrical", "content": "Floor 3 electrical completed."},
  {"category": "Work Completed", "scope": "Concrete", "content": "Section B concrete poured."},
  {"category": "Team", "scope": "Concrete", "content": "5 workers on site."},
  {"category": "Follow-up Items", "scope": "ABC Plumbing", "content": "Follow up about leak tomorrow."}
]

WRONG (DO NOT DO THIS):
[
  {"category": "Work Completed", "scope": "General", "content": "So today electrical finished up on floor 3, we also had ABC Plumbing come out about that leak, need to follow up with them tomorrow. The concrete guys had 5 workers and got section B poured."}
]

OUTPUT: JSON array with MULTIPLE SHORT items, NOT one item with the whole transcript.`;

    const userPrompt = `DISSECT this transcript into MULTIPLE SHORT items (5-15 words each). Do NOT return the whole transcript as one item.

Transcript: "${transcript}"

Return JSON array with SEPARATE short items for each fact mentioned. Each content field = ONE fact only.`;

    const response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      console.error('[voice-diary] OpenAI API error:', response.status);
      return basicCategorization(transcript);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[voice-diary] Could not parse JSON from response');
      return basicCategorization(transcript);
    }

    const items = JSON.parse(jsonMatch[0]);

    // Validate, normalize categories, include scope, and clean content
    return items
      .filter(item => item.category && item.content)
      .map(item => ({
        category: normalizeCategory(item.category),
        scope: item.scope || 'General',
        // Apply additional cleanup in case AI didn't fully follow instructions
        content: cleanTextProfessional(item.content),
      }))
      .filter(item => VOICE_DIARY_CATEGORIES.includes(item.category) && item.content.length > 5);

  } catch (error) {
    console.error('[voice-diary] Categorization error:', error);
    return basicCategorization(transcript);
  }
}

/**
 * Normalize category name to match our exact list
 */
function normalizeCategory(category) {
  const lower = category.toLowerCase().trim();

  // Direct matches
  const exact = VOICE_DIARY_CATEGORIES.find(c => c.toLowerCase() === lower);
  if (exact) return exact;

  // Fuzzy matches
  if (lower.includes('safety')) return 'Safety';
  if (lower.includes('logistics') || lower.includes('delivery') || lower.includes('staging')) return 'Logistics';
  if (lower.includes('process') || lower.includes('procedure')) return 'Process';
  if (lower.includes('completed') || lower.includes('done') || lower.includes('finished')) return 'Work Completed';
  if (lower.includes('to be done') || lower.includes('upcoming') || lower.includes('planned')) return 'Work To Be Done';
  if (lower.includes('follow') || lower.includes('pending')) return 'Follow-up Items';
  if (lower.includes('issue') || lower.includes('problem') || lower.includes('concern')) return 'Issues';
  if (lower.includes('team') || lower.includes('crew') || lower.includes('personnel')) return 'Team';
  if (lower.includes('material') || lower.includes('supply') || lower.includes('inventory')) return 'Materials';

  return 'Issues'; // Default fallback
}

/**
 * Basic keyword-based categorization fallback
 * Extracts RELEVANT SENTENCES only, not the whole transcript
 */
function basicCategorization(transcript) {
  const results = [];

  // Split transcript into sentences - handle periods, and also common topic separators
  const sentences = transcript
    // First handle period/question/exclamation
    .replace(/([.!?])\s+/g, '$1|')
    // Also split on "also", "and then", "then we" etc. (common in voice)
    .replace(/,?\s+(also|and then|then we|then they|we also|they also|additionally)\s+/gi, '.|')
    // Split on ", need to" / ", going to" (topic change)
    .replace(/,\s+(need to|going to|have to|should|will)\s+/gi, '.|$1 ')
    .split('|')
    .map(s => s.trim())
    .filter(s => s.length > 5);

  // Process each sentence individually
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const scope = detectScope(lower);
    const cleaned = cleanTextProfessional(sentence);

    // Skip if cleaned is too short
    if (cleaned.length < 10) continue;

    // Determine category for this sentence
    let category = null;

    // Safety keywords
    if (/safety|hazard|ppe|incident|injury|osha|fall|protection|unsafe/i.test(lower)) {
      category = 'Safety';
    }
    // Follow-up items (check before issues)
    else if (/follow.?up|check.?with|call|callback|need to talk|pending|waiting|get back/i.test(lower)) {
      category = 'Follow-up Items';
    }
    // Issues keywords
    else if (/issue|problem|delay|concern|broken|damaged|wrong|missing|blocked/i.test(lower)) {
      category = 'Issues';
    }
    // Work completed
    else if (/finished|completed|done|installed|poured|framed|painted|wrapped up/i.test(lower)) {
      category = 'Work Completed';
    }
    // Work to be done
    else if (/tomorrow|next week|upcoming|will be|going to|start|starting|scheduled/i.test(lower)) {
      category = 'Work To Be Done';
    }
    // Materials
    else if (/material|delivery|delivered|supply|order|concrete|lumber|steel|shipment/i.test(lower)) {
      category = 'Materials';
    }
    // Team - including worker count extraction
    else if (/crew|team|worker|subcontractor|visitor|meeting|personnel|guys|men|people/i.test(lower)) {
      category = 'Team';
      // Try to extract worker count
      const workerCount = extractWorkerCount(sentence);
      if (workerCount) {
        results.push({ category: 'Team', scope, content: `${workerCount} workers on site.` });
        continue;
      }
    }
    // Logistics
    else if (/delivery|staging|access|parking|equipment|crane|lift/i.test(lower)) {
      category = 'Logistics';
    }

    // Add result if category found
    if (category) {
      // Truncate to reasonable length
      const content = cleaned.length > 100 ? cleaned.substring(0, 97) + '...' : cleaned;
      results.push({ category, scope, content });
    }
  }

  // If nothing matched, create a single generic entry
  if (results.length === 0) {
    const firstSentence = sentences[0] || transcript;
    const cleaned = cleanTextProfessional(firstSentence);
    const content = cleaned.length > 100 ? cleaned.substring(0, 97) + '...' : cleaned;
    results.push({ category: 'Issues', scope: 'General', content });
  }

  return results;
}

/**
 * Detect scope/trade from transcript text
 */
function detectScope(lower) {
  // Check for specific trades
  if (/electrical|electric|wiring|panel|breaker/i.test(lower)) return 'Electrical';
  if (/plumbing|plumber|pipe|drain|water line/i.test(lower)) return 'Plumbing';
  if (/hvac|heating|cooling|air conditioning|ductwork/i.test(lower)) return 'HVAC';
  if (/concrete|cement|pour|slab|footing/i.test(lower)) return 'Concrete';
  if (/drywall|sheetrock|taping|mudding/i.test(lower)) return 'Drywall';
  if (/framing|frame|stud|joist/i.test(lower)) return 'Framing';
  if (/roof|roofing|shingle/i.test(lower)) return 'Roofing';
  if (/paint|painting|primer/i.test(lower)) return 'Painting';
  if (/floor|flooring|tile|carpet/i.test(lower)) return 'Flooring';
  if (/steel|iron|welding/i.test(lower)) return 'Steel';
  if (/masonry|brick|block/i.test(lower)) return 'Masonry';
  if (/inspection|inspector/i.test(lower)) return 'Inspections';
  if (/safety|hazard|ppe/i.test(lower)) return 'Safety';
  return 'General';
}

/**
 * Extract worker/personnel count from transcript
 */
function extractWorkerCount(transcript) {
  const lower = transcript.toLowerCase();

  // Number words to digits mapping
  const wordToNum = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'fifteen': 15, 'twenty': 20
  };

  // Look for patterns like "4 workers", "three guys", "crew of 5"
  const patterns = [
    /(\d+)\s*(?:workers?|guys?|men|people|personnel|crew members?)/i,
    /(?:crew of|team of|group of)\s*(\d+)/i,
    /(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s*(?:workers?|guys?|men|people|personnel|crew members?)/i,
    /(?:crew of|team of|group of)\s*(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)/i,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      const numStr = match[1];
      // Check if it's a word or digit
      const count = wordToNum[numStr] || parseInt(numStr, 10);
      if (count && !isNaN(count)) {
        return count;
      }
    }
  }

  return null;
}

/**
 * Generate a daily summary from categorized snippets
 * @param {Array} snippets - Array of {category, content} objects
 * @param {number} noteCount - Number of voice notes recorded
 * @returns {Promise<{summary: string, hasMinimumInfo: boolean}>}
 */
async function generateDailySummary(snippets, noteCount) {
  // Minimum threshold: at least 2 notes with 3+ snippets
  const hasMinimumInfo = noteCount >= 2 && snippets.length >= 3;

  if (!snippets || snippets.length === 0) {
    return {
      summary: 'No notes recorded yet.',
      hasMinimumInfo: false,
    };
  }

  if (!OPENAI_API_KEY) {
    return {
      summary: buildBasicSummary(snippets),
      hasMinimumInfo,
    };
  }

  try {
    // Group snippets by category
    const grouped = {};
    snippets.forEach(s => {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s.content);
    });

    const systemPrompt = `You are a construction daily summary writer. Create MINIMAL bullet points.

CRITICAL RULES:
1. Each bullet MUST be 4-8 words MAX - shorter is better
2. Start each with "• "
3. NO pronouns (we/our/they/their/I)
4. NO added context or interpretation - ONLY what was explicitly stated
5. Include: WHAT + WHERE or WHAT + WHO (company name if mentioned)
6. Output 3-5 bullets only - most important items
7. DO NOT add adjectives, reasons, or implications not stated

FORMAT: [Task/Item] - [Location/Company]

GOOD EXAMPLES:
• Electrical inspection passed - levels 2-3
• Grand stairs painting complete
• ABC Drywall - framing level 4
• Fire caulking needed - level 4 penetrations
• Follow up with Sprigg Electric

BAD EXAMPLES (NEVER DO):
• "enhancing the overall aesthetics" (ADDING INTERPRETATION)
• "completed today" (REDUNDANT - it's a daily log)
• "resulting in a passing grade" (TOO WORDY)
• "in the lobby area" when just "lobby" works (WORDY)`;

    const userPrompt = `Summarize these notes in 3-5 MINIMAL bullets (4-8 words each):

${Object.entries(grouped).map(([cat, items]) =>
  `${cat}:\n${items.map(i => `- ${i}`).join('\n')}`
).join('\n\n')}

REMEMBER: 4-8 words MAX per bullet. Include company names if mentioned. No interpretation.`;

    const response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      return { summary: buildBasicSummary(snippets), hasMinimumInfo };
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim() || buildBasicSummary(snippets);

    return { summary, hasMinimumInfo };

  } catch (error) {
    console.error('[voice-diary] Summary generation error:', error);
    return { summary: buildBasicSummary(snippets), hasMinimumInfo };
  }
}

/**
 * Build a basic summary without AI - returns clean bullet points
 */
function buildBasicSummary(snippets) {
  // Get unique snippets, prioritizing Safety and Issues
  const prioritized = [...snippets].sort((a, b) => {
    const priority = { 'Safety': 0, 'Issues': 1, 'Work Completed': 2, 'Follow-up Items': 3 };
    const aPriority = priority[a.category] ?? 10;
    const bPriority = priority[b.category] ?? 10;
    return aPriority - bPriority;
  });

  // Take up to 5 unique items and format as bullet points
  const seen = new Set();
  const bullets = [];
  for (const snippet of prioritized) {
    // Clean the content to remove pronouns
    const cleanedContent = cleanTextProfessional(snippet.content);
    const key = cleanedContent.substring(0, 50).toLowerCase();

    if (!seen.has(key) && bullets.length < 5 && cleanedContent.length > 5) {
      seen.add(key);
      // Truncate long content
      const content = cleanedContent.length > 100
        ? cleanedContent.substring(0, 97) + '...'
        : cleanedContent;
      bullets.push(`• ${content}`);
    }
  }

  return bullets.join('\n') || '• No notes recorded yet.';
}

/**
 * Check if transcript content matches any form templates
 * BE SELECTIVE - only suggest forms for actionable items that genuinely need documentation
 * @param {Array} snippets - Categorized snippets
 * @param {Array} templates - Available form templates
 * @returns {Array<{formType: string, formName: string, reason: string}>}
 */
function matchFormTemplates(snippets, templates = []) {
  const suggestions = [];
  const allContent = snippets.map(s => s.content.toLowerCase()).join(' ');

  // RFI: Only for ACTUAL questions needing clarification from architect/engineer
  // Must have explicit question markers or clarification requests
  const rfiKeywords = ['need clarification', 'unclear in drawing', 'confirm with architect',
    'question about', 'verify with engineer', 'specification unclear', 'missing detail',
    'drawing conflict', 'rfi needed', 'need answer'];
  const hasRfiNeed = rfiKeywords.some(kw => allContent.includes(kw));

  if (hasRfiNeed) {
    const matchedSnippets = snippets.filter(s =>
      rfiKeywords.some(kw => s.content.toLowerCase().includes(kw))
    );
    if (matchedSnippets.length > 0) {
      suggestions.push({
        formType: 'rfi',
        formName: 'Request for Information (RFI)',
        reason: 'Question requiring architect/engineer clarification',
        snippetIds: [],
      });
    }
  }

  // Safety Incident Report: Only for ACTUAL incidents, injuries, or serious hazards
  // NOT routine safety observations
  const incidentKeywords = ['injury', 'injured', 'accident', 'incident', 'near miss',
    'fell', 'cut', 'hurt', 'ambulance', 'hospital', 'first aid', 'osha'];
  const hasIncident = incidentKeywords.some(kw => allContent.includes(kw));

  if (hasIncident) {
    const matchedSnippets = snippets.filter(s =>
      s.category === 'Safety' && incidentKeywords.some(kw => s.content.toLowerCase().includes(kw))
    );
    if (matchedSnippets.length > 0) {
      suggestions.push({
        formType: 'safety_report',
        formName: 'Safety Incident Report',
        reason: 'Safety incident requiring documentation',
        snippetIds: [],
      });
    }
  }

  // Punch List: Only for DEFECTS or INCOMPLETE work near project completion
  // Must mention specific defects, not just general follow-ups
  const punchKeywords = ['defect', 'deficient', 'punch list', 'punchlist', 'touch up needed',
    'damaged', 'scratched', 'dented', 'chipped', 'incomplete finish', 'needs repair',
    'final walkthrough', 'substantial completion'];
  const hasPunchItem = punchKeywords.some(kw => allContent.includes(kw));

  if (hasPunchItem) {
    const matchedSnippets = snippets.filter(s =>
      punchKeywords.some(kw => s.content.toLowerCase().includes(kw))
    );
    if (matchedSnippets.length > 0) {
      suggestions.push({
        formType: 'punch_list',
        formName: 'Punch List',
        reason: 'Defect or incomplete work item',
        snippetIds: [],
      });
    }
  }

  // Material Order: Only when there's explicit shortage or order request
  const materialKeywords = ['running low', 'ran out', 'shortage', 'need to order',
    'order more', 'restock', 'back order', 'not enough'];
  const hasMaterialNeed = materialKeywords.some(kw => allContent.includes(kw));

  if (hasMaterialNeed) {
    const matchedSnippets = snippets.filter(s =>
      materialKeywords.some(kw => s.content.toLowerCase().includes(kw))
    );
    if (matchedSnippets.length > 0) {
      suggestions.push({
        formType: 'material_order',
        formName: 'Material Order',
        reason: 'Material shortage requiring order',
        snippetIds: [],
      });
    }
  }

  // NOTE: Daily Log is NOT suggested here - it's implicit that all notes go into daily logs
  // We only suggest forms for items that require ADDITIONAL documentation beyond the diary

  return suggestions;
}

/**
 * Generate an intelligent title and cleaned summary for a voice note
 * @param {string} transcript - Raw transcript text
 * @param {Array} snippets - Categorized snippets from this note
 * @returns {Promise<{title: string, cleanedTranscript: string}>}
 */
async function generateNoteTitle(transcript, snippets = []) {
  if (!transcript || transcript.trim().length < 5) {
    return { title: 'Voice Note', cleanedTranscript: transcript || '' };
  }

  // Fallback: generate title from snippets or transcript
  const fallbackTitle = generateFallbackTitle(transcript, snippets);
  const fallbackCleaned = cleanTextProfessional(transcript);

  if (!OPENAI_API_KEY) {
    return { title: fallbackTitle, cleanedTranscript: fallbackCleaned };
  }

  try {
    const systemPrompt = `You are a construction site note editor. Given a voice transcript, create:
1. A SHORT TITLE (2-5 words) - descriptive topic, NOT the first words of the transcript
2. A cleaned professional summary

TITLE RULES:
- 2-5 words maximum
- Describe the TOPIC, not the action ("Electrical Inspection" not "Had electrical inspection")
- Use noun phrases: "Panel Fire-Caulking Review", "Sprigg Electric Follow-up"
- NO pronouns, NO verbs like "had", "did", "checked"
- Include key entity names if mentioned (company names, locations, etc.)

GOOD TITLES:
- "Electrical Inspection Review"
- "Sprigg Electric Coordination"
- "Panel Fire-Caulking Follow-up"
- "Foundation Section B Pour"
- "Safety - Missing Guardrails"

BAD TITLES (don't do these):
- "We had electrical inspection" (starts with transcript, uses "we")
- "Checking the panels" (uses verb, too vague)
- "Work today" (too vague)
- "Meeting with the team" (too generic)

CLEANED SUMMARY RULES:
- Remove filler words and conversational language
- NO pronouns (we/they/our/their/I)
- Professional third-person or imperative voice
- Include all key details: names, locations, dates, quantities
- 1-3 clear sentences

OUTPUT FORMAT (JSON):
{"title": "Short Topic Title", "cleanedTranscript": "Professional summary without pronouns."}`;

    const userPrompt = `Voice note transcript:
"${transcript}"

${snippets.length > 0 ? `\nExtracted categories: ${snippets.map(s => s.category).join(', ')}` : ''}
${snippets.length > 0 ? `Key content: ${snippets.map(s => s.content).slice(0, 2).join('; ')}` : ''}

Return JSON with title (2-5 word topic) and cleanedTranscript (no pronouns).`;

    const response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      return { title: fallbackTitle, cleanedTranscript: fallbackCleaned };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { title: fallbackTitle, cleanedTranscript: fallbackCleaned };
    }

    const result = JSON.parse(jsonMatch[0]);
    return {
      title: result.title || fallbackTitle,
      // Apply cleanup to ensure no pronouns slip through
      cleanedTranscript: cleanTextProfessional(result.cleanedTranscript) || fallbackCleaned,
    };

  } catch (error) {
    console.error('[voice-diary] Title generation error:', error);
    return { title: fallbackTitle, cleanedTranscript: fallbackCleaned };
  }
}

/**
 * Generate a fallback title without AI - creates descriptive topic titles
 */
function generateFallbackTitle(transcript, snippets) {
  // Try to create a topic-based title from categories and key words
  if (snippets.length > 0) {
    const mainCategory = snippets[0].category;
    // Extract key nouns from content
    const content = snippets[0].content;
    const keyWords = extractKeyNouns(content);
    if (keyWords) {
      return `${mainCategory} - ${keyWords}`;
    }
    return mainCategory;
  }

  // Try to extract topic from transcript
  const topic = extractTopicFromTranscript(transcript);
  if (topic) return topic;

  return 'Voice Note';
}

/**
 * Extract key nouns/entities from text for title
 */
function extractKeyNouns(text) {
  if (!text) return null;

  // Look for company names (capitalized words)
  const companyMatch = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:Electric|Plumbing|Construction|Concrete|Steel|Framing)/i);
  if (companyMatch) return companyMatch[0];

  // Look for location/area references
  const locationMatch = text.match(/(?:Section|Floor|Unit|Area|Building|Room)\s+[A-Z0-9]+/i);
  if (locationMatch) return locationMatch[0];

  // Look for inspection/work type
  const typeMatch = text.match(/\b(electrical|plumbing|concrete|framing|roofing|HVAC|fire|safety)\s+(inspection|work|installation|pour|review)/i);
  if (typeMatch) return typeMatch[0];

  return null;
}

/**
 * Extract a topic title from raw transcript
 */
function extractTopicFromTranscript(transcript) {
  if (!transcript) return null;

  const lower = transcript.toLowerCase();

  // Inspection-related
  if (lower.includes('inspection')) {
    const typeMatch = transcript.match(/\b(electrical|plumbing|fire|safety|building|city)\s*inspection/i);
    if (typeMatch) return `${typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1)} Inspection`;
    return 'Site Inspection';
  }

  // Material/delivery related
  if (lower.includes('delivery') || lower.includes('material')) {
    const materialMatch = transcript.match(/\b(concrete|lumber|steel|framing|drywall)\s*(delivery|material)/i);
    if (materialMatch) return `${materialMatch[1].charAt(0).toUpperCase() + materialMatch[1].slice(1)} Delivery`;
    return 'Material Delivery';
  }

  // Safety related
  if (lower.includes('safety') || lower.includes('hazard') || lower.includes('guardrail')) {
    return 'Safety Issue';
  }

  // Coordination/meeting
  if (lower.includes('coordination') || lower.includes('meeting') || lower.includes('check in')) {
    const withMatch = transcript.match(/(?:with|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (withMatch) return `${withMatch[1]} Coordination`;
    return 'Team Coordination';
  }

  // Work completed
  if (lower.includes('finished') || lower.includes('completed') || lower.includes('done')) {
    return 'Work Completed';
  }

  return null;
}

// Tool Feedback Categories
const TOOL_FEEDBACK_CATEGORIES = [
  'Safety',
  'Productivity',
  'Comfort',
  'Reliability',
  'Feature Request',
  'Tip',
  // DPR Check-In categories
  'Training',
  'Incidents',
  'Tool Selection',
  'Accessories',
];

/**
 * Categorize tool feedback into relevant categories with sentiment
 * @param {string} transcript - The transcribed feedback
 * @param {string} toolBrand - The tool brand being reviewed
 * @returns {Promise<Array<{category: string, sentiment: string, content: string}>>}
 */
async function categorizeToolFeedback(transcript, toolBrand) {
  if (!transcript || transcript.trim().length < 10) {
    return [];
  }

  if (!OPENAI_API_KEY) {
    return basicToolFeedbackCategorization(transcript, toolBrand);
  }

  try {
    const systemPrompt = `You are a tool feedback analyzer for construction power tools. Your job is to extract feedback about ${toolBrand} power tools.

CONTEXT: The user was prompted to answer these questions while recording:
1. "Are you trained on this tool?"
2. "Any incidents from previous work?"
3. "Is this the correct tool for the job?"
4. "What accessories are needed?"
5. "Any incidents or issues today?"
6. "Lessons learned?"

CATEGORIES (use exactly these):
STANDARD FEEDBACK:
- Safety: Safety features, concerns, protective mechanisms, injury prevention
- Productivity: Speed, efficiency, time savings, workflow impact, job completion
- Comfort: Ergonomics, weight, grip, vibration, ease of use, fatigue
- Reliability: Durability, battery life, consistency, breakdowns, repairs needed
- Feature Request: Missing features, desired improvements, suggestions for the tool
- Tip: Best practices, usage tips, tricks, recommendations

DPR CHECK-IN (from the prompted questions):
- Training: Responses about being trained/not trained on the tool, comfort level with using it
- Incidents: Any incidents, accidents, close calls, or issues from previous or current work
- Tool Selection: Whether this was the correct/right tool for the job, tool choice feedback
- Accessories: Accessory needs, missing accessories, silica control, bits, blades, vacuum, etc.

IMPORTANT CATEGORIZATION RULES:
- "correct tool for the job" or "right tool" statements → Tool Selection (NOT Feature Request)
- Training/comfort level statements → Training
- Incident/accident reports → Incidents
- Accessory mentions → Accessories
- "Lessons learned" or advice → Tip
- Feature wishes/improvements → Feature Request

SENTIMENT:
- positive: Good experience, confirmation, what works well
- negative: Problems, complaints, issues, missing items
- neutral: Observations, facts without strong opinion

OUTPUT FORMAT (JSON array):
[
  {"category": "Category", "sentiment": "positive|negative|neutral", "content": "Concise feedback point."}
]

RULES:
1. Capture responses to ALL the prompted questions
2. "This was the correct tool" = Tool Selection (positive), NOT Feature Request
3. If no relevant feedback exists, return empty array: []
4. Keep content concise and professional
5. Remove filler words and conversational fluff`;

    const userPrompt = `Analyze this ${toolBrand} tool feedback recording. The user was answering questions about training, incidents, tool selection, accessories, and lessons learned.

Transcript: "${transcript}"

Extract and categorize all relevant feedback. Remember: "correct tool for the job" = Tool Selection category.`;

    const response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      return basicToolFeedbackCategorization(transcript, toolBrand);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return basicToolFeedbackCategorization(transcript, toolBrand);
    }

    const items = JSON.parse(jsonMatch[0]);

    return items
      .filter(item => item.category && item.content && item.sentiment)
      .map(item => ({
        category: normalizeToolCategory(item.category),
        sentiment: ['positive', 'negative', 'neutral'].includes(item.sentiment) ? item.sentiment : 'neutral',
        content: item.content.trim(),
      }))
      .filter(item => TOOL_FEEDBACK_CATEGORIES.includes(item.category));

  } catch (error) {
    console.error('[voice-diary] Tool feedback categorization error:', error);
    return basicToolFeedbackCategorization(transcript, toolBrand);
  }
}

function normalizeToolCategory(category) {
  const lower = category.toLowerCase().trim();

  // DPR Check-In categories (check these first)
  if (lower.includes('training') || lower.includes('trained')) return 'Training';
  if (lower.includes('incident') || lower.includes('accident') || lower.includes('close call')) return 'Incidents';
  if (lower.includes('tool selection') || lower.includes('correct tool') || lower.includes('right tool')) return 'Tool Selection';
  if (lower.includes('accessor')) return 'Accessories';

  // Standard categories
  if (lower.includes('safety')) return 'Safety';
  if (lower.includes('productivity') || lower.includes('efficiency') || lower.includes('speed')) return 'Productivity';
  if (lower.includes('comfort') || lower.includes('ergonomic')) return 'Comfort';
  if (lower.includes('reliab') || lower.includes('durability') || lower.includes('battery')) return 'Reliability';
  if (lower.includes('feature') || lower.includes('request') || lower.includes('wish') || lower.includes('improvement')) return 'Feature Request';
  if (lower.includes('tip') || lower.includes('recommend') || lower.includes('best practice') || lower.includes('lesson')) return 'Tip';

  return 'Productivity'; // Default
}

function basicToolFeedbackCategorization(transcript, toolBrand) {
  const lower = transcript.toLowerCase();
  const brandLower = toolBrand.toLowerCase();
  const results = [];

  // First, check if transcript is about tools at all
  // Must contain tool-related keywords OR the brand name
  const toolKeywords = [
    'tool', 'drill', 'saw', 'grinder', 'driver', 'impact', 'hammer', 'sander',
    'battery', 'charge', 'trigger', 'motor', 'torque', 'rpm', 'cordless',
    'dewalt', 'milwaukee', 'hilti', 'makita', 'brushless', 'chuck',
    'training', 'trained', 'incident', 'accident', 'injury', 'safety',
    'accessory', 'accessories', 'bit', 'blade', 'silica', 'vacuum',
    'lanyard', 'repair', 'broken', 'working', 'job', 'task'
  ];

  const hasToolContext = toolKeywords.some(kw => lower.includes(kw)) || lower.includes(brandLower);

  // If no tool context, return empty - this is likely irrelevant content
  if (!hasToolContext) {
    console.log(`[voice-diary] No tool context found in transcript, skipping: "${transcript.substring(0, 50)}..."`);
    return [];
  }

  // Transcript too short to be meaningful feedback
  if (transcript.trim().length < 15) {
    return [];
  }

  // Determine sentiment
  const positiveWords = ['great', 'love', 'excellent', 'good', 'best', 'awesome', 'reliable', 'fast', 'powerful', 'easy', 'comfortable', 'safe'];
  const negativeWords = ['bad', 'hate', 'terrible', 'slow', 'heavy', 'broke', 'broken', 'issue', 'problem', 'weak', 'frustrat', 'difficult', 'hard', 'dangerous'];

  const hasPositive = positiveWords.some(w => lower.includes(w));
  const hasNegative = negativeWords.some(w => lower.includes(w));
  const sentiment = hasNegative ? 'negative' : hasPositive ? 'positive' : 'neutral';

  // Categorize based on specific keywords
  let categorized = false;

  // Safety - training, incidents, protection
  if (/safety|safe|dangerous|injury|hurt|protect|incident|accident|training|trained/i.test(lower)) {
    results.push({ category: 'Safety', sentiment, content: transcript.trim() });
    categorized = true;
  }

  // Comfort - ergonomics, physical aspects
  if (/comfort|ergonomic|vibrat|fatigue|wrist|grip|balance|weight/i.test(lower)) {
    results.push({ category: 'Comfort', sentiment, content: transcript.trim() });
    categorized = true;
  }

  // Reliability - durability, battery, consistency
  if (/battery|reliable|reliab|broke|broken|last|durability|durable|consistent|repair|needs repair/i.test(lower)) {
    results.push({ category: 'Reliability', sentiment, content: transcript.trim() });
    categorized = true;
  }

  // Productivity - speed, efficiency
  if (/fast|slow|efficient|quick|productivity|speed|finish|complete|job done/i.test(lower)) {
    results.push({ category: 'Productivity', sentiment, content: transcript.trim() });
    categorized = true;
  }

  // Feature Request
  if (/wish|would be nice|should have|missing|feature|need|want|could use|improvement/i.test(lower)) {
    results.push({ category: 'Feature Request', sentiment, content: transcript.trim() });
    categorized = true;
  }

  // Tip - recommendations, lessons learned
  if (/tip|trick|recommend|lesson|learned|best way|try to|should try|works best|advice/i.test(lower)) {
    results.push({ category: 'Tip', sentiment, content: transcript.trim() });
    categorized = true;
  }

  // If tool context exists but no specific category matched,
  // only add as Productivity if it seems like actual feedback
  if (!categorized && hasToolContext) {
    // Check for feedback-like language
    const hasFeedbackLanguage = /it's|this|the tool|works|using|used|tried|tested|like|good|bad|okay|fine/i.test(lower);
    if (hasFeedbackLanguage) {
      results.push({ category: 'Productivity', sentiment, content: transcript.trim() });
    }
  }

  return results;
}

/**
 * Translate text between languages using AI
 * @param {string} text - Text to translate
 * @param {string} fromLang - Source language ('es' or 'en')
 * @param {string} toLang - Target language ('es' or 'en')
 * @returns {Promise<string>} Translated text
 */
async function translateText(text, fromLang = 'es', toLang = 'en') {
  if (!text || text.trim().length === 0) {
    return text;
  }

  if (!OPENAI_API_KEY) {
    console.warn('[voice-diary] No OpenAI API key for translation');
    return text;
  }

  const langNames = { es: 'Spanish', en: 'English' };
  const fromName = langNames[fromLang] || fromLang;
  const toName = langNames[toLang] || toLang;

  try {
    const systemPrompt = `You are a professional translator for construction site documentation. Translate the following text from ${fromName} to ${toName}.

RULES:
- Maintain the same tone and level of formality
- Keep technical construction terms accurate
- Preserve any measurements, numbers, dates, and proper nouns
- Keep the same paragraph structure
- Do NOT add explanations or notes, just provide the translation
- If the text is already in ${toName}, return it unchanged`;

    const response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        max_tokens: Math.max(500, text.length * 2),
      }),
    });

    if (!response.ok) {
      console.error('[voice-diary] Translation API error:', response.status);
      return text;
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim();

    if (!translatedText) {
      return text;
    }

    console.log(`[voice-diary] Translated ${text.length} chars from ${fromLang} to ${toLang}`);
    return translatedText;

  } catch (error) {
    console.error('[voice-diary] Translation error:', error);
    return text;
  }
}

module.exports = {
  categorizeTranscript,
  generateDailySummary,
  generateNoteTitle,
  matchFormTemplates,
  categorizeToolFeedback,
  translateText,
  VOICE_DIARY_CATEGORIES,
  TOOL_FEEDBACK_CATEGORIES,
};
