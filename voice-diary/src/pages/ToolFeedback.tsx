import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Mic,
  Square,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Building2,
  X,
  Plus,
  Check,
  Shield,
  Zap,
  Hand,
  Settings,
  Lightbulb,
  Star,
  Edit3,
  Save,
  Trash2,
  ClipboardCheck,
  MessageCircle,
} from 'lucide-react';
import { useColorScheme } from '../lib/use-color-scheme';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useToolFeedbackStore } from '../lib/tool-feedback-store';
import { TOOL_BRANDS, type ToolBrand, type ToolFeedbackCategory } from '../lib/types';
import DailyChecklist from '../components/DailyChecklist';

const BRAND_COLORS: Record<ToolBrand, { bg: string; border: string; text: string }> = {
  'DeWalt': { bg: 'bg-yellow-100 dark:bg-yellow-900/30', border: 'border-yellow-500', text: 'text-yellow-700 dark:text-yellow-400' },
  'Milwaukee': { bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-500', text: 'text-red-700 dark:text-red-400' },
  'Hilti': { bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-600', text: 'text-red-700 dark:text-red-400' },
  'Makita': { bg: 'bg-cyan-100 dark:bg-cyan-900/30', border: 'border-cyan-500', text: 'text-cyan-700 dark:text-cyan-400' },
};

const CATEGORY_ICONS: Record<ToolFeedbackCategory, React.ReactNode> = {
  'Safety': <Shield size={14} />,
  'Productivity': <Zap size={14} />,
  'Comfort': <Hand size={14} />,
  'Reliability': <Settings size={14} />,
  'Feature Request': <Lightbulb size={14} />,
  'Tip': <Star size={14} />,
};

const CATEGORY_COLORS: Record<ToolFeedbackCategory, string> = {
  'Safety': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  'Productivity': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  'Comfort': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  'Reliability': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  'Feature Request': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  'Tip': 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400',
};

// Clean and format text for professional forms
function cleanForForm(text: string): string {
  let cleaned = text.trim();

  // Remove fluff intro phrases - "Was able to use X today", "I used the X", "Today I tried", etc.
  // First, try to extract content after "and" or "," that follows a fluff intro
  const fluffIntroPattern = /^(?:i |we )?(?:was |were )?(?:able to )?(?:use|used|try|tried|test|tested|work|worked with)(?:ing)?(?:\s+(?:the|a|my|our))?\s*(?:dewalt|milwaukee|hilti|makita|\w+)\s*(?:tool|drill|saw|driver|grinder|sander|hammer)?\s*(?:today|yesterday|this morning|this week|recently)?\s*(?:and|,)\s*/i;
  const fluffMatch = cleaned.match(fluffIntroPattern);
  if (fluffMatch) {
    cleaned = cleaned.slice(fluffMatch[0].length).trim();
  }

  // More aggressive fluff patterns
  cleaned = cleaned
    // "Today I was able to use..." patterns
    .replace(/^(?:today|yesterday|this morning|this week|recently)\s*(?:i |we )?(?:was |were )?(?:able to )?(?:use|used|try|tried|test|tested).*?(?:and|,)\s*/gi, '')
    // "I have been using X for..." patterns
    .replace(/^(?:i |we )?(?:have been |had been |was |were )?(?:using|testing|trying|working with)(?:\s+(?:the|a|my|our))?\s*\w+\s*(?:tool|drill|saw|driver)?\s*(?:for a while|for some time|lately|recently)?\s*(?:and|,)?\s*/gi, '')
    // "So I tried the X and..." patterns
    .replace(/^(?:so |well |basically )?(?:i |we )?(?:tried|tested|used|grabbed|picked up)(?:\s+(?:the|a|my|our))?\s*\w+\s*(?:and|,)?\s*/gi, '')
    // "It is/was/The X is" at start
    .replace(/^(?:it|this|the (?:tool|drill|saw|driver|grinder))?\s*(?:is|was|has been)\s*(?:really |very |pretty |quite )?\s*/gi, '')
    .trim();

  // Remove filler words and conversational phrases
  cleaned = cleaned
    .replace(/^(so,?\s*|um,?\s*|uh,?\s*|well,?\s*|basically,?\s*|actually,?\s*|and,?\s*|also,?\s*|yeah,?\s*|you know,?\s*)/gi, '')
    .replace(/,?\s*(um|uh|you know|basically|actually|kind of|sort of|like)\s*,?/gi, ' ')
    .trim();

  // Remove personal pronouns and convert to professional statements
  cleaned = cleaned
    // "I feel/felt/have been feeling" -> extract the feeling
    .replace(/\bi(?:'ve|'m| have been| am| was| have| had)?\s*(feeling|felt)\s*(a lot |much |very |really |so )?(more |less )?(safe|comfortable|productive|confident|good|bad|frustrated|annoyed|happy)/gi, (_, _verb, _intensity2, _comp, adj) => {
      const adjectiveMap: Record<string, string> = {
        'safe': 'Improved safety',
        'comfortable': 'Good comfort',
        'productive': 'Good productivity',
        'confident': 'Increased confidence',
        'good': 'Positive experience',
        'bad': 'Negative experience',
        'frustrated': 'Causes frustration',
        'annoyed': 'Causes frustration',
        'happy': 'Positive experience',
      };
      return adjectiveMap[adj?.toLowerCase()] || adj;
    })
    // "I love/like/hate this" -> "Excellent/Good/Poor"
    .replace(/\bi (really |absolutely )?(love|like|enjoy|hate|dislike|can't stand)\s*(this|it|the|using)?\s*/gi, (_, _intensity, verb) => {
      if (/love/.test(verb)) return 'Excellent ';
      if (/like|enjoy/.test(verb)) return 'Good ';
      if (/hate|dislike|can't stand/.test(verb)) return 'Poor ';
      return '';
    })
    // "I think/believe/find/would say" -> remove
    .replace(/\bi (think|believe|find|noticed|noticed that|realized|feel like|feel that|would say|could say|might say|have to say)\s*(that\s*)?/gi, '')
    // "It is/was/has been" -> convert or remove
    .replace(/\b(it|this|the tool|this tool|the drill|this drill)\s*(is|was|has been|'s)\s*(really |very |so |extremely |a lot )?(a\s*)?/gi, '')
    // "anything/everything I've used/tried" -> "comparable tools"
    .replace(/\b(anything|everything|any.?thing|other tools?)\s*(else\s*)?(i've|i have|we've|we have)\s*(ever\s*)?(used|tried|tested|worked with)/gi, 'comparable tools')
    // "I've used/tried/been using" -> remove the I've part
    .replace(/\bi've\s*(been\s*)?(using|used|trying|tried|testing|tested|working with)/gi, '')
    .replace(/\bi('ve| have| had)\s*/gi, '')
    // Remove remaining pronouns and contractions
    .replace(/\b(i|i'm|i'd|i'll|my|me|myself|we|we're|we've|we'd|our|us|you|you're|your|they|their|them)\b/gi, '')
    // "knowing that" -> remove
    .replace(/knowing that\s*/gi, '')
    // "this has a" -> just describe what it has
    .replace(/\b(this|it) has (a |an )?/gi, 'Has ')
    // Clean up "has has" or double words
    .replace(/\b(\w+)\s+\1\b/gi, '$1');

  // Extract key features/benefits mentioned - convert conversational to professional
  const featurePatterns = [
    { pattern: /safeguard|safety feature|protection/gi, replacement: 'Has safety feature' },
    { pattern: /grip|handle|ergonomic/gi, replacement: 'Ergonomic design' },
    { pattern: /battery life|long lasting|lasts all day/gi, replacement: 'Good battery life' },
    { pattern: /powerful|strong|high torque/gi, replacement: 'High power output' },
    { pattern: /lightweight|light weight|not heavy/gi, replacement: 'Lightweight design' },
    { pattern: /heavy|too heavy|weighs a lot/gi, replacement: 'Heavy weight concern' },
    { pattern: /fast|quick|speeds up/gi, replacement: 'Fast operation' },
    { pattern: /slow|takes too long/gi, replacement: 'Slow operation' },
    { pattern: /easy to use|user friendly|intuitive/gi, replacement: 'Easy to use' },
    { pattern: /difficult|hard to use|confusing/gi, replacement: 'Difficult to use' },
    { pattern: /reliable|dependable|consistent/gi, replacement: 'Reliable performance' },
    { pattern: /breaks|broke|unreliable|inconsistent/gi, replacement: 'Reliability issues' },
    { pattern: /sensitive.*(trigger|response|reactive)/gi, replacement: 'Highly responsive trigger' },
    { pattern: /reactive.*(trigger)/gi, replacement: 'Highly responsive trigger' },
    { pattern: /trigger.*(sensitive|reactive)/gi, replacement: 'Highly responsive trigger' },
    { pattern: /vibrat/gi, replacement: 'Vibration concern' },
    { pattern: /loud|noise|noisy/gi, replacement: 'Noise level concern' },
    { pattern: /quiet|silent/gi, replacement: 'Quiet operation' },
    { pattern: /balance|balanced|well-balanced/gi, replacement: 'Good balance' },
    { pattern: /awkward|unbalanced|off-balance/gi, replacement: 'Balance issues' },
    { pattern: /precise|precision|accurate/gi, replacement: 'High precision' },
    { pattern: /smooth|fluid/gi, replacement: 'Smooth operation' },
    { pattern: /heat|hot|overheat/gi, replacement: 'Heat concern' },
    { pattern: /dust|debris|collection/gi, replacement: 'Dust collection' },
    { pattern: /led|light|visibility/gi, replacement: 'Good visibility/LED' },
    { pattern: /charge.*(fast|quick)/gi, replacement: 'Fast charging' },
    { pattern: /charge.*(slow|forever|long)/gi, replacement: 'Slow charging' },
  ];

  // Clean up wordy phrases first
  cleaned = cleaned
    .replace(/in terms of how/gi, '')
    .replace(/in terms of/gi, '')
    .replace(/kind of/gi, '')
    .replace(/sort of/gi, '')
    .replace(/a little bit/gi, 'slightly')
    .replace(/a lot/gi, 'very')
    .trim();

  // Try to match feature patterns for cleaner output
  for (const { pattern, replacement } of featurePatterns) {
    if (pattern.test(cleaned)) {
      // If the cleaned text is mostly about this feature, use the clean replacement
      if (cleaned.length < 60) {
        cleaned = replacement;
        break;
      }
    }
  }

  // Final cleanup
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/^[,.\s]+/, '')
    .replace(/[,.\s]+$/, '')
    .trim();

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Add period if missing
  if (cleaned && !/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }

  return cleaned;
}

// Local categorization when API is unavailable
function localCategorize(text: string): Array<{ category: ToolFeedbackCategory; sentiment: 'positive' | 'negative' | 'neutral'; content: string }> {
  const results: Array<{ category: ToolFeedbackCategory; sentiment: 'positive' | 'negative' | 'neutral'; content: string }> = [];
  const lower = text.toLowerCase();

  // First check if transcript is about tools at all
  const toolKeywords = [
    'tool', 'drill', 'saw', 'grinder', 'driver', 'impact', 'hammer', 'sander',
    'battery', 'charge', 'trigger', 'motor', 'torque', 'cordless',
    'dewalt', 'milwaukee', 'hilti', 'makita', 'brushless', 'chuck',
    'training', 'trained', 'incident', 'accident', 'injury', 'safety',
    'accessory', 'accessories', 'bit', 'blade', 'silica', 'vacuum',
    'lanyard', 'repair', 'broken', 'working', 'job', 'task'
  ];

  const hasToolContext = toolKeywords.some(kw => lower.includes(kw));

  // If no tool context, return empty array - this is irrelevant content
  if (!hasToolContext) {
    console.log('[ToolFeedback] No tool context found, skipping categorization');
    return [];
  }

  // Transcript too short
  if (text.trim().length < 15) {
    return [];
  }

  // Split into sentences
  const sentences = text
    .replace(/([.!?])\s+/g, '$1|')
    .split('|')
    .map(s => s.trim())
    .filter(s => s.length > 10); // Increased minimum length

  if (sentences.length === 0 && text.trim().length > 15) {
    sentences.push(text.trim());
  }

  // Determine sentiment
  const detectSentiment = (t: string): 'positive' | 'negative' | 'neutral' => {
    const l = t.toLowerCase();
    const positiveWords = ['great', 'love', 'excellent', 'good', 'best', 'awesome', 'reliable', 'fast', 'powerful', 'easy', 'comfortable', 'safe'];
    const negativeWords = ['bad', 'hate', 'terrible', 'slow', 'heavy', 'broke', 'broken', 'issue', 'problem', 'weak', 'frustrat', 'difficult', 'hard', 'dangerous'];

    const hasPositive = positiveWords.some(w => l.includes(w));
    const hasNegative = negativeWords.some(w => l.includes(w));

    if (hasNegative && !hasPositive) return 'negative';
    if (hasPositive && !hasNegative) return 'positive';
    return 'neutral';
  };

  // Categorize - returns null if sentence doesn't match any category
  const categorize = (t: string): ToolFeedbackCategory | null => {
    const l = t.toLowerCase();

    // Tip - check first
    if (/\b(tip|trick|recommend|lesson|learned|best way|try to|should try|works best|advice)\b/i.test(l)) return 'Tip';
    // Safety
    if (/safety|safe|dangerous|injury|hurt|protect|incident|accident|training|trained/i.test(l)) return 'Safety';
    // Comfort
    if (/comfort|ergonomic|vibrat|fatigue|wrist|grip|balance|weight/i.test(l)) return 'Comfort';
    // Reliability
    if (/battery|reliable|reliab|broke|broken|durability|durable|consistent|repair/i.test(l)) return 'Reliability';
    // Productivity
    if (/fast|slow|efficient|quick|productivity|speed|finish|complete|job/i.test(l)) return 'Productivity';
    // Feature Request
    if (/wish|would be nice|should have|missing|feature|need|want|could use|improvement/i.test(l)) return 'Feature Request';

    // Only return Productivity for generic tool-related feedback
    if (/tool|drill|saw|using|used|works|it's|this/i.test(l)) return 'Productivity';

    return null; // No match
  };

  const seen = new Set<string>();

  for (const sentence of sentences) {
    const category = categorize(sentence);

    // Skip if no category matched
    if (!category) continue;

    const sentiment = detectSentiment(sentence);
    const cleaned = cleanForForm(sentence);

    // Skip if too short, duplicate, or just punctuation
    if (cleaned.length > 10 && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      results.push({
        category,
        sentiment,
        content: cleaned,
      });
    }
  }

  return results;
}

export default function ToolFeedback() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [editingSnippetId, setEditingSnippetId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editedProjectName, setEditedProjectName] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    selectedToolBrand,
    setSelectedToolBrand,
    currentProjectId,
    setCurrentProject,
    projects,
    setProjects,
    addProject,
    updateProject,
    deleteProject,
    addFeedbackEntry,
    updateFeedbackEntry,
    addFeedbackSnippet,
    updateFeedbackSnippet,
    deleteFeedbackSnippet,
    getSnippetsForProject,
    addNotification,
    getDailyCheckForToday,
  } = useToolFeedbackStore();

  // Load projects from API
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

  const currentProject = projects.find((p) => p.id === currentProjectId);
  const projectSnippets = currentProjectId ? getSnippetsForProject(currentProjectId) : [];

  const startRecording = useCallback(async () => {
    if (!currentProjectId) {
      setError('Please select a project first');
      return;
    }
    if (!selectedToolBrand) {
      setError('Please select a tool brand first');
      return;
    }

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
          return;
        }

        const audioUrl = URL.createObjectURL(blob);
        const entry = addFeedbackEntry(currentProjectId!, selectedToolBrand!, audioUrl, recordingDuration, user?.id);
        processAudioAsync(entry.id, blob);
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please enable it in settings.');
      } else {
        setError('Could not start recording. Please try again.');
      }
    }
  }, [currentProjectId, selectedToolBrand, addFeedbackEntry, recordingDuration, user?.id]);

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

  const processAudioAsync = async (entryId: string, audioBlob: Blob) => {
    updateFeedbackEntry(entryId, { status: 'transcribing' });

    try {
      const result = await api.transcribeAudio(audioBlob);
      if (!result.success || !result.text) {
        updateFeedbackEntry(entryId, { status: 'error', errorMessage: result.error || 'Transcription failed' });
        return;
      }

      updateFeedbackEntry(entryId, { transcriptText: result.text, status: 'processing' });

      // Process with tool feedback categorization
      let snippets: Array<{ category: ToolFeedbackCategory; sentiment: 'positive' | 'negative' | 'neutral'; content: string }> = [];

      try {
        const processResult = await api.processToolFeedback(result.text, selectedToolBrand!);
        if (processResult.success && processResult.snippets) {
          snippets = processResult.snippets as typeof snippets;
        }
      } catch {
        // Fallback to local categorization
        snippets = localCategorize(result.text);
      }

      // If no snippets from either method, use local
      if (snippets.length === 0) {
        snippets = localCategorize(result.text);
      }

      // Add snippets to store
      for (const snippet of snippets) {
        addFeedbackSnippet(entryId, selectedToolBrand!, snippet.category, snippet.sentiment, snippet.content);
      }

      updateFeedbackEntry(entryId, { status: 'complete' });
      addNotification('success', `Added ${snippets.length} feedback items`);

    } catch (err: any) {
      updateFeedbackEntry(entryId, { status: 'error', errorMessage: err.message });
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const newProject = await api.createProject({ name: newProjectName.trim() });
      setProjects([newProject, ...projects]);
      setCurrentProject(newProject.id);
      setNewProjectName('');
      setIsCreatingProject(false);
      setShowProjectPicker(false);
    } catch {
      const localProject = addProject(newProjectName.trim());
      setCurrentProject(localProject.id);
      setNewProjectName('');
      setIsCreatingProject(false);
      setShowProjectPicker(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`h-full flex flex-col ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
      <div className="flex-1 flex flex-col p-4 overflow-y-auto">
        {/* Project Selector */}
        <button
          onClick={() => setShowProjectPicker(true)}
          className={`flex items-center gap-3 p-4 rounded-xl mb-4 border transition-colors ${
            currentProjectId
              ? 'border-orange-500 ' + (isDark ? 'bg-gray-900' : 'bg-white')
              : isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'
          }`}
        >
          <Building2 size={20} className={currentProjectId ? 'text-orange-500' : 'text-gray-400'} />
          <span className={`flex-1 text-left font-medium ${currentProject ? (isDark ? 'text-white' : 'text-gray-900') : 'text-gray-400'}`}>
            {currentProject?.name || 'Select a project...'}
          </span>
          <ChevronDown size={20} className="text-gray-400" />
        </button>

        {/* Tool Brand Selector */}
        <div className="mb-4">
          <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            Select Tool Brand
          </p>
          <div className="grid grid-cols-2 gap-3">
            {TOOL_BRANDS.map((brand) => {
              const colors = BRAND_COLORS[brand];
              const isSelected = selectedToolBrand === brand;
              return (
                <button
                  key={brand}
                  onClick={() => setSelectedToolBrand(brand)}
                  className={`p-4 rounded-xl font-bold text-lg transition-all border-2 ${
                    isSelected
                      ? `${colors.bg} ${colors.border} ${colors.text} scale-105 shadow-lg`
                      : isDark ? 'bg-gray-900 border-gray-700 text-gray-400' : 'bg-white border-gray-200 text-gray-600'
                  }`}
                >
                  {brand}
                </button>
              );
            })}
          </div>
        </div>

        {/* Daily Checklist Button */}
        {currentProjectId && selectedToolBrand && (
          <button
            onClick={() => setShowChecklist(true)}
            className={`flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl mb-4 transition-colors border ${
              getDailyCheckForToday(currentProjectId, selectedToolBrand)
                ? 'border-green-500 ' + (isDark ? 'bg-green-900/20 text-green-400' : 'bg-green-50 text-green-700')
                : isDark
                ? 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <ClipboardCheck size={20} className={getDailyCheckForToday(currentProjectId, selectedToolBrand) ? 'text-green-500' : 'text-orange-500'} />
            <span className="font-medium">
              {getDailyCheckForToday(currentProjectId, selectedToolBrand) ? 'View/Edit Daily Checklist' : 'Daily Checklist'}
            </span>
            {getDailyCheckForToday(currentProjectId, selectedToolBrand) && (
              <Check size={16} className="text-green-500 ml-1" />
            )}
          </button>
        )}

        {/* Recording Section */}
        <div className="flex-1 flex flex-col">
          {/* Recording Mode - Shows talking points and mic */}
          {isRecording ? (
            <div className="flex-1 flex flex-col">
              {/* Talking Points Section */}
              <div className={`rounded-xl p-4 mb-4 border ${
                isDark ? 'bg-orange-900/20 border-orange-800' : 'bg-orange-50 border-orange-200'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <MessageCircle size={18} className="text-orange-500" />
                  <span className={`font-semibold text-sm ${isDark ? 'text-orange-400' : 'text-orange-700'}`}>
                    Talk about these points:
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    'Are you trained on this tool?',
                    'Any incidents from previous work?',
                    'Is this the correct tool for the job?',
                    'What accessories are needed?',
                    'Any incidents or issues today?',
                    'Lessons learned?',
                  ].map((point, index) => (
                    <div
                      key={index}
                      className={`flex items-center gap-2 text-sm ${
                        isDark ? 'text-orange-300' : 'text-orange-800'
                      }`}
                    >
                      <span className="text-orange-500 font-bold">{index + 1}.</span>
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recording Controls */}
              <div className="flex-1 flex flex-col items-center justify-center">
                <p className={`text-base mb-4 text-center font-medium ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                  Recording... Tap to stop
                </p>

                <button
                  onClick={stopRecording}
                  className="w-28 h-28 rounded-full flex items-center justify-center shadow-lg bg-orange-500 animate-pulse"
                >
                  <Square size={36} className="text-white" fill="white" />
                </button>

                <p className="text-4xl font-bold mt-4 tabular-nums text-orange-500">
                  {formatDuration(recordingDuration)}
                </p>
              </div>
            </div>
          ) : (
            /* Normal Mode - Show mic button */
            <div className="flex-1 flex flex-col items-center justify-center">
              <p className={`text-base mb-6 text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {!currentProjectId
                  ? 'Select a project to start'
                  : !selectedToolBrand
                  ? 'Select a tool brand above'
                  : `Record feedback for ${selectedToolBrand}`}
              </p>

              <button
                onClick={startRecording}
                disabled={!currentProjectId || !selectedToolBrand}
                className={`w-32 h-32 rounded-full flex items-center justify-center shadow-lg transition-all ${
                  !currentProjectId || !selectedToolBrand
                    ? 'bg-gray-400'
                    : 'bg-orange-500 hover:bg-orange-600 active:scale-95'
                }`}
              >
                <Mic size={48} className="text-white" />
              </button>

              {error && (
                <div className="flex items-center gap-2 mt-6 px-4 py-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
                  <AlertCircle size={18} className="text-red-500" />
                  <span className="text-red-600 dark:text-red-400 text-sm">{error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent Feedback - Collapsible Section */}
        {currentProjectId && (
          <div className="mt-auto">
            {/* Toggle Button */}
            <button
              onClick={() => setShowFeedback(!showFeedback)}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl mb-2 ${isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'} shadow-sm`}
            >
              {showFeedback ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
              <span className="font-medium">
                View and Edit Feedback {projectSnippets.length > 0 && `(${projectSnippets.length})`}
              </span>
            </button>

            {/* Collapsible Feedback Section */}
            {showFeedback && (
              <div className="flex flex-col" style={{ maxHeight: '50vh' }}>
                {projectSnippets.length === 0 ? (
                  <div className={`p-5 rounded-xl text-center ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                    <p className="text-gray-400 text-sm">No feedback recorded yet</p>
                    <p className={`text-xs mt-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                      Record voice feedback to see items here
                    </p>
                  </div>
                ) : (
                  <div className={`rounded-xl flex-1 overflow-y-auto ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                    <div className="pb-32">
                      {projectSnippets.map((snippet) => (
                        <div
                          key={snippet.id}
                          className={`p-4 border-b last:border-b-0 ${isDark ? 'border-gray-800' : 'border-gray-100'}`}
                        >
                          {editingSnippetId === snippet.id ? (
                            /* Editing Mode */
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${BRAND_COLORS[snippet.toolBrand].bg} ${BRAND_COLORS[snippet.toolBrand].text}`}>
                                  {snippet.toolBrand}
                                </span>
                                <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${CATEGORY_COLORS[snippet.category]}`}>
                                  {CATEGORY_ICONS[snippet.category]}
                                  {snippet.category}
                                </span>
                              </div>
                              <textarea
                                value={editedContent}
                                onChange={(e) => setEditedContent(e.target.value)}
                                rows={3}
                                autoFocus
                                className={`w-full p-3 rounded-lg text-sm ${isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'}`}
                              />
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={() => { setEditingSnippetId(null); setEditedContent(''); }}
                                  disabled={isSavingEdit}
                                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'} disabled:opacity-50`}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => {
                                    if (!editedContent.trim()) return;
                                    setIsSavingEdit(true);
                                    updateFeedbackSnippet(snippet.id, { content: editedContent.trim() });
                                    addNotification('success', 'Feedback updated');
                                    setEditingSnippetId(null);
                                    setEditedContent('');
                                    setIsSavingEdit(false);
                                  }}
                                  disabled={isSavingEdit}
                                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-orange-500 text-white flex items-center justify-center gap-1 disabled:opacity-50"
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
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${BRAND_COLORS[snippet.toolBrand].bg} ${BRAND_COLORS[snippet.toolBrand].text}`}>
                                    {snippet.toolBrand}
                                  </span>
                                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${CATEGORY_COLORS[snippet.category]}`}>
                                    {CATEGORY_ICONS[snippet.category]}
                                    {snippet.category}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingSnippetId(snippet.id);
                                      setEditedContent(snippet.content);
                                    }}
                                    disabled={isRecording}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                                  >
                                    <Edit3 size={14} className="text-orange-500" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (window.confirm('Delete this feedback?')) {
                                        deleteFeedbackSnippet(snippet.id);
                                        addNotification('info', 'Feedback deleted');
                                      }
                                    }}
                                    disabled={isRecording}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                                  >
                                    <Trash2 size={14} className="text-red-500" />
                                  </button>
                                </div>
                              </div>
                              <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                {snippet.content}
                              </p>
                              <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                {new Date(snippet.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          )}
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
                <div className={`p-4 rounded-xl border border-orange-500 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                  <input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Project name..."
                    autoFocus
                    className={`w-full px-4 py-3 rounded-lg mb-3 ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900'}`}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setIsCreatingProject(false)} className={`flex-1 py-3 rounded-lg font-medium ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700'}`}>
                      Cancel
                    </button>
                    <button onClick={handleCreateProject} className="flex-1 py-3 rounded-lg font-medium bg-orange-500 text-white">
                      Create
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setIsCreatingProject(true)} className={`w-full flex items-center gap-3 p-4 rounded-xl mb-4 border border-dashed ${isDark ? 'border-gray-700' : 'border-gray-300'}`}>
                  <Plus size={24} className="text-orange-500" />
                  <span className="text-orange-500 font-medium">Create New Project</span>
                </button>
              )}

              {isLoadingProjects ? (
                <div className="text-center py-6"><Loader2 className="animate-spin mx-auto text-gray-400" size={24} /></div>
              ) : (
                projects.map((project) => (
                  <div
                    key={project.id}
                    className={`rounded-xl mb-2 transition-colors ${
                      currentProjectId === project.id
                        ? 'bg-orange-50 dark:bg-orange-900/30 border border-orange-500'
                        : isDark ? 'bg-gray-800' : 'bg-white border border-gray-200'
                    }`}
                  >
                    {editingProjectId === project.id ? (
                      /* Edit Mode */
                      <div className="p-4">
                        <input
                          value={editedProjectName}
                          onChange={(e) => setEditedProjectName(e.target.value)}
                          placeholder="Project name..."
                          autoFocus
                          className={`w-full px-3 py-2 rounded-lg mb-3 text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900'}`}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditingProjectId(null); setEditedProjectName(''); }}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700'}`}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              if (editedProjectName.trim()) {
                                updateProject(project.id, { name: editedProjectName.trim() });
                                addNotification('success', 'Project updated');
                              }
                              setEditingProjectId(null);
                              setEditedProjectName('');
                            }}
                            className="flex-1 py-2 rounded-lg text-sm font-medium bg-orange-500 text-white"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* View Mode */
                      <div className="flex items-center">
                        <button
                          onClick={() => { setCurrentProject(project.id); setShowProjectPicker(false); }}
                          className={`flex-1 flex items-center gap-3 p-4 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} rounded-l-xl transition-colors`}
                        >
                          <Building2 size={24} className={currentProjectId === project.id ? 'text-orange-500' : 'text-gray-400'} />
                          <span className={`flex-1 text-left font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{project.name}</span>
                          {currentProjectId === project.id && <Check size={20} className="text-orange-500" />}
                        </button>
                        <div className="flex items-center pr-2 gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProjectId(project.id);
                              setEditedProjectName(project.name);
                            }}
                            className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                            title="Edit project"
                          >
                            <Edit3 size={16} className="text-orange-500" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Delete "${project.name}"? This cannot be undone.`)) {
                                deleteProject(project.id);
                                addNotification('info', 'Project deleted');
                              }
                            }}
                            className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                            title="Delete project"
                          >
                            <Trash2 size={16} className="text-red-500" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Daily Checklist Modal */}
      {currentProjectId && selectedToolBrand && (
        <DailyChecklist
          isDark={isDark}
          isOpen={showChecklist}
          onClose={() => setShowChecklist(false)}
          projectId={currentProjectId}
          toolBrand={selectedToolBrand}
          userId={user?.id}
        />
      )}
    </div>
  );
}
