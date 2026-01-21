/**
 * Schema PDF Service
 * Generates professional PDF documents from extracted schema data
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '../../uploads/schema-pdfs');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

class SchemaPdfService {
  /**
   * Generate PDF from event schema data
   * @param {string} eventId - The event ID
   * @returns {object} - { filePath, fileName }
   */
  async generatePdf(eventId) {
    // Get event with schema data
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        schemaData: {
          include: { schema: true }
        },
        project: true,
      },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    if (!event.schemaData) {
      throw new Error('No schema data found for this event');
    }

    const { schemaData } = event;
    const schema = schemaData.schema;
    const fieldValues = schemaData.fieldValues || {};

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTitle = (fieldValues.title || event.title || 'document')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 30);
    const fileName = `${schema.documentType}_${safeTitle}_${timestamp}.pdf`;
    const filePath = path.join(UPLOADS_DIR, fileName);

    // Create PDF based on document type
    if (schema.documentType === 'PUNCH_LIST') {
      await this.generatePunchListPdf(filePath, event, schemaData, fieldValues);
    } else if (schema.documentType === 'RFI') {
      await this.generateRfiPdf(filePath, event, schemaData, fieldValues);
    } else {
      await this.generateGenericPdf(filePath, event, schemaData, fieldValues);
    }

    // Update schema data with PDF path
    await prisma.eventSchemaData.update({
      where: { eventId },
      data: {
        generatedPdfPath: filePath,
        generatedPdfName: fileName,
        pdfGeneratedAt: new Date(),
      },
    });

    return { filePath, fileName };
  }

  /**
   * Generate Punch List PDF
   */
  async generatePunchListPdf(filePath, event, schemaData, fieldValues) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('PUNCH LIST ITEM', { align: 'center' });
      doc.moveDown(0.5);

      // Project info bar
      doc.fontSize(10).font('Helvetica')
        .fillColor('#666666')
        .text(`Project: ${event.project?.name || 'N/A'}  |  Date: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(1);

      // Draw separator line
      doc.strokeColor('#E5E5E5').lineWidth(1)
        .moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);

      // Title section
      doc.fillColor('#000000').fontSize(14).font('Helvetica-Bold')
        .text(fieldValues.title || 'Untitled Punch Item');
      doc.moveDown(0.5);

      // Two-column layout for metadata
      const startY = doc.y;
      const leftCol = 50;
      const rightCol = 300;

      // Left column
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text('LOCATION', leftCol, startY);
      doc.fontSize(11).font('Helvetica').fillColor('#000000').text(fieldValues.location || 'Not specified', leftCol, doc.y + 2);
      doc.moveDown(0.8);

      const afterLocation = doc.y;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text('ASSIGNED TO', leftCol);
      doc.fontSize(11).font('Helvetica').fillColor('#000000').text(fieldValues.assigned_to || 'Not assigned', leftCol, doc.y + 2);

      // Right column
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text('CREATED BY', rightCol, startY);
      doc.fontSize(11).font('Helvetica').fillColor('#000000').text(fieldValues.created_by || 'Not specified', rightCol, doc.y + 2);
      doc.y = afterLocation;

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text('DATE', rightCol);
      doc.fontSize(11).font('Helvetica').fillColor('#000000').text(fieldValues.created_on || new Date().toLocaleDateString(), rightCol, doc.y + 2);

      doc.moveDown(2);

      // Description section
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text('DESCRIPTION', leftCol);
      doc.moveDown(0.3);

      // Description box
      const descBoxY = doc.y;
      doc.rect(leftCol, descBoxY, 500, 100).fillColor('#F9F9F9').fill();
      doc.fillColor('#000000').fontSize(11).font('Helvetica')
        .text(fieldValues.description || 'No description provided', leftCol + 10, descBoxY + 10, {
          width: 480,
          height: 80,
        });

      doc.y = descBoxY + 110;
      doc.moveDown(1);

      // Root Cause section (if present)
      if (fieldValues.root_cause) {
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text('ROOT CAUSE', leftCol);
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica').fillColor('#000000').text(fieldValues.root_cause, leftCol);
        doc.moveDown(1);
      }

      // Footer
      doc.fontSize(8).fillColor('#999999')
        .text(`Generated by FieldConnect  |  Event ID: ${event.id.substring(0, 8)}`, 50, 750, { align: 'center' });

      doc.end();

      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  /**
   * Generate RFI PDF
   */
  async generateRfiPdf(filePath, event, schemaData, fieldValues) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('REQUEST FOR INFORMATION', { align: 'center' });
      doc.moveDown(0.5);

      // Project info bar
      doc.fontSize(10).font('Helvetica')
        .fillColor('#666666')
        .text(`Project: ${event.project?.name || 'N/A'}  |  Date: ${fieldValues.created_on || new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(1);

      // Draw separator line
      doc.strokeColor('#E5E5E5').lineWidth(1)
        .moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);

      // Subject
      doc.fillColor('#000000').fontSize(14).font('Helvetica-Bold')
        .text(fieldValues.subject || 'Untitled RFI');
      doc.moveDown(0.5);

      // Metadata grid
      const leftCol = 50;
      const midCol = 200;
      const rightCol = 380;
      const startY = doc.y;

      // Row 1
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text('CREATED BY', leftCol, startY);
      doc.fontSize(10).font('Helvetica').fillColor('#000000').text(fieldValues.created_by || 'N/A', leftCol, doc.y + 2);

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text('BALL IN COURT', midCol, startY);
      doc.fontSize(10).font('Helvetica').fillColor('#000000').text(fieldValues.ball_in_court || 'N/A', midCol, doc.y + 2);

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text('REFERENCE', rightCol, startY);
      doc.fontSize(10).font('Helvetica').fillColor('#000000').text(fieldValues.reference || 'N/A', rightCol, doc.y + 2);

      doc.moveDown(2);

      // Question section
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text('QUESTION', leftCol);
      doc.moveDown(0.3);

      const qBoxY = doc.y;
      doc.rect(leftCol, qBoxY, 500, 120).fillColor('#F0F7FF').fill();
      doc.fillColor('#000000').fontSize(11).font('Helvetica')
        .text(fieldValues.question || 'No question provided', leftCol + 10, qBoxY + 10, {
          width: 480,
          height: 100,
        });

      doc.y = qBoxY + 130;
      doc.moveDown(1);

      // Impact section
      const impactY = doc.y;

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text('COST IMPACT', leftCol, impactY);
      doc.fontSize(10).font('Helvetica').fillColor('#000000').text(fieldValues.cost_impact || 'TBD', leftCol, doc.y + 2);

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text('SCHEDULE IMPACT', 300, impactY);
      doc.fontSize(10).font('Helvetica').fillColor('#000000').text(fieldValues.schedule_impact || 'TBD', 300, doc.y + 2);

      // Footer
      doc.fontSize(8).fillColor('#999999')
        .text(`Generated by FieldConnect  |  Event ID: ${event.id.substring(0, 8)}`, 50, 750, { align: 'center' });

      doc.end();

      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  /**
   * Generate generic PDF for custom schemas
   */
  async generateGenericPdf(filePath, event, schemaData, fieldValues) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      const schema = schemaData.schema;

      // Header
      doc.fontSize(18).font('Helvetica-Bold').text(schema.name.toUpperCase(), { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666666').text(`Project: ${event.project?.name || 'N/A'}`, { align: 'center' });
      doc.moveDown(1);

      // Fields
      for (const field of schema.fields) {
        const value = fieldValues[field.name];
        if (value !== null && value !== undefined) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text(field.label.toUpperCase());
          doc.fontSize(11).font('Helvetica').fillColor('#000000').text(value || 'N/A');
          doc.moveDown(0.8);
        }
      }

      // Footer
      doc.fontSize(8).fillColor('#999999')
        .text(`Generated by FieldConnect`, 50, 750, { align: 'center' });

      doc.end();

      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  /**
   * Get PDF for an event
   */
  async getPdf(eventId) {
    const schemaData = await prisma.eventSchemaData.findUnique({
      where: { eventId },
    });

    if (!schemaData || !schemaData.generatedPdfPath) {
      return null;
    }

    if (!fs.existsSync(schemaData.generatedPdfPath)) {
      return null;
    }

    return {
      filePath: schemaData.generatedPdfPath,
      fileName: schemaData.generatedPdfName,
    };
  }
}

module.exports = new SchemaPdfService();
