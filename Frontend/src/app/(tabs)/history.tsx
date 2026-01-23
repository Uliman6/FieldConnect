import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Linking, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isToday } from 'date-fns';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  FileText,
  Calendar,
  AlertTriangle,
  ChevronRight,
  Building2,
  Download,
  Eye,
  Users,
  Clock,
  CloudOff,
  Trash2,
  Pencil,
  ClipboardList,
  FileQuestion,
  Wand2,
  Circle,
  CheckCircle,
  Clock4,
  CircleDot,
} from 'lucide-react-native';
import { cn } from '@/lib/cn';
import { useDailyLogStore } from '@/lib/store';
import {
  getDailyLogs,
  getProjects,
  fetchDailyLogPdf,
  deleteDailyLogApi,
  queryKeys,
  DailyLogSummary,
  ProjectSummary,
  getEvents,
  downloadSchemaPdf,
  getChecklistItems,
  updateEventStatus,
  ChecklistFilters,
  IndexedEvent,
} from '@/lib/api';
import { getBackendId } from '@/lib/data-provider';

type DocumentCategory = 'daily_log' | 'punch_list' | 'rfi';
type StatusFilter = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED';

const CATEGORY_CONFIG: Record<DocumentCategory, { label: string; icon: any; color: string }> = {
  daily_log: { label: 'Daily Logs', icon: Calendar, color: '#F97316' },
  punch_list: { label: 'Punch Lists', icon: ClipboardList, color: '#F59E0B' },
  rfi: { label: 'RFIs', icon: FileQuestion, color: '#3B82F6' },
};

const STATUS_CONFIG: Record<StatusFilter, { label: string; icon: any; color: string; bgColor: string }> = {
  ALL: { label: 'All', icon: Circle, color: '#6B7280', bgColor: '#F3F4F6' },
  OPEN: { label: 'Open', icon: CircleDot, color: '#EF4444', bgColor: '#FEE2E2' },
  IN_PROGRESS: { label: 'In Progress', icon: Clock4, color: '#F59E0B', bgColor: '#FEF3C7' },
  CLOSED: { label: 'Closed', icon: CheckCircle, color: '#10B981', bgColor: '#D1FAE5' },
};

/**
 * Parse a date string as local date (not UTC)
 */
function parseLocalDate(dateString: string): Date {
  if (dateString && dateString.length === 10) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(dateString);
  return new Date(date.getTime() + date.getTimezoneOffset() * 60000);
}

export default function LogsHistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentProjectId = useDailyLogStore((s) => s.currentProjectId);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>('daily_log');
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  // Fetch projects
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => getProjects(),
    staleTime: 0,
  });

  // Get backend project ID (local IDs may differ from backend IDs)
  const backendProjectId = currentProjectId
    ? (getBackendId('projects', currentProjectId) || currentProjectId)
    : undefined;

  // Fetch daily logs for selected project
  const dailyLogsQuery = useQuery({
    queryKey: queryKeys.dailyLogs(backendProjectId),
    queryFn: async () => {
      console.log('[history] Fetching daily logs for project:', backendProjectId);
      const logs = await getDailyLogs({
        project_id: backendProjectId,
        limit: 100,
      });
      console.log('[history] Fetched daily logs:', logs.length);
      return logs;
    },
    staleTime: 0,
    enabled: selectedCategory === 'daily_log' && !!backendProjectId,
  });

  // Fetch checklist items (punch lists and RFIs) with status filtering
  const checklistQuery = useQuery({
    queryKey: queryKeys.checklist({
      category: selectedCategory === 'punch_list' ? 'PUNCH_LIST' : 'RFI',
      project_id: backendProjectId,
      status: statusFilter !== 'ALL' ? statusFilter : undefined,
    }),
    queryFn: async () => {
      console.log('[history] Fetching checklist for project:', backendProjectId, 'status:', statusFilter);
      const response = await getChecklistItems({
        category: selectedCategory === 'punch_list' ? 'PUNCH_LIST' : 'RFI',
        project_id: backendProjectId,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        limit: 100,
      });
      console.log('[history] Fetched checklist items:', response.items.length, 'counts:', response.counts);
      return response;
    },
    staleTime: 0,
    enabled: selectedCategory !== 'daily_log' && !!backendProjectId,
  });

  const projects = projectsQuery.data || [];
  // Filter to only show daily logs with actual content (not empty auto-generated ones)
  const allDailyLogs = dailyLogsQuery.data || [];
  const dailyLogs = allDailyLogs.filter((log) => {
    const hasContent =
      (log._count?.tasks || 0) > 0 ||
      (log._count?.pendingIssues || 0) > 0 ||
      (log._count?.inspectionNotes || 0) > 0 ||
      (log._count?.visitors || 0) > 0 ||
      (log._count?.equipment || 0) > 0 ||
      (log._count?.materials || 0) > 0 ||
      (log.dailyTotalsWorkers && log.dailyTotalsWorkers > 0) ||
      (log.dailyTotalsHours && log.dailyTotalsHours > 0);
    return hasContent;
  });
  console.log('[history] Daily logs with content:', dailyLogs.length, 'of', allDailyLogs.length, 'total');
  const checklistData = checklistQuery.data || { items: [], counts: { total: 0, open: 0, inProgress: 0, closed: 0 } };
  const checklistItems = checklistData.items;
  const checklistCounts = checklistData.counts;
  // Look up project by backend ID (projects from API have backend IDs)
  const currentProject = projects.find((p) => p.id === backendProjectId);

  // Debug logging
  console.log('[history] State:', {
    currentProjectId,
    backendProjectId,
    currentProject: currentProject?.name,
    projectsCount: projects.length,
    dailyLogsFetched: dailyLogsQuery.data?.length || 0,
    dailyLogsWithContent: dailyLogs.length,
    selectedCategory,
    statusFilter,
    checklistItemsCount: checklistItems.length,
    checklistCounts,
  });

  // Refetch data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      projectsQuery.refetch();
      if (selectedCategory === 'daily_log') {
        dailyLogsQuery.refetch();
      } else {
        checklistQuery.refetch();
      }
    }, [selectedCategory, statusFilter])
  );

  const handleRefresh = useCallback(() => {
    projectsQuery.refetch();
    if (selectedCategory === 'daily_log') {
      dailyLogsQuery.refetch();
    } else {
      checklistQuery.refetch();
    }
  }, [selectedCategory, statusFilter]);

  const handleViewPdf = useCallback(async (logId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const blobUrl = await fetchDailyLogPdf(logId, true);
      if (Platform.OS === 'web') {
        window.open(blobUrl, '_blank');
      } else {
        Linking.openURL(blobUrl);
      }
    } catch (error) {
      console.error('[pdf] Failed to fetch PDF:', error);
    }
  }, []);

  const handleEditLog = useCallback((logId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/daily-log-detail?id=${logId}`);
  }, [router]);

  const handleDownloadPdf = useCallback(async (logId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const blobUrl = await fetchDailyLogPdf(logId, false);
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `daily-log-${logId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } else {
        Linking.openURL(blobUrl);
      }
    } catch (error) {
      console.error('[pdf] Failed to download PDF:', error);
    }
  }, []);

  const handleDeleteLog = useCallback(async (log: DailyLogSummary) => {
    const confirmDelete = () => {
      return new Promise<boolean>((resolve) => {
        if (Platform.OS === 'web') {
          const confirmed = window.confirm(
            `Delete daily log for ${format(parseLocalDate(log.date), 'MMMM d, yyyy')}?\n\nThis action cannot be undone.`
          );
          resolve(confirmed);
        } else {
          Alert.alert(
            'Delete Daily Log',
            `Delete the log for ${format(parseLocalDate(log.date), 'MMMM d, yyyy')}?\n\nThis action cannot be undone.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        }
      });
    };

    const confirmed = await confirmDelete();
    if (!confirmed) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setDeletingLogId(log.id);

    try {
      await deleteDailyLogApi(log.id);
      // Invalidate all daily logs queries (any projectId)
      queryClient.invalidateQueries({ queryKey: ['daily-logs'] });
      // Invalidate all events queries
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
    } catch (error) {
      console.error('[delete] Failed to delete daily log:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to delete daily log. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to delete daily log. Please try again.');
      }
    } finally {
      setDeletingLogId(null);
    }
  }, [queryClient]);

  const handleViewEvent = useCallback((eventId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/event-detail?id=${eventId}`);
  }, [router]);

  const handleDownloadSchemaPdf = useCallback(async (eventId: string, title: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const blobUrl = await downloadSchemaPdf(eventId);
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${selectedCategory}-${title || eventId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } else {
        Linking.openURL(blobUrl);
      }
    } catch (error) {
      console.error('[pdf] Failed to download schema PDF:', error);
      if (Platform.OS === 'web') {
        window.alert('No PDF generated yet. Open the event and click "Export PDF" first.');
      } else {
        Alert.alert('No PDF', 'No PDF generated yet. Open the event and click "Export PDF" first.');
      }
    }
  }, [selectedCategory]);

  const handleStatusChange = useCallback(async (eventId: string, newStatus: 'OPEN' | 'IN_PROGRESS' | 'CLOSED') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUpdatingStatusId(eventId);
    try {
      await updateEventStatus(eventId, { status: newStatus });
      // Invalidate checklist queries to refresh
      queryClient.invalidateQueries({ queryKey: ['checklist'] });
    } catch (error) {
      console.error('[status] Failed to update status:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to update status. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to update status. Please try again.');
      }
    } finally {
      setUpdatingStatusId(null);
    }
  }, [queryClient]);

  const isLoading = projectsQuery.isLoading ||
    (selectedCategory === 'daily_log' ? dailyLogsQuery.isLoading : checklistQuery.isLoading);
  const hasError = projectsQuery.isError ||
    (selectedCategory === 'daily_log' ? dailyLogsQuery.isError : checklistQuery.isError);

  // For punch lists and RFIs, require a project to be selected
  const requiresProjectSelection = selectedCategory !== 'daily_log' && !currentProjectId;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl
            refreshing={selectedCategory === 'daily_log' ? dailyLogsQuery.isFetching : checklistQuery.isFetching}
            onRefresh={handleRefresh}
          />
        }
      >
        {/* Header */}
        <View className="px-4 pt-4 pb-2">
          <Text className="text-2xl font-bold text-gray-900 dark:text-white">
            Documents
          </Text>
          <View className="flex-row items-center mt-1">
            <Building2 size={14} color={currentProject ? '#F97316' : '#9CA3AF'} />
            <Text className={cn(
              'ml-1 text-sm font-medium',
              currentProject ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'
            )}>
              {currentProject ? currentProject.name : 'All Projects'}
            </Text>
          </View>
        </View>

        {/* Category Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-2"
          contentContainerStyle={{ paddingHorizontal: 16 }}
        >
          {(Object.entries(CATEGORY_CONFIG) as [DocumentCategory, typeof CATEGORY_CONFIG[DocumentCategory]][]).map(
            ([key, config]) => {
              const Icon = config.icon;
              const isActive = selectedCategory === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedCategory(key);
                    // Reset status filter when switching categories
                    if (key === 'daily_log') {
                      setStatusFilter('ALL');
                    }
                  }}
                  className={cn(
                    'flex-row items-center px-4 py-2 rounded-full mr-2',
                    isActive ? 'bg-gray-900 dark:bg-white' : 'bg-white dark:bg-gray-800'
                  )}
                >
                  <Icon size={16} color={isActive ? '#FFF' : config.color} />
                  <Text
                    className={cn(
                      'ml-2 text-sm font-medium',
                      isActive ? 'text-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400'
                    )}
                  >
                    {config.label}
                  </Text>
                </Pressable>
              );
            }
          )}
        </ScrollView>

        {/* Error State */}
        {hasError && (
          <View className="mx-4 mt-4 bg-red-50 dark:bg-red-900/20 rounded-xl p-4">
            <View className="flex-row items-center">
              <CloudOff size={20} color="#EF4444" />
              <Text className="ml-2 text-sm text-red-700 dark:text-red-300">
                Unable to connect to server.
              </Text>
            </View>
          </View>
        )}

        {/* Loading State */}
        {isLoading && (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="large" color="#F97316" />
            <Text className="mt-3 text-gray-500">Loading...</Text>
          </View>
        )}

        {/* Daily Logs List */}
        {!isLoading && selectedCategory === 'daily_log' && (
          <View className="px-4 mt-4">
            {dailyLogs.length === 0 ? (
              <EmptyState category="daily_log" />
            ) : (
              dailyLogs.map((log, index) => (
                <Animated.View key={log.id} entering={FadeInDown.delay(index * 30)}>
                  <DailyLogCard
                    log={log}
                    showProject={!currentProjectId}
                    onViewPdf={() => handleViewPdf(log.id)}
                    onDownloadPdf={() => handleDownloadPdf(log.id)}
                    onEdit={() => handleEditLog(log.id)}
                    onDelete={() => handleDeleteLog(log)}
                    isDeleting={deletingLogId === log.id}
                  />
                </Animated.View>
              ))
            )}
          </View>
        )}

        {/* Punch List / RFI List */}
        {!isLoading && selectedCategory !== 'daily_log' && (
          <View className="px-4 mt-4">
            {requiresProjectSelection ? (
              <View className="items-center py-12">
                <Building2 size={48} color="#9CA3AF" />
                <Text className="text-lg font-medium text-gray-500 dark:text-gray-400 mt-4 text-center">
                  Select a project
                </Text>
                <Text className="text-sm text-gray-400 dark:text-gray-500 text-center mt-2 px-8">
                  Choose a project from the Projects tab to view {selectedCategory === 'punch_list' ? 'punch lists' : 'RFIs'}
                </Text>
              </View>
            ) : (
              <>
                {/* Status Filter Tabs */}
                <View className="flex-row items-center mb-4 bg-white dark:bg-gray-900 rounded-xl p-1">
                  {(Object.entries(STATUS_CONFIG) as [StatusFilter, typeof STATUS_CONFIG[StatusFilter]][]).map(
                    ([key, config]) => {
                      const Icon = config.icon;
                      const isActive = statusFilter === key;
                      const count = key === 'ALL' ? checklistCounts.total
                        : key === 'OPEN' ? checklistCounts.open
                        : key === 'IN_PROGRESS' ? checklistCounts.inProgress
                        : checklistCounts.closed;
                      return (
                        <Pressable
                          key={key}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setStatusFilter(key);
                          }}
                          className={cn(
                            'flex-1 flex-row items-center justify-center py-2 px-2 rounded-lg',
                            isActive ? 'bg-gray-100 dark:bg-gray-800' : ''
                          )}
                        >
                          <Icon size={14} color={isActive ? config.color : '#9CA3AF'} />
                          <Text
                            className={cn(
                              'ml-1 text-xs font-medium',
                              isActive ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
                            )}
                          >
                            {config.label}
                          </Text>
                          <View
                            className={cn(
                              'ml-1 px-1.5 rounded-full',
                              isActive ? 'bg-gray-200 dark:bg-gray-700' : 'bg-gray-100 dark:bg-gray-800'
                            )}
                          >
                            <Text className="text-xs text-gray-600 dark:text-gray-400">{count}</Text>
                          </View>
                        </Pressable>
                      );
                    }
                  )}
                </View>

                {/* Items List */}
                {checklistItems.length === 0 ? (
                  <EmptyState category={selectedCategory} />
                ) : (
                  checklistItems.map((event: IndexedEvent, index: number) => (
                    <Animated.View key={event.id} entering={FadeInDown.delay(index * 30)}>
                      <ChecklistItemCard
                        event={event}
                        category={selectedCategory}
                        onView={() => handleViewEvent(event.id)}
                        onDownloadPdf={() => handleDownloadSchemaPdf(event.id, event.schemaData?.fieldValues?.title || event.title || 'document')}
                        onStatusChange={(newStatus) => handleStatusChange(event.id, newStatus)}
                        isUpdating={updatingStatusId === event.id}
                      />
                    </Animated.View>
                  ))
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function EmptyState({ category }: { category: DocumentCategory }) {
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;

  return (
    <View className="items-center py-12">
      <Icon size={48} color="#9CA3AF" />
      <Text className="text-lg font-medium text-gray-500 dark:text-gray-400 mt-4">
        No {config.label.toLowerCase()} yet
      </Text>
      <Text className="text-sm text-gray-400 dark:text-gray-500 text-center mt-2 px-8">
        {category === 'daily_log'
          ? 'Create a daily log to see it here'
          : `Record an event and apply it to a ${category === 'punch_list' ? 'Punch List' : 'RFI'}`}
      </Text>
    </View>
  );
}

function DailyLogCard({
  log,
  showProject,
  onViewPdf,
  onDownloadPdf,
  onEdit,
  onDelete,
  isDeleting,
}: {
  log: DailyLogSummary;
  showProject?: boolean;
  onViewPdf: () => void;
  onDownloadPdf: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const logDate = parseLocalDate(log.date);
  const isLogToday = isToday(logDate);
  const issueCount = log._count.pendingIssues;

  return (
    <View className="bg-white dark:bg-gray-900 rounded-2xl mb-3 p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <View className="flex-row items-center">
            <Calendar size={18} color="#F97316" />
            <Text className="ml-2 text-base font-semibold text-gray-900 dark:text-white">
              {format(logDate, 'EEEE, MMMM d, yyyy')}
            </Text>
            {isLogToday && (
              <View className="ml-2 px-2 py-0.5 bg-green-100 dark:bg-green-900 rounded">
                <Text className="text-xs font-medium text-green-600 dark:text-green-400">
                  Today
                </Text>
              </View>
            )}
          </View>

          {showProject && log.project && (
            <View className="flex-row items-center mt-1">
              <Building2 size={14} color="#9CA3AF" />
              <Text className="ml-1 text-sm text-gray-500 dark:text-gray-400">
                {log.project.name}
              </Text>
            </View>
          )}

          <View className="flex-row items-center mt-2 flex-wrap">
            {log.dailyTotalsWorkers != null && (
              <View className="flex-row items-center mr-4">
                <Users size={14} color="#6B7280" />
                <Text className="ml-1 text-sm text-gray-500 dark:text-gray-400">
                  {log.dailyTotalsWorkers} workers
                </Text>
              </View>
            )}
            {log.dailyTotalsHours != null && (
              <View className="flex-row items-center mr-4">
                <Clock size={14} color="#6B7280" />
                <Text className="ml-1 text-sm text-gray-500 dark:text-gray-400">
                  {log.dailyTotalsHours} hrs
                </Text>
              </View>
            )}
          </View>

          {issueCount > 0 && (
            <View className="flex-row items-center mt-2">
              <AlertTriangle size={14} color="#EF4444" />
              <Text className="ml-1 text-sm font-medium text-red-500">
                {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
              </Text>
            </View>
          )}
        </View>

        <View className="flex-row items-center ml-2">
          <Pressable onPress={onEdit} className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg mr-2">
            <Pencil size={20} color="#3B82F6" />
          </Pressable>
          <Pressable onPress={onViewPdf} className="bg-gray-100 dark:bg-gray-800 p-2 rounded-lg mr-2">
            <Eye size={20} color="#F97316" />
          </Pressable>
          <Pressable onPress={onDownloadPdf} className="bg-orange-500 p-2 rounded-lg mr-2">
            <Download size={20} color="#FFF" />
          </Pressable>
          <Pressable
            onPress={onDelete}
            disabled={isDeleting}
            className={cn(
              "p-2 rounded-lg",
              isDeleting ? "bg-gray-200 dark:bg-gray-700" : "bg-red-100 dark:bg-red-900/30"
            )}
          >
            {isDeleting ? (
              <ActivityIndicator size={20} color="#EF4444" />
            ) : (
              <Trash2 size={20} color="#EF4444" />
            )}
          </Pressable>
        </View>
      </View>

      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          {log.preparedBy ? `By ${log.preparedBy}` : 'No author'}
          {' · '}
          {log.status || 'draft'}
        </Text>
        <Pressable onPress={onEdit} className="flex-row items-center">
          <Text className="text-xs font-medium text-blue-500">View Details</Text>
          <ChevronRight size={14} color="#3B82F6" />
        </Pressable>
      </View>
    </View>
  );
}

function SchemaDocumentCard({
  event,
  category,
  onView,
  onDownloadPdf,
}: {
  event: any;
  category: DocumentCategory;
  onView: () => void;
  onDownloadPdf: () => void;
}) {
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;
  const fieldValues = event.schemaData?.fieldValues || {};
  const title = fieldValues.title || fieldValues.subject || event.title || 'Untitled';
  const description = fieldValues.description || fieldValues.question || '';
  const hasPdf = !!event.schemaData?.generatedPdfPath;
  const createdAt = new Date(event.createdAt);

  return (
    <Pressable onPress={onView} className="bg-white dark:bg-gray-900 rounded-2xl mb-3 p-4">
      <View className="flex-row items-start">
        <View
          className="w-10 h-10 rounded-lg items-center justify-center mr-3"
          style={{ backgroundColor: config.color + '20' }}
        >
          <Icon size={20} color={config.color} />
        </View>

        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className="text-base font-semibold text-gray-900 dark:text-white flex-1" numberOfLines={1}>
              {title}
            </Text>
            {hasPdf && (
              <View className="ml-2 px-2 py-0.5 bg-green-100 dark:bg-green-900 rounded flex-row items-center">
                <FileText size={12} color="#10B981" />
                <Text className="text-xs font-medium text-green-600 dark:text-green-400 ml-1">
                  PDF
                </Text>
              </View>
            )}
          </View>

          {description && (
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1" numberOfLines={2}>
              {description}
            </Text>
          )}

          <View className="flex-row items-center mt-2">
            <Calendar size={12} color="#9CA3AF" />
            <Text className="ml-1 text-xs text-gray-400 dark:text-gray-500">
              {format(createdAt, 'MMM d, yyyy')}
            </Text>
            {fieldValues.assigned_to && (
              <>
                <Text className="mx-2 text-gray-300 dark:text-gray-600">·</Text>
                <Text className="text-xs text-gray-400 dark:text-gray-500">
                  {fieldValues.assigned_to}
                </Text>
              </>
            )}
            {fieldValues.location && (
              <>
                <Text className="mx-2 text-gray-300 dark:text-gray-600">·</Text>
                <Text className="text-xs text-gray-400 dark:text-gray-500">
                  {fieldValues.location}
                </Text>
              </>
            )}
          </View>
        </View>

        <View className="flex-row items-center ml-2">
          {hasPdf && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onDownloadPdf();
              }}
              className="bg-green-500 p-2 rounded-lg mr-2"
            >
              <Download size={18} color="#FFF" />
            </Pressable>
          )}
          <ChevronRight size={20} color="#9CA3AF" />
        </View>
      </View>
    </Pressable>
  );
}

function ChecklistItemCard({
  event,
  category,
  onView,
  onDownloadPdf,
  onStatusChange,
  isUpdating,
}: {
  event: IndexedEvent;
  category: DocumentCategory;
  onView: () => void;
  onDownloadPdf: () => void;
  onStatusChange: (newStatus: 'OPEN' | 'IN_PROGRESS' | 'CLOSED') => void;
  isUpdating: boolean;
}) {
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;
  const fieldValues = event.schemaData?.fieldValues || {};
  const title = fieldValues.title || fieldValues.subject || event.title || 'Untitled';
  const description = fieldValues.description || fieldValues.question || event.transcriptText?.slice(0, 100) || '';
  const hasPdf = !!event.schemaData?.generatedPdfPath;
  const createdAt = new Date(event.createdAt);
  const currentStatus = event.itemStatus || 'OPEN';
  const statusConfig = STATUS_CONFIG[currentStatus as StatusFilter] || STATUS_CONFIG.OPEN;

  // Get next status in workflow
  const getNextStatus = () => {
    if (currentStatus === 'OPEN') return 'IN_PROGRESS';
    if (currentStatus === 'IN_PROGRESS') return 'CLOSED';
    return 'OPEN';
  };

  const StatusIcon = statusConfig.icon;

  return (
    <Pressable onPress={onView} className="bg-white dark:bg-gray-900 rounded-2xl mb-3 p-4">
      <View className="flex-row items-start">
        {/* Status indicator - clickable to change status */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            if (!isUpdating) {
              onStatusChange(getNextStatus());
            }
          }}
          disabled={isUpdating}
          className="mr-3"
        >
          {isUpdating ? (
            <ActivityIndicator size={24} color={statusConfig.color} />
          ) : (
            <View
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: statusConfig.bgColor }}
            >
              <StatusIcon size={18} color={statusConfig.color} />
            </View>
          )}
        </Pressable>

        <View className="flex-1">
          {/* Title and Status Badge */}
          <View className="flex-row items-center">
            <Text
              className={cn(
                'text-base font-semibold flex-1',
                currentStatus === 'CLOSED'
                  ? 'text-gray-400 dark:text-gray-500 line-through'
                  : 'text-gray-900 dark:text-white'
              )}
              numberOfLines={1}
            >
              {title}
            </Text>
            <View
              className="ml-2 px-2 py-0.5 rounded"
              style={{ backgroundColor: statusConfig.bgColor }}
            >
              <Text className="text-xs font-medium" style={{ color: statusConfig.color }}>
                {statusConfig.label}
              </Text>
            </View>
          </View>

          {/* Description */}
          {description && (
            <Text
              className={cn(
                'text-sm mt-1',
                currentStatus === 'CLOSED'
                  ? 'text-gray-400 dark:text-gray-500'
                  : 'text-gray-500 dark:text-gray-400'
              )}
              numberOfLines={2}
            >
              {description}
            </Text>
          )}

          {/* Meta info */}
          <View className="flex-row items-center mt-2 flex-wrap">
            <Icon size={12} color="#9CA3AF" />
            <Text className="ml-1 text-xs text-gray-400 dark:text-gray-500">
              {category === 'punch_list' ? 'Punch List' : 'RFI'}
            </Text>
            <Text className="mx-2 text-gray-300 dark:text-gray-600">·</Text>
            <Calendar size={12} color="#9CA3AF" />
            <Text className="ml-1 text-xs text-gray-400 dark:text-gray-500">
              {format(createdAt, 'MMM d, yyyy')}
            </Text>
            {fieldValues.assigned_to && (
              <>
                <Text className="mx-2 text-gray-300 dark:text-gray-600">·</Text>
                <Text className="text-xs text-gray-400 dark:text-gray-500">
                  {fieldValues.assigned_to}
                </Text>
              </>
            )}
            {fieldValues.location && (
              <>
                <Text className="mx-2 text-gray-300 dark:text-gray-600">·</Text>
                <Text className="text-xs text-gray-400 dark:text-gray-500">
                  {fieldValues.location}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Action buttons */}
        <View className="flex-row items-center ml-2">
          {hasPdf && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onDownloadPdf();
              }}
              className="bg-green-500 p-2 rounded-lg mr-2"
            >
              <Download size={18} color="#FFF" />
            </Pressable>
          )}
          <ChevronRight size={20} color="#9CA3AF" />
        </View>
      </View>
    </Pressable>
  );
}
