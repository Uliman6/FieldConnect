/**
 * Cross-platform voice recording hook
 * Works on both web (MediaRecorder) and iOS/Android (expo-av)
 */

import { useState, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { transcribeAudio } from './transcription';

interface UseVoiceRecordingOptions {
  language?: string;
  onTranscriptionComplete?: (text: string) => void;
  onError?: (error: string) => void;
}

interface UseVoiceRecordingReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  recordingDuration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  stopAndTranscribe: () => Promise<string | null>;
}

export function useVoiceRecording(options: UseVoiceRecordingOptions = {}): UseVoiceRecordingReturn {
  const { language = 'en', onTranscriptionComplete, onError } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Native refs (expo-av)
  const nativeRecordingRef = useRef<Audio.Recording | null>(null);

  // Web refs (MediaRecorder)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('audio/webm');

  // Timer ref
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startTimer = useCallback(() => {
    setRecordingDuration(0);
    timerRef.current = setInterval(() => {
      setRecordingDuration((d) => d + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (Platform.OS === 'web') {
        // Web: Use MediaRecorder
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true }
        });

        // Check for supported mimeType - iOS Safari doesn't support webm
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'; // Fallback for iOS Safari

        console.log('[useVoiceRecording] Web: Using mimeType:', mimeType);
        mimeTypeRef.current = mimeType;

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.start(1000); // Collect data every second
        mediaRecorderRef.current = mediaRecorder;
      } else {
        // Native: Use expo-av
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          onError?.('Microphone permission not granted');
          return;
        }

        // Clean up any existing recording first
        if (nativeRecordingRef.current) {
          try {
            await nativeRecordingRef.current.stopAndUnloadAsync();
          } catch (e) {
            // Ignore cleanup errors
          }
          nativeRecordingRef.current = null;
        }

        // Set audio mode for recording
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        // Use createAsync instead of new + prepareToRecordAsync for better reliability
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        nativeRecordingRef.current = recording;
        console.log('[useVoiceRecording] Native: Recording started');
      }

      setIsRecording(true);
      startTimer();
    } catch (error: any) {
      console.error('[useVoiceRecording] Error starting recording:', error);
      onError?.(error.message || 'Could not start recording');
    }
  }, [isRecording, startTimer, onError]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!isRecording) return null;

    stopTimer();
    setIsRecording(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      if (Platform.OS === 'web') {
        // Web: Stop MediaRecorder and create blob URL
        return new Promise((resolve) => {
          const mediaRecorder = mediaRecorderRef.current;
          if (!mediaRecorder) {
            resolve(null);
            return;
          }

          mediaRecorder.onstop = () => {
            mediaRecorder.stream.getTracks().forEach((track) => track.stop());
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
            console.log('[useVoiceRecording] Web: Recording stopped, blob size:', audioBlob.size);

            if (audioBlob.size < 1000) {
              onError?.('Recording too short');
              resolve(null);
              return;
            }

            const audioUrl = URL.createObjectURL(audioBlob);
            resolve(audioUrl);
          };

          mediaRecorder.stop();
          mediaRecorderRef.current = null;
        });
      } else {
        // Native: Stop expo-av recording
        const recording = nativeRecordingRef.current;
        if (!recording) return null;

        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        nativeRecordingRef.current = null;

        console.log('[useVoiceRecording] Native: Recording stopped, URI:', uri);

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });

        return uri;
      }
    } catch (error: any) {
      console.error('[useVoiceRecording] Error stopping recording:', error);
      onError?.(error.message || 'Could not stop recording');
      return null;
    }
  }, [isRecording, stopTimer, onError]);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    const audioUri = await stopRecording();
    if (!audioUri) return null;

    setIsTranscribing(true);
    try {
      console.log('[useVoiceRecording] Transcribing audio, language:', language);
      const result = await transcribeAudio(audioUri, { language });

      // Clean up blob URL on web
      if (Platform.OS === 'web') {
        URL.revokeObjectURL(audioUri);
      }

      if (result.success && result.text) {
        console.log('[useVoiceRecording] Transcription result:', result.text.substring(0, 100));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onTranscriptionComplete?.(result.text);
        return result.text;
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        onError?.(result.error || 'Transcription failed');
        return null;
      }
    } catch (error: any) {
      console.error('[useVoiceRecording] Transcription error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      onError?.(error.message || 'Transcription failed');
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, [stopRecording, language, onTranscriptionComplete, onError]);

  return {
    isRecording,
    isTranscribing,
    recordingDuration,
    startRecording,
    stopRecording,
    stopAndTranscribe,
  };
}
