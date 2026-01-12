import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { format, parseISO, addDays, subDays } from 'date-fns';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import {
  Sun,
  Cloud,
  CloudRain,
  ThermometerSun,
  FileText,
  Copy,
  Check,
  NotebookPen,
  RefreshCw,
  MapPin,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';
import { useDailyLogStore } from '@/lib/store';
import { SkyCondition, WeatherConditions } from '@/lib/types';
import { SectionCard, InputField, Toggle, Button, SelectField } from '@/components/ui';
import { PendingIssuesSection } from '@/components/PendingIssues';
import { TasksSection, VisitorsSection, EquipmentSection, MaterialsSection } from '@/components/RepeatingSections';
import { InspectionNotesSection, AdditionalWorkSection } from '@/components/InsightSections';
import { VoiceInputField } from '@/components/VoiceRecorder';
import { MasterVoiceCapture } from '@/components/MasterVoiceCapture';
import { SavedRecordingPlayer } from '@/components/SavedRecordingPlayer';
import { SyncStatusBadge } from '@/components/SyncStatus';
import { syncDailyLogs } from '@/lib/sync';
import { fetchWeatherCached, weatherToConditions, clearWeatherCache } from '@/lib/weather';
import { transcribeAudio, isTranscriptionAvailable } from '@/lib/transcription';
import { cn } from '@/lib/cn';

const SKY_CONDITIONS: { label: string; value: SkyCondition; icon: React.ReactNode }[] = [
  { label: 'Clear', value: 'Clear', icon: <Sun size={16} color="#F59E0B" /> },
  { label: 'Partly Cloudy', value: 'Partly Cloudy', icon: <Cloud size={16} color="#9CA3AF" /> },
  { label: 'Cloudy', value: 'Cloudy', icon: <Cloud size={16} color="#6B7280" /> },
  { label: 'Overcast', value: 'Overcast', icon: <Cloud size={16} color="#4B5563" /> },
  { label: 'Rainy', value: 'Rainy', icon: <CloudRain size={16} color="#3B82F6" /> },
  { label: 'Stormy', value: 'Stormy', icon: <CloudRain size={16} color="#1E40AF" /> },
];

export default function DailyLogScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Store selectors
  const currentLogId = useDailyLogStore((s) => s.currentLogId);
  const dailyLogs = useDailyLogStore((s) => s.dailyLogs);
  const projects = useDailyLogStore((s) => s.projects);
  const currentProjectId = useDailyLogStore((s) => s.currentProjectId);

  const log = dailyLogs.find((l) => l.id === currentLogId);
  const project = projects.find((p) => p.id === currentProjectId);

  // Store actions
  const updateDailyLog = useDailyLogStore((s) => s.updateDailyLog);
  const addTask = useDailyLogStore((s) => s.addTask);
  const updateTask = useDailyLogStore((s) => s.updateTask);
  const removeTask = useDailyLogStore((s) => s.removeTask);
  const addVisitor = useDailyLogStore((s) => s.addVisitor);
  const updateVisitor = useDailyLogStore((s) => s.updateVisitor);
  const removeVisitor = useDailyLogStore((s) => s.removeVisitor);
  const addEquipment = useDailyLogStore((s) => s.addEquipment);
  const updateEquipment = useDailyLogStore((s) => s.updateEquipment);
  const removeEquipment = useDailyLogStore((s) => s.removeEquipment);
  const addMaterial = useDailyLogStore((s) => s.addMaterial);
  const updateMaterial = useDailyLogStore((s) => s.updateMaterial);
  const removeMaterial = useDailyLogStore((s) => s.removeMaterial);
  const addIssue = useDailyLogStore((s) => s.addIssue);
  const updateIssue = useDailyLogStore((s) => s.updateIssue);
  const removeIssue = useDailyLogStore((s) => s.removeIssue);
  const addInspectionNote = useDailyLogStore((s) => s.addInspectionNote);
  const updateInspectionNote = useDailyLogStore((s) => s.updateInspectionNote);
  const removeInspectionNote = useDailyLogStore((s) => s.removeInspectionNote);
  const addAdditionalWork = useDailyLogStore((s) => s.addAdditionalWork);
  const updateAdditionalWork = useDailyLogStore((s) => s.updateAdditionalWork);
  const removeAdditionalWork = useDailyLogStore((s) => s.removeAdditionalWork);
  const addVoiceArtifact = useDailyLogStore((s) => s.addVoiceArtifact);
  const updateVoiceArtifact = useDailyLogStore((s) => s.updateVoiceArtifact);

  // Collapsed states
  const [collapsedSections, setCollapsedSections] = useState({
    weather: false,
    tasks: false,
    visitors: true,
    equipment: true,
    materials: true,
    issues: false,
    inspections: true,
    additionalWork: true,
    dailySummary: true,
  });

  const [copiedSummary, setCopiedSummary] = useState(false);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [weatherLocation, setWeatherLocation] = useState<string | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date | null>(null);

  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  // Get transcription from voice artifact
  const masterRecordingArtifact = log?.voice_artifacts?.find(
    (a) => a.section_key === 'master_recording'
  );
  const transcriptText = masterRecordingArtifact?.transcript_text ?? null;

  // Auto-fetch weather when log or project changes
  useEffect(() => {
    if (log && project?.address && !log.weather.high_temp && !log.weather.low_temp) {
      // Only auto-fetch if weather hasn't been set yet
      fetchWeather(false);
    }
  }, [log?.id, project?.address]);

  const fetchWeather = useCallback(async (forceRefresh: boolean = false) => {
    if (!project?.address) {
      setWeatherError('No project address set');
      return;
    }

    setIsLoadingWeather(true);
    setWeatherError(null);

    try {
      if (forceRefresh) {
        clearWeatherCache();
      }

      const weather = await fetchWeatherCached(project.address);

      if (weather) {
        const conditions = weatherToConditions(weather);
        if (log) {
          updateDailyLog(log.id, {
            weather: {
              ...log.weather,
              ...conditions
            }
          });
        }
        setWeatherLocation(weather.location_name);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        setWeatherError('Could not fetch weather for this address');
      }
    } catch (error) {
      console.error('[weather] Fetch error:', error);
      setWeatherError('Failed to fetch weather');
    } finally {
      setIsLoadingWeather(false);
    }
  }, [project?.address, log, updateDailyLog]);

  const toggleSection = (section: keyof typeof collapsedSections) => {
    Haptics.selectionAsync();
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const updateWeather = useCallback(
    (updates: Partial<WeatherConditions>) => {
      if (!log) return;
      updateDailyLog(log.id, { weather: { ...log.weather, ...updates } });
    },
    [log, updateDailyLog]
  );

  // Transcribe master recording
  const transcribeMasterRecording = useCallback(async (audioUri: string, artifactId: string) => {
    if (!log || !isTranscriptionAvailable()) {
      console.log('[transcription] Not available or no log');
      return;
    }

    setIsTranscribing(true);
    setTranscriptionError(null);

    try {
      console.log('[transcription] Starting transcription for master recording');
      const result = await transcribeAudio(audioUri);

      if (result.success && result.text) {
        // Save transcription to the voice artifact
        updateVoiceArtifact(log.id, artifactId, {
          transcript_text: result.text,
          status: 'transcribed',
        });
        console.log('[transcription] Saved transcription, length:', result.text.length);
      } else {
        setTranscriptionError(result.error ?? 'Transcription failed');
      }
    } catch (error) {
      console.error('[transcription] Error:', error);
      setTranscriptionError('Failed to transcribe audio');
    } finally {
      setIsTranscribing(false);
    }
  }, [log, updateVoiceArtifact]);

  const handleDateChange = useCallback((newDate: Date) => {
    if (!log || !currentProjectId) return;
    const dateStr = format(newDate, 'yyyy-MM-dd');

    // Reset transcription state when switching logs
    setIsTranscribing(false);
    setTranscriptionError(null);

    // Check if there's already a log for this date and project
    const existingLog = dailyLogs.find(
      (l) => l.project_id === currentProjectId && l.date === dateStr
    );

    if (existingLog) {
      // Switch to the existing log
      useDailyLogStore.getState().setCurrentLog(existingLog.id);
    } else {
      // Create a new log for this date
      const createDailyLog = useDailyLogStore.getState().createDailyLog;
      const newLog = createDailyLog(currentProjectId);
      // Update the date to the selected date (createDailyLog sets it to today)
      useDailyLogStore.getState().updateDailyLog(newLog.id, { date: dateStr });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [log, currentProjectId, dailyLogs]);

  const handlePrevDay = useCallback(() => {
    if (!log) return;
    const currentDate = parseISO(log.date);
    const newDate = subDays(currentDate, 1);
    handleDateChange(newDate);
  }, [log, handleDateChange]);

  const handleNextDay = useCallback(() => {
    if (!log) return;
    const currentDate = parseISO(log.date);
    const newDate = addDays(currentDate, 1);
    handleDateChange(newDate);
  }, [log, handleDateChange]);

  const openDatePicker = useCallback(() => {
    if (!log) return;
    setTempDate(parseISO(log.date));
    setShowDatePicker(true);
    Haptics.selectionAsync();
  }, [log]);

  const confirmDatePicker = useCallback(() => {
    if (tempDate) {
      handleDateChange(tempDate);
    }
    setShowDatePicker(false);
    setTempDate(null);
  }, [tempDate, handleDateChange]);

  const cancelDatePicker = useCallback(() => {
    setShowDatePicker(false);
    setTempDate(null);
  }, []);

  if (!log) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-black">
        <Text className="text-gray-500 dark:text-gray-400">No log selected</Text>
        <Button
          title="Go to Projects"
          onPress={() => router.push('/(tabs)/projects')}
          variant="primary"
          className="mt-4"
        />
      </View>
    );
  }

  const generateSummary = () => {
    const lines: string[] = [];
    lines.push(`DAILY LOG - ${format(new Date(log.date), 'MMMM d, yyyy')}`);
    lines.push(`Project: ${project?.name ?? 'Unknown'}`);
    lines.push(`Prepared by: ${log.prepared_by}`);
    lines.push('');

    // Weather
    lines.push('WEATHER:');
    lines.push(`  ${log.weather.sky_condition}, ${log.weather.low_temp ?? '--'}°F - ${log.weather.high_temp ?? '--'}°F`);
    if (log.weather.weather_delay) lines.push('  ⚠️ Weather Delay');
    lines.push('');

    // Totals
    lines.push(`DAILY TOTALS: ${log.daily_totals_workers} workers, ${log.daily_totals_hours} hours`);
    lines.push('');

    // Tasks
    if (log.tasks.length > 0) {
      lines.push('ACTIVITY:');
      log.tasks.forEach((t) => {
        lines.push(`  • ${t.company_name}: ${t.workers} workers, ${t.hours} hrs - ${t.task_description}`);
      });
      lines.push('');
    }

    // Issues (most important)
    if (log.pending_issues.length > 0) {
      lines.push('PENDING ISSUES:');
      log.pending_issues.forEach((i) => {
        lines.push(`  [${i.severity}] ${i.title || 'Untitled'}`);
        if (i.description) lines.push(`    ${i.description}`);
        if (i.category !== 'Other') lines.push(`    Category: ${i.category}`);
      });
      lines.push('');
    }

    // Inspections
    if (log.inspection_notes.length > 0) {
      lines.push('INSPECTIONS:');
      log.inspection_notes.forEach((n) => {
        lines.push(`  • ${n.inspection_type}: ${n.result}${n.follow_up_needed ? ' (Follow-up needed)' : ''}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  };

  const handleCopySummary = async () => {
    const summary = generateSummary();
    await Clipboard.setStringAsync(summary);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <ScrollView
        className="flex-1 bg-gray-50 dark:bg-black"
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="px-4 pt-4 pb-2">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-2xl font-bold text-gray-900 dark:text-white">
                Daily Log
              </Text>
            </View>
            <View className="flex-row">
              <Pressable
                onPress={handleCopySummary}
                className="flex-row items-center bg-gray-200 dark:bg-gray-800 rounded-xl px-3 py-2 mr-2"
              >
                {copiedSummary ? (
                  <Check size={18} color="#22C55E" />
                ) : (
                  <Copy size={18} color="#6B7280" />
                )}
                <Text className="ml-1 text-sm text-gray-600 dark:text-gray-400">
                  {copiedSummary ? 'Copied!' : 'Copy'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/export')}
                className="flex-row items-center bg-orange-500 rounded-xl px-3 py-2"
              >
                <FileText size={18} color="white" />
                <Text className="ml-1 text-sm text-white font-medium">PDF</Text>
              </Pressable>
            </View>
          </View>

          {/* Date selector */}
          <View className="mt-3 bg-white dark:bg-gray-900 rounded-xl p-3">
            <View className="flex-row items-center justify-between">
              <Pressable
                onPress={handlePrevDay}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg"
              >
                <ChevronLeft size={20} color="#6B7280" />
              </Pressable>

              <Pressable
                onPress={openDatePicker}
                className="flex-1 mx-3 flex-row items-center justify-center py-2"
              >
                <Calendar size={18} color="#F97316" />
                <Text className="ml-2 text-base font-semibold text-gray-900 dark:text-white">
                  {format(parseISO(log.date), 'EEEE, MMMM d, yyyy')}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleNextDay}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg"
              >
                <ChevronRight size={20} color="#6B7280" />
              </Pressable>
            </View>
            <Text className="text-xs text-center text-gray-400 dark:text-gray-500 mt-1">
              Tap date to change
            </Text>
          </View>

          {/* Date Picker Modal */}
          {showDatePicker && (
            <Modal
              visible={showDatePicker}
              transparent
              animationType="fade"
              onRequestClose={cancelDatePicker}
            >
              <Pressable
                onPress={cancelDatePicker}
                className="flex-1 bg-black/50 justify-center items-center"
              >
                <Pressable
                  onPress={(e) => e.stopPropagation()}
                  className="bg-white dark:bg-gray-900 rounded-2xl p-4 mx-4 w-full max-w-sm"
                >
                  <Text className="text-lg font-semibold text-gray-900 dark:text-white text-center mb-4">
                    Select Date
                  </Text>
                  <DateTimePicker
                    value={tempDate ?? parseISO(log.date)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedDate) => {
                      if (Platform.OS === 'android') {
                        if (event.type === 'set' && selectedDate) {
                          handleDateChange(selectedDate);
                        }
                        setShowDatePicker(false);
                        setTempDate(null);
                      } else if (selectedDate) {
                        setTempDate(selectedDate);
                      }
                    }}
                    style={{ height: 150 }}
                  />
                  {Platform.OS === 'ios' && (
                    <View className="flex-row mt-4">
                      <Pressable
                        onPress={cancelDatePicker}
                        className="flex-1 py-3 mr-2 bg-gray-200 dark:bg-gray-700 rounded-xl"
                      >
                        <Text className="text-center font-medium text-gray-700 dark:text-gray-300">
                          Cancel
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={confirmDatePicker}
                        className="flex-1 py-3 ml-2 bg-orange-500 rounded-xl"
                      >
                        <Text className="text-center font-medium text-white">
                          Confirm
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              </Pressable>
            </Modal>
          )}

          {/* Project info */}
          {project && (
            <View className="mt-3 bg-white dark:bg-gray-900 rounded-xl p-3">
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                {project.name}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                #{project.number} · {project.address}
              </Text>
            </View>
          )}

          {/* Prepared by */}
          <View className="mt-3">
            <InputField
              label="Prepared By"
              value={log.prepared_by}
              onChangeText={(text) => updateDailyLog(log.id, { prepared_by: text })}
              placeholder="Your name"
            />
          </View>

          {/* Master Voice Capture */}
          <View className="mt-4">
            {log.daily_summary_audio_uri ? (
              <SavedRecordingPlayer
                audioUri={log.daily_summary_audio_uri}
                transcriptText={transcriptText}
                isTranscribing={isTranscribing}
                transcriptionError={transcriptionError}
                onReRecord={() => {
                  // Clear the existing recording and let user re-record
                  updateDailyLog(log.id, { daily_summary_audio_uri: undefined });
                  setTranscriptionError(null);
                }}
                onDelete={() => {
                  updateDailyLog(log.id, { daily_summary_audio_uri: undefined });
                  setTranscriptionError(null);
                  // Also remove from voice artifacts
                  const artifact = log.voice_artifacts?.find(
                    (a) => a.section_key === 'master_recording'
                  );
                  if (artifact) {
                    const removeVoiceArtifact = useDailyLogStore.getState().removeVoiceArtifact;
                    removeVoiceArtifact(log.id, artifact.id);
                  }
                }}
                onRetryTranscription={() => {
                  if (masterRecordingArtifact) {
                    transcribeMasterRecording(
                      log.daily_summary_audio_uri!,
                      masterRecordingArtifact.id
                    );
                  }
                }}
              />
            ) : (
              <MasterVoiceCapture
                projectName={project?.name}
                date={format(new Date(log.date), 'MMM d, yyyy')}
                onRecordingComplete={(audioUri) => {
                  // Save to daily summary and create voice artifact
                  updateDailyLog(log.id, { daily_summary_audio_uri: audioUri });

                  // Create the voice artifact and get its ID
                  // We need to add it first, then find it to get the ID for transcription
                  addVoiceArtifact(log.id, 'master_recording', audioUri);

                  // Start transcription after a small delay to ensure artifact is created
                  setTimeout(() => {
                    const currentLog = useDailyLogStore.getState().dailyLogs.find(l => l.id === log.id);
                    const artifact = currentLog?.voice_artifacts?.find(
                      (a) => a.section_key === 'master_recording'
                    );
                    if (artifact) {
                      transcribeMasterRecording(audioUri, artifact.id);
                    }
                  }, 100);
                }}
              />
            )}
          </View>
        </View>

        {/* Weather Section */}
        <View className="px-4">
          <SectionCard
            title="Weather Conditions"
            collapsed={collapsedSections.weather}
            onToggle={() => toggleSection('weather')}
            rightAction={
              <View className="flex-row items-center">
                {isLoadingWeather ? (
                  <ActivityIndicator size="small" color="#F97316" />
                ) : (
                  <>
                    <ThermometerSun size={16} color="#F97316" />
                    <Text className="ml-1 text-sm text-gray-500 dark:text-gray-400">
                      {log.weather.low_temp ?? '--'}° - {log.weather.high_temp ?? '--'}°
                    </Text>
                  </>
                )}
              </View>
            }
          >
            {/* Auto-fetch weather button */}
            {project?.address && (
              <Pressable
                onPress={() => fetchWeather(true)}
                disabled={isLoadingWeather}
                className={cn(
                  'flex-row items-center justify-center py-3 px-4 rounded-xl mb-4',
                  isLoadingWeather
                    ? 'bg-gray-100 dark:bg-gray-800'
                    : 'bg-blue-50 dark:bg-blue-900/30'
                )}
              >
                {isLoadingWeather ? (
                  <ActivityIndicator size="small" color="#3B82F6" />
                ) : (
                  <RefreshCw size={18} color="#3B82F6" />
                )}
                <Text className="ml-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                  {isLoadingWeather ? 'Fetching weather...' : 'Refresh Weather from Address'}
                </Text>
              </Pressable>
            )}

            {/* Location indicator */}
            {weatherLocation && (
              <View className="flex-row items-center mb-3 px-1">
                <MapPin size={14} color="#10B981" />
                <Text className="ml-1 text-xs text-green-600 dark:text-green-400">
                  Weather for: {weatherLocation}
                </Text>
              </View>
            )}

            {/* Error message */}
            {weatherError && (
              <View className="bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2 mb-3">
                <Text className="text-sm text-red-600 dark:text-red-400">{weatherError}</Text>
              </View>
            )}

            <View className="flex-row mb-3">
              <View className="flex-1 mr-2">
                <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">
                  Low Temp (°F)
                </Text>
                <TextInput
                  value={log.weather.low_temp?.toString() ?? ''}
                  onChangeText={(text) => updateWeather({ low_temp: parseInt(text) || null })}
                  placeholder="--"
                  keyboardType="numeric"
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
                />
              </View>
              <View className="flex-1 ml-2">
                <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">
                  High Temp (°F)
                </Text>
                <TextInput
                  value={log.weather.high_temp?.toString() ?? ''}
                  onChangeText={(text) => updateWeather({ high_temp: parseInt(text) || null })}
                  placeholder="--"
                  keyboardType="numeric"
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
                />
              </View>
            </View>

            <View className="mb-3">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase">
                Sky Condition
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row">
                  {SKY_CONDITIONS.map((cond) => (
                    <Pressable
                      key={cond.value}
                      onPress={() => {
                        Haptics.selectionAsync();
                        updateWeather({ sky_condition: cond.value });
                      }}
                      className={cn(
                        'flex-row items-center px-3 py-2 rounded-xl mr-2',
                        log.weather.sky_condition === cond.value
                          ? 'bg-orange-500'
                          : 'bg-gray-200 dark:bg-gray-700'
                      )}
                    >
                      {cond.icon}
                      <Text
                        className={cn(
                          'ml-1 text-sm font-medium',
                          log.weather.sky_condition === cond.value
                            ? 'text-white'
                            : 'text-gray-700 dark:text-gray-300'
                        )}
                      >
                        {cond.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View className="flex-row mb-3">
              <View className="flex-1 mr-2">
                <InputField
                  label="Precipitation"
                  value={log.weather.precipitation}
                  onChangeText={(text) => updateWeather({ precipitation: text })}
                  placeholder="None, Light rain..."
                  containerClassName="mb-0"
                />
              </View>
              <View className="flex-1 ml-2">
                <InputField
                  label="Wind"
                  value={log.weather.wind}
                  onChangeText={(text) => updateWeather({ wind: text })}
                  placeholder="Calm, 10 mph..."
                  containerClassName="mb-0"
                />
              </View>
            </View>

            <Toggle
              label="Weather Delay"
              value={log.weather.weather_delay}
              onChange={(value) => updateWeather({ weather_delay: value })}
            />
          </SectionCard>
        </View>

        {/* Pending Issues - Most Important */}
        <View className="px-4">
          <SectionCard
            title="Pending Issues"
            collapsed={collapsedSections.issues}
            onToggle={() => toggleSection('issues')}
            className="border-2 border-orange-200 dark:border-orange-800"
          >
            <PendingIssuesSection
              issues={log.pending_issues}
              onAdd={(issue) => addIssue(log.id, issue)}
              onUpdate={(issueId, updates) => updateIssue(log.id, issueId, updates)}
              onRemove={(issueId) => removeIssue(log.id, issueId)}
            />
          </SectionCard>
        </View>

        {/* Activity/Tasks */}
        <View className="px-4">
          <SectionCard
            title="Activity / Tasks"
            collapsed={collapsedSections.tasks}
            onToggle={() => toggleSection('tasks')}
          >
            <TasksSection
              tasks={log.tasks}
              onAdd={(task) => addTask(log.id, task)}
              onUpdate={(taskId, updates) => updateTask(log.id, taskId, updates)}
              onRemove={(taskId) => removeTask(log.id, taskId)}
              totalWorkers={log.daily_totals_workers}
              totalHours={log.daily_totals_hours}
              currentLogId={log.id}
            />
          </SectionCard>
        </View>

        {/* Inspection Notes */}
        <View className="px-4">
          <SectionCard
            title="Inspection Notes"
            collapsed={collapsedSections.inspections}
            onToggle={() => toggleSection('inspections')}
          >
            <InspectionNotesSection
              notes={log.inspection_notes}
              onAdd={(note) => addInspectionNote(log.id, note)}
              onUpdate={(noteId, updates) => updateInspectionNote(log.id, noteId, updates)}
              onRemove={(noteId) => removeInspectionNote(log.id, noteId)}
            />
          </SectionCard>
        </View>

        {/* Additional Work */}
        <View className="px-4">
          <SectionCard
            title="Additional Work / Rework"
            collapsed={collapsedSections.additionalWork}
            onToggle={() => toggleSection('additionalWork')}
          >
            <AdditionalWorkSection
              work={log.additional_work}
              onAdd={(work) => addAdditionalWork(log.id, work)}
              onUpdate={(workId, updates) => updateAdditionalWork(log.id, workId, updates)}
              onRemove={(workId) => removeAdditionalWork(log.id, workId)}
            />
          </SectionCard>
        </View>

        {/* Daily Summary Notes */}
        <View className="px-4">
          <SectionCard
            title="Daily Summary Notes"
            collapsed={collapsedSections.dailySummary}
            onToggle={() => toggleSection('dailySummary')}
            rightAction={
              <View className="flex-row items-center">
                <NotebookPen size={16} color="#F97316" />
                {(log.daily_summary_notes?.length ?? 0) > 0 && (
                  <View className="ml-1 w-2 h-2 rounded-full bg-green-500" />
                )}
              </View>
            }
          >
            <View>
              <Text className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Record overall observations, general notes, or anything not captured in other sections.
              </Text>
              <VoiceInputField
                value={log.daily_summary_notes ?? ''}
                onChangeText={(text) => updateDailyLog(log.id, { daily_summary_notes: text })}
                onAudioRecorded={(uri) => {
                  updateDailyLog(log.id, { daily_summary_audio_uri: uri });
                  addVoiceArtifact(log.id, 'daily_summary', uri);
                }}
                placeholder="Dictate or type your daily summary..."
              />
            </View>
          </SectionCard>
        </View>

        {/* Visitors */}
        <View className="px-4">
          <SectionCard
            title="Visitors"
            collapsed={collapsedSections.visitors}
            onToggle={() => toggleSection('visitors')}
          >
            <VisitorsSection
              visitors={log.visitors}
              onAdd={(visitor) => addVisitor(log.id, visitor)}
              onUpdate={(visitorId, updates) => updateVisitor(log.id, visitorId, updates)}
              onRemove={(visitorId) => removeVisitor(log.id, visitorId)}
            />
          </SectionCard>
        </View>

        {/* Equipment */}
        <View className="px-4">
          <SectionCard
            title="Equipment"
            collapsed={collapsedSections.equipment}
            onToggle={() => toggleSection('equipment')}
          >
            <EquipmentSection
              equipment={log.equipment}
              onAdd={(eq) => addEquipment(log.id, eq)}
              onUpdate={(eqId, updates) => updateEquipment(log.id, eqId, updates)}
              onRemove={(eqId) => removeEquipment(log.id, eqId)}
            />
          </SectionCard>
        </View>

        {/* Materials */}
        <View className="px-4">
          <SectionCard
            title="Materials"
            collapsed={collapsedSections.materials}
            onToggle={() => toggleSection('materials')}
          >
            <MaterialsSection
              materials={log.materials}
              onAdd={(mat) => addMaterial(log.id, mat)}
              onUpdate={(matId, updates) => updateMaterial(log.id, matId, updates)}
              onRemove={(matId) => removeMaterial(log.id, matId)}
            />
          </SectionCard>
        </View>

        {/* Auto-save indicator */}
        <View className="px-4 py-4 items-center">
          <View className="flex-row items-center mb-2">
            <SyncStatusBadge
              status={log.sync_status ?? 'pending'}
              lastSyncedAt={log.last_synced_at}
              onSync={() => syncDailyLogs([log.id])}
            />
          </View>
          <Text className="text-xs text-gray-400 dark:text-gray-500">
            Auto-saved · Last updated {format(new Date(log.updated_at), 'h:mm a')}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
