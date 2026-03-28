const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// Font paths for Unicode support (Turkish characters)
const FONT_PATH_REGULAR = path.join(__dirname, '../assets/fonts/NotoSans-Regular.ttf');
const FONT_PATH_BOLD = path.join(__dirname, '../assets/fonts/NotoSans-Bold.ttf');

const fontsAvailable = fs.existsSync(FONT_PATH_REGULAR) && fs.existsSync(FONT_PATH_BOLD);
const FONT_REGULAR = fontsAvailable ? 'Unicode' : 'Helvetica';
const FONT_BOLD = fontsAvailable ? 'Unicode-Bold' : 'Helvetica-Bold';

function registerFonts(doc) {
  if (fontsAvailable) {
    try {
      doc.registerFont('Unicode', FONT_PATH_REGULAR);
      doc.registerFont('Unicode-Bold', FONT_PATH_BOLD);
    } catch (err) {
      console.error('[maintenance-pdf] Failed to register fonts:', err.message);
    }
  }
}

/**
 * Download image from URL and return as buffer
 */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, { timeout: 10000 }, (response) => {
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

/**
 * Decode base64 signature data to buffer
 */
function decodeSignature(signatureData) {
  if (!signatureData) return null;

  // Handle data URL format
  if (signatureData.startsWith('data:image')) {
    const base64Data = signatureData.split(',')[1];
    if (base64Data) {
      return Buffer.from(base64Data, 'base64');
    }
  }

  // Handle raw base64
  try {
    return Buffer.from(signatureData, 'base64');
  } catch {
    return null;
  }
}

/**
 * Generate Bakim (Maintenance) Form PDF
 */
async function generateBakimPdf(visit, pumps, formDataByPump) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 30, bottom: 30, left: 30, right: 30 }
      });

      registerFonts(doc);

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const headerBg = '#1E40AF'; // Blue
      const sectionBg = '#DBEAFE'; // Light blue

      // For each pump, generate a form page
      for (let pumpIndex = 0; pumpIndex < pumps.length; pumpIndex++) {
        const pump = pumps[pumpIndex];
        const formData = formDataByPump[pump.id] || {};

        if (pumpIndex > 0) {
          doc.addPage();
        }

        // Header
        doc.rect(30, 30, 535, 50).fill(headerBg);
        doc.fillColor('white').fontSize(18).font(FONT_BOLD);
        doc.text('BAKIM FORMU', 30, 40, { width: 535, align: 'center' });
        doc.fontSize(10).font(FONT_REGULAR);
        doc.text('Maintenance Form', 30, 60, { width: 535, align: 'center' });
        doc.fillColor('black');
        doc.y = 90;

        // Visit Info Box
        const infoY = doc.y;
        doc.rect(30, infoY, 535, 60).stroke();
        doc.fontSize(9).font(FONT_BOLD);

        doc.text('Firma:', 35, infoY + 5);
        doc.font(FONT_REGULAR).text(visit.customerName || '-', 80, infoY + 5);

        doc.font(FONT_BOLD).text('Tarih:', 300, infoY + 5);
        doc.font(FONT_REGULAR).text(new Date(visit.createdAt).toLocaleDateString('tr-TR'), 340, infoY + 5);

        doc.font(FONT_BOLD).text('Konum:', 35, infoY + 20);
        doc.font(FONT_REGULAR).text(visit.location || '-', 80, infoY + 20);

        doc.font(FONT_BOLD).text('Pompa:', 300, infoY + 20);
        doc.font(FONT_REGULAR).text(`${pumpIndex + 1}/${pumps.length} - ${pump.pumpCategory === 'JOCKEY' ? 'Jockey' : 'Ana'} Pompa`, 345, infoY + 20);

        doc.font(FONT_BOLD).text('Model/Tip:', 35, infoY + 35);
        doc.font(FONT_REGULAR).text(`${pump.pumpModel || '-'} / ${pump.pumpType || '-'}`, 95, infoY + 35);

        doc.font(FONT_BOLD).text('Marka:', 300, infoY + 35);
        doc.font(FONT_REGULAR).text(pump.brand || '-', 340, infoY + 35);

        doc.y = infoY + 70;

        // Pump Component Info
        await drawPumpComponentSection(doc, 'Pompa Bilgileri', pump, sectionBg);

        // Form Sections from formData
        await drawFormSections(doc, formData, sectionBg);

        // Approval Section
        await drawApprovalSection(doc, formData, headerBg);
      }

      // Footer on last page
      doc.fontSize(7).font(FONT_REGULAR).fillColor('gray');
      doc.text(`Olusturulma: ${new Date().toLocaleString('tr-TR')}`, 30, doc.page.height - 30);
      doc.text('ARI Yangin', doc.page.width - 80, doc.page.height - 30);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate Servis Raporu PDF
 */
async function generateServisPdf(visit, formData) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 30, bottom: 30, left: 30, right: 30 }
      });

      registerFonts(doc);

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const headerBg = '#DC2626'; // Red (ARI Yangin color)
      const sectionBg = '#FEE2E2'; // Light red

      // Header
      doc.rect(30, 30, 535, 50).fill(headerBg);
      doc.fillColor('white').fontSize(18).font(FONT_BOLD);
      doc.text('SERVIS RAPORU', 30, 40, { width: 535, align: 'center' });
      doc.fontSize(10).font(FONT_REGULAR);
      doc.text('Service Report', 30, 60, { width: 535, align: 'center' });
      doc.fillColor('black');
      doc.y = 90;

      // Project Info Section
      drawSectionHeader(doc, 'Proje Bilgileri / Project Information', sectionBg);

      const projectFields = [
        { label: 'Isin Adi / Project Name', value: formData.isin_adi || visit.customerName || '-' },
        { label: 'Firma Adi / Company', value: formData.firma_adi || '-' },
        { label: 'Adres / Address', value: formData.adres || visit.location || '-' },
        { label: 'Il / City', value: formData.il || '-' },
        { label: 'Ilce / District', value: formData.ilce || '-' },
      ];

      for (const field of projectFields) {
        drawTextField(doc, field.label, field.value);
      }

      // Visit Times Section
      if (doc.y > 650) doc.addPage();
      drawSectionHeader(doc, 'Ziyaret Zamanlari / Visit Times', sectionBg);

      const timeFields = [
        { label: 'Varis Tarihi / Arrival Date', value: formData.varis_tarihi || '-' },
        { label: 'Varis Saati / Arrival Time', value: formData.varis_saati || '-' },
        { label: 'Ayrilis Tarihi / Departure Date', value: formData.ayrilis_tarihi || '-' },
        { label: 'Ayrilis Saati / Departure Time', value: formData.ayrilis_saati || '-' },
      ];

      for (const field of timeFields) {
        drawTextField(doc, field.label, field.value);
      }

      // Service Type Section
      if (doc.y > 650) doc.addPage();
      drawSectionHeader(doc, 'Yapilan Hizmet / Service Performed', sectionBg);

      const serviceTypes = [
        { id: 'supervizyon_kesif', label: 'Supervizyon / Kesif' },
        { id: 'servis', label: 'Servis' },
        { id: 'bakim', label: 'Bakim' },
        { id: 'isletmeye_alma', label: 'Isletmeye Alma' },
      ];

      for (const svc of serviceTypes) {
        drawCheckboxRow(doc, svc.label, formData[svc.id]);
      }

      // System Checks Section
      if (doc.y > 650) doc.addPage();
      drawSectionHeader(doc, 'Sistem Kontrolleri / System Checks', sectionBg);

      const systemChecks = [
        { id: 'elektrik_baglanti_kontrol', label: 'Elektriksel baglantilar kontrol edildi' },
        { id: 'montaj_kontrol', label: 'Montaj yeri ve sekli kontrol edildi' },
        { id: 'ariza_giderildi', label: 'Ariza giderildi, arizali parca degistirildi' },
        { id: 'sistem_teslim', label: 'Sistem calisir durumda teslim edildi' },
      ];

      for (const check of systemChecks) {
        drawYesNoRow(doc, check.label, formData[check.id]);
      }

      // Notes Section
      if (doc.y > 600) doc.addPage();
      drawSectionHeader(doc, 'Servis Notlari / Service Notes', sectionBg);

      const notesText = formData.service_notes || formData.notes_text || '';
      if (notesText) {
        drawTextArea(doc, notesText);
      } else {
        drawTextField(doc, 'Notlar', '-');
      }

      // Photos Section
      const photos = formData.photos || [];
      if (photos.length > 0) {
        if (doc.y > 500) doc.addPage();
        drawSectionHeader(doc, 'Fotograflar / Photos', sectionBg);
        await drawPhotos(doc, photos);
      }

      // Approval Section
      if (doc.y > 550) doc.addPage();
      await drawServisApprovalSection(doc, formData, headerBg);

      // Footer
      doc.fontSize(7).font(FONT_REGULAR).fillColor('gray');
      doc.text(`Olusturulma: ${new Date().toLocaleString('tr-TR')}`, 30, doc.page.height - 30);
      doc.text('ARI Yangin', doc.page.width - 80, doc.page.height - 30);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Helper functions

function drawSectionHeader(doc, title, bgColor) {
  const y = doc.y;
  doc.rect(30, y, 535, 22).fill(bgColor).stroke('#000');
  doc.fillColor('black').fontSize(10).font(FONT_BOLD);
  doc.text(title, 35, y + 6);
  doc.y = y + 24;
}

function drawTextField(doc, label, value) {
  const y = doc.y;
  const rowHeight = 20;

  doc.rect(30, y, 535, rowHeight).stroke();
  doc.fontSize(8).font(FONT_BOLD);
  doc.text(label + ':', 35, y + 5, { width: 200 });
  doc.font(FONT_REGULAR).text(value || '-', 240, y + 5, { width: 320 });

  doc.y = y + rowHeight;
}

function drawCheckboxRow(doc, label, checked) {
  const y = doc.y;
  const rowHeight = 18;

  doc.rect(30, y, 535, rowHeight).stroke();

  // Checkbox
  doc.rect(35, y + 4, 10, 10).stroke();
  if (checked) {
    doc.fontSize(10).font(FONT_BOLD).text('X', 36, y + 2);
  }

  doc.fontSize(8).font(FONT_REGULAR).text(label, 50, y + 5);

  doc.y = y + rowHeight;
}

function drawYesNoRow(doc, label, value) {
  const y = doc.y;
  const rowHeight = 20;
  const labelWidth = 380;

  doc.rect(30, y, 535, rowHeight).stroke();
  doc.fontSize(8).font(FONT_REGULAR);
  doc.text(label, 35, y + 5, { width: labelWidth });

  // EVET box
  doc.rect(30 + labelWidth, y, 50, rowHeight).stroke();
  doc.font(FONT_BOLD).text('EVET', 30 + labelWidth + 5, y + 5);
  if (value === true || value === 'EVET' || value === 'YES') {
    doc.fontSize(12).text('X', 30 + labelWidth + 35, y + 3);
  }

  // HAYIR box
  doc.rect(30 + labelWidth + 50, y, 50, rowHeight).stroke();
  doc.fontSize(8).font(FONT_BOLD).text('HAYIR', 30 + labelWidth + 55, y + 5);
  if (value === false || value === 'HAYIR' || value === 'NO') {
    doc.fontSize(12).text('X', 30 + labelWidth + 85, y + 3);
  }

  // N/A box
  doc.rect(30 + labelWidth + 100, y, 35, rowHeight).stroke();
  doc.fontSize(8).font(FONT_BOLD).text('N/A', 30 + labelWidth + 108, y + 5);
  if (value === 'NA' || value === 'N/A') {
    doc.fontSize(12).text('X', 30 + labelWidth + 125, y + 3);
  }

  doc.y = y + rowHeight;
}

function drawTextArea(doc, text) {
  const y = doc.y;
  doc.fontSize(8).font(FONT_REGULAR);
  const textHeight = doc.heightOfString(text, { width: 525 });
  const boxHeight = Math.max(60, textHeight + 15);

  doc.rect(30, y, 535, boxHeight).stroke();
  doc.text(text, 35, y + 5, { width: 525 });

  doc.y = y + boxHeight;
}

async function drawPhotos(doc, photos) {
  const maxWidth = 250;
  const maxHeight = 180;
  let x = 35;
  let startY = doc.y;

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];

    // Check if we need a new row
    if (i > 0 && i % 2 === 0) {
      doc.y = startY + maxHeight + 15;
      startY = doc.y;
      x = 35;
    }

    // Check if we need a new page
    if (doc.y + maxHeight > doc.page.height - 50) {
      doc.addPage();
      startY = doc.y;
    }

    try {
      let imageBuffer = null;
      const photoUrl = photo.url || photo.uri;

      if (photoUrl) {
        if (photoUrl.startsWith('data:image')) {
          const base64Data = photoUrl.split(',')[1];
          if (base64Data) {
            imageBuffer = Buffer.from(base64Data, 'base64');
          }
        } else if (photoUrl.startsWith('http')) {
          imageBuffer = await downloadImage(photoUrl);
        }
      }

      if (imageBuffer) {
        doc.rect(x, startY, maxWidth, maxHeight).stroke();
        doc.image(imageBuffer, x + 5, startY + 5, {
          fit: [maxWidth - 10, maxHeight - 10],
          align: 'center',
          valign: 'center'
        });

        if (photo.caption) {
          doc.fontSize(7).font(FONT_REGULAR);
          doc.text(photo.caption, x, startY + maxHeight + 2, { width: maxWidth, align: 'center' });
        }
      }
    } catch (err) {
      console.error('[maintenance-pdf] Error embedding photo:', err.message);
      doc.rect(x, startY, maxWidth, maxHeight).stroke();
      doc.fontSize(8).fillColor('gray').text('[Foto yuklenemedi]', x + 10, startY + maxHeight / 2);
      doc.fillColor('black');
    }

    x += maxWidth + 20;
  }

  doc.y = startY + maxHeight + 20;
}

async function drawPumpComponentSection(doc, title, pump, bgColor) {
  drawSectionHeader(doc, title, bgColor);

  // Get components from pump
  const components = pump.components || [];

  // Pump info
  drawTextField(doc, 'Marka / Brand', pump.brand || '-');
  drawTextField(doc, 'Model', pump.modelNumber || '-');
  drawTextField(doc, 'Seri No / Serial', pump.serialNumber || '-');

  // Component details
  for (const comp of components) {
    if (comp.componentType && comp.componentData) {
      doc.moveDown(0.3);
      doc.fontSize(9).font(FONT_BOLD).text(`${comp.componentType}:`, 35);

      const data = comp.componentData;
      for (const [key, value] of Object.entries(data)) {
        if (value) {
          drawTextField(doc, key, String(value));
        }
      }
    }
  }
}

async function drawFormSections(doc, formData, bgColor) {
  // Draw form checklist items
  const checklistSections = [
    {
      title: 'Kontrol Listesi',
      fields: Object.entries(formData)
        .filter(([key, value]) => typeof value === 'boolean' || value === 'EVET' || value === 'HAYIR')
        .map(([key, value]) => ({ id: key, label: key.replace(/_/g, ' '), value }))
    }
  ];

  for (const section of checklistSections) {
    if (section.fields.length > 0) {
      if (doc.y > 650) doc.addPage();
      drawSectionHeader(doc, section.title, bgColor);

      for (const field of section.fields) {
        drawYesNoRow(doc, field.label, field.value);
      }
    }
  }

  // Draw text notes
  const notes = formData.notes || formData.notlar || '';
  if (notes) {
    if (doc.y > 600) doc.addPage();
    drawSectionHeader(doc, 'Notlar / Notes', bgColor);
    drawTextArea(doc, notes);
  }
}

async function drawApprovalSection(doc, formData, headerBg) {
  if (doc.y > 600) doc.addPage();

  const y = doc.y;
  doc.rect(30, y, 535, 22).fill(headerBg);
  doc.fillColor('white').fontSize(10).font(FONT_BOLD);
  doc.text('Onay / Approval', 35, y + 6);
  doc.fillColor('black');
  doc.y = y + 24;

  const sigY = doc.y;
  const sigWidth = 265;
  const sigHeight = 80;

  // Technician signature
  doc.rect(30, sigY, sigWidth, sigHeight).stroke();
  doc.fontSize(8).font(FONT_BOLD).text('ARI YANGIN Teknisyen', 35, sigY + 5);
  doc.font(FONT_REGULAR).text(formData.technician_name || '-', 35, sigY + 18);

  // Draw signature if exists
  const techSig = formData.technician_signature;
  if (techSig) {
    const sigBuffer = decodeSignature(techSig);
    if (sigBuffer) {
      try {
        doc.image(sigBuffer, 35, sigY + 30, { fit: [sigWidth - 20, 40] });
      } catch (e) {
        console.error('[maintenance-pdf] Error drawing tech signature:', e.message);
      }
    }
  }

  // Customer signature
  doc.rect(30 + sigWidth + 5, sigY, sigWidth, sigHeight).stroke();
  doc.fontSize(8).font(FONT_BOLD).text('Firma Ilgilisi / Customer', 35 + sigWidth + 5, sigY + 5);
  doc.font(FONT_REGULAR).text(formData.customer_name || '-', 35 + sigWidth + 5, sigY + 18);

  const custSig = formData.customer_signature;
  if (custSig) {
    const sigBuffer = decodeSignature(custSig);
    if (sigBuffer) {
      try {
        doc.image(sigBuffer, 35 + sigWidth + 5, sigY + 30, { fit: [sigWidth - 20, 40] });
      } catch (e) {
        console.error('[maintenance-pdf] Error drawing customer signature:', e.message);
      }
    }
  }

  doc.y = sigY + sigHeight + 10;

  // Date
  drawTextField(doc, 'Tarih / Date', formData.approval_date || new Date().toLocaleDateString('tr-TR'));
}

async function drawServisApprovalSection(doc, formData, headerBg) {
  const y = doc.y;
  doc.rect(30, y, 535, 22).fill(headerBg);
  doc.fillColor('white').fontSize(10).font(FONT_BOLD);
  doc.text('Onay / Approval', 35, y + 6);
  doc.fillColor('black');
  doc.y = y + 24;

  const sigY = doc.y;
  const sigWidth = 265;
  const sigHeight = 80;

  // Technician signature
  doc.rect(30, sigY, sigWidth, sigHeight).stroke();
  doc.fontSize(8).font(FONT_BOLD).text('ARI YANGIN Teknisyen', 35, sigY + 5);
  doc.font(FONT_REGULAR).text(formData.technician_name || '-', 35, sigY + 18);

  const techSig = formData.technician_signature;
  if (techSig) {
    const sigBuffer = decodeSignature(techSig);
    if (sigBuffer) {
      try {
        doc.image(sigBuffer, 35, sigY + 30, { fit: [sigWidth - 20, 40] });
      } catch (e) {
        console.error('[maintenance-pdf] Error drawing tech signature:', e.message);
      }
    }
  }

  // Customer signature
  doc.rect(30 + sigWidth + 5, sigY, sigWidth, sigHeight).stroke();
  doc.fontSize(8).font(FONT_BOLD).text('Firma Ilgilisi / Customer', 35 + sigWidth + 5, sigY + 5);
  doc.font(FONT_REGULAR).text(formData.customer_name || '-', 35 + sigWidth + 5, sigY + 18);

  const custSig = formData.customer_signature;
  if (custSig) {
    const sigBuffer = decodeSignature(custSig);
    if (sigBuffer) {
      try {
        doc.image(sigBuffer, 35 + sigWidth + 5, sigY + 30, { fit: [sigWidth - 20, 40] });
      } catch (e) {
        console.error('[maintenance-pdf] Error drawing customer signature:', e.message);
      }
    }
  }

  doc.y = sigY + sigHeight + 10;
}

module.exports = {
  generateBakimPdf,
  generateServisPdf
};
