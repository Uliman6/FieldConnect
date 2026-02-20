import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useDailyLogStore } from '@/lib/store';
import {
  createVoiceList,
  updateVoiceList,
  parseVoiceListTranscript,
  queryKeys,
  VoiceListType,
} from '@/lib/api';
import { getBackendId } from '@/lib/data-provider';
import { useLanguage } from '@/i18n/LanguageProvider';
import { transcribeAudio } from '@/lib/transcription';
import {
  Mic,
  MicOff,
  Square,
  ChevronLeft,
  FileText,
  Package,
  Clipboard,
  List,
  Check,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';

const LIST_TYPES: { type: VoiceListType; icon: any; labelKey: string }[] = [
  { type: 'material_list', icon: Package, labelKey: 'materialList' },
  { type: 'inventory', icon: List, labelKey: 'inventory' },
  { type: 'punch_list', icon: Clipboard, labelKey: 'punchList' },
  { type: 'action_items', icon: Check, labelKey: 'actionItems' },
];

export default function VoiceListCreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const queryClient = useQueryClient();
  const { t, transcriptionLanguage } = useLanguage();

  const currentProjectId = useDailyLogStore((s) => s.currentProjectId);
  const projects = useDailyLogStore((s) => s.projects);
  const projectId = params.projectId || currentProjectId;
  const currentProject = projects.find((p) => p.id === projectId);

  // Get backend project ID
  const backendProjectId = projectId
    ? (getBackendId('projects', projectId) || projectId)
    : undefined;

  // State
  const [listName, setListName] = useState('');
  const [listType, setListType] = useState<VoiceListType>('material_list');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [createdListId, setCreatedListId] = useState<string | null>(null);

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Recording pulse animation
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withTiming(1.2, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // Create voice list mutation
  const createListMutation = useMutation({
    mutationFn: createVoiceList,
    onSuccess: (data) => {
      setCreatedListId(data.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.voiceLists() });
    },
  });

  // Parse transcript mutation
  const parseMutation = useMutation({
    mutationFn: ({ id, transcript }: { id: string; transcript: string }) =>
      parseVoiceListTranscript(id, { transcript, append: false }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.voiceList(data.voiceList.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.voiceLists() });

      // Navigate to detail screen
      if (Platform.OS === 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.replace(`/voice-list-detail?id=${data.voiceList.id}`);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), t('voiceLists.parseError'));
      setIsProcessing(false);
    },
  });

  // Start recording
  const startRecording = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Not supported', 'Voice recording is only available on web');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(1000); // Collect data every second
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error('[voice-list] Error starting recording:', error);
      Alert.alert(t('common.error'), t('voice.noPermission'));
    }
  }, [t]);

  // Stop recording and process
  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current) return;

    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Stop the media recorder
    const mediaRecorder = mediaRecorderRef.current;

    return new Promise<void>((resolve) => {
      mediaRecorder.onstop = async () => {
        // Stop all tracks
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        console.log('[voice-list] Recording stopped, blob size:', audioBlob.size);

        if (audioBlob.size < 1000) {
          Alert.alert(t('common.error'), t('voice.tooShort'));
          resolve();
          return;
        }

        // Start processing
        setIsProcessing(true);

        try {
          // Create the voice list first if not created
          let listId = createdListId;
          if (!listId && backendProjectId) {
            const newList = await createVoiceList({
              project_id: backendProjectId,
              name: listName || t('voiceLists.newList'),
              list_type: listType,
              language: transcriptionLanguage,
            });
            listId = newList.id;
            setCreatedListId(listId);
          }

          if (!listId) {
            throw new Error('Could not create voice list');
          }

          // Transcribe the audio - create blob URL first
          console.log('[voice-list] Transcribing audio, language:', transcriptionLanguage);
          const audioBlobUrl = URL.createObjectURL(audioBlob);
          const transcriptionResult = await transcribeAudio(audioBlobUrl, {
            language: transcriptionLanguage,
          });
          // Clean up the blob URL after use
          URL.revokeObjectURL(audioBlobUrl);

          if (!transcriptionResult.success || !transcriptionResult.text) {
            throw new Error(transcriptionResult.error || 'Transcription failed');
          }

          console.log('[voice-list] Transcription result:', transcriptionResult.text.substring(0, 100));
          setTranscript(transcriptionResult.text);

          // Parse the transcript
          await parseMutation.mutateAsync({
            id: listId,
            transcript: transcriptionResult.text,
          });
        } catch (error: any) {
          console.error('[voice-list] Error processing:', error);
          Alert.alert(t('common.error'), error.message || t('voiceLists.parseError'));
          setIsProcessing(false);
        }

        resolve();
      };

      mediaRecorder.stop();
    });
  }, [
    createdListId,
    backendProjectId,
    listName,
    listType,
    transcriptionLanguage,
    t,
    parseMutation,
  ]);

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  if (!backendProjectId) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center p-6">
        <Text className="text-gray-500 dark:text-gray-400 text-center">
          {t('forms.selectProject')}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <View className="bg-white dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="p-2 -ml-2 rounded-lg"
          hitSlop={8}
        >
          <ChevronLeft size={24} color="#6B7280" />
        </Pressable>
        <Text className="text-lg font-semibold text-gray-900 dark:text-white ml-2 flex-1">
          {t('voiceLists.newList')}
        </Text>
      </View>

      <ScrollView className="flex-1 p-4">
        {/* List Name Input */}
        <Animated.View entering={FadeIn.delay(100)} className="mb-6">
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('voiceLists.listName')}
          </Text>
          <TextInput
            value={listName}
            onChangeText={setListName}
            placeholder={t('voiceLists.newList')}
            placeholderTextColor="#9CA3AF"
            className="bg-white dark:bg-gray-800 rounded-xl px-4 py-3 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"
          />
        </Animated.View>

        {/* List Type Selection */}
        <Animated.View entering={FadeIn.delay(200)} className="mb-6">
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('voiceLists.listType')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {LIST_TYPES.map(({ type, icon: Icon, labelKey }) => (
              <Pressable
                key={type}
                onPress={() => setListType(type)}
                className={`flex-row items-center px-4 py-2 rounded-xl border ${
                  listType === type
                    ? 'bg-orange-100 dark:bg-orange-900/30 border-orange-500'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}
              >
                <Icon
                  size={18}
                  color={listType === type ? '#F97316' : '#6B7280'}
                />
                <Text
                  className={`ml-2 font-medium ${
                    listType === type
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {t(`voiceLists.${labelKey}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Voice Commands Help */}
        <Animated.View
          entering={FadeIn.delay(300)}
          className="mb-8 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4"
        >
          <Text className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
            {t('voiceLists.voiceCommands')}
          </Text>
          <Text className="text-sm text-blue-600 dark:text-blue-400">
            {t('voiceLists.voiceCommandsHelp')}
          </Text>
        </Animated.View>

        {/* Recording Status */}
        {(isRecording || isProcessing) && (
          <Animated.View
            entering={FadeIn}
            className="mb-6 bg-white dark:bg-gray-800 rounded-xl p-4 items-center"
          >
            {isRecording && (
              <>
                <Text className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  {formatDuration(recordingDuration)}
                </Text>
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  {t('voiceLists.recording')}
                </Text>
              </>
            )}
            {isProcessing && (
              <>
                <ActivityIndicator size="large" color="#F97316" />
                <Text className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {t('voiceLists.processing')}
                </Text>
              </>
            )}
          </Animated.View>
        )}
      </ScrollView>

      {/* Recording Button */}
      <View className="p-6 items-center">
        <Animated.View style={isRecording ? pulseStyle : undefined}>
          <Pressable
            onPress={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`w-20 h-20 rounded-full items-center justify-center ${
              isRecording
                ? 'bg-red-500'
                : isProcessing
                ? 'bg-gray-400'
                : 'bg-orange-500'
            }`}
            style={{
              shadowColor: isRecording ? '#EF4444' : '#F97316',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            {isProcessing ? (
              <ActivityIndicator size="large" color="white" />
            ) : isRecording ? (
              <Square size={32} color="white" fill="white" />
            ) : (
              <Mic size={32} color="white" />
            )}
          </Pressable>
        </Animated.View>

        <Text className="text-sm text-gray-500 dark:text-gray-400 mt-4 text-center">
          {isRecording
            ? t('voiceLists.stopRecording')
            : isProcessing
            ? t('voiceLists.processing')
            : t('voiceLists.tapToRecord')}
        </Text>
      </View>
    </View>
  );
}
