const PDFDocument = require('pdfkit');
const fs = require('fs').promises;
const path = require('path');

/**
 * PDF Generator Service for Daily Log Reports
 */
class PDFGeneratorService {
  /**
   * Generate a PDF report for a daily log
   * @param {Object} dailyLog - Daily log with all relations
   * @param {Object} project - Project data
   * @param {Array} photos - Optional photos to include
   * @returns {PDFDocument} PDF document stream
   */
  async generateDailyLogReport(dailyLog, project, photos = []) {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });

    // Header
    this.addHeader(doc, project, dailyLog);

    // Weather Section
    if (dailyLog.weather) {
      this.addWeatherSection(doc, dailyLog.weather);
    }

    // Daily Totals
    this.addDailyTotals(doc, dailyLog);

    // Tasks Section
    if (dailyLog.tasks && dailyLog.tasks.length > 0) {
      this.addTasksSection(doc, dailyLog.tasks);
    }

    // Visitors Section
    if (dailyLog.visitors && dailyLog.visitors.length > 0) {
      this.addVisitorsSection(doc, dailyLog.visitors);
    }

    // Equipment Section
    if (dailyLog.equipment && dailyLog.equipment.length > 0) {
      this.addEquipmentSection(doc, dailyLog.equipment);
    }

    // Materials Section
    if (dailyLog.materials && dailyLog.materials.length > 0) {
      this.addMaterialsSection(doc, dailyLog.materials);
    }

    // Pending Issues Section
    if (dailyLog.pendingIssues && dailyLog.pendingIssues.length > 0) {
      this.addPendingIssuesSection(doc, dailyLog.pendingIssues);
    }

    // Inspection Notes Section
    if (dailyLog.inspectionNotes && dailyLog.inspectionNotes.length > 0) {
      this.addInspectionNotesSection(doc, dailyLog.inspectionNotes);
    }

    // Additional Work Section
    if (dailyLog.additionalWorkEntries && dailyLog.additionalWorkEntries.length > 0) {
      this.addAdditionalWorkSection(doc, dailyLog.additionalWorkEntries);
    }

    // Photos Section
    if (photos && photos.length > 0) {
      await this.addPhotosSection(doc, photos);
    }

    // Footer
    this.addFooter(doc, dailyLog);

    doc.end();
    return doc;
  }

  addHeader(doc, project, dailyLog) {
    // Fix timezone issue: Use UTC date values to avoid day shift
    const dateObj = new Date(dailyLog.date);
    const date = dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC' // Use UTC to prevent timezone shifts
    });

    // Title
    doc.fontSize(20).font('Helvetica-Bold').text('DAILY CONSTRUCTION LOG', { align: 'center' });
    doc.moveDown(0.5);

    // Project Info Box
    doc.fontSize(12).font('Helvetica-Bold');
    doc.rect(doc.x, doc.y, 512, 80).stroke();

    const boxY = doc.y + 10;
    doc.text(`Project: ${project.name}`, 60, boxY);
    doc.text(`Project #: ${project.number || 'N/A'}`, 350, boxY);
    doc.text(`Address: ${project.address || 'N/A'}`, 60, boxY + 20);
    doc.text(`Date: ${date}`, 350, boxY + 20);
    doc.text(`Prepared By: ${dailyLog.preparedBy || 'N/A'}`, 60, boxY + 40);
    doc.text(`Status: ${dailyLog.status || 'Draft'}`, 350, boxY + 40);

    doc.y = boxY + 70;
    doc.moveDown(1);
  }

  addWeatherSection(doc, weather) {
    this.addSectionHeader(doc, 'WEATHER CONDITIONS');

    const weatherInfo = [];
    if (weather.condition) weatherInfo.push(`Condition: ${weather.condition}`);
    if (weather.temperature) weatherInfo.push(`Temperature: ${weather.temperature}`);
    if (weather.high) weatherInfo.push(`High: ${weather.high}`);
    if (weather.low) weatherInfo.push(`Low: ${weather.low}`);
    if (weather.humidity) weatherInfo.push(`Humidity: ${weather.humidity}`);
    if (weather.wind) weatherInfo.push(`Wind: ${weather.wind}`);
    if (weather.precipitation) weatherInfo.push(`Precipitation: ${weather.precipitation}`);

    doc.fontSize(10).font('Helvetica');
    doc.text(weatherInfo.join('  |  ') || 'No weather data recorded', { indent: 10 });
    doc.moveDown(1);
  }

  addDailyTotals(doc, dailyLog) {
    this.addSectionHeader(doc, 'DAILY TOTALS');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Workers: ${dailyLog.dailyTotalsWorkers || 0}`, { indent: 10, continued: true });
    doc.text(`     Total Hours: ${dailyLog.dailyTotalsHours || 0}`);
    doc.moveDown(1);
  }

  addTasksSection(doc, tasks) {
    this.checkPageBreak(doc, 150);
    this.addSectionHeader(doc, 'WORK PERFORMED');

    tasks.forEach((task, index) => {
      this.checkPageBreak(doc, 60);
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text(`${index + 1}. ${task.companyName || 'Unknown Company'}`, { indent: 10 });

      doc.font('Helvetica');
      doc.text(`Workers: ${task.workers || 0}  |  Hours: ${task.hours || 0}`, { indent: 20 });

      if (task.taskDescription) {
        doc.text(`Description: ${task.taskDescription}`, { indent: 20 });
      }
      if (task.notes) {
        doc.text(`Notes: ${task.notes}`, { indent: 20 });
      }
      doc.moveDown(0.5);
    });
    doc.moveDown(0.5);
  }

  addVisitorsSection(doc, visitors) {
    this.checkPageBreak(doc, 100);
    this.addSectionHeader(doc, 'SITE VISITORS');

    this.addTable(doc, visitors, [
      { header: 'Time', width: 70, key: 'time' },
      { header: 'Name', width: 150, key: 'visitorName' },
      { header: 'Company', width: 150, key: 'companyName' },
      { header: 'Notes', width: 142, key: 'notes' }
    ]);
    doc.moveDown(1);
  }

  addEquipmentSection(doc, equipment) {
    this.checkPageBreak(doc, 100);
    this.addSectionHeader(doc, 'EQUIPMENT');

    this.addTable(doc, equipment, [
      { header: 'Type', width: 200, key: 'equipmentType' },
      { header: 'Qty', width: 60, key: 'quantity' },
      { header: 'Hours', width: 60, key: 'hours' },
      { header: 'Notes', width: 192, key: 'notes' }
    ]);
    doc.moveDown(1);
  }

  addMaterialsSection(doc, materials) {
    this.checkPageBreak(doc, 100);
    this.addSectionHeader(doc, 'MATERIALS DELIVERED');

    this.addTable(doc, materials, [
      { header: 'Material', width: 150, key: 'material' },
      { header: 'Qty', width: 60, key: 'quantity' },
      { header: 'Unit', width: 60, key: 'unit' },
      { header: 'Supplier', width: 120, key: 'supplier' },
      { header: 'Notes', width: 122, key: 'notes' }
    ]);
    doc.moveDown(1);
  }

  addPendingIssuesSection(doc, issues) {
    this.checkPageBreak(doc, 150);
    this.addSectionHeader(doc, 'PENDING ISSUES');

    issues.forEach((issue, index) => {
      this.checkPageBreak(doc, 80);
      doc.fontSize(10).font('Helvetica-Bold');

      const severityColor = this.getSeverityColor(issue.severity);
      doc.text(`${index + 1}. ${issue.title || 'Untitled Issue'}`, { indent: 10 });

      doc.font('Helvetica');
      const metadata = [];
      if (issue.category) metadata.push(`Category: ${issue.category}`);
      if (issue.severity) metadata.push(`Severity: ${issue.severity}`);
      if (issue.assignee) metadata.push(`Assignee: ${issue.assignee}`);
      if (issue.dueDate) metadata.push(`Due: ${new Date(issue.dueDate).toLocaleDateString()}`);

      if (metadata.length > 0) {
        doc.text(metadata.join('  |  '), { indent: 20 });
      }

      if (issue.description) {
        doc.text(issue.description, { indent: 20 });
      }
      if (issue.location) {
        doc.text(`Location: ${issue.location}`, { indent: 20 });
      }
      if (issue.externalEntity) {
        doc.text(`External Entity: ${issue.externalEntity}`, { indent: 20 });
      }
      doc.moveDown(0.5);
    });
    doc.moveDown(0.5);
  }

  addInspectionNotesSection(doc, notes) {
    this.checkPageBreak(doc, 150);
    this.addSectionHeader(doc, 'INSPECTION NOTES');

    notes.forEach((note, index) => {
      this.checkPageBreak(doc, 70);
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text(`${index + 1}. ${note.inspectionType || 'Inspection'}`, { indent: 10 });

      doc.font('Helvetica');
      const metadata = [];
      if (note.inspectorName) metadata.push(`Inspector: ${note.inspectorName}`);
      if (note.ahj) metadata.push(`AHJ: ${note.ahj}`);
      if (note.result) metadata.push(`Result: ${note.result}`);

      if (metadata.length > 0) {
        doc.text(metadata.join('  |  '), { indent: 20 });
      }

      if (note.notes) {
        doc.text(note.notes, { indent: 20 });
      }
      if (note.followUpNeeded) {
        doc.font('Helvetica-Bold').fillColor('red')
          .text('* Follow-up Required', { indent: 20 });
        doc.fillColor('black');
      }
      doc.moveDown(0.5);
    });
    doc.moveDown(0.5);
  }

  addAdditionalWorkSection(doc, entries) {
    this.checkPageBreak(doc, 100);
    this.addSectionHeader(doc, 'ADDITIONAL WORK');

    entries.forEach((entry, index) => {
      this.checkPageBreak(doc, 40);
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text(`${index + 1}. ${entry.category || 'General'}`, { indent: 10 });

      if (entry.description) {
        doc.font('Helvetica');
        doc.text(entry.description, { indent: 20 });
      }
      doc.moveDown(0.5);
    });
  }

  async addPhotosSection(doc, photos) {
    this.checkPageBreak(doc, 150);
    this.addSectionHeader(doc, 'PHOTOS');

    // Layout: 2 photos per row
    const photoWidth = 240;
    const photoHeight = 180;
    const margin = 16;
    const startX = 50;

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];

      // Check if we need a new page (photo height + caption space)
      this.checkPageBreak(doc, photoHeight + 40);

      // Calculate position (2 columns)
      const col = i % 2;
      const x = startX + col * (photoWidth + margin);

      // If starting a new row (except first), adjust Y
      if (i > 0 && col === 0) {
        doc.moveDown(0.5);
      }

      const y = doc.y;

      try {
        // Check if file exists and load it
        const filePath = photo.filePath;
        await fs.access(filePath);

        // Add image to PDF
        doc.image(filePath, x, y, {
          width: photoWidth,
          height: photoHeight,
          fit: [photoWidth, photoHeight],
          align: 'center',
          valign: 'center'
        });

        // Add caption below image
        if (photo.caption) {
          doc.fontSize(8).font('Helvetica');
          doc.text(photo.caption, x, y + photoHeight + 5, {
            width: photoWidth,
            align: 'center'
          });
        }

        // Only move down after completing a row (2 photos)
        if (col === 1 || i === photos.length - 1) {
          doc.y = y + photoHeight + (photo.caption ? 25 : 10);
        }
      } catch (err) {
        // File not found - add placeholder
        doc.rect(x, y, photoWidth, photoHeight).stroke();
        doc.fontSize(9).font('Helvetica');
        doc.text('Photo not available', x, y + photoHeight / 2, {
          width: photoWidth,
          align: 'center'
        });

        if (col === 1 || i === photos.length - 1) {
          doc.y = y + photoHeight + 10;
        }
      }
    }

    doc.moveDown(1);
  }

  addFooter(doc, dailyLog) {
    const pageHeight = doc.page.height;
    const bottomMargin = doc.page.margins.bottom;

    doc.fontSize(8).font('Helvetica');
    doc.text(
      `Generated on ${new Date().toLocaleString()} | Daily Log ID: ${dailyLog.id}`,
      50,
      pageHeight - bottomMargin - 20,
      { align: 'center' }
    );
  }

  addSectionHeader(doc, title) {
    doc.fontSize(12).font('Helvetica-Bold');
    doc.fillColor('#1a365d');
    doc.text(title);
    doc.fillColor('black');
    doc.moveTo(doc.x, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);
  }

  addTable(doc, data, columns) {
    const startX = 50;
    let y = doc.y;
    const rowHeight = 20;

    // Draw header
    doc.fontSize(9).font('Helvetica-Bold');
    let x = startX;
    columns.forEach(col => {
      doc.text(col.header, x + 2, y + 5, { width: col.width - 4 });
      x += col.width;
    });
    y += rowHeight;

    // Draw header line
    doc.moveTo(startX, y).lineTo(startX + columns.reduce((sum, c) => sum + c.width, 0), y).stroke();

    // Draw rows
    doc.font('Helvetica').fontSize(9);
    data.forEach((row) => {
      this.checkPageBreak(doc, rowHeight + 10);
      x = startX;
      y = doc.y;

      columns.forEach(col => {
        const value = row[col.key] || '';
        doc.text(String(value).substring(0, 50), x + 2, y + 3, { width: col.width - 4 });
        x += col.width;
      });
      doc.y = y + rowHeight;
    });
  }

  checkPageBreak(doc, neededSpace) {
    const pageHeight = doc.page.height;
    const bottomMargin = doc.page.margins.bottom;

    if (doc.y + neededSpace > pageHeight - bottomMargin - 30) {
      doc.addPage();
    }
  }

  getSeverityColor(severity) {
    const colors = {
      'critical': '#dc2626',
      'high': '#ea580c',
      'medium': '#ca8a04',
      'low': '#16a34a'
    };
    return colors[severity?.toLowerCase()] || '#000000';
  }
}

module.exports = new PDFGeneratorService();
