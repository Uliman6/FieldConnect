/**
 * OCR Service - Extract text from images using GPT-4 Vision
 * Uses direct API calls to OpenAI (same approach as other services)
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_VISION_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

/**
 * Extract equipment data from a nameplate photo using GPT-4 Vision
 * @param {string} imageBase64 - Base64 encoded image data (with or without data URI prefix)
 * @param {string[]} fieldsToExtract - Array of field names to extract
 * @param {string} equipmentType - Type of equipment (pump, engine, controller)
 * @returns {Object} Extracted data with field values
 */
async function extractNameplateData(imageBase64, fieldsToExtract = [], equipmentType = 'equipment') {
  if (!OPENAI_API_KEY) {
    console.error('[ocr] OpenAI API key not configured');
    return { success: false, error: 'OpenAI API key not configured', data: {} };
  }

  try {
    // Ensure proper base64 format
    let imageData = imageBase64;
    if (!imageBase64.startsWith('data:')) {
      imageData = `data:image/jpeg;base64,${imageBase64}`;
    }

    // Build the extraction prompt based on equipment type
    const fieldDescriptions = getFieldDescriptions(equipmentType, fieldsToExtract);

    // Build equipment-specific prompt
    let equipmentPrompt = '';
    if (equipmentType === 'fire_pump_controller' || equipmentType === 'fire pump controller' || equipmentType === 'controller') {
      equipmentPrompt = `You are an expert at reading fire pump controller and electrical panel nameplates.

Analyze this controller nameplate/data plate image and extract the following information:

CRITICAL FIELD LOCATIONS FOR CONTROLLERS:
- BRAND/MANUFACTURER: Look at the TOP of the label for brand name (e.g., EATON, Firetrol, Metron, Tornatech, Master Control Systems)
- MODEL: Look for "CAT. NO." or "CATALOG NO." - the value next to it is the model (e.g., FD120-L1)
- SERIAL NUMBER: Look for "SERIAL NO." - the value next to it is the serial number (e.g., 16BR671D)
- MANUFACTURING YEAR: Look for date codes or "MFD" with year

Return a JSON object with these exact keys:
{
  "brand": "The manufacturer name from top of label",
  "model": "The CAT. NO. or catalog number value",
  "serial_number": "The SERIAL NO. value",
  "manufacturing_year": "Year if visible, otherwise null"
}

IMPORTANT: Return ONLY the JSON object, no markdown formatting. If a field is not visible, use null.`;
    } else if (equipmentType === 'fire_pump' || equipmentType === 'pump') {
      equipmentPrompt = `You are an expert at reading fire pump nameplates and data plates.

IMPORTANT: The image may be rotated 90 degrees. Read ALL text regardless of orientation.

Analyze this pump nameplate image and extract the following information:

CRITICAL FIELD LOCATIONS FOR PUMPS:
- BRAND/MANUFACTURER: Look for the company name - often appears as large text like "Fairbanks Morse", "Aurora", "Peerless", "Patterson", "Pentair". May also show parent company (e.g., "Pentair Pump Group"). Return the main brand name.
- MODEL/TYPE: Look for "TYPE" followed by an alphanumeric code (e.g., 1824BF, 8x6x13)
- SERIAL NUMBER: Look for "NO." followed by a number (e.g., 12-2178178-2)
- GPM/CAPACITY: Look for "G.P.M." or "GPM" followed by a number. This is the flow capacity. Examples: "G.P.M. 2500" means 2500, or "G.P.M. 2000 AT 125 P.S.I." means 2000.
- RPM: Look for "R.P.M." or "RPM" followed by a number (e.g., 2100, 1770)
- HEAD: Look for "HEAD" followed by a number and "FEET" (e.g., "HEAD 323 FEET" means 323)

PRESSURE VALUES (if present):
- PRESSURE AT 0% (shutoff): Look for "MAX. PRESS" or "MAX PRESS" value
- PRESSURE AT 100% (rated): Look for PSI value after "AT" in "G.P.M. X AT Y P.S.I."
- PRESSURE AT 150% (overload): Look for "P.S.I. AT 150%" value

Return a JSON object with these exact keys:
{
  "brand": "The manufacturer/brand name (e.g., Fairbanks Morse)",
  "model": "The TYPE value (alphanumeric code)",
  "serial_number": "The NO. value",
  "capacity_gpm": "The G.P.M. number (digits only)",
  "rpm": "The R.P.M. number (digits only)",
  "pressure_0": "MAX. PRESS value if present, otherwise null",
  "pressure_100": "Rated PSI value if present, otherwise null",
  "pressure_150": "150% PSI value if present, otherwise null",
  "manufacturing_year": "Year if visible, otherwise null"
}

IMPORTANT: Return ONLY the JSON object, no markdown formatting. If a field is not visible, use null.`;
    } else if (equipmentType === 'diesel_engine' || equipmentType === 'engine' || equipmentType === 'driver') {
      equipmentPrompt = `You are an expert at reading diesel engine and driver nameplates for fire pumps.

Analyze this engine/driver nameplate image and extract the following information:

CRITICAL FIELD LOCATIONS FOR ENGINES/DRIVERS:
- BRAND/MANUFACTURER: Look for "manufactured by" or the company name at TOP of label (e.g., Clarke, Cummins, John Deere, Doosan)
- MODEL: Look for "MODEL" - the value next to it is the model number (e.g., DQ6H-UFAA50)
- SERIAL NUMBER: Look for "MFG. S/N" or "MFG S/N" or "SERIAL NO." - this is the manufacturer serial number (e.g., LDIPA105934)
- HORSEPOWER: Look for "BHP" - often shown as "FROM ___ BHP @ ___ RPM" or "UP TO ___ BHP" (e.g., 340)
- RPM: Look for the RPM value associated with BHP rating (e.g., 2100)
- MANUFACTURING YEAR: Look for "MFD." with "MO." and "YEAR" fields at bottom

Return a JSON object with these exact keys:
{
  "brand": "The manufacturer name",
  "model": "The MODEL value",
  "serial_number": "The MFG. S/N value",
  "horsepower": "The BHP value (number only)",
  "rpm": "The RPM value (number only)",
  "manufacturing_year": "Year if visible, otherwise null"
}

IMPORTANT: Return ONLY the JSON object, no markdown formatting. If a field is not visible, use null.`;
    } else {
      equipmentPrompt = `You are an expert at reading industrial equipment nameplates and data plates.

Analyze this ${equipmentType} nameplate image and extract the following information:
${fieldDescriptions}

IMPORTANT GUIDELINES:
- BRAND: Usually at the TOP of the label, often the largest text
- Read the text carefully, including any stamped or engraved numbers
- For serial numbers, include all characters exactly as shown
- For model numbers, preserve exact formatting including dashes and spaces
- For GPM/capacity values, just provide the number
- For RPM values, just provide the number
- For BHP/horsepower, just provide the number
- If a field is not visible or cannot be determined, return null for that field
- Return ONLY valid JSON, no markdown formatting`;
    }

    // Use the equipment-specific prompt directly (it already includes the JSON format)
    const prompt = equipmentPrompt;

    const response = await fetch(OPENAI_VISION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ocr] OpenAI API error:', response.status, errorText);
      return { success: false, error: `OpenAI API error: ${response.status}`, data: {} };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '{}';

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
    controller_brand: 'Controller manufacturer/brand name (e.g., Eaton, Firetrol, Metron, Tornatech)',
    controller_catalog_no: 'Catalog number (CAT. NO.)',
    controller_model: 'Controller model number or type',
    controller_serial: 'Controller serial number (SERIAL NO.)',
    controller_hp: 'Horsepower rating (H.P.)',
    controller_phase: 'Phase (single phase = 1, three phase = 3)',
    controller_hertz: 'Frequency in Hertz (Hz) - typically 50 or 60',
    controller_volts: 'Main voltage rating (VOLTS)',
    controller_control_volts: 'Control circuit voltage (CONTROL CIRCUIT VOLTS)',
    controller_enclosure_type: 'Enclosure type (ENCL. TYPE) - e.g., Type 2, NEMA 3R',
    controller_sccr: 'Short circuit current rating / Max amperes (SCCR or AMPERES R.M.S. SYMMETRICAL)',
    controller_country: 'Country of manufacture (MADE IN)',
    controller_year: 'Year of manufacture if visible',

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
    // Pump equipment section mappings (old template)
    pump_equipment: {
      brand: 'pump_brand',
      model: 'pump_model',
      serial_number: 'pump_serial',
      capacity_gpm: 'pump_capacity',
      rpm: 'pump_rpm',
    },
    // Pump label info section mappings (bilingual template)
    pump_label_info: {
      brand: 'pump_brand',
      model: 'pump_model',
      serial_number: 'pump_serial',
      capacity_gpm: 'pump_capacity',
      capacity: 'pump_capacity',
      rpm: 'pump_rpm',
      pressure: 'pump_pressure',
      pressure_psi: 'pump_pressure',
      year: 'pump_year',
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
    // Controller section mappings (old template)
    controller_info: {
      controller_brand: 'controller_brand',
      controller_model: 'controller_model',
      controller_serial: 'controller_serial',
      brand: 'controller_brand',
      model: 'controller_model',
      serial_number: 'controller_serial',
    },
    // Controller label info section mappings (bilingual template)
    controller_label_info: {
      brand: 'controller_brand',
      controller_brand: 'controller_brand',
      catalog_no: 'controller_catalog_no',
      controller_catalog_no: 'controller_catalog_no',
      model: 'controller_model',
      controller_model: 'controller_model',
      serial_number: 'controller_serial',
      controller_serial: 'controller_serial',
      hp: 'controller_hp',
      controller_hp: 'controller_hp',
      horsepower: 'controller_hp',
      phase: 'controller_phase',
      controller_phase: 'controller_phase',
      hertz: 'controller_hertz',
      controller_hertz: 'controller_hertz',
      frequency: 'controller_hertz',
      volts: 'controller_volts',
      controller_volts: 'controller_volts',
      voltage: 'controller_volts',
      control_volts: 'controller_control_volts',
      controller_control_volts: 'controller_control_volts',
      control_circuit_volts: 'controller_control_volts',
      enclosure_type: 'controller_enclosure_type',
      controller_enclosure_type: 'controller_enclosure_type',
      sccr: 'controller_sccr',
      controller_sccr: 'controller_sccr',
      max_amperes: 'controller_sccr',
      country: 'controller_country',
      controller_country: 'controller_country',
      made_in: 'controller_country',
      year: 'controller_year',
      controller_year: 'controller_year',
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
