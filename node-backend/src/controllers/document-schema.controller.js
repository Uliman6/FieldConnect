/**
 * Document Schema Controller
 * Handles API endpoints for document schema learning
 */

const documentSchemaService = require('../services/document-schema.service');

/**
 * Learn schema from uploaded document
 * POST /api/document-schemas
 */
const learnSchema = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { name, documentType, projectId, description } = req.body;

    if (!documentType) {
      return res.status(400).json({
        error: 'Document type is required',
        validTypes: ['PUNCH_LIST', 'RFI', 'DAILY_REPORT', 'SAFETY_REPORT', 'INSPECTION', 'CUSTOM']
      });
    }

    // Check if AI is available
    if (!documentSchemaService.isAvailable()) {
      return res.status(503).json({
        error: 'AI service not available. Please configure OPENAI_API_KEY or GROQ_API_KEY.'
      });
    }

    console.log('[document-schema] Learning schema from:', req.file.originalname);

    const schema = await documentSchemaService.learnSchemaFromDocument(req.file, {
      name,
      documentType,
      projectId: projectId || null,
      description,
    });

    res.status(201).json({
      message: 'Schema learned successfully',
      schema,
    });
  } catch (error) {
    console.error('[document-schema] Error learning schema:', error);
    res.status(500).json({
      error: 'Failed to learn schema from document',
      details: error.message
    });
  }
};

/**
 * Get all schemas
 * GET /api/document-schemas
 */
const getSchemas = async (req, res) => {
  try {
    const { projectId, type } = req.query;

    let schemas;
    if (type) {
      schemas = await documentSchemaService.getSchemasByType(type, projectId);
    } else {
      schemas = await documentSchemaService.getSchemas(projectId);
    }

    res.json(schemas);
  } catch (error) {
    console.error('[document-schema] Error fetching schemas:', error);
    res.status(500).json({ error: 'Failed to fetch schemas' });
  }
};

/**
 * Get single schema
 * GET /api/document-schemas/:id
 */
const getSchemaById = async (req, res) => {
  try {
    const { id } = req.params;
    const schema = await documentSchemaService.getSchemaById(id);

    if (!schema) {
      return res.status(404).json({ error: 'Schema not found' });
    }

    res.json(schema);
  } catch (error) {
    console.error('[document-schema] Error fetching schema:', error);
    res.status(500).json({ error: 'Failed to fetch schema' });
  }
};

/**
 * Update schema (refine fields after review)
 * PUT /api/document-schemas/:id
 */
const updateSchema = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, fields, isActive } = req.body;

    const schema = await documentSchemaService.updateSchema(id, {
      name,
      description,
      fields,
      isActive,
    });

    res.json({
      message: 'Schema updated successfully',
      schema,
    });
  } catch (error) {
    console.error('[document-schema] Error updating schema:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Schema not found' });
    }
    res.status(500).json({ error: 'Failed to update schema' });
  }
};

/**
 * Delete schema (soft delete)
 * DELETE /api/document-schemas/:id
 */
const deleteSchema = async (req, res) => {
  try {
    const { id } = req.params;
    await documentSchemaService.deleteSchema(id);
    res.json({ message: 'Schema deleted successfully' });
  } catch (error) {
    console.error('[document-schema] Error deleting schema:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Schema not found' });
    }
    res.status(500).json({ error: 'Failed to delete schema' });
  }
};

/**
 * Analyze document without saving (preview)
 * POST /api/document-schemas/analyze
 */
const analyzeDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { documentType } = req.body;

    if (!documentSchemaService.isAvailable()) {
      return res.status(503).json({
        error: 'AI service not available. Please configure OPENAI_API_KEY or GROQ_API_KEY.'
      });
    }

    // Extract and analyze without saving
    let extractedContent;
    const mimeType = req.file.mimetype;

    if (mimeType === 'application/pdf') {
      extractedContent = await documentSchemaService.extractTextFromPdf(req.file.buffer);
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      extractedContent = await documentSchemaService.extractTextFromDocx(req.file.buffer);
    } else if (mimeType === 'text/plain') {
      extractedContent = { text: req.file.buffer.toString('utf8') };
    } else {
      return res.status(400).json({ error: `Unsupported file type: ${mimeType}` });
    }

    const text = extractedContent.text;
    if (!text || text.length < 50) {
      return res.status(400).json({
        error: 'Could not extract sufficient text from document',
        extractedLength: text?.length || 0
      });
    }

    const schema = await documentSchemaService.analyzeWithAI(
      text,
      documentType || 'CUSTOM',
      req.file.originalname
    );

    res.json({
      message: 'Document analyzed successfully',
      fileName: req.file.originalname,
      extractedTextLength: text.length,
      schema,
    });
  } catch (error) {
    console.error('[document-schema] Error analyzing document:', error);
    res.status(500).json({
      error: 'Failed to analyze document',
      details: error.message
    });
  }
};

module.exports = {
  learnSchema,
  getSchemas,
  getSchemaById,
  updateSchema,
  deleteSchema,
  analyzeDocument,
};
