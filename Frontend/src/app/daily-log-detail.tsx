import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { format, parseISO } from 'date-fns';
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
  ArrowLeft,
  Download,
  Eye,
} from 'lucide-react-native';
import { useDailyLogStore } from '@/lib/store';
import { SkyCondition, WeatherConditions } from '@/lib/types';
import { SectionCard, InputField, Toggle, Button } from '@/components/ui';
import { PendingIssuesSection } from '@/components/PendingIssues';
import { TasksSection, VisitorsSection, EquipmentSection, MaterialsSection } from '@/components/RepeatingSections';
import { InspectionNotesSection, AdditionalWorkSection } from '@/components/InsightSections';
import { VoiceInputField } from '@/components/VoiceRecorder';
import { SyncStatusBadge } from '@/components/SyncStatus';
import { syncDailyLogs } from '@/lib/sync';
import { fetchWeatherCached, weatherToConditions, clearWeatherCache } from '@/lib/weather';
import { fetchDailyLogPdf } from '@/lib/api';
import { cn } from '@/lib/cn';

const SKY_CONDITIONS: { label: string; value: SkyCondition; icon: React.ReactNode }[] = [
  { label: 'Clear', value: 'Clear', icon: <Sun size={16} color="#F59E0B" /> },
  { label: 'Partly Cloudy', value: 'Partly Cloudy', icon: <Cloud size={16} color="#9CA3AF" /> },
  { label: 'Cloudy', value: 'Cloudy', icon: <Cloud size={16} color="#6B7280" /> },
  { label: 'Overcast', value: 'Overcast', icon: <Cloud size={16} color="#4B5563" /> },
  { label: 'Rainy', value: 'Rainy', icon: <CloudRain size={16} color="#3B82F6" /> },
  { label: 'Stormy', value: 'Stormy', icon: <CloudRain size={16} color="#1E40AF" /> },
];

export default function DailyLogDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Store selectors
  const dailyLogs = useDailyLogStore((s) => s.dailyLogs);
  const projects = useDailyLogStore((s) => s.projects);

  const log = dailyLogs.find((l) => l.id === id);
  const project = log ? projects.find((p) => p.id === log.project_id) : null;

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
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  const toggleSection = (section: keyof typeof collapsedSections) => {
    Haptics.selectionAsync();
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Weather update helper
  const updateWeather = useCallback(
    (updates: Partial<WeatherConditions>) => {
      if (!log) return;
      const newWeather = { ...log.weather, ...updates };
      updateDailyLog(log.id, { weather: newWeather });
    },
    [log, updateDailyLog]
  );

  // Fetch weather
  const fetchWeather = useCallback(
    async (forceRefresh = false) => {
      if (!log || !project?.address) return;

      setIsLoadingWeather(true);
      try {
        if (forceRefresh) {
          clearWeatherCache();
        }
        const weatherData = await fetchWeatherCached(project.address, log.date);
        if (weatherData) {
          const conditions = weatherToConditions(weatherData);
          updateDailyLog(log.id, { weather: conditions });
        }
      } catch (error) {
        console.error('Failed to fetch weather:', error);
      } finally {
        setIsLoadingWeather(false);
      }
    },
    [log, project, updateDailyLog]
  );

  // Auto-fetch weather on load if empty
  useEffect(() => {
    if (log && project?.address && !log.weather.sky_condition) {
      fetchWeather();
    }
  }, [log?.id, project?.address]);

  // View PDF
  const handleViewPdf = useCallback(async () => {
    if (!log?.server_id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsLoadingPdf(true);
    try {
      const blobUrl = await fetchDailyLogPdf(log.server_id, true);
      if (Platform.OS === 'web') {
        window.open(blobUrl, '_blank');
      }
    } catch (error) {
      console.error('[pdf] Failed to fetch PDF:', error);
    } finally {
      setIsLoadingPdf(false);
    }
  }, [log?.server_id]);

  // Copy summary
  const handleCopySummary = useCallback(async () => {
    if (!log) return;
    const summary = `Daily Log - ${format(parseISO(log.date), 'MMM d, yyyy')}
Project: ${project?.name || 'Unknown'}
Weather: ${log.weather.sky_condition || 'N/A'}, ${log.weather.low_temp ?? '--'}° - ${log.weather.high_temp ?? '--'}°
Tasks: ${log.tasks.length}
Issues: ${log.pending_issues.length}
Workers: ${log.daily_totals_workers}
Hours: ${log.daily_totals_hours}`;

    await Clipboard.setStringAsync(summary);
    setCopiedSummary(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopiedSummary(false), 2000);
  }, [log, project]);

  // No log found
  if (!log) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center p-8">
        <FileText size={48} color="#9CA3AF" />
        <Text className="mt-4 text-lg text-gray-500 dark:text-gray-400 text-center">
          Daily log not found
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 bg-orange-500 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-gray-50 dark:bg-gray-900"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View
          className="bg-white dark:bg-gray-800 px-4 pb-4"
          style={{ paddingTop: insets.top + 8 }}
        >
          <View className="flex-row items-center mb-3">
            <Pressable
              onPress={() => router.back()}
              className="p-2 -ml-2 mr-2"
            >
              <ArrowLeft size={24} color="#6B7280" />
            </Pressable>
            <View className="flex-1">
              <Text className="text-xl font-bold text-gray-900 dark:text-white">
                Edit Daily Log
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                {format(parseISO(log.date), 'EEEE, MMMM d, yyyy')}
              </Text>
            </View>
            <SyncStatusBadge
              status={log.sync_status ?? 'pending'}
              lastSyncedAt={log.last_synced_at}
              onSync={() => syncDailyLogs([log.id])}
            />
          </View>

          {/* Project info */}
          {project && (
            <View className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                {project.name}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                #{project.number} · {project.address}
              </Text>
            </View>
          )}

          {/* Quick Actions */}
          <View className="flex-row mt-3 space-x-2">
            {log.server_id && (
              <Pressable
                onPress={handleViewPdf}
                disabled={isLoadingPdf}
                className="flex-1 flex-row items-center justify-center py-3 bg-orange-500 rounded-xl"
              >
                {isLoadingPdf ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Eye size={18} color="white" />
                    <Text className="ml-2 text-white font-semibold">View PDF</Text>
                  </>
                )}
              </Pressable>
            )}
            <Pressable
              onPress={handleCopySummary}
              className="flex-1 flex-row items-center justify-center py-3 bg-gray-200 dark:bg-gray-700 rounded-xl ml-2"
            >
              {copiedSummary ? (
                <>
                  <Check size={18} color="#22C55E" />
                  <Text className="ml-2 text-green-600 font-semibold">Copied!</Text>
                </>
              ) : (
                <>
                  <Copy size={18} color="#6B7280" />
                  <Text className="ml-2 text-gray-700 dark:text-gray-300 font-semibold">Copy Summary</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>

        {/* Prepared by */}
        <View className="px-4 mt-4">
          <InputField
            label="Prepared By"
            value={log.prepared_by}
            onChangeText={(text) => updateDailyLog(log.id, { prepared_by: text })}
            placeholder="Your name"
          />
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
                  isLoadingWeather ? 'bg-gray-100 dark:bg-gray-800' : 'bg-orange-100 dark:bg-orange-900/30'
                )}
              >
                <RefreshCw
                  size={18}
                  color={isLoadingWeather ? '#9CA3AF' : '#F97316'}
                  style={isLoadingWeather ? { transform: [{ rotate: '45deg' }] } : undefined}
                />
                <Text
                  className={cn(
                    'ml-2 font-medium',
                    isLoadingWeather ? 'text-gray-400' : 'text-orange-600 dark:text-orange-400'
                  )}
                >
                  {isLoadingWeather ? 'Fetching weather...' : 'Auto-fetch Weather'}
                </Text>
              </Pressable>
            )}

            {/* Temperature row */}
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

        {/* Pending Issues */}
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
                Additional notes or observations not captured elsewhere.
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
          <Text className="text-xs text-gray-400 dark:text-gray-500">
            Auto-saved · Last updated {format(new Date(log.updated_at), 'h:mm a')}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
