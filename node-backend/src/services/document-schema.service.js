/**
 * Document Schema Service
 * Analyzes sample documents to learn field structures
 * Uses AI to extract schema from PDFs, DOCX, and other formats
 */

const { PDFDocument } = require('pdf-lib');
const prisma = require('./prisma');

// AI API configuration (reuse from transcript parser)
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const useGroq = !!GROQ_API_KEY;
const AI_API_KEY = GROQ_API_KEY || OPENAI_API_KEY;
const CHAT_ENDPOINT = useGroq
  ? 'https://api.groq.com/openai/v1/chat/completions'
  : 'https://api.openai.com/v1/chat/completions';
const CHAT_MODEL = useGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

class DocumentSchemaService {
  /**
   * Check if AI is available for schema extraction
   */
  isAvailable() {
    return !!AI_API_KEY;
  }

  /**
   * Extract text content from a PDF buffer
   * Note: This is basic extraction - for complex layouts, consider using vision models
   */
  async extractTextFromPdf(buffer) {
    try {
      // pdf-lib doesn't extract text well, so we'll use a simple approach
      // For production, consider using pdf-parse or a vision model
      const pdfDoc = await PDFDocument.load(buffer);
      const pages = pdfDoc.getPages();

      // Get basic info
      const pageCount = pages.length;

      // Try to extract text using raw PDF content
      // This is a simplified approach - real text extraction needs pdf-parse
      const textContent = await this.extractRawPdfText(buffer);

      return {
        pageCount,
        text: textContent,
        metadata: {
          title: pdfDoc.getTitle() || null,
          author: pdfDoc.getAuthor() || null,
          subject: pdfDoc.getSubject() || null,
        }
      };
    } catch (error) {
      console.error('[document-schema] PDF extraction error:', error.message);
      throw new Error('Failed to extract text from PDF');
    }
  }

  /**
   * Extract raw text from PDF buffer
   * Simple regex-based extraction for PDF text streams
   */
  async extractRawPdfText(buffer) {
    // Convert buffer to string and look for text patterns
    const content = buffer.toString('latin1');

    // Look for text in BT...ET blocks (PDF text objects)
    const textMatches = [];
    const btPattern = /BT[\s\S]*?ET/g;
    let match;

    while ((match = btPattern.exec(content)) !== null) {
      // Extract text from Tj and TJ operators
      const tjPattern = /\(([^)]+)\)\s*Tj/g;
      const tjArrayPattern = /\[([^\]]+)\]\s*TJ/g;

      let tjMatch;
      while ((tjMatch = tjPattern.exec(match[0])) !== null) {
        textMatches.push(this.decodePdfString(tjMatch[1]));
      }

      while ((tjMatch = tjArrayPattern.exec(match[0])) !== null) {
        // Parse TJ array which contains strings and numbers
        const arrayContent = tjMatch[1];
        const stringPattern = /\(([^)]*)\)/g;
        let strMatch;
        while ((strMatch = stringPattern.exec(arrayContent)) !== null) {
          textMatches.push(this.decodePdfString(strMatch[1]));
        }
      }
    }

    // Join and clean up
    let text = textMatches.join(' ');

    // Clean up common PDF encoding artifacts
    text = text.replace(/\\n/g, '\n');
    text = text.replace(/\\r/g, '');
    text = text.replace(/\s+/g, ' ');

    return text.trim();
  }

  /**
   * Decode PDF string escapes
   */
  decodePdfString(str) {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
  }

  /**
   * Extract text from DOCX buffer
   */
  async extractTextFromDocx(buffer) {
    try {
      // DOCX is a ZIP file containing XML
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(buffer);
      const documentXml = zip.readAsText('word/document.xml');

      // Strip XML tags to get plain text
      const text = documentXml
        .replace(/<[^>]+>/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();

      return { text };
    } catch (error) {
      console.error('[document-schema] DOCX extraction error:', error.message);
      throw new Error('Failed to extract text from DOCX');
    }
  }

  /**
   * Analyze document text with AI to extract field schema
   */
  async analyzeWithAI(text, documentType, fileName) {
    if (!AI_API_KEY) {
      throw new Error('No AI API key configured');
    }

    const systemPrompt = `You are a document structure analyst. Your job is to analyze sample documents and extract their field schema - the structured fields that make up the document.

TASK: Analyze the provided document text and identify ALL fields/data points that would need to be captured to recreate this document type.

OUTPUT FORMAT: Return a JSON object with:
{
  "documentName": "Human-readable name for this document type",
  "description": "Brief description of what this document is used for",
  "fields": [
    {
      "name": "field_name_snake_case",
      "label": "Human Readable Label",
      "type": "text|number|date|datetime|boolean|select|multiline|person|company|location|attachment",
      "description": "What this field captures",
      "required": true/false,
      "examples": ["Example value 1", "Example value 2"]
    }
  ],
  "sections": ["Section names if document has clear sections"],
  "confidence": 0.0-1.0
}

FIELD TYPE GUIDE:
- text: Short text (names, titles, IDs)
- number: Numeric values
- date: Date only (YYYY-MM-DD)
- datetime: Date and time
- boolean: Yes/No, True/False, Checked/Unchecked
- select: Pick from predefined options (include options in description)
- multiline: Long text, descriptions, notes
- person: Person's name (can be linked to contacts)
- company: Company/trade name (can be linked to directory)
- location: Physical location, room, area
- attachment: Photos, files, references

IMPORTANT:
- Extract EVERY distinct field you can identify
- Include fields that appear in headers, footers, metadata
- Identify fields that reference people, companies, locations
- Note any ID numbers, dates, statuses
- Look for repeated structures (like line items in a list)`;

    const userPrompt = `Analyze this ${documentType} document and extract its field schema.

File: ${fileName}

Document Content:
---
${text.substring(0, 8000)}
---

${text.length > 8000 ? `[Document truncated - ${text.length} total characters]` : ''}

Return the JSON schema for this document type.`;

    try {
      console.log(`[document-schema] Analyzing with ${useGroq ? 'Groq' : 'OpenAI'}...`);

      const response = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[document-schema] AI API error:', response.status, errorText);
        throw new Error(`AI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content in AI response');
      }

      // Parse JSON from response (handle markdown code blocks)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const schema = JSON.parse(jsonStr.trim());
      console.log('[document-schema] Extracted schema with', schema.fields?.length || 0, 'fields');

      return schema;
    } catch (error) {
      console.error('[document-schema] AI analysis error:', error.message);
      throw error;
    }
  }

  /**
   * Main method: Analyze a document and save the learned schema
   */
  async learnSchemaFromDocument(file, options = {}) {
    const { name, documentType, projectId, description } = options;

    console.log('[document-schema] Learning schema from:', file.originalname);

    // Extract text based on file type
    let extractedContent;
    const mimeType = file.mimetype;

    if (mimeType === 'application/pdf') {
      extractedContent = await this.extractTextFromPdf(file.buffer);
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      extractedContent = await this.extractTextFromDocx(file.buffer);
    } else if (mimeType === 'text/plain') {
      extractedContent = { text: file.buffer.toString('utf8') };
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    const text = extractedContent.text;
    if (!text || text.length < 50) {
      throw new Error('Could not extract sufficient text from document. Try a different file or format.');
    }

    console.log('[document-schema] Extracted', text.length, 'characters');

    // Analyze with AI
    const aiSchema = await this.analyzeWithAI(text, documentType, file.originalname);

    // Save to database
    const schema = await prisma.documentSchema.create({
      data: {
        name: name || aiSchema.documentName || `${documentType} Schema`,
        description: description || aiSchema.description,
        documentType: documentType || 'CUSTOM',
        projectId: projectId || null,
        sourceFileName: file.originalname,
        fields: aiSchema.fields || [],
        analysisNotes: aiSchema.sections ? `Sections: ${aiSchema.sections.join(', ')}` : null,
        confidence: aiSchema.confidence || null,
      },
    });

    return {
      id: schema.id,
      name: schema.name,
      description: schema.description,
      documentType: schema.documentType,
      fields: schema.fields,
      confidence: schema.confidence,
      sourceFileName: schema.sourceFileName,
    };
  }

  /**
   * Get all schemas, optionally filtered by project
   */
  async getSchemas(projectId = null) {
    const where = { isActive: true };
    if (projectId) {
      where.OR = [
        { projectId },
        { projectId: null } // Include global schemas
      ];
    }

    return prisma.documentSchema.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        documentType: true,
        projectId: true,
        sourceFileName: true,
        fields: true,
        confidence: true,
        createdAt: true,
      },
    });
  }

  /**
   * Get a single schema by ID
   */
  async getSchemaById(id) {
    return prisma.documentSchema.findUnique({
      where: { id },
    });
  }

  /**
   * Update a schema (e.g., to refine fields after review)
   */
  async updateSchema(id, updates) {
    const { name, description, fields, isActive } = updates;

    const data = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (fields !== undefined) data.fields = fields;
    if (isActive !== undefined) data.isActive = isActive;

    if (fields !== undefined) {
      // Increment version when fields change
      data.version = { increment: 1 };
    }

    return prisma.documentSchema.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a schema (soft delete)
   */
  async deleteSchema(id) {
    return prisma.documentSchema.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Get schemas by document type
   */
  async getSchemasByType(documentType, projectId = null) {
    const where = {
      documentType,
      isActive: true,
    };

    if (projectId) {
      where.OR = [
        { projectId },
        { projectId: null }
      ];
    } else {
      where.projectId = null;
    }

    return prisma.documentSchema.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}

module.exports = new DocumentSchemaService();
