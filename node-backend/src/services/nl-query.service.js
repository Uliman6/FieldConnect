/**
 * Natural Language Query Service
 * Parses natural language queries into structured filters for insights search
 * Uses OpenAI for intent parsing
 */

const prisma = require('./prisma');
const insightsService = require('./insights.service');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

class NLQueryService {
  /**
   * Process a natural language query and return matching insights
   * @param {string} query - Natural language query (e.g., "items for next building inspection")
   * @param {Object} context - Additional context (projectId, userId, etc.)
   * @returns {Object} Parsed intent and matching results
   */
  async processQuery(query, context = {}) {
    const { projectId, includeTest = false } = context;

    // Parse the query using AI
    const parsed = await this.parseQueryWithAI(query);

    // Build filters from parsed intent
    const filters = this.buildFilters(parsed, { projectId, includeTest, originalQuery: query });

    // Execute the search (pass original query for semantic search)
    const results = await this.executeSearch(filters, parsed, query);

    return {
      originalQuery: query,
      parsed,
      filters,
      results,
      summary: this.generateSummary(parsed, results)
    };
  }

  /**
   * Parse natural language query using OpenAI
   */
  async parseQueryWithAI(query) {
    if (!OPENAI_API_KEY) {
      console.log('[nl-query] No OpenAI key, using basic parsing');
      return this.basicParse(query);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a construction project assistant that parses natural language queries into structured filters for searching construction insights/events.

Extract the following from the query:
- intent: The main action (list, find, search, summarize, export, count)
- category: Category of items (safety, quality, delay, rework, issue, observation, learning, cost_impact, all)
- sourceType: Source type (inspection_note, event, pending_issue, additional_work, manual, all) - use "inspection_note" when user mentions inspections
- timeFrame: Time reference (today, this_week, last_week, this_month, before_date, after_date, all)
- dateValue: Specific date if mentioned (ISO format)
- trades: Specific trades mentioned (electrician, plumber, HVAC, concrete, framing, etc.)
- systems: Building systems mentioned (HVAC, electrical, plumbing, fire_alarm, sprinkler, BMS, etc.)
- locations: Specific locations (floor numbers, grid references, areas)
- status: Item status (open, resolved, needs_follow_up, all) - "open" means NOT resolved, "resolved" means completed/closed
- keywords: Other important search terms
- outputFormat: Desired output (list, summary, report, checklist)

Return JSON only, no explanation.`
            },
            {
              role: 'user',
              content: query
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        console.error('[nl-query] OpenAI error:', response.status);
        return this.basicParse(query);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (content) {
        const parsed = JSON.parse(content);
        console.log('[nl-query] AI parsed:', parsed);
        return parsed;
      }
    } catch (error) {
      console.error('[nl-query] AI parsing failed:', error.message);
    }

    return this.basicParse(query);
  }

  /**
   * Basic keyword-based parsing fallback
   */
  basicParse(query) {
    const lower = query.toLowerCase();

    const parsed = {
      intent: 'list',
      category: 'all',
      sourceType: 'all',
      timeFrame: 'all',
      trades: [],
      systems: [],
      locations: [],
      status: 'all',
      keywords: [],
      outputFormat: 'list'
    };

    // Intent detection
    if (lower.includes('count') || lower.includes('how many')) parsed.intent = 'count';
    if (lower.includes('summarize') || lower.includes('summary')) parsed.intent = 'summarize';
    if (lower.includes('export') || lower.includes('print') || lower.includes('report')) parsed.outputFormat = 'report';

    // Source type detection (check before category)
    if (lower.includes('inspection')) parsed.sourceType = 'inspection_note';
    if (lower.includes('pending issue') || lower.includes('pending')) parsed.sourceType = 'pending_issue';

    // Category detection
    if (lower.includes('safety')) parsed.category = 'safety';
    if (lower.includes('quality')) parsed.category = 'quality';
    if (lower.includes('delay')) parsed.category = 'delay';
    if (lower.includes('rework')) parsed.category = 'rework';
    if (lower.includes('punch') || lower.includes('punchlist')) parsed.category = 'issue';
    if (lower.includes('observation')) parsed.category = 'observation';

    // Time detection
    if (lower.includes('today')) parsed.timeFrame = 'today';
    if (lower.includes('this week')) parsed.timeFrame = 'this_week';
    if (lower.includes('last week')) parsed.timeFrame = 'last_week';
    if (lower.includes('this month')) parsed.timeFrame = 'this_month';

    // Status detection
    if (lower.includes('open') || lower.includes('unresolved') || lower.includes('not resolved')) parsed.status = 'open';
    if (lower.includes('resolved') || lower.includes('closed') || lower.includes('completed')) parsed.status = 'resolved';
    if (lower.includes('follow up') || lower.includes('follow-up') || lower.includes('followup')) parsed.status = 'needs_follow_up';

    // Trade detection
    const trades = ['electrician', 'plumber', 'hvac', 'concrete', 'framing', 'drywall', 'painter', 'roofer', 'glass', 'glazing', 'mechanical'];
    trades.forEach(trade => {
      if (lower.includes(trade)) parsed.trades.push(trade);
    });

    // System detection
    const systems = ['hvac', 'electrical', 'plumbing', 'fire alarm', 'sprinkler', 'bms', 'elevator', 'curtain wall', 'mullion'];
    systems.forEach(system => {
      if (lower.includes(system)) parsed.systems.push(system);
    });

    return parsed;
  }

  /**
   * Build database filters from parsed query
   * NOTE: We intentionally do NOT filter by isTest - show all items and let UI handle filtering
   */
  buildFilters(parsed, context) {
    const filters = {};
    const { projectId, originalQuery } = context;

    if (projectId) filters.projectId = projectId;
    // NOTE: Removed isTest filter - it was hiding results unnecessarily

    // Source type filter (for inspection_note, pending_issue, etc.)
    // Only apply if explicitly requested (not inferred from keywords)
    if (parsed.sourceType && parsed.sourceType !== 'all' && parsed.sourceTypeExplicit) {
      filters.sourceType = parsed.sourceType;
    }

    // Category filter - only if explicitly set
    if (parsed.category && parsed.category !== 'all' && parsed.categoryExplicit) {
      const categoryMap = {
        safety: 'safety',
        quality: 'quality',
        delay: 'delay',
        rework: 'rework',
        issue: 'issue',
        observation: 'observation',
        learning: 'learning',
        cost_impact: 'cost_impact'
      };
      filters.category = categoryMap[parsed.category] || parsed.category;
    }

    // Status filter
    if (parsed.status === 'open') {
      filters.isResolved = false;
    } else if (parsed.status === 'resolved') {
      filters.isResolved = true;
    } else if (parsed.status === 'needs_follow_up') {
      filters.needsFollowUp = true;
    }

    // Time filter
    const now = new Date();
    if (parsed.timeFrame === 'today') {
      filters.startDate = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    } else if (parsed.timeFrame === 'this_week') {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      filters.startDate = weekStart.toISOString();
    } else if (parsed.timeFrame === 'last_week') {
      const lastWeekStart = new Date(now);
      lastWeekStart.setDate(now.getDate() - now.getDay() - 7);
      lastWeekStart.setHours(0, 0, 0, 0);
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
      lastWeekEnd.setHours(23, 59, 59, 999);
      filters.startDate = lastWeekStart.toISOString();
      filters.endDate = lastWeekEnd.toISOString();
    } else if (parsed.timeFrame === 'this_month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      filters.startDate = monthStart.toISOString();
    }

    // SIMPLIFIED: Always pass the original query for comprehensive text search
    // The search function now handles searching ALL fields including JSON arrays
    filters.query = originalQuery;

    console.log('[nl-query] Built filters:', JSON.stringify(filters, null, 2));
    return filters;
  }

  /**
   * Execute the search based on filters
   * Uses comprehensive text search that checks ALL fields
   */
  async executeSearch(filters, parsed, originalQuery) {
    console.log(`[nl-query] Executing search for: "${originalQuery}"`);

    // The search function now handles everything:
    // - Text search across title, description, rawText, keywordsSummary
    // - JSON array search across trades, systems, materials, locations
    // - Scoring and ranking by relevance
    const results = await insightsService.search({
      ...filters,
      limit: 100
    });

    console.log(`[nl-query] Search returned ${results.length} results`);
    return results;
  }

  /**
   * Generate a human-readable summary of results
   */
  generateSummary(parsed, results) {
    const count = results.length;

    if (count === 0) {
      return `No items found matching your query.`;
    }

    // Count by category
    const byCategory = {};
    const byStatus = { resolved: 0, unresolved: 0, needsFollowUp: 0 };
    const trades = new Set();
    const systems = new Set();

    results.forEach(r => {
      byCategory[r.category] = (byCategory[r.category] || 0) + 1;
      if (r.isResolved) byStatus.resolved++;
      else byStatus.unresolved++;
      if (r.needsFollowUp) byStatus.needsFollowUp++;
      (r.trades || []).forEach(t => trades.add(t));
      (r.systems || []).forEach(s => systems.add(s));
    });

    const parts = [`Found ${count} item${count === 1 ? '' : 's'}`];

    // Add category breakdown
    const categoryParts = Object.entries(byCategory)
      .map(([cat, num]) => `${num} ${cat}`)
      .join(', ');
    if (categoryParts) parts.push(`(${categoryParts})`);

    // Add status info
    if (byStatus.unresolved > 0) {
      parts.push(`${byStatus.unresolved} unresolved`);
    }
    if (byStatus.needsFollowUp > 0) {
      parts.push(`${byStatus.needsFollowUp} need follow-up`);
    }

    return parts.join('. ') + '.';
  }

  /**
   * Format results for export (checklist format)
   */
  formatAsChecklist(results, options = {}) {
    const { title = 'Inspection Checklist', groupBy = 'category' } = options;

    const lines = [];
    lines.push(`# ${title}`);
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push(`Total Items: ${results.length}`);
    lines.push('');

    // Group results
    const grouped = {};
    results.forEach(r => {
      const key = r[groupBy] || 'Other';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    });

    // Output grouped items
    Object.entries(grouped).forEach(([group, items]) => {
      lines.push(`## ${group.charAt(0).toUpperCase() + group.slice(1)} (${items.length})`);
      lines.push('');
      items.forEach(item => {
        const status = item.isResolved ? '[x]' : '[ ]';
        const followUp = item.needsFollowUp ? ' ⚠️' : '';
        lines.push(`${status} ${item.title}${followUp}`);
        if (item.description) {
          lines.push(`    ${item.description.substring(0, 100)}${item.description.length > 100 ? '...' : ''}`);
        }
        if (item.trades?.length) {
          lines.push(`    Trades: ${item.trades.join(', ')}`);
        }
        if (item.locations?.length) {
          lines.push(`    Location: ${item.locations.join(', ')}`);
        }
        lines.push('');
      });
    });

    return lines.join('\n');
  }
}

module.exports = new NLQueryService();
