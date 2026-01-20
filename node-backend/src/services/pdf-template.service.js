const { PDFDocument, PDFName, PDFDict, PDFString, PDFBool } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const prisma = require('../lib/prisma');

class PdfTemplateService {
  constructor() {
    this.uploadsDir = path.join(process.cwd(), 'uploads', 'templates');
    this.filledDir = path.join(process.cwd(), 'uploads', 'filled');
  }

  async ensureDirectories() {
    await fs.mkdir(this.uploadsDir, { recursive: true });
    await fs.mkdir(this.filledDir, { recursive: true });
  }

  /**
   * Extract form fields from a PDF file
   * @param {Buffer} pdfBuffer - The PDF file buffer
   * @returns {Array} Array of form field definitions
   */
  async extractFormFields(pdfBuffer) {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    const fieldDefinitions = [];

    for (const field of fields) {
      const name = field.getName();
      const fieldType = this.getFieldType(field);

      const fieldDef = {
        name,
        type: fieldType.type,
        label: this.formatFieldLabel(name),
        required: false,
        options: fieldType.options || null
      };

      fieldDefinitions.push(fieldDef);
    }

    return fieldDefinitions;
  }

  /**
   * Determine the field type from a PDF form field
   */
  getFieldType(field) {
    const constructor = field.constructor.name;

    switch (constructor) {
      case 'PDFTextField':
        return { type: 'text' };
      case 'PDFCheckBox':
        return { type: 'checkbox' };
      case 'PDFDropdown':
        const options = field.getOptions ? field.getOptions() : [];
        return { type: 'dropdown', options };
      case 'PDFRadioGroup':
        const radioOptions = field.getOptions ? field.getOptions() : [];
        return { type: 'radio', options: radioOptions };
      case 'PDFOptionList':
        const listOptions = field.getOptions ? field.getOptions() : [];
        return { type: 'list', options: listOptions };
      default:
        return { type: 'text' };
    }
  }

  /**
   * Format a field name into a human-readable label
   */
  formatFieldLabel(fieldName) {
    // Remove common prefixes
    let label = fieldName.replace(/^(txt|chk|ddl|opt|rb)_?/i, '');

    // Convert camelCase or PascalCase to spaces
    label = label.replace(/([a-z])([A-Z])/g, '$1 $2');

    // Convert underscores and hyphens to spaces
    label = label.replace(/[_-]/g, ' ');

    // Capitalize first letter of each word
    label = label.replace(/\b\w/g, l => l.toUpperCase());

    return label.trim();
  }

  /**
   * Save an uploaded template to disk and database
   */
  async saveTemplate(file, templateData) {
    await this.ensureDirectories();

    const { name, description, templateType } = templateData;
    const fileName = `${Date.now()}-${file.originalname}`;
    const filePath = path.join(this.uploadsDir, fileName);

    // Save file to disk
    await fs.writeFile(filePath, file.buffer);

    // Extract form fields
    const formFields = await this.extractFormFields(file.buffer);

    // Save to database
    const template = await prisma.pdfTemplate.create({
      data: {
        name,
        description,
        templateType,
        fileName: file.originalname,
        filePath: filePath,
        fileSize: file.size,
        formFields,
        createdById: templateData.createdById
      }
    });

    return template;
  }

  /**
   * Get all active templates
   */
  async getActiveTemplates() {
    return prisma.pdfTemplate.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get a template by ID with form fields
   */
  async getTemplateById(id) {
    return prisma.pdfTemplate.findUnique({
      where: { id }
    });
  }

  /**
   * Update template (replace file or update metadata)
   */
  async updateTemplate(id, file, templateData) {
    const existing = await prisma.pdfTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Template not found');
    }

    const updateData = {};

    if (templateData.name) updateData.name = templateData.name;
    if (templateData.description !== undefined) updateData.description = templateData.description;
    if (templateData.templateType) updateData.templateType = templateData.templateType;

    // If new file provided, replace the old one
    if (file) {
      await this.ensureDirectories();

      const fileName = `${Date.now()}-${file.originalname}`;
      const filePath = path.join(this.uploadsDir, fileName);

      // Delete old file
      try {
        await fs.unlink(existing.filePath);
      } catch (err) {
        console.warn('Could not delete old template file:', err.message);
      }

      // Save new file
      await fs.writeFile(filePath, file.buffer);

      // Extract new form fields
      const formFields = await this.extractFormFields(file.buffer);

      updateData.fileName = file.originalname;
      updateData.filePath = filePath;
      updateData.fileSize = file.size;
      updateData.formFields = formFields;
      updateData.version = existing.version + 1;
    }

    return prisma.pdfTemplate.update({
      where: { id },
      data: updateData
    });
  }

  /**
   * Soft delete a template
   */
  async deleteTemplate(id) {
    return prisma.pdfTemplate.update({
      where: { id },
      data: { isActive: false }
    });
  }

  /**
   * Get the template file for download
   */
  async getTemplateFile(id) {
    const template = await prisma.pdfTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new Error('Template not found');
    }

    const fileBuffer = await fs.readFile(template.filePath);
    return {
      buffer: fileBuffer,
      fileName: template.fileName,
      contentType: 'application/pdf'
    };
  }

  /**
   * Fill a template with data and save
   */
  async fillTemplate(templateId, eventId, fieldValues) {
    await this.ensureDirectories();

    const template = await prisma.pdfTemplate.findUnique({ where: { id: templateId } });
    if (!template) {
      throw new Error('Template not found');
    }

    // Load the template PDF
    const templateBuffer = await fs.readFile(template.filePath);
    const pdfDoc = await PDFDocument.load(templateBuffer);
    const form = pdfDoc.getForm();

    // Fill in the fields
    for (const [fieldName, value] of Object.entries(fieldValues)) {
      try {
        const field = form.getField(fieldName);
        if (!field) continue;

        const fieldType = field.constructor.name;

        switch (fieldType) {
          case 'PDFTextField':
            field.setText(String(value || ''));
            break;
          case 'PDFCheckBox':
            if (value === true || value === 'true' || value === '1') {
              field.check();
            } else {
              field.uncheck();
            }
            break;
          case 'PDFDropdown':
            if (value) {
              field.select(String(value));
            }
            break;
          case 'PDFRadioGroup':
            if (value) {
              field.select(String(value));
            }
            break;
        }
      } catch (err) {
        console.warn(`Could not fill field ${fieldName}:`, err.message);
      }
    }

    // Flatten the form to make it read-only (optional)
    // form.flatten();

    // Save the filled PDF
    const filledPdfBytes = await pdfDoc.save();
    const filledFileName = `${eventId}-${Date.now()}.pdf`;
    const filledPath = path.join(this.filledDir, filledFileName);

    await fs.writeFile(filledPath, filledPdfBytes);

    // Save or update the event template data
    const existingData = await prisma.eventTemplateData.findUnique({
      where: { eventId }
    });

    if (existingData) {
      await prisma.eventTemplateData.update({
        where: { eventId },
        data: {
          fieldValues,
          generatedPdfPath: filledPath
        }
      });
    } else {
      await prisma.eventTemplateData.create({
        data: {
          eventId,
          templateId,
          fieldValues,
          generatedPdfPath: filledPath
        }
      });
    }

    return {
      filledPath,
      fieldValues
    };
  }

  /**
   * Get filled PDF for an event
   */
  async getFilledPdf(eventId) {
    const templateData = await prisma.eventTemplateData.findUnique({
      where: { eventId },
      include: { template: true }
    });

    if (!templateData || !templateData.generatedPdfPath) {
      throw new Error('No filled PDF found for this event');
    }

    const fileBuffer = await fs.readFile(templateData.generatedPdfPath);
    return {
      buffer: fileBuffer,
      fileName: `${templateData.template.name}-filled.pdf`,
      contentType: 'application/pdf'
    };
  }

  /**
   * Get event template data
   */
  async getEventTemplateData(eventId) {
    return prisma.eventTemplateData.findUnique({
      where: { eventId },
      include: { template: true }
    });
  }

  /**
   * Attach a template to an event
   */
  async attachTemplateToEvent(eventId, templateId) {
    // Update the event with the template ID
    const event = await prisma.event.update({
      where: { id: eventId },
      data: { templateId },
      include: { template: true }
    });

    return event;
  }
}

module.exports = new PdfTemplateService();
