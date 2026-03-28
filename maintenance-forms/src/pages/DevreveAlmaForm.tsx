import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { MaintenanceVisit, MaintenancePump } from '../lib/types';
import {
  DevreveAlmaChecklist,
  ChecklistSection,
  ChecklistItem,
  getChecklistForPumpType,
  getJokeyChecklist,
  calculateChecklistCompletion,
} from '../lib/devreveAlmaFormDefinitions';
import SignatureCanvas from '../components/SignatureCanvas';

// ============================================
// CHECKLIST ITEM COMPONENT
// ============================================

function ChecklistItemComponent({
  item,
  isChecked,
  onChange,
}: {
  item: ChecklistItem;
  isChecked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="flex items-start gap-3 py-3">
        <button
          type="button"
          onClick={() => onChange(!isChecked)}
          className={`flex-shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all mt-0.5 ${
            isChecked
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-gray-300 hover:border-green-400'
          }`}
        >
          {isChecked && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <span
              className={`text-gray-800 ${isChecked ? 'line-through text-gray-500' : ''}`}
            >
              {item.label}
            </span>
            {item.tip && (
              <button
                type="button"
                onClick={() => setShowTip(!showTip)}
                className="flex-shrink-0 text-blue-500 hover:text-blue-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}
          </div>

          {showTip && item.tip && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span>{item.tip}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// CHECKLIST SECTION COMPONENT
// ============================================

function ChecklistSectionComponent({
  section,
  checklistId,
  completedItems,
  onChange,
}: {
  section: ChecklistSection;
  checklistId: string;
  completedItems: Record<string, boolean>;
  onChange: (itemId: string, checked: boolean) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const completedCount = section.items.filter(
    (item) => completedItems[`${checklistId}_${item.id}`]
  ).length;

  const allCompleted = completedCount === section.items.length;
  const someCompleted = completedCount > 0;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
          allCompleted ? 'bg-green-50 hover:bg-green-100' : 'bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`transform transition-transform text-sm ${
              isExpanded ? 'rotate-90' : ''
            }`}
          >
            ▶
          </span>
          <span className={`font-medium ${allCompleted ? 'text-green-700' : 'text-gray-700'}`}>
            {section.title}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              allCompleted
                ? 'bg-green-200 text-green-800'
                : someCompleted
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            {completedCount}/{section.items.length}
          </span>
        </div>
        {allCompleted && (
          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {isExpanded && (
        <div className="p-4 bg-white">
          {section.description && (
            <p className="text-sm text-gray-500 mb-3 pb-3 border-b border-gray-100">
              {section.description}
            </p>
          )}
          <div>
            {section.items.map((item) => (
              <ChecklistItemComponent
                key={item.id}
                item={item}
                isChecked={completedItems[`${checklistId}_${item.id}`] || false}
                onChange={(checked) => onChange(`${checklistId}_${item.id}`, checked)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// PROGRESS BAR COMPONENT
// ============================================

function ProgressBar({
  completed,
  total,
  percentage,
  label,
}: {
  completed: number;
  total: number;
  percentage: number;
  label: string;
}) {
  const getColor = () => {
    if (percentage >= 100) return 'bg-green-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
      <div className="flex justify-between items-center mb-2">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-500">
          {completed}/{total} ({percentage}%)
        </span>
      </div>
      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor()} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
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
  progress,
}: {
  pump: MaintenancePump;
  isActive: boolean;
  onClick: () => void;
  progress?: { percentage: number };
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

  const isComplete = progress && progress.percentage >= 100;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2 rounded-t-lg font-medium transition-colors whitespace-nowrap ${
        isActive
          ? isJockey
            ? 'bg-orange-500 text-white'
            : 'bg-blue-500 text-white'
          : isComplete
          ? 'bg-green-100 text-green-700 hover:bg-green-200'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
      }`}
    >
      {modelLabel && <span className="mr-1">{modelLabel}</span>}
      {label}
      {isComplete && !isActive && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}
    </button>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function DevreveAlmaForm() {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();

  const [visit, setVisit] = useState<MaintenanceVisit | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activePumpIndex, setActivePumpIndex] = useState(0);

  // Completed items state - stored per pump
  // Format: { [pumpId]: { [checklistId_itemId]: boolean } }
  const [completedItemsByPump, setCompletedItemsByPump] = useState<
    Record<string, Record<string, boolean>>
  >({});

  // Signatures
  const [signatures, setSignatures] = useState<{
    technician?: string;
    customer?: string;
  }>({});

  // Notes
  const [notes, setNotes] = useState('');

  // Load visit data
  useEffect(() => {
    if (!visitId) return;

    const loadVisit = async () => {
      try {
        const visitData = await api.getVisit(visitId);
        setVisit(visitData);

        // Load existing form data from notes field (JSON)
        if (visitData.notes) {
          try {
            const savedData = JSON.parse(visitData.notes);
            if (savedData.devreveAlmaData) {
              setCompletedItemsByPump(savedData.devreveAlmaData.completedItemsByPump || {});
              setSignatures(savedData.devreveAlmaData.signatures || {});
              setNotes(savedData.devreveAlmaData.notes || '');
            }
          } catch {
            // Notes is not JSON, ignore
          }
        }

        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load visit:', err);
        setError('Ziyaret yuklenemedi');
        setIsLoading(false);
      }
    };

    loadVisit();
  }, [visitId]);

  // Get pumps (sorted)
  const pumps = visit?.pumps
    ? [...visit.pumps].sort((a, b) => {
        // Main pumps first, then jockey
        if (a.pumpCategory === 'MAIN' && b.pumpCategory === 'JOCKEY') return -1;
        if (a.pumpCategory === 'JOCKEY' && b.pumpCategory === 'MAIN') return 1;
        return a.sortOrder - b.sortOrder;
      })
    : [];

  const activePump = pumps[activePumpIndex];

  // Get checklist for active pump
  const getChecklistForPump = useCallback((pump: MaintenancePump): DevreveAlmaChecklist | null => {
    if (pump.pumpCategory === 'JOCKEY') {
      return getJokeyChecklist();
    }
    if (pump.pumpType === 'DIZEL' || pump.pumpType === 'ELEKTRIKLI') {
      return getChecklistForPumpType(pump.pumpType);
    }
    return null;
  }, []);

  const activeChecklist = activePump ? getChecklistForPump(activePump) : null;

  // Get progress for a pump
  const getProgressForPump = useCallback(
    (pump: MaintenancePump) => {
      const checklist = getChecklistForPump(pump);
      if (!checklist) return { completed: 0, total: 0, percentage: 0 };

      const pumpItems = completedItemsByPump[pump.id] || {};
      return calculateChecklistCompletion(checklist, pumpItems);
    },
    [getChecklistForPump, completedItemsByPump]
  );

  // Handle item change
  const handleItemChange = useCallback(
    (itemFullId: string, checked: boolean) => {
      if (!activePump) return;

      setCompletedItemsByPump((prev) => ({
        ...prev,
        [activePump.id]: {
          ...prev[activePump.id],
          [itemFullId]: checked,
        },
      }));
    },
    [activePump]
  );

  // Calculate overall progress
  const overallProgress = pumps.reduce(
    (acc, pump) => {
      const progress = getProgressForPump(pump);
      return {
        completed: acc.completed + progress.completed,
        total: acc.total + progress.total,
      };
    },
    { completed: 0, total: 0 }
  );
  const overallPercentage =
    overallProgress.total > 0
      ? Math.round((overallProgress.completed / overallProgress.total) * 100)
      : 0;

  // Save form
  const handleSave = async (complete = false) => {
    if (!visitId || !visit) return;

    setIsSaving(true);
    setError(null);

    try {
      // Build saved data
      const devreveAlmaData = {
        completedItemsByPump,
        signatures,
        notes,
        lastUpdated: new Date().toISOString(),
      };

      // Parse existing notes to preserve other data
      let existingNotes: Record<string, unknown> = {};
      if (visit.notes) {
        try {
          existingNotes = JSON.parse(visit.notes);
        } catch {
          // Not JSON
        }
      }

      const updatedNotes = JSON.stringify({
        ...existingNotes,
        devreveAlmaData,
      });

      await api.updateVisit(visitId, {
        notes: updatedNotes,
        status: complete ? 'completed' : 'in_progress',
      });

      // Update local state
      setVisit((prev) =>
        prev
          ? {
              ...prev,
              notes: updatedNotes,
              status: complete ? 'completed' : 'in_progress',
            }
          : null
      );

      if (complete) {
        navigate('/');
      }
    } catch (err) {
      console.error('Failed to save:', err);
      setError('Kaydetme basarisiz oldu');
    } finally {
      setIsSaving(false);
    }
  };

  // Download PDF
  const handleDownloadPdf = async () => {
    if (!visitId) return;

    try {
      const blob = await api.downloadPdf(visitId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `devreye-alma-${visit?.companyName || visitId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF download failed:', err);
      setError('PDF olusturulamadi');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Yukleniyor...</p>
        </div>
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Ziyaret bulunamadi</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-blue-600 hover:underline"
        >
          Ana sayfaya don
        </button>
      </div>
    );
  }

  if (pumps.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Bu ziyarette pompa bulunmuyor.</p>
        <button
          onClick={() => navigate(`/visit/${visitId}/pumps`)}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Pompa Ekle
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg p-4 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => navigate(-1)}
            className="p-1 hover:bg-white/20 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">Devreye Alma</h1>
          <div className="w-6" />
        </div>
        <p className="text-purple-100 text-sm text-center">
          {visit.companyName || 'Isimsiz Firma'} - {visit.address || 'Konum belirtilmedi'}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Overall Progress */}
      <ProgressBar
        completed={overallProgress.completed}
        total={overallProgress.total}
        percentage={overallPercentage}
        label="Toplam Ilerleme"
      />

      {/* Pump Tabs */}
      <div className="flex overflow-x-auto gap-1 pb-1 -mx-4 px-4">
        {pumps.map((pump, index) => (
          <PumpTab
            key={pump.id}
            pump={pump}
            isActive={index === activePumpIndex}
            onClick={() => setActivePumpIndex(index)}
            progress={getProgressForPump(pump)}
          />
        ))}
      </div>

      {/* Active Pump Checklist */}
      {activePump && activeChecklist && (
        <div className="space-y-4">
          {/* Pump Info Header */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">
            <h2 className="font-bold text-gray-800 mb-2">{activeChecklist.title}</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Marka:</span>{' '}
                <span className="font-medium">{activePump.brand || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500">Model:</span>{' '}
                <span className="font-medium">{activePump.modelNumber || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500">Seri No:</span>{' '}
                <span className="font-medium">{activePump.serialNumber || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500">Tip:</span>{' '}
                <span className="font-medium">
                  {activePump.pumpCategory === 'JOCKEY'
                    ? 'Jockey'
                    : `${activePump.pumpModel === 'VERTICAL' ? 'Dikey' : 'Yatay'} ${
                        activePump.pumpType === 'DIZEL' ? 'Dizel' : 'Elektrikli'
                      }`}
                </span>
              </div>
            </div>
          </div>

          {/* Pump Progress */}
          {(() => {
            const progress = getProgressForPump(activePump);
            return (
              <div className="flex items-center gap-3 px-1">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      progress.percentage >= 100 ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
                <span className="text-sm text-gray-600 whitespace-nowrap">
                  {progress.completed}/{progress.total}
                </span>
              </div>
            );
          })()}

          {/* Checklist Sections */}
          <div className="space-y-4">
            {activeChecklist.sections.map((section) => (
              <ChecklistSectionComponent
                key={section.id}
                section={section}
                checklistId={activeChecklist.id}
                completedItems={completedItemsByPump[activePump.id] || {}}
                onChange={handleItemChange}
              />
            ))}
          </div>
        </div>
      )}

      {/* Notes Section */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 font-medium text-gray-700">
          Notlar
        </div>
        <div className="p-4">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ek notlar..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Signatures Section */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 font-medium text-gray-700">
          Imzalar
        </div>
        <div className="p-4 space-y-6">
          <SignatureCanvas
            label="Teknisyen Imzasi"
            value={signatures.technician}
            onChange={(sig) => setSignatures((prev) => ({ ...prev, technician: sig }))}
          />
          <SignatureCanvas
            label="Musteri Imzasi"
            value={signatures.customer}
            onChange={(sig) => setSignatures((prev) => ({ ...prev, customer: sig }))}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex gap-3">
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={isSaving}
          className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={isSaving}
          className="py-3 px-4 bg-purple-100 text-purple-700 rounded-lg font-medium hover:bg-purple-200 disabled:opacity-50 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={isSaving || overallPercentage < 100}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
            overallPercentage >= 100
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          } disabled:opacity-50`}
        >
          Tamamla
        </button>
      </div>
    </div>
  );
}
