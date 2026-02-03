import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { format, parseISO, addDays, subDays } from 'date-fns';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Mic,
  FileText,
  CheckCircle2,
  Cloud,
} from 'lucide-react-native';
import { useDailyLogStore } from '@/lib/store';
import { InputField } from '@/components/ui';
import { MasterVoiceCapture } from '@/components/MasterVoiceCapture';
import { SavedRecordingPlayer } from '@/components/SavedRecordingPlayer';
import { SyncStatusBadge } from '@/components/SyncStatus';
import { syncDailyLogs, syncDailyLogToBackend } from '@/lib/sync';
import { transcribeAudio } from '@/lib/transcription';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/i18n/LanguageProvider';

export default function DailyLogScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, transcriptionLanguage } = useLanguage();

  // Store selectors
  const currentLogId = useDailyLogStore((s) => s.currentLogId);
  const dailyLogs = useDailyLogStore((s) => s.dailyLogs);
  const projects = useDailyLogStore((s) => s.projects);
  const currentProjectId = useDailyLogStore((s) => s.currentProjectId);

  const log = dailyLogs.find((l) => l.id === currentLogId);
  const project = projects.find((p) => p.id === currentProjectId);

  // Store actions
  const updateDailyLog = useDailyLogStore((s) => s.updateDailyLog);
  const setCurrentLog = useDailyLogStore((s) => s.setCurrentLog);
  const setCurrentProject = useDailyLogStore((s) => s.setCurrentProject);
  const createDailyLog = useDailyLogStore((s) => s.createDailyLog);
  const addVoiceArtifact = useDailyLogStore((s) => s.addVoiceArtifact);
  const updateVoiceArtifact = useDailyLogStore((s) => s.updateVoiceArtifact);

  // Transcription and sync state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date | null>(null);

  // Get master recording artifact
  const masterRecordingArtifact = log?.voice_artifacts?.find(
    (a) => a.section_key === 'master_recording'
  );
  const transcriptText = masterRecordingArtifact?.transcript_text ?? '';

  // Ensure a log exists when a project is selected but no log exists
  useEffect(() => {
    if (currentProjectId && !log) {
      const today = new Date().toISOString().split('T')[0];
      const existingLog = dailyLogs.find(
        (l) => l.project_id === currentProjectId && l.date === today
      );

      if (existingLog) {
        setCurrentLog(existingLog.id);
      } else {
        createDailyLog(currentProjectId);
      }
    }
  }, [currentProjectId, log, dailyLogs, setCurrentLog, createDailyLog]);

  // Handle date navigation
  const handlePrevDay = useCallback(() => {
    if (!log) return;

    const projectId = log.project_id;
    if (!projectId) return;

    Haptics.selectionAsync();
    const newDate = format(subDays(parseISO(log.date), 1), 'yyyy-MM-dd');

    const existingLog = dailyLogs.find(
      (l) => l.project_id === projectId && l.date === newDate
    );

    if (existingLog) {
      setCurrentLog(existingLog.id);
    } else {
      const newLog = createDailyLog(projectId);
      updateDailyLog(newLog.id, { date: newDate });
    }
  }, [log, dailyLogs, setCurrentLog, createDailyLog, updateDailyLog]);

  const handleNextDay = useCallback(() => {
    if (!log) return;

    const projectId = log.project_id;
    if (!projectId) return;

    Haptics.selectionAsync();
    const newDate = format(addDays(parseISO(log.date), 1), 'yyyy-MM-dd');

    const existingLog = dailyLogs.find(
      (l) => l.project_id === projectId && l.date === newDate
    );

    if (existingLog) {
      setCurrentLog(existingLog.id);
    } else {
      const newLog = createDailyLog(projectId);
      updateDailyLog(newLog.id, { date: newDate });
    }
  }, [log, dailyLogs, setCurrentLog, createDailyLog, updateDailyLog]);

  const handleDateChange = useCallback((selectedDate: Date) => {
    if (!log) {
      console.warn('[daily-log] Cannot change date: no current log');
      return;
    }

    const projectId = log.project_id;
    if (!projectId) {
      console.warn('[daily-log] Cannot change date: log has no project_id');
      return;
    }

    const newDate = format(selectedDate, 'yyyy-MM-dd');

    // Find or create log for this date within the SAME project as current log
    const existingLog = dailyLogs.find(
      (l) => l.project_id === projectId && l.date === newDate
    );

    if (existingLog) {
      setCurrentLog(existingLog.id);
    } else {
      const newLog = createDailyLog(projectId);
      updateDailyLog(newLog.id, { date: newDate });
    }
    setShowDatePicker(false);
    setTempDate(null);
  }, [log, dailyLogs, setCurrentLog, createDailyLog, updateDailyLog]);

  const openDatePicker = () => {
    Haptics.selectionAsync();
    setTempDate(log ? parseISO(log.date) : new Date());
    setShowDatePicker(true);
  };

  const cancelDatePicker = () => {
    setShowDatePicker(false);
    setTempDate(null);
  };

  const confirmDatePicker = () => {
    if (tempDate) {
      handleDateChange(tempDate);
    }
  };

  // Transcribe master recording
  const transcribeMasterRecording = useCallback(async (audioUri: string, artifactId: string) => {
    if (!log) return;

    setIsTranscribing(true);
    setTranscriptionError(null);

    try {
      const result = await transcribeAudio(audioUri, { language: transcriptionLanguage });

      if (result.success && result.text) {
        updateVoiceArtifact(log.id, artifactId, {
          transcript_text: result.text,
          status: 'transcribed',
        });

        // Sync to backend after transcription - wait for it to complete
        setIsTranscribing(false);
        setIsSyncing(true);

        try {
          const updatedLog = useDailyLogStore.getState().dailyLogs.find(l => l.id === log.id);
          if (updatedLog) {
            await syncDailyLogToBackend(updatedLog);
          }
        } catch (syncError) {
          console.error('[daily-log] Sync failed:', syncError);
          // Don't block the user if sync fails - they can retry later
        } finally {
          setIsSyncing(false);
        }
      } else {
        setTranscriptionError(result.error || 'Transcription failed');
        updateVoiceArtifact(log.id, artifactId, { status: 'error' });
        setIsTranscribing(false);
      }
    } catch (error) {
      setTranscriptionError('Transcription failed');
      updateVoiceArtifact(log.id, artifactId, { status: 'error' });
      setIsTranscribing(false);
    }
  }, [log, updateVoiceArtifact, transcriptionLanguage]);

  // Navigate to edit page
  const handleEditLog = useCallback(() => {
    if (log) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/daily-log-detail?id=${log.id}`);
    }
  }, [log, router]);

  // Show placeholder if no log
  if (!log || !currentProjectId) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center p-8">
        <View className="w-20 h-20 rounded-full bg-orange-100 dark:bg-orange-900/30 items-center justify-center mb-4">
          <FileText size={40} color="#F97316" />
        </View>
        <Text className="text-xl font-semibold text-gray-900 dark:text-white text-center mb-2">
          {t('projects.projectRequired')}
        </Text>
        <Text className="text-gray-500 dark:text-gray-400 text-center">
          {t('projects.selectProject')}
        </Text>
      </View>
    );
  }

  const hasRecording = !!log.daily_summary_audio_uri;
  const hasTranscript = !!transcriptText;

  return (
    <ScrollView
      className="flex-1 bg-gray-50 dark:bg-gray-900"
      contentContainerStyle={{ paddingBottom: 120 }}
    >
      {/* Header */}
      <View
        className="bg-white dark:bg-gray-800 px-4 pb-4"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('dailyLog.title')}
          </Text>
          <SyncStatusBadge
            status={log.sync_status ?? 'pending'}
            lastSyncedAt={log.last_synced_at}
            onSync={() => syncDailyLogs([log.id])}
          />
        </View>

        {/* Date Navigation */}
        <View className="mt-2">
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={handlePrevDay}
              className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg"
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
              className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg"
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
                  {t('dailyLog.date')}
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
                        {t('common.cancel')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={confirmDatePicker}
                      className="flex-1 py-3 ml-2 bg-orange-500 rounded-xl"
                    >
                      <Text className="text-center font-medium text-white">
                        {t('common.confirm')}
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
          <View className="mt-3 bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
            <Text className="text-base font-semibold text-gray-900 dark:text-white">
              {project.name}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              #{project.number} · {project.address}
            </Text>
          </View>
        )}
      </View>

      {/* Main Content */}
      <View className="px-4 mt-4">
        {/* Prepared by */}
        <View className="mb-4">
          <InputField
            label="Prepared By"
            value={log.prepared_by}
            onChangeText={(text) => updateDailyLog(log.id, { prepared_by: text })}
            placeholder="Your name"
          />
        </View>

        {/* Recording Section */}
        <View className="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-4">
          <View className="flex-row items-center mb-3">
            <View className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 items-center justify-center">
              <Mic size={20} color="#F97316" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('dailyLog.startRecording')}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                {t('dailyLog.tapToRecord')}
              </Text>
            </View>
          </View>

          {log.daily_summary_audio_uri ? (
            <SavedRecordingPlayer
              audioUri={log.daily_summary_audio_uri}
              transcriptText={transcriptText}
              isTranscribing={isTranscribing}
              transcriptionError={transcriptionError}
              onReRecord={() => {
                updateDailyLog(log.id, { daily_summary_audio_uri: undefined });
                setTranscriptionError(null);
              }}
              onDelete={() => {
                updateDailyLog(log.id, { daily_summary_audio_uri: undefined });
                setTranscriptionError(null);
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
                updateDailyLog(log.id, { daily_summary_audio_uri: audioUri });
                addVoiceArtifact(log.id, 'master_recording', audioUri);

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

        {/* Status Card */}
        {hasRecording && (
          <View className={cn(
            'rounded-2xl p-4 mb-4',
            hasTranscript && !isSyncing
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : isSyncing
                ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
          )}>
            <View className="flex-row items-center">
              {isSyncing ? (
                <>
                  <Cloud size={24} color="#3B82F6" />
                  <View className="ml-3 flex-1">
                    <Text className="font-semibold text-blue-800 dark:text-blue-200">
                      {t('sync.syncing')}
                    </Text>
                    <Text className="text-sm text-blue-600 dark:text-blue-400">
                      {t('common.loading')}
                    </Text>
                  </View>
                </>
              ) : hasTranscript ? (
                <>
                  <CheckCircle2 size={24} color="#22C55E" />
                  <View className="ml-3 flex-1">
                    <Text className="font-semibold text-green-800 dark:text-green-200">
                      {t('sync.synced')}
                    </Text>
                    <Text className="text-sm text-green-600 dark:text-green-400">
                      {t('common.success')}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Mic size={24} color="#EAB308" />
                  <View className="ml-3 flex-1">
                    <Text className="font-semibold text-yellow-800 dark:text-yellow-200">
                      {t('dailyLog.recording')}
                    </Text>
                    <Text className="text-sm text-yellow-600 dark:text-yellow-400">
                      {isTranscribing ? t('dailyLog.transcribing') : t('dailyLog.processing')}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        {/* Edit/View Details Button */}
        {hasRecording && (
          <Pressable
            onPress={handleEditLog}
            disabled={isTranscribing || isSyncing}
            className={cn(
              'rounded-xl py-4 px-6 flex-row items-center justify-center',
              isTranscribing || isSyncing
                ? 'bg-gray-300 dark:bg-gray-600'
                : 'bg-orange-500'
            )}
          >
            <FileText size={20} color="white" />
            <Text className="ml-2 text-white font-semibold text-base">
              {isTranscribing
                ? t('dailyLog.transcribing')
                : isSyncing
                  ? t('sync.syncing')
                  : t('dailyLog.viewEdit')}
            </Text>
          </Pressable>
        )}

        {/* Info text */}
        <View className="mt-6 px-2">
          <Text className="text-center text-sm text-gray-500 dark:text-gray-400">
            Record your daily observations, then view the report in History to make edits or download the PDF.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
