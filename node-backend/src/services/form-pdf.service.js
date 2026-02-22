const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

/**
 * Download image from URL and return as buffer
 */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, { timeout: 10000 }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadImage(response.headers.location).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Image download timeout'));
    });
  });
}

// Font paths for Unicode support (Turkish characters, etc.)
// Using Noto Sans which has excellent Unicode coverage including Turkish
const FONT_PATH_REGULAR = path.join(__dirname, '../assets/fonts/NotoSans-Regular.ttf');
const FONT_PATH_BOLD = path.join(__dirname, '../assets/fonts/NotoSans-Bold.ttf');

// Check if fonts exist at startup and set font names accordingly
const fontsAvailable = fs.existsSync(FONT_PATH_REGULAR) && fs.existsSync(FONT_PATH_BOLD);

// Font names to use throughout the PDF generation
// If Unicode fonts are available, we'll register them and use 'Unicode'/'Unicode-Bold'
// Otherwise, we fall back to built-in Helvetica
const FONT_REGULAR = fontsAvailable ? 'Unicode' : 'Helvetica';
const FONT_BOLD = fontsAvailable ? 'Unicode-Bold' : 'Helvetica-Bold';

if (fontsAvailable) {
  console.log('[form-pdf] Unicode fonts available at:', FONT_PATH_REGULAR);
} else {
  console.warn('[form-pdf] Unicode fonts not found at:', FONT_PATH_REGULAR);
  console.warn('[form-pdf] Using Helvetica fallback (Turkish characters may not display correctly)');
}

/**
 * Register Unicode fonts with a PDF document (only if available)
 */
function registerFonts(doc) {
  if (fontsAvailable) {
    try {
      doc.registerFont('Unicode', FONT_PATH_REGULAR);
      doc.registerFont('Unicode-Bold', FONT_PATH_BOLD);
    } catch (err) {
      console.error('[form-pdf] Failed to register Unicode fonts:', err.message);
    }
  }
  // If fonts not available, we use Helvetica directly (no registration needed)
}

/**
 * Generate a Pre-Task Plan PDF from form data
 */
function generatePreTaskPlanPdf(form, project) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
      });

      // Register Unicode fonts for Turkish character support
      registerFonts(doc);

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const data = form.data || {};
      const template = form.template;

      // Colors
      const headerBg = '#C4A962'; // Gold/tan color like the original
      const borderColor = '#000000';

      // ===== PAGE 1 =====

      // Header
      doc.fontSize(18).font(FONT_BOLD).text('Pre-Task Plan', { align: 'center' });
      doc.fontSize(8).font(FONT_REGULAR).text('Archive Document - DO NOT DISCARD', { align: 'center' });
      doc.moveDown(0.5);

      // Project Info Box
      const infoY = doc.y;
      doc.rect(40, infoY, 532, 60).stroke();

      doc.fontSize(10).font(FONT_BOLD);
      doc.text('Project:', 45, infoY + 5);
      doc.font(FONT_REGULAR).text(project?.name || form.projectId || '', 100, infoY + 5);

      doc.font(FONT_BOLD).text('Date:', 350, infoY + 5);
      doc.font(FONT_REGULAR).text(new Date(form.createdAt).toLocaleDateString(), 390, infoY + 5);

      doc.font(FONT_BOLD).text('Project Number:', 45, infoY + 22);
      doc.font(FONT_REGULAR).text(project?.projectNumber || '', 130, infoY + 22);

      doc.font(FONT_BOLD).text('Prepared By:', 350, infoY + 22);
      doc.font(FONT_REGULAR).text(form.createdByName || '', 420, infoY + 22);

      doc.font(FONT_BOLD).text('Specific Location of Work:', 45, infoY + 40);
      doc.font(FONT_REGULAR).text(form.location || '', 180, infoY + 40);

      doc.y = infoY + 70;

      // Safety Questions Section
      const safetyHeaderY = doc.y;
      doc.rect(40, safetyHeaderY, 532, 18).fill(headerBg).stroke(borderColor);
      doc.fillColor('black').fontSize(9).font(FONT_BOLD);
      doc.text('Answer the following when evaluating your work:', 45, safetyHeaderY + 4);
      doc.text('Check YES, NO or N/A', 450, safetyHeaderY + 4);
      doc.y = safetyHeaderY + 18;
      doc.moveDown(0.1);

      // Safety Questions
      const safetyQuestions = [
        { id: 'walked_work_area', label: 'Prior to start, have you walked your work area to address lighting, housekeeping, slip/trip issues etc.?' },
        { id: 'hazmat_survey', label: 'Has a Hazardous Material Survey been conducted on the project/clearance records? (asbestos, lead, PCBs, etc.)' },
        { id: 'new_team_member', label: 'Is there a new hire, or new team member on the project who will need support?' },
        { id: 'enough_people', label: 'Are enough people assigned to safely complete the task? (lifting, repetition, spotters etc.)' },
        { id: 'hazards_from_others', label: 'Are there any hazards created by any other workers in your area or does your work create hazards for others?' },
        { id: 'fall_protection', label: 'Does your task require the use of a personal fall arrest system? Has a rescue plan been developed and communicated to all crew members?' },
        { id: 'lockout_tagout', label: 'Are you working around live systems or energized equipment? Will you need to use Lockout/Tagout procedures? Any other hazardous energy to be considered; e.g., Pressure Testing?' },
        { id: 'struck_by_caught', label: 'Does your work require you to be exposed to pinch points, cave-ins, articulating equipment (caught in-between); falling or flying materials or debris, vehicular traffic, moving equipment (struck by)?' },
        { id: 'operators_certified', label: 'Are operators certified/trained/authorized for the equipment they are operating? (Scissor lift, powder actuated tools, forklift, mobile equipment, rigging, etc.)' },
        { id: 'special_permits', label: 'Does this task require any special permits, procedures or inspection forms? (Confined Space, Hot Work, Excavation, Elevated Work, Energized Electrical Work, Scaffold/Scissor/Boom/Forklift Inspection, etc.)' },
        { id: 'right_equipment', label: 'Do you have the right type of work platform or equipment to reach your work? Have you been trained to use this equipment?' },
        { id: 'sds_review', label: 'Do you need to review SDS\'s (safety data sheets) to proceed with this work?' },
        { id: 'barricading', label: 'Have you addressed any barricading, warning system or signage requirements appropriate to the task?' },
        { id: 'tools_inspected', label: 'Have all tools, equipment and materials been inspected prior to use and are they adequate to perform work safely?' },
        { id: 'lifting_bending', label: 'Will this task require any lifting, bending or twisting?' },
        { id: 'stretch_flex', label: 'Have you completed Stretch & Flex today?' },
        { id: 'injury_report', label: 'Do you have an injury to report or were you injured the prior working day?' },
      ];

      safetyQuestions.forEach(q => {
        drawYesNoNaRow(doc, q.label, data[q.id]);
      });

      // Quality Section
      doc.moveDown(0.3);
      const qualityHeaderY = doc.y;
      doc.rect(40, qualityHeaderY, 532, 16).fill(headerBg).stroke(borderColor);
      doc.fillColor('black').fontSize(9).font(FONT_BOLD);
      doc.text('Quality:', 260, qualityHeaderY + 3);
      doc.y = qualityHeaderY + 16;
      doc.moveDown(0.1);

      drawYesNoNaRow(doc, 'Identify the drawing you are working from today, is it the current version?', data.current_drawing);
      drawYesNoNaRow(doc, 'Have you reviewed all construction details associated with our work?', data.reviewed_details);

      // Text fields for quality
      doc.fontSize(8).font(FONT_BOLD).text('Who on the crew is responsible for quality control today?', 45);
      doc.font(FONT_REGULAR).text(data.qc_responsible || '_______________', 45);
      doc.moveDown(0.3);

      doc.font(FONT_BOLD).text('What is the quality item you will be focusing on today? What will you do today that will prevent rework tomorrow?', 45);
      doc.font(FONT_REGULAR).text(data.quality_focus || '_______________', 45);
      doc.moveDown(0.5);

      // PPE and Locate/Identify side by side
      const ppeY = doc.y;

      // PPE Box
      doc.rect(40, ppeY, 260, 120).stroke();
      doc.rect(40, ppeY, 260, 16).fill(headerBg).stroke(borderColor);
      doc.fillColor('black').fontSize(9).font(FONT_BOLD);
      doc.text('Are any of the following PPE required?', 45, ppeY + 4);

      const ppeItems = [
        { id: 'ppe_helmet', label: 'Helmet/Safety Glasses, Gloves' },
        { id: 'ppe_fall_protection', label: 'Fall Protection/Rescue Plan' },
        { id: 'ppe_goggles', label: 'Goggles/Faceshield' },
        { id: 'ppe_hand_arm', label: 'Hand / Arm PPE' },
        { id: 'ppe_hearing', label: 'Hearing PPE' },
        { id: 'ppe_foot', label: 'Foot PPE' },
        { id: 'ppe_respirator', label: 'Respirator' },
      ];

      let ppeItemY = ppeY + 20;
      ppeItems.forEach(item => {
        drawCheckbox(doc, 50, ppeItemY, data[item.id], item.label);
        ppeItemY += 14;
      });

      // Locate and Identify Box
      doc.rect(312, ppeY, 260, 120).stroke();
      doc.rect(312, ppeY, 260, 16).fill(headerBg).stroke(borderColor);
      doc.fillColor('black').fontSize(9).font(FONT_BOLD);
      doc.text('Locate and identify:', 317, ppeY + 4);

      const locateItems = [
        { id: 'loc_emergency_phone', label: 'Emergency Telephones' },
        { id: 'loc_fire_extinguisher', label: 'Fire Extinguisher' },
        { id: 'loc_exit_routes', label: 'Emergency Exit Routes' },
        { id: 'loc_first_aid', label: 'First Aid Equipment' },
        { id: 'loc_other1', label: 'Other' },
        { id: 'loc_other2', label: 'Other' },
        { id: 'loc_other3', label: 'Other' },
      ];

      let locItemY = ppeY + 20;
      locateItems.forEach(item => {
        drawCheckbox(doc, 322, locItemY, data[item.id], item.label);
        locItemY += 14;
      });

      // ===== PAGE 2 =====
      doc.addPage();

      // Header
      doc.fontSize(18).font(FONT_BOLD).text('Pre-Task Plan', { align: 'center' });
      doc.fontSize(8).font(FONT_REGULAR).text('Archive Document - DO NOT DISCARD', { align: 'center' });
      doc.moveDown(0.5);

      // Instruction
      doc.fontSize(9).font(FONT_BOLD);
      doc.text('Safety items identified on the front side question list must be addressed on the table below:', 40);
      doc.moveDown(0.3);

      // Work Steps Table
      const tableY = doc.y;
      const colWidths = [130, 100, 130, 172];
      const rowHeight = 22;
      const tableHeaders = ['Steps for Work', 'Tools', 'Hazards', 'Steps Taken to Address Hazards'];

      // Header row
      doc.rect(40, tableY, 532, 18).fill(headerBg).stroke(borderColor);
      doc.fillColor('black').fontSize(8).font(FONT_BOLD);
      let headerX = 40;
      tableHeaders.forEach((header, i) => {
        doc.text(header, headerX + 3, tableY + 5, { width: colWidths[i] - 6 });
        headerX += colWidths[i];
      });

      // Data rows
      const workSteps = data.work_steps_table || [];
      const numRows = Math.max(10, workSteps.length);
      let rowY = tableY + 18;

      for (let i = 0; i < numRows; i++) {
        let cellX = 40;
        for (let j = 0; j < 4; j++) {
          doc.rect(cellX, rowY, colWidths[j], rowHeight).stroke();
          if (workSteps[i] && workSteps[i][j]) {
            doc.fontSize(7).font(FONT_REGULAR).text(workSteps[i][j], cellX + 2, rowY + 3, {
              width: colWidths[j] - 4,
              height: rowHeight - 6
            });
          }
          cellX += colWidths[j];
        }
        rowY += rowHeight;
      }

      doc.y = rowY + 10;

      // Hand At Risk Table
      const handTableY = doc.y;
      const handColWidths = [177, 177, 178];
      const handHeaders = ['"Hand At Risk" Tasks', 'Specific Tools', 'Corrective Measure Other Than PPE'];

      // Header row
      doc.rect(40, handTableY, 532, 18).fill(headerBg).stroke(borderColor);
      doc.fillColor('black').fontSize(8).font(FONT_BOLD);
      let handHeaderX = 40;
      handHeaders.forEach((header, i) => {
        doc.text(header, handHeaderX + 3, handTableY + 5, { width: handColWidths[i] - 6 });
        handHeaderX += handColWidths[i];
      });

      // Data rows
      const handRisks = data.hand_risk_table || [];
      const handNumRows = Math.max(6, handRisks.length);
      let handRowY = handTableY + 18;

      for (let i = 0; i < handNumRows; i++) {
        let cellX = 40;
        for (let j = 0; j < 3; j++) {
          doc.rect(cellX, handRowY, handColWidths[j], rowHeight).stroke();
          if (handRisks[i] && handRisks[i][j]) {
            doc.fontSize(7).font(FONT_REGULAR).text(handRisks[i][j], cellX + 2, handRowY + 3, {
              width: handColWidths[j] - 4,
              height: rowHeight - 6
            });
          }
          cellX += handColWidths[j];
        }
        handRowY += rowHeight;
      }

      doc.y = handRowY + 10;

      // Note
      doc.fontSize(8).font(FONT_BOLD).text('*If you need more space, attach another PRE-TASK PLAN SHEET', { align: 'center' });
      doc.moveDown(0.5);

      // Signatures row
      const sigY = doc.y;
      const sigWidth = 177;

      // Work Planner
      doc.rect(40, sigY, sigWidth, 40).stroke();
      doc.fontSize(8).font(FONT_BOLD).text('Work Planner', 45, sigY + 3);
      if (data.sig_work_planner?.signed) {
        doc.fontSize(10).font(FONT_REGULAR).text(data.sig_work_planner.name || 'Signed', 45, sigY + 18);
        doc.fontSize(6).text(new Date(data.sig_work_planner.signedAt).toLocaleString(), 45, sigY + 30);
      }

      // Supervisor
      doc.rect(40 + sigWidth, sigY, sigWidth, 40).stroke();
      doc.fontSize(8).font(FONT_BOLD).text('Supervisor', 45 + sigWidth, sigY + 3);
      if (data.sig_supervisor?.signed) {
        doc.fontSize(10).font(FONT_REGULAR).text(data.sig_supervisor.name || 'Signed', 45 + sigWidth, sigY + 18);
        doc.fontSize(6).text(new Date(data.sig_supervisor.signedAt).toLocaleString(), 45 + sigWidth, sigY + 30);
      }

      // EHS
      doc.rect(40 + sigWidth * 2, sigY, sigWidth + 1, 40).stroke();
      doc.fontSize(8).font(FONT_BOLD).text('EHS Professional', 45 + sigWidth * 2, sigY + 3);
      if (data.sig_ehs?.signed) {
        doc.fontSize(10).font(FONT_REGULAR).text(data.sig_ehs.name || 'Signed', 45 + sigWidth * 2, sigY + 18);
        doc.fontSize(6).text(new Date(data.sig_ehs.signedAt).toLocaleString(), 45 + sigWidth * 2, sigY + 30);
      }

      doc.y = sigY + 50;

      // Crew Members section
      doc.fontSize(9).font(FONT_BOLD);
      doc.text('Crew Members – additional crew members sign on back or a separate page if necessary:', 40);
      doc.moveDown(0.3);

      const crewY = doc.y;
      const crewMembers = data.crew_members || [];
      const crewColWidth = 177;
      const crewRowHeight = 25;

      // Draw 4 rows x 3 columns grid for crew signatures
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
          const x = 40 + col * crewColWidth;
          const y = crewY + row * crewRowHeight;
          doc.rect(x, y, crewColWidth, crewRowHeight).stroke();

          const idx = row * 3 + col;
          if (crewMembers[idx]?.signed) {
            doc.fontSize(8).font(FONT_REGULAR).text(crewMembers[idx].name || 'Signed', x + 3, y + 5);
          }
        }
      }

      // Footer
      doc.y = 720;
      doc.fontSize(7).font(FONT_REGULAR);
      doc.text('Copyright © 2001 DPR Construction', 40, doc.y);
      doc.text('Pre-Task Plan - English', 250, doc.y);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 450, doc.y);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function drawYesNoNaRow(doc, label, value) {
  const y = doc.y;
  const labelWidth = 420;
  const boxWidth = 35;
  const minRowHeight = 16;
  const padding = 4;

  // Calculate actual text height for dynamic row sizing
  doc.fontSize(7).font(FONT_REGULAR);
  const textHeight = doc.heightOfString(label, { width: labelWidth - 10 });
  const rowHeight = Math.max(minRowHeight, textHeight + padding * 2);

  // Draw main row box with dynamic height
  doc.rect(40, y, 532, rowHeight).stroke();
  doc.text(label, 45, y + padding, { width: labelWidth - 10 });

  // Calculate vertical center for YES/NO/NA boxes
  const boxY = y + (rowHeight - minRowHeight) / 2;

  // YES box
  doc.rect(40 + labelWidth, y, boxWidth, rowHeight).stroke();
  doc.fontSize(8).font(FONT_BOLD).text('YES', 40 + labelWidth + 5, boxY + 4);
  if (value === 'YES') {
    doc.fontSize(12).text('X', 40 + labelWidth + 20, boxY + 2);
  }

  // NO box
  doc.rect(40 + labelWidth + boxWidth, y, boxWidth, rowHeight).stroke();
  doc.text('NO', 40 + labelWidth + boxWidth + 8, boxY + 4);
  if (value === 'NO') {
    doc.fontSize(12).text('X', 40 + labelWidth + boxWidth + 22, boxY + 2);
  }

  // N/A box
  doc.rect(40 + labelWidth + boxWidth * 2, y, boxWidth + 2, rowHeight).stroke();
  doc.text('N/A', 40 + labelWidth + boxWidth * 2 + 5, boxY + 4);
  if (value === 'NA') {
    doc.fontSize(12).text('X', 40 + labelWidth + boxWidth * 2 + 22, boxY + 2);
  }

  doc.y = y + rowHeight;
}

function drawCheckbox(doc, x, y, checked, label) {
  doc.rect(x, y, 10, 10).stroke();
  if (checked) {
    doc.fontSize(10).font(FONT_BOLD).text('X', x + 1, y - 1);
  }
  doc.fontSize(8).font(FONT_REGULAR).text(label, x + 15, y + 1);
}

/**
 * Generate a generic PDF from any form template
 * Works with any template schema structure
 */
async function generateGenericFormPdf(form, project) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('[form-pdf] Starting generic PDF generation');
      console.log('[form-pdf] Template name:', form.template?.name);
      console.log('[form-pdf] Schema sections count:', form.template?.schema?.sections?.length || 0);

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        autoFirstPage: true,
      });

      // Register Unicode fonts for Turkish character support
      registerFonts(doc);

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        console.log('[form-pdf] PDF generation complete, buffer size:', Buffer.concat(chunks).length);
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', (err) => {
        console.error('[form-pdf] PDF document error:', err);
        reject(err);
      });

      const data = form.data || {};
      const template = form.template;
      const schema = template?.schema || {};
      const sections = schema.sections || [];

      console.log('[form-pdf] Processing', sections.length, 'sections');

      // Colors
      const headerBg = '#4A90A4'; // Blue-ish header
      const borderColor = '#000000';

      // ===== HEADER =====
      doc.fontSize(16).font(FONT_BOLD).text(template?.name || 'Form Report', { align: 'center' });
      doc.moveDown(0.3);

      // Project Info Box
      const infoY = doc.y;
      doc.rect(40, infoY, 532, 50).stroke();

      doc.fontSize(9).font(FONT_BOLD);
      doc.text('Project:', 45, infoY + 5);
      doc.font(FONT_REGULAR).text(project?.name || form.projectId || 'N/A', 100, infoY + 5);

      doc.font(FONT_BOLD).text('Date:', 350, infoY + 5);
      doc.font(FONT_REGULAR).text(new Date(form.createdAt).toLocaleDateString(), 390, infoY + 5);

      doc.font(FONT_BOLD).text('Prepared By:', 45, infoY + 20);
      doc.font(FONT_REGULAR).text(form.createdByName || 'N/A', 115, infoY + 20);

      doc.font(FONT_BOLD).text('Status:', 350, infoY + 20);
      doc.font(FONT_REGULAR).text(form.status || 'DRAFT', 395, infoY + 20);

      if (form.location) {
        doc.font(FONT_BOLD).text('Location:', 45, infoY + 35);
        doc.font(FONT_REGULAR).text(form.location, 100, infoY + 35);
      }

      doc.y = infoY + 60;

      // ===== SECTIONS =====
      for (const section of sections) {
        // Check if we need a new page
        if (doc.y > 680) {
          doc.addPage();
        }

        // Section Header
        const sectionY = doc.y;
        doc.rect(40, sectionY, 532, 20).fill(headerBg).stroke(borderColor);
        doc.fillColor('white').fontSize(10).font(FONT_BOLD);
        doc.text(section.name || 'Section', 45, sectionY + 5);
        doc.fillColor('black');
        doc.y = sectionY + 22;

        // Section Fields
        const fields = section.fields || [];
        for (const field of fields) {
          // Check if we need a new page
          if (doc.y > 700) {
            doc.addPage();
          }

          const fieldValue = data[field.id];

          try {
            if (field.type === 'YES_NO_NA' || field.type === 'YES_NO') {
              drawYesNoNaRow(doc, field.label || field.id, fieldValue);
            } else if (field.type === 'SIGNATURE') {
              drawSignatureField(doc, field.label || field.id, fieldValue);
            } else if (field.type === 'TEXTAREA') {
              drawTextAreaField(doc, field.label || field.id, fieldValue);
            } else if (field.type === 'PHOTO' || field.type === 'PHOTO_GALLERY') {
              await drawPhotoField(doc, field.label || field.id, fieldValue);
            } else if (field.type === 'CHECKBOX') {
              drawCheckboxField(doc, field.label || field.id, fieldValue);
            } else {
              // TEXT, NUMBER, DATE, etc.
              drawTextField(doc, field.label || field.id, fieldValue, field.unit);
            }
          } catch (fieldError) {
            console.error(`[form-pdf] Error drawing field ${field.id}:`, fieldError);
            // Skip field and continue
          }
        }

        doc.moveDown(0.5);
      }

      // Footer - add at bottom of current or new page
      if (doc.y > 700) {
        doc.addPage();
      }
      doc.fontSize(7).font(FONT_REGULAR).fillColor('gray');
      doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 740);
      doc.text('FieldConnect', 500, 740);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function drawTextField(doc, label, value, unit) {
  const y = doc.y;
  const labelWidth = 280;
  const valueWidth = 250;
  const minRowHeight = 20;
  const padding = 6;

  // Calculate height needed for label text
  doc.fontSize(8).font(FONT_BOLD);
  const labelHeight = doc.heightOfString(label, { width: labelWidth - 10 });
  const rowHeight = Math.max(minRowHeight, labelHeight + padding * 2);

  doc.rect(40, y, 532, rowHeight).stroke();
  doc.text(label, 45, y + padding, { width: labelWidth - 10 });

  const displayValue = value !== undefined && value !== null && value !== ''
    ? (unit ? `${value} ${unit}` : String(value))
    : '';
  doc.font(FONT_REGULAR).text(displayValue, 45 + labelWidth, y + padding, { width: valueWidth - 10 });

  doc.y = y + rowHeight;
}

function drawSignatureField(doc, label, value) {
  const y = doc.y;
  const minRowHeight = 35;
  const labelWidth = 280;

  // Calculate height needed for label text
  doc.fontSize(8).font(FONT_BOLD);
  const labelHeight = doc.heightOfString(label, { width: labelWidth - 10 });
  const rowHeight = Math.max(minRowHeight, labelHeight + 25);

  doc.rect(40, y, 532, rowHeight).stroke();
  doc.text(label, 45, y + 3, { width: labelWidth - 10 });

  // Position signature/status to the right of label
  const sigX = 45 + labelWidth;
  if (value?.signed) {
    doc.fontSize(10).font(FONT_REGULAR).text(value.name || 'Signed', sigX, y + 8);
    if (value.signedAt) {
      doc.fontSize(6).text(new Date(value.signedAt).toLocaleString(), sigX, y + 22);
    }
  } else {
    doc.fontSize(8).font(FONT_REGULAR).fillColor('gray').text('Not signed', sigX, y + 12);
    doc.fillColor('black');
  }

  doc.y = y + rowHeight;
}

function drawTextAreaField(doc, label, value) {
  const y = doc.y;
  const text = value || '';
  const minHeight = 40;

  doc.fontSize(8).font(FONT_REGULAR);
  const textHeight = text ? doc.heightOfString(text, { width: 520 }) : 0;
  const rowHeight = Math.max(minHeight, textHeight + 25);

  doc.rect(40, y, 532, rowHeight).stroke();
  doc.font(FONT_BOLD).text(label, 45, y + 3);
  doc.font(FONT_REGULAR).text(text || '', 45, y + 15, { width: 520 });

  doc.y = y + rowHeight;
}

async function drawPhotoField(doc, label, value) {
  const y = doc.y;
  const labelWidth = 200;
  const padding = 5;
  const maxImageWidth = 320;
  const maxImageHeight = 200;

  // Get photos array
  let photos = [];
  if (Array.isArray(value)) {
    photos = value.filter(p => p?.uri);
  } else if (value?.uri) {
    photos = [value];
  }

  // Calculate height needed
  doc.fontSize(8).font(FONT_BOLD);
  const labelHeight = doc.heightOfString(label, { width: labelWidth - 10 });

  if (photos.length === 0) {
    // No photos - just show label and "No photo"
    const rowHeight = Math.max(22, labelHeight + padding * 2);
    doc.rect(40, y, 532, rowHeight).stroke();
    doc.text(label, 45, y + padding, { width: labelWidth - 10 });
    doc.font(FONT_REGULAR).fillColor('gray').text('No photo', 45 + labelWidth, y + padding);
    doc.fillColor('black');
    doc.y = y + rowHeight;
    return;
  }

  // Draw label section
  doc.rect(40, y, 532, 20).stroke();
  doc.text(label, 45, y + padding, { width: labelWidth - 10 });
  doc.font(FONT_REGULAR).text(`${photos.length} photo(s)`, 45 + labelWidth, y + padding);
  doc.y = y + 20;

  // Draw each photo
  for (const photo of photos) {
    try {
      const photoUri = photo.uri;
      let imageBuffer = null;

      // Check if it's a base64 data URI
      if (photoUri && photoUri.startsWith('data:image')) {
        // Extract base64 data from data URI
        const base64Data = photoUri.split(',')[1];
        if (base64Data) {
          imageBuffer = Buffer.from(base64Data, 'base64');
        }
      } else if (photoUri && (photoUri.startsWith('http://') || photoUri.startsWith('https://'))) {
        // URL-based photo - download and embed as actual image
        try {
          console.log('[form-pdf] Downloading image from:', photoUri.substring(0, 80) + '...');
          imageBuffer = await downloadImage(photoUri);
          console.log('[form-pdf] Image downloaded, size:', imageBuffer.length);
        } catch (downloadErr) {
          console.error('[form-pdf] Failed to download image:', downloadErr.message);
          // Fall back to showing as link if download fails
          const photoY = doc.y;
          doc.fontSize(8).font(FONT_REGULAR);
          doc.fillColor('blue').text('Photo: ' + photoUri, 50, photoY, {
            width: 500,
            link: photoUri,
            underline: true
          });
          doc.fillColor('black');
          doc.y = photoY + 20;
          continue;
        }
      }

      // Embed the image if we have a buffer
      if (imageBuffer) {
        // Check if we need a new page
        if (doc.y + maxImageHeight + 20 > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
        }

        const photoY = doc.y;

        // Draw border around image area
        doc.rect(45, photoY, maxImageWidth + 10, maxImageHeight + 10).stroke();

        // Embed the image with fit option to maintain aspect ratio
        doc.image(imageBuffer, 50, photoY + 5, {
          fit: [maxImageWidth, maxImageHeight],
          align: 'center',
          valign: 'center'
        });

        doc.y = photoY + maxImageHeight + 15;
      }
    } catch (imgErr) {
      console.error('[form-pdf] Error embedding photo:', imgErr.message);
      // Fall back to text if image embedding fails
      const errorY = doc.y;
      doc.fontSize(8).font(FONT_REGULAR).fillColor('gray');
      doc.text('[Photo could not be embedded]', 50, errorY);
      doc.fillColor('black');
      doc.y = errorY + 15;
    }
  }
}

function drawCheckboxField(doc, label, value) {
  const y = doc.y;
  const minRowHeight = 20;
  const padding = 5;

  // Calculate height needed for label text
  doc.fontSize(8).font(FONT_REGULAR);
  const labelHeight = doc.heightOfString(label, { width: 500 });
  const rowHeight = Math.max(minRowHeight, labelHeight + padding * 2);

  doc.rect(40, y, 532, rowHeight).stroke();

  // Draw checkbox (vertically centered)
  const checkboxY = y + (rowHeight - 10) / 2;
  doc.rect(45, checkboxY, 10, 10).stroke();
  if (value) {
    doc.fontSize(10).font(FONT_BOLD).text('X', 46, checkboxY - 2);
  }

  // Draw label
  doc.fontSize(8).font(FONT_REGULAR).text(label, 60, y + padding, { width: 500 });

  doc.y = y + rowHeight;
}

/**
 * Generate a PDF for a Voice List
 * @param {Object} voiceList - The voice list with sections and items
 * @param {Object} project - The project info
 * @returns {Promise<Buffer>} PDF buffer
 */
function generateVoiceListPdf(voiceList, project) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
      });

      // Register Unicode fonts for Turkish/Spanish character support
      registerFonts(doc);

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colors
      const headerBg = '#F97316'; // Orange
      const sectionBg = '#FED7AA'; // Light orange
      const borderColor = '#000000';

      // All PDF labels - multilingual
      const language = voiceList.language || 'en';
      const pdfLabels = {
        en: {
          // List types
          material_list: 'Material List',
          inventory: 'Inventory',
          punch_list: 'Punch List',
          action_items: 'Action Items',
          // Info labels
          project: 'Project:',
          date: 'Date:',
          createdBy: 'Created By:',
          totalItems: 'Total Items:',
          // Column headers
          qty: 'Qty',
          unit: 'Unit',
          description: 'Description',
          brand: 'Brand',
          notes: 'Notes',
          otherItems: 'Other Items'
        },
        tr: {
          // List types
          material_list: 'Malzeme Listesi',
          inventory: 'Envanter',
          punch_list: 'Eksik Listesi',
          action_items: 'Aksiyon Kalemleri',
          // Info labels
          project: 'Proje:',
          date: 'Tarih:',
          createdBy: 'Oluşturan:',
          totalItems: 'Toplam Kalem:',
          // Column headers
          qty: 'Adet',
          unit: 'Birim',
          description: 'Açıklama',
          brand: 'Marka',
          notes: 'Notlar',
          otherItems: 'Diğer Kalemler'
        },
        es: {
          // List types
          material_list: 'Lista de Materiales',
          inventory: 'Inventario',
          punch_list: 'Lista de Pendientes',
          action_items: 'Acciones Pendientes',
          // Info labels
          project: 'Proyecto:',
          date: 'Fecha:',
          createdBy: 'Creado Por:',
          totalItems: 'Total Items:',
          // Column headers
          qty: 'Cant.',
          unit: 'Unidad',
          description: 'Descripción',
          brand: 'Marca',
          notes: 'Notas',
          otherItems: 'Otros Items'
        }
      };
      const labels = pdfLabels[language] || pdfLabels.en;

      // Header
      doc.fontSize(18).font(FONT_BOLD).text(voiceList.name || 'Voice List', { align: 'center' });
      doc.fontSize(10).font(FONT_REGULAR).text(labels[voiceList.listType] || 'List', { align: 'center' });
      doc.moveDown(0.5);

      // Project Info Box
      const infoY = doc.y;
      doc.rect(40, infoY, 532, 45).stroke();

      doc.fontSize(10).font(FONT_BOLD);
      doc.text(labels.project, 45, infoY + 5);
      doc.font(FONT_REGULAR).text(project?.name || '', 110, infoY + 5);

      doc.font(FONT_BOLD).text(labels.date, 350, infoY + 5);
      doc.font(FONT_REGULAR).text(new Date(voiceList.createdAt).toLocaleDateString(), 400, infoY + 5);

      doc.font(FONT_BOLD).text(labels.createdBy, 45, infoY + 22);
      doc.font(FONT_REGULAR).text(voiceList.createdByName || '-', 120, infoY + 22);

      doc.font(FONT_BOLD).text(labels.totalItems, 350, infoY + 22);
      doc.font(FONT_REGULAR).text(String(voiceList.items?.length || 0), 440, infoY + 22);

      doc.y = infoY + 55;

      // Table Header
      const tableHeaderY = doc.y;
      doc.rect(40, tableHeaderY, 532, 20).fill(headerBg).stroke(borderColor);
      doc.fillColor('white').fontSize(9).font(FONT_BOLD);
      doc.text('#', 45, tableHeaderY + 5, { width: 25 });
      doc.text(labels.qty, 70, tableHeaderY + 5, { width: 35 });
      doc.text(labels.unit, 105, tableHeaderY + 5, { width: 35 });
      doc.text(labels.description, 145, tableHeaderY + 5, { width: 200 });
      doc.text(labels.brand, 350, tableHeaderY + 5, { width: 70 });
      doc.text(labels.notes, 425, tableHeaderY + 5, { width: 140 });
      doc.fillColor('black');
      doc.y = tableHeaderY + 20;

      // Group items by section
      const sections = voiceList.sections || [];
      const items = voiceList.items || [];

      const itemsBySection = {};
      const unsectionedItems = [];

      items.forEach(item => {
        if (item.sectionId) {
          if (!itemsBySection[item.sectionId]) {
            itemsBySection[item.sectionId] = [];
          }
          itemsBySection[item.sectionId].push(item);
        } else {
          unsectionedItems.push(item);
        }
      });

      let itemNumber = 1;

      // Draw sections with their items
      for (const section of sections) {
        const sectionItems = itemsBySection[section.id] || [];
        if (sectionItems.length === 0) continue;

        // Check if we need a new page
        if (doc.y > 700) {
          doc.addPage();
          doc.y = 40;
        }

        // Section header
        const sectionY = doc.y;
        doc.rect(40, sectionY, 532, 18).fill(sectionBg).stroke(borderColor);
        doc.fillColor('black').fontSize(9).font(FONT_BOLD);
        doc.text(section.name, 45, sectionY + 4);
        doc.fillColor('black');
        doc.y = sectionY + 18;

        // Section items
        for (const item of sectionItems) {
          if (doc.y > 720) {
            doc.addPage();
            doc.y = 40;
          }

          // Calculate row height based on description text
          doc.fontSize(8).font(FONT_REGULAR);
          const descText = item.description || item.rawText || '';
          const descHeight = doc.heightOfString(descText, { width: 195 });
          const rowHeight = Math.max(18, descHeight + 8);

          const rowY = doc.y;
          doc.rect(40, rowY, 532, rowHeight).stroke();

          doc.fontSize(8).font(FONT_REGULAR);
          doc.text(String(itemNumber), 45, rowY + 4, { width: 25 });
          doc.text(item.quantity != null ? String(item.quantity) : '-', 70, rowY + 4, { width: 35 });
          doc.text(item.unit || '-', 105, rowY + 4, { width: 35 });
          doc.text(descText, 145, rowY + 4, { width: 195 });
          doc.text(item.brandName || '-', 350, rowY + 4, { width: 70 });
          doc.text(item.notes || '-', 425, rowY + 4, { width: 140 });

          doc.y = rowY + rowHeight;
          itemNumber++;
        }
      }

      // Unsectioned items
      if (unsectionedItems.length > 0) {
        if (doc.y > 700) {
          doc.addPage();
          doc.y = 40;
        }

        // Unsectioned header
        const unsectionedY = doc.y;
        doc.rect(40, unsectionedY, 532, 18).fill('#E5E7EB').stroke(borderColor);
        doc.fillColor('black').fontSize(9).font(FONT_BOLD);
        doc.text(labels.otherItems, 45, unsectionedY + 4);
        doc.fillColor('black');
        doc.y = unsectionedY + 18;

        for (const item of unsectionedItems) {
          if (doc.y > 720) {
            doc.addPage();
            doc.y = 40;
          }

          // Calculate row height based on description text
          doc.fontSize(8).font(FONT_REGULAR);
          const descText = item.description || item.rawText || '';
          const descHeight = doc.heightOfString(descText, { width: 195 });
          const rowHeight = Math.max(18, descHeight + 8);

          const rowY = doc.y;
          doc.rect(40, rowY, 532, rowHeight).stroke();

          doc.fontSize(8).font(FONT_REGULAR);
          doc.text(String(itemNumber), 45, rowY + 4, { width: 25 });
          doc.text(item.quantity != null ? String(item.quantity) : '-', 70, rowY + 4, { width: 35 });
          doc.text(item.unit || '-', 105, rowY + 4, { width: 35 });
          doc.text(descText, 145, rowY + 4, { width: 195 });
          doc.text(item.brandName || '-', 350, rowY + 4, { width: 70 });
          doc.text(item.notes || '-', 425, rowY + 4, { width: 140 });

          doc.y = rowY + rowHeight;
          itemNumber++;
        }
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).font(FONT_REGULAR).fillColor('gray');
      doc.text(`Generated by FieldConnect on ${new Date().toLocaleString()}`, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generatePreTaskPlanPdf,
  generateGenericFormPdf,
  generateVoiceListPdf
};
