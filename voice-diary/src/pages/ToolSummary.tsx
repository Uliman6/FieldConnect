import { useState, useMemo } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Shield,
  Zap,
  Hand,
  Settings,
  Lightbulb,
  Star,
  ThumbsUp,
  ThumbsDown,
  Calendar,
  X,
} from 'lucide-react';
import { useColorScheme } from '../lib/use-color-scheme';
import { useToolFeedbackStore } from '../lib/tool-feedback-store';
import { TOOL_FEEDBACK_CATEGORIES, type ToolBrand, type ToolFeedbackCategory } from '../lib/types';

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

const CATEGORY_CONFIG: Record<ToolFeedbackCategory, { icon: React.ReactNode; bg: string; border: string }> = {
  'Safety': { icon: <Shield size={20} />, bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-500' },
  'Productivity': { icon: <Zap size={20} />, bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-green-500' },
  'Comfort': { icon: <Hand size={20} />, bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-500' },
  'Reliability': { icon: <Settings size={20} />, bg: 'bg-purple-100 dark:bg-purple-900/30', border: 'border-purple-500' },
  'Feature Request': { icon: <Lightbulb size={20} />, bg: 'bg-amber-100 dark:bg-amber-900/30', border: 'border-amber-500' },
  'Tip': { icon: <Star size={20} />, bg: 'bg-cyan-100 dark:bg-cyan-900/30', border: 'border-cyan-500' },
};

const BRAND_COLORS: Record<ToolBrand, string> = {
  'DeWalt': 'bg-yellow-500',
  'Milwaukee': 'bg-red-500',
  'Hilti': 'bg-red-600',
  'Makita': 'bg-cyan-500',
};

export default function ToolSummary() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const today = formatDateISO(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<ToolFeedbackCategory | null>(null);

  const { currentProjectId, projects, feedbackSnippets, feedbackEntries } = useToolFeedbackStore();
  const currentProject = projects.find((p) => p.id === currentProjectId);

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

  const isToday = selectedDate === today;

  // Get available dates (dates with feedback)
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    // Add last 30 days
    for (let i = 0; i < 30; i++) {
      dates.add(formatDateISO(addDays(new Date(), -i)));
    }
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, []);

  // Get snippets for selected date and project
  const dateSnippets = useMemo(() => {
    // First filter by project
    let projectEntryIds: Set<string>;
    if (!currentProjectId) {
      projectEntryIds = new Set(feedbackEntries.map((e) => e.id));
    } else {
      projectEntryIds = new Set(
        feedbackEntries.filter((e) => e.projectId === currentProjectId).map((e) => e.id)
      );
    }

    // Filter by date (entries created on selected date)
    const dateEntryIds = new Set(
      feedbackEntries
        .filter((e) => projectEntryIds.has(e.id) && e.createdAt.startsWith(selectedDate))
        .map((e) => e.id)
    );

    return feedbackSnippets.filter((s) => dateEntryIds.has(s.feedbackId));
  }, [currentProjectId, feedbackEntries, feedbackSnippets, selectedDate]);

  // Group by category
  const byCategory = useMemo(() => {
    const result: Record<ToolFeedbackCategory, {
      total: number;
      positive: number;
      negative: number;
      items: Array<{ brand: ToolBrand; content: string; sentiment: string }>;
    }> = {} as any;

    for (const cat of TOOL_FEEDBACK_CATEGORIES) {
      result[cat] = { total: 0, positive: 0, negative: 0, items: [] };
    }

    for (const snippet of dateSnippets) {
      const cat = snippet.category as ToolFeedbackCategory;
      if (result[cat]) {
        result[cat].total++;
        if (snippet.sentiment === 'positive') result[cat].positive++;
        if (snippet.sentiment === 'negative') result[cat].negative++;
        result[cat].items.push({
          brand: snippet.toolBrand,
          content: snippet.content,
          sentiment: snippet.sentiment,
        });
      }
    }

    return result;
  }, [dateSnippets]);

  const totalFeedback = dateSnippets.length;

  const toggleCategory = (cat: ToolFeedbackCategory) => {
    setExpandedCategory(expandedCategory === cat ? null : cat);
  };

  return (
    <div className={`h-full overflow-y-auto ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
      <div className="p-4">
        {/* Project Header */}
        <div className="flex items-center gap-2 mb-4 px-1">
          <Building2 size={18} className="text-orange-500" />
          <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {currentProject?.name || 'All Projects'}
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
              <Calendar size={18} className="text-orange-500" />
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

        {/* Feedback Count */}
        <p className={`text-xs mb-4 px-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {totalFeedback} feedback items on {formatDateShort(selectedDate)}
        </p>

        {/* No Feedback State */}
        {totalFeedback === 0 ? (
          <div className={`p-10 rounded-xl text-center ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
            <Building2 size={48} className={`mx-auto ${isDark ? 'text-gray-700' : 'text-gray-300'}`} />
            <h3 className={`mt-4 text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              No Feedback on {formatDateShort(selectedDate)}
            </h3>
            <p className={`mt-2 text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {isToday
                ? 'Go to the Tools tab to record feedback about power tools'
                : 'Try selecting a different date'}
            </p>
          </div>
        ) : (
          /* Category Cards */
          <div className="space-y-3">
          {TOOL_FEEDBACK_CATEGORIES.map((cat) => {
            const data = byCategory[cat];
            const config = CATEGORY_CONFIG[cat];
            const isExpanded = expandedCategory === cat;
            const hasItems = data.total > 0;

            return (
              <div
                key={cat}
                className={`rounded-xl overflow-hidden border-l-4 ${config.border} ${
                  isDark ? 'bg-gray-900' : 'bg-white'
                } shadow-sm`}
              >
                {/* Category Header - Clickable */}
                <button
                  onClick={() => hasItems && toggleCategory(cat)}
                  disabled={!hasItems}
                  className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${
                    hasItems ? 'hover:bg-gray-50 dark:hover:bg-gray-800' : 'opacity-50'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${config.bg}`}>
                    {config.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {cat}
                      </span>
                      {data.total > 0 && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                          {data.total}
                        </span>
                      )}
                    </div>
                    {data.total > 0 && (
                      <div className="flex items-center gap-3 mt-1">
                        {data.positive > 0 && (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <ThumbsUp size={12} /> {data.positive}
                          </span>
                        )}
                        {data.negative > 0 && (
                          <span className="flex items-center gap-1 text-xs text-red-500">
                            <ThumbsDown size={12} /> {data.negative}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {hasItems && (
                    isExpanded ? (
                      <ChevronDown size={20} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                    ) : (
                      <ChevronRight size={20} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                    )
                  )}
                </button>

                {/* Expanded Content */}
                {isExpanded && data.items.length > 0 && (
                  <div className={`px-4 pb-4 border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                    <div className="space-y-2 mt-3">
                      {data.items.map((item, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-gray-50'} flex gap-3`}
                        >
                          {/* Brand Badge */}
                          <span className={`px-2 py-0.5 h-fit text-xs font-bold text-white rounded ${BRAND_COLORS[item.brand]}`}>
                            {item.brand}
                          </span>
                          {/* Content */}
                          <div className="flex-1">
                            <p className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                              {item.content}
                            </p>
                            <span className={`text-xs mt-1 inline-block ${
                              item.sentiment === 'positive' ? 'text-green-500' :
                              item.sentiment === 'negative' ? 'text-red-500' : 'text-gray-400'
                            }`}>
                              {item.sentiment}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          </div>
        )}
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
                // Check if this date has any feedback
                const dateEntryIds = new Set(
                  feedbackEntries
                    .filter((e) => (!currentProjectId || e.projectId === currentProjectId) && e.createdAt.startsWith(date))
                    .map((e) => e.id)
                );
                const hasFeedback = feedbackSnippets.some((s) => dateEntryIds.has(s.feedbackId));
                const isSelected = date === selectedDate;

                return (
                  <button
                    key={date}
                    onClick={() => handleDateSelect(date)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl mb-2 ${
                      isSelected
                        ? 'bg-orange-100 dark:bg-orange-900/30 border-2 border-orange-500'
                        : isDark ? 'bg-gray-800' : 'bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Calendar size={18} className={isSelected ? 'text-orange-500' : isDark ? 'text-gray-400' : 'text-gray-500'} />
                      <div className="text-left">
                        <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {formatDateShort(date)}
                        </p>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          {parseDate(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    {hasFeedback && (
                      <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs rounded-full">
                        Has feedback
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
