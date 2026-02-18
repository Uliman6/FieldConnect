const PDFDocument = require('pdfkit');

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
      doc.fontSize(18).font('Helvetica-Bold').text('Pre-Task Plan', { align: 'center' });
      doc.fontSize(8).font('Helvetica').text('Archive Document - DO NOT DISCARD', { align: 'center' });
      doc.moveDown(0.5);

      // Project Info Box
      const infoY = doc.y;
      doc.rect(40, infoY, 532, 60).stroke();

      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Project:', 45, infoY + 5);
      doc.font('Helvetica').text(project?.name || form.projectId || '', 100, infoY + 5);

      doc.font('Helvetica-Bold').text('Date:', 350, infoY + 5);
      doc.font('Helvetica').text(new Date(form.createdAt).toLocaleDateString(), 390, infoY + 5);

      doc.font('Helvetica-Bold').text('Project Number:', 45, infoY + 22);
      doc.font('Helvetica').text(project?.projectNumber || '', 130, infoY + 22);

      doc.font('Helvetica-Bold').text('Prepared By:', 350, infoY + 22);
      doc.font('Helvetica').text(form.createdByName || '', 420, infoY + 22);

      doc.font('Helvetica-Bold').text('Specific Location of Work:', 45, infoY + 40);
      doc.font('Helvetica').text(form.location || '', 180, infoY + 40);

      doc.y = infoY + 70;

      // Safety Questions Section
      const safetyHeaderY = doc.y;
      doc.rect(40, safetyHeaderY, 532, 18).fill(headerBg).stroke(borderColor);
      doc.fillColor('black').fontSize(9).font('Helvetica-Bold');
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
      doc.fillColor('black').fontSize(9).font('Helvetica-Bold');
      doc.text('Quality:', 260, qualityHeaderY + 3);
      doc.y = qualityHeaderY + 16;
      doc.moveDown(0.1);

      drawYesNoNaRow(doc, 'Identify the drawing you are working from today, is it the current version?', data.current_drawing);
      drawYesNoNaRow(doc, 'Have you reviewed all construction details associated with our work?', data.reviewed_details);

      // Text fields for quality
      doc.fontSize(8).font('Helvetica-Bold').text('Who on the crew is responsible for quality control today?', 45);
      doc.font('Helvetica').text(data.qc_responsible || '_______________', 45);
      doc.moveDown(0.3);

      doc.font('Helvetica-Bold').text('What is the quality item you will be focusing on today? What will you do today that will prevent rework tomorrow?', 45);
      doc.font('Helvetica').text(data.quality_focus || '_______________', 45);
      doc.moveDown(0.5);

      // PPE and Locate/Identify side by side
      const ppeY = doc.y;

      // PPE Box
      doc.rect(40, ppeY, 260, 120).stroke();
      doc.rect(40, ppeY, 260, 16).fill(headerBg).stroke(borderColor);
      doc.fillColor('black').fontSize(9).font('Helvetica-Bold');
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
      doc.fillColor('black').fontSize(9).font('Helvetica-Bold');
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
      doc.fontSize(18).font('Helvetica-Bold').text('Pre-Task Plan', { align: 'center' });
      doc.fontSize(8).font('Helvetica').text('Archive Document - DO NOT DISCARD', { align: 'center' });
      doc.moveDown(0.5);

      // Instruction
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Safety items identified on the front side question list must be addressed on the table below:', 40);
      doc.moveDown(0.3);

      // Work Steps Table
      const tableY = doc.y;
      const colWidths = [130, 100, 130, 172];
      const rowHeight = 22;
      const tableHeaders = ['Steps for Work', 'Tools', 'Hazards', 'Steps Taken to Address Hazards'];

      // Header row
      doc.rect(40, tableY, 532, 18).fill(headerBg).stroke(borderColor);
      doc.fillColor('black').fontSize(8).font('Helvetica-Bold');
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
            doc.fontSize(7).font('Helvetica').text(workSteps[i][j], cellX + 2, rowY + 3, {
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
      doc.fillColor('black').fontSize(8).font('Helvetica-Bold');
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
            doc.fontSize(7).font('Helvetica').text(handRisks[i][j], cellX + 2, handRowY + 3, {
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
      doc.fontSize(8).font('Helvetica-Bold').text('*If you need more space, attach another PRE-TASK PLAN SHEET', { align: 'center' });
      doc.moveDown(0.5);

      // Signatures row
      const sigY = doc.y;
      const sigWidth = 177;

      // Work Planner
      doc.rect(40, sigY, sigWidth, 40).stroke();
      doc.fontSize(8).font('Helvetica-Bold').text('Work Planner', 45, sigY + 3);
      if (data.sig_work_planner?.signed) {
        doc.fontSize(10).font('Helvetica').text(data.sig_work_planner.name || 'Signed', 45, sigY + 18);
        doc.fontSize(6).text(new Date(data.sig_work_planner.signedAt).toLocaleString(), 45, sigY + 30);
      }

      // Supervisor
      doc.rect(40 + sigWidth, sigY, sigWidth, 40).stroke();
      doc.fontSize(8).font('Helvetica-Bold').text('Supervisor', 45 + sigWidth, sigY + 3);
      if (data.sig_supervisor?.signed) {
        doc.fontSize(10).font('Helvetica').text(data.sig_supervisor.name || 'Signed', 45 + sigWidth, sigY + 18);
        doc.fontSize(6).text(new Date(data.sig_supervisor.signedAt).toLocaleString(), 45 + sigWidth, sigY + 30);
      }

      // EHS
      doc.rect(40 + sigWidth * 2, sigY, sigWidth + 1, 40).stroke();
      doc.fontSize(8).font('Helvetica-Bold').text('EHS Professional', 45 + sigWidth * 2, sigY + 3);
      if (data.sig_ehs?.signed) {
        doc.fontSize(10).font('Helvetica').text(data.sig_ehs.name || 'Signed', 45 + sigWidth * 2, sigY + 18);
        doc.fontSize(6).text(new Date(data.sig_ehs.signedAt).toLocaleString(), 45 + sigWidth * 2, sigY + 30);
      }

      doc.y = sigY + 50;

      // Crew Members section
      doc.fontSize(9).font('Helvetica-Bold');
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
            doc.fontSize(8).font('Helvetica').text(crewMembers[idx].name || 'Signed', x + 3, y + 5);
          }
        }
      }

      // Footer
      doc.y = 720;
      doc.fontSize(7).font('Helvetica');
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
  doc.fontSize(7).font('Helvetica');
  const textHeight = doc.heightOfString(label, { width: labelWidth - 10 });
  const rowHeight = Math.max(minRowHeight, textHeight + padding * 2);

  // Draw main row box with dynamic height
  doc.rect(40, y, 532, rowHeight).stroke();
  doc.text(label, 45, y + padding, { width: labelWidth - 10 });

  // Calculate vertical center for YES/NO/NA boxes
  const boxY = y + (rowHeight - minRowHeight) / 2;

  // YES box
  doc.rect(40 + labelWidth, y, boxWidth, rowHeight).stroke();
  doc.fontSize(8).font('Helvetica-Bold').text('YES', 40 + labelWidth + 5, boxY + 4);
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
    doc.fontSize(10).font('Helvetica-Bold').text('X', x + 1, y - 1);
  }
  doc.fontSize(8).font('Helvetica').text(label, x + 15, y + 1);
}

module.exports = {
  generatePreTaskPlanPdf
};
