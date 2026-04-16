/**
 * Form Templates for Voice Diary
 * Based on FieldConnect's document schema structure
 */

export type FieldType = 'text' | 'multiline' | 'date' | 'company' | 'person' | 'location' | 'attachment' | 'select' | 'checkbox';

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: string[]; // For select fields
}

export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  fields: FormField[];
}

export const FORM_TEMPLATES: Record<string, FormTemplate> = {
  daily_log: {
    id: 'daily_log',
    name: 'Daily Log',
    description: 'Daily work summary and progress report',
    icon: 'FileText',
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'weather', label: 'Weather Conditions', type: 'text', required: false, placeholder: 'e.g., Clear, 72F' },
      { name: 'manpower', label: 'Manpower Count', type: 'text', required: false, placeholder: 'e.g., 15 workers' },
      { name: 'work_performed', label: 'Work Performed', type: 'multiline', required: true, placeholder: 'Describe work completed today...' },
      { name: 'delays', label: 'Delays/Issues', type: 'multiline', required: false, placeholder: 'Any delays or issues encountered...' },
      { name: 'safety_incidents', label: 'Safety Incidents', type: 'multiline', required: false, placeholder: 'Any safety incidents (or "None")' },
      { name: 'visitors', label: 'Visitors', type: 'text', required: false, placeholder: 'e.g., Inspector, Owner' },
      { name: 'notes', label: 'Additional Notes', type: 'multiline', required: false },
    ],
  },

  punch_list: {
    id: 'punch_list',
    name: 'Punch List',
    description: 'Track deficiencies and incomplete work items',
    icon: 'ListChecks',
    fields: [
      { name: 'title', label: 'Item Title', type: 'text', required: true, placeholder: 'Brief description of the item' },
      { name: 'description', label: 'Description', type: 'multiline', required: true, placeholder: 'Detailed description of the deficiency...' },
      { name: 'location', label: 'Location', type: 'location', required: true, placeholder: 'e.g., Level 4, Room 402' },
      { name: 'assigned_to', label: 'Assigned To', type: 'company', required: false, placeholder: 'Company responsible for correction' },
      { name: 'created_by', label: 'Created By', type: 'person', required: false },
      { name: 'created_on', label: 'Date Created', type: 'date', required: true },
      { name: 'due_date', label: 'Due Date', type: 'date', required: false },
      { name: 'priority', label: 'Priority', type: 'select', required: false, options: ['Low', 'Medium', 'High', 'Critical'] },
      { name: 'root_cause', label: 'Root Cause', type: 'text', required: false, placeholder: 'What caused this issue?' },
      { name: 'photos', label: 'Photos', type: 'attachment', required: false },
    ],
  },

  rfi: {
    id: 'rfi',
    name: 'RFI',
    description: 'Request for Information - clarify design or construction questions',
    icon: 'HelpCircle',
    fields: [
      { name: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'RFI subject line' },
      { name: 'question', label: 'Question', type: 'multiline', required: true, placeholder: 'Describe the question or clarification needed...' },
      { name: 'reference', label: 'Drawing/Spec Reference', type: 'text', required: false, placeholder: 'e.g., A2.1, Section 03300' },
      { name: 'location', label: 'Location', type: 'location', required: false, placeholder: 'Where does this apply?' },
      { name: 'created_by', label: 'Submitted By', type: 'person', required: false },
      { name: 'created_on', label: 'Date Submitted', type: 'date', required: true },
      { name: 'ball_in_court', label: 'Ball in Court', type: 'person', required: false, placeholder: 'Who needs to respond?' },
      { name: 'response_needed_by', label: 'Response Needed By', type: 'date', required: false },
      { name: 'cost_impact', label: 'Cost Impact', type: 'select', required: false, options: ['None', 'TBD', 'Yes - See Below'] },
      { name: 'schedule_impact', label: 'Schedule Impact', type: 'select', required: false, options: ['None', 'TBD', 'Yes - See Below'] },
      { name: 'attachments', label: 'Attachments', type: 'attachment', required: false },
    ],
  },

  inspection_notes: {
    id: 'inspection_notes',
    name: 'Inspection Notes',
    description: 'Document site inspection findings',
    icon: 'ClipboardCheck',
    fields: [
      { name: 'inspection_type', label: 'Inspection Type', type: 'select', required: true, options: ['Safety', 'Quality', 'Progress', 'Final', 'Regulatory', 'Other'] },
      { name: 'inspector', label: 'Inspector Name', type: 'person', required: false },
      { name: 'date', label: 'Inspection Date', type: 'date', required: true },
      { name: 'area_inspected', label: 'Area Inspected', type: 'location', required: true, placeholder: 'e.g., Levels 2-4, Mechanical Room' },
      { name: 'findings', label: 'Findings', type: 'multiline', required: true, placeholder: 'Document inspection findings...' },
      { name: 'pass_fail', label: 'Result', type: 'select', required: false, options: ['Pass', 'Pass with Notes', 'Fail', 'Reinspection Required'] },
      { name: 'corrective_actions', label: 'Corrective Actions Required', type: 'multiline', required: false, placeholder: 'What needs to be corrected...' },
      { name: 'follow_up_date', label: 'Follow-up Date', type: 'date', required: false },
      { name: 'photos', label: 'Photos', type: 'attachment', required: false },
    ],
  },

  field_notes: {
    id: 'field_notes',
    name: 'Field Notes',
    description: 'General field observations and notes',
    icon: 'PenTool',
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'location', label: 'Location', type: 'location', required: false },
      { name: 'subject', label: 'Subject', type: 'text', required: false, placeholder: 'What is this note about?' },
      { name: 'notes', label: 'Notes', type: 'multiline', required: true, placeholder: 'Your observations...' },
      { name: 'action_required', label: 'Action Required', type: 'checkbox', required: false },
      { name: 'assigned_to', label: 'Assigned To', type: 'company', required: false },
      { name: 'photos', label: 'Photos', type: 'attachment', required: false },
    ],
  },

  incident_report: {
    id: 'incident_report',
    name: 'Injury/Incident Report',
    description: 'Document safety incidents and injuries',
    icon: 'AlertTriangle',
    fields: [
      { name: 'incident_date', label: 'Date of Incident', type: 'date', required: true },
      { name: 'incident_time', label: 'Time of Incident', type: 'text', required: false, placeholder: 'e.g., 2:30 PM' },
      { name: 'location', label: 'Location', type: 'location', required: true, placeholder: 'Where did the incident occur?' },
      { name: 'incident_type', label: 'Incident Type', type: 'select', required: true, options: ['Near Miss', 'First Aid', 'Recordable Injury', 'Lost Time Injury', 'Property Damage', 'Environmental'] },
      { name: 'description', label: 'Description of Incident', type: 'multiline', required: true, placeholder: 'Describe what happened...' },
      { name: 'injured_party', label: 'Injured Party (if applicable)', type: 'person', required: false },
      { name: 'company', label: 'Company', type: 'company', required: false },
      { name: 'witnesses', label: 'Witnesses', type: 'text', required: false, placeholder: 'Names of witnesses' },
      { name: 'immediate_actions', label: 'Immediate Actions Taken', type: 'multiline', required: false },
      { name: 'root_cause', label: 'Root Cause', type: 'multiline', required: false },
      { name: 'corrective_actions', label: 'Corrective Actions', type: 'multiline', required: false },
      { name: 'reported_by', label: 'Reported By', type: 'person', required: false },
      { name: 'photos', label: 'Photos', type: 'attachment', required: false },
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
