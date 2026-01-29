import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import {
  Search,
  AlertCircle,
  TrendingUp,
  Wrench,
  DollarSign,
  ChevronRight,
  X,
  Building2,
  ArrowLeft,
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
  Filter,
  BarChart3,
  FileText,
  AlertTriangle,
  Lightbulb,
  Eye,
  Shield,
  Zap,
  Sparkles,
  Send,
  Copy,
  Printer,
} from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/cn';
import {
  getInsights,
  getInsightsStats,
  updateInsight,
  indexAllInsights,
  findSimilarInsights,
  queryInsights,
  queryKeys,
  Insight,
  InsightsStats,
  InsightSearchFilters,
  NLQueryResult,
} from '@/lib/api';

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
  const categoryConfig = CATEGORY_CONFIG[insight.category] || CATEGORY_CONFIG.issue;
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
                {categoryConfig.label}
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
}: {
  title: string;
  items: { name: string; count: number }[];
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
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
        <View
          key={item.name}
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
        </View>
      ))}
    </View>
  );
}

type TabType = 'dashboard' | 'all' | 'follow-ups' | 'search';

export default function InsightsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [isIndexing, setIsIndexing] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const [nlQueryResult, setNlQueryResult] = useState<NLQueryResult | null>(null);
  const [nlError, setNlError] = useState<string | null>(null);

  // Execute NL query
  const handleNLQuery = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsQuerying(true);
    setNlError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await queryInsights(searchQuery, { format: 'checklist' });
      setNlQueryResult(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('NL query failed:', error);
      setNlError(error.message || 'Query failed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsQuerying(false);
    }
  }, [searchQuery]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setNlQueryResult(null);
    setNlError(null);
  }, []);

  // Fetch insights stats
  const statsQuery = useQuery({
    queryKey: queryKeys.insightsStats(),
    queryFn: () => getInsightsStats(),
    staleTime: 30000,
  });

  // Fetch all insights
  const insightsQuery = useQuery({
    queryKey: queryKeys.insights({ limit: 100 }),
    queryFn: () => getInsights({ limit: 100 }),
    staleTime: 30000,
  });

  // Fetch follow-up insights
  const followUpsQuery = useQuery({
    queryKey: queryKeys.insights({ needsFollowUp: true, limit: 50 }),
    queryFn: () => getInsights({ needsFollowUp: true, limit: 50 }),
    staleTime: 30000,
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

  // Handle index all
  const handleIndexAll = useCallback(async () => {
    setIsIndexing(true);
    try {
      const result = await indexAllInsights(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      alert(`Indexed: ${result.results.events.indexed} events, ${result.results.pendingIssues.indexed} issues, ${result.results.inspectionNotes.indexed} inspections`);
    } catch (error) {
      console.error('Failed to index insights:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsIndexing(false);
    }
  }, [queryClient]);

  const isLoading = statsQuery.isLoading || insightsQuery.isLoading;
  const hasError = statsQuery.isError || insightsQuery.isError;

  const stats = statsQuery.data;
  const allInsights = insightsQuery.data || [];
  const followUps = followUpsQuery.data || [];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <Stack.Screen
        options={{
          title: 'Insights Dashboard',
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
          headerRight: () => (
            <Pressable
              onPress={handleIndexAll}
              disabled={isIndexing}
              className="p-2"
            >
              {isIndexing ? (
                <ActivityIndicator size="small" color="#F97316" />
              ) : (
                <Database size={22} color="#F97316" />
              )}
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
              Unable to load insights. Make sure the backend is running and you've indexed data.
            </Text>
          </View>
          <Pressable
            onPress={handleIndexAll}
            className="mt-3 bg-red-100 dark:bg-red-800 py-2 px-4 rounded-lg self-start"
          >
            <Text className="text-sm font-medium text-red-700 dark:text-red-300">
              Index Data Now
            </Text>
          </Pressable>
        </View>
      )}

      {/* Loading State */}
      {isLoading && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
          <Text className="mt-3 text-gray-500">Loading insights...</Text>
        </View>
      )}

      {/* Content */}
      {!isLoading && (
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

              {/* Category Breakdown */}
              {stats.byCategory.length > 0 && (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3">
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    By Category
                  </Text>
                  <View className="flex-row flex-wrap">
                    {stats.byCategory.map((item) => {
                      const config = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.issue;
                      return (
                        <View
                          key={item.category}
                          className="flex-row items-center px-3 py-1.5 rounded-full mr-2 mb-2"
                          style={{ backgroundColor: config.color + '20' }}
                        >
                          <Text
                            className="text-xs font-medium"
                            style={{ color: config.color }}
                          >
                            {config.label}: {item.count}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Source Type Breakdown */}
              {stats.bySourceType.length > 0 && (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3">
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    By Source
                  </Text>
                  <View className="flex-row flex-wrap">
                    {stats.bySourceType.map((item) => (
                      <View
                        key={item.sourceType}
                        className="flex-row items-center bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-full mr-2 mb-2"
                      >
                        <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
                          {SOURCE_LABELS[item.sourceType] || item.sourceType}: {item.count}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Top Lists */}
              <TopItemsList
                title="Top Trades"
                items={stats.topTrades}
                icon={Wrench}
                color="#3B82F6"
              />

              <TopItemsList
                title="Top Issue Types"
                items={stats.topIssueTypes}
                icon={AlertTriangle}
                color="#F59E0B"
              />

              <TopItemsList
                title="Top Systems"
                items={stats.topSystems}
                icon={Zap}
                color="#8B5CF6"
              />

              {/* Empty State */}
              {stats.total === 0 && (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-6 items-center">
                  <Database size={48} color="#9CA3AF" />
                  <Text className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-300">
                    No Insights Yet
                  </Text>
                  <Text className="mt-2 text-sm text-gray-500 text-center">
                    Index your events and daily log data to see insights and patterns.
                  </Text>
                  <Pressable
                    onPress={handleIndexAll}
                    disabled={isIndexing}
                    className="mt-4 bg-orange-500 py-3 px-6 rounded-xl"
                  >
                    <Text className="text-white font-semibold">
                      {isIndexing ? 'Indexing...' : 'Index Data Now'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </Animated.View>
          )}

          {/* All Insights Tab */}
          {activeTab === 'all' && (
            <Animated.View entering={FadeIn} className="px-4 pt-4">
              <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                All Insights ({allInsights.length})
              </Text>

              {allInsights.length === 0 ? (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-6 items-center">
                  <FileText size={32} color="#9CA3AF" />
                  <Text className="mt-3 text-gray-500 text-center">
                    No insights indexed yet.{'\n'}Tap the database icon to index your data.
                  </Text>
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
            <Animated.View entering={FadeIn} className="px-4 pt-4">
              {/* AI Query Input */}
              <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-4">
                <View className="flex-row items-center mb-3">
                  <Sparkles size={18} color="#F97316" />
                  <Text className="ml-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Ask AI
                  </Text>
                </View>
                <View className="flex-row items-center bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3">
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="e.g., 'items for next building inspection'"
                    placeholderTextColor="#9CA3AF"
                    className="flex-1 text-gray-900 dark:text-white text-base"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={handleNLQuery}
                    multiline={false}
                  />
                  {searchQuery.length > 0 && (
                    <Pressable onPress={clearSearch} className="p-1 mr-2">
                      <X size={20} color="#9CA3AF" />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={handleNLQuery}
                    disabled={isQuerying || !searchQuery.trim()}
                    className={cn(
                      'p-2 rounded-full',
                      searchQuery.trim() ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
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
                {!nlQueryResult && !isQuerying && (
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
                          onPress={() => {
                            setSearchQuery(example);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                          className="bg-gray-200 dark:bg-gray-600 px-3 py-1.5 rounded-full mr-2 mb-2"
                        >
                          <Text className="text-xs text-gray-600 dark:text-gray-300">{example}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </View>

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
            </Animated.View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
