import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useDailyLogStore } from '@/lib/store';
import { EventType, EventSeverity, Event } from '@/lib/types';
import { audioFileExists } from '@/lib/audio-storage';
import { generateTitleFromTranscript } from '@/lib/transcription';
import { cn } from '@/lib/cn';
import {
  ArrowLeft,
  Play,
  Pause,
  CheckCircle2,
  ClipboardPlus,
  Trash2,
  MapPin,
  HardHat,
  Save,
  AlertTriangle,
  FileText,
  Copy,
  Sparkles,
} from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/lib/useColorScheme';

const EVENT_TYPES: EventType[] = [
  'Delay',
  'Quality',
  'Safety',
  'Inspection',
  'Material',
  'Equipment',
  'Coordination',
  'Other',
];

const SEVERITIES: EventSeverity[] = ['Low', 'Medium', 'High'];

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

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const event = useDailyLogStore((s) => s.events.find((e) => e.id === id));
  const projects = useDailyLogStore((s) => s.projects);
  const updateEvent = useDailyLogStore((s) => s.updateEvent);
  const deleteEvent = useDailyLogStore((s) => s.deleteEvent);
  const addEventToDailyLog = useDailyLogStore((s) => s.addEventToDailyLog);
  const toggleEventResolved = useDailyLogStore((s) => s.toggleEventResolved);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [eventType, setEventType] = useState<EventType>('Other');
  const [severity, setSeverity] = useState<EventSeverity>('Medium');
  const [location, setLocation] = useState('');
  const [tradeVendor, setTradeVendor] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [audioExists, setAudioExists] = useState(true);

  const project = projects.find((p) => p.id === event?.project_id);

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setNotes(event.notes);
      setEventType(event.event_type);
      setSeverity(event.severity);
      setLocation(event.location);
      setTradeVendor(event.trade_vendor);

      // Check if audio file exists
      if (event.local_audio_uri) {
        audioFileExists(event.local_audio_uri).then((exists) => {
          setAudioExists(exists);
          if (!exists) {
            console.log('[event-detail] Audio file not found:', event.local_audio_uri);
          }
        });
      }
    }
  }, [event]);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  if (!event) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <Text className="text-gray-500">Event not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-orange-500">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const handlePlayAudio = async () => {
    if (!event.local_audio_uri) return;

    try {
      if (isPlaying && sound) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        if (sound) {
          await sound.playAsync();
        } else {
          const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: event.local_audio_uri },
            { shouldPlay: true }
          );
          setSound(newSound);
          newSound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
              setIsPlaying(false);
            }
          });
        }
        setIsPlaying(true);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.log('Audio playback error:', error);
    }
  };

  const handleSave = () => {
    updateEvent(event.id, {
      title: title || 'Untitled Event',
      notes,
      event_type: eventType,
      severity,
      location,
      trade_vendor: tradeVendor,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setHasChanges(false);
  };

  const handleAddToDailyLog = () => {
    // Save any pending changes first
    if (hasChanges) {
      handleSave();
    }

    const result = addEventToDailyLog(event.id);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS === 'web') {
        alert('Event added to today\'s Daily Log!');
      } else {
        Alert.alert('Success', 'Event added to today\'s Daily Log as a Pending Issue.', [
          { text: 'OK' },
        ]);
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleDelete = () => {
    const doDelete = () => {
      deleteEvent(event.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    };

    if (Platform.OS === 'web') {
      if (confirm('Are you sure you want to delete this event?')) {
        doDelete();
      }
    } else {
      Alert.alert('Delete Event', 'Are you sure you want to delete this event?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleToggleResolved = () => {
    toggleEventResolved(event.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const markChanged = () => {
    if (!hasChanges) setHasChanges(true);
  };

  const createdDate = new Date(event.created_at);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Event Details',
          headerStyle: { backgroundColor: isDark ? '#111' : '#FFF' },
          headerTintColor: isDark ? '#FFF' : '#111',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} className="p-2">
              <ArrowLeft size={24} color={isDark ? '#FFF' : '#111'} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={handleSave}
              disabled={!hasChanges}
              className={cn('p-2', !hasChanges && 'opacity-50')}
            >
              <Save size={24} color={hasChanges ? '#F97316' : '#9CA3AF'} />
            </Pressable>
          ),
        }}
      />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header Info */}
        <Animated.View
          entering={FadeIn}
          className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4"
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {createdDate.toLocaleDateString()} at{' '}
              {createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {project && (
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {project.name}
              </Text>
            )}
          </View>

          {/* Audio Player */}
          {event.local_audio_uri && audioExists && (
            <Pressable
              onPress={handlePlayAudio}
              className="flex-row items-center bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 mb-4"
            >
              <View className="w-12 h-12 rounded-full bg-orange-500 items-center justify-center">
                {isPlaying ? (
                  <Pause size={24} color="white" />
                ) : (
                  <Play size={24} color="white" style={{ marginLeft: 2 }} />
                )}
              </View>
              <View className="ml-4">
                <Text className="text-base font-medium text-gray-900 dark:text-white">
                  {isPlaying ? 'Playing...' : 'Play Recording'}
                </Text>
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  Tap to {isPlaying ? 'pause' : 'listen'}
                </Text>
              </View>
            </Pressable>
          )}

          {/* Audio Missing Warning */}
          {event.local_audio_uri && !audioExists && (
            <View className="flex-row items-center bg-red-50 dark:bg-red-900/20 rounded-xl p-4 mb-4">
              <View className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 items-center justify-center">
                <AlertTriangle size={24} color="#EF4444" />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-base font-medium text-red-600 dark:text-red-400">
                  Audio Not Available
                </Text>
                <Text className="text-sm text-red-500/70 dark:text-red-400/70">
                  The recording file was lost (older recording)
                </Text>
              </View>
            </View>
          )}

          {/* Transcription Display */}
          {event.transcript_text && (
            <View className="mb-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center">
                  <FileText size={16} color="#3B82F6" />
                  <Text className="ml-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                    Transcription
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    if (!notes.trim() && event.transcript_text) {
                      setNotes(event.transcript_text);
                      markChanged();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    } else if (event.transcript_text) {
                      setNotes((prev) => prev + '\n\n' + event.transcript_text);
                      markChanged();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                  className="flex-row items-center bg-blue-100 dark:bg-blue-800/50 px-3 py-1.5 rounded-lg"
                >
                  <Copy size={14} color="#3B82F6" />
                  <Text className="ml-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                    Copy to Notes
                  </Text>
                </Pressable>
              </View>
              <Text className="text-sm text-gray-700 dark:text-gray-300 leading-5">
                {event.transcript_text}
              </Text>
            </View>
          )}

          {/* Title Input */}
          <View className="mb-4">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Title
              </Text>
              {event.transcript_text && (
                <Pressable
                  onPress={() => {
                    const autoTitle = generateTitleFromTranscript(event.transcript_text ?? '');
                    setTitle(autoTitle);
                    markChanged();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  className="flex-row items-center bg-purple-100 dark:bg-purple-900/30 px-2 py-1 rounded-lg"
                >
                  <Sparkles size={12} color="#8B5CF6" />
                  <Text className="ml-1 text-xs font-medium text-purple-600 dark:text-purple-400">
                    Auto-generate
                  </Text>
                </Pressable>
              )}
            </View>
            <TextInput
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                markChanged();
              }}
              placeholder="Event title..."
              placeholderTextColor="#9CA3AF"
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          </View>

          {/* Notes Input */}
          <View className="mb-4">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
              Notes
            </Text>
            <TextInput
              value={notes}
              onChangeText={(text) => {
                setNotes(text);
                markChanged();
              }}
              placeholder="Add notes..."
              placeholderTextColor="#9CA3AF"
              multiline
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white min-h-[100px]"
              textAlignVertical="top"
            />
          </View>
        </Animated.View>

        {/* Event Type Selection */}
        <Animated.View
          entering={FadeInDown.delay(100)}
          className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4"
        >
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
            Event Type
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {EVENT_TYPES.map((type) => (
              <Pressable
                key={type}
                onPress={() => {
                  setEventType(type);
                  markChanged();
                  Haptics.selectionAsync();
                }}
                className={cn(
                  'px-4 py-2 rounded-full border-2',
                  eventType === type
                    ? 'border-transparent'
                    : 'border-gray-200 dark:border-gray-600'
                )}
                style={
                  eventType === type
                    ? { backgroundColor: EVENT_TYPE_COLORS[type] }
                    : undefined
                }
              >
                <Text
                  className={cn(
                    'text-sm font-medium',
                    eventType === type
                      ? 'text-white'
                      : 'text-gray-600 dark:text-gray-300'
                  )}
                >
                  {type}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Severity Selection */}
        <Animated.View
          entering={FadeInDown.delay(150)}
          className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4"
        >
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
            Severity
          </Text>
          <View className="flex-row gap-3">
            {SEVERITIES.map((sev) => (
              <Pressable
                key={sev}
                onPress={() => {
                  setSeverity(sev);
                  markChanged();
                  Haptics.selectionAsync();
                }}
                className={cn(
                  'flex-1 py-3 rounded-xl border-2 items-center',
                  severity === sev
                    ? 'border-transparent'
                    : 'border-gray-200 dark:border-gray-600'
                )}
                style={
                  severity === sev
                    ? { backgroundColor: SEVERITY_COLORS[sev] }
                    : undefined
                }
              >
                <Text
                  className={cn(
                    'text-base font-semibold',
                    severity === sev
                      ? 'text-white'
                      : 'text-gray-600 dark:text-gray-300'
                  )}
                >
                  {sev}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Location & Trade */}
        <Animated.View
          entering={FadeInDown.delay(200)}
          className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4"
        >
          <View className="mb-4">
            <View className="flex-row items-center mb-1">
              <MapPin size={14} color="#9CA3AF" />
              <Text className="ml-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Location
              </Text>
            </View>
            <TextInput
              value={location}
              onChangeText={(text) => {
                setLocation(text);
                markChanged();
              }}
              placeholder="e.g., Level 3 / Grid D4"
              placeholderTextColor="#9CA3AF"
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          </View>

          <View>
            <View className="flex-row items-center mb-1">
              <HardHat size={14} color="#9CA3AF" />
              <Text className="ml-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Trade / Vendor
              </Text>
            </View>
            <TextInput
              value={tradeVendor}
              onChangeText={(text) => {
                setTradeVendor(text);
                markChanged();
              }}
              placeholder="e.g., ABC Concrete / Rebar sub"
              placeholderTextColor="#9CA3AF"
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          </View>
        </Animated.View>

        {/* Actions */}
        <Animated.View
          entering={FadeInDown.delay(250)}
          className="mx-4 mt-6"
        >
          {/* Add to Daily Log */}
          {!event.linked_daily_log_id && (
            <Pressable
              onPress={handleAddToDailyLog}
              className="flex-row items-center justify-center bg-blue-500 rounded-xl py-4 mb-3"
            >
              <ClipboardPlus size={20} color="white" />
              <Text className="ml-2 text-base font-semibold text-white">
                Add to Today's Daily Log
              </Text>
            </Pressable>
          )}

          {event.linked_daily_log_id && (
            <View className="flex-row items-center justify-center bg-blue-100 dark:bg-blue-900/30 rounded-xl py-4 mb-3">
              <ClipboardPlus size={20} color="#3B82F6" />
              <Text className="ml-2 text-base font-semibold text-blue-600 dark:text-blue-400">
                Added to Daily Log
              </Text>
            </View>
          )}

          {/* Mark Resolved */}
          <Pressable
            onPress={handleToggleResolved}
            className={cn(
              'flex-row items-center justify-center rounded-xl py-4 mb-3',
              event.is_resolved
                ? 'bg-green-500'
                : 'bg-gray-200 dark:bg-gray-700'
            )}
          >
            <CheckCircle2 size={20} color={event.is_resolved ? 'white' : '#6B7280'} />
            <Text
              className={cn(
                'ml-2 text-base font-semibold',
                event.is_resolved ? 'text-white' : 'text-gray-600 dark:text-gray-300'
              )}
            >
              {event.is_resolved ? 'Resolved' : 'Mark as Resolved'}
            </Text>
          </Pressable>

          {/* Delete */}
          <Pressable
            onPress={handleDelete}
            className="flex-row items-center justify-center py-4"
          >
            <Trash2 size={18} color="#EF4444" />
            <Text className="ml-2 text-base font-medium text-red-500">
              Delete Event
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
