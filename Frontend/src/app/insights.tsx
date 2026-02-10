import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import {
  Search,
  AlertCircle,
  TrendingUp,
  Wrench,
  DollarSign,
  ChevronRight,
  ChevronDown,
  X,
  Building2,
  ArrowLeft,
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  RefreshCw,
  FileText,
  AlertTriangle,
  Lightbulb,
  Eye,
  Shield,
  Zap,
  Sparkles,
  Send,
  BarChart3,
  Download,
  Check,
  Filter,
} from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/cn';
import { useDailyLogStore } from '@/lib/store';
import { getBackendId } from '@/lib/data-provider';
import {
  getInsights,
  getInsightsStats,
  updateInsight,
  findSimilarInsights,
  queryInsights,
  fetchInsightsExportPdf,
  queryKeys,
  Insight,
  InsightsStats,
  InsightSearchFilters,
  NLQueryResult,
} from '@/lib/api';

// Filter state type - now supports multiple selections
interface ActiveFilters {
  categories: string[];
  sourceTypes: string[];
  trades: string[];
  issueTypes: string[];
  systems: string[];
}

const EMPTY_FILTERS: ActiveFilters = {
  categories: [],
  sourceTypes: [],
  trades: [],
  issueTypes: [],
  systems: [],
};

// Multi-select filter dropdown component
function FilterDropdown({
  label,
  icon: Icon,
  options,
  selectedValues,
  onToggle,
  color = '#6B7280',
}: {
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  options: { value: string; label: string }[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  color?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hasSelection = selectedValues.length > 0;

  return (
    <View className="flex-1 mr-2 last:mr-0">
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setIsOpen(!isOpen);
        }}
        className={cn(
          'flex-row items-center justify-between px-3 py-2 rounded-lg border',
          hasSelection
            ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        )}
      >
        <View className="flex-row items-center flex-1">
          <Icon size={14} color={hasSelection ? '#F97316' : color} />
          <Text
            className={cn(
              'text-xs ml-1.5 flex-1',
              hasSelection
                ? 'text-orange-700 dark:text-orange-300 font-medium'
                : 'text-gray-600 dark:text-gray-400'
            )}
            numberOfLines={1}
          >
            {hasSelection ? `${label} (${selectedValues.length})` : label}
          </Text>
        </View>
        <ChevronDown
          size={14}
          color={hasSelection ? '#F97316' : '#9CA3AF'}
          style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
        />
      </Pressable>

      {isOpen && (
        <View className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg z-50 max-h-48">
          <ScrollView nestedScrollEnabled>
            {options.map((option) => {
              const isSelected = selectedValues.includes(option.value);
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onToggle(option.value);
                  }}
                  className={cn(
                    'flex-row items-center px-3 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0',
                    isSelected && 'bg-orange-50 dark:bg-orange-900/20'
                  )}
                >
                  <View
                    className={cn(
                      'w-4 h-4 rounded border mr-2 items-center justify-center',
                      isSelected
                        ? 'bg-orange-500 border-orange-500'
                        : 'border-gray-300 dark:border-gray-600'
                    )}
                  >
                    {isSelected && <Check size={10} color="white" />}
                  </View>
                  <Text
                    className={cn(
                      'text-sm flex-1',
                      isSelected
                        ? 'text-orange-700 dark:text-orange-300 font-medium'
                        : 'text-gray-700 dark:text-gray-300'
                    )}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const CATEGORY_CONFIG: Record<string, { color: string; icon: React.ComponentType<any>; label: string }> = {
  issue: { color: '#EF4444', icon: AlertCircle, label: 'Issue' },
  learning: { color: '#8B5CF6', icon: Lightbulb, label: 'Learning' },
  observation: { color: '#3B82F6', icon: Eye, label: 'Observation' },
  safety: { color: '#DC2626', icon: Shield, label: 'Safety' },
  quality: { color: '#F59E0B', icon: CheckCircle2, label: 'Quality' },
  cost_impact: { color: '#EF4444', icon: DollarSign, label: 'Cost Impact' },
  delay: { color: '#6366F1', icon: Clock, label: 'Delay' },
  rework: { color: '#F97316', icon: RefreshCw, label: 'Rework' },
};

// Event type display config (matches EventType from types.ts)
const EVENT_TYPE_CONFIG: Record<string, { color: string; icon: React.ComponentType<any>; label: string }> = {
  Delay: { color: '#EF4444', icon: Clock, label: 'Delay' },
  Quality: { color: '#F59E0B', icon: CheckCircle2, label: 'Quality' },
  Safety: { color: '#DC2626', icon: Shield, label: 'Safety' },
  Inspection: { color: '#8B5CF6', icon: Eye, label: 'Inspection' },
  Material: { color: '#3B82F6', icon: AlertCircle, label: 'Material' },
  Equipment: { color: '#6B7280', icon: Wrench, label: 'Equipment' },
  Coordination: { color: '#10B981', icon: AlertCircle, label: 'Coordination' },
  Other: { color: '#6B7280', icon: AlertCircle, label: 'Other' },
};

const SEVERITY_COLORS: Record<string, string> = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#DC2626',
};

const SOURCE_LABELS: Record<string, string> = {
  event: 'Event',
  pending_issue: 'Pending Issue',
  inspection_note: 'Inspection',
  additional_work: 'Additional Work',
  manual: 'Manual Entry',
};

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
  subtitle?: string;
}) {
  return (
    <View className="bg-white dark:bg-gray-800 rounded-xl p-4 flex-1 mr-2 last:mr-0">
      <View className="flex-row items-center mb-2">
        <View
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{ backgroundColor: color + '20' }}
        >
          <Icon size={16} color={color} />
        </View>
      </View>
      <Text className="text-2xl font-bold text-gray-900 dark:text-white">
        {value}
      </Text>
      <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        {title}
      </Text>
      {subtitle && (
        <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function InsightCard({
  insight,
  onPress,
  onToggleFollowUp,
  onToggleResolved,
}: {
  insight: Insight;
  onPress: () => void;
  onToggleFollowUp: (needsFollowUp: boolean) => void;
  onToggleResolved: (isResolved: boolean) => void;
}) {
  // Use eventType if available (from Event), otherwise fall back to category
  const displayType = (insight as any).eventType || insight.category;
  const displayLabel = (insight as any).customType || displayType;
  const typeConfig = EVENT_TYPE_CONFIG[displayType] || CATEGORY_CONFIG[insight.category] || CATEGORY_CONFIG.issue;
  const categoryConfig = typeConfig;
  const CategoryIcon = categoryConfig.icon;

  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          {/* Category & Severity badges */}
          <View className="flex-row items-center mb-2 flex-wrap">
            <View
              className="flex-row items-center px-2 py-0.5 rounded-full mr-2 mb-1"
              style={{ backgroundColor: categoryConfig.color + '20' }}
            >
              <CategoryIcon size={12} color={categoryConfig.color} />
              <Text
                className="text-xs font-medium ml-1"
                style={{ color: categoryConfig.color }}
              >
                {displayLabel || categoryConfig.label}
              </Text>
            </View>
            {insight.severity && (
              <View
                className="px-2 py-0.5 rounded-full mr-2 mb-1"
                style={{ backgroundColor: (SEVERITY_COLORS[insight.severity] || '#6B7280') + '20' }}
              >
                <Text
                  className="text-xs font-medium capitalize"
                  style={{ color: SEVERITY_COLORS[insight.severity] || '#6B7280' }}
                >
                  {insight.severity}
                </Text>
              </View>
            )}
            <View className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full mb-1">
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {SOURCE_LABELS[insight.sourceType] || insight.sourceType}
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text
            className="text-base font-semibold text-gray-900 dark:text-white mb-1"
            numberOfLines={2}
          >
            {insight.title}
          </Text>

          {/* Project */}
          {insight.project && (
            <View className="flex-row items-center mb-2">
              <Building2 size={12} color="#9CA3AF" />
              <Text className="text-xs text-gray-500 ml-1">
                {insight.project.name}
              </Text>
            </View>
          )}

          {/* Description preview */}
          {insight.description && (
            <Text
              className="text-sm text-gray-600 dark:text-gray-400 mb-2"
              numberOfLines={2}
            >
              {insight.description}
            </Text>
          )}

          {/* Tags */}
          <View className="flex-row flex-wrap">
            {insight.trades?.slice(0, 2).map((trade) => (
              <View key={trade} className="bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full mr-1 mb-1">
                <Text className="text-xs text-blue-700 dark:text-blue-300">{trade}</Text>
              </View>
            ))}
            {insight.costImpact && (
              <View className="bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full mr-1 mb-1">
                <Text className="text-xs text-red-700 dark:text-red-300">
                  ${insight.costImpact.toLocaleString()}
                </Text>
              </View>
            )}
            {insight.systems?.slice(0, 1).map((system) => (
              <View key={system} className="bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded-full mr-1 mb-1">
                <Text className="text-xs text-purple-700 dark:text-purple-300">{system}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="items-end">
          {/* Follow-up Toggle */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggleFollowUp(!insight.needsFollowUp);
            }}
            className={cn(
              'flex-row items-center px-2 py-1 rounded-full mb-2',
              insight.needsFollowUp
                ? 'bg-orange-100 dark:bg-orange-900/30'
                : 'bg-gray-100 dark:bg-gray-700'
            )}
          >
            {insight.needsFollowUp ? (
              <>
                <Bell size={14} color="#F97316" />
                <Text className="text-xs text-orange-600 ml-1">Follow-up</Text>
              </>
            ) : (
              <BellOff size={14} color="#9CA3AF" />
            )}
          </Pressable>

          {/* Resolved Toggle */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggleResolved(!insight.isResolved);
            }}
            className={cn(
              'flex-row items-center px-2 py-1 rounded-full mb-2',
              insight.isResolved
                ? 'bg-green-100 dark:bg-green-900/30'
                : 'bg-gray-100 dark:bg-gray-700'
            )}
          >
            {insight.isResolved ? (
              <>
                <CheckCircle2 size={14} color="#10B981" />
                <Text className="text-xs text-green-600 ml-1">Resolved</Text>
              </>
            ) : (
              <Clock size={14} color="#9CA3AF" />
            )}
          </Pressable>

          <ChevronRight size={20} color="#9CA3AF" />
        </View>
      </View>
    </Pressable>
  );
}

function TopItemsList({
  title,
  items,
  icon: Icon,
  color,
  onItemPress,
}: {
  title: string;
  items: { name: string; count: number }[];
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
  onItemPress?: (name: string) => void;
}) {
  if (!items || items.length === 0) return null;

  return (
    <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3">
      <View className="flex-row items-center mb-3">
        <Icon size={18} color={color} />
        <Text className="ml-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          {title}
        </Text>
      </View>
      {items.slice(0, 5).map((item) => (
        <Pressable
          key={item.name}
          onPress={() => {
            if (onItemPress) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onItemPress(item.name);
            }
          }}
          className="flex-row items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
        >
          <Text className="text-sm text-gray-600 dark:text-gray-400 flex-1" numberOfLines={1}>
            {item.name}
          </Text>
          <View className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full ml-2">
            <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {item.count}
            </Text>
          </View>
          {onItemPress && <ChevronRight size={14} color="#9CA3AF" className="ml-1" />}
        </Pressable>
      ))}
    </View>
  );
}

type TabType = 'dashboard' | 'all' | 'follow-ups' | 'search';

// Separate component to prevent re-render focus loss
const SearchInputBox = React.memo(function SearchInputBox({
  onSearch,
  onSetExample,
  isQuerying,
}: {
  onSearch: (query: string) => void;
  onSetExample: (example: string) => void;
  isQuerying: boolean;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = useCallback(() => {
    if (inputValue.trim()) {
      onSearch(inputValue.trim());
    }
  }, [inputValue, onSearch]);

  const handleClear = useCallback(() => {
    setInputValue('');
  }, []);

  const handleExamplePress = useCallback((example: string) => {
    setInputValue(example);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  return (
    <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-4">
      <View className="flex-row items-center mb-3">
        <Sparkles size={18} color="#F97316" />
        <Text className="ml-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Ask AI
        </Text>
      </View>
      <View className="flex-row items-center bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3">
        <TextInput
          value={inputValue}
          onChangeText={setInputValue}
          placeholder="e.g., 'items for next building inspection'"
          placeholderTextColor="#9CA3AF"
          style={{
            flex: 1,
            fontSize: 16,
            color: '#111827',
            outlineStyle: 'none',
          } as any}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={handleSubmit}
        />
        <Pressable
          onPress={handleClear}
          className="p-1 mr-2"
          style={{ opacity: inputValue.length > 0 ? 1 : 0 }}
          disabled={inputValue.length === 0}
        >
          <X size={20} color="#9CA3AF" />
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          disabled={isQuerying || !inputValue.trim()}
          className={cn(
            'p-2 rounded-full',
            inputValue.trim() ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
          )}
        >
          {isQuerying ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Send size={18} color="white" />
          )}
        </Pressable>
      </View>

      {/* Example queries */}
      {!isQuerying && (
        <View className="mt-3">
          <Text className="text-xs text-gray-400 mb-2">Try asking:</Text>
          <View className="flex-row flex-wrap">
            {[
              'open safety issues',
              'electrician punch list',
              'items needing follow-up',
              'HVAC issues this week',
            ].map((example) => (
              <Pressable
                key={example}
                onPress={() => handleExamplePress(example)}
                className="bg-gray-200 dark:bg-gray-600 px-3 py-1.5 rounded-full mr-2 mb-2"
              >
                <Text className="text-xs text-gray-600 dark:text-gray-300">{example}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
});

export default function InsightsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentProjectId = useDailyLogStore((s) => s.currentProjectId);
  const projects = useDailyLogStore((s) => s.projects);
  const currentProject = projects.find((p) => p.id === currentProjectId);

  // Get backend project ID for API calls
  const backendProjectId = currentProjectId
    ? (getBackendId('projects', currentProjectId) || currentProjectId)
    : undefined;

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isQuerying, setIsQuerying] = useState(false);
  const [nlQueryResult, setNlQueryResult] = useState<NLQueryResult | null>(null);
  const [nlError, setNlError] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(EMPTY_FILTERS);
  const [isExporting, setIsExporting] = useState(false);

  // Check if any filters are active
  const hasActiveFilters =
    activeFilters.categories.length > 0 ||
    activeFilters.sourceTypes.length > 0 ||
    activeFilters.trades.length > 0 ||
    activeFilters.issueTypes.length > 0 ||
    activeFilters.systems.length > 0;

  // Count total active filter selections
  const activeFilterCount =
    activeFilters.categories.length +
    activeFilters.sourceTypes.length +
    activeFilters.trades.length +
    activeFilters.issueTypes.length +
    activeFilters.systems.length;

  // Execute NL query - receives query from SearchInputBox
  const handleNLQuery = useCallback(async (query: string) => {
    if (!query.trim()) return;

    setIsQuerying(true);
    setNlError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await queryInsights(query, {
        projectId: backendProjectId,
        format: 'checklist'
      });
      setNlQueryResult(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('NL query failed:', error);
      setNlError(error.message || 'Query failed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsQuerying(false);
    }
  }, [backendProjectId]);

  // Fetch insights stats for current project
  const statsQuery = useQuery({
    queryKey: queryKeys.insightsStats(backendProjectId),
    queryFn: () => getInsightsStats({ projectId: backendProjectId }),
    staleTime: 30000,
    enabled: !!backendProjectId,
  });

  // Fetch all insights for current project with filters
  const insightsQuery = useQuery({
    queryKey: queryKeys.insights({ projectId: backendProjectId, ...activeFilters, limit: 100 }),
    queryFn: async () => {
      const filters: InsightSearchFilters = {
        projectId: backendProjectId,
        limit: 100,
      };

      // Apply active filters - categories and sourceTypes as comma-separated
      if (activeFilters.categories.length > 0) {
        filters.category = activeFilters.categories.join(',');
      }
      if (activeFilters.sourceTypes.length > 0) {
        filters.sourceType = activeFilters.sourceTypes.join(',');
      }
      // For trades, issueTypes, systems - pass as query text
      const queryParts = [
        ...activeFilters.trades,
        ...activeFilters.issueTypes,
        ...activeFilters.systems,
      ];
      if (queryParts.length > 0) {
        filters.query = queryParts.join(' ');
      }

      const result = await getInsights(filters);
      console.log('[insights] Fetched insights for project:', backendProjectId, 'filters:', activeFilters, 'count:', result?.length || 0);
      return result;
    },
    staleTime: 0, // Always fetch fresh data
    enabled: !!backendProjectId,
  });

  // Fetch follow-up insights for current project
  const followUpsQuery = useQuery({
    queryKey: queryKeys.insights({ projectId: backendProjectId, needsFollowUp: true, limit: 50 }),
    queryFn: () => getInsights({ projectId: backendProjectId, needsFollowUp: true, limit: 50 }),
    staleTime: 30000,
    enabled: !!backendProjectId,
  });

  // Handle follow-up toggle
  const handleToggleFollowUp = useCallback(async (insightId: string, needsFollowUp: boolean) => {
    try {
      await updateInsight(insightId, { needsFollowUp });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['insights'] });
    } catch (error) {
      console.error('Failed to update follow-up status:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [queryClient]);

  // Handle resolved toggle
  const handleToggleResolved = useCallback(async (insightId: string, isResolved: boolean) => {
    try {
      await updateInsight(insightId, { isResolved });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['insights'] });
    } catch (error) {
      console.error('Failed to update resolved status:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [queryClient]);

  // Filter handlers - toggle individual values in arrays
  const handleToggleFilter = useCallback((filterType: keyof ActiveFilters, value: string) => {
    setActiveFilters(prev => {
      const currentValues = prev[filterType] as string[];
      const isSelected = currentValues.includes(value);
      return {
        ...prev,
        [filterType]: isSelected
          ? currentValues.filter(v => v !== value)
          : [...currentValues, value],
      };
    });
  }, []);

  // Add a filter and switch to All tab (used from Dashboard clicks)
  const handleAddFilter = useCallback((filterType: keyof ActiveFilters, value: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveFilters(prev => {
      const currentValues = prev[filterType] as string[];
      if (currentValues.includes(value)) return prev;
      return {
        ...prev,
        [filterType]: [...currentValues, value],
      };
    });
    setActiveTab('all'); // Switch to All tab to see filtered results
  }, []);

  const handleClearFilterType = useCallback((filterType: keyof ActiveFilters) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFilters(prev => ({
      ...prev,
      [filterType]: [],
    }));
  }, []);

  const handleClearAllFilters = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveFilters(EMPTY_FILTERS);
  }, []);

  // Export PDF handler
  const handleExportPdf = useCallback(async () => {
    setIsExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const pdfUri = await fetchInsightsExportPdf({
        projectId: backendProjectId,
        category: activeFilters.categories.length > 0 ? activeFilters.categories.join(',') : undefined,
        sourceType: activeFilters.sourceTypes.length > 0 ? activeFilters.sourceTypes.join(',') : undefined,
        trade: activeFilters.trades.length > 0 ? activeFilters.trades.join(',') : undefined,
        issueType: activeFilters.issueTypes.length > 0 ? activeFilters.issueTypes.join(',') : undefined,
        system: activeFilters.systems.length > 0 ? activeFilters.systems.join(',') : undefined,
      });

      // Open PDF in new tab (web) or share (native)
      if (Platform.OS === 'web') {
        window.open(pdfUri, '_blank');
      } else {
        // On native, share the PDF file
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(pdfUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Export Insights PDF',
          });
        } else {
          Alert.alert('Error', 'Sharing is not available on this device');
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('Failed to export PDF:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to export PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [backendProjectId, activeFilters]);

  const isLoading = statsQuery.isLoading || insightsQuery.isLoading;
  const hasError = statsQuery.isError || insightsQuery.isError;

  const stats = statsQuery.data;
  const allInsights = insightsQuery.data || [];
  const followUps = followUpsQuery.data || [];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <Stack.Screen
        options={{
          title: currentProject ? `${currentProject.name} Insights` : 'Insights',
          presentation: 'modal',
          headerStyle: { backgroundColor: '#111' },
          headerTintColor: '#FFF',
          headerLeft: () => (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              className="p-2 -ml-2"
            >
              <ArrowLeft size={24} color="#FFF" />
            </Pressable>
          ),
        }}
      />

      {/* Tab Selector */}
      <View className="flex-row px-4 pt-4 pb-2">
        {(['dashboard', 'all', 'follow-ups', 'search'] as TabType[]).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(tab);
            }}
            className={cn(
              'flex-1 py-2 rounded-lg mr-2 last:mr-0',
              activeTab === tab
                ? 'bg-orange-500'
                : 'bg-white dark:bg-gray-800'
            )}
          >
            <Text
              className={cn(
                'text-center text-xs font-medium',
                activeTab === tab
                  ? 'text-white'
                  : 'text-gray-600 dark:text-gray-400'
              )}
            >
              {tab === 'dashboard' ? 'Dashboard' : tab === 'all' ? 'All' : tab === 'follow-ups' ? 'Follow-ups' : 'Search'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Error State */}
      {hasError && (
        <View className="mx-4 mt-4 bg-red-50 dark:bg-red-900/20 rounded-xl p-4">
          <View className="flex-row items-center">
            <AlertCircle size={20} color="#EF4444" />
            <Text className="ml-2 text-sm text-red-700 dark:text-red-300">
              Unable to load insights. Please check your connection and try again.
            </Text>
          </View>
        </View>
      )}

      {/* No Project Selected */}
      {!currentProjectId && (
        <View className="flex-1 items-center justify-center px-6">
          <Building2 size={48} color="#9CA3AF" />
          <Text className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-300 text-center">
            Select a Project
          </Text>
          <Text className="mt-2 text-sm text-gray-500 text-center">
            Please select a project from the Projects tab to view its insights.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/projects')}
            className="mt-4 bg-orange-500 py-3 px-6 rounded-xl"
          >
            <Text className="text-white font-semibold">Go to Projects</Text>
          </Pressable>
        </View>
      )}

      {/* Loading State */}
      {backendProjectId && isLoading && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
          <Text className="mt-3 text-gray-500">Loading insights...</Text>
        </View>
      )}

      {/* Content */}
      {backendProjectId && !isLoading && (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={statsQuery.isFetching || insightsQuery.isFetching}
              onRefresh={() => {
                statsQuery.refetch();
                insightsQuery.refetch();
                followUpsQuery.refetch();
              }}
            />
          }
        >
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && stats && (
            <Animated.View entering={FadeIn} className="px-4 pt-4">
              {/* Overview Cards */}
              <View className="flex-row mb-4">
                <StatCard
                  title="Total Insights"
                  value={stats.total}
                  icon={BarChart3}
                  color="#3B82F6"
                />
                <StatCard
                  title="Need Follow-up"
                  value={stats.needsFollowUp}
                  icon={Bell}
                  color="#F97316"
                />
              </View>

              <View className="flex-row mb-4">
                <StatCard
                  title="Unresolved"
                  value={stats.unresolved}
                  icon={AlertCircle}
                  color="#EF4444"
                />
                <StatCard
                  title="Total Cost Impact"
                  value={stats.totalCostImpact > 0 ? `$${(stats.totalCostImpact / 1000).toFixed(0)}k` : '$0'}
                  icon={DollarSign}
                  color="#10B981"
                  subtitle={`${stats.withCostImpact} with costs`}
                />
              </View>

              {/* Category Breakdown - Clickable */}
              {stats.byCategory.length > 0 && (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3">
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    By Category (tap to filter)
                  </Text>
                  <View className="flex-row flex-wrap">
                    {stats.byCategory.map((item) => {
                      const config = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.issue;
                      return (
                        <Pressable
                          key={item.category}
                          onPress={() => handleAddFilter('categories', item.category)}
                          className="flex-row items-center px-3 py-1.5 rounded-full mr-2 mb-2"
                          style={{ backgroundColor: config.color + '20' }}
                        >
                          <Text
                            className="text-xs font-medium"
                            style={{ color: config.color }}
                          >
                            {config.label}: {item.count}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Source Type Breakdown - Clickable */}
              {stats.bySourceType.length > 0 && (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3">
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    By Source (tap to filter)
                  </Text>
                  <View className="flex-row flex-wrap">
                    {stats.bySourceType.map((item) => (
                      <Pressable
                        key={item.sourceType}
                        onPress={() => handleAddFilter('sourceTypes', item.sourceType)}
                        className="flex-row items-center bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-full mr-2 mb-2"
                      >
                        <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
                          {SOURCE_LABELS[item.sourceType] || item.sourceType}: {item.count}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* Top Lists - Clickable */}
              <TopItemsList
                title="Top Trades"
                items={stats.topTrades}
                icon={Wrench}
                color="#3B82F6"
                onItemPress={(name) => handleAddFilter('trades', name)}
              />

              <TopItemsList
                title="Top Issue Types"
                items={stats.topIssueTypes}
                icon={AlertTriangle}
                color="#F59E0B"
                onItemPress={(name) => handleAddFilter('issueTypes', name)}
              />

              <TopItemsList
                title="Top Systems"
                items={stats.topSystems}
                icon={Zap}
                color="#8B5CF6"
                onItemPress={(name) => handleAddFilter('systems', name)}
              />

              {/* Empty State */}
              {stats.total === 0 && (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-6 items-center">
                  <Lightbulb size={48} color="#9CA3AF" />
                  <Text className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-300">
                    No Insights Yet
                  </Text>
                  <Text className="mt-2 text-sm text-gray-500 text-center">
                    Record events to automatically generate insights.{'\n'}
                    Insights help you track issues, patterns, and follow-ups.
                  </Text>
                </View>
              )}
            </Animated.View>
          )}

          {/* All Insights Tab */}
          {activeTab === 'all' && (
            <Animated.View entering={FadeIn} className="px-4 pt-4">
              {/* Header with title and export button */}
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center">
                  <Filter size={14} color="#6B7280" />
                  <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide ml-1">
                    {hasActiveFilters ? `Filtered (${activeFilterCount})` : 'All'} - {allInsights.length} items
                  </Text>
                </View>
                <Pressable
                  onPress={handleExportPdf}
                  disabled={isExporting || allInsights.length === 0}
                  className={cn(
                    'flex-row items-center px-3 py-1.5 rounded-full',
                    isExporting || allInsights.length === 0
                      ? 'bg-gray-200 dark:bg-gray-700'
                      : 'bg-orange-500'
                  )}
                >
                  {isExporting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Download size={14} color={allInsights.length === 0 ? '#9CA3AF' : 'white'} />
                      <Text className={cn(
                        'text-xs font-medium ml-1',
                        allInsights.length === 0 ? 'text-gray-500' : 'text-white'
                      )}>
                        Export PDF
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>

              {/* Filter Dropdowns Row */}
              {stats && (
                <View className="flex-row mb-3" style={{ zIndex: 100 }}>
                  <FilterDropdown
                    label="Category"
                    icon={AlertCircle}
                    color="#EF4444"
                    options={stats.byCategory.map(c => ({
                      value: c.category,
                      label: `${CATEGORY_CONFIG[c.category]?.label || c.category} (${c.count})`,
                    }))}
                    selectedValues={activeFilters.categories}
                    onToggle={(value) => handleToggleFilter('categories', value)}
                  />
                  <FilterDropdown
                    label="Source"
                    icon={FileText}
                    color="#3B82F6"
                    options={stats.bySourceType.map(s => ({
                      value: s.sourceType,
                      label: `${SOURCE_LABELS[s.sourceType] || s.sourceType} (${s.count})`,
                    }))}
                    selectedValues={activeFilters.sourceTypes}
                    onToggle={(value) => handleToggleFilter('sourceTypes', value)}
                  />
                </View>
              )}

              {stats && (
                <View className="flex-row mb-3" style={{ zIndex: 90 }}>
                  <FilterDropdown
                    label="Trade"
                    icon={Wrench}
                    color="#3B82F6"
                    options={stats.topTrades.map(t => ({
                      value: t.name,
                      label: `${t.name} (${t.count})`,
                    }))}
                    selectedValues={activeFilters.trades}
                    onToggle={(value) => handleToggleFilter('trades', value)}
                  />
                  <FilterDropdown
                    label="System"
                    icon={Zap}
                    color="#8B5CF6"
                    options={stats.topSystems.map(s => ({
                      value: s.name,
                      label: `${s.name} (${s.count})`,
                    }))}
                    selectedValues={activeFilters.systems}
                    onToggle={(value) => handleToggleFilter('systems', value)}
                  />
                </View>
              )}

              {/* Active Filters Summary & Clear */}
              {hasActiveFilters && (
                <View className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 mb-3">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-xs font-semibold text-orange-800 dark:text-orange-300">
                      Active Filters ({activeFilterCount})
                    </Text>
                    <Pressable onPress={handleClearAllFilters}>
                      <Text className="text-xs text-orange-600 dark:text-orange-400 underline">
                        Clear all
                      </Text>
                    </Pressable>
                  </View>
                  <View className="flex-row flex-wrap">
                    {activeFilters.categories.map((cat) => (
                      <Pressable
                        key={`cat-${cat}`}
                        onPress={() => handleToggleFilter('categories', cat)}
                        className="flex-row items-center bg-white dark:bg-gray-800 px-2 py-1 rounded-full mr-2 mb-1"
                      >
                        <Text className="text-xs text-gray-700 dark:text-gray-300 mr-1">
                          {CATEGORY_CONFIG[cat]?.label || cat}
                        </Text>
                        <X size={12} color="#9CA3AF" />
                      </Pressable>
                    ))}
                    {activeFilters.sourceTypes.map((src) => (
                      <Pressable
                        key={`src-${src}`}
                        onPress={() => handleToggleFilter('sourceTypes', src)}
                        className="flex-row items-center bg-white dark:bg-gray-800 px-2 py-1 rounded-full mr-2 mb-1"
                      >
                        <Text className="text-xs text-gray-700 dark:text-gray-300 mr-1">
                          {SOURCE_LABELS[src] || src}
                        </Text>
                        <X size={12} color="#9CA3AF" />
                      </Pressable>
                    ))}
                    {activeFilters.trades.map((trade) => (
                      <Pressable
                        key={`trade-${trade}`}
                        onPress={() => handleToggleFilter('trades', trade)}
                        className="flex-row items-center bg-white dark:bg-gray-800 px-2 py-1 rounded-full mr-2 mb-1"
                      >
                        <Text className="text-xs text-gray-700 dark:text-gray-300 mr-1">
                          {trade}
                        </Text>
                        <X size={12} color="#9CA3AF" />
                      </Pressable>
                    ))}
                    {activeFilters.issueTypes.map((issue) => (
                      <Pressable
                        key={`issue-${issue}`}
                        onPress={() => handleToggleFilter('issueTypes', issue)}
                        className="flex-row items-center bg-white dark:bg-gray-800 px-2 py-1 rounded-full mr-2 mb-1"
                      >
                        <Text className="text-xs text-gray-700 dark:text-gray-300 mr-1">
                          {issue}
                        </Text>
                        <X size={12} color="#9CA3AF" />
                      </Pressable>
                    ))}
                    {activeFilters.systems.map((system) => (
                      <Pressable
                        key={`system-${system}`}
                        onPress={() => handleToggleFilter('systems', system)}
                        className="flex-row items-center bg-white dark:bg-gray-800 px-2 py-1 rounded-full mr-2 mb-1"
                      >
                        <Text className="text-xs text-gray-700 dark:text-gray-300 mr-1">
                          {system}
                        </Text>
                        <X size={12} color="#9CA3AF" />
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {allInsights.length === 0 ? (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-6 items-center">
                  <FileText size={32} color="#9CA3AF" />
                  <Text className="mt-3 text-gray-500 text-center">
                    {hasActiveFilters
                      ? 'No insights match your filters.\nTry adjusting or clearing filters.'
                      : 'No insights indexed yet.\nTap the database icon to index your data.'}
                  </Text>
                  {hasActiveFilters && (
                    <Pressable
                      onPress={handleClearAllFilters}
                      className="mt-3 bg-orange-500 py-2 px-4 rounded-lg"
                    >
                      <Text className="text-white font-medium text-sm">Clear Filters</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                allInsights.map((insight, index) => (
                  <Animated.View key={insight.id} entering={FadeInDown.delay(index * 20)}>
                    <InsightCard
                      insight={insight}
                      onPress={() => router.push(`/insight-detail?id=${insight.id}`)}
                      onToggleFollowUp={(needsFollowUp) => handleToggleFollowUp(insight.id, needsFollowUp)}
                      onToggleResolved={(isResolved) => handleToggleResolved(insight.id, isResolved)}
                    />
                  </Animated.View>
                ))
              )}
            </Animated.View>
          )}

          {/* Follow-ups Tab */}
          {activeTab === 'follow-ups' && (
            <Animated.View entering={FadeIn} className="px-4 pt-4">
              <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Needs Follow-up ({followUps.length})
              </Text>

              {followUps.length === 0 ? (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-6 items-center">
                  <CheckCircle2 size={32} color="#10B981" />
                  <Text className="mt-3 text-gray-500 text-center">
                    No insights need follow-up right now.
                  </Text>
                </View>
              ) : (
                followUps.map((insight, index) => (
                  <Animated.View key={insight.id} entering={FadeInDown.delay(index * 30)}>
                    <InsightCard
                      insight={insight}
                      onPress={() => router.push(`/insight-detail?id=${insight.id}`)}
                      onToggleFollowUp={(needsFollowUp) => handleToggleFollowUp(insight.id, needsFollowUp)}
                      onToggleResolved={(isResolved) => handleToggleResolved(insight.id, isResolved)}
                    />
                  </Animated.View>
                ))
              )}
            </Animated.View>
          )}

          {/* AI Search Tab */}
          {activeTab === 'search' && (
            <View className="px-4 pt-4">
              {/* AI Query Input - Separate component to prevent focus loss */}
              <SearchInputBox
                onSearch={handleNLQuery}
                onSetExample={() => {}}
                isQuerying={isQuerying}
              />

              {/* Error State */}
              {nlError && (
                <View className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 mb-4">
                  <View className="flex-row items-center">
                    <AlertCircle size={18} color="#EF4444" />
                    <Text className="ml-2 text-sm text-red-700 dark:text-red-300">{nlError}</Text>
                  </View>
                </View>
              )}

              {/* Query Results */}
              {nlQueryResult && (
                <View>
                  {/* Summary Card */}
                  <View className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 mb-4">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-green-800 dark:text-green-300 mb-1">
                          {nlQueryResult.summary}
                        </Text>
                        {nlQueryResult.parsed && (
                          <View className="flex-row flex-wrap mt-2">
                            {nlQueryResult.parsed.category !== 'all' && (
                              <View className="bg-green-200 dark:bg-green-800 px-2 py-0.5 rounded-full mr-1 mb-1">
                                <Text className="text-xs text-green-800 dark:text-green-200">
                                  {nlQueryResult.parsed.category}
                                </Text>
                              </View>
                            )}
                            {nlQueryResult.parsed.status !== 'all' && (
                              <View className="bg-green-200 dark:bg-green-800 px-2 py-0.5 rounded-full mr-1 mb-1">
                                <Text className="text-xs text-green-800 dark:text-green-200">
                                  {nlQueryResult.parsed.status}
                                </Text>
                              </View>
                            )}
                            {nlQueryResult.parsed.trades?.map((trade) => (
                              <View key={trade} className="bg-blue-200 dark:bg-blue-800 px-2 py-0.5 rounded-full mr-1 mb-1">
                                <Text className="text-xs text-blue-800 dark:text-blue-200">{trade}</Text>
                              </View>
                            ))}
                            {nlQueryResult.parsed.systems?.map((system) => (
                              <View key={system} className="bg-purple-200 dark:bg-purple-800 px-2 py-0.5 rounded-full mr-1 mb-1">
                                <Text className="text-xs text-purple-800 dark:text-purple-200">{system}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Results List */}
                  {nlQueryResult.results.length > 0 ? (
                    <View>
                      <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Results ({nlQueryResult.results.length})
                      </Text>
                      {nlQueryResult.results.map((insight, index) => (
                        <Animated.View key={insight.id} entering={FadeInDown.delay(index * 20)}>
                          <InsightCard
                            insight={insight}
                            onPress={() => router.push(`/insight-detail?id=${insight.id}`)}
                            onToggleFollowUp={(needsFollowUp) => handleToggleFollowUp(insight.id, needsFollowUp)}
                            onToggleResolved={(isResolved) => handleToggleResolved(insight.id, isResolved)}
                          />
                        </Animated.View>
                      ))}
                    </View>
                  ) : (
                    <View className="bg-white dark:bg-gray-800 rounded-xl p-6 items-center">
                      <Search size={32} color="#9CA3AF" />
                      <Text className="mt-3 text-gray-500 text-center">
                        No insights match your query.{'\n'}Try different keywords or index more data.
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Empty State */}
              {!nlQueryResult && !isQuerying && !nlError && (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-6 items-center">
                  <Sparkles size={40} color="#F97316" />
                  <Text className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-300">
                    AI-Powered Search
                  </Text>
                  <Text className="mt-2 text-sm text-gray-500 text-center">
                    Ask questions in plain English like:{'\n'}
                    "create a list of all items for{'\n'}the next building inspection"
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
