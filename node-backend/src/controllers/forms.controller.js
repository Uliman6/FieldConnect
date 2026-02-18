const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generatePreTaskPlanPdf } = require('../services/form-pdf.service');
const { extractNameplateData, mapOcrFieldsToFormFields } = require('../services/ocr.service');

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
    // PAGE 2 SECTIONS
    {
      id: 'work_steps',
      name: 'Work Steps & Hazard Analysis',
      description: 'Describe work steps, tools, hazards, and mitigation measures. Use voice to describe your work plan.',
      voiceEnabled: true,
      fields: [
        {
          id: 'work_steps_table',
          label: 'Work Steps Table',
          shortLabel: 'Work steps',
          type: 'TABLE',
          required: false,
          tableColumns: ['Steps for Work', 'Tools', 'Hazards', 'Steps Taken to Address Hazards'],
          maxRows: 10,
          voiceHints: ['first step', 'next step', 'then we', 'using', 'tools', 'hazard', 'risk', 'mitigation', 'address']
        }
      ]
    },
    {
      id: 'hand_at_risk',
      name: 'Hand At Risk Tasks',
      description: 'Identify tasks that put hands at risk and corrective measures',
      voiceEnabled: true,
      fields: [
        {
          id: 'hand_risk_table',
          label: 'Hand At Risk Table',
          shortLabel: 'Hand risks',
          type: 'TABLE',
          required: false,
          tableColumns: ['Hand At Risk Tasks', 'Specific Tools', 'Corrective Measure Other Than PPE'],
          maxRows: 6,
          voiceHints: ['hand', 'risk', 'cutting', 'pinch', 'tool', 'corrective', 'measure']
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
    },
    {
      id: 'crew_signatures',
      name: 'Crew Members',
      description: 'Additional crew members sign below',
      fields: [
        {
          id: 'crew_members',
          label: 'Crew Member Signatures',
          shortLabel: 'Crew signatures',
          type: 'CREW_SIGNATURES',
          required: false,
          maxSignatures: 12
        }
      ]
    }
  ]
};

// Diesel Fire Pump Maintenance Report Template (English - NFPA Compliant)
const DIESEL_FIRE_PUMP_TEMPLATE_EN = {
  sections: [
    {
      id: 'header_info',
      name: 'Report Information',
      description: 'General report and company details',
      fields: [
        {
          id: 'company_name',
          label: 'Company Name',
          shortLabel: 'Company',
          type: 'TEXT',
          required: true
        },
        {
          id: 'company_address',
          label: 'Address',
          shortLabel: 'Address',
          type: 'TEXT',
          required: false
        },
        {
          id: 'maintenance_start_date',
          label: 'Maintenance Start Date',
          shortLabel: 'Start date',
          type: 'DATE',
          required: true
        },
        {
          id: 'maintenance_end_date',
          label: 'Maintenance End Date',
          shortLabel: 'End date',
          type: 'DATE',
          required: false
        },
        {
          id: 'report_date',
          label: 'Report Date',
          shortLabel: 'Report date',
          type: 'DATE',
          required: true
        }
      ]
    },
    {
      id: 'pump_equipment',
      name: 'Pump Equipment Information',
      description: 'Fire pump identification and specifications. Take photos of nameplates.',
      repeatable: true,
      repeatLabel: 'Pump',
      maxRepeats: 10,
      fields: [
        {
          id: 'pump_number',
          label: 'Pump Number/ID',
          shortLabel: 'Pump #',
          type: 'TEXT',
          required: true,
          voiceHints: ['pump number', 'pump id', 'pump one', 'pump two']
        },
        {
          id: 'pump_photo',
          label: 'Fire Pump Nameplate Photo',
          shortLabel: 'Pump photo',
          type: 'PHOTO',
          required: false,
          ocrEnabled: true,
          ocrFields: ['brand', 'model', 'serial_number', 'capacity_gpm', 'rpm']
        },
        {
          id: 'pump_brand',
          label: 'Pump Brand/Manufacturer',
          shortLabel: 'Brand',
          type: 'TEXT',
          required: true,
          voiceHints: ['fairbanks', 'clarke', 'aurora', 'peerless']
        },
        {
          id: 'pump_model',
          label: 'Model/Type',
          shortLabel: 'Model',
          type: 'TEXT',
          required: true
        },
        {
          id: 'pump_serial',
          label: 'Serial Number',
          shortLabel: 'Serial #',
          type: 'TEXT',
          required: true
        },
        {
          id: 'pump_year',
          label: 'Year of Manufacture',
          shortLabel: 'Year',
          type: 'NUMBER',
          required: false
        },
        {
          id: 'pump_capacity',
          label: 'Rated Capacity (GPM)',
          shortLabel: 'Capacity',
          type: 'NUMBER',
          required: true,
          unit: 'GPM'
        },
        {
          id: 'pump_rated_pressure',
          label: 'Rated Pressure (PSI)',
          shortLabel: 'Rated PSI',
          type: 'NUMBER',
          required: true,
          unit: 'PSI'
        }
      ]
    },
    {
      id: 'engine_info',
      name: 'Diesel Engine Information',
      description: 'Engine specifications and identification',
      fields: [
        {
          id: 'engine_photo',
          label: 'Engine Nameplate Photo',
          shortLabel: 'Engine photo',
          type: 'PHOTO',
          required: false,
          ocrEnabled: true,
          ocrFields: ['engine_brand', 'engine_model', 'engine_serial', 'engine_bhp', 'engine_rpm']
        },
        {
          id: 'engine_brand',
          label: 'Engine Brand',
          shortLabel: 'Engine brand',
          type: 'TEXT',
          required: true,
          voiceHints: ['doosan', 'cummins', 'john deere', 'caterpillar', 'clarke']
        },
        {
          id: 'engine_model',
          label: 'Engine Model',
          shortLabel: 'Engine model',
          type: 'TEXT',
          required: true
        },
        {
          id: 'engine_serial',
          label: 'Engine Serial Number',
          shortLabel: 'Engine serial',
          type: 'TEXT',
          required: true
        },
        {
          id: 'engine_bhp',
          label: 'Horsepower (BHP)',
          shortLabel: 'BHP',
          type: 'NUMBER',
          required: false,
          unit: 'BHP'
        },
        {
          id: 'engine_rpm',
          label: 'Rated RPM',
          shortLabel: 'RPM',
          type: 'NUMBER',
          required: false,
          unit: 'RPM'
        }
      ]
    },
    {
      id: 'controller_info',
      name: 'Controller Information',
      description: 'Fire pump controller specifications',
      fields: [
        {
          id: 'controller_photo',
          label: 'Controller Panel Photo',
          shortLabel: 'Controller photo',
          type: 'PHOTO',
          required: false,
          ocrEnabled: true,
          ocrFields: ['controller_brand', 'controller_model', 'controller_serial']
        },
        {
          id: 'controller_brand',
          label: 'Controller Brand',
          shortLabel: 'Controller brand',
          type: 'TEXT',
          required: true,
          voiceHints: ['eaton', 'firetrol', 'metron', 'tornatech']
        },
        {
          id: 'controller_model',
          label: 'Controller Model',
          shortLabel: 'Controller model',
          type: 'TEXT',
          required: true
        },
        {
          id: 'controller_serial',
          label: 'Controller Serial Number',
          shortLabel: 'Controller serial',
          type: 'TEXT',
          required: false
        }
      ]
    },
    {
      id: 'performance_readings',
      name: 'Pump Performance Test',
      description: 'Record pressure readings at different flow rates',
      voiceEnabled: true,
      fields: [
        {
          id: 'performance_table',
          label: 'Performance Readings',
          shortLabel: 'Performance',
          type: 'TABLE',
          required: true,
          tableColumns: ['Flow Rate', 'Suction PSI', 'Discharge PSI', 'RPM'],
          defaultRows: [
            ['0% (No Flow)', '', '', ''],
            ['100% (Rated Flow)', '', '', ''],
            ['150% (Peak Flow)', '', '', '']
          ],
          maxRows: 5,
          voiceHints: ['suction pressure', 'discharge pressure', 'no flow', 'rated flow', 'peak flow', 'psi', 'rpm']
        },
        {
          id: 'gauge_photo',
          label: 'Pressure Gauge Photo',
          shortLabel: 'Gauge photo',
          type: 'PHOTO',
          required: false,
          ocrEnabled: true,
          ocrFields: ['suction_psi', 'discharge_psi']
        }
      ]
    },
    {
      id: 'diesel_pump_checklist',
      name: 'Diesel Pump Maintenance Checklist',
      description: 'NFPA 25 required checks for diesel fire pump',
      fields: [
        {
          id: 'controller_auto',
          label: 'Is the fire pump controller in "automatic" position?',
          shortLabel: 'Controller auto',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['automatic', 'auto position', 'controller']
        },
        {
          id: 'controller_doors_closed',
          label: 'Were controller doors properly closed since last maintenance?',
          shortLabel: 'Doors closed',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'room_temp_adequate',
          label: 'Is pump room temperature above 40°F (5°C)?',
          shortLabel: 'Room temp OK',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['temperature', 'room temp', 'pump room']
        },
        {
          id: 'air_intake_adequate',
          label: 'Is there adequate air intake for engine operation?',
          shortLabel: 'Air intake OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'valves_open',
          label: 'Are pump suction, discharge, and bypass valves open?',
          shortLabel: 'Valves open',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['valves', 'suction valve', 'discharge valve', 'bypass']
        },
        {
          id: 'suction_reservoir_full',
          label: 'Is suction reservoir/tank full?',
          shortLabel: 'Reservoir full',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'no_leaks',
          label: 'No piping or hose leaks observed?',
          shortLabel: 'No leaks',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['leak', 'leaking', 'drip', 'hose']
        },
        {
          id: 'weekly_run_30min',
          label: 'Does pump run 30 minutes weekly without load per NFPA?',
          shortLabel: 'Weekly 30min run',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'pressures_acceptable',
          label: 'Are all pressures and values within acceptable range?',
          shortLabel: 'Pressures OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'fuel_level_adequate',
          label: 'Is diesel fuel level adequate?',
          shortLabel: 'Fuel level OK',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['fuel', 'diesel', 'tank']
        },
        {
          id: 'oil_level_ok',
          label: 'Is engine oil level within acceptable range?',
          shortLabel: 'Oil level OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'coolant_level_ok',
          label: 'Is coolant level within acceptable range?',
          shortLabel: 'Coolant OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'battery_condition_ok',
          label: 'Are batteries in good condition and charged?',
          shortLabel: 'Batteries OK',
          type: 'YES_NO_NA',
          required: true,
          voiceHints: ['battery', 'batteries', 'charged']
        },
        {
          id: 'belts_hoses_ok',
          label: 'Are belts and hoses in good condition?',
          shortLabel: 'Belts/hoses OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'exhaust_system_ok',
          label: 'Is exhaust system functioning properly?',
          shortLabel: 'Exhaust OK',
          type: 'YES_NO_NA',
          required: true
        }
      ]
    },
    {
      id: 'jockey_pump_checklist',
      name: 'Jockey Pump Checklist',
      description: 'Jockey pump operational checks',
      fields: [
        {
          id: 'jockey_switch_auto',
          label: 'Is jockey pump switch set to automatic?',
          shortLabel: 'Jockey auto',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'jockey_start_pressure',
          label: 'Jockey pump start pressure (PSI)',
          shortLabel: 'Start PSI',
          type: 'NUMBER',
          required: true,
          unit: 'PSI'
        },
        {
          id: 'jockey_stop_pressure',
          label: 'Jockey pump stop pressure (PSI)',
          shortLabel: 'Stop PSI',
          type: 'NUMBER',
          required: true,
          unit: 'PSI'
        },
        {
          id: 'jockey_calibration_current',
          label: 'Is pressure switch calibration current?',
          shortLabel: 'Calibration OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'jockey_rotation_correct',
          label: 'Is rotation direction correct?',
          shortLabel: 'Rotation OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'jockey_operational',
          label: 'Does jockey pump operate correctly?',
          shortLabel: 'Jockey works',
          type: 'YES_NO_NA',
          required: true
        }
      ]
    },
    {
      id: 'alarm_indicators',
      name: 'Alarm & Indicator Checks',
      description: 'Verify alarm lights and indicators',
      fields: [
        {
          id: 'indicator_panel_photo',
          label: 'Indicator Panel Photo',
          shortLabel: 'Panel photo',
          type: 'PHOTO',
          required: false
        },
        {
          id: 'pilot_lights_off',
          label: 'Are all alarm pilot lights "off" (no faults)?',
          shortLabel: 'Alarms clear',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'manual_start_tested',
          label: 'Has manual start been tested?',
          shortLabel: 'Manual start OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'auto_start_tested',
          label: 'Has automatic start been tested?',
          shortLabel: 'Auto start OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'transfer_switch_ok',
          label: 'Is transfer switch functioning properly?',
          shortLabel: 'Transfer OK',
          type: 'YES_NO_NA',
          required: false
        }
      ]
    },
    {
      id: 'notes_observations',
      name: 'Notes & Observations',
      description: 'Record any issues, deficiencies, or recommendations. Voice input enabled.',
      voiceEnabled: true,
      fields: [
        {
          id: 'issues_found',
          label: 'Issues/Deficiencies Found',
          shortLabel: 'Issues',
          type: 'TEXT',
          required: false,
          voiceHints: ['issue', 'problem', 'deficiency', 'needs repair', 'replace', 'leak', 'damage']
        },
        {
          id: 'corrective_actions',
          label: 'Corrective Actions Taken/Recommended',
          shortLabel: 'Actions',
          type: 'TEXT',
          required: false,
          voiceHints: ['replaced', 'repaired', 'adjusted', 'recommend', 'needs']
        },
        {
          id: 'issue_photos',
          label: 'Photos of Issues (if any)',
          shortLabel: 'Issue photos',
          type: 'PHOTO_GALLERY',
          required: false,
          maxPhotos: 10
        },
        {
          id: 'next_maintenance_date',
          label: 'Recommended Next Maintenance Date',
          shortLabel: 'Next maintenance',
          type: 'DATE',
          required: false
        }
      ]
    },
    {
      id: 'signatures',
      name: 'Signatures & Certification',
      description: 'Required signatures for report completion',
      fields: [
        {
          id: 'inspector_name',
          label: 'Inspector Name',
          shortLabel: 'Inspector',
          type: 'TEXT',
          required: true
        },
        {
          id: 'sig_inspector',
          label: 'Inspector Signature',
          shortLabel: 'Inspector signature',
          type: 'SIGNATURE',
          required: true
        },
        {
          id: 'company_rep_name',
          label: 'Company Representative Name',
          shortLabel: 'Company rep',
          type: 'TEXT',
          required: false
        },
        {
          id: 'sig_company_rep',
          label: 'Company Representative Signature',
          shortLabel: 'Company signature',
          type: 'SIGNATURE',
          required: false
        }
      ]
    }
  ]
};

// Turkish version of Diesel Fire Pump template
const DIESEL_FIRE_PUMP_TEMPLATE_TR = {
  sections: [
    {
      id: 'header_info',
      name: 'Rapor Bilgileri',
      description: 'Genel rapor ve firma bilgileri',
      fields: [
        {
          id: 'company_name',
          label: 'Firma Adı',
          shortLabel: 'Firma',
          type: 'TEXT',
          required: true
        },
        {
          id: 'company_address',
          label: 'Adres',
          shortLabel: 'Adres',
          type: 'TEXT',
          required: false
        },
        {
          id: 'maintenance_start_date',
          label: 'Periyodik Bakım Başlangıç Tarihi',
          shortLabel: 'Başlangıç',
          type: 'DATE',
          required: true
        },
        {
          id: 'maintenance_end_date',
          label: 'Periyodik Bakım Bitiş Tarihi',
          shortLabel: 'Bitiş',
          type: 'DATE',
          required: false
        },
        {
          id: 'report_date',
          label: 'Rapor Tarihi',
          shortLabel: 'Rapor tarihi',
          type: 'DATE',
          required: true
        }
      ]
    },
    {
      id: 'pump_equipment',
      name: 'Pompa Ekipman Bilgileri',
      description: 'Yangın pompası tanımlama ve özellikleri. Etiket fotoğrafı çekin.',
      repeatable: true,
      repeatLabel: 'Pompa',
      maxRepeats: 10,
      fields: [
        {
          id: 'pump_number',
          label: 'Pompa Numarası/ID',
          shortLabel: 'Pompa #',
          type: 'TEXT',
          required: true
        },
        {
          id: 'pump_photo',
          label: 'Pompa Etiketi Fotoğrafı',
          shortLabel: 'Pompa fotoğrafı',
          type: 'PHOTO',
          required: false,
          ocrEnabled: true
        },
        {
          id: 'pump_brand',
          label: 'Pompa Markası',
          shortLabel: 'Marka',
          type: 'TEXT',
          required: true
        },
        {
          id: 'pump_model',
          label: 'Model/Tip',
          shortLabel: 'Model',
          type: 'TEXT',
          required: true
        },
        {
          id: 'pump_serial',
          label: 'Seri Numarası',
          shortLabel: 'Seri No',
          type: 'TEXT',
          required: true
        },
        {
          id: 'pump_year',
          label: 'İmalat Yılı',
          shortLabel: 'Yıl',
          type: 'NUMBER',
          required: false
        },
        {
          id: 'pump_capacity',
          label: 'Kapasite (GPM)',
          shortLabel: 'Kapasite',
          type: 'NUMBER',
          required: true,
          unit: 'GPM'
        },
        {
          id: 'pump_rated_pressure',
          label: 'Anma Basıncı (PSI)',
          shortLabel: 'Basınç',
          type: 'NUMBER',
          required: true,
          unit: 'PSI'
        }
      ]
    },
    {
      id: 'engine_info',
      name: 'Dizel Motor Bilgileri',
      description: 'Motor özellikleri ve tanımlama',
      fields: [
        {
          id: 'engine_photo',
          label: 'Motor Etiketi Fotoğrafı',
          shortLabel: 'Motor fotoğrafı',
          type: 'PHOTO',
          required: false,
          ocrEnabled: true
        },
        {
          id: 'engine_brand',
          label: 'Motor Markası',
          shortLabel: 'Motor markası',
          type: 'TEXT',
          required: true
        },
        {
          id: 'engine_model',
          label: 'Motor Modeli',
          shortLabel: 'Motor modeli',
          type: 'TEXT',
          required: true
        },
        {
          id: 'engine_serial',
          label: 'Motor Seri Numarası',
          shortLabel: 'Motor seri no',
          type: 'TEXT',
          required: true
        },
        {
          id: 'engine_bhp',
          label: 'Beygir Gücü (BHP)',
          shortLabel: 'BHP',
          type: 'NUMBER',
          required: false,
          unit: 'BHP'
        },
        {
          id: 'engine_rpm',
          label: 'Devir (RPM)',
          shortLabel: 'RPM',
          type: 'NUMBER',
          required: false,
          unit: 'RPM'
        }
      ]
    },
    {
      id: 'controller_info',
      name: 'Kontrol Paneli Bilgileri',
      description: 'Yangın pompası kontrol paneli özellikleri',
      fields: [
        {
          id: 'controller_photo',
          label: 'Kontrol Paneli Fotoğrafı',
          shortLabel: 'Panel fotoğrafı',
          type: 'PHOTO',
          required: false,
          ocrEnabled: true
        },
        {
          id: 'controller_brand',
          label: 'Kontrol Paneli Markası',
          shortLabel: 'Panel markası',
          type: 'TEXT',
          required: true
        },
        {
          id: 'controller_model',
          label: 'Panel Modeli',
          shortLabel: 'Panel modeli',
          type: 'TEXT',
          required: true
        },
        {
          id: 'controller_serial',
          label: 'Panel Seri Numarası',
          shortLabel: 'Panel seri no',
          type: 'TEXT',
          required: false
        }
      ]
    },
    {
      id: 'performance_readings',
      name: 'Pompa Performans Testi',
      description: 'Farklı akış oranlarında basınç ölçümlerini kaydedin',
      voiceEnabled: true,
      fields: [
        {
          id: 'performance_table',
          label: 'Performans Ölçümleri',
          shortLabel: 'Performans',
          type: 'TABLE',
          required: true,
          tableColumns: ['Akış Oranı', 'Emiş PSI', 'Basma PSI', 'RPM'],
          defaultRows: [
            ['%0 (Akışsız)', '', '', ''],
            ['%100 (Anma Akışı)', '', '', ''],
            ['%150 (Tepe Akışı)', '', '', '']
          ],
          maxRows: 5
        },
        {
          id: 'gauge_photo',
          label: 'Basınç Göstergesi Fotoğrafı',
          shortLabel: 'Gösterge fotoğrafı',
          type: 'PHOTO',
          required: false,
          ocrEnabled: true
        }
      ]
    },
    {
      id: 'diesel_pump_checklist',
      name: 'Dizel Pompa Bakım Kontrol Listesi',
      description: 'NFPA 25 gerekli kontroller',
      fields: [
        {
          id: 'controller_auto',
          label: 'Yangın pompası kontrolörü "otomatik" konumda mı?',
          shortLabel: 'Kontrolör otomatik',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'controller_doors_closed',
          label: 'Son bakımdan bu yana kontrolör kapıları kapalı mıydı?',
          shortLabel: 'Kapılar kapalı',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'room_temp_adequate',
          label: 'Pompa odası sıcaklığı 5°C üzerinde mi?',
          shortLabel: 'Oda sıcaklığı OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'air_intake_adequate',
          label: 'Motor çalışması için yeterli hava girişi var mı?',
          shortLabel: 'Hava girişi OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'valves_open',
          label: 'Pompa emiş, basma ve bypass vanaları açık mı?',
          shortLabel: 'Vanalar açık',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'suction_reservoir_full',
          label: 'Su deposu dolu mu?',
          shortLabel: 'Depo dolu',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'no_leaks',
          label: 'Boru veya hortum sızıntısı yok mu?',
          shortLabel: 'Sızıntı yok',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'weekly_run_30min',
          label: 'Pompa ayda 10 dakika elektrik, 30 dakika dizel çalıştırılıyor mu?',
          shortLabel: 'Haftalık çalıştırma',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'pressures_acceptable',
          label: 'Tüm basınç ve değerler kabul edilebilir aralıkta mı?',
          shortLabel: 'Basınçlar OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'fuel_level_adequate',
          label: 'Dizel yakıt seviyesi yeterli mi?',
          shortLabel: 'Yakıt OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'oil_level_ok',
          label: 'Motor yağ seviyesi uygun mu?',
          shortLabel: 'Yağ OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'coolant_level_ok',
          label: 'Soğutma suyu seviyesi uygun mu?',
          shortLabel: 'Soğutma suyu OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'battery_condition_ok',
          label: 'Aküler iyi durumda ve şarjlı mı?',
          shortLabel: 'Aküler OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'belts_hoses_ok',
          label: 'Kayışlar ve hortumlar iyi durumda mı?',
          shortLabel: 'Kayışlar OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'exhaust_system_ok',
          label: 'Egzoz sistemi düzgün çalışıyor mu?',
          shortLabel: 'Egzoz OK',
          type: 'YES_NO_NA',
          required: true
        }
      ]
    },
    {
      id: 'jockey_pump_checklist',
      name: 'Jockey Pompa Kontrol Listesi',
      description: 'Jockey pompa operasyonel kontrolleri',
      fields: [
        {
          id: 'jockey_switch_auto',
          label: 'Jockey pompa şalteri otomatik konumda mı?',
          shortLabel: 'Jockey otomatik',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'jockey_start_pressure',
          label: 'Jockey pompa başlama basıncı (PSI)',
          shortLabel: 'Başlama PSI',
          type: 'NUMBER',
          required: true,
          unit: 'PSI'
        },
        {
          id: 'jockey_stop_pressure',
          label: 'Jockey pompa durma basıncı (PSI)',
          shortLabel: 'Durma PSI',
          type: 'NUMBER',
          required: true,
          unit: 'PSI'
        },
        {
          id: 'jockey_calibration_current',
          label: 'Basınç şalteri kalibrasyonu güncel mi?',
          shortLabel: 'Kalibrasyon OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'jockey_rotation_correct',
          label: 'Dönüş yönü doğru mu?',
          shortLabel: 'Dönüş OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'jockey_operational',
          label: 'Jockey pompa düzgün çalışıyor mu?',
          shortLabel: 'Jockey çalışıyor',
          type: 'YES_NO_NA',
          required: true
        }
      ]
    },
    {
      id: 'alarm_indicators',
      name: 'Alarm ve Gösterge Kontrolleri',
      description: 'Alarm ışıkları ve göstergeleri doğrulayın',
      fields: [
        {
          id: 'indicator_panel_photo',
          label: 'Gösterge Paneli Fotoğrafı',
          shortLabel: 'Panel fotoğrafı',
          type: 'PHOTO',
          required: false
        },
        {
          id: 'pilot_lights_off',
          label: 'Tüm alarm pilot ışıkları "kapalı" mı (arıza yok)?',
          shortLabel: 'Alarmlar temiz',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'manual_start_tested',
          label: 'Manuel çalıştırma test edildi mi?',
          shortLabel: 'Manuel başlatma OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'auto_start_tested',
          label: 'Otomatik çalıştırma test edildi mi?',
          shortLabel: 'Otomatik başlatma OK',
          type: 'YES_NO_NA',
          required: true
        },
        {
          id: 'transfer_switch_ok',
          label: 'Transfer şalteri düzgün çalışıyor mu?',
          shortLabel: 'Transfer OK',
          type: 'YES_NO_NA',
          required: false
        }
      ]
    },
    {
      id: 'notes_observations',
      name: 'Notlar ve Gözlemler',
      description: 'Sorunları, eksiklikleri veya önerileri kaydedin. Sesli giriş etkin.',
      voiceEnabled: true,
      fields: [
        {
          id: 'issues_found',
          label: 'Bulunan Sorunlar/Eksiklikler',
          shortLabel: 'Sorunlar',
          type: 'TEXT',
          required: false
        },
        {
          id: 'corrective_actions',
          label: 'Yapılan/Önerilen Düzeltici Faaliyetler',
          shortLabel: 'Düzeltici faaliyetler',
          type: 'TEXT',
          required: false
        },
        {
          id: 'issue_photos',
          label: 'Sorun Fotoğrafları (varsa)',
          shortLabel: 'Sorun fotoğrafları',
          type: 'PHOTO_GALLERY',
          required: false,
          maxPhotos: 10
        },
        {
          id: 'next_maintenance_date',
          label: 'Önerilen Sonraki Bakım Tarihi',
          shortLabel: 'Sonraki bakım',
          type: 'DATE',
          required: false
        }
      ]
    },
    {
      id: 'signatures',
      name: 'İmzalar ve Onay',
      description: 'Rapor tamamlama için gerekli imzalar',
      fields: [
        {
          id: 'inspector_name',
          label: 'Denetçi Adı',
          shortLabel: 'Denetçi',
          type: 'TEXT',
          required: true
        },
        {
          id: 'sig_inspector',
          label: 'Denetçi İmzası',
          shortLabel: 'Denetçi imzası',
          type: 'SIGNATURE',
          required: true
        },
        {
          id: 'company_rep_name',
          label: 'Firma Temsilcisi Adı',
          shortLabel: 'Firma temsilcisi',
          type: 'TEXT',
          required: false
        },
        {
          id: 'sig_company_rep',
          label: 'Firma Temsilcisi İmzası',
          shortLabel: 'Firma imzası',
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
    const { projectId, language } = req.query;

    // Build where clause
    const where = {
      isActive: true,
      OR: [
        { projectId: null }, // Global templates
        { projectId: projectId || undefined }
      ]
    };

    // Filter by language if provided
    // Show templates matching the language, or "en" templates for all languages as fallback
    if (language && language !== 'en') {
      where.OR = [
        { language: language },
        { language: 'en' } // Always show English templates as fallback
      ];
    }

    const templates = await prisma.formTemplate.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' },
        { language: language === 'tr' ? 'desc' : 'asc' }, // Prioritize user's language
        { name: 'asc' }
      ]
    });

    // If language is specified, filter to show only the user's language version of each template category
    // e.g., if user is Turkish, show Turkish pump template instead of English
    if (language && language !== 'en') {
      const templatesByCategory = {};
      templates.forEach(t => {
        const key = t.category;
        if (!templatesByCategory[key]) {
          templatesByCategory[key] = [];
        }
        templatesByCategory[key].push(t);
      });

      // For each category, prefer the user's language
      const filteredTemplates = [];
      Object.values(templatesByCategory).forEach(categoryTemplates => {
        // Group by similar names (ignoring language differences)
        const groups = {};
        categoryTemplates.forEach(t => {
          // Create a normalized name key for matching
          const normalizedName = t.name.toLowerCase()
            .replace(/dizel yangın pompası bakım raporu/i, 'diesel fire pump')
            .replace(/diesel fire pump maintenance report/i, 'diesel fire pump');
          if (!groups[normalizedName]) {
            groups[normalizedName] = [];
          }
          groups[normalizedName].push(t);
        });

        // For each group, pick the user's language version if available
        Object.values(groups).forEach(group => {
          const userLangVersion = group.find(t => t.language === language);
          const fallback = group.find(t => t.language === 'en');
          filteredTemplates.push(userLangVersion || fallback || group[0]);
        });
      });

      return res.json(filteredTemplates);
    }

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
 * Seed default templates
 */
async function seedDefaultTemplates(req, res) {
  try {
    const createdTemplates = [];

    // 1. Pre-Task Plan (English)
    const existingPreTask = await prisma.formTemplate.findFirst({
      where: { name: 'Pre-Task Plan', isDefault: true }
    });

    if (!existingPreTask) {
      const preTask = await prisma.formTemplate.create({
        data: {
          name: 'Pre-Task Plan',
          description: 'Daily safety and quality planning form (DPR Construction style)',
          category: 'Safety',
          language: 'en',
          schema: PRE_TASK_PLAN_TEMPLATE,
          isDefault: true,
          isActive: true
        }
      });
      createdTemplates.push(preTask);
    }

    // 2. Diesel Fire Pump Maintenance (English)
    const existingPumpEN = await prisma.formTemplate.findFirst({
      where: { name: 'Diesel Fire Pump Maintenance Report', isDefault: true }
    });

    if (!existingPumpEN) {
      const pumpEN = await prisma.formTemplate.create({
        data: {
          name: 'Diesel Fire Pump Maintenance Report',
          description: 'NFPA 25 compliant diesel fire pump maintenance and inspection report',
          category: 'Inspection',
          language: 'en',
          schema: DIESEL_FIRE_PUMP_TEMPLATE_EN,
          isDefault: true,
          isActive: true
        }
      });
      createdTemplates.push(pumpEN);
    }

    // 3. Diesel Fire Pump Maintenance (Turkish)
    const existingPumpTR = await prisma.formTemplate.findFirst({
      where: { name: 'Dizel Yangın Pompası Bakım Raporu', isDefault: true }
    });

    if (!existingPumpTR) {
      const pumpTR = await prisma.formTemplate.create({
        data: {
          name: 'Dizel Yangın Pompası Bakım Raporu',
          description: 'NFPA 25 uyumlu dizel yangın pompası bakım ve denetim raporu',
          category: 'Denetim',
          language: 'tr',
          schema: DIESEL_FIRE_PUMP_TEMPLATE_TR,
          isDefault: true,
          isActive: true
        }
      });
      createdTemplates.push(pumpTR);
    }

    if (createdTemplates.length === 0) {
      return res.json({ message: 'Default templates already exist', count: 0 });
    }

    res.status(201).json({
      message: `Created ${createdTemplates.length} default template(s)`,
      templates: createdTemplates
    });
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

/**
 * Generate PDF for a completed form
 */
async function generateFormPdf(req, res) {
  try {
    const { id } = req.params;

    // Fetch form with template
    const form = await prisma.formInstance.findUnique({
      where: { id },
      include: {
        template: true
      }
    });

    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // Fetch project info
    let project = null;
    if (form.projectId) {
      project = await prisma.project.findUnique({
        where: { id: form.projectId }
      });
    }

    // Generate PDF based on template type
    let pdfBuffer;
    if (form.template?.name === 'Pre-Task Plan') {
      pdfBuffer = await generatePreTaskPlanPdf(form, project);
    } else {
      // Generic PDF generation for other templates
      pdfBuffer = await generatePreTaskPlanPdf(form, project); // Use same for now
    }

    // Set response headers for PDF download
    const filename = `${form.template?.name || 'Form'}_${new Date(form.createdAt).toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error) {
    console.error('[forms] Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
}

/**
 * Extract text from nameplate photo using OCR (GPT-4 Vision)
 */
async function extractNameplateOcr(req, res) {
  try {
    const { imageBase64, equipmentType, fieldsToExtract, sectionId, instanceIndex } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    console.log('[forms] OCR request for:', equipmentType, 'section:', sectionId, 'fields:', fieldsToExtract);

    // Extract data from the image
    const result = await extractNameplateData(imageBase64, fieldsToExtract || [], equipmentType || 'equipment');

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to extract data from image' });
    }

    // Map OCR fields to form field IDs if section provided
    let formFields = {};
    if (sectionId && result.data) {
      formFields = mapOcrFieldsToFormFields(result.data, sectionId, instanceIndex);
    }

    res.json({
      success: true,
      extractedData: result.data,
      formFields: formFields,
      rawResponse: result.rawResponse,
    });
  } catch (error) {
    console.error('[forms] OCR error:', error);
    res.status(500).json({ error: 'Failed to process OCR request' });
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
  generateFormPdf,
  extractNameplateOcr,
  PRE_TASK_PLAN_TEMPLATE
};
