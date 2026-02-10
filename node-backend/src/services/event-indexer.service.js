const prisma = require('./prisma');

/**
 * Event Indexer Service
 * Extracts searchable keywords from event transcripts for similarity matching and follow-up tracking
 */
class EventIndexerService {
  // Inspector/Official patterns
  static INSPECTOR_PATTERNS = [
    /(?:fire\s+marshal|inspector|building\s+official|code\s+official)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:with|from)\s+(?:the\s+)?(?:city|county|fire|building)/gi,
    /(?:special\s+inspector)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
  ];

  // Trade/vendor keywords
  static TRADE_KEYWORDS = [
    'electrician', 'electricians', 'electrical',
    'plumber', 'plumbers', 'plumbing',
    'hvac', 'mechanical',
    'concrete', 'mason', 'masonry',
    'steel', 'iron worker', 'ironworker',
    'painter', 'painters', 'painting',
    'landscaping', 'landscaper',
    'roofer', 'roofing',
    'drywall', 'framing', 'framer',
    'sprinkler', 'fire protection',
    'flooring', 'tile', 'carpet',
    'glazing', 'glazier', 'glass',
    'door', 'hardware',
    'bms', 'controls', 'automation',
    'smoke control',
    'elevator', 'escalator'
  ];

  // Company name patterns (common construction company suffixes)
  static COMPANY_PATTERNS = [
    /\b([A-Z][A-Za-z&]+(?:\s+[A-Z][A-Za-z&]+)*)\s+(?:concrete|steel|electric|electrical|plumbing|hvac|landscaping|roofing|construction|mechanical|sprinkler)\b/gi,
    /\b([A-Z]{2,})\s+(?:Electric|Concrete|Steel|Plumbing|HVAC|Landscaping|Sprinkler)\b/g,
  ];

  // Material/product patterns
  static MATERIAL_KEYWORDS = [
    'concrete', 'steel', 'metal panel', 'metal panels',
    'drywall', 'gypsum', 'insulation',
    'pipe', 'pipes', 'conduit',
    'wire', 'wiring', 'cable',
    'duct', 'ductwork',
    'sprinkler head', 'sprinkler pipe',
    'door', 'doors', 'hardware',
    'glass', 'glazing', 'window',
    'paint', 'coating', 'sealant',
    'soil', 'shrub', 'irrigation',
    'panel', 'panels',
    'riser', 'risers',
    'meter', 'meters'
  ];

  // Issue type indicators
  static ISSUE_INDICATORS = {
    cost_impact: ['cost', 'dollar', '$', 'additional work', 'extra', 'change order', 'rework'],
    code_violation: ['code', 'violation', 'not meeting code', 'failed', 'non-compliant', 'deficiency'],
    rework: ['rework', 'redo', 'fix', 'correct', 'chip down', 'sand down', 'replace'],
    delay: ['delay', 'behind', 'push back', 'reschedule', 'shut down', 'stop work'],
    follow_up: ['follow up', 'follow-up', 'return', 'come back', 'revisit', 'check on'],
    safety: ['safety', 'hazard', 'osha', 'injury', 'accident'],
    quality: ['quality', 'defect', 'damage', 'residue', 'not proper']
  };

  // Location patterns
  static LOCATION_PATTERNS = [
    /\b(?:on\s+)?(?:the\s+)?(north|south|east|west|northeast|northwest|southeast|southwest)\s+side\b/gi,
    /\b(?:level|floor)\s+(\d+|one|two|three|four|five)\b/gi,
    /\b(?:in\s+the\s+)?(\w+\s+(?:room|center|area|wing))\b/gi,
    /\b(basement|roof|exterior|interior|lobby|entrance|stair|stairwell)\b/gi,
    /\bstair\s+(\d+)\b/gi,
  ];

  // AHJ (Authority Having Jurisdiction) patterns
  static AHJ_PATTERNS = [
    /\b(santa\s+clara|san\s+jose|mountain\s+view|palo\s+alto|sunnyvale|cupertino|fremont|oakland|san\s+francisco)\s*(?:county|city|fire|building)?\b/gi,
    /\b(?:city|county)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
    /\bwith\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s+the\s+(?:building\s+)?inspector\b/gi,
  ];

  // System patterns
  static SYSTEM_KEYWORDS = [
    'bms', 'building management system',
    'hvac', 'air handling', 'ahu',
    'fire alarm', 'fire protection', 'sprinkler system',
    'smoke control', 'smoke detector',
    'electrical system', 'electrical panel',
    'plumbing system', 'water meter',
    'elevator', 'escalator',
    'lighting control', 'lighting',
    'security', 'access control',
    'egress', 'life safety'
  ];

  /**
   * Generate a smart, concise title from transcript text
   * Extracts the most meaningful 2-4 word phrase describing the event
   * @param {string} transcript - The transcript text
   * @returns {string} A short, insightful title
   */
  generateSmartTitle(transcript) {
    if (!transcript || !transcript.trim()) {
      return 'Untitled Event';
    }

    const text = transcript.trim();
    const lowerText = text.toLowerCase();

    // Priority 1: Domain-specific patterns for construction events

    // Fire marshal requests
    if (lowerText.includes('fire marshal') && (lowerText.includes('add') || lowerText.includes('request') || lowerText.includes('want'))) {
      const match = text.match(/(?:add|install|provide)\s+(?:an?\s+)?(?:additional\s+)?([a-z\s]{5,30}?)(?:\s+(?:in|to|for|that|which))/i);
      if (match) return this.formatTitle('Fire Marshal: ' + match[1].trim());
      // Try to extract what they want
      const wantMatch = text.match(/(?:want(?:ed|s)?|request(?:ed|s)?)\s+(?:us\s+to\s+)?(?:add\s+)?(.{5,40}?)(?:\s+in\s+|\s+to\s+|\s+that\s+|\.)/i);
      if (wantMatch) return this.formatTitle('Fire Marshal: ' + wantMatch[1].trim());
      // Check for smoke control specific
      if (lowerText.includes('smoke control')) {
        return this.formatTitle('Fire Marshal: Smoke Control');
      }
      return this.formatTitle('Fire Marshal Request');
    }

    // Building inspection issues
    if (lowerText.includes('inspector') && (lowerText.includes('called out') || lowerText.includes('failed'))) {
      const issueMatch = text.match(/(?:called\s+out|failed|deficient)[^.]*?(stair|door|egress|signage|riser|panel|code)/i);
      if (issueMatch) return this.formatTitle('Inspection Issue: ' + issueMatch[1]);
    }

    // Pressure/airflow issues
    if (lowerText.includes('pressure') && (lowerText.includes('door') || lowerText.includes('building'))) {
      return this.formatTitle('Building Pressure Issue');
    }

    // Residue/cleaning issues
    if (lowerText.includes('residue') && lowerText.includes('panel')) {
      return this.formatTitle('Panel Residue Issue');
    }
    if (lowerText.includes('residue') || lowerText.includes('cleaning')) {
      const surfaceMatch = text.match(/(metal\s+panel|wall|floor|ceiling|glass|window)s?\s+/i);
      if (surfaceMatch) return this.formatTitle(surfaceMatch[1] + ' Cleaning Issue');
    }

    // BMS/metering issues
    if (lowerText.includes('bms') || lowerText.includes('building management')) {
      if (lowerText.includes('meter') || lowerText.includes('metering')) {
        return this.formatTitle('BMS Metering Issue');
      }
      return this.formatTitle('BMS Issue');
    }

    // Shutdown/delay due to external events
    if (lowerText.includes('super bowl') || lowerText.includes('superbowl')) {
      return this.formatTitle('Super Bowl Shutdown');
    }
    if (lowerText.includes('shut down') || lowerText.includes('shutdown')) {
      const reasonMatch = text.match(/shut\s*down\s+(?:all\s+)?(\w+(?:\s+\w+)?)/i);
      if (reasonMatch) return this.formatTitle(reasonMatch[1] + ' Shutdown');
    }

    // Stair/code issues
    if (lowerText.includes('stair') && (lowerText.includes('riser') || lowerText.includes('landing') || lowerText.includes('code'))) {
      return this.formatTitle('Stair Code Issue');
    }

    // Cost impact events
    if (lowerText.includes('cost impact') || (lowerText.includes('$') && lowerText.includes('additional'))) {
      const amountMatch = text.match(/\$\s*(\d+(?:,\d+)?(?:\s*-\s*\d+)?)\s*k?/i);
      if (amountMatch) return this.formatTitle('Cost Impact: $' + amountMatch[1]);
    }

    // Priority 2: Pattern-based extraction
    const titlePatterns = [
      // Fire marshal / inspector callouts
      /(?:fire\s+marshal|inspector|building\s+official)\s+(?:\w+\s+)?(?:called\s+out|requested|wants|wanted)\s+(?:that\s+)?(?:we\s+)?(?:add\s+)?(.{10,60}?)(?:\.|,|which|this|so)/i,
      // Discovery patterns
      /(?:we\s+)?(?:just\s+)?discovered\s+(?:that\s+)?(.{10,50}?)(?:\.|,|which|this)/i,
      // Problem patterns - doors not closing, etc
      /(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:doors?|panels?|units?)\s+(?:are|is)?\s*(?:not\s+)?(\w+ing)/i,
    ];

    for (const pattern of titlePatterns) {
      const match = text.match(pattern);
      if (match) {
        let title = (match[1] || match[0]).trim();
        title = title.replace(/^(that|the|we|our|a|an)\s+/i, '');
        title = title.replace(/[.,;:!?]+$/, '');
        if (title.length >= 8 && title.length <= 50) {
          return this.formatTitle(title);
        }
      }
    }

    // Priority 3: Extract subject + issue from sentence structure
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

    for (const sentence of sentences) {
      // Look for "X left/caused/created Y" patterns
      const causeMatch = sentence.match(/(\w+(?:\s+\w+)?)\s+(?:left|caused|created)\s+(?:a\s+)?(\w+(?:\s+\w+)?)/i);
      if (causeMatch && causeMatch[2]) {
        return this.formatTitle(causeMatch[1] + ' ' + causeMatch[2]);
      }

      // Look for "X is/was/are not Y" problem patterns
      const problemMatch = sentence.match(/(\w+(?:\s+\w+){0,2})\s+(?:is|are|was|were)\s+not\s+(\w+)/i);
      if (problemMatch) {
        return this.formatTitle(problemMatch[1] + ' Not ' + problemMatch[2]);
      }
    }

    // Priority 4: Key phrase extraction
    const keyPhrases = [];

    // Trade + action
    const tradeMatch = text.match(/(electrician|plumber|painter|concrete|steel|hvac|sprinkler|landscaping)s?\s+(?:\w+\s+){0,2}(\w+ed|\w+ing)/i);
    if (tradeMatch) keyPhrases.push(tradeMatch[0]);

    // System issues
    const systemMatch = text.match(/(\w+(?:\s+\w+)?)\s+(?:system|panel|unit|control)s?\s+(?:\w+\s+){0,2}(?:issue|problem|not|failed)/i);
    if (systemMatch) keyPhrases.push(systemMatch[0]);

    if (keyPhrases.length > 0) {
      return this.formatTitle(keyPhrases[0]);
    }

    // Priority 5: Smart first-sentence extraction
    if (sentences.length > 0) {
      let firstSentence = sentences[0].trim();

      // Remove leading location/time phrases
      firstSentence = firstSentence
        .replace(/^(on\s+level\s+\w+|today|yesterday|this\s+\w+|we\s+had|we\s+just)[,\s]+/gi, '')
        .replace(/^(the|we|our)\s+/gi, '')
        .trim();

      // Get key nouns/verbs (skip common words)
      const skipWords = new Set(['the', 'a', 'an', 'that', 'this', 'which', 'was', 'were', 'is', 'are', 'had', 'have', 'been', 'being', 'would', 'could', 'should', 'will', 'even', 'after', 'throughout', 'very', 'close', 'from', 'with', 'they', 'their', 'there']);
      const words = firstSentence.split(/\s+/).filter(w => w.length > 2 && !skipWords.has(w.toLowerCase()));

      if (words.length >= 2) {
        const title = words.slice(0, 4).join(' ');
        if (title.length >= 8 && title.length <= 45) {
          return this.formatTitle(title);
        }
      }
    }

    // Final fallback
    return 'Untitled Event';
  }

  /**
   * Format a title string - capitalize appropriately, clean up
   */
  formatTitle(title) {
    if (!title) return 'Untitled Event';

    // Clean up
    let cleaned = title.trim()
      .replace(/\s+/g, ' ')
      .replace(/[.,;:!?]+$/, '');

    // Acronyms to preserve uppercase
    const acronyms = ['bms', 'hvac', 'ahu', 'ahj', 'mep', 'rfi', 'oco', 'pco'];

    // Capitalize first letter of each significant word
    const smallWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'of', 'in'];
    const words = cleaned.split(' ');
    const formatted = words.map((word, i) => {
      const lowerWord = word.toLowerCase();
      // Check if it's an acronym
      if (acronyms.includes(lowerWord)) {
        return word.toUpperCase();
      }
      // Small words (except first word)
      if (i > 0 && smallWords.includes(lowerWord)) {
        return lowerWord;
      }
      // Title case
      return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
    }).join(' ');

    return formatted.length > 50 ? formatted.substring(0, 47) + '...' : formatted;
  }

  /**
   * Index an event - extract keywords and create/update EventIndex
   * @param {string} eventId - The event ID to index
   * @returns {Object} The created/updated EventIndex
   */
  async indexEvent(eventId) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { project: true }
    });

    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    const text = `${event.transcriptText || ''} ${event.title || ''} ${event.notes || ''}`;
    const extracted = this.extractAllKeywords(text);

    // Generate smart title if current title is generic or poor quality
    const currentTitle = event.title || '';
    const poorTitlePatterns = [
      /^untitled/i,
      /^on level/i,
      /^we (just|had|have)/i,
      /^this (residue|would|is|was)/i,
      /^the /i,
      /^our /i,
      /\.\.\.$/,  // ends with ellipsis (truncated)
      /^fire marshal$/i,  // too generic
      /^bms$/i,  // too generic
      /^Bms /,  // incorrectly formatted acronym
    ];
    const isPoorTitle = poorTitlePatterns.some(p => p.test(currentTitle));
    const needsNewTitle = !currentTitle ||
      currentTitle === 'Untitled Event' ||
      isPoorTitle ||
      currentTitle.length > 60;

    if (needsNewTitle && event.transcriptText) {
      const smartTitle = this.generateSmartTitle(event.transcriptText);
      if (smartTitle !== 'Untitled Event') {
        // Update the event title
        await prisma.event.update({
          where: { id: eventId },
          data: { title: smartTitle }
        });
      }
    }

    // Build keywords summary for full-text search
    const keywordsSummary = this.buildKeywordsSummary(extracted);

    // Upsert the index
    const eventIndex = await prisma.eventIndex.upsert({
      where: { eventId },
      create: {
        eventId,
        inspectors: extracted.inspectors,
        trades: extracted.trades,
        materials: extracted.materials,
        issueTypes: extracted.issueTypes,
        locations: extracted.locations,
        ahj: extracted.ahj,
        systems: extracted.systems,
        costImpact: extracted.costImpact,
        needsFollowUp: extracted.needsFollowUp,
        followUpReason: extracted.followUpReason,
        keywordsSummary
      },
      update: {
        inspectors: extracted.inspectors,
        trades: extracted.trades,
        materials: extracted.materials,
        issueTypes: extracted.issueTypes,
        locations: extracted.locations,
        ahj: extracted.ahj,
        systems: extracted.systems,
        costImpact: extracted.costImpact,
        needsFollowUp: extracted.needsFollowUp,
        followUpReason: extracted.followUpReason,
        keywordsSummary
      }
    });

    return eventIndex;
  }

  /**
   * Index all unindexed events
   * @returns {Object} Summary of indexed events
   */
  async indexAllEvents() {
    const events = await prisma.event.findMany({
      where: {
        index: null,
        transcriptText: { not: null }
      },
      select: { id: true }
    });

    let indexed = 0;
    let errors = 0;

    for (const event of events) {
      try {
        await this.indexEvent(event.id);
        indexed++;
      } catch (err) {
        console.error(`Error indexing event ${event.id}:`, err.message);
        errors++;
      }
    }

    return { indexed, errors, total: events.length };
  }

  /**
   * Re-index all events (useful when extraction logic changes)
   * @returns {Object} Summary of re-indexed events
   */
  async reindexAllEvents() {
    const events = await prisma.event.findMany({
      where: {
        transcriptText: { not: null }
      },
      select: { id: true }
    });

    let indexed = 0;
    let errors = 0;

    for (const event of events) {
      try {
        await this.indexEvent(event.id);
        indexed++;
      } catch (err) {
        console.error(`Error re-indexing event ${event.id}:`, err.message);
        errors++;
      }
    }

    return { indexed, errors, total: events.length };
  }

  /**
   * Extract all keywords from text
   * @param {string} text - The text to analyze
   * @returns {Object} Extracted keywords
   */
  extractAllKeywords(text) {
    if (!text) {
      return {
        inspectors: [],
        trades: [],
        materials: [],
        issueTypes: [],
        locations: [],
        ahj: [],
        systems: [],
        costImpact: null,
        needsFollowUp: false,
        followUpReason: null
      };
    }

    const lowerText = text.toLowerCase();

    return {
      inspectors: this.extractInspectors(text),
      trades: this.extractTrades(text),
      materials: this.extractMaterials(text),
      issueTypes: this.extractIssueTypes(text),
      locations: this.extractLocations(text),
      ahj: this.extractAHJ(text),
      systems: this.extractSystems(text),
      costImpact: this.extractCostImpact(text),
      needsFollowUp: this.detectFollowUpNeeded(text),
      followUpReason: this.extractFollowUpReason(text)
    };
  }

  /**
   * Extract inspector/official names
   */
  extractInspectors(text) {
    const inspectors = new Set();

    for (const pattern of EventIndexerService.INSPECTOR_PATTERNS) {
      const matches = text.matchAll(new RegExp(pattern));
      for (const match of matches) {
        if (match[1]) {
          const name = this.cleanName(match[1]);
          if (name && name.length > 2 && !this.isCommonWord(name)) {
            inspectors.add(name);
          }
        }
      }
    }

    return Array.from(inspectors);
  }

  /**
   * Extract trade/vendor references
   * NOTE: Only extracts actual trade types (Electrical, Plumbing, HVAC, etc.)
   * Does NOT extract company names - those should be stored separately if needed
   */
  extractTrades(text) {
    const trades = new Set();
    const lowerText = text.toLowerCase();

    // Normalize trade keywords to their base form
    const TRADE_NORMALIZATIONS = {
      'electrician': 'Electrical',
      'electricians': 'Electrical',
      'electrical': 'Electrical',
      'plumber': 'Plumbing',
      'plumbers': 'Plumbing',
      'plumbing': 'Plumbing',
      'hvac': 'HVAC',
      'mechanical': 'Mechanical',
      'concrete': 'Concrete',
      'mason': 'Masonry',
      'masonry': 'Masonry',
      'steel': 'Steel/Iron',
      'iron worker': 'Steel/Iron',
      'ironworker': 'Steel/Iron',
      'painter': 'Painting',
      'painters': 'Painting',
      'painting': 'Painting',
      'landscaping': 'Landscaping',
      'landscaper': 'Landscaping',
      'roofer': 'Roofing',
      'roofing': 'Roofing',
      'drywall': 'Drywall',
      'framing': 'Framing',
      'framer': 'Framing',
      'sprinkler': 'Fire Protection',
      'fire protection': 'Fire Protection',
      'flooring': 'Flooring',
      'tile': 'Tile',
      'carpet': 'Flooring',
      'glazing': 'Glazing',
      'glazier': 'Glazing',
      'glass': 'Glazing',
      'door': 'Doors/Hardware',
      'hardware': 'Doors/Hardware',
      'bms': 'Controls/BMS',
      'controls': 'Controls/BMS',
      'automation': 'Controls/BMS',
      'smoke control': 'Fire Protection',
      'elevator': 'Elevator',
      'escalator': 'Elevator'
    };

    // Check for trade keywords and normalize to proper trade names
    for (const keyword of EventIndexerService.TRADE_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        const normalized = TRADE_NORMALIZATIONS[keyword] || this.capitalizeFirst(keyword);
        trades.add(normalized);
      }
    }

    return Array.from(trades);
  }

  /**
   * Capitalize first letter of a string
   */
  capitalizeFirst(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Extract material/product references
   */
  extractMaterials(text) {
    const materials = new Set();
    const lowerText = text.toLowerCase();

    for (const keyword of EventIndexerService.MATERIAL_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        materials.add(this.normalizeKeyword(keyword));
      }
    }

    // Look for product names with various patterns
    const productPatterns = [
      /(?:product\s+called|called)\s+([A-Z][A-Za-z\s]+?)(?:\.|,|$)/g,
      /(?:use|using|used)\s+(?:a\s+)?(?:product\s+)?(?:called\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)/g,
      /(?:brand|product|material)\s+(?:called\s+|named\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)/gi
    ];

    for (const pattern of productPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          const product = match[1].trim();
          // Filter out common words and keep only actual product names
          if (product.length > 2 && !this.isCommonWord(product) && /^[A-Z]/.test(product)) {
            materials.add(product);
          }
        }
      }
    }

    return Array.from(materials);
  }

  /**
   * Extract issue types
   */
  extractIssueTypes(text) {
    const issueTypes = new Set();
    const lowerText = text.toLowerCase();

    for (const [type, indicators] of Object.entries(EventIndexerService.ISSUE_INDICATORS)) {
      for (const indicator of indicators) {
        if (lowerText.includes(indicator)) {
          issueTypes.add(type);
          break;
        }
      }
    }

    return Array.from(issueTypes);
  }

  /**
   * Extract location references
   */
  extractLocations(text) {
    const locations = new Set();

    for (const pattern of EventIndexerService.LOCATION_PATTERNS) {
      const matches = text.matchAll(new RegExp(pattern));
      for (const match of matches) {
        const location = match[0] || match[1];
        if (location) {
          locations.add(location.trim().toLowerCase());
        }
      }
    }

    return Array.from(locations);
  }

  /**
   * Extract Authority Having Jurisdiction references
   */
  extractAHJ(text) {
    const ahj = new Set();

    for (const pattern of EventIndexerService.AHJ_PATTERNS) {
      const matches = text.matchAll(new RegExp(pattern));
      for (const match of matches) {
        if (match[1] || match[0]) {
          const jurisdiction = (match[1] || match[0]).trim();
          if (jurisdiction.length > 2) {
            ahj.add(this.cleanName(jurisdiction));
          }
        }
      }
    }

    return Array.from(ahj);
  }

  /**
   * Extract system references
   */
  extractSystems(text) {
    const systems = new Set();
    const lowerText = text.toLowerCase();

    for (const keyword of EventIndexerService.SYSTEM_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        systems.add(this.normalizeKeyword(keyword));
      }
    }

    return Array.from(systems);
  }

  /**
   * Extract cost impact amount
   */
  extractCostImpact(text) {
    // Match patterns like "$10,000", "$10k", "10K", "$3-4K", "around 3-4k"
    const patterns = [
      /\$\s*([\d,]+(?:\.\d{2})?)\s*(?:k|thousand)?/gi,
      /\$([\d]+)\s*-\s*\$?([\d]+)\s*k?/gi,
      /around\s*\$?([\d]+)\s*-?\s*\$?([\d]*)\s*k/gi,
      /([\d,]+)\s+dollars?/gi
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // Extract the numeric value
        const numMatch = match[0].match(/[\d,]+/g);
        if (numMatch) {
          let value = parseFloat(numMatch[numMatch.length - 1].replace(/,/g, ''));
          // Check if 'k' suffix
          if (/k/i.test(match[0])) {
            value *= 1000;
          }
          return value;
        }
      }
    }

    return null;
  }

  /**
   * Detect if follow-up is needed
   */
  detectFollowUpNeeded(text) {
    const lowerText = text.toLowerCase();
    const followUpIndicators = [
      'follow up',
      'follow-up',
      'will have to',
      'needs to be',
      'need to',
      'come back',
      'return',
      're-inspect',
      'revisit',
      'check on',
      'to be fixed',
      'to be determined',
      'tbd',
      'pending',
      'this needs',
      'must be',
      'should be'
    ];

    return followUpIndicators.some(indicator => lowerText.includes(indicator));
  }

  /**
   * Extract the reason for follow-up
   */
  extractFollowUpReason(text) {
    const lowerText = text.toLowerCase();

    // Look for sentences containing follow-up indicators
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      if (lowerSentence.includes('follow') ||
          lowerSentence.includes('need') ||
          lowerSentence.includes('must') ||
          lowerSentence.includes('should') ||
          lowerSentence.includes('will have to')) {
        return sentence.trim();
      }
    }

    return null;
  }

  /**
   * Build a summary string of all keywords for full-text search
   */
  buildKeywordsSummary(extracted) {
    const parts = [];

    if (extracted.inspectors?.length) {
      parts.push(`inspectors: ${extracted.inspectors.join(', ')}`);
    }
    if (extracted.trades?.length) {
      parts.push(`trades: ${extracted.trades.join(', ')}`);
    }
    if (extracted.materials?.length) {
      parts.push(`materials: ${extracted.materials.join(', ')}`);
    }
    if (extracted.issueTypes?.length) {
      parts.push(`issues: ${extracted.issueTypes.join(', ')}`);
    }
    if (extracted.locations?.length) {
      parts.push(`locations: ${extracted.locations.join(', ')}`);
    }
    if (extracted.ahj?.length) {
      parts.push(`ahj: ${extracted.ahj.join(', ')}`);
    }
    if (extracted.systems?.length) {
      parts.push(`systems: ${extracted.systems.join(', ')}`);
    }
    if (extracted.costImpact) {
      parts.push(`cost: $${extracted.costImpact}`);
    }
    if (extracted.needsFollowUp) {
      parts.push('needs_follow_up');
    }

    return parts.join(' | ');
  }

  // Helper methods

  cleanName(name) {
    if (!name) return null;
    return name.trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  normalizeKeyword(keyword) {
    return keyword.toLowerCase().trim();
  }

  isCommonWord(word) {
    const commonWords = [
      'the', 'we', 'they', 'had', 'have', 'was', 'were', 'are', 'is',
      'also', 'and', 'or', 'but', 'with', 'from', 'for', 'on', 'in',
      'special', 'inspector', 'building', 'city', 'county', 'fire'
    ];
    return commonWords.includes(word.toLowerCase());
  }

  /**
   * Validate if a string looks like a valid company/trade name
   */
  isValidCompanyName(name) {
    if (!name || name.length < 2) return false;

    const lower = name.toLowerCase();

    // Reject common phrases that aren't company names
    const invalidPhrases = [
      'going to', 'have to', 'need to', 'want to', 'able to',
      'shut down', 'come back', 'follow up', 'check on',
      'this', 'that', 'these', 'those', 'some', 'all',
      'so we', 'we re', 're going', 'which means'
    ];

    for (const phrase of invalidPhrases) {
      if (lower.includes(phrase)) return false;
    }

    // Reject if it's just common words
    const words = name.split(/\s+/);
    const allCommon = words.every(w => this.isCommonWord(w));
    if (allCommon) return false;

    // Must start with a capital letter
    if (!/^[A-Z]/.test(name)) return false;

    // Should be reasonably short (company names are usually 1-4 words)
    if (words.length > 4) return false;

    return true;
  }

  /**
   * Search events by indexed keywords
   * @param {Object} filters - Search filters
   * @returns {Array} Matching events
   */
  async searchByKeywords(filters = {}) {
    const {
      inspector,
      trade,
      material,
      issueType,
      location,
      ahj,
      system,
      needsFollowUp,
      hasCostImpact,
      minCost,
      maxCost,
      projectId,
      limit = 50
    } = filters;

    const whereClause = {};
    const indexWhere = {};

    // Build index filters using JSON contains
    if (inspector) {
      indexWhere.keywordsSummary = { contains: inspector, mode: 'insensitive' };
    }
    if (trade) {
      indexWhere.keywordsSummary = { contains: trade, mode: 'insensitive' };
    }
    if (material) {
      indexWhere.keywordsSummary = { contains: material, mode: 'insensitive' };
    }
    if (location) {
      indexWhere.keywordsSummary = { contains: location, mode: 'insensitive' };
    }
    if (ahj) {
      indexWhere.keywordsSummary = { contains: ahj, mode: 'insensitive' };
    }
    if (system) {
      indexWhere.keywordsSummary = { contains: system, mode: 'insensitive' };
    }
    if (issueType) {
      indexWhere.keywordsSummary = { contains: issueType, mode: 'insensitive' };
    }
    if (needsFollowUp !== undefined) {
      indexWhere.needsFollowUp = needsFollowUp;
    }
    if (hasCostImpact) {
      indexWhere.costImpact = { not: null };
    }
    if (minCost !== undefined) {
      indexWhere.costImpact = { ...indexWhere.costImpact, gte: minCost };
    }
    if (maxCost !== undefined) {
      indexWhere.costImpact = { ...indexWhere.costImpact, lte: maxCost };
    }

    if (projectId) {
      whereClause.projectId = projectId;
    }

    whereClause.index = Object.keys(indexWhere).length > 0 ? indexWhere : { isNot: null };

    const events = await prisma.event.findMany({
      where: whereClause,
      include: {
        project: { select: { id: true, name: true } },
        index: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return events.map(event => ({
      id: event.id,
      title: event.title,
      transcriptText: event.transcriptText?.substring(0, 300) + (event.transcriptText?.length > 300 ? '...' : ''),
      eventType: event.eventType,
      severity: event.severity,
      createdAt: event.createdAt,
      isResolved: event.isResolved,
      project: event.project,
      index: event.index
    }));
  }

  /**
   * Get all events that need follow-up
   * @param {Object} options - Query options
   * @returns {Array} Events needing follow-up
   */
  async getEventsNeedingFollowUp(options = {}) {
    const { projectId, includeResolved = false, limit = 50 } = options;

    const whereClause = {
      index: { needsFollowUp: true }
    };

    if (projectId) {
      whereClause.projectId = projectId;
    }
    if (!includeResolved) {
      whereClause.isResolved = false;
    }

    const events = await prisma.event.findMany({
      where: whereClause,
      include: {
        project: { select: { id: true, name: true } },
        index: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return events.map(event => ({
      id: event.id,
      title: event.title,
      transcriptText: event.transcriptText?.substring(0, 300),
      severity: event.severity,
      createdAt: event.createdAt,
      project: event.project,
      followUpReason: event.index?.followUpReason,
      costImpact: event.index?.costImpact,
      issueTypes: event.index?.issueTypes
    }));
  }

  /**
   * Get aggregated statistics for indexed events
   * @param {string} projectId - Optional project filter
   * @returns {Object} Aggregated stats
   */
  async getIndexStats(projectId = null) {
    const whereClause = projectId ? { event: { projectId } } : {};

    const [
      totalIndexed,
      needsFollowUp,
      withCostImpact,
      indexes
    ] = await Promise.all([
      prisma.eventIndex.count({ where: whereClause }),
      prisma.eventIndex.count({ where: { ...whereClause, needsFollowUp: true } }),
      prisma.eventIndex.count({ where: { ...whereClause, costImpact: { not: null } } }),
      prisma.eventIndex.findMany({
        where: whereClause,
        select: {
          inspectors: true,
          trades: true,
          issueTypes: true,
          ahj: true,
          systems: true,
          costImpact: true
        }
      })
    ]);

    // Aggregate keyword frequencies
    const inspectorCounts = {};
    const tradeCounts = {};
    const issueCounts = {};
    const ahjCounts = {};
    const systemCounts = {};
    let totalCostImpact = 0;

    for (const index of indexes) {
      if (Array.isArray(index.inspectors)) {
        for (const inspector of index.inspectors) {
          inspectorCounts[inspector] = (inspectorCounts[inspector] || 0) + 1;
        }
      }
      if (Array.isArray(index.trades)) {
        for (const trade of index.trades) {
          tradeCounts[trade] = (tradeCounts[trade] || 0) + 1;
        }
      }
      if (Array.isArray(index.issueTypes)) {
        for (const issue of index.issueTypes) {
          issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        }
      }
      if (Array.isArray(index.ahj)) {
        for (const jurisdiction of index.ahj) {
          ahjCounts[jurisdiction] = (ahjCounts[jurisdiction] || 0) + 1;
        }
      }
      if (Array.isArray(index.systems)) {
        for (const system of index.systems) {
          systemCounts[system] = (systemCounts[system] || 0) + 1;
        }
      }
      if (index.costImpact) {
        totalCostImpact += index.costImpact;
      }
    }

    return {
      totalIndexed,
      needsFollowUp,
      withCostImpact,
      totalCostImpact,
      topInspectors: this.sortByCount(inspectorCounts, 10),
      topTrades: this.sortByCount(tradeCounts, 10),
      topIssueTypes: this.sortByCount(issueCounts, 10),
      topAHJ: this.sortByCount(ahjCounts, 10),
      topSystems: this.sortByCount(systemCounts, 10)
    };
  }

  sortByCount(counts, limit) {
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }
}

module.exports = new EventIndexerService();
