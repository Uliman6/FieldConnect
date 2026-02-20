const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generatePreTaskPlanPdf, generateGenericFormPdf } = require('../services/form-pdf.service');
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
          required: false,
          voiceHints: ['walked', 'walk around', 'housekeeping', 'lighting', 'slip', 'trip']
        },
        {
          id: 'hazmat_survey',
          label: 'Has a Hazardous Material Survey been conducted on the project/clearance records? (asbestos, lead, PCBs, etc.)',
          shortLabel: 'Hazmat survey',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['hazmat', 'hazardous', 'asbestos', 'lead', 'pcb', 'survey']
        },
        {
          id: 'new_team_member',
          label: 'Is there a new hire, or new team member on the project who will need support?',
          shortLabel: 'New team member',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['new hire', 'new guy', 'new team member', 'apprentice', 'first day']
        },
        {
          id: 'enough_people',
          label: 'Are enough people assigned to safely complete the task? (lifting, repetition, spotters etc.)',
          shortLabel: 'Enough people assigned',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['enough people', 'manpower', 'staffing', 'spotters', 'lifting']
        },
        {
          id: 'hazards_from_others',
          label: 'Are there any hazards created by any other workers in your area or does your work create hazards for others?',
          shortLabel: 'Hazards from/to others',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['other workers', 'hazards', 'nearby', 'adjacent']
        },
        {
          id: 'fall_protection',
          label: 'Does your task require the use of a personal fall arrest system? Has a rescue plan been developed and communicated to all crew members?',
          shortLabel: 'Fall protection required',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['fall protection', 'harness', 'fall arrest', 'rescue plan', 'heights']
        },
        {
          id: 'lockout_tagout',
          label: 'Are you working around live systems or energized equipment? Will you need to use Lockout/Tagout procedures? Any other hazardous energy to be considered; e.g., Pressure Testing?',
          shortLabel: 'Lockout/Tagout needed',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['lockout', 'tagout', 'loto', 'energized', 'live systems', 'pressure']
        },
        {
          id: 'struck_by_caught',
          label: 'Does your work require you to be exposed to pinch points, cave-ins, articulating equipment (caught in-between); falling or flying materials or debris, vehicular traffic, moving equipment (struck by)?',
          shortLabel: 'Struck-by/Caught hazards',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['pinch points', 'cave in', 'struck by', 'caught between', 'traffic', 'debris']
        },
        {
          id: 'operators_certified',
          label: 'Are operators certified/trained/authorized for the equipment they are operating? (Scissor lift, powder actuated tools, forklift, mobile equipment, rigging, etc.)',
          shortLabel: 'Operators certified',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['certified', 'trained', 'authorized', 'scissor lift', 'forklift', 'rigging']
        },
        {
          id: 'special_permits',
          label: 'Does this task require any special permits, procedures or inspection forms? (Confined Space, Hot Work, Excavation, Elevated Work, Energized Electrical Work, Scaffold/Scissor/Boom/Forklift Inspection, etc.)',
          shortLabel: 'Special permits required',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['permit', 'confined space', 'hot work', 'excavation', 'elevated work']
        },
        {
          id: 'right_equipment',
          label: 'Do you have the right type of work platform or equipment to reach your work? Have you been trained to use this equipment?',
          shortLabel: 'Right equipment/platform',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['platform', 'reach', 'ladder', 'scaffold', 'lift']
        },
        {
          id: 'sds_review',
          label: 'Do you need to review SDS\'s (safety data sheets) to proceed with this work?',
          shortLabel: 'SDS review needed',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['sds', 'safety data sheet', 'msds', 'chemical']
        },
        {
          id: 'barricading',
          label: 'Have you addressed any barricading, warning system or signage requirements appropriate to the task?',
          shortLabel: 'Barricading/signage',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['barricade', 'warning', 'signage', 'caution tape', 'cones']
        },
        {
          id: 'tools_inspected',
          label: 'Have all tools, equipment and materials been inspected prior to use and are they adequate to perform work safely?',
          shortLabel: 'Tools inspected',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['tools', 'equipment', 'inspected', 'materials']
        },
        {
          id: 'lifting_bending',
          label: 'Will this task require any lifting, bending or twisting?',
          shortLabel: 'Lifting/bending/twisting',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['lifting', 'bending', 'twisting', 'ergonomic', 'back']
        },
        {
          id: 'stretch_flex',
          label: 'Have you completed Stretch & Flex today?',
          shortLabel: 'Stretch & Flex done',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['stretch', 'flex', 'stretching', 'warm up']
        },
        {
          id: 'injury_report',
          label: 'Do you have an injury to report or were you injured the prior working day?',
          shortLabel: 'Injury to report',
          type: 'YES_NO_NA',
          required: false,
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
          required: false,
          voiceHints: ['drawing', 'plans', 'current version', 'revision']
        },
        {
          id: 'reviewed_details',
          label: 'Have you reviewed all construction details associated with our work?',
          shortLabel: 'Reviewed details',
          type: 'YES_NO_NA',
          required: false,
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
          tableColumns: [
            { name: 'Steps for Work', voiceEnabled: true },
            { name: 'Tools', voiceEnabled: true },
            { name: 'Hazards', voiceEnabled: true },
            { name: 'Steps Taken to Address Hazards', voiceEnabled: true }
          ],
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
          tableColumns: [
            { name: 'Hand At Risk Tasks', voiceEnabled: true },
            { name: 'Specific Tools', voiceEnabled: true },
            { name: 'Corrective Measure Other Than PPE', voiceEnabled: true }
          ],
          maxRows: 6,
          voiceHints: ['hand', 'risk', 'cutting', 'pinch', 'tool', 'corrective', 'measure']
        }
      ]
    },
    {
      id: 'signatures',
      name: 'Signatures',
      description: 'Signatures for form completion',
      fields: [
        {
          id: 'sig_work_planner',
          label: 'Work Planner',
          shortLabel: 'Work Planner signature',
          type: 'SIGNATURE',
          required: false
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

// Diesel Fire Pump Maintenance Report Template - BILINGUAL (Turkish/English)
// Based on ARI Yangın Koruma form template - NFPA 20/25 compliant
const DIESEL_FIRE_PUMP_TEMPLATE_BILINGUAL = {
  sections: [
    {
      id: 'header_info',
      name: 'Firma Bilgileri / Company Info',
      description: 'Genel rapor ve firma bilgileri / General report and company details',
      fields: [
        {
          id: 'company_name',
          label: 'Firma Adı / Company Name',
          shortLabel: 'Firma/Company',
          type: 'TEXT',
          required: false
        },
        {
          id: 'company_address',
          label: 'Periyodik Kontrol Adresi / Service Address',
          shortLabel: 'Adres/Address',
          type: 'TEXT',
          required: false
        },
        {
          id: 'phone',
          label: 'Telefon Numarası / Phone',
          shortLabel: 'Telefon/Phone',
          type: 'TEXT',
          required: false
        },
        {
          id: 'email',
          label: 'E-posta / E-Mail',
          shortLabel: 'E-posta/Email',
          type: 'TEXT',
          required: false
        },
        {
          id: 'maintenance_start_date',
          label: 'Periyodik Kontrol Başlangıç Tarihi ve Saati / Periodic Maintenance Start Date',
          shortLabel: 'Başlangıç/Start',
          type: 'DATE',
          required: false
        },
        {
          id: 'maintenance_end_date',
          label: 'Periyodik Kontrol Bitiş Tarihi ve Saati / Periodic Maintenance End Date',
          shortLabel: 'Bitiş/End',
          type: 'DATE',
          required: false
        },
        {
          id: 'next_maintenance_date',
          label: 'Bir Sonraki Periyodik Kontrol Tarihi / Next Maintenance Date',
          shortLabel: 'Sonraki/Next',
          type: 'DATE',
          required: false
        },
        {
          id: 'report_date',
          label: 'Rapor Tarihi / Report Date',
          shortLabel: 'Rapor/Report',
          type: 'DATE',
          required: false
        }
      ]
    },
    {
      id: 'pump_label_info',
      name: 'Yangın Pompası Etiket Bilgileri / Fire Pump Label Information',
      description: 'Pompa etiketinden bilgileri girin veya fotoğraf çekin / Enter details from pump nameplate or take a photo',
      fields: [
        {
          id: 'pump_photo',
          label: 'Pompa Etiketi Fotoğrafı / Pump Nameplate Photo',
          shortLabel: 'Fotoğraf/Photo',
          type: 'PHOTO',
          required: false,
          ocrEnabled: true
        },
        {
          id: 'pump_brand',
          label: 'Markası / Brand',
          shortLabel: 'Marka/Brand',
          type: 'TEXT',
          required: false
        },
        {
          id: 'pump_model',
          label: 'Model/Tipi / Model/Type',
          shortLabel: 'Model/Type',
          type: 'TEXT',
          required: false
        },
        {
          id: 'pump_serial',
          label: 'Seri / Üretim No / Serial Number',
          shortLabel: 'Seri/Serial',
          type: 'TEXT',
          required: false
        },
        {
          id: 'pump_year',
          label: 'İmalat Yılı / Year of Manufacture',
          shortLabel: 'Yıl/Year',
          type: 'NUMBER',
          required: false
        },
        {
          id: 'pump_capacity',
          label: 'Kapasite / Capacity (GPM)',
          shortLabel: 'Kapasite/Cap',
          type: 'NUMBER',
          required: false,
          unit: 'GPM'
        },
        {
          id: 'pump_pressure',
          label: 'Basınç / Pressure (PSI)',
          shortLabel: 'Basınç/Press',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'pump_rpm',
          label: 'RPM',
          shortLabel: 'RPM',
          type: 'NUMBER',
          required: false
        },
        {
          id: 'label_pressure_0',
          label: 'Etiket Basıncı %0 / Label Pressure 0%',
          shortLabel: '%0 PSI',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'label_pressure_100',
          label: 'Etiket Basıncı %100 / Label Pressure 100%',
          shortLabel: '%100 PSI',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'label_pressure_150',
          label: 'Etiket Basıncı %150 / Label Pressure 150%',
          shortLabel: '%150 PSI',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        }
      ]
    },
    {
      id: 'controller_label_info',
      name: 'Kontrol Paneli Etiket Bilgileri / Controller Label Information',
      description: 'Kontrol paneli bilgileri / Controller panel information',
      fields: [
        {
          id: 'controller_photo',
          label: 'Kontrol Paneli Fotoğrafı / Controller Photo',
          shortLabel: 'Panel Fotoğraf',
          type: 'PHOTO',
          required: false,
          ocrEnabled: true,
          ocrFields: ['controller_brand', 'controller_catalog_no', 'controller_serial', 'controller_hp', 'controller_phase', 'controller_hertz', 'controller_volts', 'controller_control_volts', 'controller_enclosure_type', 'controller_sccr', 'controller_country']
        },
        {
          id: 'controller_brand',
          label: 'Markası / Brand',
          shortLabel: 'Marka/Brand',
          type: 'TEXT',
          required: false
        },
        {
          id: 'controller_catalog_no',
          label: 'Katalog No / Catalog No.',
          shortLabel: 'Katalog/CAT',
          type: 'TEXT',
          required: false
        },
        {
          id: 'controller_model',
          label: 'Model/Tipi / Model/Type',
          shortLabel: 'Model/Type',
          type: 'TEXT',
          required: false
        },
        {
          id: 'controller_serial',
          label: 'Seri / Üretim No / Serial Number',
          shortLabel: 'Seri/Serial',
          type: 'TEXT',
          required: false
        },
        {
          id: 'controller_hp',
          label: 'Beygir Gücü / Horsepower (H.P.)',
          shortLabel: 'H.P.',
          type: 'TEXT',
          required: false
        },
        {
          id: 'controller_phase',
          label: 'Faz / Phase',
          shortLabel: 'Faz/Phase',
          type: 'TEXT',
          required: false
        },
        {
          id: 'controller_hertz',
          label: 'Frekans / Hertz',
          shortLabel: 'Hz',
          type: 'TEXT',
          required: false
        },
        {
          id: 'controller_volts',
          label: 'Voltaj / Volts',
          shortLabel: 'Volt',
          type: 'TEXT',
          required: false
        },
        {
          id: 'controller_control_volts',
          label: 'Kontrol Devresi Voltajı / Control Circuit Volts',
          shortLabel: 'Kontrol V',
          type: 'TEXT',
          required: false
        },
        {
          id: 'controller_enclosure_type',
          label: 'Muhafaza Tipi / Enclosure Type',
          shortLabel: 'Muhafaza/Encl',
          type: 'TEXT',
          required: false
        },
        {
          id: 'controller_sccr',
          label: 'SCCR / Maks. Amper',
          shortLabel: 'SCCR',
          type: 'TEXT',
          required: false
        },
        {
          id: 'controller_country',
          label: 'Üretim Ülkesi / Country',
          shortLabel: 'Ülke/Country',
          type: 'TEXT',
          required: false
        },
        {
          id: 'controller_year',
          label: 'İmalat Yılı / Year',
          shortLabel: 'Yıl/Year',
          type: 'NUMBER',
          required: false
        },
        {
          id: 'driver_cc',
          label: 'Driver g(cc)',
          shortLabel: 'Driver cc',
          type: 'TEXT',
          required: false
        }
      ]
    },
    {
      id: 'measuring_instruments',
      name: 'Ölçüm Aletleri Bilgileri / Measuring Instruments Information',
      description: 'Kalibrasyon ve ölçüm aleti bilgileri / Calibration and measuring instrument details',
      fields: [
        {
          id: 'instrument_name',
          label: 'Ölçüm Aleti Adı / Instrument Name',
          shortLabel: 'Alet/Instrument',
          type: 'TEXT',
          required: false
        },
        {
          id: 'instrument_serial',
          label: 'Ölçüm Aleti Seri No / Instrument Serial No',
          shortLabel: 'Seri/Serial',
          type: 'TEXT',
          required: false
        }
      ]
    },
    {
      id: 'pump_performance',
      name: 'Pompa Performans Ölçümü / Pump Performance Test',
      description: 'Farklı akış hızlarında basınç okumaları / Pressure readings at different flow rates',
      fields: [
        {
          id: 'flow_0_suction',
          label: '0% Akış - Emiş Basıncı / No Flow - Suction Pressure',
          shortLabel: '0% Emiş/Suction',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'flow_0_discharge',
          label: '0% Akış - Deşarj Basıncı / No Flow - Discharge Pressure',
          shortLabel: '0% Deşarj/Disch',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'flow_100_suction',
          label: '100% Akış - Emiş Basıncı / Rated Flow - Suction Pressure',
          shortLabel: '100% Emiş/Suction',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'flow_100_discharge',
          label: '100% Akış - Deşarj Basıncı / Rated Flow - Discharge Pressure',
          shortLabel: '100% Deşarj/Disch',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'flow_100_rpm',
          label: '100% Devir / 100% RPM',
          shortLabel: '100% RPM',
          type: 'NUMBER',
          required: false
        },
        {
          id: 'flow_150_suction',
          label: '150% Akış - Emiş Basıncı / Peak Flow - Suction Pressure',
          shortLabel: '150% Emiş/Suction',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'flow_150_discharge',
          label: '150% Akış - Deşarj Basıncı / Peak Flow - Discharge Pressure',
          shortLabel: '150% Deşarj/Disch',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'flow_150_rpm',
          label: '150% Devir / 150% RPM',
          shortLabel: '150% RPM',
          type: 'NUMBER',
          required: false
        },
        {
          id: 'coolant_pressure_0',
          label: 'Soğutma Suyu Basıncı %0 / Coolant Pressure 0%',
          shortLabel: 'Soğutma 0%',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'coolant_pressure_100',
          label: 'Soğutma Suyu Basıncı %100 / Coolant Pressure 100%',
          shortLabel: 'Soğutma 100%',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'coolant_pressure_150',
          label: 'Soğutma Suyu Basıncı %150 / Coolant Pressure 150%',
          shortLabel: 'Soğutma 150%',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        }
      ]
    },
    {
      id: 'control_criteria',
      name: 'Periyodik Bakım Kontrol Kriterleri ve Testler / Control Criteria',
      description: 'Uygulanan standartlar / Applicable standards and criteria',
      fields: [
        {
          id: 'nfpa_20',
          label: 'NFPA 20',
          shortLabel: 'NFPA 20',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'nfpa_25',
          label: 'NFPA 25',
          shortLabel: 'NFPA 25',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'ts_en_12845',
          label: 'TS EN 12845',
          shortLabel: 'TS EN 12845',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'nfpa_13',
          label: 'NFPA 13',
          shortLabel: 'NFPA 13',
          type: 'YES_NO_NA',
          required: false
        }
      ]
    },
    {
      id: 'diesel_pump_checklist',
      name: 'Dizel Pompa / Diesel Pump',
      description: 'NFPA 25 / TS EN 12845 uyumlu kontrol listesi / Compliance checklist',
      fields: [
        {
          id: 'controller_auto',
          label: 'Yangın pompası otomatik konumda mı? / Is the fire pump controller in automatic position?',
          shortLabel: 'Otomatik/Auto',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'controller_doors_closed',
          label: 'Son bakımdan itibaren kontrol panelleri açık mıydı? / Were controller doors open since last maintenance?',
          shortLabel: 'Kapılar/Doors',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'room_temp_adequate',
          label: 'Pompa odasındaki ısı 40°F/5°C veya daha yüksek mi? / Is pump room temperature above 40°F (5°C)?',
          shortLabel: 'Sıcaklık/Temp',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'air_intake_adequate',
          label: 'Pompa odasından hava girişi yeterli/çalışır durumda görünüyor mu? / Is there adequate air intake for operation?',
          shortLabel: 'Hava/Air',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'valves_open',
          label: 'Pompa emiş, basma ve bypass vanaları açık mı? / Are pump suction, discharge, and bypass valves open?',
          shortLabel: 'Vanalar/Valves',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'suction_reservoir_full',
          label: 'Su deposu dolu mu? / Is suction reservoir full?',
          shortLabel: 'Depo/Tank',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'no_leaks',
          label: 'Boru veya hortum sızıntısı yok mu? / No piping or hose leaks?',
          shortLabel: 'Sızıntı/Leaks',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'weekly_run',
          label: 'Pompalar ayda yüksüz elektrikli pompa 10 dakika, dizel 30 dakika çalışıyor mu? / Does pump run weekly per NFPA?',
          shortLabel: 'Haftalık/Weekly',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'pressures_acceptable',
          label: 'Yukarıdaki basınç ve değerler kabul edilir mi? / Are the above pressures and values acceptable?',
          shortLabel: 'Basınç/Press',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'controller_on_position',
          label: 'Kontrol Panel "on" pozisyonda mı? / Controller is in "on" position?',
          shortLabel: 'Panel On',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'waterflow_valves_closed',
          label: 'Su akış test vanaları kapalı konumda mı? / Waterflow test valves are in closed position?',
          shortLabel: 'Test Vanaları',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'pilot_light_on',
          label: 'Kontrol paneli pilot ışığı (güç açık) yanıyor mu? / Controller pilot light (power on) is illuminated?',
          shortLabel: 'Pilot Işık',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'bearings_lubricated',
          label: 'Pompa yatakları yağlanmış mı? / Are the pump bearings lubricated?',
          shortLabel: 'Yağlama/Lube',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'no_vibration',
          label: 'Pompa çalışırken vibrasyon yok mu? / There is no vibration when the pump is running?',
          shortLabel: 'Titreşim/Vibr',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'pump_accessible',
          label: 'Pompanın çalışma süresine ulaşılabiliyor mu? / Is the pump run time accessible?',
          shortLabel: 'Erişim/Access',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'pressure_calibration_done',
          label: 'Pompa basınç kalibrasyonları yapıldı mı? / Have pump pressure calibrations been done?',
          shortLabel: 'Kalibrasyon',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'pump_start_pressure',
          label: 'Pompa start basıncı / Pump start pressure',
          shortLabel: 'Start PSI',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'pump_stop_pressure',
          label: 'Pompa stop basıncı / Pump stop pressure',
          shortLabel: 'Stop PSI',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'manual_stop',
          label: 'Pompa Manual stop ayarlı mı? / Is the pump set to Manual stop?',
          shortLabel: 'Manual Stop',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'auto_stop_ejector',
          label: 'Pompa otomatik stop ejector mu? / Does the pump stop automatically?',
          shortLabel: 'Oto Stop',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'pump_painted',
          label: 'Pompa hissettiren hafitten start verildi mi? / Has the pump been started manually?',
          shortLabel: 'Manuel Start',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'lightness_checked',
          label: 'Kaidelerin sıkılığı kontrol edildi mi? / Check the lightness of the connections?',
          shortLabel: 'Sıkılık/Tight',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'pump_marked',
          label: 'Pompalar manuel start verildi mi? / Have the pumps been started manually?',
          shortLabel: 'Manuel/Manual',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'alarm_light_check',
          label: "Tüm alarm ışıkları 'kapalı' mı? All alarm pilot lights are 'off'?",
          shortLabel: 'Alarm Işık',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'sound_alarm_off',
          label: 'Dizel motor çıkış ısısı uygun mu? / Is the sound of the pump okay?',
          shortLabel: 'Motor Ses',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'no_corrosion',
          label: 'Herhangi bir devir kartında korozyon yok mu? / No corrosion on circuit boards?',
          shortLabel: 'Korozyon/Corr',
          type: 'YES_NO_NA',
          required: false
        }
      ]
    },
    {
      id: 'diesel_engine_checklist',
      name: 'Dizel Pompa Devamı / Diesel Pump Continuation',
      description: 'Dizel motor kontrolleri / Diesel engine checks',
      fields: [
        {
          id: 'packing_glands_adjusted',
          label: 'Salmastra sıkma aparatları düzgün ayarlanmış görünüyor mu? / Packing glands appear properly adjusted?',
          shortLabel: 'Salmastra',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'pump_manual_start',
          label: 'Pompaya basılmadan manuel start verildi mi? / Has the pump been manually started from the controller?',
          shortLabel: 'Manuel Start',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'fire_pump_couplings',
          label: 'Yangın pompası şaft kaplın düzgün şekilde hizalandı görünüyor mu? / Fire pump couplings appear properly aligned?',
          shortLabel: 'Kaplin/Coupling',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'drains_normal',
          label: 'Salmastradan damlama normal mi? / Is it normal for the packings to drip?',
          shortLabel: 'Damlama/Drip',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'pump_start_normal',
          label: 'Pompanın start alması, çekiş olarak normal mi? / Pump start is normal?',
          shortLabel: 'Start Normal',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'solenoid_operating',
          label: 'Solenoid valf düzgün çalışıyor mu? / Is the solenoid valve operating correctly?',
          shortLabel: 'Solenoid',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'operating_time_normal',
          label: 'Pompa çalışma süresi normal mi? / Is the operating time of the pump normal?',
          shortLabel: 'Çalışma Süresi',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'maintenance_hours',
          label: 'Son Bakımdan bu yana pompaları haftalık çalıştırıldı mı? / Since the last maintenance, the pumps have been weekly?',
          shortLabel: 'Haftalık/Weekly',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'starts_since_last',
          label: 'Son bakımdan bu yana pompa start alma sayısı? / Number of starts of the pump since last maintenance?',
          shortLabel: 'Start Sayısı',
          type: 'NUMBER',
          required: false
        },
        {
          id: 'motor_time_observe',
          label: 'Motorun fani hızı gelen süreyi gözlemleyin / Observe time for motor to crank',
          shortLabel: 'Süre/Time',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'solenoid_coolant_valve',
          label: 'Soğutma suyu solenoid valf tutucu mu? / Is the coolant solenoid valve holding?',
          shortLabel: 'Soğutma Valf',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'pilot_lights_batteries',
          label: 'Güne pil ışıkları yanıyor veya pil arızası pilotı yakar mı? / Pilot lights for batteries are on or fail lights are off?',
          shortLabel: 'Pil Işıkları',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'crankcase_oil_normal',
          label: 'Karter yağ seviyesi uygun mu? / Crankcase oil level is normal?',
          shortLabel: 'Yağ/Oil',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'cooling_water_normal',
          label: 'Antifrizi seviyesi uygun mu? / Cooling water level is normal?',
          shortLabel: 'Antifriz',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'electrolyte_normal',
          label: 'Akü su seviyesi uygun mu? / Electrolyte level in batteries is normal?',
          shortLabel: 'Akü Su',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'battery_terminals_clean',
          label: 'Akü kutup başlarında korozyon yok mu? / Battery terminals are free of corrosion?',
          shortLabel: 'Kutup Başları',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'water_jacket_heater',
          label: 'Isıtıcı yeter durumda mı? / Water-jacket heater is operational?',
          shortLabel: 'Isıtıcı/Heater',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'exhaust_no_leak',
          label: 'Egzost hattında gaz sızıntısı yok mu? / There is no gas leak in the exhaust line?',
          shortLabel: 'Egzost/Exhaust',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'aftercooler_drain',
          label: 'Aftercooler da yoğuşan su varsa boşaltın / Drain condensate if any in aftercooler',
          shortLabel: 'Aftercooler',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'diesel_fuel_tank',
          label: 'Dizel yakıt deposunda su olup olmadığını kontrol edin / Check for water in diesel fuel tank',
          shortLabel: 'Yakıt/Fuel',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'strainer_clean',
          label: 'Dizel yangın pompası için soğutma sistemini temiz su süzgecini temizleyin mi? / Clean water strainer in cooling system for diesel fire pump?',
          shortLabel: 'Süzgeç/Strainer',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'filters_changed',
          label: 'Yağ, yağ filtresi, yakıt filtresi, and/or ve hava filtresi yenisi ile değiştir mi? / Has the engine oil, oil filter, fuel filter, and/or air filter been changed?',
          shortLabel: 'Filtreler',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'coolant_pressure_check',
          label: 'Soğutma kayışından geçen su basıncı oluştu not edin / Note the water pressure through the coolant',
          shortLabel: 'Soğutma Basınç',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'electrical_wiring',
          label: 'Hareketli maruzi kablo yöntemini aksatılmış sürünme olup olmadığını kontrol edin / Check electrical wiring for movement',
          shortLabel: 'Kablolama',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'filters_oils_changed_50hrs',
          label: 'Tüm Filtreler ve yağlar her 50 saatte bir yoksa yılda bir mi değiştirildi? / Have all filters and oils been changed every 50 hours or yearly?',
          shortLabel: '50 Saat Bakım',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'diesel_crank_time',
          label: 'Dizel motorun maks basma süresini kaydedın / Record time for diesel engine to crank',
          shortLabel: 'Crank Süresi',
          type: 'NUMBER',
          required: false,
          unit: 'sn/sec'
        },
        {
          id: 'pump_rpm_running',
          label: 'Pompa hızını/rpm çalışırken kaydedin / Record the pump speed in rpm when pump is running',
          shortLabel: 'Çalışma RPM',
          type: 'NUMBER',
          required: false
        },
        {
          id: 'prv_not_operating',
          label: 'Ağa test yapılırsa pompa RV nin çalışmadığını doğrulayın / Verify that the pump RV is not operating during the flow test',
          shortLabel: 'RV Kontrolü',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'alarm_conditions_activate',
          label: 'Alarm sensörü konumlarındaki alarm devrelerin (aynı zamanda uzak alarmlar) etkinleştirecek pompa ve pompa performans eğrisi çekek ve önceki iki yıla test verileriyle karşılaştırın / Simulate pump and driver alarm conditions by activating alarm circuits at alarm sensor locations',
          shortLabel: 'Alarm Test',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'performance_curve_compare',
          label: "Pompa'nın orijinal unadjusted alan kabul test eğrisine ve önceki yıllardan test verileriyle ile göndere ve pompanın original performansı işli göndece ile ön eki iki yılın / Draw pump performance curve shall be drawn and compared to pumps original field acceptance test curve",
          shortLabel: 'Performans Eğrisi',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'ecm_primary_backup',
          label: 'Dizel motorsun üzerinde birincil ve yedek elektronik kontrol modüllerini (ECM) test edin / Test primary and backup electronic control modules (ECM) on diesel fuel injected engines',
          shortLabel: 'ECM Test',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'pressure_relief_valves',
          label: 'Basınç tahliye ve vakum kontrol vanalarını test edin / Yük Kontrol Test Pressure-relieving and suction-control valves',
          shortLabel: 'Tahliye Vanaları',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'circulation_relief_valve',
          label: 'Sirkülasyon tahliye vanasını (varsa) suyu boşaltmak için çalışır çalışmadığını kontrol edin / Inspect the circulation relief valve (where equipped) for operation to discharge water',
          shortLabel: 'Sirkülasyon Valf',
          type: 'YES_NO_NA',
          required: false
        }
      ]
    },
    {
      id: 'jockey_pump_checklist',
      name: 'Jockey Pompa / Jockey Pump',
      description: 'Jockey pompa kontrolleri / Jockey pump operational checks',
      fields: [
        {
          id: 'jockey_switch_auto',
          label: 'Jokey pompa şalteri açık mı? / Is the jockey pump switch on?',
          shortLabel: 'Şalter/Switch',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'jockey_manual_check',
          label: 'Jokey pompa manuel çalışıyor mu? / Does the jockey pump start manually?',
          shortLabel: 'Manuel/Manual',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'jockey_start_pressure',
          label: 'Jokey pompa start basıncı / Jockey pump start pressure',
          shortLabel: 'Start PSI',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'jockey_stop_pressure',
          label: 'Jokey pompa stop basıncı / Jockey pump stop pressure',
          shortLabel: 'Stop PSI',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'jockey_calibration',
          label: 'Jokey pompa basınç kalibrasyonu yapıldı mı? / Jockey pump pressure calibration done?',
          shortLabel: 'Kalibrasyon',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'jockey_controller_auto',
          label: 'Jokey pompası kontrolörü "otomatik" olarak ayarlandı mı? / Jockey pump controller is set to "auto"?',
          shortLabel: 'Otomatik/Auto',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'jockey_rotation',
          label: 'Jokey pompa dönüş yönü doğru mu? / Is the jockey pump rotation direction correct?',
          shortLabel: 'Dönüş/Rotation',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'jockey_energy',
          label: 'Jokey pompası enerjili mi? / Does the jockey pump have energy?',
          shortLabel: 'Enerji/Energy',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'jockey_panel_ul',
          label: 'Jokey pompa Panel UL listeli mi? / Is the jockey pump panel UL listed?',
          shortLabel: 'UL Listeli',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'jockey_pressures_acceptable',
          label: 'Yukarıdaki basınç ve değerler kabul edilir mi? / Are the above pressures and values acceptable?',
          shortLabel: 'Değerler OK',
          type: 'YES_NO_NA',
          required: false
        }
      ]
    },
    {
      id: 'turbine_pump_checklist',
      name: 'Turbin Tip Pompa / Turbine Type Pump',
      description: 'Turbin pompa kontrolleri (varsa) / Turbine pump checks (if applicable)',
      fields: [
        {
          id: 'turbine_oil_level',
          label: 'Türbin yağ seviyesi uygun mu? / Turbine oil level is appropriate?',
          shortLabel: 'Yağ/Oil',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'turbine_vent_valve',
          label: 'Hava alma ventili uygun çalışıyor mu? / Air vent valve is working properly?',
          shortLabel: 'Vent Valf',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'turbine_pump_fittings',
          label: 'Türbin pompa sabitlemelerı uygun mu? / Suitable for pump fixings to the turbine?',
          shortLabel: 'Sabitlemeler',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'turbine_reducer_dripping',
          label: 'Türbin redüktör ovalandırımlı uygun sıkılık mı? / Turbine reducer packing dripping every minute?',
          shortLabel: 'Redüktör',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'turbine_reducer_locknut',
          label: 'Redüktör kiliteme somunu ölçümü / Measure the reducer locking nut size with a caliper',
          shortLabel: 'Kilit Somunu',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'turbine_driver_type',
          label: 'Pompalar, driver/UL FM VDS Listeli mi? / Pumps, driver are UL FM VDS Listed?',
          shortLabel: 'UL/FM Listeli',
          type: 'YES_NO_NA',
          required: false
        }
      ]
    },
    {
      id: 'notes_section',
      name: 'Notlar / Notes',
      description: 'Ek notlar ve gözlemler / Additional notes and observations',
      voiceEnabled: true,
      fields: [
        {
          id: 'notes',
          label: 'Notlar / Notes',
          shortLabel: 'Notlar/Notes',
          type: 'TEXTAREA',
          required: false
        },
        {
          id: 'issues_photos',
          label: 'Sorun Fotoğrafları / Issue Photos',
          shortLabel: 'Fotoğraflar',
          type: 'PHOTO_GALLERY',
          required: false,
          maxPhotos: 10
        }
      ]
    },
    {
      id: 'signatures',
      name: 'İmzalar / Signatures',
      description: 'Rapor onay imzaları / Report approval signatures',
      fields: [
        {
          id: 'inspector_name',
          label: 'Denetçi Adı / Inspector Name',
          shortLabel: 'Denetçi/Inspector',
          type: 'TEXT',
          required: false
        },
        {
          id: 'sig_inspector',
          label: 'Denetçi İmzası / Inspector Signature',
          shortLabel: 'İmza/Signature',
          type: 'SIGNATURE',
          required: false
        },
        {
          id: 'company_rep_name',
          label: 'Firma Temsilcisi Adı / Company Representative Name',
          shortLabel: 'Temsilci/Rep',
          type: 'TEXT',
          required: false
        },
        {
          id: 'sig_company_rep',
          label: 'Firma Temsilcisi İmzası / Company Rep Signature',
          shortLabel: 'Firma İmza',
          type: 'SIGNATURE',
          required: false
        }
      ]
    }
  ]
};

// Keep old English template for reference (deprecated)
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
          required: false
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
          required: false
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
          required: false
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
          required: false,
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
          required: false,
          voiceHints: ['fairbanks', 'clarke', 'aurora', 'peerless']
        },
        {
          id: 'pump_model',
          label: 'Model/Type',
          shortLabel: 'Model',
          type: 'TEXT',
          required: false
        },
        {
          id: 'pump_serial',
          label: 'Serial Number',
          shortLabel: 'Serial #',
          type: 'TEXT',
          required: false
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
          required: false,
          unit: 'GPM'
        },
        {
          id: 'pump_rated_pressure',
          label: 'Rated Pressure (PSI)',
          shortLabel: 'Rated PSI',
          type: 'NUMBER',
          required: false,
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
          required: false,
          voiceHints: ['doosan', 'cummins', 'john deere', 'caterpillar', 'clarke']
        },
        {
          id: 'engine_model',
          label: 'Engine Model',
          shortLabel: 'Engine model',
          type: 'TEXT',
          required: false
        },
        {
          id: 'engine_serial',
          label: 'Engine Serial Number',
          shortLabel: 'Engine serial',
          type: 'TEXT',
          required: false
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
          required: false,
          voiceHints: ['eaton', 'firetrol', 'metron', 'tornatech']
        },
        {
          id: 'controller_model',
          label: 'Controller Model',
          shortLabel: 'Controller model',
          type: 'TEXT',
          required: false
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
          required: false,
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
          required: false,
          voiceHints: ['automatic', 'auto position', 'controller']
        },
        {
          id: 'controller_doors_closed',
          label: 'Were controller doors properly closed since last maintenance?',
          shortLabel: 'Doors closed',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'room_temp_adequate',
          label: 'Is pump room temperature above 40°F (5°C)?',
          shortLabel: 'Room temp OK',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['temperature', 'room temp', 'pump room']
        },
        {
          id: 'air_intake_adequate',
          label: 'Is there adequate air intake for engine operation?',
          shortLabel: 'Air intake OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'valves_open',
          label: 'Are pump suction, discharge, and bypass valves open?',
          shortLabel: 'Valves open',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['valves', 'suction valve', 'discharge valve', 'bypass']
        },
        {
          id: 'suction_reservoir_full',
          label: 'Is suction reservoir/tank full?',
          shortLabel: 'Reservoir full',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'no_leaks',
          label: 'No piping or hose leaks observed?',
          shortLabel: 'No leaks',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['leak', 'leaking', 'drip', 'hose']
        },
        {
          id: 'weekly_run_30min',
          label: 'Does pump run 30 minutes weekly without load per NFPA?',
          shortLabel: 'Weekly 30min run',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'pressures_acceptable',
          label: 'Are all pressures and values within acceptable range?',
          shortLabel: 'Pressures OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'fuel_level_adequate',
          label: 'Is diesel fuel level adequate?',
          shortLabel: 'Fuel level OK',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['fuel', 'diesel', 'tank']
        },
        {
          id: 'oil_level_ok',
          label: 'Is engine oil level within acceptable range?',
          shortLabel: 'Oil level OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'coolant_level_ok',
          label: 'Is coolant level within acceptable range?',
          shortLabel: 'Coolant OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'battery_condition_ok',
          label: 'Are batteries in good condition and charged?',
          shortLabel: 'Batteries OK',
          type: 'YES_NO_NA',
          required: false,
          voiceHints: ['battery', 'batteries', 'charged']
        },
        {
          id: 'belts_hoses_ok',
          label: 'Are belts and hoses in good condition?',
          shortLabel: 'Belts/hoses OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'exhaust_system_ok',
          label: 'Is exhaust system functioning properly?',
          shortLabel: 'Exhaust OK',
          type: 'YES_NO_NA',
          required: false
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
          required: false
        },
        {
          id: 'jockey_start_pressure',
          label: 'Jockey pump start pressure (PSI)',
          shortLabel: 'Start PSI',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'jockey_stop_pressure',
          label: 'Jockey pump stop pressure (PSI)',
          shortLabel: 'Stop PSI',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'jockey_calibration_current',
          label: 'Is pressure switch calibration current?',
          shortLabel: 'Calibration OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'jockey_rotation_correct',
          label: 'Is rotation direction correct?',
          shortLabel: 'Rotation OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'jockey_operational',
          label: 'Does jockey pump operate correctly?',
          shortLabel: 'Jockey works',
          type: 'YES_NO_NA',
          required: false
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
          required: false
        },
        {
          id: 'manual_start_tested',
          label: 'Has manual start been tested?',
          shortLabel: 'Manual start OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'auto_start_tested',
          label: 'Has automatic start been tested?',
          shortLabel: 'Auto start OK',
          type: 'YES_NO_NA',
          required: false
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
          required: false
        },
        {
          id: 'sig_inspector',
          label: 'Inspector Signature',
          shortLabel: 'Inspector signature',
          type: 'SIGNATURE',
          required: false
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
          required: false
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
          required: false
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
          required: false
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
          required: false
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
          required: false
        },
        {
          id: 'pump_model',
          label: 'Model/Tip',
          shortLabel: 'Model',
          type: 'TEXT',
          required: false
        },
        {
          id: 'pump_serial',
          label: 'Seri Numarası',
          shortLabel: 'Seri No',
          type: 'TEXT',
          required: false
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
          required: false,
          unit: 'GPM'
        },
        {
          id: 'pump_rated_pressure',
          label: 'Anma Basıncı (PSI)',
          shortLabel: 'Basınç',
          type: 'NUMBER',
          required: false,
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
          required: false
        },
        {
          id: 'engine_model',
          label: 'Motor Modeli',
          shortLabel: 'Motor modeli',
          type: 'TEXT',
          required: false
        },
        {
          id: 'engine_serial',
          label: 'Motor Seri Numarası',
          shortLabel: 'Motor seri no',
          type: 'TEXT',
          required: false
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
          required: false
        },
        {
          id: 'controller_model',
          label: 'Panel Modeli',
          shortLabel: 'Panel modeli',
          type: 'TEXT',
          required: false
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
          required: false,
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
          required: false
        },
        {
          id: 'controller_doors_closed',
          label: 'Son bakımdan bu yana kontrolör kapıları kapalı mıydı?',
          shortLabel: 'Kapılar kapalı',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'room_temp_adequate',
          label: 'Pompa odası sıcaklığı 5°C üzerinde mi?',
          shortLabel: 'Oda sıcaklığı OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'air_intake_adequate',
          label: 'Motor çalışması için yeterli hava girişi var mı?',
          shortLabel: 'Hava girişi OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'valves_open',
          label: 'Pompa emiş, basma ve bypass vanaları açık mı?',
          shortLabel: 'Vanalar açık',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'suction_reservoir_full',
          label: 'Su deposu dolu mu?',
          shortLabel: 'Depo dolu',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'no_leaks',
          label: 'Boru veya hortum sızıntısı yok mu?',
          shortLabel: 'Sızıntı yok',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'weekly_run_30min',
          label: 'Pompa ayda 10 dakika elektrik, 30 dakika dizel çalıştırılıyor mu?',
          shortLabel: 'Haftalık çalıştırma',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'pressures_acceptable',
          label: 'Tüm basınç ve değerler kabul edilebilir aralıkta mı?',
          shortLabel: 'Basınçlar OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'fuel_level_adequate',
          label: 'Dizel yakıt seviyesi yeterli mi?',
          shortLabel: 'Yakıt OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'oil_level_ok',
          label: 'Motor yağ seviyesi uygun mu?',
          shortLabel: 'Yağ OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'coolant_level_ok',
          label: 'Soğutma suyu seviyesi uygun mu?',
          shortLabel: 'Soğutma suyu OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'battery_condition_ok',
          label: 'Aküler iyi durumda ve şarjlı mı?',
          shortLabel: 'Aküler OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'belts_hoses_ok',
          label: 'Kayışlar ve hortumlar iyi durumda mı?',
          shortLabel: 'Kayışlar OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'exhaust_system_ok',
          label: 'Egzoz sistemi düzgün çalışıyor mu?',
          shortLabel: 'Egzoz OK',
          type: 'YES_NO_NA',
          required: false
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
          required: false
        },
        {
          id: 'jockey_start_pressure',
          label: 'Jockey pompa başlama basıncı (PSI)',
          shortLabel: 'Başlama PSI',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'jockey_stop_pressure',
          label: 'Jockey pompa durma basıncı (PSI)',
          shortLabel: 'Durma PSI',
          type: 'NUMBER',
          required: false,
          unit: 'PSI'
        },
        {
          id: 'jockey_calibration_current',
          label: 'Basınç şalteri kalibrasyonu güncel mi?',
          shortLabel: 'Kalibrasyon OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'jockey_rotation_correct',
          label: 'Dönüş yönü doğru mu?',
          shortLabel: 'Dönüş OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'jockey_operational',
          label: 'Jockey pompa düzgün çalışıyor mu?',
          shortLabel: 'Jockey çalışıyor',
          type: 'YES_NO_NA',
          required: false
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
          required: false
        },
        {
          id: 'manual_start_tested',
          label: 'Manuel çalıştırma test edildi mi?',
          shortLabel: 'Manuel başlatma OK',
          type: 'YES_NO_NA',
          required: false
        },
        {
          id: 'auto_start_tested',
          label: 'Otomatik çalıştırma test edildi mi?',
          shortLabel: 'Otomatik başlatma OK',
          type: 'YES_NO_NA',
          required: false
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
          required: false
        },
        {
          id: 'sig_inspector',
          label: 'Denetçi İmzası',
          shortLabel: 'Denetçi imzası',
          type: 'SIGNATURE',
          required: false
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
    const userLang = language || 'en';

    console.log('[forms] getTemplates called with language:', userLang);

    // Fetch all active templates
    const allTemplates = await prisma.formTemplate.findMany({
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

    console.log('[forms] Found', allTemplates.length, 'total templates');

    // Language filtering with bilingual support:
    // - Bilingual templates (language='bilingual') are shown to ALL users
    // - English users: Show templates where language is 'en', null/undefined, or 'bilingual'
    // - Other languages: Show templates matching their language, bilingual, or English fallback

    // Build a map of template "families" for deduplication
    const templateFamilies = new Map();

    // Known template family mappings
    const familyMap = {
      'diesel fire pump maintenance report': 'diesel-pump',
      'dizel yangın pompası bakım raporu': 'diesel-pump',
      'dizel yangın pompası bakım raporu / diesel fire pump maintenance report': 'diesel-pump',
      'pre-task plan': 'pre-task-plan',
      'ön görev planı': 'pre-task-plan',
    };

    allTemplates.forEach(t => {
      const nameLower = t.name.toLowerCase();
      let familyKey = familyMap[nameLower];

      // If no known family, use the template name as its own family
      if (!familyKey) {
        familyKey = nameLower;
      }

      if (!templateFamilies.has(familyKey)) {
        templateFamilies.set(familyKey, []);
      }
      templateFamilies.get(familyKey).push(t);
    });

    // For each family, pick the best template based on user's language
    const result = [];
    templateFamilies.forEach((templates, familyKey) => {
      // Priority: bilingual > user's language > English > first available
      const bilingualVersion = templates.find(t => t.language === 'bilingual');
      const userLangVersion = templates.find(t => t.language === userLang);
      const englishVersion = templates.find(t => t.language === 'en' || !t.language);

      if (bilingualVersion) {
        // Bilingual templates are preferred for universal use
        result.push(bilingualVersion);
      } else if (userLangVersion) {
        result.push(userLangVersion);
      } else if (englishVersion) {
        result.push(englishVersion);
      } else if (templates.length > 0) {
        result.push(templates[0]);
      }
    });

    // Sort: default templates first, then by name
    result.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });

    console.log('[forms] Returning', result.length, 'templates for language:', userLang);
    res.json(result);
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
 * Seed default templates (creates new ones or updates existing with latest schema)
 */
async function seedDefaultTemplates(req, res) {
  try {
    const results = [];

    // 1. Pre-Task Plan (English)
    const existingPreTask = await prisma.formTemplate.findFirst({
      where: { name: 'Pre-Task Plan', isDefault: true }
    });

    if (existingPreTask) {
      // Update existing template with latest schema
      await prisma.formTemplate.update({
        where: { id: existingPreTask.id },
        data: {
          schema: PRE_TASK_PLAN_TEMPLATE,
          updatedAt: new Date()
        }
      });
      results.push({ name: 'Pre-Task Plan', action: 'updated', sections: PRE_TASK_PLAN_TEMPLATE.sections.length });
    } else {
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
      results.push({ name: preTask.name, action: 'created', sections: PRE_TASK_PLAN_TEMPLATE.sections.length });
    }

    // 2. Diesel Fire Pump Maintenance - BILINGUAL (Turkish/English)
    // This template uses both languages on all labels for international use
    const existingPumpBilingual = await prisma.formTemplate.findFirst({
      where: {
        OR: [
          { name: 'Dizel Yangın Pompası Bakım Raporu / Diesel Fire Pump Maintenance Report' },
          { name: 'Diesel Fire Pump Maintenance Report' },
          { name: 'Dizel Yangın Pompası Bakım Raporu' }
        ],
        isDefault: true
      }
    });

    if (existingPumpBilingual) {
      await prisma.formTemplate.update({
        where: { id: existingPumpBilingual.id },
        data: {
          name: 'Dizel Yangın Pompası Bakım Raporu / Diesel Fire Pump Maintenance Report',
          description: 'NFPA 25 / TS EN 12845 uyumlu dizel yangın pompası bakım raporu (Türkçe/İngilizce) - Bilingual fire pump maintenance report',
          schema: DIESEL_FIRE_PUMP_TEMPLATE_BILINGUAL,
          language: 'bilingual',
          category: 'Inspection / Denetim',
          updatedAt: new Date()
        }
      });
      results.push({ name: 'Dizel Yangın Pompası Bakım Raporu / Diesel Fire Pump Maintenance Report', action: 'updated', sections: DIESEL_FIRE_PUMP_TEMPLATE_BILINGUAL.sections.length });
    } else {
      const pumpBilingual = await prisma.formTemplate.create({
        data: {
          name: 'Dizel Yangın Pompası Bakım Raporu / Diesel Fire Pump Maintenance Report',
          description: 'NFPA 25 / TS EN 12845 uyumlu dizel yangın pompası bakım raporu (Türkçe/İngilizce) - Bilingual fire pump maintenance report',
          category: 'Inspection / Denetim',
          language: 'bilingual',
          schema: DIESEL_FIRE_PUMP_TEMPLATE_BILINGUAL,
          isDefault: true,
          isActive: true
        }
      });
      results.push({ name: pumpBilingual.name, action: 'created', sections: DIESEL_FIRE_PUMP_TEMPLATE_BILINGUAL.sections.length });
    }

    // Delete old separate EN/TR templates if they exist (consolidate to bilingual)
    await prisma.formTemplate.deleteMany({
      where: {
        OR: [
          { name: 'Diesel Fire Pump Maintenance Report', isDefault: true },
          { name: 'Dizel Yangın Pompası Bakım Raporu', isDefault: true }
        ],
        NOT: { name: 'Dizel Yangın Pompası Bakım Raporu / Diesel Fire Pump Maintenance Report' }
      }
    });

    res.status(200).json({
      message: `Processed ${results.length} template(s)`,
      templates: results
    });
  } catch (error) {
    console.error('[forms] Error seeding templates:', error);
    res.status(500).json({ error: 'Failed to seed templates' });
  }
}

/**
 * Update existing default templates with latest schema
 * This ensures all sections (including page 2) are present
 */
async function updateDefaultTemplates(req, res) {
  try {
    const updatedTemplates = [];

    // 1. Update Pre-Task Plan
    const preTask = await prisma.formTemplate.findFirst({
      where: { name: 'Pre-Task Plan', isDefault: true }
    });

    if (preTask) {
      const updated = await prisma.formTemplate.update({
        where: { id: preTask.id },
        data: {
          schema: PRE_TASK_PLAN_TEMPLATE,
          updatedAt: new Date()
        }
      });
      updatedTemplates.push({ name: updated.name, sectionsCount: PRE_TASK_PLAN_TEMPLATE.sections.length });
    }

    // 2. Update Diesel Fire Pump - now BILINGUAL (consolidate EN/TR into single template)
    const existingPump = await prisma.formTemplate.findFirst({
      where: {
        OR: [
          { name: 'Dizel Yangın Pompası Bakım Raporu / Diesel Fire Pump Maintenance Report' },
          { name: 'Diesel Fire Pump Maintenance Report' },
          { name: 'Dizel Yangın Pompası Bakım Raporu' }
        ],
        isDefault: true
      }
    });

    if (existingPump) {
      const updated = await prisma.formTemplate.update({
        where: { id: existingPump.id },
        data: {
          name: 'Dizel Yangın Pompası Bakım Raporu / Diesel Fire Pump Maintenance Report',
          description: 'NFPA 25 / TS EN 12845 uyumlu dizel yangın pompası bakım raporu (Türkçe/İngilizce) - Bilingual fire pump maintenance report',
          schema: DIESEL_FIRE_PUMP_TEMPLATE_BILINGUAL,
          language: 'bilingual',
          category: 'Inspection / Denetim',
          updatedAt: new Date()
        }
      });
      updatedTemplates.push({ name: updated.name, language: 'bilingual', sectionsCount: DIESEL_FIRE_PUMP_TEMPLATE_BILINGUAL.sections.length });

      // Delete any other old pump templates
      await prisma.formTemplate.deleteMany({
        where: {
          OR: [
            { name: 'Diesel Fire Pump Maintenance Report', isDefault: true },
            { name: 'Dizel Yangın Pompası Bakım Raporu', isDefault: true }
          ],
          NOT: { id: existingPump.id }
        }
      });
    }

    if (updatedTemplates.length === 0) {
      return res.json({ message: 'No default templates found to update', count: 0 });
    }

    res.json({
      message: `Updated ${updatedTemplates.length} template(s) with latest schema`,
      templates: updatedTemplates
    });
  } catch (error) {
    console.error('[forms] Error updating templates:', error);
    res.status(500).json({ error: 'Failed to update templates' });
  }
}

/**
 * Get all form instances for a project
 */
async function getForms(req, res) {
  try {
    const { projectId, status, limit = 50 } = req.query;

    const where = {};

    // ACCESS CONTROL: Filter by user's accessible projects
    if (req.accessibleProjectIds !== null) {
      // User has limited access
      if (req.accessibleProjectIds.length === 0) {
        return res.json([]); // No project access
      }

      if (projectId) {
        // Check if user has access to the requested project
        if (!req.accessibleProjectIds.includes(projectId)) {
          return res.status(403).json({ error: 'You do not have access to this project' });
        }
        where.projectId = projectId;
      } else {
        // Filter by all accessible projects
        where.projectId = { in: req.accessibleProjectIds };
      }
    } else if (projectId) {
      // Admin user with specific project filter
      where.projectId = projectId;
    }

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

    // ACCESS CONTROL: Check if user has access to this form's project
    if (req.accessibleProjectIds !== null &&
        !req.accessibleProjectIds.includes(form.projectId)) {
      return res.status(403).json({ error: 'You do not have access to this form' });
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

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    // ACCESS CONTROL: Check if user has access to this project
    if (req.accessibleProjectIds !== null &&
        !req.accessibleProjectIds.includes(projectId)) {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }

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

    // First, check if form exists and user has access
    const existingForm = await prisma.formInstance.findUnique({
      where: { id },
      select: { projectId: true }
    });

    if (!existingForm) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // ACCESS CONTROL: Check if user has access to this form's project
    if (req.accessibleProjectIds !== null &&
        !req.accessibleProjectIds.includes(existingForm.projectId)) {
      return res.status(403).json({ error: 'You do not have access to this form' });
    }

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

    // First, check if form exists and user has access
    const existingForm = await prisma.formInstance.findUnique({
      where: { id },
      select: { projectId: true }
    });

    if (!existingForm) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // ACCESS CONTROL: Check if user has access to this form's project
    if (req.accessibleProjectIds !== null &&
        !req.accessibleProjectIds.includes(existingForm.projectId)) {
      return res.status(403).json({ error: 'You do not have access to this form' });
    }

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

    // ACCESS CONTROL: Check if user has access to this form's project
    if (req.accessibleProjectIds !== null &&
        !req.accessibleProjectIds.includes(form.projectId)) {
      return res.status(403).json({ error: 'You do not have access to this form' });
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
      // Generic PDF generation for other templates (Fire Pump, etc.)
      pdfBuffer = await generateGenericFormPdf(form, project);
    }

    // Set response headers for PDF download
    // Sanitize filename: remove/replace characters that are invalid in HTTP headers
    const rawName = form.template?.name || 'Form';
    const sanitizedName = rawName
      .replace(/[\/\\:*?"<>|]/g, '-')  // Replace invalid filename characters with dash
      .replace(/[^\x20-\x7E]/g, '')    // Remove non-ASCII characters
      .replace(/\s+/g, '_')            // Replace spaces with underscores
      .replace(/-+/g, '-')             // Replace multiple dashes with single dash
      .replace(/^-|-$/g, '')           // Remove leading/trailing dashes
      .substring(0, 100);              // Limit length
    const filename = `${sanitizedName || 'Form'}_${new Date(form.createdAt).toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error) {
    console.error('[forms] Error generating PDF:', error.message);
    console.error('[forms] PDF error stack:', error.stack);
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
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
  updateDefaultTemplates,
  getForms,
  getForm,
  createForm,
  updateForm,
  deleteForm,
  generateFormPdf,
  extractNameplateOcr,
  PRE_TASK_PLAN_TEMPLATE
};
