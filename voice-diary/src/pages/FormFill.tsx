import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Save,
  FileText,
  ListChecks,
  HelpCircle,
  ClipboardCheck,
  PenTool,
  AlertTriangle,
  Plus,
  Calendar,
  MapPin,
  Building2,
  User,
  Check,
  Trash2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { useColorScheme } from '../lib/use-color-scheme';
import { useVoiceDiaryStore } from '../lib/voice-diary-store';
import { useAuth } from '../lib/auth';
import { FORM_TEMPLATES, prefillFormFromSnippets, type FormField } from '../lib/form-templates';

const FORM_ICONS: Record<string, React.ReactNode> = {
  'FileText': <FileText size={24} className="text-blue-500" />,
  'ListChecks': <ListChecks size={24} className="text-orange-500" />,
  'HelpCircle': <HelpCircle size={24} className="text-purple-500" />,
  'ClipboardCheck': <ClipboardCheck size={24} className="text-green-500" />,
  'PenTool': <PenTool size={24} className="text-cyan-500" />,
  'AlertTriangle': <AlertTriangle size={24} className="text-red-500" />,
  'Plus': <Plus size={24} className="text-gray-500" />,
};

// Work entry for daily log
interface WorkEntry {
  company: string;
  workers: string;
  hours: string;
  description: string;
  notes: string;
}

// Inspection entry for daily log
interface InspectionEntry {
  type: string;
  result: string;
  notes: string;
  followUp: boolean;
}

// List item for inspection checklist / materials
interface ListItem {
  company: string;
  scope: string;
  description: string;
  dueDate: string;
  type: string;
  status: string;
}

export default function FormFill() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const templateId = searchParams.get('template') || '';
  const snippetIdsParam = searchParams.get('snippets') || '';
  const snippetIds = snippetIdsParam ? snippetIdsParam.split(',') : [];

  const { categorizedSnippets, currentProjectId, projects } = useVoiceDiaryStore();
  const currentProject = projects.find(p => p.id === currentProjectId);

  const template = FORM_TEMPLATES[templateId];

  // Get selected snippets
  const selectedSnippets = useMemo(() => {
    return categorizedSnippets.filter(s => snippetIds.includes(s.id));
  }, [categorizedSnippets, snippetIds]);

  // Initialize form data with prefilled values
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    if (!template) return {};
    return prefillFormFromSnippets(templateId, selectedSnippets);
  });

  // Work entries for daily log - includes ALL work-related categories
  const [workEntries, setWorkEntries] = useState<WorkEntry[]>(() => {
    const entries: WorkEntry[] = [];
    // Include ALL categories in work entries (except Safety/Issues/Follow-up which go to inspection)
    const workCategories = ['Work Completed', 'Work To Be Done', 'Materials', 'Logistics', 'Team', 'Process'];
    const workSnippets = selectedSnippets.filter(s => workCategories.includes(s.category));

    // Group by category - use category as the label (not extracted from content)
    const categoryGroups: Record<string, string[]> = {};
    workSnippets.forEach(s => {
      // Use the actual category as the grouping key
      const key = s.category;
      if (!categoryGroups[key]) categoryGroups[key] = [];
      categoryGroups[key].push(s.content);
    });

    Object.entries(categoryGroups).forEach(([category, contents]) => {
      entries.push({
        company: category, // Use category name as the label
        workers: '',
        hours: '',
        description: contents.join('. '),
        notes: '',
      });
    });

    return entries.length > 0 ? entries : [{ company: '', workers: '', hours: '', description: '', notes: '' }];
  });

  // Inspection entries for daily log - includes Safety, Issues, Follow-up Items
  const [inspectionEntries, setInspectionEntries] = useState<InspectionEntry[]>(() => {
    // Include Safety, Issues, and Follow-up Items categories
    const inspectionCategories = ['Safety', 'Issues', 'Follow-up Items'];
    const inspectionSnippets = selectedSnippets.filter(s => inspectionCategories.includes(s.category));
    const entries: InspectionEntry[] = inspectionSnippets.map(s => ({
      type: s.category === 'Safety' ? 'Safety' : (s.category === 'Issues' ? 'Issue' : 'Follow-up'),
      result: 'Pending',
      notes: s.content,
      followUp: s.category === 'Follow-up Items',
    }));
    return entries.length > 0 ? entries : [];
  });

  // List items for inspection notes
  const [listItems, setListItems] = useState<ListItem[]>(() => {
    const items: ListItem[] = selectedSnippets.map(s => ({
      company: '',
      scope: s.category,
      description: s.content,
      dueDate: '',
      type: '',
      status: 'Pending',
    }));
    return items.length > 0 ? items : [{ company: '', scope: '', description: '', dueDate: '', type: '', status: 'Pending' }];
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Update form data when snippets change
  useEffect(() => {
    if (template && selectedSnippets.length > 0) {
      const prefilled = prefillFormFromSnippets(templateId, selectedSnippets);
      setFormData(prev => ({ ...prefilled, ...prev }));
    }
  }, [template, templateId, selectedSnippets]);

  const handleFieldChange = (fieldName: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
  };

  const handleSave = () => {
    setIsSaving(true);
    const savedForms = JSON.parse(localStorage.getItem('voice-diary-forms') || '[]');
    const formRecord = {
      id: `form-${Date.now()}`,
      templateId,
      templateName: template?.name,
      projectId: currentProjectId,
      projectName: currentProject?.name,
      data: formData,
      workEntries: templateId === 'daily_log' ? workEntries : undefined,
      inspectionEntries: templateId === 'daily_log' ? inspectionEntries : undefined,
      listItems: ['inspection_notes', 'field_notes'].includes(templateId) ? listItems : undefined,
      snippetIds,
      createdAt: new Date().toISOString(),
      createdBy: user?.name || user?.email,
    };
    savedForms.push(formRecord);
    localStorage.setItem('voice-diary-forms', JSON.stringify(savedForms));
    setTimeout(() => {
      setIsSaving(false);
      alert('Form saved successfully!');
    }, 500);
  };

  // ============== PDF GENERATORS ==============

  const generateDailyLogPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;

    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 55, 96); // Dark blue
    doc.text('DAILY CONSTRUCTION LOG', pageWidth / 2, y, { align: 'center' });
    y += 15;

    // Header box
    doc.setDrawColor(200);
    doc.setFillColor(255, 255, 255);
    doc.rect(margin, y, pageWidth - margin * 2, 35, 'S');

    doc.setFontSize(10);
    doc.setTextColor(0);
    const leftCol = margin + 5;
    const rightCol = pageWidth / 2 + 10;

    doc.setFont('helvetica', 'bold');
    doc.text('Project:', leftCol, y + 8);
    doc.text('Address:', leftCol, y + 16);
    doc.text('Prepared By:', leftCol, y + 24);
    doc.text('Project #:', rightCol, y + 8);
    doc.text('Date:', rightCol, y + 16);
    doc.text('Status:', rightCol, y + 24);

    doc.setFont('helvetica', 'normal');
    doc.text(currentProject?.name || 'N/A', leftCol + 25, y + 8);
    doc.text(formData['address'] || 'N/A', leftCol + 25, y + 16);
    doc.text(user?.name || user?.email || 'N/A', leftCol + 35, y + 24);
    doc.text(currentProject?.id?.substring(0, 8) || '1', rightCol + 30, y + 8);
    doc.text(formatDateForPDF(formData['date']), rightCol + 30, y + 16);
    doc.text('draft', rightCol + 30, y + 24);

    y += 45;

    // Daily Totals
    const totalWorkers = workEntries.reduce((sum, e) => sum + (parseInt(e.workers) || 0), 0);
    const totalHours = workEntries.reduce((sum, e) => sum + (parseInt(e.hours) || 0), 0);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 55, 96);
    doc.text('DAILY TOTALS', pageWidth / 2, y, { align: 'center' });
    y += 3;
    doc.setDrawColor(26, 55, 96);
    doc.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y);
    y += 8;

    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Workers: ${totalWorkers || '-'}`, pageWidth / 2 - 20, y);
    doc.text(`Total Hours: ${totalHours || '-'}`, pageWidth / 2 + 20, y);
    y += 15;

    // Work Performed Section
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 55, 96);
    doc.text('WORK PERFORMED', pageWidth / 2, y, { align: 'center' });
    y += 3;
    doc.line(pageWidth / 2 - 35, y, pageWidth / 2 + 35, y);
    y += 10;

    doc.setFontSize(10);
    doc.setTextColor(0);
    workEntries.filter(e => e.company || e.description).forEach((entry, idx) => {
      if (y > 250) { doc.addPage(); y = 20; }

      doc.setFont('helvetica', 'bold');
      doc.text(`${idx + 1}. ${entry.company || 'Work Item'}`, margin + 10, y);
      y += 6;

      doc.setFont('helvetica', 'normal');
      if (entry.workers || entry.hours) {
        doc.text(`Workers: ${entry.workers || '-'} | Hours: ${entry.hours || '-'}`, margin + 15, y);
        y += 5;
      }
      if (entry.description) {
        const descLines = doc.splitTextToSize(`Description: ${entry.description}`, pageWidth - margin * 2 - 20);
        descLines.forEach((line: string) => {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(line, margin + 15, y);
          y += 5;
        });
      }
      if (entry.notes) {
        const noteLines = doc.splitTextToSize(`Notes: ${entry.notes}`, pageWidth - margin * 2 - 20);
        noteLines.forEach((line: string) => {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(line, margin + 15, y);
          y += 5;
        });
      }
      y += 5;
    });

    // Inspection Notes Section
    if (inspectionEntries.length > 0) {
      y += 5;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 55, 96);
      doc.text('INSPECTION NOTES', pageWidth / 2, y, { align: 'center' });
      y += 3;
      doc.line(pageWidth / 2 - 35, y, pageWidth / 2 + 35, y);
      y += 10;

      doc.setFontSize(10);
      doc.setTextColor(0);
      inspectionEntries.forEach((entry, idx) => {
        if (y > 250) { doc.addPage(); y = 20; }

        doc.setFont('helvetica', 'bold');
        doc.text(`${idx + 1}. ${entry.type}`, margin + 10, y);
        y += 6;

        doc.setFont('helvetica', 'normal');
        doc.text(`Result: ${entry.result}`, margin + 15, y);
        y += 5;

        if (entry.notes) {
          const noteLines = doc.splitTextToSize(entry.notes, pageWidth - margin * 2 - 20);
          noteLines.forEach((line: string) => {
            if (y > 270) { doc.addPage(); y = 20; }
            doc.text(line, margin + 15, y);
            y += 5;
          });
        }

        if (entry.followUp) {
          doc.setTextColor(180, 0, 0);
          doc.text('* Follow-up Required', margin + 15, y);
          doc.setTextColor(0);
          y += 5;
        }
        y += 3;
      });
    }

    // Footer
    addFooter(doc, 'Daily Log');
    return doc;
  };

  const generatePunchListPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;

    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('PUNCH LIST ITEM', pageWidth / 2, y, { align: 'center' });
    y += 10;

    // Subtitle
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Project: ${currentProject?.name || 'N/A'} | Date: ${formatDateForPDF(formData['created_on'])}`, pageWidth / 2, y, { align: 'center' });
    y += 5;
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 15;

    // Item Title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    const titleLines = doc.splitTextToSize(formData['title'] || 'Untitled Item', pageWidth - margin * 2);
    titleLines.forEach((line: string) => {
      doc.text(line, margin, y);
      y += 7;
    });
    y += 5;

    // 2-column layout
    doc.setFontSize(9);
    const leftCol = margin;
    const rightCol = pageWidth / 2 + 5;

    // Row 1: Location / Created By
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100);
    doc.text('LOCATION', leftCol, y);
    doc.text('CREATED BY', rightCol, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.text(formData['location'] || 'Not specified', leftCol, y);
    doc.text(formData['created_by'] || user?.name || 'Not specified', rightCol, y);
    y += 10;

    // Row 2: Assigned To / Date
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100);
    doc.text('ASSIGNED TO', leftCol, y);
    doc.text('DATE', rightCol, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.text(formData['assigned_to'] || 'Not assigned', leftCol, y);
    doc.text(formatDateForPDF(formData['created_on']), rightCol, y);
    y += 15;

    // Description
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100);
    doc.text('DESCRIPTION', leftCol, y);
    y += 8;

    // Description box
    doc.setFillColor(245, 245, 245);
    const descHeight = Math.max(30, Math.ceil((formData['description']?.length || 0) / 80) * 6 + 10);
    doc.rect(margin, y - 3, pageWidth - margin * 2, descHeight, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.setFontSize(10);
    const descLines = doc.splitTextToSize(formData['description'] || 'No description provided.', pageWidth - margin * 2 - 10);
    descLines.forEach((line: string) => {
      doc.text(line, margin + 5, y + 3);
      y += 5;
    });

    // Footer
    addFooter(doc, 'Punch List');
    return doc;
  };

  const generateRFIPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;

    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('REQUEST FOR INFORMATION', pageWidth / 2, y, { align: 'center' });
    y += 10;

    // Subtitle
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Project: ${currentProject?.name || 'N/A'} | Date: ${formatDateForPDF(formData['created_on'])}`, pageWidth / 2, y, { align: 'center' });
    y += 5;
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 15;

    // Subject Title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    const subjectLines = doc.splitTextToSize(formData['subject'] || 'Untitled RFI', pageWidth - margin * 2);
    subjectLines.forEach((line: string) => {
      doc.text(line, margin, y);
      y += 7;
    });
    y += 5;

    // 3-column layout
    doc.setFontSize(9);
    const col1 = margin;
    const col2 = pageWidth / 3 + 5;
    const col3 = (pageWidth / 3) * 2 + 5;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100);
    doc.text('CREATED BY', col1, y);
    doc.text('BALL IN COURT', col2, y);
    doc.text('REFERENCE', col3, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.text(formData['created_by'] || user?.name || 'N/A', col1, y);
    doc.text(formData['ball_in_court'] || 'N/A', col2, y);
    doc.text(formData['reference'] || 'N/A', col3, y);
    y += 15;

    // Question
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100);
    doc.text('QUESTION', margin, y);
    y += 8;

    // Question box with light blue background
    doc.setFillColor(240, 248, 255);
    const questionHeight = Math.max(40, Math.ceil((formData['question']?.length || 0) / 80) * 6 + 15);
    doc.rect(margin, y - 3, pageWidth - margin * 2, questionHeight, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.setFontSize(10);
    const questionLines = doc.splitTextToSize(formData['question'] || 'No question provided.', pageWidth - margin * 2 - 10);
    questionLines.forEach((line: string) => {
      doc.text(line, margin + 5, y + 3);
      y += 5;
    });
    y += questionHeight - (questionLines.length * 5) + 10;

    // Cost Impact / Schedule Impact
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100);
    doc.text('COST IMPACT', margin, y);
    doc.text('SCHEDULE IMPACT', pageWidth / 2, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.text(formData['cost_impact'] || 'TBD', margin, y);
    doc.text(formData['schedule_impact'] || 'TBD', pageWidth / 2, y);
    y += 15;

    // Photos placeholder
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100);
    doc.text('PHOTOS', margin, y);
    y += 8;
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150);
    doc.text('(Photo attachments will appear here)', margin, y);

    // Footer
    addFooter(doc, 'RFI');
    return doc;
  };

  const generateInspectionListPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    let y = 20;

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(formData['title'] || 'Inspection Checklist', pageWidth / 2, y, { align: 'center' });
    y += 7;

    // Subtitle
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(formData['inspection_type'] || 'Site Inspection', pageWidth / 2, y, { align: 'center' });
    y += 10;

    // Header info
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Project:', margin, y);
    doc.text('Date:', pageWidth / 2, y);
    doc.setFont('helvetica', 'normal');
    doc.text(currentProject?.name || 'N/A', margin + 20, y);
    doc.text(formatDateForPDF(formData['date']), pageWidth / 2 + 15, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Created By:', margin, y);
    doc.text('Total Items:', pageWidth / 2, y);
    doc.setFont('helvetica', 'normal');
    doc.text(user?.name || '-', margin + 28, y);
    doc.text(String(listItems.filter(i => i.description).length), pageWidth / 2 + 28, y);
    y += 10;

    // Table header
    const colWidths = [10, 40, 55, 45, 30];
    const cols = [margin, margin + 10, margin + 50, margin + 105, margin + 150];

    doc.setFillColor(230, 126, 34); // Orange header
    doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255);
    doc.text('#', cols[0] + 2, y + 5);
    doc.text('Owner/Company', cols[1] + 2, y + 5);
    doc.text('Description', cols[2] + 2, y + 5);
    doc.text('Due Date', cols[3] + 2, y + 5);
    doc.text('Status', cols[4] + 2, y + 5);
    y += 10;

    // Table rows
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    let currentCompany = '';

    listItems.filter(item => item.description).forEach((item, idx) => {
      if (y > 270) { doc.addPage(); y = 20; }

      // Company section header
      if (item.company && item.company !== currentCompany) {
        currentCompany = item.company;
        doc.setFillColor(255, 235, 205); // Light orange
        doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(180, 90, 20);
        doc.text(item.company, margin + 2, y + 5);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'normal');
        y += 8;
      }

      // Row
      doc.setDrawColor(220);
      doc.line(margin, y + 6, pageWidth - margin, y + 6);

      doc.setFontSize(8);
      doc.text(String(idx + 1), cols[0] + 2, y + 4);

      // Wrap description
      const descLines = doc.splitTextToSize(item.description, colWidths[2] - 4);
      doc.text(descLines[0] || '-', cols[2] + 2, y + 4);

      doc.text(item.dueDate || '-', cols[3] + 2, y + 4);
      doc.text(item.status || '-', cols[4] + 2, y + 4);

      y += 8;
    });

    // Footer
    addFooter(doc, 'Inspection List');
    return doc;
  };

  const generateGenericPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(template?.name || 'Form', pageWidth / 2, y, { align: 'center' });
    y += 10;

    // Subtitle
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Project: ${currentProject?.name || 'N/A'} | Date: ${formatDateForPDF(formData['date'] || formData['created_on'] || formData['incident_date'])}`, pageWidth / 2, y, { align: 'center' });
    y += 5;
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 15;

    // Form fields
    doc.setTextColor(0);
    template?.fields.forEach((field) => {
      const value = formData[field.name] || '';
      if (!value && !field.required) return;

      if (y > 260) { doc.addPage(); y = 20; }

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100);
      doc.text(field.label.toUpperCase(), margin, y);
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0);
      doc.setFontSize(10);

      if (field.type === 'multiline' && value) {
        const lines = doc.splitTextToSize(value, pageWidth - margin * 2);
        lines.forEach((line: string) => {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(line, margin, y);
          y += 5;
        });
      } else {
        doc.text(value || '-', margin, y);
        y += 6;
      }
      y += 5;
    });

    // Footer
    addFooter(doc, template?.name || 'Form');
    return doc;
  };

  const formatDateForPDF = (dateStr: string | undefined): string => {
    if (!dateStr) return new Date().toLocaleDateString();
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const addFooter = (doc: jsPDF, docType: string) => {
    const pageCount = doc.internal.pages.length - 1;
    const pageHeight = doc.internal.pageSize.getHeight();

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Generated on ${new Date().toLocaleString()} | ${docType} ID: ${crypto.randomUUID().substring(0, 8)}`,
        doc.internal.pageSize.getWidth() / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    }
  };

  const generatePDF = () => {
    if (!template) return;
    setIsExporting(true);

    let doc: jsPDF;

    switch (templateId) {
      case 'daily_log':
        doc = generateDailyLogPDF();
        break;
      case 'punch_list':
        doc = generatePunchListPDF();
        break;
      case 'rfi':
        doc = generateRFIPDF();
        break;
      case 'inspection_notes':
      case 'field_notes':
        doc = generateInspectionListPDF();
        break;
      default:
        doc = generateGenericPDF();
    }

    const fileName = `${template.name.replace(/\s+/g, '-').toLowerCase()}-${crypto.randomUUID().substring(0, 8)}.pdf`;
    doc.save(fileName);
    setIsExporting(false);
  };

  // ============== WORK ENTRY HANDLERS ==============

  const addWorkEntry = () => {
    setWorkEntries([...workEntries, { company: '', workers: '', hours: '', description: '', notes: '' }]);
  };

  const updateWorkEntry = (index: number, field: keyof WorkEntry, value: string) => {
    const updated = [...workEntries];
    updated[index][field] = value;
    setWorkEntries(updated);
  };

  const removeWorkEntry = (index: number) => {
    if (workEntries.length > 1) {
      setWorkEntries(workEntries.filter((_, i) => i !== index));
    }
  };

  // ============== INSPECTION ENTRY HANDLERS ==============

  const addInspectionEntry = () => {
    setInspectionEntries([...inspectionEntries, { type: '', result: 'Pending', notes: '', followUp: false }]);
  };

  const updateInspectionEntry = (index: number, field: keyof InspectionEntry, value: string | boolean) => {
    const updated = [...inspectionEntries];
    if (field === 'followUp') {
      updated[index].followUp = value as boolean;
    } else {
      updated[index][field] = value as string;
    }
    setInspectionEntries(updated);
  };

  const removeInspectionEntry = (index: number) => {
    setInspectionEntries(inspectionEntries.filter((_, i) => i !== index));
  };

  // ============== LIST ITEM HANDLERS ==============

  const addListItem = () => {
    setListItems([...listItems, { company: '', scope: '', description: '', dueDate: '', type: '', status: 'Pending' }]);
  };

  const updateListItem = (index: number, field: keyof ListItem, value: string) => {
    const updated = [...listItems];
    updated[index][field] = value;
    setListItems(updated);
  };

  const removeListItem = (index: number) => {
    if (listItems.length > 1) {
      setListItems(listItems.filter((_, i) => i !== index));
    }
  };

  if (!template) {
    return (
      <div className={`h-full flex flex-col items-center justify-center p-10 ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
        <FileText size={64} className={isDark ? 'text-gray-700' : 'text-gray-300'} />
        <h2 className={`mt-5 text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Template Not Found
        </h2>
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const renderField = (field: FormField) => {
    const value = formData[field.name] || '';
    const baseInputClass = `w-full p-3 rounded-lg border ${
      isDark
        ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
    } focus:outline-none focus:ring-2 focus:ring-primary-500`;

    switch (field.type) {
      case 'multiline':
        return (
          <textarea
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            rows={4}
            className={baseInputClass}
          />
        );

      case 'date':
        return (
          <div className="relative">
            <Calendar size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              type="date"
              value={value}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              className={`${baseInputClass} pl-10`}
            />
          </div>
        );

      case 'location':
        return (
          <div className="relative">
            <MapPin size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              type="text"
              value={value}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              className={`${baseInputClass} pl-10`}
            />
          </div>
        );

      case 'company':
        return (
          <div className="relative">
            <Building2 size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              type="text"
              value={value}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              className={`${baseInputClass} pl-10`}
            />
          </div>
        );

      case 'person':
        return (
          <div className="relative">
            <User size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              type="text"
              value={value}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              className={`${baseInputClass} pl-10`}
            />
          </div>
        );

      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className={baseInputClass}
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => handleFieldChange(field.name, value === 'true' ? 'false' : 'true')}
              className={`w-6 h-6 rounded-md flex items-center justify-center ${
                value === 'true'
                  ? 'bg-primary-600'
                  : isDark ? 'bg-gray-700 border border-gray-600' : 'bg-white border border-gray-300'
              }`}
            >
              {value === 'true' && <Check size={16} className="text-white" />}
            </div>
            <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>Yes</span>
          </label>
        );

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            className={baseInputClass}
          />
        );
    }
  };

  // Render Work Entries section for Daily Log
  const renderWorkEntries = () => (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          Work Performed
        </h3>
        <button
          onClick={addWorkEntry}
          className="flex items-center gap-1 text-xs text-primary-600"
        >
          <Plus size={14} /> Add Entry
        </button>
      </div>

      {workEntries.map((entry, idx) => (
        <div key={idx} className={`p-3 rounded-lg mb-3 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Entry {idx + 1}
            </span>
            {workEntries.length > 1 && (
              <button onClick={() => removeWorkEntry(idx)} className="text-red-500">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <input
            type="text"
            value={entry.company}
            onChange={(e) => updateWorkEntry(idx, 'company', e.target.value)}
            placeholder="Company name"
            className={`w-full p-2 rounded mb-2 text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
          />

          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={entry.workers}
              onChange={(e) => updateWorkEntry(idx, 'workers', e.target.value)}
              placeholder="Workers"
              className={`w-1/2 p-2 rounded text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
            />
            <input
              type="text"
              value={entry.hours}
              onChange={(e) => updateWorkEntry(idx, 'hours', e.target.value)}
              placeholder="Hours"
              className={`w-1/2 p-2 rounded text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
            />
          </div>

          <textarea
            value={entry.description}
            onChange={(e) => updateWorkEntry(idx, 'description', e.target.value)}
            placeholder="Description of work performed"
            rows={2}
            className={`w-full p-2 rounded mb-2 text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
          />

          <input
            type="text"
            value={entry.notes}
            onChange={(e) => updateWorkEntry(idx, 'notes', e.target.value)}
            placeholder="Notes (optional)"
            className={`w-full p-2 rounded text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
          />
        </div>
      ))}
    </div>
  );

  // Render Inspection Entries section for Daily Log
  const renderInspectionEntries = () => (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          Inspection Notes
        </h3>
        <button
          onClick={addInspectionEntry}
          className="flex items-center gap-1 text-xs text-primary-600"
        >
          <Plus size={14} /> Add Inspection
        </button>
      </div>

      {inspectionEntries.map((entry, idx) => (
        <div key={idx} className={`p-3 rounded-lg mb-3 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Inspection {idx + 1}
            </span>
            <button onClick={() => removeInspectionEntry(idx)} className="text-red-500">
              <Trash2 size={14} />
            </button>
          </div>

          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={entry.type}
              onChange={(e) => updateInspectionEntry(idx, 'type', e.target.value)}
              placeholder="Type (e.g., Electrical)"
              className={`flex-1 p-2 rounded text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
            />
            <select
              value={entry.result}
              onChange={(e) => updateInspectionEntry(idx, 'result', e.target.value)}
              className={`w-28 p-2 rounded text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
            >
              <option value="Pending">Pending</option>
              <option value="Pass">Pass</option>
              <option value="Fail">Fail</option>
            </select>
          </div>

          <input
            type="text"
            value={entry.notes}
            onChange={(e) => updateInspectionEntry(idx, 'notes', e.target.value)}
            placeholder="Notes"
            className={`w-full p-2 rounded mb-2 text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={entry.followUp}
              onChange={(e) => updateInspectionEntry(idx, 'followUp', e.target.checked)}
              className="w-4 h-4"
            />
            <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Follow-up Required</span>
          </label>
        </div>
      ))}
    </div>
  );

  // Render List Items for Inspection Checklist
  const renderListItems = () => (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          Checklist Items
        </h3>
        <button
          onClick={addListItem}
          className="flex items-center gap-1 text-xs text-primary-600"
        >
          <Plus size={14} /> Add Item
        </button>
      </div>

      {listItems.map((item, idx) => (
        <div key={idx} className={`p-3 rounded-lg mb-3 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Item {idx + 1}
            </span>
            {listItems.length > 1 && (
              <button onClick={() => removeListItem(idx)} className="text-red-500">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <input
            type="text"
            value={item.company}
            onChange={(e) => updateListItem(idx, 'company', e.target.value)}
            placeholder="Owner/Company"
            className={`w-full p-2 rounded mb-2 text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
          />

          <textarea
            value={item.description}
            onChange={(e) => updateListItem(idx, 'description', e.target.value)}
            placeholder="Description"
            rows={2}
            className={`w-full p-2 rounded mb-2 text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
          />

          <div className="flex gap-2">
            <input
              type="date"
              value={item.dueDate}
              onChange={(e) => updateListItem(idx, 'dueDate', e.target.value)}
              className={`flex-1 p-2 rounded text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
            />
            <select
              value={item.status}
              onChange={(e) => updateListItem(idx, 'status', e.target.value)}
              className={`w-28 p-2 rounded text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
            >
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Complete">Complete</option>
              <option value="N/A">N/A</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  );

  // Fields to skip for special templates (handled separately)
  const skipFields = templateId === 'daily_log'
    ? ['work_performed', 'delays', 'safety_incidents']
    : ['inspection_notes', 'field_notes'].includes(templateId)
    ? ['findings', 'corrective_actions', 'notes']
    : [];

  return (
    <div className={`h-full flex flex-col ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`${isDark ? 'bg-gray-900' : 'bg-white'} shadow-sm safe-area-top`}>
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/dashboard')}
              className={`p-2 -ml-2 rounded-lg ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
            >
              <ArrowLeft size={24} className={isDark ? 'text-white' : 'text-gray-900'} />
            </button>
            <div className="flex items-center gap-2">
              {FORM_ICONS[template.icon]}
              <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {template.name}
              </span>
            </div>
            <div className="w-10" />
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto p-4">
          {/* Project Info */}
          {currentProject && (
            <div className={`flex items-center gap-2 mb-4 px-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <Building2 size={16} />
              <span className="text-sm">{currentProject.name}</span>
            </div>
          )}

          {/* Source Snippets Badge */}
          {selectedSnippets.length > 0 && (
            <div className={`mb-4 p-3 rounded-lg ${isDark ? 'bg-blue-900/20' : 'bg-blue-50'}`}>
              <p className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                Pre-filled from {selectedSnippets.length} voice note{selectedSnippets.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-5">
            {template.fields
              .filter(field => !skipFields.includes(field.name) && field.type !== 'attachment')
              .map((field) => (
                <div key={field.name}>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {renderField(field)}
                </div>
              ))}
          </div>

          {/* Special sections for Daily Log */}
          {templateId === 'daily_log' && (
            <>
              {renderWorkEntries()}
              {renderInspectionEntries()}
            </>
          )}

          {/* Special sections for Inspection Notes */}
          {['inspection_notes', 'field_notes'].includes(templateId) && renderListItems()}

          {/* Spacer for bottom buttons */}
          <div className="h-24" />
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} border-t safe-area-bottom`}>
        <div className="max-w-lg mx-auto px-4 py-3 flex gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold ${
              isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
            }`}
          >
            <Save size={20} />
            {isSaving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={generatePDF}
            disabled={isExporting}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-primary-600 text-white"
          >
            <Download size={20} />
            {isExporting ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
