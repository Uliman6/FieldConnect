/**
 * Schema PDF Service
 * Generates professional PDF documents from extracted schema data
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const prisma = require('./prisma');

/**
 * Fetch image from URL and return buffer for PDFKit
 * @param {string} url - Image URL (Cloudinary or other)
 * @returns {Promise<Buffer|null>}
 */
async function fetchImageBuffer(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[schema-pdf] Failed to fetch image: ${response.status}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error('[schema-pdf] Error fetching image:', err.message);
    return null;
  }
}

/**
 * Check if a path is a URL
 */
function isUrl(path) {
  return path && (path.startsWith('http://') || path.startsWith('https://'));
}

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
    // Get event with schema data and photos
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        schemaData: {
          include: { schema: true }
        },
        project: true,
        photos: true,
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
    const photos = event.photos || [];

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTitle = (fieldValues.title || event.title || 'document')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 30);
    const fileName = `${schema.documentType}_${safeTitle}_${timestamp}.pdf`;
    const filePath = path.join(UPLOADS_DIR, fileName);

    // Create PDF based on document type
    if (schema.documentType === 'PUNCH_LIST') {
      await this.generatePunchListPdf(filePath, event, schemaData, fieldValues, photos);
    } else if (schema.documentType === 'RFI') {
      await this.generateRfiPdf(filePath, event, schemaData, fieldValues, photos);
    } else {
      await this.generateGenericPdf(filePath, event, schemaData, fieldValues, photos);
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
   * Add photos section to PDF
   * Supports both local file paths and Cloudinary URLs
   */
  async addPhotosToDoc(doc, photos, leftCol = 50) {
    if (!photos || photos.length === 0) return;

    // Add page break before photos if needed
    if (doc.y > 550) {
      doc.addPage();
    }

    doc.moveDown(1);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text('PHOTOS', leftCol);
    doc.moveDown(0.5);

    // Layout: 2 photos per row, large size like reference documents
    const photoWidth = 245;
    const photoHeight = 320;
    const margin = 10;

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];

      // Check if we need a new page (larger photos need more space)
      if (doc.y + photoHeight + 50 > doc.page.height - 70) {
        doc.addPage();
      }

      // Calculate position (2 columns)
      const col = i % 2;
      const x = leftCol + col * (photoWidth + margin);

      // If starting a new row (except first), adjust Y
      if (i > 0 && col === 0) {
        doc.moveDown(0.5);
      }

      const y = doc.y;

      try {
        let imageSource;

        // Check if filePath is a URL (Cloudinary) or local file
        if (isUrl(photo.filePath)) {
          // Fetch image from Cloudinary URL
          console.log(`[schema-pdf] Fetching photo from URL: ${photo.filePath}`);
          imageSource = await fetchImageBuffer(photo.filePath);
          if (!imageSource) {
            throw new Error('Failed to fetch image from URL');
          }
        } else {
          // Local file - check if it exists
          await fsPromises.access(photo.filePath);
          imageSource = photo.filePath;
        }

        // Add image to PDF
        doc.image(imageSource, x, y, {
          width: photoWidth,
          height: photoHeight,
          fit: [photoWidth, photoHeight],
          align: 'center',
          valign: 'center'
        });

        // Add caption below image
        if (photo.caption) {
          doc.fontSize(8).font('Helvetica').fillColor('#666666')
            .text(photo.caption, x, y + photoHeight + 5, {
              width: photoWidth,
              align: 'center'
            });
        }

        // Only move down after completing a row
        if (col === 1 || i === photos.length - 1) {
          doc.y = y + photoHeight + (photo.caption ? 25 : 10);
        }
      } catch (err) {
        // File/URL not available - add placeholder
        console.error(`[schema-pdf] Photo not available: ${err.message}`);
        doc.rect(x, y, photoWidth, photoHeight).strokeColor('#CCCCCC').stroke();
        doc.fontSize(9).font('Helvetica').fillColor('#999999')
          .text('Photo not available', x, y + photoHeight / 2, {
            width: photoWidth,
            align: 'center'
          });

        if (col === 1 || i === photos.length - 1) {
          doc.y = y + photoHeight + 10;
        }
      }
    }
  }

  /**
   * Generate Punch List PDF
   */
  async generatePunchListPdf(filePath, event, schemaData, fieldValues, photos = []) {
    const self = this;
    return new Promise(async (resolve, reject) => {
      try {
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

        // Photos section
        if (photos.length > 0) {
          await self.addPhotosToDoc(doc, photos, leftCol);
        }

        // Footer
        doc.fontSize(8).fillColor('#999999')
          .text(`Generated by FieldConnect  |  Event ID: ${event.id.substring(0, 8)}`, 50, doc.page.height - 50, { align: 'center' });

        doc.end();

        stream.on('finish', resolve);
        stream.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generate RFI PDF
   */
  async generateRfiPdf(filePath, event, schemaData, fieldValues, photos = []) {
    const self = this;
    return new Promise(async (resolve, reject) => {
      try {
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

        doc.moveDown(2);

        // Photos section
        if (photos.length > 0) {
          await self.addPhotosToDoc(doc, photos, leftCol);
        }

        // Footer
        doc.fontSize(8).fillColor('#999999')
          .text(`Generated by FieldConnect  |  Event ID: ${event.id.substring(0, 8)}`, 50, doc.page.height - 50, { align: 'center' });

        doc.end();

        stream.on('finish', resolve);
        stream.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generate generic PDF for custom schemas
   */
  async generateGenericPdf(filePath, event, schemaData, fieldValues, photos = []) {
    const self = this;
    return new Promise(async (resolve, reject) => {
      try {
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

        // Photos section
        if (photos.length > 0) {
          doc.moveDown(1);
          await self.addPhotosToDoc(doc, photos, 50);
        }

        // Footer
        doc.fontSize(8).fillColor('#999999')
          .text(`Generated by FieldConnect`, 50, doc.page.height - 50, { align: 'center' });

        doc.end();

        stream.on('finish', resolve);
        stream.on('error', reject);
      } catch (err) {
        reject(err);
      }
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
