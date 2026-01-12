import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { format, isToday, parseISO } from 'date-fns';
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
  AlertCircle,
  CloudOff,
} from 'lucide-react-native';
import { cn } from '@/lib/cn';
import {
  getDailyLogs,
  getProjects,
  getDailyLogPdfUrl,
  getDailyLogPdfPreviewUrl,
  queryKeys,
  DailyLogSummary,
  ProjectSummary,
} from '@/lib/api';

export default function LogsHistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showAllProjects, setShowAllProjects] = useState(true);

  // Fetch projects
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => getProjects(),
    staleTime: 60000,
  });

  // Fetch daily logs
  const dailyLogsQuery = useQuery({
    queryKey: queryKeys.dailyLogs(showAllProjects ? undefined : selectedProjectId || undefined),
    queryFn: () => getDailyLogs({
      project_id: showAllProjects ? undefined : selectedProjectId || undefined,
      limit: 100,
    }),
    staleTime: 30000,
  });

  const projects = projectsQuery.data || [];
  const dailyLogs = dailyLogsQuery.data || [];

  const handleRefresh = useCallback(() => {
    projectsQuery.refetch();
    dailyLogsQuery.refetch();
  }, [projectsQuery, dailyLogsQuery]);

  const handleViewPdf = useCallback((logId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = getDailyLogPdfPreviewUrl(logId);
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  }, []);

  const handleDownloadPdf = useCallback((logId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const url = getDailyLogPdfUrl(logId);
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  }, []);

  const isLoading = projectsQuery.isLoading || dailyLogsQuery.isLoading;
  const hasError = projectsQuery.isError || dailyLogsQuery.isError;

  // If no projects exist at all
  if (!isLoading && projects.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-black">
        <FileText size={48} color="#9CA3AF" />
        <Text className="text-lg font-medium text-gray-500 dark:text-gray-400 mt-4">
          No projects yet
        </Text>
        <Text className="text-sm text-gray-400 dark:text-gray-500 text-center mt-2 px-8">
          Import data to see daily logs here
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl
            refreshing={dailyLogsQuery.isFetching}
            onRefresh={handleRefresh}
          />
        }
      >
        {/* Header */}
        <View className="px-4 pt-4 pb-2">
          <Text className="text-2xl font-bold text-gray-900 dark:text-white">
            Log History
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {dailyLogs.length} daily logs from the backend
          </Text>
        </View>

        {/* Filter Toggle */}
        <View className="px-4 mt-2 flex-row">
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setShowAllProjects(true);
            }}
            className={cn(
              'flex-1 py-2 rounded-l-xl border',
              showAllProjects
                ? 'bg-orange-500 border-orange-500'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
            )}
          >
            <Text
              className={cn(
                'text-center text-sm font-medium',
                showAllProjects ? 'text-white' : 'text-gray-600 dark:text-gray-400'
              )}
            >
              All Projects
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setShowAllProjects(false);
            }}
            className={cn(
              'flex-1 py-2 rounded-r-xl border',
              !showAllProjects
                ? 'bg-orange-500 border-orange-500'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
            )}
          >
            <Text
              className={cn(
                'text-center text-sm font-medium',
                !showAllProjects ? 'text-white' : 'text-gray-600 dark:text-gray-400'
              )}
            >
              By Project
            </Text>
          </Pressable>
        </View>

        {/* Project selector when not showing all */}
        {!showAllProjects && projects.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-3"
            contentContainerStyle={{ paddingHorizontal: 16 }}
          >
            {projects.map((project) => (
              <Pressable
                key={project.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedProjectId(project.id);
                }}
                className={cn(
                  'px-4 py-2 rounded-full mr-2',
                  selectedProjectId === project.id
                    ? 'bg-orange-500'
                    : 'bg-white dark:bg-gray-800'
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-medium',
                    selectedProjectId === project.id
                      ? 'text-white'
                      : 'text-gray-600 dark:text-gray-400'
                  )}
                  numberOfLines={1}
                >
                  {project.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Error State */}
        {hasError && (
          <View className="mx-4 mt-4 bg-red-50 dark:bg-red-900/20 rounded-xl p-4">
            <View className="flex-row items-center">
              <CloudOff size={20} color="#EF4444" />
              <Text className="ml-2 text-sm text-red-700 dark:text-red-300">
                Unable to connect to server. Make sure the backend is running.
              </Text>
            </View>
          </View>
        )}

        {/* Loading State */}
        {isLoading && (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="large" color="#F97316" />
            <Text className="mt-3 text-gray-500">Loading logs...</Text>
          </View>
        )}

        {/* Logs List */}
        {!isLoading && (
          <View className="px-4 mt-4">
            {dailyLogs.length === 0 ? (
              <View className="items-center py-12">
                <Calendar size={48} color="#9CA3AF" />
                <Text className="text-lg font-medium text-gray-500 dark:text-gray-400 mt-4">
                  No logs yet
                </Text>
                <Text className="text-sm text-gray-400 dark:text-gray-500 text-center mt-2">
                  {showAllProjects
                    ? 'No daily logs have been created yet'
                    : 'No logs for the selected project'}
                </Text>
              </View>
            ) : (
              dailyLogs.map((log, index) => (
                <Animated.View key={log.id} entering={FadeInDown.delay(index * 30)}>
                  <DailyLogCard
                    log={log}
                    showProject={showAllProjects}
                    onViewPdf={() => handleViewPdf(log.id)}
                    onDownloadPdf={() => handleDownloadPdf(log.id)}
                  />
                </Animated.View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function DailyLogCard({
  log,
  showProject,
  onViewPdf,
  onDownloadPdf,
}: {
  log: DailyLogSummary;
  showProject: boolean;
  onViewPdf: () => void;
  onDownloadPdf: () => void;
}) {
  const logDate = parseISO(log.date);
  const isLogToday = isToday(logDate);
  const issueCount = log._count.pendingIssues;
  const hasWeatherDelay = log.weather?.weather_delay;

  return (
    <View className="bg-white dark:bg-gray-900 rounded-2xl mb-3 p-4">
      {/* Main Info */}
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

          {/* Project name */}
          {showProject && log.project && (
            <View className="flex-row items-center mt-1">
              <Building2 size={14} color="#9CA3AF" />
              <Text className="ml-1 text-sm text-gray-500 dark:text-gray-400">
                {log.project.name}
                {log.project.number && ` (#${log.project.number})`}
              </Text>
            </View>
          )}

          {/* Stats row */}
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
            {hasWeatherDelay && (
              <View className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded">
                <Text className="text-xs text-yellow-600 dark:text-yellow-400">
                  Weather Delay
                </Text>
              </View>
            )}
          </View>

          {/* Issues badge */}
          {issueCount > 0 && (
            <View className="flex-row items-center mt-2">
              <AlertTriangle size={14} color="#EF4444" />
              <Text className="ml-1 text-sm font-medium text-red-500">
                {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
              </Text>
            </View>
          )}

          {/* Tasks summary */}
          {log._count.tasks > 0 && (
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              {log._count.tasks} task{log._count.tasks !== 1 ? 's' : ''} logged
              {log._count.inspectionNotes > 0 && ` · ${log._count.inspectionNotes} inspection${log._count.inspectionNotes !== 1 ? 's' : ''}`}
            </Text>
          )}
        </View>

        {/* PDF Actions */}
        <View className="flex-row items-center ml-2">
          <Pressable
            onPress={onViewPdf}
            className="bg-gray-100 dark:bg-gray-800 p-2 rounded-lg mr-2"
          >
            <Eye size={20} color="#F97316" />
          </Pressable>
          <Pressable
            onPress={onDownloadPdf}
            className="bg-orange-500 p-2 rounded-lg"
          >
            <Download size={20} color="#FFF" />
          </Pressable>
        </View>
      </View>

      {/* Footer */}
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          {log.preparedBy ? `By ${log.preparedBy}` : 'No author'}
          {' · '}
          {log.status || 'draft'}
        </Text>
        <View className="flex-row items-center">
          <FileText size={14} color="#F97316" />
          <Text className="ml-1 text-xs font-medium text-orange-500">
            View PDF
          </Text>
          <ChevronRight size={14} color="#F97316" />
        </View>
      </View>
    </View>
  );
}
