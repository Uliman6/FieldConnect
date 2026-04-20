import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Mic,
  Square,
  Check,
  AlertCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  RefreshCw,
  Building2,
  X,
  Shield,
  Truck,
  CheckCircle2,
  ListTodo,
  ArrowRight,
  Users,
  Package,
  MessageSquare,
  Edit3,
  Save,
} from 'lucide-react';
import { useColorScheme } from '../lib/use-color-scheme';
import { useVoiceDiaryStore } from '../lib/voice-diary-store';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import type { VoiceNote, CategorizedSnippet } from '../lib/types';

export default function Record() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [reRecordingNoteId, setReRecordingNoteId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<VoiceNote | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editedTranscript, setEditedTranscript] = useState('');
  const [isFeedbackMode, setIsFeedbackMode] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { user } = useAuth();

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
    getVoiceNotesForProject,
    getSnippetsForDate,
    getTodayDate,
    currentProjectId,
    setCurrentProject,
    clearSnippetsForNote,
    categorizedSnippets,
    seedExampleData,
    hasExampleData,
    projects,
    setProjects,
    addProject,
  } = useVoiceDiaryStore();

  // Load projects from API on mount
  useEffect(() => {
    const loadProjects = async () => {
      setIsLoadingProjects(true);
      try {
        const apiProjects = await api.getProjects();
        setProjects(apiProjects);
      } catch (err) {
        console.error('Failed to load projects:', err);
      } finally {
        setIsLoadingProjects(false);
      }
    };
    loadProjects();
  }, [setProjects]);

  const getSnippetsForNote = (noteId: string): CategorizedSnippet[] => {
    return categorizedSnippets.filter((s) => s.voiceNoteId === noteId);
  };

  const today = getTodayDate();
  // Get all notes for the project (not just today)
  const allProjectNotes = currentProjectId ? getVoiceNotesForProject(currentProjectId) : [];
  // Sort by date descending (newest first)
  const sortedNotes = [...allProjectNotes].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  // Group notes by date
  const notesByDate = sortedNotes.reduce((acc, note) => {
    const date = note.createdAt.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(note);
    return acc;
  }, {} as Record<string, VoiceNote[]>);
  const sortedDates = Object.keys(notesByDate).sort((a, b) => b.localeCompare(a));

  const currentProject = projects.find((p) => p.id === currentProjectId);

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

        if (blob.size < 1000) {
          setError('No audio detected. Please try again.');
          addNotification('error', 'No voice detected');
          setReRecordingNoteId(null);
          return;
        }

        const audioUrl = URL.createObjectURL(blob);
        const duration = recordingDuration;

        let note: VoiceNote;
        if (reRecordingNoteId) {
          note = reRecordVoiceNote(reRecordingNoteId, audioUrl, duration);
          addNotification('success', `Recording updated (v${note.version})`);
          setReRecordingNoteId(null);
        } else {
          note = addVoiceNote(currentProjectId!, audioUrl, duration, user?.id);
          addNotification('success', 'Note captured!');
        }

        processVoiceNoteAsync(note.id, blob);
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingDuration(0);

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

  const processVoiceNoteAsync = async (noteId: string, audioBlob: Blob) => {
    updateVoiceNote(noteId, { status: 'transcribing' });

    try {
      // Step 1: Transcribe
      const result = await api.transcribeAudio(audioBlob);

      if (!result.success || !result.text) {
        const errorMsg = result.error || 'Could not transcribe audio';
        updateVoiceNote(noteId, { status: 'error', errorMessage: errorMsg });
        addNotification('error', errorMsg);
        return;
      }

      const cleanedText = cleanTranscript(result.text);
      updateVoiceNote(noteId, { transcriptText: cleanedText, status: 'processing' });

      // Step 2: Process with AI
      const existingSnippets = getSnippetsForDate(today, currentProjectId || undefined).map((s) => ({
        category: s.category,
        content: s.content,
      }));
      const noteCount = getVoiceNotesForDate(today, currentProjectId || undefined).length;

      try {
        const processResult = await api.processVoiceNote(cleanedText, existingSnippets, noteCount);

        if (processResult.success) {
          const noteUpdates: Partial<VoiceNote> = { status: 'complete' };
          if (processResult.title) noteUpdates.title = processResult.title;
          if (processResult.cleanedTranscript) noteUpdates.cleanedTranscript = processResult.cleanedTranscript;

          const createdSnippetIds: string[] = [];
          if (processResult.newSnippets && processResult.newSnippets.length > 0) {
            for (const snippet of processResult.newSnippets) {
              addSnippet(noteId, snippet.category, snippet.content);
            }
            const allSnippets = useVoiceDiaryStore.getState().categorizedSnippets;
            const noteSnippets = allSnippets.filter(s => s.voiceNoteId === noteId);
            createdSnippetIds.push(...noteSnippets.map(s => s.id));
          }

          if (currentProjectId && processResult.summary) {
            updateDailySummary(today, currentProjectId, processResult.summary, processResult.hasMinimumInfo || false, user?.id);
          }

          if (processResult.formSuggestions && createdSnippetIds.length > 0) {
            for (const suggestion of processResult.formSuggestions) {
              addFormSuggestion(suggestion.formType, suggestion.formName, suggestion.reason, createdSnippetIds);
            }
          }

          updateVoiceNote(noteId, noteUpdates);
          
          // Save to backend for admin visibility
          api.saveEntry({
            projectId: currentProjectId || undefined,
            projectName: currentProject?.name,
            transcriptText: cleanedText,
            cleanedText: processResult.cleanedTranscript || cleanedText,
            category: processResult.newSnippets?.[0]?.category,
          });
          
          const snippetCount = processResult.newSnippets?.length || 0;
          addNotification('info', snippetCount > 0 ? `Added ${snippetCount} items` : 'Note saved');
        } else {
          updateVoiceNote(noteId, { status: 'complete' });
          
          // Save to backend even without AI processing
          api.saveEntry({
            projectId: currentProjectId || undefined,
            projectName: currentProject?.name,
            transcriptText: cleanedText,
            cleanedText: cleanedText,
          });
          
          addNotification('success', 'Note saved');
        }
      } catch (apiError: any) {
        updateVoiceNote(noteId, { status: 'complete' });
        
        // Save to backend even if AI fails
        api.saveEntry({
          projectId: currentProjectId || undefined,
          projectName: currentProject?.name,
          transcriptText: cleanedText,
          cleanedText: cleanedText,
        });
        
        addNotification('info', 'Note saved (categorization unavailable)');
      }
    } catch (err: any) {
      updateVoiceNote(noteId, { status: 'error', errorMessage: err.message || 'Processing failed' });
      addNotification('error', err.message || 'Processing failed');
    }
  };

  const handleDeleteNote = (noteId: string) => {
    if (window.confirm('Are you sure you want to delete this recording?')) {
      deleteVoiceNote(noteId);
      clearSnippetsForNote(noteId);
      addNotification('info', 'Recording deleted');
      setSelectedNote(null);
    }
  };

  const handleReRecord = (noteId: string) => {
    setReRecordingNoteId(noteId);
    clearSnippetsForNote(noteId);
    setSelectedNote(null);
    startRecording();
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      setError('Please enter a project name');
      return;
    }

    try {
      const newProject = await api.createProject({ name: newProjectName.trim() });
      setProjects([newProject, ...projects]);
      setCurrentProject(newProject.id);
      setNewProjectName('');
      setIsCreatingProject(false);
      setShowProjectPicker(false);
      addNotification('success', `Project "${newProject.name}" created`);
    } catch (err) {
      // Fallback to local
      const localProject = addProject(newProjectName.trim());
      setCurrentProject(localProject.id);
      setNewProjectName('');
      setIsCreatingProject(false);
      setShowProjectPicker(false);
      addNotification('success', `Project "${localProject.name}" created locally`);
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateString === yesterday.toISOString().split('T')[0]) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const cleanTranscript = (rawText: string): string => {
    if (!rawText || rawText.trim().length === 0) return rawText || '';
    let cleaned = rawText;
    const fillerPatterns = [
      /\b(um|uh|er|ah|like|you know|basically|actually|honestly|literally|so yeah|anyway|right)\b/gi,
      /\b(kind of|sort of|i mean|i guess|i think)\b/gi,
    ];
    fillerPatterns.forEach((pattern) => {
      cleaned = cleaned.replace(pattern, '');
    });
    cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, '$1');
    cleaned = cleaned.replace(/\s{2,}/g, ' ');
    cleaned = cleaned.replace(/\s+([.,!?])/g, '$1');
    cleaned = cleaned.replace(/([.,!?])(?=[A-Za-z])/g, '$1 ');
    cleaned = cleaned.replace(/(^|[.!?]\s+)([a-z])/g, (_match, p1, p2) => p1 + p2.toUpperCase());
    cleaned = cleaned.trim();
    if (cleaned.length < 3) return rawText.trim();
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    if (cleaned && !/[.!?]$/.test(cleaned)) cleaned += '.';
    return cleaned;
  };

  const generateTitle = (transcript: string | null): string => {
    if (!transcript) return 'Processing...';
    const lower = transcript.toLowerCase();
    if (lower.includes('inspection')) return 'Site Inspection';
    if (lower.includes('delivery') || lower.includes('delivered')) return 'Material Delivery';
    if (lower.includes('safety') || lower.includes('hazard') || lower.includes('guardrail')) return 'Safety Issue';
    if (lower.includes('concrete') || lower.includes('pour')) return 'Concrete Work';
    if (lower.includes('electrical') || lower.includes('rough-in') || lower.includes('panel')) return 'Electrical Work';
    if (lower.includes('plumb') || lower.includes('pipe')) return 'Plumbing Work';
    if (lower.includes('coordination') || lower.includes('meeting')) return 'Team Coordination';
    if (lower.includes('finished') || lower.includes('completed') || lower.includes('done')) return 'Work Completed';
    if (lower.includes('framing') || lower.includes('frame')) return 'Framing Work';
    if (lower.includes('drywall') || lower.includes('sheetrock')) return 'Drywall Work';
    if (lower.includes('hvac') || lower.includes('duct')) return 'HVAC Work';
    if (lower.includes('roof')) return 'Roofing Work';
    if (lower.includes('weather') || lower.includes('rain')) return 'Weather Update';
    if (lower.includes('schedule') || lower.includes('tomorrow')) return 'Schedule Update';
    return 'Voice Note';
  };

  const getStatusIcon = (status: VoiceNote['status']) => {
    switch (status) {
      case 'complete':
        return <Check size={16} className="text-green-500" />;
      case 'error':
        return <AlertCircle size={16} className="text-red-500" />;
      case 'transcribing':
      case 'processing':
        return <Loader2 size={16} className="text-amber-500 animate-spin" />;
      default:
        return <Clock size={16} className="text-gray-500" />;
    }
  };

  // Category icons for the record page hints - categoryKey maps to actual snippet categories
  const CATEGORY_HINTS = [
    { icon: <CheckCircle2 size={18} />, label: 'Work Done', categoryKey: 'Work Completed', color: 'text-green-500', bgActive: 'bg-green-100 dark:bg-green-900/40' },
    { icon: <ListTodo size={18} />, label: 'To Do', categoryKey: 'Work To Be Done', color: 'text-amber-500', bgActive: 'bg-amber-100 dark:bg-amber-900/40' },
    { icon: <Shield size={18} />, label: 'Safety', categoryKey: 'Safety', color: 'text-red-500', bgActive: 'bg-red-100 dark:bg-red-900/40' },
    { icon: <ArrowRight size={18} />, label: 'Follow-up', categoryKey: 'Follow-up Items', color: 'text-pink-500', bgActive: 'bg-pink-100 dark:bg-pink-900/40' },
    { icon: <Users size={18} />, label: 'Team', categoryKey: 'Team', color: 'text-cyan-500', bgActive: 'bg-cyan-100 dark:bg-cyan-900/40' },
    { icon: <Truck size={18} />, label: 'Logistics', categoryKey: 'Logistics', color: 'text-blue-500', bgActive: 'bg-blue-100 dark:bg-blue-900/40' },
    { icon: <Package size={18} />, label: 'Materials', categoryKey: 'Materials', color: 'text-stone-500', bgActive: 'bg-stone-100 dark:bg-stone-900/40' },
    { icon: <AlertCircle size={18} />, label: 'Issues', categoryKey: 'Issues', color: 'text-red-500', bgActive: 'bg-red-100 dark:bg-red-900/40' },
  ];

  // Get today's snippets to check which categories are covered
  const todaySnippets = getSnippetsForDate(today, currentProjectId || undefined);
  const coveredCategories = new Set(todaySnippets.map(s => s.category));

  const handleStartEditing = (note: VoiceNote) => {
    setEditingNoteId(note.id);
    setEditedTranscript(note.cleanedTranscript || note.transcriptText || '');
  };

  const handleSaveEdit = async (noteId: string) => {
    if (!editedTranscript.trim()) {
      setEditingNoteId(null);
      setEditedTranscript('');
      return;
    }

    setIsSavingEdit(true);

    try {
      // Update the note text first
      updateVoiceNote(noteId, {
        transcriptText: editedTranscript,
        cleanedTranscript: editedTranscript,
        status: 'processing',
      });

      // Clear old snippets for this note
      clearSnippetsForNote(noteId);

      // Re-process the edited transcript to update categories/summary
      const existingSnippets = getSnippetsForDate(today, currentProjectId || undefined)
        .filter(s => s.voiceNoteId !== noteId) // Exclude this note's old snippets
        .map((s) => ({ category: s.category, content: s.content }));
      const noteCount = getVoiceNotesForDate(today, currentProjectId || undefined).length;

      try {
        const processResult = await api.processVoiceNote(editedTranscript, existingSnippets, noteCount);

        if (processResult.success) {
          const noteUpdates: Partial<VoiceNote> = { status: 'complete' };
          if (processResult.title) noteUpdates.title = processResult.title;
          if (processResult.cleanedTranscript) noteUpdates.cleanedTranscript = processResult.cleanedTranscript;

          // Add new snippets
          if (processResult.newSnippets && processResult.newSnippets.length > 0) {
            for (const snippet of processResult.newSnippets) {
              addSnippet(noteId, snippet.category, snippet.content);
            }
          }

          // Update daily summary
          if (currentProjectId && processResult.summary) {
            updateDailySummary(today, currentProjectId, processResult.summary, processResult.hasMinimumInfo || false, user?.id);
          }

          updateVoiceNote(noteId, noteUpdates);
          addNotification('success', 'Note updated and re-categorized');
        } else {
          updateVoiceNote(noteId, { status: 'complete' });
          addNotification('success', 'Note updated');
        }
      } catch (apiError) {
        // API failed but we still saved the text
        updateVoiceNote(noteId, { status: 'complete' });
        addNotification('info', 'Note saved (re-categorization unavailable)');
      }
    } catch (err) {
      addNotification('error', 'Failed to save edit');
    } finally {
      setIsSavingEdit(false);
      setEditingNoteId(null);
      setEditedTranscript('');
    }
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditedTranscript('');
  };

  // Feedback recording handler
  const startFeedbackRecording = useCallback(async () => {
    setIsFeedbackMode(true);
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
      });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());

        if (blob.size < 1000) {
          setError('No audio detected. Please try again.');
          setIsFeedbackMode(false);
          return;
        }

        // Transcribe and store as feedback
        try {
          const result = await api.transcribeAudio(blob);
          if (result.success && result.text) {
            // Store feedback (we'll create an API endpoint for this)
            await api.submitFeedback({
              text: result.text,
              userId: user?.id,
              userName: user?.name || user?.email,
              timestamp: new Date().toISOString(),
            });
            addNotification('success', 'Thank you for your feedback!');
          } else {
            addNotification('error', 'Could not transcribe feedback');
          }
        } catch (err) {
          // Fallback: store locally
          const feedbackList = JSON.parse(localStorage.getItem('voice-diary-feedback') || '[]');
          feedbackList.push({
            id: `feedback-${Date.now()}`,
            audioUrl: URL.createObjectURL(blob),
            timestamp: new Date().toISOString(),
            userId: user?.id,
            userName: user?.name || user?.email,
          });
          localStorage.setItem('voice-diary-feedback', JSON.stringify(feedbackList));
          addNotification('info', 'Feedback saved locally');
        }
        setIsFeedbackMode(false);
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err: any) {
      setError('Could not start recording. Please try again.');
      setIsFeedbackMode(false);
    }
  }, [user, addNotification]);

  return (
    <div className={`h-full flex flex-col ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
      <div className="flex-1 flex flex-col p-4 overflow-y-auto">
        {/* Project Selector */}
        <button
          onClick={() => setShowProjectPicker(true)}
          className={`flex items-center gap-3 p-4 rounded-xl mb-4 border transition-colors ${
            currentProjectId
              ? 'border-primary-600 ' + (isDark ? 'bg-gray-900' : 'bg-white')
              : isDark
              ? 'border-gray-700 bg-gray-900'
              : 'border-gray-200 bg-white'
          }`}
        >
          <Building2 size={20} className={currentProjectId ? 'text-primary-600' : 'text-gray-400'} />
          <span className={`flex-1 text-left font-medium ${currentProject ? (isDark ? 'text-white' : 'text-gray-900') : 'text-gray-400'}`}>
            {currentProject?.name || 'Select a project...'}
          </span>
          <ChevronDown size={20} className="text-gray-400" />
        </button>

        {/* Main Record Button */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {/* Category Hints - shown when project selected and not recording */}
          {currentProjectId && !isRecording && (
            <div className="mb-4">
              <p className={`text-xs text-center mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                Topics to cover in your note:
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-xs">
                {CATEGORY_HINTS.map((hint, idx) => {
                  const isCovered = coveredCategories.has(hint.categoryKey as any);
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full shadow-sm transition-all ${
                        isCovered
                          ? hint.bgActive + ' ring-2 ring-offset-1 ' + (isDark ? 'ring-offset-black' : 'ring-offset-gray-50') + ' ring-current'
                          : isDark ? 'bg-gray-800 opacity-50' : 'bg-white opacity-60'
                      }`}
                    >
                      <span className={hint.color}>{hint.icon}</span>
                      <span className={`text-xs font-medium ${isCovered ? (isDark ? 'text-white' : 'text-gray-900') : (isDark ? 'text-gray-400' : 'text-gray-500')}`}>{hint.label}</span>
                      {isCovered && <Check size={12} className={hint.color} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <p className={`text-base mb-6 text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            {!currentProjectId
              ? 'Select a project to start recording'
              : isRecording
              ? isFeedbackMode
                ? 'Recording feedback... Tap to stop'
                : reRecordingNoteId
                ? 'Re-recording... Tap to stop'
                : 'Recording... Tap to stop'
              : 'Tap to record a voice note'}
          </p>

          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!currentProjectId && !isRecording}
            className={`w-36 h-36 rounded-full flex items-center justify-center shadow-lg transition-all ${
              !currentProjectId
                ? 'bg-gray-400'
                : isRecording
                ? isFeedbackMode
                  ? 'bg-purple-500 animate-recording-pulse'
                  : 'bg-red-500 animate-recording-pulse'
                : 'bg-primary-600 hover:bg-primary-700 active:scale-95'
            }`}
          >
            {isRecording ? (
              <Square size={48} className="text-white" fill="white" />
            ) : (
              <Mic size={56} className="text-white" />
            )}
          </button>

          {isRecording && (
            <p className={`text-3xl font-bold mt-6 tabular-nums ${isFeedbackMode ? 'text-purple-500' : 'text-red-500'}`}>
              {formatDuration(recordingDuration)}
            </p>
          )}

          {/* Feedback Button */}
          {currentProjectId && !isRecording && (
            <button
              onClick={startFeedbackRecording}
              className={`mt-6 flex items-center gap-2 px-4 py-2 rounded-full ${isDark ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-100 text-purple-700'}`}
            >
              <MessageSquare size={16} />
              <span className="text-sm font-medium">Give Feedback</span>
            </button>
          )}

          {error && (
            <div className="flex items-center gap-2 mt-6 px-4 py-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
              <AlertCircle size={18} className="text-red-500" />
              <span className="text-red-600 dark:text-red-400 text-sm">{error}</span>
            </div>
          )}
        </div>

        {/* View and Edit Notes - Collapsible Section */}
        {currentProjectId && (
          <div className="mt-auto">
            {/* Toggle Button */}
            <button
              onClick={() => setShowNotes(!showNotes)}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl mb-2 ${isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'} shadow-sm`}
            >
              {showNotes ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
              <span className="font-medium">
                View and Edit Notes {allProjectNotes.length > 0 && `(${allProjectNotes.length})`}
              </span>
            </button>

            {/* Collapsible Notes Section */}
            {showNotes && (
              <div className="overflow-hidden flex flex-col" style={{ maxHeight: '40vh' }}>
                {allProjectNotes.length === 0 ? (
                  <div className={`p-5 rounded-xl text-center ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                    <p className="text-gray-400 text-sm mb-3">No recordings yet</p>
                    {!hasExampleData() && (
                      <button
                        onClick={() => {
                          if (currentProjectId) {
                            seedExampleData(currentProjectId, user?.id);
                            addNotification('success', 'Loaded example data');
                          }
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium ${isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700'}`}
                      >
                        Load Example Data
                      </button>
                    )}
                  </div>
                ) : (
                  <div className={`rounded-xl overflow-hidden flex-1 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                    <div className="overflow-y-auto h-full pb-24">
                      {sortedDates.map((date) => (
                        <div key={date}>
                          {/* Date Header */}
                          <div className={`sticky top-0 px-4 py-2 text-xs font-semibold ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                            {date === today ? 'Today' : formatDate(date)}
                          </div>
                          {/* Notes for this date */}
                          {notesByDate[date].map((note, index) => (
                            <div
                              key={note.id}
                              className={`p-4 ${
                                index < notesByDate[date].length - 1 ? (isDark ? 'border-b border-gray-800' : 'border-b border-gray-100') : ''
                              }`}
                            >
                              {editingNoteId === note.id ? (
                                /* Editing Mode */
                                <div>
                                  <textarea
                                    value={editedTranscript}
                                    onChange={(e) => setEditedTranscript(e.target.value)}
                                    rows={4}
                                    autoFocus
                                    className={`w-full p-3 rounded-lg text-sm ${isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'}`}
                                  />
                                  <div className="flex gap-2 mt-2">
                                    <button
                                      onClick={handleCancelEdit}
                                      disabled={isSavingEdit}
                                      className={`flex-1 py-2 rounded-lg text-sm font-medium ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'} disabled:opacity-50`}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleSaveEdit(note.id)}
                                      disabled={isSavingEdit}
                                      className="flex-1 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white flex items-center justify-center gap-1 disabled:opacity-50"
                                    >
                                      {isSavingEdit ? (
                                        <>
                                          <Loader2 size={14} className="animate-spin" />
                                          Saving...
                                        </>
                                      ) : (
                                        <>
                                          <Save size={14} />
                                          Save
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                /* View Mode */
                                <div>
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      {getStatusIcon(note.status)}
                                      <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                        {note.status === 'error' ? note.errorMessage || 'Error' : note.title || generateTitle(note.transcriptText)}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => handleStartEditing(note)}
                                        disabled={isRecording || note.status !== 'complete'}
                                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                                      >
                                        <Edit3 size={14} className="text-primary-600" />
                                      </button>
                                      <button
                                        onClick={() => handleReRecord(note.id)}
                                        disabled={isRecording}
                                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                                      >
                                        <RefreshCw size={14} className="text-blue-500" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteNote(note.id)}
                                        disabled={isRecording}
                                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                                      >
                                        <Trash2 size={14} className="text-red-500" />
                                      </button>
                                    </div>
                                  </div>
                                  <p className={`text-sm mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                    {note.cleanedTranscript || note.transcriptText || 'Processing...'}
                                  </p>
                                  <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                    {formatTime(note.createdAt)} · {formatDuration(note.duration)}
                                    {getSnippetsForNote(note.id).length > 0 && ` · ${getSnippetsForNote(note.id).length} items`}
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Project Picker Modal */}
      {showProjectPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowProjectPicker(false)} />
          <div className={`relative w-full sm:max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-2xl ${isDark ? 'bg-gray-900' : 'bg-white'} safe-area-bottom`}>
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
              <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Select Project</h2>
              <button onClick={() => setShowProjectPicker(false)} className="p-2">
                <X size={24} className={isDark ? 'text-white' : 'text-gray-900'} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {isCreatingProject ? (
                <div className={`p-4 rounded-xl border border-primary-600 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    New Project Name
                  </label>
                  <input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Enter project name..."
                    autoFocus
                    className={`w-full px-4 py-3 rounded-lg mb-3 ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900'}`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setIsCreatingProject(false); setNewProjectName(''); }}
                      className={`flex-1 py-3 rounded-lg font-medium ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700'}`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateProject}
                      className="flex-1 py-3 rounded-lg font-medium bg-primary-600 text-white"
                    >
                      Create
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreatingProject(true)}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl mb-4 border border-dashed ${isDark ? 'border-gray-700' : 'border-gray-300'}`}
                >
                  <Plus size={24} className="text-primary-600" />
                  <span className="text-primary-600 font-medium">Create New Project</span>
                </button>
              )}

              {isLoadingProjects ? (
                <div className="text-center py-6">
                  <Loader2 className="animate-spin mx-auto text-gray-400" size={24} />
                </div>
              ) : projects.length === 0 && !isCreatingProject ? (
                <p className="text-center text-gray-400 py-6">No projects yet. Create one above!</p>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => { setCurrentProject(project.id); setShowProjectPicker(false); }}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl mb-2 transition-colors ${
                      currentProjectId === project.id
                        ? 'bg-primary-50 dark:bg-primary-900/30 border border-primary-600'
                        : isDark
                        ? 'bg-gray-800 hover:bg-gray-700'
                        : 'bg-white hover:bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <Building2 size={24} className={currentProjectId === project.id ? 'text-primary-600' : 'text-gray-400'} />
                    <span className={`flex-1 text-left font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {project.name}
                    </span>
                    {currentProjectId === project.id && <Check size={20} className="text-primary-600" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Note Detail Modal */}
      {selectedNote && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedNote(null)} />
          <div className={`relative w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl ${isDark ? 'bg-gray-900' : 'bg-white'} safe-area-bottom overflow-hidden`}>
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
              <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Note Details</h2>
              <button onClick={() => setSelectedNote(null)} className="p-2">
                <X size={24} className={isDark ? 'text-white' : 'text-gray-900'} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              {selectedNote.title && (
                <h3 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {selectedNote.title}
                </h3>
              )}
              <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {formatTime(selectedNote.createdAt)} · {formatDuration(selectedNote.duration)}
                {selectedNote.version > 1 && ` · Version ${selectedNote.version}`}
              </p>

              <div className={`p-4 rounded-xl mb-4 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <p className="text-xs font-semibold text-primary-600 uppercase mb-2">Summary</p>
                <p className={`text-base leading-relaxed ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                  {selectedNote.cleanedTranscript || selectedNote.transcriptText || 'No transcript available'}
                </p>
              </div>

              {getSnippetsForNote(selectedNote.id).length > 0 && (
                <div className="mb-4">
                  <p className={`text-xs font-semibold uppercase mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                    Extracted Items ({getSnippetsForNote(selectedNote.id).length})
                  </p>
                  {getSnippetsForNote(selectedNote.id).map((snippet) => (
                    <div key={snippet.id} className={`p-4 rounded-xl mb-2 ${isDark ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}>
                      <span className="inline-block px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-md mb-2">
                        {snippet.category}
                      </span>
                      <p className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{snippet.content}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => handleReRecord(selectedNote.id)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-xl font-medium"
                >
                  <RefreshCw size={18} />
                  Re-record
                </button>
                <button
                  onClick={() => handleDeleteNote(selectedNote.id)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-xl font-medium"
                >
                  <Trash2 size={18} />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
