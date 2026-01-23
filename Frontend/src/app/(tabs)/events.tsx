import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useDailyLogStore } from '@/lib/store';
import { Event, EventType, EventSeverity } from '@/lib/types';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { transcribeAudio } from '@/lib/transcription';
import { syncEventToBackend } from '@/lib/sync';
import { parseEventWithAI } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  Mic,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ChevronRight,
  Radio,
  Building2,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  Delay: '#EF4444',
  Quality: '#F59E0B',
  Safety: '#DC2626',
  Inspection: '#8B5CF6',
  Material: '#3B82F6',
  Equipment: '#6B7280',
  Coordination: '#10B981',
  Other: '#6B7280',
};

const SEVERITY_COLORS: Record<EventSeverity, string> = {
  Low: '#10B981',
  Medium: '#F59E0B',
  High: '#EF4444',
};

function EventCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const projects = useDailyLogStore((s) => s.projects);
  const project = projects.find((p) => p.id === event.project_id);

  const timeAgo = useMemo(() => {
    const now = new Date();
    const created = new Date(event.created_at);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return created.toLocaleDateString();
  }, [event.created_at]);

  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-gray-700"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          <View className="flex-row items-center mb-1">
            <View
              className="px-2 py-0.5 rounded-full mr-2"
              style={{ backgroundColor: EVENT_TYPE_COLORS[event.event_type] + '20' }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: EVENT_TYPE_COLORS[event.event_type] }}
              >
                {event.event_type}
              </Text>
            </View>
            <View
              className="px-2 py-0.5 rounded-full"
              style={{ backgroundColor: SEVERITY_COLORS[event.severity] + '20' }}
            >
              <Text
                className="text-xs font-medium"
                style={{ color: SEVERITY_COLORS[event.severity] }}
              >
                {event.severity}
              </Text>
            </View>
          </View>

          <Text
            className="text-base font-semibold text-gray-900 dark:text-white mb-1"
            numberOfLines={2}
          >
            {event.title}
          </Text>

          {/* Action Items - displayed prominently */}
          {event.action_items && event.action_items.length > 0 && (
            <View className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 mb-2 border border-amber-200 dark:border-amber-700">
              <View className="flex-row items-center mb-1">
                <AlertTriangle size={12} color="#F59E0B" />
                <Text className="text-xs font-semibold text-amber-700 dark:text-amber-400 ml-1">
                  Action Needed
                </Text>
              </View>
              {event.action_items.slice(0, 2).map((item, idx) => (
                <Text
                  key={idx}
                  className="text-xs text-amber-800 dark:text-amber-300 ml-4"
                  numberOfLines={1}
                >
                  • {item}
                </Text>
              ))}
              {event.action_items.length > 2 && (
                <Text className="text-xs text-amber-600 dark:text-amber-500 ml-4">
                  +{event.action_items.length - 2} more
                </Text>
              )}
            </View>
          )}

          {project && (
            <View className="flex-row items-center mb-1">
              <Building2 size={12} color="#9CA3AF" />
              <Text className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                {project.name}
              </Text>
            </View>
          )}

          {event.description ? (
            <Text
              className="text-sm text-gray-600 dark:text-gray-400"
              numberOfLines={2}
            >
              {event.description}
            </Text>
          ) : null}
        </View>

        <View className="items-end">
          <View className="flex-row items-center mb-2">
            <Clock size={12} color="#9CA3AF" />
            <Text className="text-xs text-gray-400 ml-1">{timeAgo}</Text>
          </View>

          {event.is_resolved ? (
            <View className="flex-row items-center">
              <CheckCircle2 size={14} color="#10B981" />
              <Text className="text-xs text-green-600 ml-1">Resolved</Text>
            </View>
          ) : event.linked_daily_log_id ? (
            <View className="flex-row items-center">
              <Radio size={14} color="#3B82F6" />
              <Text className="text-xs text-blue-600 ml-1">Logged</Text>
            </View>
          ) : null}

          <View className="mt-2">
            <ChevronRight size={20} color="#9CA3AF" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function EventsScreen() {
  const router = useRouter();
  const [showRecorder, setShowRecorder] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const projects = useDailyLogStore((s) => s.projects);
  const events = useDailyLogStore((s) => s.events);
  const currentProjectId = useDailyLogStore((s) => s.currentProjectId);
  const addEvent = useDailyLogStore((s) => s.addEvent);
  const updateEvent = useDailyLogStore((s) => s.updateEvent);

  // Sort events by created_at descending
  const sortedEvents = useMemo(() => {
    return [...events].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [events]);

  // Filter today's events
  const today = new Date().toISOString().split('T')[0];
  const todayEvents = useMemo(() => {
    return sortedEvents.filter((e) => e.created_at.startsWith(today));
  }, [sortedEvents, today]);

  const olderEvents = useMemo(() => {
    return sortedEvents.filter((e) => !e.created_at.startsWith(today));
  }, [sortedEvents, today]);

  const handleRecordComplete = async (text: string, audioUri?: string) => {
    if (audioUri && currentProjectId) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const newEvent = addEvent(currentProjectId, audioUri);
      setShowRecorder(false);

      // Navigate to event detail immediately
      router.push(`/event-detail?id=${newEvent.id}`);

      // Get project name for context
      const project = projects.find(p => p.id === currentProjectId);
      const projectName = project?.name;

      // Trigger transcription in the background
      try {
        console.log('[events] Starting transcription for event:', newEvent.id);
        const result = await transcribeAudio(audioUri);

        if (result.success && result.text) {
          const transcriptText = result.text.trim();
          console.log('[events] Transcription done, calling AI parser...');

          // Use AI-powered parsing for intelligent extraction
          try {
            const aiParsed = await parseEventWithAI(transcriptText, projectName);
            console.log('[events] AI parsed result:', aiParsed);

            if (aiParsed.success) {
              updateEvent(newEvent.id, {
                transcript_text: transcriptText,
                status: 'transcribed',
                title: aiParsed.title,
                description: aiParsed.summary || '', // Clean, professional interpretation
                event_type: aiParsed.event_type as any,
                severity: aiParsed.severity as any,
                action_items: aiParsed.action_items,
                location: aiParsed.location || newEvent.location,
                trade_vendor: aiParsed.trade_vendor || newEvent.trade_vendor,
              });
              console.log('[events] Event updated with AI-parsed data');
            } else {
              // Fallback: just save transcript without AI parsing
              console.log('[events] AI parsing failed, saving transcript only');
              updateEvent(newEvent.id, {
                transcript_text: transcriptText,
                status: 'transcribed',
                title: transcriptText.substring(0, 50) + (transcriptText.length > 50 ? '...' : ''),
              });
            }
          } catch (aiError) {
            console.error('[events] AI parsing error:', aiError);
            // Fallback: save transcript without AI parsing
            updateEvent(newEvent.id, {
              transcript_text: transcriptText,
              status: 'transcribed',
              title: transcriptText.substring(0, 50) + (transcriptText.length > 50 ? '...' : ''),
            });
          }

          // Sync to backend after processing
          const updatedEvent = useDailyLogStore.getState().getEvent(newEvent.id);
          if (updatedEvent) {
            syncEventToBackend(updatedEvent).then(backendId => {
              if (backendId) {
                console.log('[events] Event synced to backend:', backendId);
              }
            });
          }
        } else {
          console.error('[events] Transcription failed:', result.error);
          // Still sync to backend even without transcription
          syncEventToBackend(newEvent);
        }
      } catch (err) {
        console.error('[events] Transcription error:', err);
        // Still sync to backend even on error
        syncEventToBackend(newEvent);
      }
    } else if (!currentProjectId) {
      // No project selected, show warning
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setShowRecorder(false);
    } else {
      setShowRecorder(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  const currentProject = projects.find((p) => p.id === currentProjectId);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Project Selector Banner */}
        {currentProject ? (
          <View className="mx-4 mt-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3">
            <View className="flex-row items-center">
              <Building2 size={18} color="#F97316" />
              <Text className="ml-2 text-sm font-medium text-orange-700 dark:text-orange-300">
                Recording for: {currentProject.name}
              </Text>
            </View>
          </View>
        ) : projects.length > 0 ? (
          <Pressable
            onPress={() => router.push('/(tabs)/projects')}
            className="mx-4 mt-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-3"
          >
            <View className="flex-row items-center">
              <AlertTriangle size={18} color="#F59E0B" />
              <Text className="ml-2 text-sm font-medium text-yellow-700 dark:text-yellow-300">
                Tap to select a project first
              </Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/(tabs)/projects')}
            className="mx-4 mt-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-3"
          >
            <View className="flex-row items-center">
              <AlertTriangle size={18} color="#F59E0B" />
              <Text className="ml-2 text-sm font-medium text-yellow-700 dark:text-yellow-300">
                Create a project to start capturing events
              </Text>
            </View>
          </Pressable>
        )}

        {/* Voice Recorder Section */}
        <Animated.View
          entering={FadeIn}
          className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm"
        >
          {showRecorder ? (
            <View>
              <Text className="text-center text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Recording Event
              </Text>
              <VoiceRecorder
                onTranscription={handleRecordComplete}
                placeholder="Hold to record event"
                disabled={!currentProjectId}
              />
              <Pressable
                onPress={() => setShowRecorder(false)}
                className="mt-4 py-2"
              >
                <Text className="text-center text-sm text-gray-500">Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                if (currentProjectId) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowRecorder(true);
                } else {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  router.push('/(tabs)/projects');
                }
              }}
              className={cn(
                'flex-row items-center justify-center py-4 rounded-xl',
                currentProjectId
                  ? 'bg-orange-500'
                  : 'bg-gray-300 dark:bg-gray-700'
              )}
            >
              <Mic size={24} color="white" />
              <Text className="ml-3 text-lg font-semibold text-white">
                Record Event
              </Text>
            </Pressable>
          )}
        </Animated.View>

        {/* Today's Events */}
        <View className="px-4 mt-6">
          <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Today ({todayEvents.length})
          </Text>

          {todayEvents.length === 0 ? (
            <View className="bg-white dark:bg-gray-800 rounded-2xl p-6 items-center">
              <Mic size={32} color="#9CA3AF" />
              <Text className="mt-3 text-gray-500 dark:text-gray-400 text-center">
                No events recorded today.{'\n'}Tap the button above to capture one.
              </Text>
            </View>
          ) : (
            todayEvents.map((event, index) => (
              <Animated.View key={event.id} entering={FadeInDown.delay(index * 50)}>
                <EventCard
                  event={event}
                  onPress={() => router.push(`/event-detail?id=${event.id}`)}
                />
              </Animated.View>
            ))
          )}
        </View>

        {/* Older Events */}
        {olderEvents.length > 0 && (
          <View className="px-4 mt-6">
            <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Earlier ({olderEvents.length})
            </Text>

            {olderEvents.slice(0, 10).map((event, index) => (
              <Animated.View key={event.id} entering={FadeInDown.delay(index * 30)}>
                <EventCard
                  event={event}
                  onPress={() => router.push(`/event-detail?id=${event.id}`)}
                />
              </Animated.View>
            ))}

            {olderEvents.length > 10 && (
              <Pressable className="py-3">
                <Text className="text-center text-orange-500 font-medium">
                  View all {olderEvents.length} events
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
