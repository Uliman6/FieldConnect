import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mic, Square, Check, AlertCircle, Clock, Loader2 } from 'lucide-react-native';
import { useColorScheme } from '@/lib/useColorScheme';
import { useVoiceDiaryStore, VoiceNote } from '@/lib/voice-diary-store';
import { transcribeAudio } from '@/lib/transcription';
import { processVoiceNote as processVoiceNoteApi } from '@/lib/api';

// LEARNING: We use a ref for the MediaRecorder because it doesn't trigger re-renders
// and we need to access it in callbacks. See: https://react.dev/reference/react/useRef
export default function RecordScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const {
    addVoiceNote,
    updateVoiceNote,
    addNotification,
    addSnippet,
    updateDailySummary,
    addFormSuggestion,
    getVoiceNotesForDate,
    getSnippetsForDate,
    getTodayDate,
  } = useVoiceDiaryStore();

  const todayNotes = getVoiceNotesForDate(getTodayDate());

  // Pulse animation while recording
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());

        // Check if we have actual audio data
        if (blob.size < 1000) {
          setError('No audio detected. Please try again.');
          addNotification('error', 'No voice detected');
          return;
        }

        const audioUrl = URL.createObjectURL(blob);
        const duration = recordingDuration;

        // Add voice note to store
        const note = addVoiceNote(audioUrl, duration);
        addNotification('success', 'Note captured!');

        // Start transcription and processing
        processVoiceNoteAsync(note.id, audioUrl);
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration timer
      timerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Recording error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please enable it in settings.');
      } else {
        setError('Could not start recording. Please try again.');
      }
      addNotification('error', 'Recording failed');
    }
  }, [addVoiceNote, addNotification, recordingDuration]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const processVoiceNoteAsync = async (noteId: string, audioUri: string) => {
    updateVoiceNote(noteId, { status: 'transcribing' });
    const today = getTodayDate();

    try {
      // Step 1: Transcribe audio
      const result = await transcribeAudio(audioUri);

      if (!result.success || !result.text) {
        updateVoiceNote(noteId, {
          status: 'error',
          errorMessage: result.error || 'Transcription failed',
        });
        addNotification('error', 'Could not process audio');
        return;
      }

      updateVoiceNote(noteId, {
        transcriptText: result.text,
        status: 'processing',
      });

      // Step 2: Send to backend for categorization + summarization
      const existingSnippets = getSnippetsForDate(today).map(s => ({
        category: s.category,
        content: s.content,
      }));
      const noteCount = getVoiceNotesForDate(today).length;

      const processResult = await processVoiceNoteApi(
        result.text,
        existingSnippets,
        noteCount
      );

      if (processResult.success) {
        // Add new snippets to store
        for (const snippet of processResult.newSnippets) {
          addSnippet(noteId, snippet.category as any, snippet.content);
        }

        // Update daily summary
        updateDailySummary(today, processResult.summary, processResult.hasMinimumInfo);

        // Add form suggestions
        for (const suggestion of processResult.formSuggestions) {
          addFormSuggestion(
            suggestion.formType,
            suggestion.formName,
            suggestion.reason,
            suggestion.snippetIds
          );
        }

        updateVoiceNote(noteId, { status: 'complete' });
        addNotification('info', 'Summary updated');
      } else {
        // Fallback: still mark as complete but without categorization
        updateVoiceNote(noteId, { status: 'complete' });
        addNotification('success', 'Note captured');
      }
    } catch (err: any) {
      console.error('[voice-diary] Processing error:', err);
      updateVoiceNote(noteId, {
        status: 'error',
        errorMessage: err.message || 'Processing failed',
      });
      addNotification('error', 'Processing failed');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusIcon = (status: VoiceNote['status']) => {
    switch (status) {
      case 'complete':
        return <Check size={16} color="#10B981" />;
      case 'error':
        return <AlertCircle size={16} color="#EF4444" />;
      case 'transcribing':
      case 'processing':
        return <Loader2 size={16} color="#F59E0B" />;
      default:
        return <Clock size={16} color="#6B7280" />;
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? '#000' : '#F9FAFB' }}
      edges={['bottom']}
    >
      <View style={{ flex: 1, padding: 20 }}>
        {/* Main Record Button */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text
            style={{
              fontSize: 16,
              color: isDark ? '#9CA3AF' : '#6B7280',
              marginBottom: 24,
              textAlign: 'center',
            }}
          >
            {isRecording
              ? 'Recording... Tap to stop'
              : 'Tap to record a voice note'}
          </Text>

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Pressable
              onPress={isRecording ? stopRecording : startRecording}
              style={{
                width: 140,
                height: 140,
                borderRadius: 70,
                backgroundColor: isRecording ? '#EF4444' : '#1F5C1A',
                justifyContent: 'center',
                alignItems: 'center',
                shadowColor: isRecording ? '#EF4444' : '#1F5C1A',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              {isRecording ? (
                <Square size={48} color="#FFF" fill="#FFF" />
              ) : (
                <Mic size={56} color="#FFF" />
              )}
            </Pressable>
          </Animated.View>

          {isRecording && (
            <Text
              style={{
                fontSize: 32,
                fontWeight: '700',
                color: '#EF4444',
                marginTop: 24,
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatDuration(recordingDuration)}
            </Text>
          )}

          {error && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 24,
                padding: 12,
                backgroundColor: '#FEE2E2',
                borderRadius: 8,
              }}
            >
              <AlertCircle size={18} color="#EF4444" />
              <Text style={{ marginLeft: 8, color: '#DC2626', fontSize: 14 }}>
                {error}
              </Text>
            </View>
          )}
        </View>

        {/* Today's Notes List */}
        <View style={{ maxHeight: 250 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '600',
              color: isDark ? '#9CA3AF' : '#6B7280',
              marginBottom: 12,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Today's Notes ({todayNotes.length})
          </Text>

          {todayNotes.length === 0 ? (
            <View
              style={{
                padding: 20,
                backgroundColor: isDark ? '#1F2937' : '#FFF',
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: isDark ? '#6B7280' : '#9CA3AF', fontSize: 14 }}>
                No recordings yet today
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{
                backgroundColor: isDark ? '#1F2937' : '#FFF',
                borderRadius: 12,
              }}
              showsVerticalScrollIndicator={false}
            >
              {todayNotes.map((note, index) => (
                <View
                  key={note.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 14,
                    borderBottomWidth: index < todayNotes.length - 1 ? 1 : 0,
                    borderBottomColor: isDark ? '#374151' : '#E5E7EB',
                  }}
                >
                  {getStatusIcon(note.status)}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        color: isDark ? '#FFF' : '#111',
                        fontWeight: '500',
                      }}
                      numberOfLines={1}
                    >
                      {note.transcriptText
                        ? note.transcriptText.substring(0, 50) + (note.transcriptText.length > 50 ? '...' : '')
                        : note.status === 'error'
                        ? note.errorMessage || 'Error'
                        : 'Processing...'}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: isDark ? '#6B7280' : '#9CA3AF',
                        marginTop: 2,
                      }}
                    >
                      {formatTime(note.createdAt)} · {formatDuration(note.duration)}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
