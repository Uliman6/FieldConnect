/**
 * Form Templates for Voice Diary
 * Based on FieldConnect's document schema structure
 * Now with English and Spanish translations
 */

import type { Language } from './use-language';

export type FieldType = 'text' | 'multiline' | 'date' | 'company' | 'person' | 'location' | 'attachment' | 'select' | 'checkbox';

export interface FormField {
  name: string;
  label: string;
  labelEs: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  placeholderEs?: string;
  options?: string[];
  optionsEs?: string[];
}

export interface FormTemplate {
  id: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  icon: string;
  fields: FormField[];
}

// Helper to get localized field properties
export function getLocalizedField(field: FormField, lang: Language): {
  label: string;
  placeholder?: string;
  options?: string[];
} {
  return {
    label: lang === 'es' ? field.labelEs : field.label,
    placeholder: lang === 'es' ? field.placeholderEs : field.placeholder,
    options: lang === 'es' ? field.optionsEs : field.options,
  };
}

// Helper to get localized template properties
export function getLocalizedTemplate(template: FormTemplate, lang: Language): {
  name: string;
  description: string;
} {
  return {
    name: lang === 'es' ? template.nameEs : template.name,
    description: lang === 'es' ? template.descriptionEs : template.description,
  };
}

export const FORM_TEMPLATES: Record<string, FormTemplate> = {
  daily_log: {
    id: 'daily_log',
    name: 'Daily Log',
    nameEs: 'Registro Diario',
    description: 'Daily work summary and progress report',
    descriptionEs: 'Resumen de trabajo diario e informe de progreso',
    icon: 'FileText',
    fields: [
      {
        name: 'date',
        label: 'Date',
        labelEs: 'Fecha',
        type: 'date',
        required: true
      },
      {
        name: 'weather',
        label: 'Weather Conditions',
        labelEs: 'Condiciones Clim\u00e1ticas',
        type: 'text',
        required: false,
        placeholder: 'e.g., Clear, 72F',
        placeholderEs: 'ej., Despejado, 22\u00b0C'
      },
      {
        name: 'manpower',
        label: 'Manpower Count',
        labelEs: 'Cantidad de Personal',
        type: 'text',
        required: false,
        placeholder: 'e.g., 15 workers',
        placeholderEs: 'ej., 15 trabajadores'
      },
      {
        name: 'work_performed',
        label: 'Work Performed',
        labelEs: 'Trabajo Realizado',
        type: 'multiline',
        required: true,
        placeholder: 'Describe work completed today...',
        placeholderEs: 'Describe el trabajo completado hoy...'
      },
      {
        name: 'delays',
        label: 'Delays/Issues',
        labelEs: 'Retrasos/Problemas',
        type: 'multiline',
        required: false,
        placeholder: 'Any delays or issues encountered...',
        placeholderEs: 'Cualquier retraso o problema encontrado...'
      },
      {
        name: 'safety_incidents',
        label: 'Safety Incidents',
        labelEs: 'Incidentes de Seguridad',
        type: 'multiline',
        required: false,
        placeholder: 'Any safety incidents (or "None")',
        placeholderEs: 'Cualquier incidente de seguridad (o "Ninguno")'
      },
      {
        name: 'visitors',
        label: 'Visitors',
        labelEs: 'Visitantes',
        type: 'text',
        required: false,
        placeholder: 'e.g., Inspector, Owner',
        placeholderEs: 'ej., Inspector, Due\u00f1o'
      },
      {
        name: 'notes',
        label: 'Additional Notes',
        labelEs: 'Notas Adicionales',
        type: 'multiline',
        required: false
      },
    ],
  },

  punch_list: {
    id: 'punch_list',
    name: 'Punch List',
    nameEs: 'Lista de Pendientes',
    description: 'Track deficiencies and incomplete work items',
    descriptionEs: 'Seguimiento de deficiencias y trabajos incompletos',
    icon: 'ListChecks',
    fields: [
      {
        name: 'title',
        label: 'Item Title',
        labelEs: 'T\u00edtulo del Elemento',
        type: 'text',
        required: true,
        placeholder: 'Brief description of the item',
        placeholderEs: 'Breve descripci\u00f3n del elemento'
      },
      {
        name: 'description',
        label: 'Description',
        labelEs: 'Descripci\u00f3n',
        type: 'multiline',
        required: true,
        placeholder: 'Detailed description of the deficiency...',
        placeholderEs: 'Descripci\u00f3n detallada de la deficiencia...'
      },
      {
        name: 'location',
        label: 'Location',
        labelEs: 'Ubicaci\u00f3n',
        type: 'location',
        required: true,
        placeholder: 'e.g., Level 4, Room 402',
        placeholderEs: 'ej., Nivel 4, Cuarto 402'
      },
      {
        name: 'assigned_to',
        label: 'Assigned To',
        labelEs: 'Asignado A',
        type: 'company',
        required: false,
        placeholder: 'Company responsible for correction',
        placeholderEs: 'Compa\u00f1\u00eda responsable de la correcci\u00f3n'
      },
      {
        name: 'created_by',
        label: 'Created By',
        labelEs: 'Creado Por',
        type: 'person',
        required: false
      },
      {
        name: 'created_on',
        label: 'Date Created',
        labelEs: 'Fecha de Creaci\u00f3n',
        type: 'date',
        required: true
      },
      {
        name: 'due_date',
        label: 'Due Date',
        labelEs: 'Fecha L\u00edmite',
        type: 'date',
        required: false
      },
      {
        name: 'priority',
        label: 'Priority',
        labelEs: 'Prioridad',
        type: 'select',
        required: false,
        options: ['Low', 'Medium', 'High', 'Critical'],
        optionsEs: ['Baja', 'Media', 'Alta', 'Cr\u00edtica']
      },
      {
        name: 'root_cause',
        label: 'Root Cause',
        labelEs: 'Causa Ra\u00edz',
        type: 'text',
        required: false,
        placeholder: 'What caused this issue?',
        placeholderEs: '\u00bfQu\u00e9 caus\u00f3 este problema?'
      },
      {
        name: 'photos',
        label: 'Photos',
        labelEs: 'Fotos',
        type: 'attachment',
        required: false
      },
    ],
  },

  rfi: {
    id: 'rfi',
    name: 'RFI',
    nameEs: 'RFI (Solicitud de Informaci\u00f3n)',
    description: 'Request for Information - clarify design or construction questions',
    descriptionEs: 'Solicitud de Informaci\u00f3n - aclarar preguntas de dise\u00f1o o construcci\u00f3n',
    icon: 'HelpCircle',
    fields: [
      {
        name: 'subject',
        label: 'Subject',
        labelEs: 'Asunto',
        type: 'text',
        required: true,
        placeholder: 'RFI subject line',
        placeholderEs: 'L\u00ednea de asunto del RFI'
      },
      {
        name: 'question',
        label: 'Question',
        labelEs: 'Pregunta',
        type: 'multiline',
        required: true,
        placeholder: 'Describe the question or clarification needed...',
        placeholderEs: 'Describe la pregunta o aclaraci\u00f3n necesaria...'
      },
      {
        name: 'reference',
        label: 'Drawing/Spec Reference',
        labelEs: 'Referencia de Plano/Especificaci\u00f3n',
        type: 'text',
        required: false,
        placeholder: 'e.g., A2.1, Section 03300',
        placeholderEs: 'ej., A2.1, Secci\u00f3n 03300'
      },
      {
        name: 'location',
        label: 'Location',
        labelEs: 'Ubicaci\u00f3n',
        type: 'location',
        required: false,
        placeholder: 'Where does this apply?',
        placeholderEs: '\u00bfD\u00f3nde aplica esto?'
      },
      {
        name: 'created_by',
        label: 'Submitted By',
        labelEs: 'Enviado Por',
        type: 'person',
        required: false
      },
      {
        name: 'created_on',
        label: 'Date Submitted',
        labelEs: 'Fecha de Env\u00edo',
        type: 'date',
        required: true
      },
      {
        name: 'ball_in_court',
        label: 'Ball in Court',
        labelEs: 'Responsable de Respuesta',
        type: 'person',
        required: false,
        placeholder: 'Who needs to respond?',
        placeholderEs: '\u00bfQui\u00e9n necesita responder?'
      },
      {
        name: 'response_needed_by',
        label: 'Response Needed By',
        labelEs: 'Respuesta Necesaria Para',
        type: 'date',
        required: false
      },
      {
        name: 'cost_impact',
        label: 'Cost Impact',
        labelEs: 'Impacto en Costo',
        type: 'select',
        required: false,
        options: ['None', 'TBD', 'Yes - See Below'],
        optionsEs: ['Ninguno', 'Por Determinar', 'S\u00ed - Ver Abajo']
      },
      {
        name: 'schedule_impact',
        label: 'Schedule Impact',
        labelEs: 'Impacto en Cronograma',
        type: 'select',
        required: false,
        options: ['None', 'TBD', 'Yes - See Below'],
        optionsEs: ['Ninguno', 'Por Determinar', 'S\u00ed - Ver Abajo']
      },
      {
        name: 'attachments',
        label: 'Attachments',
        labelEs: 'Adjuntos',
        type: 'attachment',
        required: false
      },
    ],
  },

  inspection_notes: {
    id: 'inspection_notes',
    name: 'Inspection Notes',
    nameEs: 'Notas de Inspecci\u00f3n',
    description: 'Document site inspection findings',
    descriptionEs: 'Documentar hallazgos de inspecci\u00f3n del sitio',
    icon: 'ClipboardCheck',
    fields: [
      {
        name: 'inspection_type',
        label: 'Inspection Type',
        labelEs: 'Tipo de Inspecci\u00f3n',
        type: 'select',
        required: true,
        options: ['Safety', 'Quality', 'Progress', 'Final', 'Regulatory', 'Other'],
        optionsEs: ['Seguridad', 'Calidad', 'Progreso', 'Final', 'Regulatorio', 'Otro']
      },
      {
        name: 'inspector',
        label: 'Inspector Name',
        labelEs: 'Nombre del Inspector',
        type: 'person',
        required: false
      },
      {
        name: 'date',
        label: 'Inspection Date',
        labelEs: 'Fecha de Inspecci\u00f3n',
        type: 'date',
        required: true
      },
      {
        name: 'area_inspected',
        label: 'Area Inspected',
        labelEs: '\u00c1rea Inspeccionada',
        type: 'location',
        required: true,
        placeholder: 'e.g., Levels 2-4, Mechanical Room',
        placeholderEs: 'ej., Niveles 2-4, Cuarto Mec\u00e1nico'
      },
      {
        name: 'findings',
        label: 'Findings',
        labelEs: 'Hallazgos',
        type: 'multiline',
        required: true,
        placeholder: 'Document inspection findings...',
        placeholderEs: 'Documenta los hallazgos de la inspecci\u00f3n...'
      },
      {
        name: 'pass_fail',
        label: 'Result',
        labelEs: 'Resultado',
        type: 'select',
        required: false,
        options: ['Pass', 'Pass with Notes', 'Fail', 'Reinspection Required'],
        optionsEs: ['Aprobado', 'Aprobado con Notas', 'Reprobado', 'Reinspecci\u00f3n Requerida']
      },
      {
        name: 'corrective_actions',
        label: 'Corrective Actions Required',
        labelEs: 'Acciones Correctivas Requeridas',
        type: 'multiline',
        required: false,
        placeholder: 'What needs to be corrected...',
        placeholderEs: 'Qu\u00e9 necesita ser corregido...'
      },
      {
        name: 'follow_up_date',
        label: 'Follow-up Date',
        labelEs: 'Fecha de Seguimiento',
        type: 'date',
        required: false
      },
      {
        name: 'photos',
        label: 'Photos',
        labelEs: 'Fotos',
        type: 'attachment',
        required: false
      },
    ],
  },

  field_notes: {
    id: 'field_notes',
    name: 'Field Notes',
    nameEs: 'Notas de Campo',
    description: 'General field observations and notes',
    descriptionEs: 'Observaciones generales de campo',
    icon: 'PenTool',
    fields: [
      {
        name: 'date',
        label: 'Date',
        labelEs: 'Fecha',
        type: 'date',
        required: true
      },
      {
        name: 'location',
        label: 'Location',
        labelEs: 'Ubicaci\u00f3n',
        type: 'location',
        required: false
      },
      {
        name: 'subject',
        label: 'Subject',
        labelEs: 'Asunto',
        type: 'text',
        required: false,
        placeholder: 'What is this note about?',
        placeholderEs: '\u00bfDe qu\u00e9 trata esta nota?'
      },
      {
        name: 'notes',
        label: 'Notes',
        labelEs: 'Notas',
        type: 'multiline',
        required: true,
        placeholder: 'Your observations...',
        placeholderEs: 'Tus observaciones...'
      },
      {
        name: 'action_required',
        label: 'Action Required',
        labelEs: 'Acci\u00f3n Requerida',
        type: 'checkbox',
        required: false
      },
      {
        name: 'assigned_to',
        label: 'Assigned To',
        labelEs: 'Asignado A',
        type: 'company',
        required: false
      },
      {
        name: 'photos',
        label: 'Photos',
        labelEs: 'Fotos',
        type: 'attachment',
        required: false
      },
    ],
  },

  incident_report: {
    id: 'incident_report',
    name: 'Injury/Incident Report',
    nameEs: 'Reporte de Lesiones/Incidentes',
    description: 'Document safety incidents and injuries',
    descriptionEs: 'Documentar incidentes de seguridad y lesiones',
    icon: 'AlertTriangle',
    fields: [
      {
        name: 'incident_date',
        label: 'Date of Incident',
        labelEs: 'Fecha del Incidente',
        type: 'date',
        required: true
      },
      {
        name: 'incident_time',
        label: 'Time of Incident',
        labelEs: 'Hora del Incidente',
        type: 'text',
        required: false,
        placeholder: 'e.g., 2:30 PM',
        placeholderEs: 'ej., 2:30 PM'
      },
      {
        name: 'location',
        label: 'Location',
        labelEs: 'Ubicaci\u00f3n',
        type: 'location',
        required: true,
        placeholder: 'Where did the incident occur?',
        placeholderEs: '\u00bfD\u00f3nde ocurri\u00f3 el incidente?'
      },
      {
        name: 'incident_type',
        label: 'Incident Type',
        labelEs: 'Tipo de Incidente',
        type: 'select',
        required: true,
        options: ['Near Miss', 'First Aid', 'Recordable Injury', 'Lost Time Injury', 'Property Damage', 'Environmental'],
        optionsEs: ['Casi Accidente', 'Primeros Auxilios', 'Lesi\u00f3n Registrable', 'Lesi\u00f3n con Tiempo Perdido', 'Da\u00f1o a Propiedad', 'Ambiental']
      },
      {
        name: 'description',
        label: 'Description of Incident',
        labelEs: 'Descripci\u00f3n del Incidente',
        type: 'multiline',
        required: true,
        placeholder: 'Describe what happened...',
        placeholderEs: 'Describe lo que sucedi\u00f3...'
      },
      {
        name: 'injured_party',
        label: 'Injured Party (if applicable)',
        labelEs: 'Parte Lesionada (si aplica)',
        type: 'person',
        required: false
      },
      {
        name: 'company',
        label: 'Company',
        labelEs: 'Compa\u00f1\u00eda',
        type: 'company',
        required: false
      },
      {
        name: 'witnesses',
        label: 'Witnesses',
        labelEs: 'Testigos',
        type: 'text',
        required: false,
        placeholder: 'Names of witnesses',
        placeholderEs: 'Nombres de los testigos'
      },
      {
        name: 'immediate_actions',
        label: 'Immediate Actions Taken',
        labelEs: 'Acciones Inmediatas Tomadas',
        type: 'multiline',
        required: false
      },
      {
        name: 'root_cause',
        label: 'Root Cause',
        labelEs: 'Causa Ra\u00edz',
        type: 'multiline',
        required: false
      },
      {
        name: 'corrective_actions',
        label: 'Corrective Actions',
        labelEs: 'Acciones Correctivas',
        type: 'multiline',
        required: false
      },
      {
        name: 'reported_by',
        label: 'Reported By',
        labelEs: 'Reportado Por',
        type: 'person',
        required: false
      },
      {
        name: 'photos',
        label: 'Photos',
        labelEs: 'Fotos',
        type: 'attachment',
        required: false
      },
    ],
  },
};

/**
 * Pre-populate form fields from voice diary snippets
 */
export function prefillFormFromSnippets(
  templateId: string,
  snippets: Array<{ category: string; content: string }>
): Record<string, string> {
  const template = FORM_TEMPLATES[templateId];
  if (!template) return {};

  const prefilled: Record<string, string> = {};
  const today = new Date().toISOString().split('T')[0];

  // Pre-fill date fields with today
  template.fields.forEach(field => {
    if (field.type === 'date' && (field.name === 'date' || field.name === 'created_on' || field.name === 'incident_date')) {
      prefilled[field.name] = today;
    }
  });

  // Combine snippets into relevant fields based on template type
  switch (templateId) {
    case 'daily_log': {
      const workCompleted = snippets.filter(s => s.category === 'Work Completed').map(s => s.content);
      const issues = snippets.filter(s => s.category === 'Issues').map(s => s.content);
      const safety = snippets.filter(s => s.category === 'Safety').map(s => s.content);

      if (workCompleted.length > 0) {
        prefilled['work_performed'] = workCompleted.map(c => `- ${c}`).join('\n');
      }
      if (issues.length > 0) {
        prefilled['delays'] = issues.map(c => `- ${c}`).join('\n');
      }
      if (safety.length > 0) {
        prefilled['safety_incidents'] = safety.map(c => `- ${c}`).join('\n');
      }
      break;
    }

    case 'punch_list': {
      const issues = snippets.filter(s => ['Issues', 'Work To Be Done', 'Follow-up Items'].includes(s.category));
      if (issues.length > 0) {
        prefilled['description'] = issues.map(s => s.content).join('\n\n');
        // Try to extract title from first item
        const firstContent = issues[0].content;
        prefilled['title'] = firstContent.length > 50 ? firstContent.substring(0, 50) + '...' : firstContent;
      }
      break;
    }

    case 'rfi': {
      const followUp = snippets.filter(s => s.category === 'Follow-up Items');
      const process = snippets.filter(s => s.category === 'Process');
      const all = [...followUp, ...process];

      if (all.length > 0) {
        prefilled['question'] = all.map(s => s.content).join('\n\n');
        const firstContent = all[0].content;
        prefilled['subject'] = firstContent.length > 60 ? firstContent.substring(0, 60) + '...' : firstContent;
      }
      break;
    }

    case 'inspection_notes': {
      const findings = snippets.map(s => `[${s.category}] ${s.content}`);
      if (findings.length > 0) {
        prefilled['findings'] = findings.join('\n\n');
      }
      break;
    }

    case 'field_notes': {
      prefilled['notes'] = snippets.map(s => `[${s.category}] ${s.content}`).join('\n\n');
      break;
    }

    case 'incident_report': {
      const safety = snippets.filter(s => s.category === 'Safety');
      const issues = snippets.filter(s => s.category === 'Issues');
      const all = [...safety, ...issues];

      if (all.length > 0) {
        prefilled['description'] = all.map(s => s.content).join('\n\n');
      }
      break;
    }
  }

  return prefilled;
}
