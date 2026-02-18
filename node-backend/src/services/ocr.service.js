/**
 * OCR Service - Extract text from images using GPT-4 Vision
 */

const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Extract equipment data from a nameplate photo using GPT-4 Vision
 * @param {string} imageBase64 - Base64 encoded image data (with or without data URI prefix)
 * @param {string[]} fieldsToExtract - Array of field names to extract
 * @param {string} equipmentType - Type of equipment (pump, engine, controller)
 * @returns {Object} Extracted data with field values
 */
async function extractNameplateData(imageBase64, fieldsToExtract = [], equipmentType = 'equipment') {
  try {
    // Ensure proper base64 format
    let imageData = imageBase64;
    if (!imageBase64.startsWith('data:')) {
      imageData = `data:image/jpeg;base64,${imageBase64}`;
    }

    // Build the extraction prompt based on equipment type
    const fieldDescriptions = getFieldDescriptions(equipmentType, fieldsToExtract);

    const prompt = `You are an expert at reading industrial equipment nameplates and data plates.

Analyze this ${equipmentType} nameplate image and extract the following information:
${fieldDescriptions}

IMPORTANT GUIDELINES:
- Read the text carefully, including any stamped or engraved numbers
- For serial numbers, include all characters exactly as shown
- For model numbers, preserve exact formatting including dashes and spaces
- For GPM/capacity values, just provide the number
- For RPM values, just provide the number
- For BHP/horsepower, just provide the number
- If a field is not visible or cannot be determined, return null for that field
- Return ONLY valid JSON, no markdown formatting

Return a JSON object with the extracted values. Example format:
{
  "brand": "Clarke",
  "model": "ABC-123",
  "serial_number": "SN12345",
  "capacity_gpm": "2500",
  "rpm": "1750",
  "bhp": "100"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageData,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '{}';

    // Parse the JSON response
    let extractedData;
    try {
      // Remove any markdown code blocks if present
      const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      extractedData = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('[ocr] Failed to parse GPT response:', content);
      extractedData = {};
    }

    console.log('[ocr] Extracted data:', extractedData);
    return {
      success: true,
      data: extractedData,
      rawResponse: content,
    };
  } catch (error) {
    console.error('[ocr] Error extracting nameplate data:', error);
    return {
      success: false,
      error: error.message,
      data: {},
    };
  }
}

/**
 * Get field descriptions based on equipment type
 */
function getFieldDescriptions(equipmentType, fieldsToExtract) {
  const allFields = {
    // Pump fields
    brand: 'Brand/Manufacturer name (e.g., Clarke, Fairbanks Morse, Aurora, Peerless)',
    model: 'Model number or type designation',
    serial_number: 'Serial number (MFG S/N, S/N, or similar)',
    capacity_gpm: 'Flow capacity in GPM (gallons per minute)',
    rpm: 'Rated RPM (revolutions per minute)',
    head_feet: 'Head pressure in feet',

    // Engine fields
    engine_brand: 'Engine manufacturer (e.g., Doosan, Cummins, John Deere, Clarke)',
    engine_model: 'Engine model number',
    engine_serial: 'Engine serial number',
    engine_bhp: 'Horsepower (BHP)',
    engine_rpm: 'Engine rated RPM',

    // Controller fields
    controller_brand: 'Controller manufacturer (e.g., Eaton, Firetrol, Metron)',
    controller_model: 'Controller model number',
    controller_serial: 'Controller serial number',

    // Pressure gauge fields
    suction_psi: 'Suction pressure reading in PSI',
    discharge_psi: 'Discharge pressure reading in PSI',
  };

  // If specific fields requested, use only those
  const fieldsToUse = fieldsToExtract.length > 0
    ? fieldsToExtract
    : Object.keys(allFields);

  return fieldsToUse
    .filter(field => allFields[field])
    .map(field => `- ${field}: ${allFields[field]}`)
    .join('\n');
}

/**
 * Map OCR extracted fields to form field IDs
 * This handles the mapping between OCR field names and actual form field IDs
 */
function mapOcrFieldsToFormFields(ocrData, sectionId, instanceIndex = 0) {
  const mappings = {
    // Pump equipment section mappings
    pump_equipment: {
      brand: 'pump_brand',
      model: 'pump_model',
      serial_number: 'pump_serial',
      capacity_gpm: 'pump_capacity',
      rpm: 'pump_rpm',
    },
    // Engine section mappings
    engine_info: {
      engine_brand: 'engine_brand',
      engine_model: 'engine_model',
      engine_serial: 'engine_serial',
      engine_bhp: 'engine_bhp',
      engine_rpm: 'engine_rpm',
      // Also map generic fields for engine
      brand: 'engine_brand',
      model: 'engine_model',
      serial_number: 'engine_serial',
      bhp: 'engine_bhp',
      rpm: 'engine_rpm',
    },
    // Controller section mappings
    controller_info: {
      controller_brand: 'controller_brand',
      controller_model: 'controller_model',
      controller_serial: 'controller_serial',
      brand: 'controller_brand',
      model: 'controller_model',
      serial_number: 'controller_serial',
    },
    // Performance readings
    performance_readings: {
      suction_psi: 'suction_psi',
      discharge_psi: 'discharge_psi',
    },
  };

  const sectionMappings = mappings[sectionId] || {};
  const formFields = {};

  for (const [ocrField, value] of Object.entries(ocrData)) {
    if (value && sectionMappings[ocrField]) {
      const formFieldId = sectionMappings[ocrField];
      // For repeatable sections, add the instance prefix
      const fullFieldId = instanceIndex !== undefined && sectionId === 'pump_equipment'
        ? `${sectionId}_${instanceIndex}_${formFieldId}`
        : formFieldId;
      formFields[fullFieldId] = value;
    }
  }

  return formFields;
}

module.exports = {
  extractNameplateData,
  mapOcrFieldsToFormFields,
};
