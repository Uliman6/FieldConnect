const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Pre-Task Plan template (DPR Construction style)
const PRE_TASK_PLAN_TEMPLATE = {
  sections: [
    {
      id: 'safety_questions',
      name: 'Safety Questions',
      description: 'Answer YES, NO, or N/A for each safety item',
      fields: [
        {
          id: 'walked_work_area',
          label: 'Prior to start, have you walked your work area to address lighting, housekeeping, slip/trip issues etc.?',
          shortLabel: 'Walked work area',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['walked', 'walk around', 'housekeeping', 'lighting', 'slip', 'trip']
        },
        {
          id: 'hazmat_survey',
          label: 'Has a Hazardous Material Survey been conducted on the project/clearance records? (asbestos, lead, PCBs, etc.)',
          shortLabel: 'Hazmat survey',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['hazmat', 'hazardous', 'asbestos', 'lead', 'pcb', 'survey']
        },
        {
          id: 'new_team_member',
          label: 'Is there a new hire, or new team member on the project who will need support?',
          shortLabel: 'New team member',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['new hire', 'new guy', 'new team member', 'apprentice', 'first day']
        },
        {
          id: 'enough_people',
          label: 'Are enough people assigned to safely complete the task? (lifting, repetition, spotters etc.)',
          shortLabel: 'Enough people assigned',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['enough people', 'manpower', 'staffing', 'spotters', 'lifting']
        },
        {
          id: 'hazards_from_others',
          label: 'Are there any hazards created by any other workers in your area or does your work create hazards for others?',
          shortLabel: 'Hazards from/to others',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['other workers', 'hazards', 'nearby', 'adjacent']
        },
        {
          id: 'fall_protection',
          label: 'Does your task require the use of a personal fall arrest system? Has a rescue plan been developed and communicated to all crew members?',
          shortLabel: 'Fall protection required',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['fall protection', 'harness', 'fall arrest', 'rescue plan', 'heights']
        },
        {
          id: 'lockout_tagout',
          label: 'Are you working around live systems or energized equipment? Will you need to use Lockout/Tagout procedures? Any other hazardous energy to be considered; e.g., Pressure Testing?',
          shortLabel: 'Lockout/Tagout needed',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['lockout', 'tagout', 'loto', 'energized', 'live systems', 'pressure']
        },
        {
          id: 'struck_by_caught',
          label: 'Does your work require you to be exposed to pinch points, cave-ins, articulating equipment (caught in-between); falling or flying materials or debris, vehicular traffic, moving equipment (struck by)?',
          shortLabel: 'Struck-by/Caught hazards',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['pinch points', 'cave in', 'struck by', 'caught between', 'traffic', 'debris']
        },
        {
          id: 'operators_certified',
          label: 'Are operators certified/trained/authorized for the equipment they are operating? (Scissor lift, powder actuated tools, forklift, mobile equipment, rigging, etc.)',
          shortLabel: 'Operators certified',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['certified', 'trained', 'authorized', 'scissor lift', 'forklift', 'rigging']
        },
        {
          id: 'special_permits',
          label: 'Does this task require any special permits, procedures or inspection forms? (Confined Space, Hot Work, Excavation, Elevated Work, Energized Electrical Work, Scaffold/Scissor/Boom/Forklift Inspection, etc.)',
          shortLabel: 'Special permits required',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['permit', 'confined space', 'hot work', 'excavation', 'elevated work']
        },
        {
          id: 'right_equipment',
          label: 'Do you have the right type of work platform or equipment to reach your work? Have you been trained to use this equipment?',
          shortLabel: 'Right equipment/platform',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['platform', 'reach', 'ladder', 'scaffold', 'lift']
        },
        {
          id: 'sds_review',
          label: 'Do you need to review SDS\'s (safety data sheets) to proceed with this work?',
          shortLabel: 'SDS review needed',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['sds', 'safety data sheet', 'msds', 'chemical']
        },
        {
          id: 'barricading',
          label: 'Have you addressed any barricading, warning system or signage requirements appropriate to the task?',
          shortLabel: 'Barricading/signage',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['barricade', 'warning', 'signage', 'caution tape', 'cones']
        },
        {
          id: 'tools_inspected',
          label: 'Have all tools, equipment and materials been inspected prior to use and are they adequate to perform work safely?',
          shortLabel: 'Tools inspected',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['tools', 'equipment', 'inspected', 'materials']
        },
        {
          id: 'lifting_bending',
          label: 'Will this task require any lifting, bending or twisting?',
          shortLabel: 'Lifting/bending/twisting',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['lifting', 'bending', 'twisting', 'ergonomic', 'back']
        },
        {
          id: 'stretch_flex',
          label: 'Have you completed Stretch & Flex today?',
          shortLabel: 'Stretch & Flex done',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['stretch', 'flex', 'stretching', 'warm up']
        },
        {
          id: 'injury_report',
          label: 'Do you have an injury to report or were you injured the prior working day?',
          shortLabel: 'Injury to report',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['injury', 'injured', 'hurt', 'report']
        }
      ]
    },
    {
      id: 'quality',
      name: 'Quality',
      description: 'Quality control questions',
      fields: [
        {
          id: 'current_drawing',
          label: 'Identify the drawing you are working from today, is it the current version?',
          shortLabel: 'Current drawing version',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['drawing', 'plans', 'current version', 'revision']
        },
        {
          id: 'reviewed_details',
          label: 'Have you reviewed all construction details associated with our work?',
          shortLabel: 'Reviewed details',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['reviewed', 'details', 'construction details']
        },
        {
          id: 'qc_responsible',
          label: 'Who on the crew is responsible for quality control today?',
          shortLabel: 'QC responsible person',
          type: 'TEXT',
          required: false,
          voiceHints: ['quality control', 'qc', 'responsible']
        },
        {
          id: 'quality_focus',
          label: 'What is the quality item you will be focusing on today? What will you do today that will prevent rework tomorrow?',
          shortLabel: 'Quality focus',
          type: 'TEXT',
          required: false,
          voiceHints: ['focus', 'quality item', 'prevent rework']
        }
      ]
    },
    {
      id: 'ppe',
      name: 'PPE Required',
      description: 'Select all PPE required for this task',
      fields: [
        {
          id: 'ppe_helmet',
          label: 'Helmet/Safety Glasses/Gloves',
          shortLabel: 'Helmet/Glasses/Gloves',
          type: 'CHECKBOX',
          required: false,
          voiceHints: ['helmet', 'hard hat', 'safety glasses', 'gloves']
        },
        {
          id: 'ppe_fall_protection',
          label: 'Fall Protection/Rescue Plan',
          shortLabel: 'Fall protection',
          type: 'CHECKBOX',
          required: false,
          voiceHints: ['fall protection', 'harness', 'lanyard']
        },
        {
          id: 'ppe_goggles',
          label: 'Goggles/Faceshield',
          shortLabel: 'Goggles/Faceshield',
          type: 'CHECKBOX',
          required: false,
          voiceHints: ['goggles', 'face shield', 'eye protection']
        },
        {
          id: 'ppe_hand_arm',
          label: 'Hand/Arm PPE',
          shortLabel: 'Hand/Arm PPE',
          type: 'CHECKBOX',
          required: false,
          voiceHints: ['hand protection', 'arm protection', 'sleeves']
        },
        {
          id: 'ppe_hearing',
          label: 'Hearing PPE',
          shortLabel: 'Hearing protection',
          type: 'CHECKBOX',
          required: false,
          voiceHints: ['hearing', 'ear plugs', 'ear muffs']
        },
        {
          id: 'ppe_foot',
          label: 'Foot PPE',
          shortLabel: 'Foot protection',
          type: 'CHECKBOX',
          required: false,
          voiceHints: ['boots', 'steel toe', 'foot protection']
        },
        {
          id: 'ppe_respirator',
          label: 'Respirator',
          shortLabel: 'Respirator',
          type: 'CHECKBOX',
          required: false,
          voiceHints: ['respirator', 'mask', 'breathing']
        }
      ]
    },
    {
      id: 'safety_equipment',
      name: 'Locate and Identify',
      description: 'Confirm location of safety equipment',
      fields: [
        {
          id: 'loc_emergency_phone',
          label: 'Emergency Telephones',
          shortLabel: 'Emergency phones',
          type: 'CHECKBOX',
          required: false,
          voiceHints: ['emergency phone', 'telephone']
        },
        {
          id: 'loc_fire_extinguisher',
          label: 'Fire Extinguisher',
          shortLabel: 'Fire extinguisher',
          type: 'CHECKBOX',
          required: false,
          voiceHints: ['fire extinguisher', 'extinguisher']
        },
        {
          id: 'loc_exit_routes',
          label: 'Emergency Exit Routes',
          shortLabel: 'Exit routes',
          type: 'CHECKBOX',
          required: false,
          voiceHints: ['exit', 'emergency exit', 'egress']
        },
        {
          id: 'loc_first_aid',
          label: 'First Aid Equipment',
          shortLabel: 'First aid',
          type: 'CHECKBOX',
          required: false,
          voiceHints: ['first aid', 'medical', 'kit']
        }
      ]
    },
    {
      id: 'signatures',
      name: 'Signatures',
      description: 'Required signatures for form completion',
      fields: [
        {
          id: 'sig_work_planner',
          label: 'Work Planner',
          shortLabel: 'Work Planner signature',
          type: 'SIGNATURE',
          required: true
        },
        {
          id: 'sig_supervisor',
          label: 'Supervisor',
          shortLabel: 'Supervisor signature',
          type: 'SIGNATURE',
          required: false
        },
        {
          id: 'sig_ehs',
          label: 'EHS Professional',
          shortLabel: 'EHS signature',
          type: 'SIGNATURE',
          required: false
        }
      ]
    }
  ]
};

/**
 * Get all form templates
 */
async function getTemplates(req, res) {
  try {
    const { projectId } = req.query;

    const templates = await prisma.formTemplate.findMany({
      where: {
        isActive: true,
        OR: [
          { projectId: null }, // Global templates
          { projectId: projectId || undefined }
        ]
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' }
      ]
    });

    res.json(templates);
  } catch (error) {
    console.error('[forms] Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
}

/**
 * Get a single template by ID
 */
async function getTemplate(req, res) {
  try {
    const { id } = req.params;

    const template = await prisma.formTemplate.findUnique({
      where: { id }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    console.error('[forms] Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
}

/**
 * Create a new form template (or seed default)
 */
async function createTemplate(req, res) {
  try {
    const { name, description, category, schema, projectId, isDefault } = req.body;

    const template = await prisma.formTemplate.create({
      data: {
        name,
        description,
        category,
        schema: schema || { sections: [] },
        projectId,
        isDefault: isDefault || false,
        createdById: req.user?.id
      }
    });

    res.status(201).json(template);
  } catch (error) {
    console.error('[forms] Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
}

/**
 * Seed default Pre-Task Plan template
 */
async function seedDefaultTemplates(req, res) {
  try {
    // Check if Pre-Task Plan already exists
    const existing = await prisma.formTemplate.findFirst({
      where: {
        name: 'Pre-Task Plan',
        isDefault: true
      }
    });

    if (existing) {
      return res.json({ message: 'Default templates already exist', template: existing });
    }

    const template = await prisma.formTemplate.create({
      data: {
        name: 'Pre-Task Plan',
        description: 'Daily safety and quality planning form (DPR Construction style)',
        category: 'Safety',
        schema: PRE_TASK_PLAN_TEMPLATE,
        isDefault: true,
        isActive: true
      }
    });

    res.status(201).json({ message: 'Default templates created', template });
  } catch (error) {
    console.error('[forms] Error seeding templates:', error);
    res.status(500).json({ error: 'Failed to seed templates' });
  }
}

/**
 * Get all form instances for a project
 */
async function getForms(req, res) {
  try {
    const { projectId, status, limit = 50 } = req.query;

    const where = {};
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;

    const forms = await prisma.formInstance.findMany({
      where,
      include: {
        template: {
          select: {
            id: true,
            name: true,
            category: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    res.json(forms);
  } catch (error) {
    console.error('[forms] Error fetching forms:', error);
    res.status(500).json({ error: 'Failed to fetch forms' });
  }
}

/**
 * Get a single form instance by ID
 */
async function getForm(req, res) {
  try {
    const { id } = req.params;

    const form = await prisma.formInstance.findUnique({
      where: { id },
      include: {
        template: true
      }
    });

    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    res.json(form);
  } catch (error) {
    console.error('[forms] Error fetching form:', error);
    res.status(500).json({ error: 'Failed to fetch form' });
  }
}

/**
 * Create a new form instance
 */
async function createForm(req, res) {
  try {
    const { templateId, projectId, location, data } = req.body;

    // Verify template exists
    const template = await prisma.formTemplate.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const form = await prisma.formInstance.create({
      data: {
        templateId,
        projectId,
        location,
        data: data || {},
        status: 'DRAFT',
        createdById: req.user?.id,
        createdByName: req.user?.name
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            category: true,
            schema: true
          }
        }
      }
    });

    res.status(201).json(form);
  } catch (error) {
    console.error('[forms] Error creating form:', error);
    res.status(500).json({ error: 'Failed to create form' });
  }
}

/**
 * Update a form instance
 */
async function updateForm(req, res) {
  try {
    const { id } = req.params;
    const { data, status, location, signatures, voiceTranscript } = req.body;

    const updateData = {};
    if (data !== undefined) updateData.data = data;
    if (status !== undefined) updateData.status = status;
    if (location !== undefined) updateData.location = location;
    if (signatures !== undefined) updateData.signatures = signatures;
    if (voiceTranscript !== undefined) updateData.voiceTranscript = voiceTranscript;

    // Set completedAt when status changes to COMPLETED
    if (status === 'COMPLETED') {
      updateData.completedAt = new Date();
    }

    const form = await prisma.formInstance.update({
      where: { id },
      data: updateData,
      include: {
        template: {
          select: {
            id: true,
            name: true,
            category: true,
            schema: true
          }
        }
      }
    });

    res.json(form);
  } catch (error) {
    console.error('[forms] Error updating form:', error);
    res.status(500).json({ error: 'Failed to update form' });
  }
}

/**
 * Delete a form instance
 */
async function deleteForm(req, res) {
  try {
    const { id } = req.params;

    await prisma.formInstance.delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[forms] Error deleting form:', error);
    res.status(500).json({ error: 'Failed to delete form' });
  }
}

module.exports = {
  getTemplates,
  getTemplate,
  createTemplate,
  seedDefaultTemplates,
  getForms,
  getForm,
  createForm,
  updateForm,
  deleteForm,
  PRE_TASK_PLAN_TEMPLATE
};
