/**
 * Schema Data Controller
 * Handles API endpoints for applying document schemas to events
 */

const schemaExtractionService = require('../services/schema-extraction.service');
const schemaPdfService = require('../services/schema-pdf.service');
const fs = require('fs');
const prisma = require('../services/prisma');

/**
 * Helper: Check if user has access to a project
 */
const checkProjectAccess = (req, projectId) => {
  // If accessibleProjectIds is null, user is admin with access to all
  if (req.accessibleProjectIds === null) return true;
  // Check if projectId is in user's accessible projects
  return req.accessibleProjectIds.includes(projectId);
};

/**
 * Helper: Get event and verify access
 */
const getEventWithAccessCheck = async (req, eventId) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, projectId: true }
  });

  if (!event) return { error: 'not_found', event: null };

  if (!checkProjectAccess(req, event.projectId)) {
    return { error: 'no_access', event: null };
  }

  return { error: null, event };
};

/**
 * Apply schema to event - AI extracts fields from transcript
 * POST /api/events/:eventId/apply-schema
 */
const applySchema = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { schemaId } = req.body;

    // ACCESS CONTROL: Check if user has access to this event
    const { error } = await getEventWithAccessCheck(req, eventId);
    if (error === 'not_found') {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (error === 'no_access') {
      return res.status(403).json({ error: 'You do not have access to this event' });
    }

    if (!schemaId) {
      return res.status(400).json({ error: 'schemaId is required' });
    }

    if (!schemaExtractionService.isAvailable()) {
      return res.status(503).json({
        error: 'AI service not available. Please configure OPENAI_API_KEY or GROQ_API_KEY.'
      });
    }

    const schemaData = await schemaExtractionService.applySchemaToEvent(eventId, schemaId);

    res.status(201).json({
      message: 'Schema applied successfully',
      schemaData,
    });
  } catch (error) {
    console.error('[schema-data] Error applying schema:', error);

    if (error.message === 'Event not found') {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (error.message === 'Schema not found') {
      return res.status(404).json({ error: 'Schema not found' });
    }
    if (error.message === 'Event has no transcript text' || error.message === 'Event has no transcript text or description to extract from') {
      return res.status(400).json({ error: 'Event has no text content to extract from' });
    }
    if (error.message === 'Schema is not active') {
      return res.status(400).json({ error: 'Schema is not active' });
    }

    res.status(500).json({
      error: 'Failed to apply schema',
      details: error.message
    });
  }
};

/**
 * Get schema data for an event
 * GET /api/events/:eventId/schema-data
 */
const getSchemaData = async (req, res) => {
  try {
    const { eventId } = req.params;

    // ACCESS CONTROL: Check if user has access to this event
    const { error } = await getEventWithAccessCheck(req, eventId);
    if (error === 'not_found') {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (error === 'no_access') {
      return res.status(403).json({ error: 'You do not have access to this event' });
    }

    const schemaData = await schemaExtractionService.getSchemaData(eventId);

    if (!schemaData) {
      return res.status(404).json({ error: 'No schema data found for this event' });
    }

    res.json(schemaData);
  } catch (error) {
    console.error('[schema-data] Error fetching schema data:', error);
    res.status(500).json({ error: 'Failed to fetch schema data' });
  }
};

/**
 * Update schema data field values (manual edit)
 * PATCH /api/events/:eventId/schema-data
 */
const updateSchemaData = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { fieldValues } = req.body;

    // ACCESS CONTROL: Check if user has access to this event
    const { error } = await getEventWithAccessCheck(req, eventId);
    if (error === 'not_found') {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (error === 'no_access') {
      return res.status(403).json({ error: 'You do not have access to this event' });
    }

    if (!fieldValues || typeof fieldValues !== 'object') {
      return res.status(400).json({ error: 'fieldValues object is required' });
    }

    const schemaData = await schemaExtractionService.updateSchemaData(eventId, fieldValues);

    res.json({
      message: 'Schema data updated successfully',
      schemaData,
    });
  } catch (error) {
    console.error('[schema-data] Error updating schema data:', error);

    if (error.message === 'No schema data found for this event') {
      return res.status(404).json({ error: 'No schema data found for this event' });
    }

    res.status(500).json({ error: 'Failed to update schema data' });
  }
};

/**
 * Remove schema data from event
 * DELETE /api/events/:eventId/schema-data
 */
const removeSchemaData = async (req, res) => {
  try {
    const { eventId } = req.params;

    // ACCESS CONTROL: Check if user has access to this event
    const { error } = await getEventWithAccessCheck(req, eventId);
    if (error === 'not_found') {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (error === 'no_access') {
      return res.status(403).json({ error: 'You do not have access to this event' });
    }

    await schemaExtractionService.removeSchemaData(eventId);
    res.json({ message: 'Schema data removed successfully' });
  } catch (error) {
    console.error('[schema-data] Error removing schema data:', error);

    if (error.message === 'No schema data found for this event') {
      return res.status(404).json({ error: 'No schema data found for this event' });
    }

    res.status(500).json({ error: 'Failed to remove schema data' });
  }
};

/**
 * Re-extract fields from transcript
 * POST /api/events/:eventId/re-extract
 */
const reExtract = async (req, res) => {
  try {
    const { eventId } = req.params;

    // ACCESS CONTROL: Check if user has access to this event
    const { error } = await getEventWithAccessCheck(req, eventId);
    if (error === 'not_found') {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (error === 'no_access') {
      return res.status(403).json({ error: 'You do not have access to this event' });
    }

    if (!schemaExtractionService.isAvailable()) {
      return res.status(503).json({
        error: 'AI service not available. Please configure OPENAI_API_KEY or GROQ_API_KEY.'
      });
    }

    const schemaData = await schemaExtractionService.reExtractFields(eventId);

    res.json({
      message: 'Fields re-extracted successfully',
      schemaData,
    });
  } catch (error) {
    console.error('[schema-data] Error re-extracting fields:', error);

    if (error.message === 'No schema data found for this event') {
      return res.status(404).json({ error: 'No schema data found for this event' });
    }

    res.status(500).json({
      error: 'Failed to re-extract fields',
      details: error.message
    });
  }
};

/**
 * Generate PDF from schema data
 * POST /api/events/:eventId/generate-pdf
 */
const generatePdf = async (req, res) => {
  try {
    const { eventId } = req.params;

    // ACCESS CONTROL: Check if user has access to this event
    const { error } = await getEventWithAccessCheck(req, eventId);
    if (error === 'not_found') {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (error === 'no_access') {
      return res.status(403).json({ error: 'You do not have access to this event' });
    }

    console.log('[schema-data] Generating PDF for event:', eventId);

    const result = await schemaPdfService.generatePdf(eventId);

    res.json({
      message: 'PDF generated successfully',
      fileName: result.fileName,
    });
  } catch (error) {
    console.error('[schema-data] Error generating PDF:', error);

    if (error.message === 'Event not found') {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (error.message === 'No schema data found for this event') {
      return res.status(404).json({ error: 'No schema data found for this event' });
    }

    res.status(500).json({
      error: 'Failed to generate PDF',
      details: error.message
    });
  }
};

/**
 * Download generated PDF
 * GET /api/events/:eventId/download-pdf
 */
const downloadPdf = async (req, res) => {
  try {
    const { eventId } = req.params;

    // ACCESS CONTROL: Check if user has access to this event
    const { error } = await getEventWithAccessCheck(req, eventId);
    if (error === 'not_found') {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (error === 'no_access') {
      return res.status(403).json({ error: 'You do not have access to this event' });
    }

    const result = await schemaPdfService.getPdf(eventId);

    if (!result) {
      return res.status(404).json({ error: 'No PDF found. Generate one first.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);

    const stream = fs.createReadStream(result.filePath);
    stream.pipe(res);
  } catch (error) {
    console.error('[schema-data] Error downloading PDF:', error);
    res.status(500).json({ error: 'Failed to download PDF' });
  }
};

module.exports = {
  applySchema,
  getSchemaData,
  updateSchemaData,
  removeSchemaData,
  reExtract,
  generatePdf,
  downloadPdf,
};
