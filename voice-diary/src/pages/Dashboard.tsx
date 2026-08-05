import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
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
  ChevronDown,
  ChevronUp,
  Edit3,
  Save,
  Loader2,
  Shield,
  Truck,
  CheckCircle2,
  ListTodo,
  Users,
  Package,
  Settings2,
} from 'lucide-react';
import { useColorScheme } from '../lib/use-color-scheme';
import { useVoiceDiaryStore } from '../lib/voice-diary-store';
import { useLanguageStore } from '../lib/use-language';
import type { VoiceDiaryCategory, FormTypeId, CategorizedSnippet } from '../lib/types';
import { FORM_TYPES } from '../lib/types';

const CATEGORY_ICONS: Record<VoiceDiaryCategory, React.ReactNode> = {
  'Safety': <Shield size={16} className="text-red-500" />,
  'Logistics': <Truck size={16} className="text-blue-500" />,
  'Process': <Settings2 size={16} className="text-purple-500" />,
  'Work Completed': <CheckCircle2 size={16} className="text-green-500" />,
  'Work To Be Done': <ListTodo size={16} className="text-amber-500" />,
  'Follow-up Items': <ArrowRight size={16} className="text-pink-500" />,
  'Issues': <AlertTriangle size={16} className="text-red-500" />,
  'Team': <Users size={16} className="text-cyan-500" />,
  'Materials': <Package size={16} className="text-stone-500" />,
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
  const [completedFollowUps, setCompletedFollowUps] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('voice-diary-completed-followups');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [editingFollowUp, setEditingFollowUp] = useState<{ id: string; content: string } | null>(null);
  const [isSavingFollowUp, setIsSavingFollowUp] = useState(false);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  const { language, t } = useLanguageStore();

  const {
    getSnippetsForCategory,
    getSnippetsForDate,
    getVoiceNotesForDate,
    getTodayDate,
    currentProjectId,
    projects,
    updateSnippet,
  } = useVoiceDiaryStore();

  const today = getTodayDate();
  const currentProject = projects.find((p) => p.id === currentProjectId);

  // Get data for the SELECTED date
  const selectedDateNotes = getVoiceNotesForDate(selectedDate, currentProjectId || undefined);
  const selectedDateSnippets = getSnippetsForDate(selectedDate, currentProjectId || undefined);

  const selectedSnippets = selectedCategory
    ? getSnippetsForCategory(selectedCategory, selectedDate, currentProjectId || undefined)
    : [];

  // Topic/trade keywords for detection
  const TOPIC_KEYWORDS: Record<string, { keywords: string[]; label: string; labelEs: string }> = {
    'electrical': {
      keywords: ['electrical', 'electric', 'wiring', 'wire', 'outlet', 'switch', 'panel', 'conduit', 'breaker', 'voltage', 'electrician'],
      label: 'Electrical Work',
      labelEs: 'Trabajo Eléctrico'
    },
    'structural': {
      keywords: ['structural', 'structure', 'beam', 'column', 'foundation', 'framing', 'frame', 'load-bearing', 'steel', 'rebar'],
      label: 'Structural Work',
      labelEs: 'Trabajo Estructural'
    },
    'concrete': {
      keywords: ['concrete', 'cement', 'pour', 'slab', 'footing', 'curing', 'rebar', 'formwork'],
      label: 'Concrete Work',
      labelEs: 'Trabajo de Concreto'
    },
    'plumbing': {
      keywords: ['plumbing', 'plumber', 'pipe', 'pipes', 'water', 'drain', 'sewer', 'valve', 'faucet', 'toilet', 'sink'],
      label: 'Plumbing Work',
      labelEs: 'Trabajo de Plomería'
    },
    'hvac': {
      keywords: ['hvac', 'heating', 'cooling', 'air conditioning', 'ac', 'duct', 'ventilation', 'furnace', 'thermostat'],
      label: 'HVAC Work',
      labelEs: 'Trabajo HVAC'
    },
    'drywall': {
      keywords: ['drywall', 'sheetrock', 'gypsum', 'taping', 'mudding', 'finishing'],
      label: 'Drywall Work',
      labelEs: 'Trabajo de Tablaroca'
    },
    'roofing': {
      keywords: ['roof', 'roofing', 'shingles', 'membrane', 'flashing', 'gutter'],
      label: 'Roofing Work',
      labelEs: 'Trabajo de Techado'
    },
    'painting': {
      keywords: ['paint', 'painting', 'primer', 'coat', 'spray', 'brush', 'roller'],
      label: 'Painting Work',
      labelEs: 'Trabajo de Pintura'
    },
    'flooring': {
      keywords: ['floor', 'flooring', 'tile', 'tiles', 'carpet', 'hardwood', 'vinyl', 'laminate'],
      label: 'Flooring Work',
      labelEs: 'Trabajo de Pisos'
    },
    'delivery': {
      keywords: ['delivery', 'delivered', 'truck', 'shipment', 'arrived', 'arriving', 'pickup', 'drop-off'],
      label: 'Deliveries',
      labelEs: 'Entregas'
    },
    'inspection': {
      keywords: ['inspection', 'inspector', 'inspected', 'code', 'permit', 'compliance', 'passed', 'failed'],
      label: 'Inspections',
      labelEs: 'Inspecciones'
    },
    'weather': {
      keywords: ['weather', 'rain', 'storm', 'wind', 'cold', 'hot', 'snow', 'delay'],
      label: 'Weather Impact',
      labelEs: 'Impacto del Clima'
    },
    'equipment': {
      keywords: ['equipment', 'crane', 'excavator', 'loader', 'forklift', 'scaffold', 'scaffolding', 'tool', 'machine'],
      label: 'Equipment',
      labelEs: 'Equipo'
    },
    'personnel': {
      keywords: ['personnel', 'crew', 'workers', 'team', 'manpower', 'staff', 'guys', 'men', 'people', 'trabajadores'],
      label: 'Personnel',
      labelEs: 'Personal'
    },
    'safety': {
      keywords: ['safety', 'hazard', 'ppe', 'incident', 'accident', 'injury', 'osha', 'caution', 'warning'],
      label: 'Safety',
      labelEs: 'Seguridad'
    },
  };

  // Detect topic from snippet content
  function detectTopic(content: string): string {
    const lower = content.toLowerCase();
    for (const [topicKey, { keywords }] of Object.entries(TOPIC_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          return topicKey;
        }
      }
    }
    return 'general';
  }

  // Group snippets by detected topic - each snippet can only belong to one group
  const topicGroups = useMemo(() => {
    const groups: Array<{
      topicKey: string;
      title: string;
      primaryCategory: VoiceDiaryCategory;
      snippets: CategorizedSnippet[];
      time: string;
    }> = [];

    // Get snippets for selected date, excluding Follow-up Items
    const snippetsForDate = selectedDateSnippets.filter(s => s.category !== 'Follow-up Items');

    // Group snippets by detected topic
    const topicMap = new Map<string, CategorizedSnippet[]>();

    for (const snippet of snippetsForDate) {
      const topic = detectTopic(snippet.content);
      if (!topicMap.has(topic)) {
        topicMap.set(topic, []);
      }
      topicMap.get(topic)!.push(snippet);
    }

    // Convert map to array of groups
    for (const [topicKey, snippets] of topicMap) {
      if (snippets.length === 0) continue;

      // Sort snippets by time
      snippets.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      // Determine primary category (most common)
      const categoryCount: Record<string, number> = {};
      for (const s of snippets) {
        categoryCount[s.category] = (categoryCount[s.category] || 0) + 1;
      }
      const primaryCategory = Object.entries(categoryCount)
        .sort((a, b) => b[1] - a[1])[0]?.[0] as VoiceDiaryCategory || snippets[0].category;

      // Get title based on topic
      const topicInfo = TOPIC_KEYWORDS[topicKey];
      const title = topicInfo
        ? (language === 'es' ? topicInfo.labelEs : topicInfo.label)
        : (language === 'es' ? 'General' : 'General Notes');

      // Get earliest time
      const earliestTime = new Date(snippets[0].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      groups.push({
        topicKey,
        title,
        primaryCategory,
        snippets,
        time: earliestTime,
      });
    }

    // Sort groups by number of snippets (most first) then alphabetically
    groups.sort((a, b) => {
      if (b.snippets.length !== a.snippets.length) {
        return b.snippets.length - a.snippets.length;
      }
      return a.title.localeCompare(b.title);
    });

    return groups;
  }, [selectedDateSnippets, language]);

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

  const toggleFollowUpComplete = (snippetId: string) => {
    const newSet = new Set(completedFollowUps);
    if (newSet.has(snippetId)) {
      newSet.delete(snippetId);
    } else {
      newSet.add(snippetId);
    }
    setCompletedFollowUps(newSet);
    localStorage.setItem('voice-diary-completed-followups', JSON.stringify([...newSet]));
  };

  // Extract due date from snippet content
  const extractDueDate = (content: string): string | null => {
    const lower = content.toLowerCase();
    // Check for specific date mentions
    const datePatterns = [
      /(?:by|before|due|until|deadline)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i,
      /(?:by|before|due)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /(?:by|before|due)\s+(tomorrow|next week|end of (?:week|day))/i,
    ];
    for (const pattern of datePatterns) {
      const match = content.match(pattern);
      if (match) return match[1];
    }
    // Check for urgency words
    if (lower.includes('asap') || lower.includes('urgent') || lower.includes('immediately')) return 'ASAP';
    if (lower.includes('tomorrow')) return 'Tomorrow';
    if (lower.includes('this week') || lower.includes('end of week')) return 'This Week';
    if (lower.includes('next week')) return 'Next Week';
    return null;
  };

  // Get follow-up items (from Follow-up Items category + items with due dates)
  const followUpItems = useMemo(() => {
    const items: Array<{
      id: string;
      content: string;
      dueDate: string | null;
      completed: boolean;
      createdAt: string;
    }> = [];

    // Get Follow-up Items category snippets
    const followUpSnippets = getSnippetsForCategory('Follow-up Items', selectedDate, currentProjectId || undefined);

    // Also check Work To Be Done for items with due dates
    const todoSnippets = getSnippetsForCategory('Work To Be Done', selectedDate, currentProjectId || undefined);

    const allRelevant = [...followUpSnippets, ...todoSnippets.filter(s => {
      const lower = s.content.toLowerCase();
      return lower.includes('due') || lower.includes('deadline') || lower.includes('by ') ||
             lower.includes('asap') || lower.includes('urgent') || lower.includes('tomorrow');
    })];

    // Dedupe by id
    const seen = new Set<string>();
    for (const snippet of allRelevant) {
      if (seen.has(snippet.id)) continue;
      seen.add(snippet.id);

      items.push({
        id: snippet.id,
        content: snippet.content,
        dueDate: extractDueDate(snippet.content),
        completed: completedFollowUps.has(snippet.id),
        createdAt: snippet.createdAt,
      });
    }

    return items;
  }, [selectedDate, currentProjectId, getSnippetsForCategory, completedFollowUps]);

  // Handle saving follow-up edit
  const handleSaveFollowUp = () => {
    if (!editingFollowUp) return;
    setIsSavingFollowUp(true);
    updateSnippet(editingFollowUp.id, editingFollowUp.content);
    setTimeout(() => {
      setIsSavingFollowUp(false);
      setEditingFollowUp(null);
    }, 300);
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

  // Helper function for localized date format
  const formatDateDisplayLocalized = (dateStr: string): string => {
    const date = parseDate(dateStr);
    return date.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateShortLocalized = (dateStr: string): string => {
    const todayStr = formatDateISO(new Date());
    if (dateStr === todayStr) return t('common.today');

    const yesterdayStr = formatDateISO(addDays(new Date(), -1));
    if (dateStr === yesterdayStr) return t('common.yesterday');

    const date = parseDate(dateStr);
    return date.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' });
  };

  if (!currentProjectId) {
    return (
      <div className={`h-full flex flex-col items-center justify-center p-10 ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
        <Building2 size={64} className={isDark ? 'text-gray-700' : 'text-gray-300'} />
        <h2 className={`mt-5 text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {t('dashboard.noProject')}
        </h2>
        <p className={`mt-2 text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {t('dashboard.selectOnRecord')}
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
                {formatDateDisplayLocalized(selectedDate)}
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
            {t('dashboard.tapDateToSelect')}
          </p>
        </div>

        {/* Daily Summary - Grouped by Topic */}
        <div className={`rounded-xl p-4 mb-4 ${isDark ? 'bg-gray-900' : 'bg-white'} shadow-sm`}>
          <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            {t('dashboard.dailySummary')}
          </h3>

          {selectedDateNotes.length === 0 ? (
            <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {t('dashboard.noNotes')} {formatDateShortLocalized(selectedDate)}.
            </p>
          ) : topicGroups.length === 0 ? (
            <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {selectedDateNotes.length} {t('dashboard.notesRecorded')}
            </p>
          ) : (
            <div className="space-y-2">
              {topicGroups.map((topic) => (
                <div key={topic.topicKey}>
                  {/* Topic Header - Clickable */}
                  <button
                    onClick={() => setExpandedTopic(expandedTopic === topic.topicKey ? null : topic.topicKey)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      CATEGORY_COLORS[topic.primaryCategory]
                    } ${expandedTopic === topic.topicKey ? 'ring-2 ring-primary-500' : ''}`}
                  >
                    {CATEGORY_ICONS[topic.primaryCategory]}
                    <div className="flex-1 text-left">
                      <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {topic.title}
                      </p>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {topic.snippets.length} {topic.snippets.length !== 1 ? t('dashboard.items') : t('dashboard.item')} · {topic.time}
                      </p>
                    </div>
                    {expandedTopic === topic.topicKey ? (
                      <ChevronUp size={18} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                    ) : (
                      <ChevronDown size={18} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                    )}
                  </button>

                  {/* Expanded Content */}
                  {expandedTopic === topic.topicKey && (
                    <div className={`mt-2 ml-4 pl-4 border-l-2 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                      {topic.snippets.map((snippet) => (
                        <div key={snippet.id} className="py-2">
                          <div className="flex items-start gap-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded ${CATEGORY_COLORS[snippet.category]}`}>
                              {t(`category.${snippet.category.toLowerCase().replace(/\s+/g, '')}`)}
                            </span>
                          </div>
                          <p className={`text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                            {snippet.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Follow-up Items */}
        <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
          {t('dashboard.followUpItems')} ({followUpItems.length} {t('dashboard.on')} {formatDateShortLocalized(selectedDate)})
        </h3>
        <div className={`rounded-xl overflow-hidden mb-5 ${isDark ? 'bg-gray-900' : 'bg-white'} shadow-sm`}>
          {followUpItems.length === 0 ? (
            <div className="p-6 text-center">
              <ArrowRight size={32} className={`mx-auto mb-2 ${isDark ? 'text-gray-700' : 'text-gray-300'}`} />
              <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                {t('dashboard.noFollowUps')} {formatDateShortLocalized(selectedDate)}
              </p>
              <p className={`text-xs mt-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                {t('dashboard.followUpHint')}
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              {followUpItems.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl transition-all ${
                    item.completed
                      ? 'opacity-50 ' + (isDark ? 'bg-gray-800' : 'bg-gray-100')
                      : isDark ? 'bg-gray-800' : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleFollowUpComplete(item.id)}
                      className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center transition-colors mt-0.5 ${
                        item.completed
                          ? 'bg-green-500'
                          : isDark ? 'bg-gray-700 border border-gray-600' : 'bg-white border border-gray-300'
                      }`}
                    >
                      {item.completed && <Check size={14} className="text-white" />}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p
                        onClick={() => setEditingFollowUp({ id: item.id, content: item.content })}
                        className={`text-sm leading-relaxed cursor-pointer hover:underline ${
                          item.completed ? 'line-through' : ''
                        } ${isDark ? 'text-gray-200' : 'text-gray-700'}`}
                      >
                        {item.content}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        {item.dueDate && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            item.dueDate === 'ASAP'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-semibold'
                              : item.dueDate === 'Tomorrow'
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium'
                              : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'
                          }`}>
                            {item.dueDate}
                          </span>
                        )}
                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    {/* Edit button */}
                    <button
                      onClick={() => setEditingFollowUp({ id: item.id, content: item.content })}
                      className={`p-2 rounded-lg flex-shrink-0 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                    >
                      <Edit3 size={16} className="text-primary-600" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Forms Section */}
        <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
          {t('dashboard.createForm')}
        </h3>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {FORM_TYPES.map((formType) => {
            // Map form type IDs to translation keys
            const formNameKey = `template.${formType.id.replace(/-/g, '')}`;
            const translatedName = t(formNameKey) !== formNameKey ? t(formNameKey) : formType.name;

            return (
              <button
                key={formType.id}
                onClick={() => setSelectedFormType(formType.id)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-colors ${
                  isDark ? 'bg-gray-900 hover:bg-gray-800' : 'bg-white hover:bg-gray-50'
                } shadow-sm`}
              >
                {FORM_ICONS[formType.icon]}
                <span className={`text-xs font-semibold text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {translatedName}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDatePicker(false)} />
          <div className={`relative w-full sm:max-w-md max-h-[70vh] rounded-t-2xl sm:rounded-2xl ${isDark ? 'bg-gray-900' : 'bg-white'} safe-area-bottom overflow-hidden`}>
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
              <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t('dashboard.selectDate')}</h2>
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
                          {formatDateShortLocalized(date)}
                        </p>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          {parseDate(date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    {hasNotes && (
                      <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs rounded-full">
                        {t('dashboard.hasNotes')}
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
                <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {t(`category.${selectedCategory.toLowerCase().replace(/\s+/g, '')}`)}
                </h2>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {selectedSnippets.length} {selectedSnippets.length !== 1 ? t('dashboard.items') : t('dashboard.item')} {t('dashboard.on')} {formatDateShortLocalized(selectedDate)}
                </p>
              </div>
              <button onClick={() => setSelectedCategory(null)} className="p-2">
                <X size={24} className={isDark ? 'text-white' : 'text-gray-900'} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              {selectedSnippets.length === 0 ? (
                <p className={`text-center py-10 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  {t('dashboard.noFollowUps')} {formatDateShortLocalized(selectedDate)}
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
                  {(() => {
                    const formNameKey = `template.${selectedFormType.replace(/-/g, '')}`;
                    const formType = FORM_TYPES.find(f => f.id === selectedFormType);
                    return t(formNameKey) !== formNameKey ? t(formNameKey) : formType?.name;
                  })()}
                </h2>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {t('form.selectEntries')} {formatDateShortLocalized(selectedDate)}
                </p>
              </div>
              <button onClick={() => { setSelectedFormType(null); setSelectedSnippetIds(new Set()); }} className="p-2">
                <X size={24} className={isDark ? 'text-white' : 'text-gray-900'} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {selectedDateSnippets.length === 0 ? (
                <p className={`text-center py-10 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  {t('form.noEntries')} {formatDateShortLocalized(selectedDate)}. {t('form.recordFirst')}
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
                          {t(`category.${snippet.category.toLowerCase().replace(/\s+/g, '')}`)}
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
                    ? `${t('form.createForm')} (${selectedSnippetIds.size} ${t('form.entries')})`
                    : t('form.selectToCreate')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Follow-up Modal */}
      {editingFollowUp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingFollowUp(null)} />
          <div className={`relative w-full max-w-lg rounded-2xl ${isDark ? 'bg-gray-900' : 'bg-white'} shadow-xl`}>
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
              <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {t('dashboard.editFollowUp')}
              </h2>
              <button onClick={() => setEditingFollowUp(null)} className="p-2">
                <X size={24} className={isDark ? 'text-white' : 'text-gray-900'} />
              </button>
            </div>
            <div className="p-4">
              <textarea
                value={editingFollowUp.content}
                onChange={(e) => setEditingFollowUp({ ...editingFollowUp, content: e.target.value })}
                rows={6}
                autoFocus
                className={`w-full p-4 rounded-xl text-base leading-relaxed resize-none ${
                  isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                }`}
                placeholder={t('dashboard.enterFollowUp')}
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setEditingFollowUp(null)}
                  disabled={isSavingFollowUp}
                  className={`flex-1 py-3 rounded-xl font-medium ${
                    isDark ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-700'
                  } disabled:opacity-50`}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSaveFollowUp}
                  disabled={isSavingFollowUp || !editingFollowUp.content.trim()}
                  className="flex-1 py-3 rounded-xl font-medium bg-primary-600 text-white flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSavingFollowUp ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {t('dashboard.saving')}
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      {t('common.save')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
