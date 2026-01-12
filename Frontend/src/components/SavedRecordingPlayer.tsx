import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import {
  Play,
  Pause,
  CheckCircle2,
  Trash2,
  RotateCcw,
  FileText,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  FadeIn,
} from 'react-native-reanimated';
import { cn } from '@/lib/cn';

interface SavedRecordingPlayerProps {
  audioUri: string;
  recordedAt?: string;
  transcriptText?: string | null;
  isTranscribing?: boolean;
  transcriptionError?: string | null;
  onDelete?: () => void;
  onReRecord?: () => void;
  onRetryTranscription?: () => void;
  compact?: boolean;
}

export function SavedRecordingPlayer({
  audioUri,
  recordedAt,
  transcriptText,
  isTranscribing = false,
  transcriptionError,
  onDelete,
  onReRecord,
  onRetryTranscription,
  compact = false,
}: SavedRecordingPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showFullTranscript, setShowFullTranscript] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    loadSound();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, [audioUri]);

  useEffect(() => {
    if (isPlaying) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        false
      );
    } else {
      pulseAnim.value = withTiming(1, { duration: 200 });
    }
  }, [isPlaying, pulseAnim]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const loadSound = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound, status } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: false }
      );

      soundRef.current = sound;

      if (status.isLoaded) {
        setDuration(status.durationMillis ?? null);
      }

      sound.setOnPlaybackStatusUpdate((playbackStatus) => {
        if (playbackStatus.isLoaded) {
          setPosition(playbackStatus.positionMillis);
          if (playbackStatus.didJustFinish) {
            setIsPlaying(false);
            sound.setPositionAsync(0);
          }
        }
      });

      setIsLoading(false);
    } catch (err) {
      console.log('[SavedRecordingPlayer] Load error:', err);
      setError('Could not load recording');
      setIsLoading(false);
    }
  };

  const togglePlayback = async () => {
    if (!soundRef.current) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch (err) {
      console.log('[SavedRecordingPlayer] Playback error:', err);
    }
  };

  const formatTime = (ms: number | null) => {
    if (ms === null) return '--:--';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration ? (position / duration) * 100 : 0;

  if (error) {
    return (
      <View className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
        <Text className="text-red-600 dark:text-red-400 text-sm">{error}</Text>
      </View>
    );
  }

  if (compact) {
    return (
      <Animated.View entering={FadeIn}>
        <View className="flex-row items-center bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
          <Animated.View style={pulseStyle}>
            <Pressable
              onPress={togglePlayback}
              disabled={isLoading}
              className={cn(
                'w-10 h-10 rounded-full items-center justify-center',
                isPlaying ? 'bg-green-500' : 'bg-green-600'
              )}
            >
              {isLoading ? (
                <ActivityIndicator color="white" size="small" />
              ) : isPlaying ? (
                <Pause size={18} color="white" />
              ) : (
                <Play size={18} color="white" style={{ marginLeft: 2 }} />
              )}
            </Pressable>
          </Animated.View>

          <View className="flex-1 ml-3">
            <View className="flex-row items-center">
              <CheckCircle2 size={14} color="#22C55E" />
              <Text className="ml-1 text-sm font-medium text-green-700 dark:text-green-400">
                Recording Saved
              </Text>
            </View>
            <Text className="text-xs text-green-600/70 dark:text-green-400/70 mt-0.5">
              {formatTime(position)} / {formatTime(duration)}
            </Text>
          </View>

          {onDelete && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onDelete();
              }}
              className="p-2"
            >
              <Trash2 size={18} color="#EF4444" />
            </Pressable>
          )}
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeIn}>
      <View className="bg-white dark:bg-gray-800 rounded-2xl p-4 border-2 border-green-200 dark:border-green-800">
        {/* Header */}
        <View className="flex-row items-center mb-3">
          <View className="flex-row items-center flex-1">
            <CheckCircle2 size={20} color="#22C55E" />
            <Text className="ml-2 text-base font-semibold text-green-700 dark:text-green-400">
              Daily Summary Recording
            </Text>
          </View>
          {recordedAt && (
            <Text className="text-xs text-gray-400 dark:text-gray-500">
              {recordedAt}
            </Text>
          )}
        </View>

        {/* Progress Bar */}
        <View className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full mb-3 overflow-hidden">
          <View
            className="h-full bg-green-500 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </View>

        {/* Time */}
        <View className="flex-row justify-between mb-4">
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {formatTime(position)}
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {formatTime(duration)}
          </Text>
        </View>

        {/* Controls */}
        <View className="flex-row items-center justify-center mb-4">
          <Animated.View style={pulseStyle}>
            <Pressable
              onPress={togglePlayback}
              disabled={isLoading}
              className={cn(
                'w-14 h-14 rounded-full items-center justify-center',
                isPlaying ? 'bg-green-500' : 'bg-green-600'
              )}
            >
              {isLoading ? (
                <ActivityIndicator color="white" size="large" />
              ) : isPlaying ? (
                <Pause size={24} color="white" />
              ) : (
                <Play size={24} color="white" style={{ marginLeft: 3 }} />
              )}
            </Pressable>
          </Animated.View>

          {onReRecord && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onReRecord();
              }}
              className="ml-4 flex-row items-center bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-full"
            >
              <RotateCcw size={16} color="#6B7280" />
              <Text className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                Re-record
              </Text>
            </Pressable>
          )}

          {onDelete && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onDelete();
              }}
              className="ml-4 flex-row items-center bg-red-50 dark:bg-red-900/30 px-4 py-2 rounded-full"
            >
              <Trash2 size={16} color="#EF4444" />
              <Text className="ml-2 text-sm text-red-600 dark:text-red-400">
                Delete
              </Text>
            </Pressable>
          )}
        </View>

        {/* Transcription Section */}
        <View className="border-t border-gray-200 dark:border-gray-700 pt-4">
          {isTranscribing ? (
            <View className="flex-row items-center justify-center py-4">
              <ActivityIndicator size="small" color="#F97316" />
              <Text className="ml-2 text-sm text-orange-600 dark:text-orange-400">
                Transcribing audio...
              </Text>
            </View>
          ) : transcriptionError ? (
            <View className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
              <View className="flex-row items-center">
                <AlertCircle size={16} color="#EF4444" />
                <Text className="ml-2 text-sm text-red-600 dark:text-red-400 flex-1">
                  {transcriptionError}
                </Text>
              </View>
              {onRetryTranscription && (
                <Pressable
                  onPress={onRetryTranscription}
                  className="flex-row items-center justify-center mt-3 py-2 bg-red-100 dark:bg-red-900/30 rounded-lg"
                >
                  <RefreshCw size={14} color="#EF4444" />
                  <Text className="ml-2 text-sm font-medium text-red-600 dark:text-red-400">
                    Retry Transcription
                  </Text>
                </Pressable>
              )}
            </View>
          ) : transcriptText ? (
            <View>
              <View className="flex-row items-center mb-2">
                <FileText size={16} color="#22C55E" />
                <Text className="ml-2 text-sm font-medium text-green-700 dark:text-green-400">
                  Transcription
                </Text>
              </View>
              <Pressable
                onPress={() => setShowFullTranscript(!showFullTranscript)}
                className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3"
              >
                <Text
                  className="text-sm text-gray-700 dark:text-gray-300 leading-5"
                  numberOfLines={showFullTranscript ? undefined : 4}
                >
                  {transcriptText}
                </Text>
                {transcriptText.length > 200 && (
                  <Text className="text-xs text-blue-500 mt-2">
                    {showFullTranscript ? 'Show less' : 'Show more...'}
                  </Text>
                )}
              </Pressable>
            </View>
          ) : (
            <View className="flex-row items-center justify-center py-3">
              <FileText size={16} color="#9CA3AF" />
              <Text className="ml-2 text-sm text-gray-400 dark:text-gray-500">
                No transcription available
              </Text>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}
