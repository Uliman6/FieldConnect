const PDFDocument = require('pdfkit');

/**
 * Insights PDF Generator Service
 * Generates checklist-style PDF reports for filtered insights
 */
class InsightsPDFService {
  /**
   * Generate a checklist PDF from insights
   * @param {Array} insights - Array of insight objects
   * @param {Object} options - Generation options
   * @returns {PDFDocument} PDF document stream
   */
  generateInsightsChecklist(insights, options = {}) {
    const { filters = {}, projectName } = options;

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true // Enable page buffering for footer
    });

    // Header
    this.addHeader(doc, insights.length, filters, projectName);

    // Group by category
    const grouped = this.groupByCategory(insights);

    // Render each category section
    for (const [category, items] of Object.entries(grouped)) {
      this.addCategorySection(doc, category, items);
    }

    // Add page numbers to all pages
    this.addPageNumbers(doc);

    doc.end();
    return doc;
  }

  /**
   * Add header section with title and metadata
   */
  addHeader(doc, totalCount, filters, projectName) {
    // Title
    doc.fontSize(20).font('Helvetica-Bold')
       .text('INSIGHTS CHECKLIST', { align: 'center' });
    doc.moveDown(0.3);

    // Project name if provided
    if (projectName) {
      doc.fontSize(12).font('Helvetica')
         .text(`Project: ${projectName}`, { align: 'center' });
    }

    // Generation info
    doc.fontSize(10).font('Helvetica')
       .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.text(`Total Items: ${totalCount}`, { align: 'center' });

    // Active filters
    const activeFilters = Object.entries(filters)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${this.formatFilterLabel(k)}: ${v}`)
      .join('  |  ');

    if (activeFilters) {
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#666666')
         .text(`Filters: ${activeFilters}`, { align: 'center' });
      doc.fillColor('black');
    }

    doc.moveDown(0.8);

    // Divider line
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke('#cccccc');
    doc.moveDown(0.5);
  }

  /**
   * Format filter key to display label
   */
  formatFilterLabel(key) {
    const labels = {
      category: 'Category',
      sourceType: 'Source',
      trade: 'Trade',
      issueType: 'Issue Type',
      system: 'System',
      severity: 'Severity'
    };
    return labels[key] || key;
  }

  /**
   * Group insights by category
   */
  groupByCategory(insights) {
    const grouped = {};
    const categoryOrder = ['safety', 'issue', 'quality', 'rework', 'delay', 'cost_impact', 'observation', 'learning'];

    for (const insight of insights) {
      const cat = insight.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(insight);
    }

    // Sort categories by predefined order
    const sorted = {};
    for (const cat of categoryOrder) {
      if (grouped[cat]) sorted[cat] = grouped[cat];
    }
    // Add any remaining categories not in the order
    for (const [cat, items] of Object.entries(grouped)) {
      if (!sorted[cat]) sorted[cat] = items;
    }

    return sorted;
  }

  /**
   * Add a category section with its items
   */
  addCategorySection(doc, category, items) {
    this.checkPageBreak(doc, 80);

    // Category header
    const categoryLabel = this.formatCategoryLabel(category);
    const categoryColor = this.getCategoryColor(category);

    doc.fontSize(14).font('Helvetica-Bold')
       .fillColor(categoryColor)
       .text(`${categoryLabel} (${items.length})`);
    doc.fillColor('black');

    // Underline
    const underlineY = doc.y + 2;
    doc.moveTo(50, underlineY).lineTo(200, underlineY).stroke(categoryColor);
    doc.moveDown(0.5);

    // Items as checklist
    for (const item of items) {
      this.addChecklistItem(doc, item);
    }

    doc.moveDown(0.8);
  }

  /**
   * Add a single checklist item
   */
  addChecklistItem(doc, item) {
    this.checkPageBreak(doc, 60);

    const startY = doc.y;
    const checkboxSize = 10;
    const leftMargin = 55;
    const textStart = leftMargin + 20;
    const textWidth = 480;

    // Checkbox (empty or checked based on isResolved)
    if (item.isResolved) {
      // Draw checked box
      doc.rect(leftMargin, startY + 2, checkboxSize, checkboxSize).stroke();
      doc.moveTo(leftMargin + 2, startY + 7)
         .lineTo(leftMargin + 4, startY + 10)
         .lineTo(leftMargin + 9, startY + 4)
         .stroke();
    } else {
      // Draw empty box
      doc.rect(leftMargin, startY + 2, checkboxSize, checkboxSize).stroke();
    }

    // Severity indicator
    let titlePrefix = '';
    if (item.severity) {
      titlePrefix = this.getSeverityIndicator(item.severity) + ' ';
    }

    // Title
    doc.font('Helvetica-Bold').fontSize(10);
    const title = item.title || 'Untitled';
    doc.text(titlePrefix + title, textStart, startY, { width: textWidth });

    // Description (if present, truncated)
    if (item.description) {
      doc.font('Helvetica').fontSize(9).fillColor('#444444');
      const desc = item.description.length > 180
        ? item.description.substring(0, 177) + '...'
        : item.description;
      doc.text(desc, textStart, doc.y, { width: textWidth });
      doc.fillColor('black');
    }

    // Metadata line
    const metadata = [];
    if (item.trades?.length) {
      const tradesStr = item.trades.slice(0, 3).join(', ');
      metadata.push(`Trades: ${tradesStr}`);
    }
    if (item.locations?.length) {
      metadata.push(`Location: ${item.locations[0]}`);
    }
    if (item.sourceType) {
      metadata.push(`Source: ${this.formatSourceType(item.sourceType)}`);
    }
    if (item.costImpact) {
      metadata.push(`Cost: $${item.costImpact.toLocaleString()}`);
    }

    if (metadata.length > 0) {
      doc.font('Helvetica').fontSize(8).fillColor('#777777');
      doc.text(metadata.join('  |  '), textStart, doc.y, { width: textWidth });
      doc.fillColor('black');
    }

    // Follow-up indicator
    if (item.needsFollowUp) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#F97316');
      doc.text('! Needs Follow-up', textStart, doc.y);
      doc.fillColor('black');
    }

    doc.moveDown(0.6);
  }

  /**
   * Add page numbers to all pages
   */
  addPageNumbers(doc) {
    const pageRange = doc.bufferedPageRange();
    const totalPages = pageRange.count;

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);

      // Footer text
      doc.fontSize(8).font('Helvetica').fillColor('#888888');
      doc.text(
        `Page ${i + 1} of ${totalPages}  |  FieldConnect Insights Export`,
        50,
        doc.page.height - 35,
        { align: 'center', width: 512 }
      );
      doc.fillColor('black');
    }
  }

  /**
   * Check if we need a page break
   */
  checkPageBreak(doc, neededSpace) {
    const pageHeight = doc.page.height;
    const bottomMargin = doc.page.margins.bottom;

    if (doc.y + neededSpace > pageHeight - bottomMargin - 40) {
      doc.addPage();
    }
  }

  /**
   * Format category to display label
   */
  formatCategoryLabel(category) {
    const labels = {
      safety: 'Safety Issues',
      issue: 'General Issues',
      quality: 'Quality Concerns',
      rework: 'Rework Items',
      delay: 'Delays',
      observation: 'Observations',
      learning: 'Learnings',
      cost_impact: 'Cost Impacts',
      other: 'Other'
    };
    return labels[category] || category.charAt(0).toUpperCase() + category.slice(1);
  }

  /**
   * Get color for category
   */
  getCategoryColor(category) {
    const colors = {
      safety: '#DC2626',      // Red
      issue: '#EF4444',       // Light red
      quality: '#F59E0B',     // Amber
      rework: '#F97316',      // Orange
      delay: '#6366F1',       // Indigo
      observation: '#3B82F6', // Blue
      learning: '#8B5CF6',    // Purple
      cost_impact: '#DC2626', // Red
      other: '#6B7280'        // Gray
    };
    return colors[category] || '#374151';
  }

  /**
   * Get severity indicator text
   */
  getSeverityIndicator(severity) {
    const indicators = {
      critical: '[CRITICAL]',
      high: '[HIGH]',
      medium: '[MED]',
      low: '[LOW]'
    };
    return indicators[severity?.toLowerCase()] || '';
  }

  /**
   * Format source type to display label
   */
  formatSourceType(sourceType) {
    const labels = {
      event: 'Event',
      pending_issue: 'Pending Issue',
      inspection_note: 'Inspection',
      additional_work: 'Additional Work',
      manual: 'Manual Entry'
    };
    return labels[sourceType] || sourceType;
  }
}

module.exports = new InsightsPDFService();
