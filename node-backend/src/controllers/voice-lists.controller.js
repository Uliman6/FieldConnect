const prisma = require('../services/prisma');
const transcriptParser = require('../services/transcript-parser.service');
const { generateVoiceListPdf } = require('../services/form-pdf.service');

/**
 * Voice Lists Controller - CRUD + parse for voice-captured material/inventory lists
 * Supports all 3 languages: English, Turkish, Spanish
 */
class VoiceListsController {
  /**
   * Helper: Check if user has access to a project
   */
  _checkProjectAccess(req, projectId) {
    if (req.accessibleProjectIds === null) return true;
    return req.accessibleProjectIds.includes(projectId);
  }

  /**
   * GET /api/voice-lists
   * List voice lists with filters
   */
  async list(req, res, next) {
    try {
      const {
        project_id,
        status,
        list_type,
        limit = 50
      } = req.query;

      const whereClause = {};

      // ACCESS CONTROL: Filter by user's accessible projects
      if (req.accessibleProjectIds !== null) {
        if (req.accessibleProjectIds.length === 0) {
          return res.json([]);
        }

        if (project_id) {
          if (!req.accessibleProjectIds.includes(project_id)) {
            return res.status(403).json({ error: 'You do not have access to this project' });
          }
          whereClause.projectId = project_id;
        } else {
          whereClause.projectId = { in: req.accessibleProjectIds };
        }
      } else if (project_id) {
        whereClause.projectId = project_id;
      }

      if (status) whereClause.status = status;
      if (list_type) whereClause.listType = list_type;

      const voiceLists = await prisma.voiceList.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        include: {
          project: {
            select: { id: true, name: true, number: true }
          },
          _count: {
            select: { items: true, sections: true }
          }
        }
      });

      res.json(voiceLists);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/voice-lists/:id
   * Get a single voice list with all items and sections
   */
  async get(req, res, next) {
    try {
      const { id } = req.params;

      const voiceList = await prisma.voiceList.findUnique({
        where: { id },
        include: {
          project: true,
          sections: {
            orderBy: { orderIndex: 'asc' }
          },
          items: {
            orderBy: { orderIndex: 'asc' }
          }
        }
      });

      if (!voiceList) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Voice list not found'
        });
      }

      // ACCESS CONTROL
      if (!this._checkProjectAccess(req, voiceList.projectId)) {
        return res.status(403).json({ error: 'You do not have access to this voice list' });
      }

      res.json(voiceList);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/voice-lists
   * Create a new voice list
   */
  async create(req, res, next) {
    try {
      const {
        id, // Client-provided ID for local-first sync
        project_id,
        name,
        list_type,
        language,
        created_by_name
      } = req.body;

      if (!project_id) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'project_id is required'
        });
      }

      // If client provided an ID, check if it already exists (idempotent create)
      if (id) {
        const existing = await prisma.voiceList.findUnique({
          where: { id },
          include: { project: true, sections: true, items: true }
        });
        if (existing) {
          return res.status(200).json(existing);
        }
      }

      // Verify project exists
      const project = await prisma.project.findUnique({
        where: { id: project_id }
      });

      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Project not found'
        });
      }

      // ACCESS CONTROL
      if (!this._checkProjectAccess(req, project_id)) {
        return res.status(403).json({ error: 'You do not have access to this project' });
      }

      const userId = req.user?.id;

      const voiceList = await prisma.voiceList.create({
        data: {
          ...(id && { id }),
          projectId: project_id,
          name: name || 'Untitled List',
          listType: list_type || 'material_list',
          language: language || 'en',
          status: 'draft',
          createdById: userId,
          createdByName: created_by_name || null
        },
        include: {
          project: true,
          sections: true,
          items: true
        }
      });

      res.status(201).json(voiceList);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/voice-lists/:id
   * Update a voice list
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const {
        name,
        list_type,
        language,
        status,
        raw_transcript,
        recording_duration
      } = req.body;

      // Check if voice list exists
      const existing = await prisma.voiceList.findUnique({
        where: { id },
        select: { projectId: true }
      });

      if (!existing) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Voice list not found'
        });
      }

      // ACCESS CONTROL
      if (!this._checkProjectAccess(req, existing.projectId)) {
        return res.status(403).json({ error: 'You do not have access to this voice list' });
      }

      const voiceList = await prisma.voiceList.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(list_type !== undefined && { listType: list_type }),
          ...(language !== undefined && { language }),
          ...(status !== undefined && { status }),
          ...(raw_transcript !== undefined && { rawTranscript: raw_transcript }),
          ...(recording_duration !== undefined && { recordingDuration: recording_duration })
        },
        include: {
          project: true,
          sections: { orderBy: { orderIndex: 'asc' } },
          items: { orderBy: { orderIndex: 'asc' } }
        }
      });

      res.json(voiceList);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/voice-lists/:id
   * Delete a voice list
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;

      const existing = await prisma.voiceList.findUnique({
        where: { id },
        select: { projectId: true }
      });

      if (!existing) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Voice list not found'
        });
      }

      // ACCESS CONTROL
      if (!this._checkProjectAccess(req, existing.projectId)) {
        return res.status(403).json({ error: 'You do not have access to this voice list' });
      }

      await prisma.voiceList.delete({
        where: { id }
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/voice-lists/:id/parse
   * Parse a transcript and add items to the voice list
   */
  async parseTranscript(req, res, next) {
    try {
      const { id } = req.params;
      const { transcript, append = false } = req.body;

      if (!transcript) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'transcript is required'
        });
      }

      // Get the voice list
      const voiceList = await prisma.voiceList.findUnique({
        where: { id },
        include: {
          project: true,
          sections: { orderBy: { orderIndex: 'asc' } },
          items: { orderBy: { orderIndex: 'asc' } }
        }
      });

      if (!voiceList) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Voice list not found'
        });
      }

      // ACCESS CONTROL
      if (!this._checkProjectAccess(req, voiceList.projectId)) {
        return res.status(403).json({ error: 'You do not have access to this voice list' });
      }

      console.log('[voice-lists] Parsing transcript for list:', id, 'language:', voiceList.language);

      // Parse the transcript using AI
      const parsed = await transcriptParser.parseVoiceListWithAI(transcript, {
        language: voiceList.language,
        projectName: voiceList.project?.name,
        listName: voiceList.name
      });

      console.log('[voice-lists] Parsed result:', {
        sections: parsed.sections?.length || 0,
        items: parsed.items?.length || 0,
        commands: parsed.commands
      });

      // If not appending, clear existing items and sections
      if (!append) {
        await prisma.voiceListItem.deleteMany({ where: { listId: id } });
        await prisma.voiceListSection.deleteMany({ where: { listId: id } });
      }

      // Get the starting order index
      const existingSectionCount = append ? voiceList.sections.length : 0;
      const existingItemCount = append ? voiceList.items.length : 0;

      // Create sections
      const sectionIdMap = new Map(); // Map section index to actual section ID
      for (let i = 0; i < (parsed.sections || []).length; i++) {
        const section = parsed.sections[i];
        const created = await prisma.voiceListSection.create({
          data: {
            listId: id,
            name: section.name,
            description: section.description,
            orderIndex: existingSectionCount + i,
            createdVia: section.createdVia || 'voice'
          }
        });
        sectionIdMap.set(i, created.id);
      }

      // Create items
      const createdItems = [];
      for (let i = 0; i < (parsed.items || []).length; i++) {
        const item = parsed.items[i];
        const sectionId = item.sectionIndex !== null && sectionIdMap.has(item.sectionIndex)
          ? sectionIdMap.get(item.sectionIndex)
          : null;

        const created = await prisma.voiceListItem.create({
          data: {
            listId: id,
            sectionId,
            rawText: item.rawText,
            quantity: item.quantity,
            unit: item.unit,
            description: item.description,
            category: item.category,
            notes: item.notes,
            orderIndex: existingItemCount + i,
            transcriptSegment: item.rawText
          }
        });
        createdItems.push(created);
      }

      // Update the voice list with the raw transcript
      const currentTranscript = voiceList.rawTranscript || '';
      const newTranscript = append
        ? currentTranscript + (currentTranscript ? '\n\n' : '') + transcript
        : transcript;

      await prisma.voiceList.update({
        where: { id },
        data: { rawTranscript: newTranscript }
      });

      // Fetch the updated voice list
      const updatedList = await prisma.voiceList.findUnique({
        where: { id },
        include: {
          project: true,
          sections: { orderBy: { orderIndex: 'asc' } },
          items: { orderBy: { orderIndex: 'asc' } }
        }
      });

      res.json({
        success: true,
        parsed: {
          sectionsCreated: parsed.sections?.length || 0,
          itemsCreated: createdItems.length,
          commands: parsed.commands || []
        },
        voiceList: updatedList
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/voice-lists/:id/sections
   * Add a section to the voice list (via UI)
   */
  async addSection(req, res, next) {
    try {
      const { id } = req.params;
      const { name, description } = req.body;

      if (!name) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'name is required'
        });
      }

      // Verify voice list exists and get access
      const voiceList = await prisma.voiceList.findUnique({
        where: { id },
        select: { projectId: true },
        include: { _count: { select: { sections: true } } }
      });

      if (!voiceList) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Voice list not found'
        });
      }

      // ACCESS CONTROL
      if (!this._checkProjectAccess(req, voiceList.projectId)) {
        return res.status(403).json({ error: 'You do not have access to this voice list' });
      }

      // Get max order index
      const maxSection = await prisma.voiceListSection.findFirst({
        where: { listId: id },
        orderBy: { orderIndex: 'desc' },
        select: { orderIndex: true }
      });

      const section = await prisma.voiceListSection.create({
        data: {
          listId: id,
          name,
          description,
          orderIndex: (maxSection?.orderIndex ?? -1) + 1,
          createdVia: 'ui'
        }
      });

      res.status(201).json(section);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/voice-lists/:id/sections/:sectionId
   * Update a section
   */
  async updateSection(req, res, next) {
    try {
      const { id, sectionId } = req.params;
      const { name, description, order_index } = req.body;

      // Verify voice list exists
      const voiceList = await prisma.voiceList.findUnique({
        where: { id },
        select: { projectId: true }
      });

      if (!voiceList) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Voice list not found'
        });
      }

      // ACCESS CONTROL
      if (!this._checkProjectAccess(req, voiceList.projectId)) {
        return res.status(403).json({ error: 'You do not have access to this voice list' });
      }

      const section = await prisma.voiceListSection.update({
        where: { id: sectionId },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(order_index !== undefined && { orderIndex: order_index })
        }
      });

      res.json(section);
    } catch (err) {
      if (err.code === 'P2025') {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Section not found'
        });
      }
      next(err);
    }
  }

  /**
   * DELETE /api/voice-lists/:id/sections/:sectionId
   * Delete a section (items in section become unsectioned)
   */
  async deleteSection(req, res, next) {
    try {
      const { id, sectionId } = req.params;

      // Verify voice list exists
      const voiceList = await prisma.voiceList.findUnique({
        where: { id },
        select: { projectId: true }
      });

      if (!voiceList) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Voice list not found'
        });
      }

      // ACCESS CONTROL
      if (!this._checkProjectAccess(req, voiceList.projectId)) {
        return res.status(403).json({ error: 'You do not have access to this voice list' });
      }

      await prisma.voiceListSection.delete({
        where: { id: sectionId }
      });

      res.status(204).send();
    } catch (err) {
      if (err.code === 'P2025') {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Section not found'
        });
      }
      next(err);
    }
  }

  /**
   * POST /api/voice-lists/:id/items
   * Add an item manually
   */
  async addItem(req, res, next) {
    try {
      const { id } = req.params;
      const {
        section_id,
        raw_text,
        quantity,
        unit,
        description,
        category,
        notes
      } = req.body;

      if (!description && !raw_text) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'description or raw_text is required'
        });
      }

      // Verify voice list exists
      const voiceList = await prisma.voiceList.findUnique({
        where: { id },
        select: { projectId: true }
      });

      if (!voiceList) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Voice list not found'
        });
      }

      // ACCESS CONTROL
      if (!this._checkProjectAccess(req, voiceList.projectId)) {
        return res.status(403).json({ error: 'You do not have access to this voice list' });
      }

      // Get max order index
      const maxItem = await prisma.voiceListItem.findFirst({
        where: { listId: id },
        orderBy: { orderIndex: 'desc' },
        select: { orderIndex: true }
      });

      const item = await prisma.voiceListItem.create({
        data: {
          listId: id,
          sectionId: section_id || null,
          rawText: raw_text || description,
          quantity: quantity || null,
          unit: unit || null,
          description: description || raw_text,
          category: category || null,
          notes: notes || null,
          orderIndex: (maxItem?.orderIndex ?? -1) + 1
        }
      });

      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/voice-lists/:id/items/:itemId
   * Update an item
   */
  async updateItem(req, res, next) {
    try {
      const { id, itemId } = req.params;
      const {
        section_id,
        raw_text,
        quantity,
        unit,
        description,
        category,
        notes,
        order_index
      } = req.body;

      // Verify voice list exists
      const voiceList = await prisma.voiceList.findUnique({
        where: { id },
        select: { projectId: true }
      });

      if (!voiceList) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Voice list not found'
        });
      }

      // ACCESS CONTROL
      if (!this._checkProjectAccess(req, voiceList.projectId)) {
        return res.status(403).json({ error: 'You do not have access to this voice list' });
      }

      const item = await prisma.voiceListItem.update({
        where: { id: itemId },
        data: {
          ...(section_id !== undefined && { sectionId: section_id }),
          ...(raw_text !== undefined && { rawText: raw_text }),
          ...(quantity !== undefined && { quantity }),
          ...(unit !== undefined && { unit }),
          ...(description !== undefined && { description }),
          ...(category !== undefined && { category }),
          ...(notes !== undefined && { notes }),
          ...(order_index !== undefined && { orderIndex: order_index })
        }
      });

      res.json(item);
    } catch (err) {
      if (err.code === 'P2025') {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Item not found'
        });
      }
      next(err);
    }
  }

  /**
   * DELETE /api/voice-lists/:id/items/:itemId
   * Delete an item
   */
  async deleteItem(req, res, next) {
    try {
      const { id, itemId } = req.params;

      // Verify voice list exists
      const voiceList = await prisma.voiceList.findUnique({
        where: { id },
        select: { projectId: true }
      });

      if (!voiceList) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Voice list not found'
        });
      }

      // ACCESS CONTROL
      if (!this._checkProjectAccess(req, voiceList.projectId)) {
        return res.status(403).json({ error: 'You do not have access to this voice list' });
      }

      await prisma.voiceListItem.delete({
        where: { id: itemId }
      });

      res.status(204).send();
    } catch (err) {
      if (err.code === 'P2025') {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Item not found'
        });
      }
      next(err);
    }
  }

  /**
   * GET /api/voice-lists/:id/pdf
   * Generate and download PDF for a voice list
   */
  async downloadPdf(req, res, next) {
    try {
      const { id } = req.params;

      // Get the voice list with all data
      const voiceList = await prisma.voiceList.findUnique({
        where: { id },
        include: {
          project: true,
          sections: { orderBy: { orderIndex: 'asc' } },
          items: { orderBy: { orderIndex: 'asc' } }
        }
      });

      if (!voiceList) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Voice list not found'
        });
      }

      // ACCESS CONTROL
      if (!this._checkProjectAccess(req, voiceList.projectId)) {
        return res.status(403).json({ error: 'You do not have access to this voice list' });
      }

      console.log('[voice-lists] Generating PDF for list:', id);

      // Generate the PDF
      const pdfBuffer = await generateVoiceListPdf(voiceList, voiceList.project);

      // Set response headers for PDF download
      const filename = `${voiceList.name || 'voice-list'}_${new Date().toISOString().split('T')[0]}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      res.send(pdfBuffer);
    } catch (err) {
      console.error('[voice-lists] PDF generation error:', err);
      next(err);
    }
  }
}

module.exports = new VoiceListsController();
