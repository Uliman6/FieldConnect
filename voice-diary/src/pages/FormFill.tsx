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
    // For now, just save to localStorage
    const savedForms = JSON.parse(localStorage.getItem('voice-diary-forms') || '[]');
    const formRecord = {
      id: `form-${Date.now()}`,
      templateId,
      templateName: template?.name,
      projectId: currentProjectId,
      projectName: currentProject?.name,
      data: formData,
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

  const generatePDF = () => {
    if (!template) return;

    setIsExporting(true);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let y = 20;

    // Helper to add page break if needed
    const checkPageBreak = (neededHeight: number) => {
      if (y + neededHeight > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = 20;
      }
    };

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(template.name, margin, y);
    y += 10;

    // Project name
    if (currentProject?.name) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(`Project: ${currentProject.name}`, margin, y);
      y += 8;
    }

    // Date generated
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, margin, y);
    y += 5;

    // Created by
    if (user?.name || user?.email) {
      doc.text(`Created by: ${user.name || user.email}`, margin, y);
      y += 5;
    }

    doc.setTextColor(0);
    y += 10;

    // Divider
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    // Form fields
    doc.setFontSize(11);
    template.fields.forEach((field) => {
      const value = formData[field.name] || '';
      if (!value && !field.required) return; // Skip empty optional fields

      checkPageBreak(30);

      // Field label
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60);
      doc.text(field.label + (field.required ? ' *' : ''), margin, y);
      y += 6;

      // Field value
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0);

      if (field.type === 'multiline' && value) {
        // Wrap text for multiline fields
        const lines = doc.splitTextToSize(value || '(empty)', contentWidth);
        lines.forEach((line: string) => {
          checkPageBreak(7);
          doc.text(line, margin, y);
          y += 6;
        });
      } else {
        doc.text(value || '(empty)', margin, y);
        y += 6;
      }

      y += 6;
    });

    // Source snippets section (if any)
    if (selectedSnippets.length > 0) {
      checkPageBreak(40);
      y += 10;
      doc.setDrawColor(200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Source Voice Notes', margin, y);
      y += 8;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80);

      selectedSnippets.forEach((snippet, idx) => {
        checkPageBreak(20);
        const snippetText = `${idx + 1}. [${snippet.category}] ${snippet.content}`;
        const lines = doc.splitTextToSize(snippetText, contentWidth);
        lines.forEach((line: string) => {
          checkPageBreak(5);
          doc.text(line, margin, y);
          y += 5;
        });
        y += 3;
      });
    }

    // Footer
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Page ${i} of ${pageCount} | Voice Diary - ${template.name}`,
        margin,
        doc.internal.pageSize.getHeight() - 10
      );
    }

    // Download
    const fileName = `${template.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);

    setIsExporting(false);
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
            <div className="w-10" /> {/* Spacer for centering */}
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
            {template.fields.map((field) => (
              <div key={field.name}>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {renderField(field)}
              </div>
            ))}
          </div>

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
