import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Animated,
  Modal,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mic,
  Square,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
  Plus,
  Trash2,
  RefreshCw,
  Building2,
} from 'lucide-react-native';
import { useColorScheme } from '@/lib/useColorScheme';
import { useVoiceDiaryStore } from '@/lib/voice-diary-store';
import { useDailyLogStore } from '@/lib/store';
import { transcribeAudio } from '@/lib/transcription';
import {
  processVoiceNote as processVoiceNoteApi,
  getVoiceDiaryNotes,
  deleteVoiceDiaryNote,
  queryKeys,
  VoiceDiaryNote,
} from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

interface PendingNote {
  status: 'transcribing' | 'processing' | 'error';
  errorMessage?: string;
  duration: number;
}

// LEARNING: We use a ref for the MediaRecorder because it doesn't trigger re-renders
// and we need to access it in callbacks. See: https://react.dev/reference/react/useRef
export default function RecordScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [reRecordingNoteId, setReRecordingNoteId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<VoiceDiaryNote | null>(null);
  // Tracks the note currently being transcribed/processed - it isn't
  // persisted server-side until the pipeline finishes, so it's shown as a
  // synthetic row at the top of the list in the meantime.
  const [pendingNote, setPendingNote] = useState<PendingNote | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Get projects from main store
  const { projects, addProject } = useDailyLogStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  // State for creating new project
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const {
    addNotification,
    getTodayDate,
    currentProjectId,
    setCurrentProject,
  } = useVoiceDiaryStore();

  const today = getTodayDate();
  const currentProject = projects.find((p) => p.id === currentProjectId);

  // Notes (with their categorized snippets) come from the backend, scoped
  // strictly to the selected project. With no project selected the query
  // never runs, so there is nothing to leak.
  const notesQuery = useQuery({
    queryKey: queryKeys.voiceDiaryNotes(currentProjectId || '', today),
    queryFn: () => getVoiceDiaryNotes(currentProjectId!, today),
    enabled: !!currentProjectId,
  });
  const todayNotes = notesQuery.data?.notes ?? [];

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => deleteVoiceDiaryNote(id),
    onSuccess: () => {
      if (currentProjectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.voiceDiaryNotes(currentProjectId, today) });
      }
    },
  });

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
    if (!currentProjectId) {
      setError('Please select a project first');
      return;
    }

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

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());

        // Check if we have actual audio data
        if (blob.size < 1000) {
          setError('No audio detected. Please try again.');
          addNotification('error', 'No voice detected');
          setReRecordingNoteId(null);
          return;
        }

        // audioUrl is only used transiently to upload for transcription -
        // no audio is stored, on-device or on the server.
        const audioUrl = URL.createObjectURL(blob);
        const duration = recordingDuration;
        processVoiceNoteAsync(audioUrl, duration);
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
      setReRecordingNoteId(null);
    }
  }, [currentProjectId, addNotification, recordingDuration, reRecordingNoteId]);

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

  const processVoiceNoteAsync = async (audioUri: string, duration: number) => {
    if (!currentProjectId) return;

    setPendingNote({ status: 'transcribing', duration });

    try {
      // Step 1: Transcribe audio (backend uploads it transiently to
      // Whisper and discards it - nothing is stored)
      console.log('[voice-diary] Starting transcription...');
      const result = await transcribeAudio(audioUri);

      if (!result.success || !result.text) {
        const errorMsg = result.error || 'Could not transcribe audio';
        console.error('[voice-diary] Transcription failed:', errorMsg);
        setPendingNote({ status: 'error', errorMessage: errorMsg, duration });
        addNotification('error', errorMsg);
        return;
      }

      console.log('[voice-diary] Transcription success, length:', result.text.length);
      const cleanedText = cleanTranscript(result.text);
      setPendingNote({ status: 'processing', duration });

      // Step 2: Persist + categorize + summarize on the backend, scoped to
      // this project
      try {
        const processResult = await processVoiceNoteApi(currentProjectId, cleanedText, duration);

        if (processResult.success) {
          // If this was a re-record, remove the original note now that the
          // replacement has been saved successfully
          if (reRecordingNoteId) {
            try {
              await deleteVoiceDiaryNote(reRecordingNoteId);
            } catch (e) {
              console.error('[voice-diary] Failed to remove original note after re-record:', e);
            }
            setReRecordingNoteId(null);
          }

          queryClient.invalidateQueries({ queryKey: queryKeys.voiceDiaryNotes(currentProjectId, today) });
          queryClient.invalidateQueries({ queryKey: queryKeys.voiceDiarySummary(currentProjectId, today, user?.id) });

          const snippetCount = processResult.snippets?.length || 0;
          addNotification('info', snippetCount > 0 ? `Added ${snippetCount} items` : 'Note saved');
        } else {
          addNotification('error', 'Could not save note - please try again');
        }
        setPendingNote(null);
      } catch (apiError: any) {
        // Nothing is saved locally anymore - if this call fails, the note
        // genuinely isn't saved, so surface that clearly instead of
        // claiming it was kept.
        console.error('[voice-diary] API processing failed:', apiError.message || apiError);
        setPendingNote({ status: 'error', errorMessage: apiError.message || 'Could not save note', duration });
        if (apiError.message?.includes('401') || apiError.message?.includes('expired')) {
          addNotification('error', 'Session expired - please log in again');
        } else {
          addNotification('error', 'Could not save note - please try again');
        }
      }
    } catch (err: any) {
      console.error('[voice-diary] Processing error:', err.message || err);
      setPendingNote({ status: 'error', errorMessage: err.message || 'Processing failed', duration });
      addNotification('error', err.message || 'Processing failed');
    }
  };

  const handleDeleteNote = (noteId: string) => {
    const doDelete = () => {
      deleteNoteMutation.mutate(noteId, {
        onSuccess: () => addNotification('info', 'Recording deleted'),
        onError: () => addNotification('error', 'Could not delete recording'),
      });
    };

    // Use window.confirm for web since Alert.alert doesn't work
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('Are you sure you want to delete this recording?')) {
        doDelete();
      }
    } else {
      // Fallback for native
      Alert.alert(
        'Delete Recording',
        'Are you sure you want to delete this recording?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const handleReRecord = (noteId: string) => {
    setReRecordingNoteId(noteId);
    // The original note stays until the replacement recording has been
    // successfully saved (see processVoiceNoteAsync), so a failed
    // re-record doesn't lose the existing note.
    startRecording();
  };

  const handleCreateProject = () => {
    if (!newProjectName.trim()) {
      Alert.alert('Error', 'Please enter a project name');
      return;
    }

    const newProject = addProject(newProjectName.trim(), '', '');
    setCurrentProject(newProject.id);
    setNewProjectName('');
    setIsCreatingProject(false);
    setShowProjectPicker(false);
    addNotification('success', `Project "${newProject.name}" created`);
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

  // Clean up raw transcript to make it "form-ready" - concise and professional
  // This removes filler words, fixes capitalization, and cleans up speech patterns
  const cleanTranscript = (rawText: string): string => {
    if (!rawText || rawText.trim().length === 0) return rawText || '';

    let cleaned = rawText;

    // Remove common filler words (case insensitive)
    const fillerPatterns = [
      /\b(um|uh|er|ah|like|you know|basically|actually|honestly|literally|so yeah|anyway|right)\b/gi,
      /\b(kind of|sort of|i mean|i guess|i think)\b/gi,
    ];
    fillerPatterns.forEach((pattern) => {
      cleaned = cleaned.replace(pattern, '');
    });

    // Clean up repeated words (e.g., "the the" -> "the")
    cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, '$1');

    // Fix multiple spaces
    cleaned = cleaned.replace(/\s{2,}/g, ' ');

    // Fix spacing around punctuation
    cleaned = cleaned.replace(/\s+([.,!?])/g, '$1');
    cleaned = cleaned.replace(/([.,!?])(?=[A-Za-z])/g, '$1 ');

    // Capitalize first letter of sentences
    cleaned = cleaned.replace(/(^|[.!?]\s+)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase());

    // Trim and clean up
    cleaned = cleaned.trim();

    // If cleaning removed everything meaningful, return original
    if (cleaned.length < 3) {
      return rawText.trim();
    }

    // Ensure first letter is capitalized
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

    // Ensure it ends with punctuation
    if (cleaned && !/[.!?]$/.test(cleaned)) {
      cleaned += '.';
    }

    return cleaned;
  };

  // Generate a topic-based title from transcript (not transcript excerpt)
  // Used only as a fallback - the backend normally already provides a title.
  const generateTitle = (transcript: string | null | undefined): string => {
    if (!transcript) return 'Voice Note';

    const lower = transcript.toLowerCase();

    // Inspection-related
    if (lower.includes('inspection')) {
      const typeMatch = transcript.match(/\b(electrical|plumbing|fire|safety|building|city)\s*inspection/i);
      if (typeMatch) return `${typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1)} Inspection`;
      return 'Site Inspection';
    }

    // Material/delivery related
    if (lower.includes('delivery') || lower.includes('delivered')) {
      const materialMatch = transcript.match(/\b(concrete|lumber|steel|framing|drywall|material)\s*(delivery)?/i);
      if (materialMatch) return `${materialMatch[1].charAt(0).toUpperCase() + materialMatch[1].slice(1)} Delivery`;
      return 'Material Delivery';
    }

    // Safety related
    if (lower.includes('safety') || lower.includes('hazard') || lower.includes('guardrail')) {
      return 'Safety Issue';
    }

    // Concrete/pour related
    if (lower.includes('concrete') || lower.includes('pour')) {
      return 'Concrete Work';
    }

    // Electrical work
    if (lower.includes('electrical') || lower.includes('rough-in') || lower.includes('panel')) {
      return 'Electrical Work';
    }

    // Plumbing work
    if (lower.includes('plumb') || lower.includes('pipe')) {
      return 'Plumbing Work';
    }

    // Coordination/meeting
    if (lower.includes('coordination') || lower.includes('meeting') || lower.includes('check in')) {
      const withMatch = transcript.match(/(?:with|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
      if (withMatch) return `${withMatch[1]} Coordination`;
      return 'Team Coordination';
    }

    // Work completed
    if (lower.includes('finished') || lower.includes('completed') || lower.includes('done')) {
      return 'Work Completed';
    }

    // Framing
    if (lower.includes('framing') || lower.includes('frame')) {
      return 'Framing Work';
    }

    // More pattern matching for common construction topics
    if (lower.includes('drywall') || lower.includes('sheetrock')) {
      return 'Drywall Work';
    }
    if (lower.includes('hvac') || lower.includes('duct') || lower.includes('heating') || lower.includes('cooling')) {
      return 'HVAC Work';
    }
    if (lower.includes('roof') || lower.includes('shingle')) {
      return 'Roofing Work';
    }
    if (lower.includes('window') || lower.includes('door')) {
      return 'Doors & Windows';
    }
    if (lower.includes('paint') || lower.includes('finish')) {
      return 'Painting & Finishes';
    }
    if (lower.includes('floor') || lower.includes('tile') || lower.includes('carpet')) {
      return 'Flooring Work';
    }
    if (lower.includes('truck') || lower.includes('crane') || lower.includes('equipment')) {
      return 'Equipment & Logistics';
    }
    if (lower.includes('weather') || lower.includes('rain') || lower.includes('delay')) {
      return 'Weather Update';
    }
    if (lower.includes('progress') || lower.includes('update') || lower.includes('status')) {
      return 'Progress Update';
    }
    if (lower.includes('issue') || lower.includes('problem') || lower.includes('fix')) {
      return 'Issue Report';
    }
    if (lower.includes('schedule') || lower.includes('tomorrow') || lower.includes('next week')) {
      return 'Schedule Update';
    }

    // Default to generic titles - never use transcript excerpts
    return 'Voice Note';
  };

  const getPendingStatusIcon = (status: PendingNote['status']) => {
    switch (status) {
      case 'error':
        return <AlertCircle size={16} color="#EF4444" />;
      case 'transcribing':
      case 'processing':
      default:
        return <Loader2 size={16} color="#F59E0B" />;
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? '#000' : '#F9FAFB' }}
      edges={['bottom']}
    >
      <View style={{ flex: 1, padding: 20 }}>
        {/* Project Selector */}
        <Pressable
          onPress={() => setShowProjectPicker(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? '#1F2937' : '#FFF',
            borderRadius: 12,
            padding: 14,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: currentProjectId ? '#1F5C1A' : (isDark ? '#374151' : '#E5E7EB'),
          }}
        >
          <Building2 size={20} color={currentProjectId ? '#1F5C1A' : (isDark ? '#6B7280' : '#9CA3AF')} />
          <Text
            style={{
              flex: 1,
              marginLeft: 12,
              fontSize: 15,
              fontWeight: '500',
              color: currentProject ? (isDark ? '#FFF' : '#111') : (isDark ? '#6B7280' : '#9CA3AF'),
            }}
          >
            {currentProject?.name || 'Select a project...'}
          </Text>
          <ChevronDown size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
        </Pressable>

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
            {!currentProjectId
              ? 'Select a project to start recording'
              : isRecording
              ? reRecordingNoteId
                ? 'Re-recording... Tap to stop'
                : 'Recording... Tap to stop'
              : 'Tap to record a voice note'}
          </Text>

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Pressable
              onPress={isRecording ? stopRecording : startRecording}
              disabled={!currentProjectId && !isRecording}
              style={{
                width: 140,
                height: 140,
                borderRadius: 70,
                backgroundColor: !currentProjectId
                  ? '#9CA3AF'
                  : isRecording
                  ? '#EF4444'
                  : '#1F5C1A',
                justifyContent: 'center',
                alignItems: 'center',
                shadowColor: isRecording ? '#EF4444' : '#1F5C1A',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: currentProjectId ? 0.3 : 0.1,
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
        <View style={{ maxHeight: 280 }}>
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
            Today's Notes ({todayNotes.length + (pendingNote ? 1 : 0)})
          </Text>

          {!currentProjectId ? (
            <View
              style={{
                padding: 20,
                backgroundColor: isDark ? '#1F2937' : '#FFF',
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: isDark ? '#6B7280' : '#9CA3AF', fontSize: 14 }}>
                Select a project to see recordings
              </Text>
            </View>
          ) : notesQuery.isLoading ? (
            <View
              style={{
                padding: 20,
                backgroundColor: isDark ? '#1F2937' : '#FFF',
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <ActivityIndicator color={isDark ? '#9CA3AF' : '#6B7280'} />
            </View>
          ) : todayNotes.length === 0 && !pendingNote ? (
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
              {pendingNote && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 14,
                    borderBottomWidth: todayNotes.length > 0 ? 1 : 0,
                    borderBottomColor: isDark ? '#374151' : '#E5E7EB',
                  }}
                >
                  {getPendingStatusIcon(pendingNote.status)}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        color: isDark ? '#FFF' : '#111',
                        fontWeight: '500',
                      }}
                      numberOfLines={1}
                    >
                      {pendingNote.status === 'error'
                        ? pendingNote.errorMessage || 'Could not save note'
                        : pendingNote.status === 'transcribing'
                        ? 'Transcribing...'
                        : 'Processing...'}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: isDark ? '#6B7280' : '#9CA3AF',
                        marginTop: 2,
                      }}
                    >
                      {formatDuration(pendingNote.duration)}
                    </Text>
                  </View>
                </View>
              )}
              {todayNotes.map((note, index) => (
                <Pressable
                  key={note.id}
                  onPress={() => setSelectedNote(note)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 14,
                    borderBottomWidth: index < todayNotes.length - 1 ? 1 : 0,
                    borderBottomColor: isDark ? '#374151' : '#E5E7EB',
                  }}
                >
                  <Check size={16} color="#10B981" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text
                        style={{
                          fontSize: 14,
                          color: isDark ? '#FFF' : '#111',
                          fontWeight: '500',
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {note.title || generateTitle(note.transcriptText)}
                      </Text>
                      {note.version > 1 && (
                        <View
                          style={{
                            backgroundColor: '#DBEAFE',
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 4,
                            marginLeft: 8,
                          }}
                        >
                          <Text style={{ fontSize: 10, color: '#1E40AF', fontWeight: '600' }}>
                            v{note.version}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={{
                        fontSize: 12,
                        color: isDark ? '#6B7280' : '#9CA3AF',
                        marginTop: 2,
                      }}
                    >
                      {formatTime(note.createdAt)} · {formatDuration(note.duration ?? 0)}
                      {note.snippets.length > 0 && ` · ${note.snippets.length} items`}
                    </Text>
                  </View>

                  {/* Action buttons */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        handleReRecord(note.id);
                      }}
                      disabled={isRecording}
                      style={{
                        padding: 8,
                        opacity: isRecording ? 0.3 : 1,
                      }}
                    >
                      <RefreshCw size={18} color="#3B82F6" />
                    </Pressable>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDeleteNote(note.id);
                      }}
                      disabled={isRecording}
                      style={{
                        padding: 8,
                        opacity: isRecording ? 0.3 : 1,
                      }}
                    >
                      <Trash2 size={18} color="#EF4444" />
                    </Pressable>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>

      {/* Note Detail Modal */}
      <Modal
        visible={selectedNote !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedNote(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#000' : '#F9FAFB' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: isDark ? '#1F2937' : '#E5E7EB',
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: '700',
                color: isDark ? '#FFF' : '#111',
              }}
            >
              Note Details
            </Text>
            <Pressable onPress={() => setSelectedNote(null)}>
              <Text style={{ color: '#1F5C1A', fontSize: 16, fontWeight: '600' }}>
                Done
              </Text>
            </Pressable>
          </View>

          {selectedNote && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              {/* Title */}
              {selectedNote.title && (
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: '700',
                    color: isDark ? '#FFF' : '#111',
                    marginBottom: 8,
                  }}
                >
                  {selectedNote.title}
                </Text>
              )}

              {/* Time and Duration */}
              <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                <Text style={{ fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280' }}>
                  {formatTime(selectedNote.createdAt)} · {formatDuration(selectedNote.duration ?? 0)}
                  {selectedNote.version > 1 && ` · Version ${selectedNote.version}`}
                </Text>
              </View>

              {/* Cleaned Summary - Form-ready version */}
              <View
                style={{
                  backgroundColor: isDark ? '#1F2937' : '#FFF',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: '#1F5C1A',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  Summary
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    color: isDark ? '#E5E7EB' : '#374151',
                    lineHeight: 24,
                  }}
                >
                  {selectedNote.cleanedTranscript || selectedNote.transcriptText || 'No transcript available'}
                </Text>
              </View>

              {/* Raw Transcript - Show only if different from cleaned */}
              {selectedNote.cleanedTranscript && selectedNote.transcriptText &&
               selectedNote.cleanedTranscript !== selectedNote.transcriptText && (
                <View
                  style={{
                    backgroundColor: isDark ? '#111827' : '#F3F4F6',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 20,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: isDark ? '#6B7280' : '#9CA3AF',
                      textTransform: 'uppercase',
                      marginBottom: 8,
                    }}
                  >
                    Original Recording
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      color: isDark ? '#9CA3AF' : '#6B7280',
                      lineHeight: 20,
                      fontStyle: 'italic',
                    }}
                  >
                    {selectedNote.transcriptText}
                  </Text>
                </View>
              )}

              {/* Categorized Items */}
              {selectedNote.snippets.length > 0 && (
                <View>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: isDark ? '#9CA3AF' : '#6B7280',
                      textTransform: 'uppercase',
                      marginBottom: 12,
                    }}
                  >
                    Extracted Items ({selectedNote.snippets.length})
                  </Text>
                  {selectedNote.snippets.map((snippet) => (
                    <View
                      key={snippet.id}
                      style={{
                        backgroundColor: isDark ? '#1F2937' : '#FFF',
                        borderRadius: 12,
                        padding: 14,
                        marginBottom: 8,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: '#DCFCE7',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                          alignSelf: 'flex-start',
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#166534' }}>
                          {snippet.category}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          color: isDark ? '#E5E7EB' : '#374151',
                          lineHeight: 20,
                        }}
                      >
                        {snippet.content}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                <Pressable
                  onPress={() => {
                    setSelectedNote(null);
                    handleReRecord(selectedNote.id);
                  }}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 14,
                    backgroundColor: '#DBEAFE',
                    borderRadius: 12,
                    gap: 8,
                  }}
                >
                  <RefreshCw size={18} color="#1E40AF" />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#1E40AF' }}>
                    Re-record
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setSelectedNote(null);
                    handleDeleteNote(selectedNote.id);
                  }}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 14,
                    backgroundColor: '#FEE2E2',
                    borderRadius: 12,
                    gap: 8,
                  }}
                >
                  <Trash2 size={18} color="#DC2626" />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#DC2626' }}>
                    Delete
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Project Picker Modal */}
      <Modal
        visible={showProjectPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProjectPicker(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#000' : '#F9FAFB' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: isDark ? '#1F2937' : '#E5E7EB',
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: '700',
                color: isDark ? '#FFF' : '#111',
              }}
            >
              Select Project
            </Text>
            <Pressable onPress={() => setShowProjectPicker(false)}>
              <Text style={{ color: '#1F5C1A', fontSize: 16, fontWeight: '600' }}>
                Done
              </Text>
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {/* Create New Project Section */}
            {isCreatingProject ? (
              <View
                style={{
                  backgroundColor: isDark ? '#1F2937' : '#FFF',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: '#1F5C1A',
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: isDark ? '#9CA3AF' : '#6B7280',
                    marginBottom: 8,
                  }}
                >
                  New Project Name
                </Text>
                <TextInput
                  value={newProjectName}
                  onChangeText={setNewProjectName}
                  placeholder="Enter project name..."
                  placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                  autoFocus
                  style={{
                    backgroundColor: isDark ? '#374151' : '#F3F4F6',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 16,
                    color: isDark ? '#FFF' : '#111',
                    marginBottom: 12,
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => {
                      setIsCreatingProject(false);
                      setNewProjectName('');
                    }}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 8,
                      backgroundColor: isDark ? '#374151' : '#E5E7EB',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: isDark ? '#FFF' : '#374151', fontWeight: '600' }}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCreateProject}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 8,
                      backgroundColor: '#1F5C1A',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#FFF', fontWeight: '600' }}>
                      Create
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setIsCreatingProject(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  backgroundColor: isDark ? '#1F2937' : '#FFF',
                  borderRadius: 12,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: isDark ? '#374151' : '#E5E7EB',
                  borderStyle: 'dashed',
                }}
              >
                <Plus size={24} color="#1F5C1A" />
                <Text
                  style={{
                    flex: 1,
                    marginLeft: 12,
                    fontSize: 16,
                    fontWeight: '500',
                    color: '#1F5C1A',
                  }}
                >
                  Create New Project
                </Text>
              </Pressable>
            )}

            {/* Existing Projects */}
            {projects.length === 0 && !isCreatingProject ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Text
                  style={{
                    fontSize: 14,
                    color: isDark ? '#6B7280' : '#9CA3AF',
                    textAlign: 'center',
                  }}
                >
                  No projects yet. Create one above!
                </Text>
              </View>
            ) : (
              projects.map((project) => (
                <Pressable
                  key={project.id}
                  onPress={() => {
                    setCurrentProject(project.id);
                    setShowProjectPicker(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 16,
                    backgroundColor: currentProjectId === project.id
                      ? (isDark ? '#1F3A1C' : '#DCFCE7')
                      : (isDark ? '#1F2937' : '#FFF'),
                    borderRadius: 12,
                    marginBottom: 8,
                    borderWidth: currentProjectId === project.id ? 1 : 0,
                    borderColor: '#1F5C1A',
                  }}
                >
                  <Building2
                    size={24}
                    color={currentProjectId === project.id ? '#1F5C1A' : (isDark ? '#6B7280' : '#9CA3AF')}
                  />
                  <Text
                    style={{
                      flex: 1,
                      marginLeft: 12,
                      fontSize: 16,
                      fontWeight: currentProjectId === project.id ? '600' : '400',
                      color: isDark ? '#FFF' : '#111',
                    }}
                  >
                    {project.name}
                  </Text>
                  {currentProjectId === project.id && (
                    <Check size={20} color="#1F5C1A" />
                  )}
                </Pressable>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
