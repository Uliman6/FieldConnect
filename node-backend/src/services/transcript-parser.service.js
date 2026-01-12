/**
 * Transcript Parser Service
 * Extracts structured daily log data from voice transcripts
 */
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
   * Parse a transcript and extract structured daily log data
   * @param {string} transcript - The voice transcript text
   * @returns {Object} Structured daily log data
   */
  parseTranscript(transcript) {
    if (!transcript || typeof transcript !== 'string') {
      return { error: 'No transcript provided' };
    }

    // Extract tasks first as they provide context for issues
    const tasks = this.extractTasks(transcript);

    const result = {
      weather: this.extractWeather(transcript),
      tasks: tasks,
      inspectionNotes: this.extractInspections(transcript),
      visitors: this.extractVisitors(transcript),
      pendingIssues: this.extractIssues(transcript, tasks),
      dailyTotals: this.calculateTotals(tasks),
      rawTranscript: transcript
    };

    return result;
  }

  /**
   * Extract weather information
   */
  extractWeather(transcript) {
    const weather = {
      sky_condition: null,
      temperature: null,
      high_temp: null,
      low_temp: null,
      precipitation: null,
      wind: null,
      weather_delay: false
    };

    const text = transcript.toLowerCase();

    // Extract sky condition
    for (const condition of TranscriptParserService.WEATHER_CONDITIONS) {
      if (text.includes(condition)) {
        weather.sky_condition = condition.charAt(0).toUpperCase() + condition.slice(1);
        if (['rainy', 'rain', 'stormy', 'snow', 'snowy'].includes(condition)) {
          weather.precipitation = condition;
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

      // Look for "We had [Company] working on [description]"
      const companyMatch = sentence.match(/(?:we (?:also )?had\s+|had\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)\s+(?:working|was working|were working|had to)/i);

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
