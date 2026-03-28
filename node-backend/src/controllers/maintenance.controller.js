const prisma = require('../services/prisma');
const { generateBakimPdf, generateServisPdf } = require('../services/maintenance-pdf.service');

/**
 * Maintenance Controller - CRUD for maintenance visits and pumps
 * Used by the standalone maintenance forms webapp
 */
class MaintenanceController {
  // ============================================
  // VISITS
  // ============================================

  /**
   * GET /api/maintenance/visits
   * List user's maintenance visits
   */
  async listVisits(req, res, next) {
    try {
      const { status, visit_type, limit = 50 } = req.query;
      const userId = req.user.id;

      const whereClause = { userId };

      if (status) whereClause.status = status;
      if (visit_type) whereClause.visitType = visit_type;

      const visits = await prisma.maintenanceVisit.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        include: {
          pumps: {
            orderBy: { sortOrder: 'asc' }
          },
          _count: {
            select: { pumps: true }
          }
        }
      });

      res.json(visits);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/maintenance/visits/:id
   * Get a single visit with all pumps
   */
  async getVisit(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const visit = await prisma.maintenanceVisit.findUnique({
        where: { id },
        include: {
          pumps: {
            orderBy: { sortOrder: 'asc' },
            include: {
              forms: true,
              components: {
                orderBy: { createdAt: 'asc' }
              }
            }
          }
        }
      });

      if (!visit) {
        return res.status(404).json({ error: 'Visit not found' });
      }

      // Check ownership (users can only see their own visits)
      if (visit.userId !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(visit);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/maintenance/visits
   * Create a new maintenance visit
   */
  async createVisit(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        visitType, visit_type,
        companyName, company_name,
        address,
        notes
      } = req.body;

      // Support both camelCase and snake_case
      const finalVisitType = visitType ?? visit_type;
      const finalCompanyName = companyName ?? company_name;

      // Validate visitType if provided
      if (finalVisitType) {
        const validTypes = ['BAKIM', 'SERVIS_SUPERVISORLUK', 'DEVREYE_ALIM'];
        if (!validTypes.includes(finalVisitType)) {
          return res.status(400).json({
            error: `Invalid visitType. Must be one of: ${validTypes.join(', ')}`
          });
        }
      }

      const visit = await prisma.maintenanceVisit.create({
        data: {
          userId,
          visitType: finalVisitType || null,
          companyName: finalCompanyName,
          address,
          notes,
          status: 'draft'
        },
        include: {
          pumps: true
        }
      });

      res.status(201).json(visit);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/maintenance/visits/:id
   * Update a visit
   */
  async updateVisit(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const {
        companyName, company_name,
        address,
        visitType, visit_type,
        notes,
        status
      } = req.body;

      // Check ownership first
      const existing = await prisma.maintenanceVisit.findUnique({
        where: { id },
        select: { userId: true }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Visit not found' });
      }

      if (existing.userId !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const updateData = {};
      const finalCompanyName = companyName ?? company_name;
      const finalVisitType = visitType ?? visit_type;

      if (finalCompanyName !== undefined) updateData.companyName = finalCompanyName;
      if (address !== undefined) updateData.address = address;
      if (finalVisitType !== undefined) {
        // Validate visitType
        const validTypes = ['BAKIM', 'SERVIS_SUPERVISORLUK', 'DEVREYE_ALIM'];
        if (!validTypes.includes(finalVisitType)) {
          return res.status(400).json({
            error: `Invalid visitType. Must be one of: ${validTypes.join(', ')}`
          });
        }
        updateData.visitType = finalVisitType;
      }
      if (notes !== undefined) updateData.notes = notes;
      if (status !== undefined) {
        updateData.status = status;
        if (status === 'completed') {
          updateData.completedAt = new Date();
        }
      }

      const visit = await prisma.maintenanceVisit.update({
        where: { id },
        data: updateData,
        include: {
          pumps: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.json(visit);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/maintenance/visits/:id
   * Delete a visit and all associated pumps
   */
  async deleteVisit(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Check ownership first
      const existing = await prisma.maintenanceVisit.findUnique({
        where: { id },
        select: { userId: true }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Visit not found' });
      }

      if (existing.userId !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      await prisma.maintenanceVisit.delete({
        where: { id }
      });

      res.json({ message: 'Visit deleted successfully' });
    } catch (err) {
      next(err);
    }
  }

  // ============================================
  // PUMPS
  // ============================================

  /**
   * POST /api/maintenance/visits/:id/pumps
   * Add a pump to a visit
   */
  async addPump(req, res, next) {
    try {
      const { id: visitId } = req.params;
      const userId = req.user.id;
      const {
        pumpCategory, pump_category,
        pumpModel, pump_model,
        pumpType, pump_type,
        brand,
        modelNumber, model_number,
        serialNumber, serial_number,
        photoUrl, photo_url
      } = req.body;

      // Check visit ownership
      const visit = await prisma.maintenanceVisit.findUnique({
        where: { id: visitId },
        select: { userId: true, _count: { select: { pumps: true } } }
      });

      if (!visit) {
        return res.status(404).json({ error: 'Visit not found' });
      }

      if (visit.userId !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Support both camelCase and snake_case
      const finalPumpCategory = pumpCategory ?? pump_category;
      const finalPumpModel = pumpModel ?? pump_model;
      const finalPumpType = pumpType ?? pump_type;
      const finalModelNumber = modelNumber ?? model_number;
      const finalSerialNumber = serialNumber ?? serial_number;
      const finalPhotoUrl = photoUrl ?? photo_url;

      if (!finalPumpCategory) {
        return res.status(400).json({ error: 'pumpCategory is required (MAIN or JOCKEY)' });
      }

      // Validate pumpCategory
      if (!['MAIN', 'JOCKEY'].includes(finalPumpCategory)) {
        return res.status(400).json({ error: 'pumpCategory must be MAIN or JOCKEY' });
      }

      // Validate pumpModel if provided
      if (finalPumpModel && !['VERTICAL', 'HORIZONTAL'].includes(finalPumpModel)) {
        return res.status(400).json({ error: 'pumpModel must be VERTICAL or HORIZONTAL' });
      }

      // Validate pumpType if provided
      if (finalPumpType && !['ELEKTRIKLI', 'DIZEL'].includes(finalPumpType)) {
        return res.status(400).json({ error: 'pumpType must be ELEKTRIKLI or DIZEL' });
      }

      const pump = await prisma.maintenancePump.create({
        data: {
          visitId,
          pumpCategory: finalPumpCategory,
          pumpModel: finalPumpModel,
          pumpType: finalPumpType,
          brand,
          modelNumber: finalModelNumber,
          serialNumber: finalSerialNumber,
          photoUrl: finalPhotoUrl,
          sortOrder: visit._count.pumps // Add at end
        }
      });

      res.status(201).json(pump);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/maintenance/pumps/:pumpId
   * Update a pump
   */
  async updatePump(req, res, next) {
    try {
      const { pumpId } = req.params;
      const userId = req.user.id;
      const {
        pumpModel, pump_model,
        pumpType, pump_type,
        brand,
        modelNumber, model_number,
        serialNumber, serial_number,
        photoUrl, photo_url,
        sortOrder, sort_order
      } = req.body;

      // Check ownership through visit
      const pump = await prisma.maintenancePump.findUnique({
        where: { id: pumpId },
        include: {
          visit: { select: { userId: true } }
        }
      });

      if (!pump) {
        return res.status(404).json({ error: 'Pump not found' });
      }

      if (pump.visit.userId !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const updateData = {};

      // Support both camelCase and snake_case
      const finalPumpModel = pumpModel ?? pump_model;
      const finalPumpType = pumpType ?? pump_type;
      const finalModelNumber = modelNumber ?? model_number;
      const finalSerialNumber = serialNumber ?? serial_number;
      const finalPhotoUrl = photoUrl ?? photo_url;
      const finalSortOrder = sortOrder ?? sort_order;

      if (finalPumpModel !== undefined) {
        if (finalPumpModel && !['VERTICAL', 'HORIZONTAL'].includes(finalPumpModel)) {
          return res.status(400).json({ error: 'pumpModel must be VERTICAL or HORIZONTAL' });
        }
        updateData.pumpModel = finalPumpModel;
      }

      if (finalPumpType !== undefined) {
        if (finalPumpType && !['ELEKTRIKLI', 'DIZEL'].includes(finalPumpType)) {
          return res.status(400).json({ error: 'pumpType must be ELEKTRIKLI or DIZEL' });
        }
        updateData.pumpType = finalPumpType;
      }

      if (brand !== undefined) updateData.brand = brand;
      if (finalModelNumber !== undefined) updateData.modelNumber = finalModelNumber;
      if (finalSerialNumber !== undefined) updateData.serialNumber = finalSerialNumber;
      if (finalPhotoUrl !== undefined) updateData.photoUrl = finalPhotoUrl;
      if (finalSortOrder !== undefined) updateData.sortOrder = finalSortOrder;

      const updated = await prisma.maintenancePump.update({
        where: { id: pumpId },
        data: updateData
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/maintenance/pumps/:pumpId
   * Delete a pump
   */
  async deletePump(req, res, next) {
    try {
      const { pumpId } = req.params;
      const userId = req.user.id;

      // Check ownership through visit
      const pump = await prisma.maintenancePump.findUnique({
        where: { id: pumpId },
        include: {
          visit: { select: { userId: true } }
        }
      });

      if (!pump) {
        return res.status(404).json({ error: 'Pump not found' });
      }

      if (pump.visit.userId !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      await prisma.maintenancePump.delete({
        where: { id: pumpId }
      });

      res.json({ message: 'Pump deleted successfully' });
    } catch (err) {
      next(err);
    }
  }

  // ============================================
  // PUMP FORMS (for future use)
  // ============================================

  /**
   * POST /api/maintenance/pumps/:pumpId/forms
   * Create or update a form for a pump (upsert by formType)
   */
  async createPumpForm(req, res, next) {
    try {
      const { pumpId } = req.params;
      const userId = req.user.id;
      const { formType, form_type, formData, form_data, status } = req.body;

      // Check ownership through visit
      const pump = await prisma.maintenancePump.findUnique({
        where: { id: pumpId },
        include: {
          visit: { select: { userId: true } }
        }
      });

      if (!pump) {
        return res.status(404).json({ error: 'Pump not found' });
      }

      if (pump.visit.userId !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const finalFormType = formType ?? form_type;
      const finalFormData = formData ?? form_data ?? {};
      const finalStatus = status || 'pending';

      if (!finalFormType) {
        return res.status(400).json({ error: 'formType is required' });
      }

      // Check if form already exists for this pump and type (upsert)
      const existingForm = await prisma.maintenancePumpForm.findFirst({
        where: {
          pumpId,
          formType: finalFormType
        }
      });

      let form;
      if (existingForm) {
        // Update existing form
        const updateData = {
          formData: finalFormData,
          status: finalStatus
        };
        if (finalStatus === 'completed') {
          updateData.completedAt = new Date();
        }
        form = await prisma.maintenancePumpForm.update({
          where: { id: existingForm.id },
          data: updateData
        });
      } else {
        // Create new form
        form = await prisma.maintenancePumpForm.create({
          data: {
            pumpId,
            formType: finalFormType,
            formData: finalFormData,
            status: finalStatus
          }
        });
      }

      res.status(existingForm ? 200 : 201).json(form);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/maintenance/forms/:formId
   * Update a pump form
   */
  async updatePumpForm(req, res, next) {
    try {
      const { formId } = req.params;
      const userId = req.user.id;
      const { formData, form_data, status } = req.body;

      // Check ownership through pump -> visit
      const form = await prisma.maintenancePumpForm.findUnique({
        where: { id: formId },
        include: {
          pump: {
            include: {
              visit: { select: { userId: true } }
            }
          }
        }
      });

      if (!form) {
        return res.status(404).json({ error: 'Form not found' });
      }

      if (form.pump.visit.userId !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const updateData = {};
      const finalFormData = formData ?? form_data;

      if (finalFormData !== undefined) updateData.formData = finalFormData;
      if (status !== undefined) {
        updateData.status = status;
        if (status === 'completed') {
          updateData.completedAt = new Date();
        }
      }

      const updated = await prisma.maintenancePumpForm.update({
        where: { id: formId },
        data: updateData
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }

  // ============================================
  // PUMP COMPONENTS
  // ============================================

  /**
   * POST /api/maintenance/pumps/:pumpId/components
   * Upsert a component for a pump (create or update by componentType)
   */
  async upsertPumpComponent(req, res, next) {
    try {
      const { pumpId } = req.params;
      const userId = req.user.id;
      const {
        componentType, component_type,
        componentData, component_data,
        brand,
        modelNumber, model_number,
        serialNumber, serial_number,
      } = req.body;

      // Check ownership through pump -> visit
      const pump = await prisma.maintenancePump.findUnique({
        where: { id: pumpId },
        include: {
          visit: { select: { userId: true } }
        }
      });

      if (!pump) {
        return res.status(404).json({ error: 'Pump not found' });
      }

      if (pump.visit.userId !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const finalComponentType = componentType ?? component_type;
      const finalComponentData = componentData ?? component_data ?? {};
      const finalModelNumber = modelNumber ?? model_number;
      const finalSerialNumber = serialNumber ?? serial_number;

      if (!finalComponentType) {
        return res.status(400).json({ error: 'componentType is required' });
      }

      // Check if component already exists for this pump and type
      const existingComponent = await prisma.maintenancePumpComponent.findFirst({
        where: {
          pumpId,
          componentType: finalComponentType
        }
      });

      let component;
      if (existingComponent) {
        // Update existing
        component = await prisma.maintenancePumpComponent.update({
          where: { id: existingComponent.id },
          data: {
            brand,
            modelNumber: finalModelNumber,
            serialNumber: finalSerialNumber,
            componentData: finalComponentData,
          }
        });
      } else {
        // Create new
        component = await prisma.maintenancePumpComponent.create({
          data: {
            pumpId,
            componentType: finalComponentType,
            brand,
            modelNumber: finalModelNumber,
            serialNumber: finalSerialNumber,
            componentData: finalComponentData,
          }
        });
      }

      res.status(existingComponent ? 200 : 201).json(component);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/maintenance/pumps/:pumpId/components
   * Get all components for a pump
   */
  async getPumpComponents(req, res, next) {
    try {
      const { pumpId } = req.params;
      const userId = req.user.id;

      // Check ownership through pump -> visit
      const pump = await prisma.maintenancePump.findUnique({
        where: { id: pumpId },
        include: {
          visit: { select: { userId: true } }
        }
      });

      if (!pump) {
        return res.status(404).json({ error: 'Pump not found' });
      }

      if (pump.visit.userId !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const components = await prisma.maintenancePumpComponent.findMany({
        where: { pumpId },
        orderBy: { createdAt: 'asc' }
      });

      res.json(components);
    } catch (err) {
      next(err);
    }
  }

  // ============================================
  // VISIT FORMS (for Servis Raporu, etc.)
  // ============================================

  /**
   * POST /api/maintenance/visits/:id/forms
   * Create or update a form for a visit (stores form data in notes as JSON)
   */
  async createVisitForm(req, res, next) {
    try {
      const { id: visitId } = req.params;
      const userId = req.user.id;
      const { formType, form_type, formData, form_data, status } = req.body;

      // Check ownership
      const visit = await prisma.maintenanceVisit.findUnique({
        where: { id: visitId },
        select: { userId: true, notes: true }
      });

      if (!visit) {
        return res.status(404).json({ error: 'Visit not found' });
      }

      if (visit.userId !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const finalFormType = formType ?? form_type;
      const finalFormData = formData ?? form_data ?? {};
      const finalStatus = status || 'in_progress';

      if (!finalFormType) {
        return res.status(400).json({ error: 'formType is required' });
      }

      // Parse existing notes as JSON if possible, or create new structure
      let notesData = {};
      try {
        if (visit.notes) {
          notesData = JSON.parse(visit.notes);
        }
      } catch {
        // If notes is plain text, preserve it
        notesData = { _legacyNotes: visit.notes };
      }

      // Store form data keyed by formType
      notesData[finalFormType] = {
        formData: finalFormData,
        status: finalStatus,
        updatedAt: new Date().toISOString()
      };

      // Update visit with the new notes
      const updateData = {
        notes: JSON.stringify(notesData)
      };

      if (finalStatus === 'completed') {
        updateData.status = 'completed';
        updateData.completedAt = new Date();
      }

      const updated = await prisma.maintenanceVisit.update({
        where: { id: visitId },
        data: updateData
      });

      res.json({ success: true, visit: updated });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/maintenance/visits/:id/forms/:formType
   * Get a specific form for a visit
   */
  async getVisitForm(req, res, next) {
    try {
      const { id: visitId, formType } = req.params;
      const userId = req.user.id;

      const visit = await prisma.maintenanceVisit.findUnique({
        where: { id: visitId },
        select: { userId: true, notes: true }
      });

      if (!visit) {
        return res.status(404).json({ error: 'Visit not found' });
      }

      if (visit.userId !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Parse notes to get form data
      let formData = null;
      try {
        if (visit.notes) {
          const notesData = JSON.parse(visit.notes);
          formData = notesData[formType] || null;
        }
      } catch {
        // Notes is not JSON
      }

      if (!formData) {
        return res.status(404).json({ error: 'Form not found' });
      }

      res.json(formData);
    } catch (err) {
      next(err);
    }
  }

  // ============================================
  // AI NOTES CLEANUP
  // ============================================

  /**
   * POST /api/maintenance/cleanup-notes
   * Clean up raw voice transcriptions into a cohesive service report
   */
  async cleanupNotes(req, res, next) {
    try {
      const { rawText, language = 'tr' } = req.body;

      if (!rawText || rawText.trim().length === 0) {
        return res.status(400).json({ error: 'rawText is required' });
      }

      // Use OpenAI/Groq to clean up the notes
      const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
      const isGroq = !!process.env.GROQ_API_KEY;

      if (!apiKey) {
        // Fallback: just return the raw text cleaned up minimally
        const cleanedText = rawText
          .split(/[.!?]+/)
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .map(s => s.charAt(0).toUpperCase() + s.slice(1))
          .join('. ') + '.';

        return res.json({
          success: true,
          cleanedText,
          source: 'fallback'
        });
      }

      const systemPrompt = language === 'tr'
        ? `Sen bir servis raporu editörüsün. Sana verilen ham sesli kayıt transkriptini temiz, profesyonel bir servis notu formatına dönüştür.

Kurallar:
- Konuşma dilini resmi dile çevir
- Tekrarları ve gereksiz kelimeleri kaldır (örn: "şey", "hani", "yani", "ee")
- Yapılan işleri madde madde listele
- Tespit edilen sorunları belirt
- Net ve özlü yaz
- Türkçe karakterleri doğru kullan
- Sadece temizlenmiş metni döndür, başka açıklama ekleme`
        : `You are a service report editor. Convert the raw voice transcript into a clean, professional service note format.

Rules:
- Convert conversational language to formal language
- Remove repetitions and filler words
- List completed tasks as bullet points
- Note any issues found
- Be clear and concise
- Return only the cleaned text, no additional explanation`;

      const apiUrl = isGroq
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: isGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: rawText }
          ],
          temperature: 0.3,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI cleanup failed:', errorText);
        // Fallback to basic cleanup
        const cleanedText = rawText
          .split(/[.!?]+/)
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .map(s => s.charAt(0).toUpperCase() + s.slice(1))
          .join('. ') + '.';

        return res.json({
          success: true,
          cleanedText,
          source: 'fallback'
        });
      }

      const data = await response.json();
      const cleanedText = data.choices?.[0]?.message?.content?.trim() || rawText;

      res.json({
        success: true,
        cleanedText,
        source: isGroq ? 'groq' : 'openai'
      });

    } catch (err) {
      console.error('Notes cleanup error:', err);
      // Fallback on error
      const { rawText } = req.body;
      if (rawText) {
        const cleanedText = rawText
          .split(/[.!?]+/)
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .map(s => s.charAt(0).toUpperCase() + s.slice(1))
          .join('. ') + '.';

        return res.json({
          success: true,
          cleanedText,
          source: 'fallback'
        });
      }
      next(err);
    }
  }

  // ============================================
  // PDF GENERATION
  // ============================================

  /**
   * GET /api/maintenance/visits/:id/pdf
   * Generate PDF for a visit (Bakim or Servis form)
   */
  async generatePdf(req, res, next) {
    try {
      const { id: visitId } = req.params;
      const userId = req.user.id;

      // Get visit with pumps and forms
      const visit = await prisma.maintenanceVisit.findUnique({
        where: { id: visitId },
        include: {
          pumps: {
            include: {
              forms: true,
              components: true
            },
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      if (!visit) {
        return res.status(404).json({ error: 'Visit not found' });
      }

      if (visit.userId !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      let pdfBuffer;
      let filename;

      if (visit.visitType === 'SERVIS_SUPERVISORLUK') {
        // Servis Raporu PDF
        // Get form data from notes field
        let formData = {};
        try {
          if (visit.notes) {
            const notesData = JSON.parse(visit.notes);
            formData = notesData.SERVIS_RAPORU?.formData || notesData || {};
          }
        } catch {
          // Notes is not JSON
        }

        pdfBuffer = await generateServisPdf(visit, formData);
        filename = `servis_raporu_${visit.customerName || 'visit'}_${new Date().toISOString().split('T')[0]}.pdf`;
      } else {
        // Bakim PDF (for BAKIM and DEVREYE_ALIM)
        // Build formDataByPump from pump forms
        const formDataByPump = {};
        for (const pump of visit.pumps) {
          const bakimForm = pump.forms.find(f => f.formType === 'BAKIM');
          formDataByPump[pump.id] = bakimForm?.formData || {};
        }

        pdfBuffer = await generateBakimPdf(visit, visit.pumps, formDataByPump);
        filename = `bakim_formu_${visit.customerName || 'visit'}_${new Date().toISOString().split('T')[0]}.pdf`;
      }

      // Set headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      res.send(pdfBuffer);
    } catch (err) {
      console.error('PDF generation error:', err);
      next(err);
    }
  }
}

module.exports = new MaintenanceController();
