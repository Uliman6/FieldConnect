import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  Bell,
  BellOff,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  FileText,
  Wrench,
  MapPin,
  Users,
  AlertTriangle,
  Lightbulb,
  Eye,
  Shield,
  Zap,
  RefreshCw,
  ExternalLink,
} from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import { cn } from '@/lib/cn';
import {
  getInsight,
  updateInsight,
  queryKeys,
  Insight,
} from '@/lib/api';
import { useColorScheme } from '@/lib/useColorScheme';

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
  inspection_note: 'Inspection Note',
  additional_work: 'Additional Work',
  manual: 'Manual Entry',
};

function TagChip({ label, color, bgColor }: { label: string; color: string; bgColor: string }) {
  return (
    <View className="px-2 py-1 rounded-full mr-2 mb-2" style={{ backgroundColor: bgColor }}>
      <Text className="text-xs font-medium" style={{ color }}>{label}</Text>
    </View>
  );
}

export default function InsightDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Fetch insight from backend
  const insightQuery = useQuery({
    queryKey: queryKeys.insight(id || ''),
    queryFn: () => getInsight(id || ''),
    enabled: !!id,
  });

  const insight = insightQuery.data;
  const isLoading = insightQuery.isLoading;
  const hasError = insightQuery.isError;

  // Handle follow-up toggle
  const handleToggleFollowUp = useCallback(async () => {
    if (!insight) return;
    try {
      await updateInsight(insight.id, { needsFollowUp: !insight.needsFollowUp });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      insightQuery.refetch();
    } catch (error) {
      console.error('Failed to update follow-up status:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [insight, queryClient]);

  // Handle resolved toggle
  const handleToggleResolved = useCallback(async () => {
    if (!insight) return;
    try {
      await updateInsight(insight.id, { isResolved: !insight.isResolved });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      insightQuery.refetch();
    } catch (error) {
      console.error('Failed to update resolved status:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [insight, queryClient]);

  const categoryConfig = insight ? (CATEGORY_CONFIG[insight.category] || CATEGORY_CONFIG.issue) : CATEGORY_CONFIG.issue;
  const CategoryIcon = categoryConfig.icon;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <Stack.Screen
        options={{
          title: 'Insight Details',
          headerStyle: { backgroundColor: isDark ? '#111' : '#FFF' },
          headerTintColor: isDark ? '#FFF' : '#111',
          headerLeft: () => (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              className="p-2"
            >
              <ArrowLeft size={24} color={isDark ? '#FFF' : '#111'} />
            </Pressable>
          ),
        }}
      />

      {/* Loading State */}
      {isLoading && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
          <Text className="mt-3 text-gray-500">Loading insight...</Text>
        </View>
      )}

      {/* Error State */}
      {hasError && (
        <View className="flex-1 items-center justify-center px-6">
          <AlertCircle size={48} color="#EF4444" />
          <Text className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-300">
            Insight Not Found
          </Text>
          <Text className="mt-2 text-sm text-gray-500 text-center">
            This insight may have been deleted or doesn't exist.
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-4 bg-orange-500 py-3 px-6 rounded-xl"
          >
            <Text className="text-white font-semibold">Go Back</Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      {insight && (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Header Card */}
          <Animated.View
            entering={FadeIn}
            className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4"
          >
            {/* Category & Badges */}
            <View className="flex-row items-center flex-wrap mb-3">
              <View
                className="flex-row items-center px-3 py-1 rounded-full mr-2 mb-2"
                style={{ backgroundColor: categoryConfig.color + '20' }}
              >
                <CategoryIcon size={14} color={categoryConfig.color} />
                <Text
                  className="text-sm font-semibold ml-1"
                  style={{ color: categoryConfig.color }}
                >
                  {categoryConfig.label}
                </Text>
              </View>
              {insight.severity && (
                <View
                  className="px-3 py-1 rounded-full mr-2 mb-2"
                  style={{ backgroundColor: (SEVERITY_COLORS[insight.severity] || '#6B7280') + '20' }}
                >
                  <Text
                    className="text-sm font-medium capitalize"
                    style={{ color: SEVERITY_COLORS[insight.severity] || '#6B7280' }}
                  >
                    {insight.severity}
                  </Text>
                </View>
              )}
              <View className="bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full mb-2">
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  {SOURCE_LABELS[insight.sourceType] || insight.sourceType}
                </Text>
              </View>
            </View>

            {/* Title */}
            <Text className="text-xl font-bold text-gray-900 dark:text-white mb-3">
              {insight.title}
            </Text>

            {/* Project & Date */}
            <View className="flex-row items-center mb-2">
              {insight.project && (
                <View className="flex-row items-center mr-4">
                  <Building2 size={14} color="#9CA3AF" />
                  <Text className="text-sm text-gray-500 ml-1">
                    {insight.project.name}
                  </Text>
                </View>
              )}
              <View className="flex-row items-center">
                <Calendar size={14} color="#9CA3AF" />
                <Text className="text-sm text-gray-500 ml-1">
                  {format(new Date(insight.createdAt), 'MMM d, yyyy')}
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* Description */}
          {insight.description && (
            <Animated.View
              entering={FadeInDown.delay(50)}
              className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4"
            >
              <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                Description
              </Text>
              <Text className="text-base text-gray-700 dark:text-gray-300 leading-6">
                {insight.description}
              </Text>
            </Animated.View>
          )}

          {/* Raw Text / Transcript */}
          {insight.rawText && insight.rawText !== insight.description && (
            <Animated.View
              entering={FadeInDown.delay(100)}
              className="mx-4 mt-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4"
            >
              <View className="flex-row items-center mb-2">
                <FileText size={16} color="#3B82F6" />
                <Text className="text-sm font-semibold text-blue-700 dark:text-blue-300 ml-2 uppercase tracking-wide">
                  Original Text
                </Text>
              </View>
              <Text className="text-sm text-gray-700 dark:text-gray-300 leading-5">
                {insight.rawText}
              </Text>
            </Animated.View>
          )}

          {/* Extracted Data */}
          <Animated.View
            entering={FadeInDown.delay(150)}
            className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4"
          >
            <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
              Extracted Data
            </Text>

            {/* Trades */}
            {insight.trades && insight.trades.length > 0 && (
              <View className="mb-4">
                <View className="flex-row items-center mb-2">
                  <Wrench size={14} color="#3B82F6" />
                  <Text className="text-xs font-medium text-gray-500 ml-1">Trades</Text>
                </View>
                <View className="flex-row flex-wrap">
                  {insight.trades.map((trade) => (
                    <TagChip key={trade} label={trade} color="#3B82F6" bgColor="#EFF6FF" />
                  ))}
                </View>
              </View>
            )}

            {/* Locations */}
            {insight.locations && insight.locations.length > 0 && (
              <View className="mb-4">
                <View className="flex-row items-center mb-2">
                  <MapPin size={14} color="#10B981" />
                  <Text className="text-xs font-medium text-gray-500 ml-1">Locations</Text>
                </View>
                <View className="flex-row flex-wrap">
                  {insight.locations.map((location) => (
                    <TagChip key={location} label={location} color="#10B981" bgColor="#ECFDF5" />
                  ))}
                </View>
              </View>
            )}

            {/* Systems */}
            {insight.systems && insight.systems.length > 0 && (
              <View className="mb-4">
                <View className="flex-row items-center mb-2">
                  <Zap size={14} color="#8B5CF6" />
                  <Text className="text-xs font-medium text-gray-500 ml-1">Systems</Text>
                </View>
                <View className="flex-row flex-wrap">
                  {insight.systems.map((system) => (
                    <TagChip key={system} label={system} color="#8B5CF6" bgColor="#F5F3FF" />
                  ))}
                </View>
              </View>
            )}

            {/* Inspectors */}
            {insight.inspectors && insight.inspectors.length > 0 && (
              <View className="mb-4">
                <View className="flex-row items-center mb-2">
                  <Users size={14} color="#6366F1" />
                  <Text className="text-xs font-medium text-gray-500 ml-1">Inspectors</Text>
                </View>
                <View className="flex-row flex-wrap">
                  {insight.inspectors.map((inspector) => (
                    <TagChip key={inspector} label={inspector} color="#6366F1" bgColor="#EEF2FF" />
                  ))}
                </View>
              </View>
            )}

            {/* Issue Types */}
            {insight.issueTypes && insight.issueTypes.length > 0 && (
              <View className="mb-4">
                <View className="flex-row items-center mb-2">
                  <AlertTriangle size={14} color="#F59E0B" />
                  <Text className="text-xs font-medium text-gray-500 ml-1">Issue Types</Text>
                </View>
                <View className="flex-row flex-wrap">
                  {insight.issueTypes.map((type) => (
                    <TagChip key={type} label={type.replace('_', ' ')} color="#F59E0B" bgColor="#FFFBEB" />
                  ))}
                </View>
              </View>
            )}

            {/* Cost Impact */}
            {insight.costImpact && (
              <View className="flex-row items-center bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                <DollarSign size={18} color="#EF4444" />
                <View className="ml-2">
                  <Text className="text-xs text-red-500">Cost Impact</Text>
                  <Text className="text-lg font-bold text-red-600">
                    ${insight.costImpact.toLocaleString()}
                  </Text>
                </View>
              </View>
            )}

            {/* Empty state for extracted data */}
            {!insight.trades?.length && !insight.locations?.length && !insight.systems?.length &&
             !insight.inspectors?.length && !insight.issueTypes?.length && !insight.costImpact && (
              <Text className="text-sm text-gray-400 text-center py-4">
                No extracted data available
              </Text>
            )}
          </Animated.View>

          {/* Follow-up Info */}
          {insight.followUpReason && (
            <Animated.View
              entering={FadeInDown.delay(200)}
              className="mx-4 mt-4 bg-orange-50 dark:bg-orange-900/20 rounded-2xl p-4"
            >
              <View className="flex-row items-center mb-2">
                <Bell size={16} color="#F97316" />
                <Text className="text-sm font-semibold text-orange-700 dark:text-orange-300 ml-2">
                  Follow-up Reason
                </Text>
              </View>
              <Text className="text-sm text-orange-800 dark:text-orange-200">
                {insight.followUpReason}
              </Text>
              {insight.followUpDueDate && (
                <View className="flex-row items-center mt-2">
                  <Calendar size={14} color="#F97316" />
                  <Text className="text-xs text-orange-600 ml-1">
                    Due: {format(new Date(insight.followUpDueDate), 'MMM d, yyyy')}
                  </Text>
                </View>
              )}
            </Animated.View>
          )}

          {/* Actions */}
          <Animated.View
            entering={FadeInDown.delay(250)}
            className="mx-4 mt-6"
          >
            {/* Follow-up Toggle */}
            <Pressable
              onPress={handleToggleFollowUp}
              className={cn(
                'flex-row items-center justify-center py-4 rounded-xl mb-3',
                insight.needsFollowUp
                  ? 'bg-orange-500'
                  : 'bg-gray-200 dark:bg-gray-700'
              )}
            >
              {insight.needsFollowUp ? (
                <>
                  <Bell size={20} color="white" />
                  <Text className="ml-2 text-base font-semibold text-white">
                    Needs Follow-up
                  </Text>
                </>
              ) : (
                <>
                  <BellOff size={20} color="#6B7280" />
                  <Text className="ml-2 text-base font-semibold text-gray-600 dark:text-gray-300">
                    Mark for Follow-up
                  </Text>
                </>
              )}
            </Pressable>

            {/* Resolved Toggle */}
            <Pressable
              onPress={handleToggleResolved}
              className={cn(
                'flex-row items-center justify-center py-4 rounded-xl mb-3',
                insight.isResolved
                  ? 'bg-green-500'
                  : 'bg-gray-200 dark:bg-gray-700'
              )}
            >
              {insight.isResolved ? (
                <>
                  <CheckCircle2 size={20} color="white" />
                  <Text className="ml-2 text-base font-semibold text-white">
                    Resolved
                  </Text>
                </>
              ) : (
                <>
                  <Clock size={20} color="#6B7280" />
                  <Text className="ml-2 text-base font-semibold text-gray-600 dark:text-gray-300">
                    Mark as Resolved
                  </Text>
                </>
              )}
            </Pressable>

            {/* View Source (if from event or other source) */}
            {insight.sourceId && insight.sourceType === 'event' && (
              <Pressable
                onPress={() => router.push(`/event-detail?id=${insight.sourceId}`)}
                className="flex-row items-center justify-center py-4"
              >
                <ExternalLink size={18} color="#3B82F6" />
                <Text className="ml-2 text-base font-medium text-blue-500">
                  View Original Event
                </Text>
              </Pressable>
            )}
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}
