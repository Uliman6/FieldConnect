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
    const systemPrompt = `You are a construction site voice note processor. Extract and categorize information from voice recordings into professional, standalone statements.

CATEGORIES (use exactly these names):
- Safety: Safety concerns, hazards, PPE, incidents, near-misses, OSHA
- Logistics: Deliveries, equipment moves, site access, parking, staging areas
- Process: Work methods, procedures, sequencing, coordination between trades
- Work Completed: Tasks finished today, areas completed, milestones reached
- Work To Be Done: Upcoming tasks, planned work, scheduled activities
- Follow-up Items: Things to check on, pending decisions, items needing response
- Issues: Problems, delays, defects, concerns, blockers
- Team: Personnel, subcontractors, crew sizes, visitors, meetings
- Materials: Supplies, inventory, orders, shortages, deliveries

CRITICAL RULES FOR CONTENT:
1. NEVER use "we", "our", "us", "they", "their", "I" - write in third person or imperative
2. Each item must be a STANDALONE professional statement that makes sense on its own
3. Include SPECIFIC context - names, locations, dates, quantities
4. Convert to action-oriented language: "Review panel naming" not "We need to review..."
5. Keep concise but complete (1 sentence with full context)

EXAMPLES:
- BAD: "We need to talk to Sprigg Electric about the inspection findings"
- GOOD: "Follow up with Sprigg Electric regarding electrical inspection findings."

- BAD: "We had electrical inspection today"
- GOOD: "Electrical inspection conducted today."

- BAD: "Before then, we have to walk internally and do our own due diligence checks"
- GOOD: "Internal walkthrough and due diligence verification required before proceeding."

- BAD: "We have to check in with the electrical inspector next week"
- GOOD: "Schedule follow-up with electrical inspector next week to verify all electrical room items."

OUTPUT FORMAT (JSON array):
[
  {"category": "Category Name", "content": "Professional standalone statement."},
  {"category": "Category Name", "content": "Professional standalone statement."}
]`;

    const userPrompt = `Extract and categorize this construction voice note into professional, standalone statements:

"${transcript}"

Return a JSON array. Remember: NO pronouns (we/they/I), include specific context, action-oriented language.`;

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

    // Validate, normalize categories, and clean content
    return items
      .filter(item => item.category && item.content)
      .map(item => ({
        category: normalizeCategory(item.category),
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
 */
function basicCategorization(transcript) {
  const lower = transcript.toLowerCase();
  const results = [];
  const cleaned = cleanTextProfessional(transcript);

  // Safety keywords
  if (/safety|hazard|ppe|incident|injury|osha|fall|protection|unsafe/i.test(lower)) {
    results.push({ category: 'Safety', content: cleaned });
  }

  // Issues keywords
  if (/issue|problem|delay|concern|broken|damaged|wrong|missing|blocked/i.test(lower)) {
    results.push({ category: 'Issues', content: cleaned });
  }

  // Work completed
  if (/finished|completed|done|installed|poured|framed|painted/i.test(lower)) {
    results.push({ category: 'Work Completed', content: cleaned });
  }

  // Materials
  if (/material|delivery|delivered|supply|order|concrete|lumber|steel/i.test(lower)) {
    results.push({ category: 'Materials', content: cleaned });
  }

  // Team
  if (/crew|team|worker|subcontractor|visitor|meeting|personnel/i.test(lower)) {
    results.push({ category: 'Team', content: cleaned });
  }

  // Default to Issues if nothing matched
  if (results.length === 0) {
    results.push({ category: 'Issues', content: cleaned });
  }

  return results;
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

    const systemPrompt = `You are a construction daily summary writer. Create ULTRA-SHORT bullet points.

CRITICAL RULES:
1. Each bullet MUST be 5-12 words MAX - no exceptions
2. Start each with "• "
3. NO pronouns (we/our/they/their/I) - use passive voice or subjects
4. Include key detail: what + where OR what + quantity
5. Output 3-5 bullets only - prioritize important items
6. Skip routine/redundant items

GOOD EXAMPLES (follow this length):
• Electrical inspection passed (levels 2-3)
• Grand stairs painting complete
• Fire caulking needed on level 4 penetrations
• Elevator shaft cleanup before next inspection
• Inspector return visit scheduled next week

BAD EXAMPLES (too long - never do this):
• Painting of the grand stairs in the lobby area completed today (TOO WORDY)
• Electrical inspection conducted today, resulting in a passing grade (TOO WORDY)
• We had an inspection and it went well (PRONOUNS + TOO VAGUE)`;

    const userPrompt = `Summarize these notes in 3-5 ULTRA-SHORT bullets (5-12 words each):

${Object.entries(grouped).map(([cat, items]) =>
  `${cat}:\n${items.map(i => `- ${i}`).join('\n')}`
).join('\n\n')}

REMEMBER: Each bullet 5-12 words MAX. No pronouns. Prioritize important items only.`;

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

module.exports = {
  categorizeTranscript,
  generateDailySummary,
  generateNoteTitle,
  matchFormTemplates,
  VOICE_DIARY_CATEGORIES,
};
