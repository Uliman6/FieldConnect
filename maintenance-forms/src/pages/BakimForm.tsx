import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { MaintenanceVisit, MaintenancePump } from '../lib/types';
import {
  FormSection,
  FormField,
  getSectionsForPumpType,
  jockeyPumpFormSections,
} from '../lib/bakimFormDefinitions';
import SignatureCanvas from '../components/SignatureCanvas';

// ============================================
// FIELD COMPONENTS
// ============================================

// YES/NO Field
function YesNoField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const options =
    field.type === 'YES_NO'
      ? [
          { label: 'Evet', value: 'YES' },
          { label: 'Hayır', value: 'NO' },
        ]
      : [
          { label: 'Evet', value: 'YES' },
          { label: 'Hayır', value: 'NO' },
          { label: 'N/A', value: 'NA' },
        ];

  return (
    <div className="flex gap-2">
      {options.map((option) => {
        const isSelected = value === option.value;
        const bgColor = isSelected
          ? option.value === 'YES'
            ? 'bg-green-500 text-white'
            : option.value === 'NO'
            ? 'bg-red-500 text-white'
            : 'bg-gray-500 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200';

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex-1 py-2 px-3 rounded-md font-medium transition-colors ${bgColor}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// Checkbox Field
function CheckboxField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: boolean | undefined;
  onChange: (value: boolean) => void;
}) {
  const isChecked = value === true;

  return (
    <button
      type="button"
      onClick={() => onChange(!isChecked)}
      className="flex items-center gap-3 w-full text-left"
    >
      <div
        className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
          isChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
        }`}
      >
        {isChecked && <span className="text-white text-sm">✓</span>}
      </div>
      <span className="text-gray-700">{field.label}</span>
    </button>
  );
}

// Text/Number Field
function TextField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type={field.type === 'NUMBER' ? 'number' : 'text'}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || field.label}
        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {field.unit && (
        <span className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-sm text-gray-600 min-w-[60px] text-center">
          {field.unit}
        </span>
      )}
    </div>
  );
}

// Date Field
function DateField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="date"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}

// Textarea Field
function TextareaField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || field.label}
      rows={4}
      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
    />
  );
}

// Signature Field
function SignatureField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <SignatureCanvas
      value={value}
      onChange={onChange}
      label={field.label}
    />
  );
}

// ============================================
// FORM SECTION COMPONENT
// ============================================

function FormSectionComponent({
  section,
  data,
  onChange,
}: {
  section: FormSection;
  data: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const filledCount = section.fields.filter((f) => {
    const val = data[f.id];
    return val !== undefined && val !== '' && val !== null;
  }).length;

  const badge =
    filledCount > 0 ? `${filledCount}/${section.fields.length}` : undefined;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
      >
        <div className="flex items-center gap-2">
          <span
            className={`transform transition-transform text-sm ${
              isExpanded ? 'rotate-90' : ''
            }`}
          >
            ▶
          </span>
          <span className="font-medium text-gray-700">{section.title}</span>
          {badge && (
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4 bg-white">
          {section.fields.map((field) => (
            <div key={field.id} className="space-y-1">
              {/* Label for non-checkbox fields */}
              {field.type !== 'CHECKBOX' && (
                <label className="block text-sm font-medium text-gray-600">
                  {field.label}
                </label>
              )}

              {/* Field input */}
              {(field.type === 'YES_NO' || field.type === 'YES_NO_NA') && (
                <YesNoField
                  field={field}
                  value={data[field.id] as string | undefined}
                  onChange={(val) => onChange(field.id, val)}
                />
              )}

              {field.type === 'CHECKBOX' && (
                <CheckboxField
                  field={field}
                  value={data[field.id] as boolean | undefined}
                  onChange={(val) => onChange(field.id, val)}
                />
              )}

              {(field.type === 'TEXT' || field.type === 'NUMBER') && (
                <TextField
                  field={field}
                  value={data[field.id] as string | undefined}
                  onChange={(val) => onChange(field.id, val)}
                />
              )}

              {field.type === 'DATE' && (
                <DateField
                  value={data[field.id] as string | undefined}
                  onChange={(val) => onChange(field.id, val)}
                />
              )}

              {field.type === 'TEXTAREA' && (
                <TextareaField
                  field={field}
                  value={data[field.id] as string | undefined}
                  onChange={(val) => onChange(field.id, val)}
                />
              )}

              {field.type === 'SIGNATURE' && (
                <SignatureField
                  field={field}
                  value={data[field.id] as string | undefined}
                  onChange={(val) => onChange(field.id, val)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// PUMP TAB COMPONENT
// ============================================

function PumpTab({
  pump,
  isActive,
  onClick,
}: {
  pump: MaintenancePump;
  isActive: boolean;
  onClick: () => void;
}) {
  const isJockey = pump.pumpCategory === 'JOCKEY';
  const label = isJockey
    ? 'Jockey'
    : pump.pumpType === 'DIZEL'
    ? 'Dizel'
    : 'Elektrik';
  const modelLabel = !isJockey
    ? pump.pumpModel === 'VERTICAL'
      ? 'V'
      : 'H'
    : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-t-lg font-medium transition-colors whitespace-nowrap ${
        isActive
          ? isJockey
            ? 'bg-orange-500 text-white'
            : 'bg-blue-500 text-white'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
      }`}
    >
      {modelLabel && <span className="mr-1">{modelLabel}</span>}
      {label}
    </button>
  );
}

// ============================================
// PUMP INFO DISPLAY
// ============================================

function PumpInfoDisplay({ pump }: { pump: MaintenancePump }) {
  const isJockey = pump.pumpCategory === 'JOCKEY';

  // Get component data
  const pompaComponent = pump.components?.find((c) => c.componentType === 'pompa');
  const kontrolPaneliComponent = pump.components?.find(
    (c) => c.componentType === 'kontrolPaneli'
  );
  const surucuComponent = pump.components?.find((c) => c.componentType === 'surucu');

  return (
    <div className="bg-blue-50 rounded-lg p-4 space-y-3">
      <h3 className="font-semibold text-blue-800">
        {isJockey ? 'Jockey Pompa Bilgileri' : 'Pompa Bilgileri'}
      </h3>

      {/* Pump info */}
      {pompaComponent && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div>
            <span className="text-gray-500">Marka:</span>{' '}
            <span className="font-medium">
              {(pompaComponent.componentData as Record<string, string>)?.brand ||
                pompaComponent.brand ||
                '-'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Model:</span>{' '}
            <span className="font-medium">
              {(pompaComponent.componentData as Record<string, string>)?.model ||
                pompaComponent.modelNumber ||
                '-'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Seri No:</span>{' '}
            <span className="font-medium">
              {(pompaComponent.componentData as Record<string, string>)?.serialNumber ||
                pompaComponent.serialNumber ||
                '-'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Kapasite:</span>{' '}
            <span className="font-medium">
              {(pompaComponent.componentData as Record<string, string>)?.capacity || '-'} GPM
            </span>
          </div>
        </div>
      )}

      {/* Controller info */}
      {kontrolPaneliComponent && (
        <div className="border-t border-blue-200 pt-2">
          <p className="text-xs text-blue-600 mb-1">Kontrol Paneli:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-gray-500">Marka:</span>{' '}
              <span className="font-medium">
                {(kontrolPaneliComponent.componentData as Record<string, string>)?.brand ||
                  kontrolPaneliComponent.brand ||
                  '-'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Model:</span>{' '}
              <span className="font-medium">
                {(kontrolPaneliComponent.componentData as Record<string, string>)?.model ||
                  kontrolPaneliComponent.modelNumber ||
                  '-'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Seri No:</span>{' '}
              <span className="font-medium">
                {(kontrolPaneliComponent.componentData as Record<string, string>)
                  ?.serialNumber ||
                  kontrolPaneliComponent.serialNumber ||
                  '-'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Driver info (main pumps only) */}
      {!isJockey && surucuComponent && (
        <div className="border-t border-blue-200 pt-2">
          <p className="text-xs text-blue-600 mb-1">Sürücü:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-gray-500">Model:</span>{' '}
              <span className="font-medium">
                {(surucuComponent.componentData as Record<string, string>)?.model ||
                  surucuComponent.modelNumber ||
                  '-'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Seri No:</span>{' '}
              <span className="font-medium">
                {(surucuComponent.componentData as Record<string, string>)?.serialNumber ||
                  surucuComponent.serialNumber ||
                  '-'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Güç:</span>{' '}
              <span className="font-medium">
                {(surucuComponent.componentData as Record<string, string>)?.power || '-'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// MAIN BAKIM FORM PAGE
// ============================================

export default function BakimForm() {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();

  const [visit, setVisit] = useState<MaintenanceVisit | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [activePumpIndex, setActivePumpIndex] = useState(0);

  // Form data for each pump (keyed by pump id)
  const [formDataByPump, setFormDataByPump] = useState<
    Record<string, Record<string, unknown>>
  >({});

  // Load visit and pump data
  useEffect(() => {
    if (!visitId) return;

    const loadData = async () => {
      try {
        const data = await api.getVisit(visitId);
        setVisit(data);

        // Initialize form data for each pump
        const initialData: Record<string, Record<string, unknown>> = {};
        for (const pump of data.pumps || []) {
          // Load existing form data if available
          const existingForm = pump.forms?.find((f) => f.formType === 'BAKIM');
          initialData[pump.id] = (existingForm?.formData as Record<string, unknown>) || {};
        }
        setFormDataByPump(initialData);
      } catch {
        setError('Ziyaret yüklenemedi');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [visitId]);

  // Get current pump
  const pumps = visit?.pumps || [];
  const currentPump = pumps[activePumpIndex];

  // Get sections for current pump
  const getSections = useCallback((): FormSection[] => {
    if (!currentPump) return [];

    if (currentPump.pumpCategory === 'JOCKEY') {
      return jockeyPumpFormSections;
    }

    return getSectionsForPumpType(currentPump.pumpType);
  }, [currentPump]);

  // Handle field change
  const handleFieldChange = (fieldId: string, value: unknown) => {
    if (!currentPump) return;

    setFormDataByPump((prev) => ({
      ...prev,
      [currentPump.id]: {
        ...prev[currentPump.id],
        [fieldId]: value,
      },
    }));
  };

  // Save form data for current pump
  const handleSavePump = async (moveToNext: boolean = false) => {
    if (!visitId || !currentPump) return;

    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      // Save form data via API
      await api.createOrUpdatePumpForm(currentPump.id, {
        formType: 'BAKIM',
        formData: formDataByPump[currentPump.id] || {},
        status: 'in_progress',
      });

      // Refresh data from server to confirm save
      const refreshedData = await api.getVisit(visitId);
      setVisit(refreshedData);

      // Update form data state with refreshed data
      const refreshedFormData: Record<string, Record<string, unknown>> = {};
      for (const pump of refreshedData.pumps || []) {
        const existingForm = pump.forms?.find((f) => f.formType === 'BAKIM');
        refreshedFormData[pump.id] = (existingForm?.formData as Record<string, unknown>) || formDataByPump[pump.id] || {};
      }
      setFormDataByPump(refreshedFormData);

      // Show success message
      setSuccessMessage('Kaydedildi!');
      setTimeout(() => setSuccessMessage(''), 3000);

      // Move to next pump if requested and available
      if (moveToNext && activePumpIndex < pumps.length - 1) {
        setActivePumpIndex(activePumpIndex + 1);
      }
    } catch (err) {
      console.error('Save error:', err);
      setError('Form kaydedilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsSaving(false);
    }
  };

  // Save all and complete
  const handleSaveAllAndComplete = async () => {
    if (!visitId) return;

    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      // Save all pump forms
      for (const pump of pumps) {
        await api.createOrUpdatePumpForm(pump.id, {
          formType: 'BAKIM',
          formData: formDataByPump[pump.id] || {},
          status: 'completed',
        });
      }

      // Update visit status to completed
      await api.updateVisit(visitId, { status: 'completed' });

      setSuccessMessage('Bakım raporu tamamlandı!');
      setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      console.error('Save all error:', err);
      setError('Form kaydedilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsSaving(false);
    }
  };

  // Download PDF
  const handleDownloadPdf = async () => {
    if (!visitId) return;

    setIsGeneratingPdf(true);
    setError('');
    setSuccessMessage('');

    try {
      // Auto-save all pump forms before generating PDF to ensure latest data
      for (const pump of pumps) {
        await api.createOrUpdatePumpForm(pump.id, {
          formType: 'BAKIM',
          formData: formDataByPump[pump.id] || {},
          status: 'in_progress',
        });
      }

      // Generate and download PDF
      const blob = await api.downloadPdf(visitId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bakim_formu_${visit?.companyName || 'rapor'}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF error:', err);
      setError('PDF olusturulamadi. Lutfen tekrar deneyin.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-8 text-gray-600">Yükleniyor...</div>;
  }

  if (!visit) {
    return (
      <div className="text-center py-8 text-red-600">Ziyaret bulunamadı</div>
    );
  }

  if (pumps.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">Henüz pompa eklenmemiş.</p>
        <button
          onClick={() => navigate(`/visit/${visitId}/pumps`)}
          className="text-blue-600 hover:underline"
        >
          Pompa eklemek için tıklayın
        </button>
      </div>
    );
  }

  const sections = getSections();

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/visit/${visitId}/pumps`)}
          className="text-gray-600 hover:text-gray-800"
        >
          ← Geri
        </button>
        <h2 className="text-xl font-semibold text-gray-800">Bakım Formu</h2>
        <div className="w-16" />
      </div>

      {/* Visit Info */}
      <div className="bg-green-50 p-3 rounded-md">
        <p className="text-sm text-green-800">
          <strong>Firma:</strong> {visit.companyName || '-'} |{' '}
          <strong>Adres:</strong> {visit.address || '-'}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 text-green-600 p-3 rounded-md text-sm font-medium">
          {successMessage}
        </div>
      )}

      {/* Pump Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {pumps.map((pump, index) => (
          <PumpTab
            key={pump.id}
            pump={pump}
            isActive={index === activePumpIndex}
            onClick={() => setActivePumpIndex(index)}
          />
        ))}
      </div>

      {/* Current Pump Info */}
      {currentPump && <PumpInfoDisplay pump={currentPump} />}

      {/* Progress indicator */}
      <div className="text-sm text-gray-500">
        Pompa {activePumpIndex + 1} / {pumps.length}
        {currentPump?.pumpCategory === 'JOCKEY' && (
          <span className="ml-2 text-orange-600">(Jockey Pompa)</span>
        )}
        {currentPump?.pumpCategory === 'MAIN' && currentPump?.pumpType && (
          <span className="ml-2 text-blue-600">
            ({currentPump.pumpType === 'DIZEL' ? 'Dizel' : 'Elektrikli'} Pompa)
          </span>
        )}
      </div>

      {/* Form Sections */}
      <div className="space-y-3">
        {sections.map((section) => (
          <FormSectionComponent
            key={section.id}
            section={section}
            data={formDataByPump[currentPump?.id || ''] || {}}
            onChange={handleFieldChange}
          />
        ))}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 pt-4">
        {/* Save current pump */}
        <button
          onClick={() => handleSavePump(false)}
          disabled={isSaving}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>

        {/* Save and move to next pump */}
        {activePumpIndex < pumps.length - 1 && (
          <button
            onClick={() => handleSavePump(true)}
            disabled={isSaving}
            className="w-full bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isSaving ? 'Kaydediliyor...' : 'Kaydet ve Sonraki Pompa →'}
          </button>
        )}

        {/* Save all and complete */}
        <button
          onClick={handleSaveAllAndComplete}
          disabled={isSaving}
          className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isSaving ? 'Kaydediliyor...' : 'Tumunu Kaydet ve Tamamla'}
        </button>

        {/* Download PDF */}
        <button
          onClick={handleDownloadPdf}
          disabled={isGeneratingPdf || isSaving}
          className="w-full bg-purple-600 text-white py-3 px-4 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
        >
          {isGeneratingPdf ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>PDF Olusturuluyor...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>PDF Indir</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
