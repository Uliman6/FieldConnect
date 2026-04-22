import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  ChevronLeft,
  Shield,
  Truck,
  Settings2,
  CheckCircle2,
  ListTodo,
  AlertTriangle,
  Users,
  Package,
  ArrowRight,
  FileText,
  X,
  Building2,
  Calendar,
  ListChecks,
  HelpCircle,
  ClipboardCheck,
  PenTool,
  Plus,
  Check,
} from 'lucide-react';
import { useColorScheme } from '../lib/use-color-scheme';
import { useVoiceDiaryStore, VOICE_DIARY_CATEGORIES } from '../lib/voice-diary-store';
import { useAuth } from '../lib/auth';
import type { VoiceDiaryCategory, FormTypeId } from '../lib/types';
import { FORM_TYPES } from '../lib/types';

const CATEGORY_ICONS: Record<VoiceDiaryCategory, React.ReactNode> = {
  'Safety': <Shield size={20} className="text-red-500" />,
  'Logistics': <Truck size={20} className="text-blue-500" />,
  'Process': <Settings2 size={20} className="text-purple-500" />,
  'Work Completed': <CheckCircle2 size={20} className="text-green-500" />,
  'Work To Be Done': <ListTodo size={20} className="text-amber-500" />,
  'Follow-up Items': <ArrowRight size={20} className="text-pink-500" />,
  'Issues': <AlertTriangle size={20} className="text-red-500" />,
  'Team': <Users size={20} className="text-cyan-500" />,
  'Materials': <Package size={20} className="text-stone-500" />,
};

const CATEGORY_COLORS: Record<VoiceDiaryCategory, string> = {
  'Safety': 'bg-red-100 dark:bg-red-900/30',
  'Logistics': 'bg-blue-100 dark:bg-blue-900/30',
  'Process': 'bg-purple-100 dark:bg-purple-900/30',
  'Work Completed': 'bg-green-100 dark:bg-green-900/30',
  'Work To Be Done': 'bg-amber-100 dark:bg-amber-900/30',
  'Follow-up Items': 'bg-pink-100 dark:bg-pink-900/30',
  'Issues': 'bg-red-100 dark:bg-red-900/30',
  'Team': 'bg-cyan-100 dark:bg-cyan-900/30',
  'Materials': 'bg-stone-100 dark:bg-stone-900/30',
};

const FORM_ICONS: Record<string, React.ReactNode> = {
  'FileText': <FileText size={24} className="text-blue-500" />,
  'ListChecks': <ListChecks size={24} className="text-orange-500" />,
  'HelpCircle': <HelpCircle size={24} className="text-purple-500" />,
  'ClipboardCheck': <ClipboardCheck size={24} className="text-green-500" />,
  'PenTool': <PenTool size={24} className="text-cyan-500" />,
  'AlertTriangle': <AlertTriangle size={24} className="text-red-500" />,
  'Plus': <Plus size={24} className="text-gray-500" />,
};

// Date utilities
const formatDateISO = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

const parseDate = (dateStr: string): Date => {
  return new Date(dateStr + 'T00:00:00');
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const formatDateDisplay = (dateStr: string): string => {
  const date = parseDate(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatDateShort = (dateStr: string): string => {
  const today = formatDateISO(new Date());
  if (dateStr === today) return 'Today';

  const yesterday = formatDateISO(addDays(new Date(), -1));
  if (dateStr === yesterday) return 'Yesterday';

  const date = parseDate(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function Dashboard() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const navigate = useNavigate();

  // Current selected date (defaults to today)
  const [selectedDate, setSelectedDate] = useState<string>(formatDateISO(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<VoiceDiaryCategory | null>(null);
  const [selectedFormType, setSelectedFormType] = useState<FormTypeId | null>(null);
  const [selectedSnippetIds, setSelectedSnippetIds] = useState<Set<string>>(new Set());

  const { user } = useAuth();

  const {
    getSnippetsForCategory,
    getSnippetsForDate,
    getVoiceNotesForDate,
    getTodayDate,
    currentProjectId,
    projects,
    dailySummaries,
  } = useVoiceDiaryStore();

  const today = getTodayDate();
  const currentProject = projects.find((p) => p.id === currentProjectId);

  // Get data for the SELECTED date
  const selectedDateNotes = getVoiceNotesForDate(selectedDate, currentProjectId || undefined);
  const selectedDateSnippets = getSnippetsForDate(selectedDate, currentProjectId || undefined);

  // Get summary for selected date
  const selectedDateSummary = useMemo(() => {
    if (!currentProjectId) return null;
    return dailySummaries.find(
      s => s.projectId === currentProjectId && s.date === selectedDate && (s.userId === user?.id || !s.userId)
    );
  }, [currentProjectId, dailySummaries, selectedDate, user?.id]);

  // Category counts for SELECTED date
  const categoryCounts = useMemo(() => {
    const counts: Record<VoiceDiaryCategory, number> = {} as Record<VoiceDiaryCategory, number>;
    VOICE_DIARY_CATEGORIES.forEach((cat) => {
      counts[cat] = getSnippetsForCategory(cat, selectedDate, currentProjectId || undefined).length;
    });
    return counts;
  }, [selectedDate, currentProjectId, getSnippetsForCategory, selectedDateSnippets]);

  const selectedSnippets = selectedCategory
    ? getSnippetsForCategory(selectedCategory, selectedDate, currentProjectId || undefined)
    : [];

  // Date navigation handlers
  const handlePrevDay = () => {
    const current = parseDate(selectedDate);
    const newDate = addDays(current, -1);
    setSelectedDate(formatDateISO(newDate));
  };

  const handleNextDay = () => {
    const current = parseDate(selectedDate);
    const newDate = addDays(current, 1);
    // Don't go past today
    if (formatDateISO(newDate) <= today) {
      setSelectedDate(formatDateISO(newDate));
    }
  };

  const handleDateSelect = (dateStr: string) => {
    setSelectedDate(dateStr);
    setShowDatePicker(false);
  };

  const toggleSnippetSelection = (snippetId: string) => {
    const newSet = new Set(selectedSnippetIds);
    if (newSet.has(snippetId)) {
      newSet.delete(snippetId);
    } else {
      newSet.add(snippetId);
    }
    setSelectedSnippetIds(newSet);
  };

  const handleCreateForm = () => {
    if (!selectedFormType) return;

    const snippetIds = Array.from(selectedSnippetIds).join(',');
    navigate(`/form-fill?template=${selectedFormType}&snippets=${snippetIds}`);
    setSelectedFormType(null);
    setSelectedSnippetIds(new Set());
  };

  // Get available dates (dates with notes)
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    // Add last 30 days
    for (let i = 0; i < 30; i++) {
      dates.add(formatDateISO(addDays(new Date(), -i)));
    }
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, []);

  if (!currentProjectId) {
    return (
      <div className={`h-full flex flex-col items-center justify-center p-10 ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
        <Building2 size={64} className={isDark ? 'text-gray-700' : 'text-gray-300'} />
        <h2 className={`mt-5 text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          No Project Selected
        </h2>
        <p className={`mt-2 text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          Select a project on the Record tab to see your dashboard
        </p>
      </div>
    );
  }

  const isToday = selectedDate === today;

  return (
    <div className={`h-full overflow-y-auto ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
      <div className="p-4">
        {/* Project Header */}
        <div className="flex items-center gap-2 mb-4 px-1">
          <Building2 size={18} className="text-primary-600" />
          <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {currentProject?.name || 'Project'}
          </span>
        </div>

        {/* Date Navigation */}
        <div className={`rounded-xl p-3 mb-4 ${isDark ? 'bg-gray-900' : 'bg-white'} shadow-sm`}>
          <div className="flex items-center justify-between">
            <button
              onClick={handlePrevDay}
              className={`p-2 rounded-lg ${isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              <ChevronLeft size={20} className={isDark ? 'text-gray-400' : 'text-gray-600'} />
            </button>

            <button
              onClick={() => setShowDatePicker(true)}
              className="flex-1 mx-3 flex items-center justify-center gap-2 py-2"
            >
              <Calendar size={18} className="text-primary-600" />
              <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {formatDateDisplay(selectedDate)}
              </span>
            </button>

            <button
              onClick={handleNextDay}
              disabled={isToday}
              className={`p-2 rounded-lg ${
                isToday
                  ? 'opacity-30'
                  : isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <ChevronRight size={20} className={isDark ? 'text-gray-400' : 'text-gray-600'} />
            </button>
          </div>
          <p className={`text-xs text-center mt-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
            Tap date to select
          </p>
        </div>

        {/* Daily Summary Card */}
        <div className={`rounded-xl p-4 mb-4 ${isDark ? 'bg-gray-900' : 'bg-white'} shadow-sm`}>
          <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            Daily Summary
          </h3>

          {selectedDateNotes.length === 0 ? (
            <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              No notes recorded on {formatDateShort(selectedDate)}.
            </p>
          ) : selectedDateSummary?.summary ? (
            <div className="space-y-1">
              {selectedDateSummary.summary.split('\n').filter(line => line.trim()).map((line, idx) => (
                <p key={idx} className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {selectedDateNotes.length} note{selectedDateNotes.length !== 1 ? 's' : ''} recorded. Summary pending.
            </p>
          )}
        </div>

        {/* Categories Grid - for selected date */}
        <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
          Categories ({selectedDateSnippets.length} items on {formatDateShort(selectedDate)})
        </h3>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {VOICE_DIARY_CATEGORIES.map((category) => {
            const count = categoryCounts[category];
            const hasItems = count > 0;

            return (
              <button
                key={category}
                onClick={() => hasItems && setSelectedCategory(category)}
                disabled={!hasItems}
                className={`flex items-center gap-2 p-3 rounded-xl transition-colors ${
                  hasItems
                    ? CATEGORY_COLORS[category]
                    : isDark
                    ? 'bg-gray-900 opacity-50'
                    : 'bg-gray-100 opacity-50'
                } ${!hasItems && 'border border-dashed ' + (isDark ? 'border-gray-700' : 'border-gray-300')}`}
              >
                {CATEGORY_ICONS[category]}
                <div className="flex-1 text-left min-w-0">
                  <p className={`text-xs font-semibold truncate ${hasItems ? (isDark ? 'text-white' : 'text-gray-900') : 'text-gray-400'}`}>
                    {category}
                  </p>
                  <p className={`text-xs ${hasItems ? (isDark ? 'text-gray-400' : 'text-gray-500') : 'text-gray-400'}`}>
                    {count} item{count !== 1 ? 's' : ''}
                  </p>
                </div>
                {hasItems && <ChevronRight size={16} className={isDark ? 'text-gray-500' : 'text-gray-400'} />}
              </button>
            );
          })}
        </div>

        {/* Forms Section */}
        <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
          Create Form
        </h3>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {FORM_TYPES.map((formType) => (
            <button
              key={formType.id}
              onClick={() => setSelectedFormType(formType.id)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-colors ${
                isDark ? 'bg-gray-900 hover:bg-gray-800' : 'bg-white hover:bg-gray-50'
              } shadow-sm`}
            >
              {FORM_ICONS[formType.icon]}
              <span className={`text-xs font-semibold text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {formType.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDatePicker(false)} />
          <div className={`relative w-full sm:max-w-md max-h-[70vh] rounded-t-2xl sm:rounded-2xl ${isDark ? 'bg-gray-900' : 'bg-white'} safe-area-bottom overflow-hidden`}>
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
              <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Select Date</h2>
              <button onClick={() => setShowDatePicker(false)} className="p-2">
                <X size={24} className={isDark ? 'text-white' : 'text-gray-900'} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[50vh]">
              {availableDates.map((date) => {
                const hasNotes = getVoiceNotesForDate(date, currentProjectId || undefined).length > 0;
                const isSelected = date === selectedDate;

                return (
                  <button
                    key={date}
                    onClick={() => handleDateSelect(date)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl mb-2 ${
                      isSelected
                        ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500'
                        : isDark ? 'bg-gray-800' : 'bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Calendar size={18} className={isSelected ? 'text-primary-600' : isDark ? 'text-gray-400' : 'text-gray-500'} />
                      <div className="text-left">
                        <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {formatDateShort(date)}
                        </p>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          {parseDate(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    {hasNotes && (
                      <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs rounded-full">
                        Has notes
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Category Detail Modal */}
      {selectedCategory && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedCategory(null)} />
          <div className={`relative w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl ${isDark ? 'bg-gray-900' : 'bg-white'} safe-area-bottom overflow-hidden`}>
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
              <div>
                <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{selectedCategory}</h2>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {selectedSnippets.length} item{selectedSnippets.length !== 1 ? 's' : ''} on {formatDateShort(selectedDate)}
                </p>
              </div>
              <button onClick={() => setSelectedCategory(null)} className="p-2">
                <X size={24} className={isDark ? 'text-white' : 'text-gray-900'} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              {selectedSnippets.length === 0 ? (
                <p className={`text-center py-10 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  No items in this category on {formatDateShort(selectedDate)}
                </p>
              ) : (
                selectedSnippets.map((snippet) => (
                  <div key={snippet.id} className={`p-4 rounded-xl mb-3 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                      {snippet.content}
                    </p>
                    <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      {new Date(snippet.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Form Creation Modal */}
      {selectedFormType && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setSelectedFormType(null); setSelectedSnippetIds(new Set()); }} />
          <div className={`relative w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl ${isDark ? 'bg-gray-900' : 'bg-white'} safe-area-bottom overflow-hidden`}>
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
              <div>
                <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {FORM_TYPES.find(f => f.id === selectedFormType)?.name}
                </h2>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Select entries from {formatDateShort(selectedDate)}
                </p>
              </div>
              <button onClick={() => { setSelectedFormType(null); setSelectedSnippetIds(new Set()); }} className="p-2">
                <X size={24} className={isDark ? 'text-white' : 'text-gray-900'} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {selectedDateSnippets.length === 0 ? (
                <p className={`text-center py-10 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  No entries on {formatDateShort(selectedDate)}. Record voice notes first.
                </p>
              ) : (
                selectedDateSnippets.map((snippet) => (
                  <button
                    key={snippet.id}
                    onClick={() => toggleSnippetSelection(snippet.id)}
                    className={`w-full p-4 rounded-xl mb-3 text-left transition-colors ${
                      selectedSnippetIds.has(snippet.id)
                        ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500'
                        : isDark ? 'bg-gray-800' : 'bg-gray-100'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        selectedSnippetIds.has(snippet.id)
                          ? 'bg-primary-600'
                          : isDark ? 'bg-gray-700 border border-gray-600' : 'bg-white border border-gray-300'
                      }`}>
                        {selectedSnippetIds.has(snippet.id) && <Check size={14} className="text-white" />}
                      </div>
                      <div className="flex-1">
                        <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-md mb-2 ${CATEGORY_COLORS[snippet.category]}`}>
                          {snippet.category}
                        </span>
                        <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                          {snippet.content}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {selectedDateSnippets.length > 0 && (
              <div className={`p-4 border-t ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                <button
                  onClick={handleCreateForm}
                  disabled={selectedSnippetIds.size === 0}
                  className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                    selectedSnippetIds.size > 0
                      ? 'bg-primary-600 text-white'
                      : isDark ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {selectedSnippetIds.size > 0
                    ? `Create Form (${selectedSnippetIds.size} entries)`
                    : 'Select entries to create form'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
