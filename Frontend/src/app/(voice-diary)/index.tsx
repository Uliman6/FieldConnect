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
import {
  Mic,
  Square,
  Check,
  AlertCircle,
  Clock,
  Loader2,
  ChevronDown,
  Plus,
  Trash2,
  RefreshCw,
  Building2,
} from 'lucide-react-native';
import { useColorScheme } from '@/lib/useColorScheme';
import { useVoiceDiaryStore, VoiceNote, CategorizedSnippet } from '@/lib/voice-diary-store';
import { useDailyLogStore } from '@/lib/store';
import { transcribeAudio } from '@/lib/transcription';
import { processVoiceNote as processVoiceNoteApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

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
  const [selectedNote, setSelectedNote] = useState<VoiceNote | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Get projects from main store
  const { projects, addProject } = useDailyLogStore();
  const { user } = useAuthStore();

  // State for creating new project
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const {
    addVoiceNote,
    updateVoiceNote,
    deleteVoiceNote,
    reRecordVoiceNote,
    addNotification,
    addSnippet,
    updateDailySummary,
    addFormSuggestion,
    getVoiceNotesForDate,
    getSnippetsForDate,
    getTodayDate,
    currentProjectId,
    setCurrentProject,
    clearSnippetsForNote,
    categorizedSnippets,
    seedExampleData,
    hasExampleData,
  } = useVoiceDiaryStore();

  // Get snippets for a specific note
  const getSnippetsForNote = (noteId: string): CategorizedSnippet[] => {
    return categorizedSnippets.filter((s) => s.voiceNoteId === noteId);
  };

  const today = getTodayDate();
  const todayNotes = getVoiceNotesForDate(today, currentProjectId || undefined);
  const currentProject = projects.find((p) => p.id === currentProjectId);

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

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());

        // Check if we have actual audio data
        if (blob.size < 1000) {
          setError('No audio detected. Please try again.');
          addNotification('error', 'No voice detected');
          setReRecordingNoteId(null);
          return;
        }

        const audioUrl = URL.createObjectURL(blob);
        const duration = recordingDuration;

        // Check if this is a re-record or new note
        let note: VoiceNote;
        if (reRecordingNoteId) {
          note = reRecordVoiceNote(reRecordingNoteId, audioUrl, duration);
          addNotification('success', `Recording updated (v${note.version})`);
          setReRecordingNoteId(null);
        } else {
          note = addVoiceNote(currentProjectId!, audioUrl, duration, user?.id);
          addNotification('success', 'Note captured!');
        }

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
      setReRecordingNoteId(null);
    }
  }, [currentProjectId, addVoiceNote, reRecordVoiceNote, addNotification, recordingDuration, reRecordingNoteId, user?.id]);

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

    try {
      // Step 1: Transcribe audio
      console.log('[voice-diary] Starting transcription...');
      console.log('[voice-diary] API URL:', process.env.EXPO_PUBLIC_API_URL || 'NOT SET - using localhost');

      const result = await transcribeAudio(audioUri);

      if (!result.success || !result.text) {
        const errorMsg = result.error || 'Could not transcribe audio';
        console.error('[voice-diary] Transcription failed:', errorMsg);
        updateVoiceNote(noteId, {
          status: 'error',
          errorMessage: errorMsg,
        });
        addNotification('error', errorMsg);
        return;
      }

      console.log('[voice-diary] Transcription success, length:', result.text.length);

      // Clean up the transcript for display
      const cleanedText = cleanTranscript(result.text);
      console.log('[voice-diary] Cleaned text length:', cleanedText.length);

      updateVoiceNote(noteId, {
        transcriptText: cleanedText,
        status: 'processing',
      });

      // Step 2: Send to backend for categorization + summarization
      console.log('[voice-diary] Sending to API for processing...');
      const existingSnippets = getSnippetsForDate(today, currentProjectId || undefined).map((s) => ({
        category: s.category,
        content: s.content,
      }));
      const noteCount = getVoiceNotesForDate(today, currentProjectId || undefined).length;
      console.log('[voice-diary] Existing snippets:', existingSnippets.length, 'Note count:', noteCount);

      try {
        const processResult = await processVoiceNoteApi(
          cleanedText,
          existingSnippets,
          noteCount
        );

        console.log('[voice-diary] API response:', JSON.stringify(processResult, null, 2));

        if (processResult.success) {
          // Update note with AI-generated title and cleaned transcript
          const noteUpdates: any = { status: 'complete' };
          if (processResult.title) {
            noteUpdates.title = processResult.title;
          }
          if (processResult.cleanedTranscript) {
            noteUpdates.cleanedTranscript = processResult.cleanedTranscript;
          }

          // Add new snippets to store
          if (processResult.newSnippets && processResult.newSnippets.length > 0) {
            console.log('[voice-diary] Adding', processResult.newSnippets.length, 'snippets');
            for (const snippet of processResult.newSnippets) {
              addSnippet(noteId, snippet.category as any, snippet.content);
            }
          }

          // Update daily summary (user-specific)
          if (currentProjectId && processResult.summary) {
            console.log('[voice-diary] Updating summary:', processResult.summary.substring(0, 100));
            updateDailySummary(
              today,
              currentProjectId,
              processResult.summary,
              processResult.hasMinimumInfo || false,
              user?.id
            );
          }

          // Add form suggestions
          if (processResult.formSuggestions) {
            for (const suggestion of processResult.formSuggestions) {
              addFormSuggestion(
                suggestion.formType,
                suggestion.formName,
                suggestion.reason,
                suggestion.snippetIds || []
              );
            }
          }

          updateVoiceNote(noteId, noteUpdates);
          const snippetCount = processResult.newSnippets?.length || 0;
          addNotification('info', snippetCount > 0 ? `Added ${snippetCount} items` : 'Note saved');
        } else {
          // API returned but failed - still complete
          console.log('[voice-diary] API returned no success, marking complete');
          updateVoiceNote(noteId, { status: 'complete' });
          addNotification('success', 'Note saved');
        }
      } catch (apiError: any) {
        // API call failed - still save the transcript but log the error
        console.error('[voice-diary] API processing failed:', apiError.message || apiError);
        updateVoiceNote(noteId, { status: 'complete' });
        // Show more helpful message
        if (apiError.message?.includes('401') || apiError.message?.includes('expired')) {
          addNotification('warning', 'Session expired - please log in again');
        } else if (apiError.message?.includes('network') || apiError.message?.includes('fetch')) {
          addNotification('warning', 'Network error - note saved locally');
        } else {
          addNotification('info', 'Note saved (categorization unavailable)');
        }
      }
    } catch (err: any) {
      console.error('[voice-diary] Processing error:', err.message || err);
      updateVoiceNote(noteId, {
        status: 'error',
        errorMessage: err.message || 'Processing failed',
      });
      addNotification('error', err.message || 'Processing failed');
    }
  };

  const handleDeleteNote = (noteId: string) => {
    Alert.alert(
      'Delete Recording',
      'Are you sure you want to delete this recording?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteVoiceNote(noteId);
            addNotification('info', 'Recording deleted');
          },
        },
      ]
    );
  };

  const handleReRecord = (noteId: string) => {
    setReRecordingNoteId(noteId);
    // Clear existing snippets for this note since we're re-recording
    clearSnippetsForNote(noteId);
    // Start recording immediately
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

  // Generate a short title from transcript (first sentence or first 50 chars)
  const generateTitle = (transcript: string | null): string => {
    if (!transcript) return 'Processing...';

    // Try to get first sentence
    const firstSentence = transcript.split(/[.!?]/)[0].trim();
    if (firstSentence.length <= 50) return firstSentence;

    // Otherwise truncate at word boundary
    const truncated = transcript.substring(0, 47);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 20 ? truncated.substring(0, lastSpace) : truncated) + '...';
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
            Today's Notes ({todayNotes.length})
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
          ) : todayNotes.length === 0 ? (
            <View
              style={{
                padding: 20,
                backgroundColor: isDark ? '#1F2937' : '#FFF',
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: isDark ? '#6B7280' : '#9CA3AF', fontSize: 14, marginBottom: 12 }}>
                No recordings yet today
              </Text>
              {!hasExampleData() && (
                <Pressable
                  onPress={() => {
                    if (currentProjectId) {
                      seedExampleData(currentProjectId, user?.id);
                      addNotification('success', 'Loaded 5 example recordings');
                    }
                  }}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    backgroundColor: isDark ? '#374151' : '#E5E7EB',
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ color: isDark ? '#FFF' : '#374151', fontSize: 13, fontWeight: '500' }}>
                    Load Example Data
                  </Text>
                </Pressable>
              )}
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
                  {getStatusIcon(note.status)}
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
                        {note.status === 'error'
                          ? note.errorMessage || 'Error'
                          : note.title || generateTitle(note.transcriptText)}
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
                      {formatTime(note.createdAt)} · {formatDuration(note.duration)}
                      {getSnippetsForNote(note.id).length > 0 && ` · ${getSnippetsForNote(note.id).length} items`}
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
                  {formatTime(selectedNote.createdAt)} · {formatDuration(selectedNote.duration)}
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
              {getSnippetsForNote(selectedNote.id).length > 0 && (
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
                    Extracted Items ({getSnippetsForNote(selectedNote.id).length})
                  </Text>
                  {getSnippetsForNote(selectedNote.id).map((snippet) => (
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
