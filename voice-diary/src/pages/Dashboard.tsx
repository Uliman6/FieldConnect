import { useState, useMemo, useEffect } from 'react';
import {
  ChevronRight,
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
  User,
} from 'lucide-react';
import { useColorScheme } from '../lib/use-color-scheme';
import { useVoiceDiaryStore, VOICE_DIARY_CATEGORIES } from '../lib/voice-diary-store';
import { useAuth } from '../lib/auth';
import type { VoiceDiaryCategory, CategorizedSnippet } from '../lib/types';

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

interface ValidFormSuggestion {
  formType: string;
  formName: string;
  snippetIds: string[];
  snippets: CategorizedSnippet[];
}

export default function Dashboard() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [selectedCategory, setSelectedCategory] = useState<VoiceDiaryCategory | null>(null);
  const [selectedForm, setSelectedForm] = useState<ValidFormSuggestion | null>(null);

  const { user } = useAuth();

  const {
    getDailySummary,
    getProjectSummary,
    getSnippetsForDate,
    getSnippetsForCategory,
    getVoiceNotesForDate,
    getValidFormSuggestions,
    clearOrphanedFormSuggestions,
    getTodayDate,
    currentProjectId,
    projects,
  } = useVoiceDiaryStore();

  const today = getTodayDate();
  const currentProject = projects.find((p) => p.id === currentProjectId);

  // Clear orphaned form suggestions on mount
  useEffect(() => {
    clearOrphanedFormSuggestions();
  }, [clearOrphanedFormSuggestions]);

  const userSummary = currentProjectId ? getDailySummary(today, currentProjectId, user?.id) : undefined;
  const projectSummary = currentProjectId ? getProjectSummary(today, currentProjectId) : undefined;
  const todaySnippets = getSnippetsForDate(today, currentProjectId || undefined);
  const todayNotes = getVoiceNotesForDate(today, currentProjectId || undefined);

  const validFormSuggestions = useMemo(() => {
    return getValidFormSuggestions(currentProjectId || undefined);
  }, [currentProjectId, todaySnippets, getValidFormSuggestions]);

  const categoryCounts = useMemo(() => {
    const counts: Record<VoiceDiaryCategory, number> = {} as Record<VoiceDiaryCategory, number>;
    VOICE_DIARY_CATEGORIES.forEach((cat) => {
      counts[cat] = getSnippetsForCategory(cat, today, currentProjectId || undefined).length;
    });
    return counts;
  }, [todaySnippets, today, currentProjectId, getSnippetsForCategory]);

  const selectedSnippets = selectedCategory
    ? getSnippetsForCategory(selectedCategory, today, currentProjectId || undefined)
    : [];

  const displaySummary = userSummary || projectSummary;

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

        {/* Daily Summary Card */}
        <div className={`rounded-2xl p-5 mb-5 ${isDark ? 'bg-gray-900' : 'bg-white'} shadow-sm`}>
          <div className="flex items-center gap-2 mb-3">
            <User size={18} className="text-primary-600" />
            <span className="text-xs font-semibold text-primary-600 uppercase tracking-wider">
              Your Summary
            </span>
          </div>

          {todayNotes.length === 0 ? (
            <p className={`text-center py-6 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              No voice notes recorded yet today.{'\n'}Start recording to build your summary!
            </p>
          ) : displaySummary?.hasMinimumInfo ? (
            <div className="space-y-2">
              {displaySummary.summary
                .split('\n')
                .filter(line => line.trim() && !line.startsWith('**'))
                .map((line, index) => (
                  <p key={index} className={`text-sm leading-relaxed ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                    {line}
                  </p>
                ))}
            </div>
          ) : (
            <div>
              <p className={`text-sm mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {todayNotes.length} note{todayNotes.length !== 1 ? 's' : ''} recorded
              </p>
              {displaySummary?.summary && (
                <div className="space-y-1">
                  {displaySummary.summary.split('\n').filter(line => line.trim()).map((line, index) => (
                    <p key={index} className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {displaySummary?.lastUpdatedAt && (
            <p className={`text-xs mt-4 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
              Last updated: {new Date(displaySummary.lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        {/* Form Suggestions */}
        {validFormSuggestions.length > 0 && (
          <div className="mb-5">
            <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
              Suggested Forms
            </h3>
            {validFormSuggestions.map((suggestion) => (
              <button
                key={suggestion.formType}
                onClick={() => setSelectedForm(suggestion)}
                className="w-full flex items-center gap-3 p-4 mb-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 transition-colors"
              >
                <FileText size={24} className="text-blue-500" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">{suggestion.formName}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                    Based on {suggestion.snippets.length} related {suggestion.snippets.length === 1 ? 'note' : 'notes'}
                  </p>
                </div>
                <ChevronRight size={20} className="text-blue-500" />
              </button>
            ))}
          </div>
        )}

        {/* Categories Grid */}
        <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
          Categories ({todaySnippets.length} items)
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

        {/* Recent Items */}
        {todaySnippets.length > 0 && (
          <div className="mb-20">
            <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
              Recent Items
            </h3>
            {todaySnippets.slice(0, 5).map((snippet) => (
              <div key={snippet.id} className={`p-4 rounded-xl mb-2 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-md mb-2 ${CATEGORY_COLORS[snippet.category]}`}>
                  {snippet.category}
                </span>
                <p className={`text-sm line-clamp-2 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                  {snippet.content}
                </p>
              </div>
            ))}
            {todaySnippets.length > 5 && (
              <p className={`text-center text-sm mt-2 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                +{todaySnippets.length - 5} more items
              </p>
            )}
          </div>
        )}
      </div>

      {/* Category Detail Modal */}
      {selectedCategory && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedCategory(null)} />
          <div className={`relative w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl ${isDark ? 'bg-gray-900' : 'bg-white'} safe-area-bottom overflow-hidden`}>
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
              <div>
                <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{selectedCategory}</h2>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {selectedSnippets.length} item{selectedSnippets.length !== 1 ? 's' : ''} today
                </p>
              </div>
              <button onClick={() => setSelectedCategory(null)} className="p-2">
                <X size={24} className={isDark ? 'text-white' : 'text-gray-900'} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              {selectedSnippets.length === 0 ? (
                <p className={`text-center py-10 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  No items in this category yet
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

      {/* Form Detail Modal */}
      {selectedForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedForm(null)} />
          <div className={`relative w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl ${isDark ? 'bg-gray-900' : 'bg-white'} safe-area-bottom overflow-hidden`}>
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
              <div>
                <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{selectedForm.formName}</h2>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {selectedForm.snippets.length} related {selectedForm.snippets.length === 1 ? 'entry' : 'entries'}
                </p>
              </div>
              <button onClick={() => setSelectedForm(null)} className="p-2">
                <X size={24} className={isDark ? 'text-white' : 'text-gray-900'} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                These items from your voice notes may be relevant for a {selectedForm.formName}:
              </p>
              {selectedForm.snippets.map((snippet) => (
                <div key={snippet.id} className={`p-4 rounded-xl mb-3 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-md mb-2 ${CATEGORY_COLORS[snippet.category]}`}>
                    {snippet.category}
                  </span>
                  <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                    {snippet.content}
                  </p>
                  <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {new Date(snippet.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
