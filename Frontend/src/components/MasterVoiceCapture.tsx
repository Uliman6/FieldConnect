import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform, Modal } from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import {
  Mic,
  Square,
  Play,
  Pause,
  X,
  ChevronDown,
  ChevronUp,
  StopCircle,
  CheckCircle2,
  Users,
  AlertTriangle,
  ClipboardCheck,
  Wrench,
  Package,
  UserCheck,
  NotebookPen,
  CloudSun,
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  cancelAnimation,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { cn } from '@/lib/cn';
import { persistAudioFile } from '@/lib/audio-storage';

interface MasterVoiceCaptureProps {
  onRecordingComplete: (audioUri: string) => void;
  projectName?: string;
  date: string;
}

const TALKING_POINTS = [
  {
    icon: <CloudSun size={16} color="#F59E0B" />,
    title: 'Weather',
    prompts: ['Temperature high/low', 'Sky conditions', 'Any weather delays?'],
  },
  {
    icon: <Users size={16} color="#3B82F6" />,
    title: 'Activity / Crews',
    prompts: ['Companies on site', 'Worker counts', 'Work performed today'],
  },
  {
    icon: <AlertTriangle size={16} color="#EF4444" />,
    title: 'Issues & Problems',
    prompts: ['Delays or blockers', 'Quality concerns', 'Safety incidents', 'Coordination issues'],
  },
  {
    icon: <ClipboardCheck size={16} color="#8B5CF6" />,
    title: 'Inspections',
    prompts: ['Inspector visits', 'Pass/fail results', 'Follow-ups needed'],
  },
  {
    icon: <Wrench size={16} color="#6B7280" />,
    title: 'Equipment',
    prompts: ['Equipment on site', 'Rentals delivered/picked up'],
  },
  {
    icon: <Package size={16} color="#10B981" />,
    title: 'Materials',
    prompts: ['Deliveries received', 'Material issues'],
  },
  {
    icon: <UserCheck size={16} color="#1F5C1A" />,
    title: 'Visitors',
    prompts: ['Who visited today', 'Purpose of visit'],
  },
  {
    icon: <NotebookPen size={16} color="#EC4899" />,
    title: 'General Notes',
    prompts: ['Overall progress', 'Tomorrow\'s plan', 'Anything else notable'],
  },
];

export function MasterVoiceCapture({ onRecordingComplete, projectName, date }: MasterVoiceCaptureProps) {
  const [showModal, setShowModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [lastRecordingUri, setLastRecordingUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

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

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      setIsRecording(false);
      setIsProcessing(true);

      if (uri) {
        const persistentUri = await persistAudioFile(uri);
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

  const handleSave = () => {
    if (lastRecordingUri) {
      onRecordingComplete(lastRecordingUri);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    setShowModal(false);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Trigger Button */}
      <Pressable
        onPress={() => setShowModal(true)}
        className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-4 flex-row items-center"
        style={{ backgroundColor: '#1F5C1A' }}
      >
        <View className="w-12 h-12 bg-white/20 rounded-full items-center justify-center mr-4">
          <Mic size={24} color="white" />
        </View>
        <View className="flex-1">
          <Text className="text-white text-lg font-semibold">Voice Capture</Text>
          <Text className="text-white/80 text-sm">Record your full daily summary</Text>
        </View>
        <ChevronDown size={20} color="white" />
      </Pressable>

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
            <View className="items-center">
              <Text className="text-lg font-semibold text-gray-900 dark:text-white">
                Daily Summary
              </Text>
              {projectName && (
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  {projectName} · {date}
                </Text>
              )}
            </View>
            <View className="w-10" />
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Recording Section */}
            <Animated.View
              entering={FadeIn}
              className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-6 items-center"
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
                {isProcessing ? 'Saving...' : isRecording ? formatDuration(recordingDuration) : '0:00'}
              </Text>

              <Text className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {isRecording
                  ? 'Tap to stop recording'
                  : lastRecordingUri
                    ? 'Recording saved'
                    : 'Tap to start recording'}
              </Text>

              {/* Playback Controls */}
              {lastRecordingUri && !isRecording && (
                <View className="flex-row items-center mt-4 space-x-3">
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

            {/* Talking Points */}
            <View className="mx-4 mt-6">
              <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Talking Points
              </Text>
              <Text className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                Use these as a guide while recording. Cover what's relevant.
              </Text>

              {TALKING_POINTS.map((section, index) => (
                <Animated.View
                  key={section.title}
                  entering={FadeInDown.delay(index * 50)}
                >
                  <Pressable
                    onPress={() => setExpandedSection(expandedSection === index ? null : index)}
                    className="bg-white dark:bg-gray-800 rounded-xl mb-2 overflow-hidden"
                  >
                    <View className="flex-row items-center px-4 py-3">
                      <View className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full items-center justify-center mr-3">
                        {section.icon}
                      </View>
                      <Text className="flex-1 text-base font-medium text-gray-900 dark:text-white">
                        {section.title}
                      </Text>
                      {expandedSection === index ? (
                        <ChevronUp size={18} color="#9CA3AF" />
                      ) : (
                        <ChevronDown size={18} color="#9CA3AF" />
                      )}
                    </View>

                    {expandedSection === index && (
                      <View className="px-4 pb-3 pt-1 border-t border-gray-100 dark:border-gray-700">
                        {section.prompts.map((prompt, pIndex) => (
                          <View key={pIndex} className="flex-row items-center py-1">
                            <View className="w-1.5 h-1.5 bg-orange-500 rounded-full mr-2" />
                            <Text className="text-sm text-gray-600 dark:text-gray-400">
                              {prompt}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </ScrollView>

          {/* Save Button */}
          {lastRecordingUri && !isRecording && (
            <View className="absolute bottom-0 left-0 right-0 p-4 bg-gray-50 dark:bg-black border-t border-gray-200 dark:border-gray-800">
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
