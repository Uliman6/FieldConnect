import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import {
  Search,
  AlertCircle,
  TrendingUp,
  Users,
  Wrench,
  MapPin,
  DollarSign,
  ChevronRight,
  X,
  Filter,
  Building2,
  Clock,
  ArrowLeft,
  Bell,
  BellOff,
  List,
} from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/cn';
import {
  getFollowUpEvents,
  getIndexStats,
  searchEventsByKeywords,
  getEvents,
  updateEventFollowUp,
  queryKeys,
  FollowUpEvent,
  IndexStats,
  IndexedEvent,
  SearchFilters,
} from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

const ISSUE_TYPE_COLORS: Record<string, string> = {
  cost_impact: '#EF4444',
  code_violation: '#DC2626',
  rework: '#F59E0B',
  delay: '#8B5CF6',
  follow_up: '#3B82F6',
  safety: '#DC2626',
  quality: '#F59E0B',
};

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  onPress,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="bg-white dark:bg-gray-800 rounded-xl p-4 flex-1 mr-2 last:mr-0"
    >
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
    </Pressable>
  );
}

function FollowUpCard({
  event,
  onPress,
}: {
  event: FollowUpEvent;
  onPress: () => void;
}) {
  const issueTypes = event.issueTypes || [];

  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3 border-l-4 border-orange-500"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          <Text
            className="text-base font-semibold text-gray-900 dark:text-white mb-1"
            numberOfLines={2}
          >
            {event.title || 'Untitled Event'}
          </Text>

          {event.project && (
            <View className="flex-row items-center mb-2">
              <Building2 size={12} color="#9CA3AF" />
              <Text className="text-xs text-gray-500 ml-1">
                {event.project.name}
              </Text>
            </View>
          )}

          {event.followUpReason && (
            <Text
              className="text-sm text-gray-600 dark:text-gray-400 mb-2"
              numberOfLines={2}
            >
              {event.followUpReason}
            </Text>
          )}

          <View className="flex-row flex-wrap">
            {issueTypes.map((type) => (
              <View
                key={type}
                className="px-2 py-0.5 rounded-full mr-1 mb-1"
                style={{
                  backgroundColor: (ISSUE_TYPE_COLORS[type] || '#6B7280') + '20',
                }}
              >
                <Text
                  className="text-xs font-medium"
                  style={{ color: ISSUE_TYPE_COLORS[type] || '#6B7280' }}
                >
                  {type.replace('_', ' ')}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className="items-end">
          {event.costImpact && (
            <View className="flex-row items-center mb-2">
              <DollarSign size={14} color="#EF4444" />
              <Text className="text-sm font-semibold text-red-500">
                {event.costImpact.toLocaleString()}
              </Text>
            </View>
          )}
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
      {items.slice(0, 5).map((item, index) => (
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

function SearchResultCard({
  event,
  onPress,
}: {
  event: IndexedEvent;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3"
    >
      <Text
        className="text-base font-semibold text-gray-900 dark:text-white mb-1"
        numberOfLines={1}
      >
        {event.title || 'Untitled Event'}
      </Text>

      {event.project && (
        <View className="flex-row items-center mb-2">
          <Building2 size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 ml-1">{event.project.name}</Text>
        </View>
      )}

      {event.transcriptText && (
        <Text
          className="text-sm text-gray-600 dark:text-gray-400"
          numberOfLines={2}
        >
          {event.transcriptText}
        </Text>
      )}

      {event.index && (
        <View className="flex-row flex-wrap mt-2">
          {event.index.inspectors?.slice(0, 2).map((name) => (
            <View key={name} className="bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded-full mr-1 mb-1">
              <Text className="text-xs text-purple-700 dark:text-purple-300">{name}</Text>
            </View>
          ))}
          {event.index.trades?.slice(0, 2).map((trade) => (
            <View key={trade} className="bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full mr-1 mb-1">
              <Text className="text-xs text-blue-700 dark:text-blue-300">{trade}</Text>
            </View>
          ))}
          {event.index.ahj?.slice(0, 1).map((ahj) => (
            <View key={ahj} className="bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full mr-1 mb-1">
              <Text className="text-xs text-green-700 dark:text-green-300">{ahj}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

type TabType = 'all-events' | 'follow-ups' | 'search' | 'stats';

function AllEventsCard({
  event,
  onPress,
  onToggleFollowUp,
}: {
  event: IndexedEvent;
  onPress: () => void;
  onToggleFollowUp: (needsFollowUp: boolean) => void;
}) {
  const needsFollowUp = event.index?.needsFollowUp ?? false;

  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          <Text
            className="text-base font-semibold text-gray-900 dark:text-white mb-1"
            numberOfLines={2}
          >
            {event.title || 'Untitled Event'}
          </Text>

          {event.project && (
            <View className="flex-row items-center mb-2">
              <Building2 size={12} color="#9CA3AF" />
              <Text className="text-xs text-gray-500 ml-1">
                {event.project.name}
              </Text>
            </View>
          )}

          {event.transcriptText && (
            <Text
              className="text-sm text-gray-600 dark:text-gray-400 mb-2"
              numberOfLines={2}
            >
              {event.transcriptText}
            </Text>
          )}

          {event.index && (
            <View className="flex-row flex-wrap">
              {event.index.trades?.slice(0, 2).map((trade) => (
                <View key={trade} className="bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full mr-1 mb-1">
                  <Text className="text-xs text-blue-700 dark:text-blue-300">{trade}</Text>
                </View>
              ))}
              {event.index.costImpact && (
                <View className="bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full mr-1 mb-1">
                  <Text className="text-xs text-red-700 dark:text-red-300">
                    ${event.index.costImpact.toLocaleString()}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View className="items-end">
          {/* Follow-up Toggle */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggleFollowUp(!needsFollowUp);
            }}
            className={cn(
              'flex-row items-center px-2 py-1 rounded-full mb-2',
              needsFollowUp
                ? 'bg-orange-100 dark:bg-orange-900/30'
                : 'bg-gray-100 dark:bg-gray-700'
            )}
          >
            {needsFollowUp ? (
              <>
                <Bell size={14} color="#F97316" />
                <Text className="text-xs text-orange-600 ml-1">Follow-up</Text>
              </>
            ) : (
              <>
                <BellOff size={14} color="#9CA3AF" />
                <Text className="text-xs text-gray-500 ml-1">No follow-up</Text>
              </>
            )}
          </Pressable>

          <ChevronRight size={20} color="#9CA3AF" />
        </View>
      </View>
    </Pressable>
  );
}

export default function InsightsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('all-events');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});

  // Fetch all events
  const allEventsQuery = useQuery({
    queryKey: queryKeys.events,
    queryFn: () => getEvents({ limit: 100 }),
    staleTime: 30000,
  });

  // Fetch follow-ups
  const followUpsQuery = useQuery({
    queryKey: queryKeys.followUps(),
    queryFn: () => getFollowUpEvents({ limit: 50 }),
    staleTime: 30000,
  });

  // Fetch stats
  const statsQuery = useQuery({
    queryKey: queryKeys.indexStats(),
    queryFn: () => getIndexStats(),
    staleTime: 30000,
  });

  // Search query (only when search is active)
  const searchResultsQuery = useQuery({
    queryKey: queryKeys.indexedSearch(searchFilters),
    queryFn: () => searchEventsByKeywords(searchFilters),
    enabled: activeTab === 'search' && Object.keys(searchFilters).length > 0,
    staleTime: 30000,
  });

  // Handle follow-up toggle
  const handleToggleFollowUp = useCallback(async (eventId: string, needsFollowUp: boolean) => {
    try {
      await updateEventFollowUp(eventId, { needs_follow_up: needsFollowUp });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
      queryClient.invalidateQueries({ queryKey: queryKeys.followUps() });
      queryClient.invalidateQueries({ queryKey: queryKeys.indexStats() });
    } catch (error) {
      console.error('Failed to update follow-up status:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [queryClient]);

  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Search in multiple fields
      setSearchFilters({
        inspector: searchQuery.trim(),
        limit: 20,
      });
    }
  }, [searchQuery]);

  const handleFilterPress = useCallback((filterType: keyof SearchFilters, value: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchFilters({ [filterType]: value, limit: 20 });
    setActiveTab('search');
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchFilters({});
  }, []);

  const isLoading = followUpsQuery.isLoading || statsQuery.isLoading || allEventsQuery.isLoading;
  const hasError = followUpsQuery.isError || statsQuery.isError || allEventsQuery.isError;

  const stats = statsQuery.data;
  const followUps = followUpsQuery.data?.results || [];
  const allEvents = allEventsQuery.data || [];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <Stack.Screen
        options={{
          title: 'Insights',
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
        {(['all-events', 'follow-ups', 'search', 'stats'] as TabType[]).map((tab) => (
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
                'text-center text-sm font-medium',
                activeTab === tab
                  ? 'text-white'
                  : 'text-gray-600 dark:text-gray-400'
              )}
            >
              {tab === 'all-events' ? 'All' : tab === 'follow-ups' ? 'Follow-ups' : tab === 'search' ? 'Search' : 'Stats'}
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
              Unable to connect to server. Make sure the backend is running.
            </Text>
          </View>
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
              refreshing={followUpsQuery.isFetching || statsQuery.isFetching || allEventsQuery.isFetching}
              onRefresh={() => {
                allEventsQuery.refetch();
                followUpsQuery.refetch();
                statsQuery.refetch();
              }}
            />
          }
        >
          {/* All Events Tab */}
          {activeTab === 'all-events' && (
            <Animated.View entering={FadeIn} className="px-4 pt-4">
              <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                All Events ({allEvents.length})
              </Text>

              {allEvents.length === 0 ? (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-6 items-center">
                  <List size={32} color="#9CA3AF" />
                  <Text className="mt-3 text-gray-500 text-center">
                    No events logged yet.
                  </Text>
                </View>
              ) : (
                allEvents.map((event, index) => (
                  <Animated.View key={event.id} entering={FadeInDown.delay(index * 30)}>
                    <AllEventsCard
                      event={event}
                      onPress={() => router.push(`/event-detail?id=${event.id}`)}
                      onToggleFollowUp={(needsFollowUp) => handleToggleFollowUp(event.id, needsFollowUp)}
                    />
                  </Animated.View>
                ))
              )}
            </Animated.View>
          )}

          {/* Follow-ups Tab */}
          {activeTab === 'follow-ups' && (
            <Animated.View entering={FadeIn} className="px-4 pt-4">
              {/* Summary Stats */}
              <View className="flex-row mb-4">
                <StatCard
                  title="Need Follow-up"
                  value={stats?.needsFollowUp || 0}
                  icon={AlertCircle}
                  color="#F97316"
                />
                <StatCard
                  title="Cost Impact"
                  value={stats?.totalCostImpact ? `$${(stats.totalCostImpact / 1000).toFixed(0)}k` : '$0'}
                  icon={DollarSign}
                  color="#EF4444"
                />
              </View>

              {/* Follow-up List */}
              <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Events Needing Attention ({followUps.length})
              </Text>

              {followUps.length === 0 ? (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-6 items-center">
                  <AlertCircle size={32} color="#10B981" />
                  <Text className="mt-3 text-gray-500 text-center">
                    No events need follow-up right now.
                  </Text>
                </View>
              ) : (
                followUps.map((event, index) => (
                  <Animated.View key={event.id} entering={FadeInDown.delay(index * 50)}>
                    <FollowUpCard
                      event={event}
                      onPress={() => router.push(`/event-detail?id=${event.id}`)}
                    />
                  </Animated.View>
                ))
              )}
            </Animated.View>
          )}

          {/* Search Tab */}
          {activeTab === 'search' && (
            <Animated.View entering={FadeIn} className="px-4 pt-4">
              {/* Search Bar */}
              <View className="flex-row items-center bg-white dark:bg-gray-800 rounded-xl px-4 py-3 mb-4">
                <Search size={20} color="#9CA3AF" />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearch}
                  placeholder="Search by inspector, trade, AHJ..."
                  placeholderTextColor="#9CA3AF"
                  className="flex-1 ml-3 text-gray-900 dark:text-white"
                  returnKeyType="search"
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={clearSearch}>
                    <X size={20} color="#9CA3AF" />
                  </Pressable>
                )}
              </View>

              {/* Quick Filters */}
              {stats && (
                <View className="mb-4">
                  <Text className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    Quick Filters
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {stats.topInspectors?.slice(0, 3).map((item) => (
                      <Pressable
                        key={item.name}
                        onPress={() => handleFilterPress('inspector', item.name)}
                        className="bg-purple-100 dark:bg-purple-900/30 px-3 py-1.5 rounded-full mr-2"
                      >
                        <Text className="text-sm text-purple-700 dark:text-purple-300">
                          {item.name}
                        </Text>
                      </Pressable>
                    ))}
                    {stats.topTrades?.slice(0, 3).map((item) => (
                      <Pressable
                        key={item.name}
                        onPress={() => handleFilterPress('trade', item.name)}
                        className="bg-blue-100 dark:bg-blue-900/30 px-3 py-1.5 rounded-full mr-2"
                      >
                        <Text className="text-sm text-blue-700 dark:text-blue-300">
                          {item.name}
                        </Text>
                      </Pressable>
                    ))}
                    {stats.topAHJ?.slice(0, 2).map((item) => (
                      <Pressable
                        key={item.name}
                        onPress={() => handleFilterPress('ahj', item.name)}
                        className="bg-green-100 dark:bg-green-900/30 px-3 py-1.5 rounded-full mr-2"
                      >
                        <Text className="text-sm text-green-700 dark:text-green-300">
                          {item.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Search Results */}
              {searchResultsQuery.isLoading && (
                <View className="py-8 items-center">
                  <ActivityIndicator size="small" color="#F97316" />
                </View>
              )}

              {searchResultsQuery.data && (
                <View>
                  <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Results ({searchResultsQuery.data.count})
                  </Text>
                  {searchResultsQuery.data.results.map((event, index) => (
                    <Animated.View key={event.id} entering={FadeInDown.delay(index * 30)}>
                      <SearchResultCard
                        event={event}
                        onPress={() => router.push(`/event-detail?id=${event.id}`)}
                      />
                    </Animated.View>
                  ))}
                </View>
              )}

              {!searchResultsQuery.data && Object.keys(searchFilters).length === 0 && (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-6 items-center">
                  <Search size={32} color="#9CA3AF" />
                  <Text className="mt-3 text-gray-500 text-center">
                    Search events by inspector name, trade,{'\n'}jurisdiction, or use quick filters above.
                  </Text>
                </View>
              )}
            </Animated.View>
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && stats && (
            <Animated.View entering={FadeIn} className="px-4 pt-4">
              {/* Overview Cards */}
              <View className="flex-row mb-4">
                <StatCard
                  title="Total Indexed"
                  value={stats.totalIndexed}
                  icon={TrendingUp}
                  color="#3B82F6"
                />
                <StatCard
                  title="Need Follow-up"
                  value={stats.needsFollowUp}
                  icon={AlertCircle}
                  color="#F97316"
                />
              </View>

              <View className="flex-row mb-4">
                <StatCard
                  title="With Cost Impact"
                  value={stats.withCostImpact}
                  icon={DollarSign}
                  color="#EF4444"
                />
                <StatCard
                  title="Total Cost"
                  value={`$${(stats.totalCostImpact / 1000).toFixed(0)}k`}
                  icon={DollarSign}
                  color="#EF4444"
                />
              </View>

              {/* Top Lists */}
              <TopItemsList
                title="Top Inspectors"
                items={stats.topInspectors}
                icon={Users}
                color="#8B5CF6"
              />

              <TopItemsList
                title="Top Trades"
                items={stats.topTrades}
                icon={Wrench}
                color="#3B82F6"
              />

              <TopItemsList
                title="Jurisdictions (AHJ)"
                items={stats.topAHJ}
                icon={MapPin}
                color="#10B981"
              />

              <TopItemsList
                title="Issue Types"
                items={stats.topIssueTypes}
                icon={AlertCircle}
                color="#F59E0B"
              />

              <TopItemsList
                title="Systems"
                items={stats.topSystems}
                icon={Wrench}
                color="#6B7280"
              />
            </Animated.View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
