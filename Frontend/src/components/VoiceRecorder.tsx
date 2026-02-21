import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Platform, Modal } from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Mic, Play, Pause, X, StopCircle, CheckCircle2 } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  FadeIn,
} from 'react-native-reanimated';
import { cn } from '@/lib/cn';
import { persistAudioFile, audioFileExists } from '@/lib/audio-storage';
import { transcribeAudio, isTranscriptionAvailable } from '@/lib/transcription';

interface VoiceRecorderProps {
  onTranscription: (text: string, audioUri?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Compact mode for inline use in forms */
  compact?: boolean;
  /** Title shown in the modal header */
  title?: string;
}

export function VoiceRecorder({
  onTranscription,
  placeholder = 'Tap to record',
  disabled,
  compact = false,
  title = 'Voice Recording'
}: VoiceRecorderProps) {
  const [showModal, setShowModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [lastRecordingUri, setLastRecordingUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [capturedDuration, setCapturedDuration] = useState(0);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (showModal) {
      checkPermissions();
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [showModal]);

  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 800 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(pulseScale);
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording, pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const checkPermissions = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    } catch (error) {
      console.log('Permission error:', error);
      setHasPermission(false);
    }
  };

  const startRecording = async () => {
    if (!hasPermission) {
      await checkPermissions();
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // Stop any playing audio
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        setIsPlaying(false);
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;

      setIsRecording(true);
      setRecordingDuration(0);
      setCapturedDuration(0);
      setLastRecordingUri(null);

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.log('Recording error:', error);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const recording = recordingRef.current;
      recordingRef.current = null;

      // Save the final duration before resetting
      setCapturedDuration(recordingDuration);
      setIsRecording(false);
      setIsProcessing(true);

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      console.log('Recording stopped, URI:', uri);

      if (uri) {
        const persistentUri = await persistAudioFile(uri);
        console.log('Audio persisted to:', persistentUri);
        setLastRecordingUri(persistentUri);

        // Load for playback
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
        const { sound } = await Audio.Sound.createAsync({ uri: persistentUri });
        if (soundRef.current) {
          await soundRef.current.unloadAsync();
        }
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setIsPlaying(false);
          }
        });
      }

      setIsProcessing(false);
    } catch (error) {
      console.log('Stop recording error:', error);
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  const togglePlayback = async () => {
    if (!soundRef.current || !lastRecordingUri) return;

    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded && status.positionMillis === status.durationMillis) {
          await soundRef.current.setPositionAsync(0);
        }
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch (error) {
      console.log('Playback error:', error);
    }
  };

  const handleSave = async () => {
    if (lastRecordingUri) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Start transcription if available
      if (isTranscriptionAvailable()) {
        setIsTranscribing(true);
        try {
          const result = await transcribeAudio(lastRecordingUri);
          if (result.success && result.text) {
            console.log('Transcription complete:', result.text.substring(0, 50) + '...');
            onTranscription(result.text, lastRecordingUri);
          } else {
            console.log('Transcription failed or empty:', result.error);
            onTranscription('', lastRecordingUri);
          }
        } catch (error) {
          console.error('Transcription error:', error);
          onTranscription('', lastRecordingUri);
        } finally {
          setIsTranscribing(false);
        }
      } else {
        onTranscription('', lastRecordingUri);
      }

      setShowModal(false);
      // Reset state
      setLastRecordingUri(null);
      setRecordingDuration(0);
    }
  };

  const handleClose = () => {
    if (recordingRef.current) {
      recordingRef.current.stopAndUnloadAsync();
      recordingRef.current = null;
    }
    if (soundRef.current) {
      soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setIsProcessing(false);
    setLastRecordingUri(null);
    setRecordingDuration(0);
    setCapturedDuration(0);
    setShowModal(false);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (hasPermission === false) {
    return (
      <Pressable
        onPress={checkPermissions}
        className="flex-row items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3"
      >
        <Mic size={20} color="#1F5C1A" />
        <Text className="ml-2 text-gray-600 dark:text-gray-400">Tap to enable microphone</Text>
      </Pressable>
    );
  }

  // Compact trigger button
  if (compact) {
    return (
      <>
        <View className="items-center">
          <Pressable
            onPress={() => setShowModal(true)}
            disabled={disabled || isTranscribing}
            className={cn(
              'w-12 h-12 rounded-full items-center justify-center bg-orange-500',
              (disabled || isTranscribing) && 'opacity-50'
            )}
          >
            {isTranscribing ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Mic size={22} color="white" />
            )}
          </Pressable>
          <Text className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {isTranscribing ? 'Transcribing...' : placeholder}
          </Text>
        </View>

        {/* Recording Modal */}
        <Modal
          visible={showModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={handleClose}
        >
          <View className="flex-1 bg-gray-50 dark:bg-black">
            {/* Header */}
            <View className="flex-row items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800">
              <Pressable onPress={handleClose} className="p-2">
                <X size={24} color="#6B7280" />
              </Pressable>
              <Text className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </Text>
              <View className="w-10" />
            </View>

            <View className="flex-1 justify-center items-center px-4">
              {/* Recording Section */}
              <Animated.View
                entering={FadeIn}
                className="bg-white dark:bg-gray-800 rounded-2xl p-8 items-center w-full max-w-sm"
              >
                {/* Recording Button */}
                <Animated.View style={pulseStyle}>
                  <Pressable
                    onPress={isRecording ? stopRecording : startRecording}
                    disabled={isProcessing}
                    className={cn(
                      'w-24 h-24 rounded-full items-center justify-center',
                      isRecording ? 'bg-red-500' : 'bg-orange-500',
                      isProcessing && 'opacity-50'
                    )}
                  >
                    {isProcessing ? (
                      <ActivityIndicator color="white" size="large" />
                    ) : isRecording ? (
                      <StopCircle size={40} color="white" />
                    ) : (
                      <Mic size={40} color="white" />
                    )}
                  </Pressable>
                </Animated.View>

                <Text className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
                  {isProcessing ? 'Saving...' : isRecording ? formatDuration(recordingDuration) : formatDuration(capturedDuration)}
                </Text>

                <Text className="mt-2 text-sm text-gray-500 dark:text-gray-400 text-center">
                  {isRecording
                    ? 'Tap to stop recording'
                    : lastRecordingUri
                      ? 'Audio captured successfully!'
                      : 'Tap to start recording'}
                </Text>

                {/* Success message when recording is captured */}
                {lastRecordingUri && !isRecording && !isProcessing && (
                  <Text className="mt-2 text-xs text-green-600 dark:text-green-400 text-center px-4">
                    Tap Play to review, or Save to continue.{'\n'}Your recording will be transcribed automatically.
                  </Text>
                )}

                {/* Playback Controls */}
                {lastRecordingUri && !isRecording && (
                  <View className="flex-row items-center mt-4 gap-3">
                    <Pressable
                      onPress={togglePlayback}
                      className="flex-row items-center bg-blue-100 dark:bg-blue-900/30 px-4 py-2 rounded-full"
                    >
                      {isPlaying ? (
                        <Pause size={18} color="#3B82F6" />
                      ) : (
                        <Play size={18} color="#3B82F6" />
                      )}
                      <Text className="ml-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                        {isPlaying ? 'Pause' : 'Play'}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={startRecording}
                      className="flex-row items-center bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-full"
                    >
                      <Mic size={18} color="#6B7280" />
                      <Text className="ml-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Re-record
                      </Text>
                    </Pressable>
                  </View>
                )}
              </Animated.View>
            </View>

            {/* Save Button */}
            {lastRecordingUri && !isRecording && (
              <View className="p-4 bg-gray-50 dark:bg-black border-t border-gray-200 dark:border-gray-800">
                <Pressable
                  onPress={handleSave}
                  className="flex-row items-center justify-center bg-green-500 rounded-xl py-4"
                >
                  <CheckCircle2 size={20} color="white" />
                  <Text className="ml-2 text-base font-semibold text-white">
                    Save Recording
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </Modal>
      </>
    );
  }

  // Full trigger button (non-compact)
  return (
    <>
      <View className="items-center">
        <Pressable
          onPress={() => setShowModal(true)}
          disabled={disabled || isTranscribing}
          className={cn(
            'w-16 h-16 rounded-full items-center justify-center bg-orange-500 shadow-lg',
            (disabled || isTranscribing) && 'opacity-50'
          )}
        >
          {isTranscribing ? (
            <ActivityIndicator color="white" />
          ) : (
            <Mic size={28} color="white" />
          )}
        </Pressable>

        <Text className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          {isTranscribing ? 'Transcribing audio...' : placeholder}
        </Text>
      </View>

      {/* Recording Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClose}
      >
        <View className="flex-1 bg-gray-50 dark:bg-black">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800">
            <Pressable onPress={handleClose} className="p-2">
              <X size={24} color="#6B7280" />
            </Pressable>
            <Text className="text-lg font-semibold text-gray-900 dark:text-white">
              {title}
            </Text>
            <View className="w-10" />
          </View>

          <View className="flex-1 justify-center items-center px-4">
            {/* Recording Section */}
            <Animated.View
              entering={FadeIn}
              className="bg-white dark:bg-gray-800 rounded-2xl p-8 items-center w-full max-w-sm"
            >
              {/* Recording Button */}
              <Animated.View style={pulseStyle}>
                <Pressable
                  onPress={isRecording ? stopRecording : startRecording}
                  disabled={isProcessing}
                  className={cn(
                    'w-24 h-24 rounded-full items-center justify-center',
                    isRecording ? 'bg-red-500' : 'bg-orange-500',
                    isProcessing && 'opacity-50'
                  )}
                >
                  {isProcessing ? (
                    <ActivityIndicator color="white" size="large" />
                  ) : isRecording ? (
                    <StopCircle size={40} color="white" />
                  ) : (
                    <Mic size={40} color="white" />
                  )}
                </Pressable>
              </Animated.View>

              <Text className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
                {isProcessing ? 'Saving...' : isRecording ? formatDuration(recordingDuration) : formatDuration(capturedDuration)}
              </Text>

              <Text className="mt-2 text-sm text-gray-500 dark:text-gray-400 text-center">
                {isRecording
                  ? 'Tap to stop recording'
                  : lastRecordingUri
                    ? 'Audio captured successfully!'
                    : 'Tap to start recording'}
              </Text>

              {/* Success message when recording is captured */}
              {lastRecordingUri && !isRecording && !isProcessing && (
                <Text className="mt-2 text-xs text-green-600 dark:text-green-400 text-center px-4">
                  Tap Play to review, or Save to continue.{'\n'}Your recording will be transcribed automatically.
                </Text>
              )}

              {/* Playback Controls */}
              {lastRecordingUri && !isRecording && (
                <View className="flex-row items-center mt-4 gap-3">
                  <Pressable
                    onPress={togglePlayback}
                    className="flex-row items-center bg-blue-100 dark:bg-blue-900/30 px-4 py-2 rounded-full"
                  >
                    {isPlaying ? (
                      <Pause size={18} color="#3B82F6" />
                    ) : (
                      <Play size={18} color="#3B82F6" />
                    )}
                    <Text className="ml-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                      {isPlaying ? 'Pause' : 'Play'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={startRecording}
                    className="flex-row items-center bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-full"
                  >
                    <Mic size={18} color="#6B7280" />
                    <Text className="ml-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                      Re-record
                    </Text>
                  </Pressable>
                </View>
              )}
            </Animated.View>
          </View>

          {/* Save Button */}
          {lastRecordingUri && !isRecording && (
            <View className="p-4 bg-gray-50 dark:bg-black border-t border-gray-200 dark:border-gray-800">
              <Pressable
                onPress={handleSave}
                className="flex-row items-center justify-center bg-green-500 rounded-xl py-4"
              >
                <CheckCircle2 size={20} color="white" />
                <Text className="ml-2 text-base font-semibold text-white">
                  Save Recording
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

interface VoiceInputFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  onAudioRecorded?: (uri: string) => void;
  placeholder?: string;
  label?: string;
  audioUri?: string;
  /** Title for the voice recording modal */
  recordingTitle?: string;
}

export function VoiceInputField({
  value,
  onChangeText,
  onAudioRecorded,
  placeholder,
  label,
  audioUri,
  recordingTitle = 'Voice Recording',
}: VoiceInputFieldProps) {
  const [showRecorder, setShowRecorder] = useState(false);
  const [currentAudioUri, setCurrentAudioUri] = useState<string | null>(audioUri ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioExists, setAudioExists] = useState(true);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Check if audio file exists when URI changes
  useEffect(() => {
    if (audioUri) {
      setCurrentAudioUri(audioUri);
      setIsLoadingAudio(true);
      audioFileExists(audioUri).then((exists) => {
        setAudioExists(exists);
        setIsLoadingAudio(false);
        if (!exists) {
          console.log('[VoiceInputField] Audio file not found:', audioUri);
        }
      });
    } else {
      setCurrentAudioUri(null);
      setAudioExists(true);
    }
  }, [audioUri]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const handleTranscription = (_text: string, newAudioUri?: string) => {
    if (newAudioUri) {
      setCurrentAudioUri(newAudioUri);
      setAudioExists(true);
      onAudioRecorded?.(newAudioUri);
    }
    setShowRecorder(false);
  };

  const togglePlayback = async () => {
    if (!currentAudioUri || !audioExists) return;

    try {
      if (isPlaying && soundRef.current) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      // Unload previous sound if URI changed
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync({ uri: currentAudioUri });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });

      await soundRef.current.playAsync();
      setIsPlaying(true);
    } catch (error) {
      console.log('Playback error:', error);
      setAudioExists(false);
    }
  };

  return (
    <View className="mb-3">
      {label && (
        <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
          {label}
        </Text>
      )}

      <View className="bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden">
        <View className="flex-row items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <Pressable
            onPress={() => setShowRecorder(!showRecorder)}
            className="flex-row items-center flex-1"
          >
            <Text className="text-sm text-orange-500 font-medium">
              {showRecorder ? 'Hide Recorder' : 'Voice Input'}
            </Text>
            {currentAudioUri && audioExists && (
              <View className="ml-2 px-2 py-0.5 bg-green-100 dark:bg-green-900 rounded">
                <Text className="text-xs text-green-600 dark:text-green-400">Recorded</Text>
              </View>
            )}
            {currentAudioUri && !audioExists && !isLoadingAudio && (
              <View className="ml-2 px-2 py-0.5 bg-red-100 dark:bg-red-900 rounded">
                <Text className="text-xs text-red-600 dark:text-red-400">Audio Lost</Text>
              </View>
            )}
          </Pressable>

          <View className="flex-row items-center">
            {/* Playback button */}
            {currentAudioUri && audioExists && !showRecorder && (
              <Pressable
                onPress={togglePlayback}
                className="mr-3 flex-row items-center bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-lg"
              >
                {isPlaying ? (
                  <Pause size={14} color="#3B82F6" />
                ) : (
                  <Play size={14} color="#3B82F6" />
                )}
                <Text className="ml-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                  {isPlaying ? 'Pause' : 'Play'}
                </Text>
              </Pressable>
            )}
            <Pressable onPress={() => setShowRecorder(!showRecorder)}>
              <Mic size={18} color="#1F5C1A" />
            </Pressable>
          </View>
        </View>

        {showRecorder && (
          <View className="py-4">
            <VoiceRecorder
              onTranscription={handleTranscription}
              placeholder="Tap to record"
              compact
              title={recordingTitle}
            />
          </View>
        )}

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? 'Type or use voice input...'}
          placeholderTextColor="#9CA3AF"
          multiline
          className="px-4 py-3 text-base text-gray-900 dark:text-white min-h-[80px]"
          textAlignVertical="top"
        />
      </View>
    </View>
  );
}
