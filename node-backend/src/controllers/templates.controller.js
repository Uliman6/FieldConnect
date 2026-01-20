const pdfTemplateService = require('../services/pdf-template.service');

/**
 * Upload a new PDF template
 * POST /api/templates
 */
const uploadTemplate = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const { name, description, templateType } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    if (!templateType) {
      return res.status(400).json({ error: 'Template type is required (PUNCH_LIST, RFI, or CUSTOM)' });
    }

    const template = await pdfTemplateService.saveTemplate(req.file, {
      name,
      description,
      templateType,
      createdById: req.userId
    });

    res.status(201).json(template);
  } catch (error) {
    console.error('Error uploading template:', error);
    res.status(500).json({ error: 'Failed to upload template', details: error.message });
  }
};

/**
 * Get all active templates
 * GET /api/templates
 */
const getTemplates = async (req, res) => {
  try {
    const templates = await pdfTemplateService.getActiveTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
};

/**
 * Get a single template by ID
 * GET /api/templates/:id
 */
const getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await pdfTemplateService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
};

/**
 * Update a template
 * PUT /api/templates/:id
 */
const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, templateType } = req.body;

    const template = await pdfTemplateService.updateTemplate(id, req.file, {
      name,
      description,
      templateType
    });

    res.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    if (error.message === 'Template not found') {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.status(500).json({ error: 'Failed to update template', details: error.message });
  }
};

/**
 * Delete (soft) a template
 * DELETE /api/templates/:id
 */
const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    await pdfTemplateService.deleteTemplate(id);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
};

/**
 * Download a template PDF
 * GET /api/templates/:id/download
 */
const downloadTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await pdfTemplateService.getTemplateFile(id);

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.buffer);
  } catch (error) {
    console.error('Error downloading template:', error);
    if (error.message === 'Template not found') {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.status(500).json({ error: 'Failed to download template' });
  }
};

/**
 * Attach a template to an event
 * POST /api/events/:eventId/template
 */
const attachTemplateToEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { templateId } = req.body;

    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }

    const event = await pdfTemplateService.attachTemplateToEvent(eventId, templateId);
    res.json(event);
  } catch (error) {
    console.error('Error attaching template to event:', error);
    res.status(500).json({ error: 'Failed to attach template', details: error.message });
  }
};

/**
 * Update template field values for an event
 * PATCH /api/events/:eventId/template-data
 */
const updateEventTemplateData = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { templateId, fieldValues } = req.body;

    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }

    if (!fieldValues || typeof fieldValues !== 'object') {
      return res.status(400).json({ error: 'Field values are required' });
    }

    const result = await pdfTemplateService.fillTemplate(templateId, eventId, fieldValues);
    res.json(result);
  } catch (error) {
    console.error('Error updating template data:', error);
    res.status(500).json({ error: 'Failed to update template data', details: error.message });
  }
};

/**
 * Get filled PDF for an event
 * GET /api/events/:eventId/filled-pdf
 */
const getFilledPdf = async (req, res) => {
  try {
    const { eventId } = req.params;
    const file = await pdfTemplateService.getFilledPdf(eventId);

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.buffer);
  } catch (error) {
    console.error('Error getting filled PDF:', error);
    if (error.message === 'No filled PDF found for this event') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get filled PDF' });
  }
};

/**
 * Get event template data
 * GET /api/events/:eventId/template-data
 */
const getEventTemplateData = async (req, res) => {
  try {
    const { eventId } = req.params;
    const templateData = await pdfTemplateService.getEventTemplateData(eventId);

    if (!templateData) {
      return res.status(404).json({ error: 'No template data found for this event' });
    }

    res.json(templateData);
  } catch (error) {
    console.error('Error getting event template data:', error);
    res.status(500).json({ error: 'Failed to get template data' });
  }
};

module.exports = {
  uploadTemplate,
  getTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
  downloadTemplate,
  attachTemplateToEvent,
  updateEventTemplateData,
  getFilledPdf,
  getEventTemplateData
};
