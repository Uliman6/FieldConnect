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
    const systemPrompt = `You are a construction site voice note processor. Your job is to extract and categorize information from voice recordings made by field workers.

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

RULES:
1. Extract distinct pieces of information from the transcript
2. Assign each piece to the MOST relevant category
3. A single transcript may have multiple items in different categories
4. Keep each extracted item concise (1-2 sentences max)
5. Preserve key details: names, numbers, locations, times
6. If something doesn't fit any category, skip it
7. Return empty array if no relevant content found

OUTPUT FORMAT (JSON array):
[
  {"category": "Category Name", "content": "Extracted information"},
  {"category": "Category Name", "content": "Extracted information"}
]`;

    const userPrompt = `Categorize this voice note from a construction site:

"${transcript}"

Return a JSON array of categorized items.`;

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

    // Validate and normalize categories
    return items
      .filter(item => item.category && item.content)
      .map(item => ({
        category: normalizeCategory(item.category),
        content: item.content.trim(),
      }))
      .filter(item => VOICE_DIARY_CATEGORIES.includes(item.category));

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

  // Safety keywords
  if (/safety|hazard|ppe|incident|injury|osha|fall|protection|unsafe/i.test(lower)) {
    results.push({ category: 'Safety', content: transcript });
  }

  // Issues keywords
  if (/issue|problem|delay|concern|broken|damaged|wrong|missing|blocked/i.test(lower)) {
    results.push({ category: 'Issues', content: transcript });
  }

  // Work completed
  if (/finished|completed|done|installed|poured|framed|painted/i.test(lower)) {
    results.push({ category: 'Work Completed', content: transcript });
  }

  // Materials
  if (/material|delivery|delivered|supply|order|concrete|lumber|steel/i.test(lower)) {
    results.push({ category: 'Materials', content: transcript });
  }

  // Team
  if (/crew|team|worker|subcontractor|visitor|meeting|personnel/i.test(lower)) {
    results.push({ category: 'Team', content: transcript });
  }

  // Default to Issues if nothing matched
  if (results.length === 0) {
    results.push({ category: 'Issues', content: transcript });
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

    const systemPrompt = `You are a construction site daily summary writer. Create a brief, professional summary of the day's activities based on categorized notes.

RULES:
1. Keep it concise - 2-4 sentences max
2. Highlight the most important items
3. Use professional construction language
4. Mention any safety concerns or issues prominently
5. Don't invent information not in the notes`;

    const userPrompt = `Create a daily summary from these categorized notes:

${Object.entries(grouped).map(([cat, items]) =>
  `${cat}:\n${items.map(i => `- ${i}`).join('\n')}`
).join('\n\n')}

Write a brief professional summary.`;

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
 * Build a basic summary without AI
 */
function buildBasicSummary(snippets) {
  const counts = {};
  snippets.forEach(s => {
    counts[s.category] = (counts[s.category] || 0) + 1;
  });

  const parts = Object.entries(counts)
    .map(([cat, count]) => `${count} ${cat.toLowerCase()} item${count > 1 ? 's' : ''}`)
    .join(', ');

  return `Today's notes include ${parts}.`;
}

/**
 * Check if transcript content matches any form templates
 * @param {Array} snippets - Categorized snippets
 * @param {Array} templates - Available form templates
 * @returns {Array<{formType: string, formName: string, reason: string}>}
 */
function matchFormTemplates(snippets, templates = []) {
  const suggestions = [];
  const allContent = snippets.map(s => s.content.toLowerCase()).join(' ');

  // Built-in form matching rules
  const formRules = [
    {
      formType: 'daily_log',
      formName: 'Daily Log',
      keywords: ['work completed', 'crew', 'workers', 'hours', 'installed', 'poured'],
      categories: ['Work Completed', 'Team'],
    },
    {
      formType: 'rfi',
      formName: 'Request for Information (RFI)',
      keywords: ['question', 'clarification', 'unclear', 'drawing', 'specification', 'confirm'],
      categories: ['Follow-up Items', 'Issues'],
    },
    {
      formType: 'safety_report',
      formName: 'Safety Incident Report',
      keywords: ['injury', 'accident', 'incident', 'near miss', 'unsafe', 'hazard'],
      categories: ['Safety'],
    },
    {
      formType: 'material_order',
      formName: 'Material Order',
      keywords: ['order', 'need more', 'running low', 'shortage', 'restock'],
      categories: ['Materials'],
    },
    {
      formType: 'punch_list',
      formName: 'Punch List',
      keywords: ['defect', 'touch up', 'fix', 'incomplete', 'punch'],
      categories: ['Issues', 'Follow-up Items'],
    },
  ];

  for (const rule of formRules) {
    // Check if any keywords match
    const keywordMatch = rule.keywords.some(kw => allContent.includes(kw));

    // Check if we have snippets in relevant categories
    const categoryMatch = rule.categories.some(cat =>
      snippets.some(s => s.category === cat)
    );

    if (keywordMatch || categoryMatch) {
      const matchedSnippets = snippets.filter(s =>
        rule.categories.includes(s.category) ||
        rule.keywords.some(kw => s.content.toLowerCase().includes(kw))
      );

      if (matchedSnippets.length > 0) {
        suggestions.push({
          formType: rule.formType,
          formName: rule.formName,
          reason: `Based on ${matchedSnippets.length} related note${matchedSnippets.length > 1 ? 's' : ''}`,
          snippetIds: [], // Will be populated by caller
        });
      }
    }
  }

  return suggestions;
}

module.exports = {
  categorizeTranscript,
  generateDailySummary,
  matchFormTemplates,
  VOICE_DIARY_CATEGORIES,
};
