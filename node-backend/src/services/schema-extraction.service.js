/**
 * Schema Extraction Service
 * Uses AI to extract field values from event transcripts based on document schemas
 */

const prisma = require('./prisma');

// AI API configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const useGroq = !!GROQ_API_KEY;
const AI_API_KEY = GROQ_API_KEY || OPENAI_API_KEY;
const CHAT_ENDPOINT = useGroq
  ? 'https://api.groq.com/openai/v1/chat/completions'
  : 'https://api.openai.com/v1/chat/completions';
const CHAT_MODEL = useGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

class SchemaExtractionService {
  /**
   * Check if AI is available
   */
  isAvailable() {
    return !!AI_API_KEY;
  }

  /**
   * Extract field values from transcript using a document schema
   * @param {string} transcript - The event transcript text
   * @param {object} schema - The DocumentSchema with fields array
   * @returns {object} - { fieldValues, confidence }
   */
  async extractFieldsFromTranscript(transcript, schema) {
    if (!AI_API_KEY) {
      throw new Error('No AI API key configured');
    }

    if (!transcript || transcript.trim().length < 10) {
      throw new Error('Transcript is too short for extraction');
    }

    const fields = schema.fields || [];
    if (fields.length === 0) {
      throw new Error('Schema has no fields defined');
    }

    // Build field descriptions for the prompt
    const fieldDescriptions = fields.map(f => {
      let desc = `- ${f.name} (${f.type}): ${f.label}`;
      if (f.description) desc += ` - ${f.description}`;
      if (f.required) desc += ' [REQUIRED]';
      return desc;
    }).join('\n');

    const systemPrompt = `You are a construction document data extractor. Your job is to extract and CLEAN UP field values from a spoken transcript or note into professional construction document format.

DOCUMENT TYPE: ${schema.name}
DESCRIPTION: ${schema.description || 'N/A'}

FIELDS TO EXTRACT:
${fieldDescriptions}

INSTRUCTIONS:
1. Extract values for each field from the transcript
2. For fields not mentioned, use null
3. For "person" type fields, extract full names
4. For "company" type fields, extract company/trade names
5. For "location" type fields, extract room/area/floor references
6. For "date" type fields, extract dates in YYYY-MM-DD format if possible
7. For "multiline" type fields (like description):
   - DO NOT copy the raw transcript verbatim
   - Clean up and summarize into professional, concise language
   - Remove filler words, repetition, and conversational tone
   - Write in third person, past tense for observations
   - Focus on: what the issue is, where it is, what action is needed
8. For "title" fields, create a clear, concise title (5-10 words max)
9. Be precise - only extract what's explicitly stated or clearly implied

EXAMPLE - Converting transcript to description:
Transcript: "we realized that on the east side of the exterior of the building, one of the metal panels has a dent. This dent, we were told by DPR Division 7 that they can come back and apply the manufacturer's paint to make it match the rest of it"
Good description: "Metal panel on east exterior has visible dent. DPR Division 7 to apply manufacturer's touch-up paint to restore appearance."

OUTPUT FORMAT:
Return a JSON object with:
{
  "fieldValues": {
    "field_name": "extracted value or null",
    ...
  },
  "confidence": 0.0-1.0,
  "notes": "Any extraction notes or uncertainties"
}`;

    const userPrompt = `Extract the ${schema.name} fields from this transcript:

---
${transcript}
---

Return the JSON with extracted field values.`;

    try {
      console.log(`[schema-extraction] Extracting ${fields.length} fields using ${useGroq ? 'Groq' : 'OpenAI'}...`);

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
          temperature: 0.2, // Lower temperature for more consistent extraction
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[schema-extraction] AI API error:', response.status, errorText);
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

      const result = JSON.parse(jsonStr.trim());

      console.log('[schema-extraction] Extracted fields:', Object.keys(result.fieldValues || {}).length);

      return {
        fieldValues: result.fieldValues || {},
        confidence: result.confidence || 0.5,
        notes: result.notes || null,
      };
    } catch (error) {
      console.error('[schema-extraction] Extraction error:', error.message);
      throw error;
    }
  }

  /**
   * Apply schema to an event - extract fields and save
   * @param {string} eventId - The event ID
   * @param {string} schemaId - The document schema ID
   * @returns {object} - The created/updated EventSchemaData
   */
  async applySchemaToEvent(eventId, schemaId) {
    // Get the event
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { schemaData: true },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    if (!event.transcriptText) {
      throw new Error('Event has no transcript text');
    }

    // Get the schema
    const schema = await prisma.documentSchema.findUnique({
      where: { id: schemaId },
    });

    if (!schema) {
      throw new Error('Schema not found');
    }

    if (!schema.isActive) {
      throw new Error('Schema is not active');
    }

    // Extract fields from transcript
    const extraction = await this.extractFieldsFromTranscript(
      event.transcriptText,
      schema
    );

    // Create or update EventSchemaData
    const schemaData = await prisma.eventSchemaData.upsert({
      where: { eventId },
      create: {
        eventId,
        schemaId,
        fieldValues: extraction.fieldValues,
        extractedAt: new Date(),
        extractionConfidence: extraction.confidence,
        wasManuallyEdited: false,
      },
      update: {
        schemaId,
        fieldValues: extraction.fieldValues,
        extractedAt: new Date(),
        extractionConfidence: extraction.confidence,
        wasManuallyEdited: false,
      },
      include: {
        schema: true,
      },
    });

    return {
      ...schemaData,
      extractionNotes: extraction.notes,
    };
  }

  /**
   * Update schema data field values (manual edit)
   * @param {string} eventId - The event ID
   * @param {object} fieldValues - The updated field values
   * @returns {object} - The updated EventSchemaData
   */
  async updateSchemaData(eventId, fieldValues) {
    const schemaData = await prisma.eventSchemaData.findUnique({
      where: { eventId },
    });

    if (!schemaData) {
      throw new Error('No schema data found for this event');
    }

    return prisma.eventSchemaData.update({
      where: { eventId },
      data: {
        fieldValues,
        lastEditedAt: new Date(),
        wasManuallyEdited: true,
      },
      include: {
        schema: true,
      },
    });
  }

  /**
   * Get schema data for an event
   * @param {string} eventId - The event ID
   * @returns {object|null} - The EventSchemaData or null
   */
  async getSchemaData(eventId) {
    return prisma.eventSchemaData.findUnique({
      where: { eventId },
      include: {
        schema: true,
      },
    });
  }

  /**
   * Remove schema data from an event
   * @param {string} eventId - The event ID
   */
  async removeSchemaData(eventId) {
    const schemaData = await prisma.eventSchemaData.findUnique({
      where: { eventId },
    });

    if (!schemaData) {
      throw new Error('No schema data found for this event');
    }

    await prisma.eventSchemaData.delete({
      where: { eventId },
    });

    return { message: 'Schema data removed' };
  }

  /**
   * Re-extract fields from transcript (refresh extraction)
   * @param {string} eventId - The event ID
   * @returns {object} - The updated EventSchemaData
   */
  async reExtractFields(eventId) {
    const schemaData = await prisma.eventSchemaData.findUnique({
      where: { eventId },
      include: { schema: true },
    });

    if (!schemaData) {
      throw new Error('No schema data found for this event');
    }

    // Re-apply the same schema
    return this.applySchemaToEvent(eventId, schemaData.schemaId);
  }
}

module.exports = new SchemaExtractionService();
