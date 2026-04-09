import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Categories for voice notes
export const VOICE_DIARY_CATEGORIES = [
  'Safety',
  'Logistics',
  'Process',
  'Work Completed',
  'Work To Be Done',
  'Follow-up Items',
  'Issues',
  'Team',
  'Materials',
] as const;

export type VoiceDiaryCategory = typeof VOICE_DIARY_CATEGORIES[number];

// A single voice note recording
export interface VoiceNote {
  id: string;
  projectId: string; // Which project this note belongs to
  userId?: string; // Who recorded this note
  audioUri: string;
  title: string | null; // AI-generated intelligent title
  transcriptText: string | null; // Raw transcript
  cleanedTranscript: string | null; // Form-ready cleaned version
  status: 'recording' | 'transcribing' | 'processing' | 'complete' | 'error';
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  duration: number; // seconds
  version: number; // For re-recording (v1, v2, etc.)
  previousVersionId?: string; // Link to previous version if re-recorded
}

// A categorized snippet from a voice note
export interface CategorizedSnippet {
  id: string;
  voiceNoteId: string;
  category: VoiceDiaryCategory;
  content: string;
  createdAt: string;
}

// Daily summary for a specific date (per-user, per-project)
export interface DailySummary {
  id: string;
  date: string; // YYYY-MM-DD
  projectId: string;
  userId?: string; // If set, this is a user's personal summary; if null, it's the project summary
  summary: string;
  lastUpdatedAt: string;
  voiceNoteCount: number;
  hasMinimumInfo: boolean; // Whether there's enough info for a meaningful summary
}

// In-app notification
export interface DiaryNotification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  createdAt: string;
  read: boolean;
}

// Form suggestion based on voice content
export interface FormSuggestion {
  id: string;
  formType: string; // 'daily_log', 'rfi', 'onboarding', etc.
  formName: string;
  reason: string; // Why this form is suggested
  snippetIds: string[]; // Related snippets
  dismissed: boolean;
  createdAt: string;
}

interface VoiceDiaryStore {
  // State
  voiceNotes: VoiceNote[];
  categorizedSnippets: CategorizedSnippet[];
  dailySummaries: DailySummary[];
  notifications: DiaryNotification[];
  formSuggestions: FormSuggestion[];
  currentProjectId: string | null;
  currentUserId: string | null;

  // Actions - Voice Notes
  addVoiceNote: (projectId: string, audioUri: string, duration: number, userId?: string) => VoiceNote;
  updateVoiceNote: (id: string, updates: Partial<VoiceNote>) => void;
  deleteVoiceNote: (id: string) => void;
  reRecordVoiceNote: (originalId: string, newAudioUri: string, newDuration: number) => VoiceNote;
  getVoiceNotesForDate: (date: string, projectId?: string) => VoiceNote[];
  getVoiceNotesForProject: (projectId: string) => VoiceNote[];

  // Actions - Snippets
  addSnippet: (voiceNoteId: string, category: VoiceDiaryCategory, content: string) => void;
  getSnippetsForCategory: (category: VoiceDiaryCategory, date?: string, projectId?: string) => CategorizedSnippet[];
  getSnippetsForDate: (date: string, projectId?: string) => CategorizedSnippet[];
  clearSnippetsForNote: (voiceNoteId: string) => void;

  // Actions - Summary
  updateDailySummary: (date: string, projectId: string, summary: string, hasMinimumInfo: boolean, userId?: string) => void;
  getDailySummary: (date: string, projectId: string, userId?: string) => DailySummary | undefined;
  getProjectSummary: (date: string, projectId: string) => DailySummary | undefined;

  // Actions - Notifications
  addNotification: (type: DiaryNotification['type'], message: string) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  getUnreadNotifications: () => DiaryNotification[];

  // Actions - Form Suggestions
  addFormSuggestion: (formType: string, formName: string, reason: string, snippetIds: string[]) => void;
  dismissFormSuggestion: (id: string) => void;
  getActiveFormSuggestions: () => FormSuggestion[];

  // Actions - Project & User
  setCurrentProject: (projectId: string | null) => void;
  setCurrentUser: (userId: string | null) => void;

  // Utilities
  getTodayDate: () => string;

  // Demo data
  seedExampleData: (projectId: string, userId?: string) => void;
  hasExampleData: () => boolean;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const useVoiceDiaryStore = create<VoiceDiaryStore>()(
  persist(
    (set, get) => ({
      // Initial state
      voiceNotes: [],
      categorizedSnippets: [],
      dailySummaries: [],
      notifications: [],
      formSuggestions: [],
      currentProjectId: null,
      currentUserId: null,

      // Voice Notes
      addVoiceNote: (projectId, audioUri, duration, userId) => {
        const now = new Date().toISOString();
        const note: VoiceNote = {
          id: generateId(),
          projectId,
          userId,
          audioUri,
          title: null,
          transcriptText: null,
          cleanedTranscript: null,
          status: 'recording',
          createdAt: now,
          updatedAt: now,
          duration,
          version: 1,
        };
        set((state) => ({
          voiceNotes: [note, ...state.voiceNotes],
        }));
        return note;
      },

      updateVoiceNote: (id, updates) => {
        set((state) => ({
          voiceNotes: state.voiceNotes.map((note) =>
            note.id === id
              ? { ...note, ...updates, updatedAt: new Date().toISOString() }
              : note
          ),
        }));
      },

      deleteVoiceNote: (id) => {
        set((state) => ({
          voiceNotes: state.voiceNotes.filter((note) => note.id !== id),
          // Also remove related snippets
          categorizedSnippets: state.categorizedSnippets.filter(
            (snippet) => snippet.voiceNoteId !== id
          ),
        }));
      },

      // LEARNING: Re-recording creates a new version linked to the original
      reRecordVoiceNote: (originalId, newAudioUri, newDuration) => {
        const original = get().voiceNotes.find((n) => n.id === originalId);
        if (!original) {
          throw new Error('Original voice note not found');
        }

        const now = new Date().toISOString();
        const newNote: VoiceNote = {
          id: generateId(),
          projectId: original.projectId,
          userId: original.userId,
          audioUri: newAudioUri,
          transcriptText: null,
          status: 'recording',
          createdAt: now,
          updatedAt: now,
          duration: newDuration,
          version: original.version + 1,
          previousVersionId: originalId,
        };

        set((state) => ({
          voiceNotes: [newNote, ...state.voiceNotes],
          // Clear snippets from original (will be replaced by new processing)
          categorizedSnippets: state.categorizedSnippets.filter(
            (s) => s.voiceNoteId !== originalId
          ),
        }));

        return newNote;
      },

      getVoiceNotesForDate: (date, projectId) => {
        return get().voiceNotes.filter((note) => {
          const matchesDate = note.createdAt.startsWith(date);
          const matchesProject = projectId ? note.projectId === projectId : true;
          return matchesDate && matchesProject;
        });
      },

      getVoiceNotesForProject: (projectId) => {
        return get().voiceNotes.filter((note) => note.projectId === projectId);
      },

      // Snippets
      addSnippet: (voiceNoteId, category, content) => {
        const snippet: CategorizedSnippet = {
          id: generateId(),
          voiceNoteId,
          category,
          content,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          categorizedSnippets: [snippet, ...state.categorizedSnippets],
        }));
      },

      getSnippetsForCategory: (category, date, projectId) => {
        const voiceNoteIds = projectId
          ? new Set(get().voiceNotes.filter((n) => n.projectId === projectId).map((n) => n.id))
          : null;

        return get().categorizedSnippets.filter((snippet) => {
          const matchesCategory = snippet.category === category;
          const matchesDate = date ? snippet.createdAt.startsWith(date) : true;
          const matchesProject = voiceNoteIds ? voiceNoteIds.has(snippet.voiceNoteId) : true;
          return matchesCategory && matchesDate && matchesProject;
        });
      },

      getSnippetsForDate: (date, projectId) => {
        const voiceNoteIds = projectId
          ? new Set(get().voiceNotes.filter((n) => n.projectId === projectId).map((n) => n.id))
          : null;

        return get().categorizedSnippets.filter((snippet) => {
          const matchesDate = snippet.createdAt.startsWith(date);
          const matchesProject = voiceNoteIds ? voiceNoteIds.has(snippet.voiceNoteId) : true;
          return matchesDate && matchesProject;
        });
      },

      clearSnippetsForNote: (voiceNoteId) => {
        set((state) => ({
          categorizedSnippets: state.categorizedSnippets.filter(
            (s) => s.voiceNoteId !== voiceNoteId
          ),
        }));
      },

      // Summary - now per-project and optionally per-user
      updateDailySummary: (date, projectId, summary, hasMinimumInfo, userId) => {
        set((state) => {
          const summaryKey = userId
            ? `${date}-${projectId}-${userId}`
            : `${date}-${projectId}`;

          const existing = state.dailySummaries.find(
            (s) => s.date === date && s.projectId === projectId && s.userId === userId
          );

          const voiceNoteCount = state.voiceNotes.filter((n) => {
            const matchesDate = n.createdAt.startsWith(date);
            const matchesProject = n.projectId === projectId;
            const matchesUser = userId ? n.userId === userId : true;
            return matchesDate && matchesProject && matchesUser;
          }).length;

          if (existing) {
            return {
              dailySummaries: state.dailySummaries.map((s) =>
                s.id === existing.id
                  ? {
                      ...s,
                      summary,
                      hasMinimumInfo,
                      lastUpdatedAt: new Date().toISOString(),
                      voiceNoteCount,
                    }
                  : s
              ),
            };
          }

          return {
            dailySummaries: [
              ...state.dailySummaries,
              {
                id: generateId(),
                date,
                projectId,
                userId,
                summary,
                lastUpdatedAt: new Date().toISOString(),
                voiceNoteCount,
                hasMinimumInfo,
              },
            ],
          };
        });
      },

      getDailySummary: (date, projectId, userId) => {
        return get().dailySummaries.find(
          (s) => s.date === date && s.projectId === projectId && s.userId === userId
        );
      },

      getProjectSummary: (date, projectId) => {
        // Project summary has no userId
        return get().dailySummaries.find(
          (s) => s.date === date && s.projectId === projectId && !s.userId
        );
      },

      // Notifications
      addNotification: (type, message) => {
        const notification: DiaryNotification = {
          id: generateId(),
          type,
          message,
          createdAt: new Date().toISOString(),
          read: false,
        };
        set((state) => ({
          notifications: [notification, ...state.notifications].slice(0, 50), // Keep last 50
        }));
      },

      markNotificationRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
      },

      clearNotifications: () => {
        set({ notifications: [] });
      },

      getUnreadNotifications: () => {
        return get().notifications.filter((n) => !n.read);
      },

      // Form Suggestions
      addFormSuggestion: (formType, formName, reason, snippetIds) => {
        const suggestion: FormSuggestion = {
          id: generateId(),
          formType,
          formName,
          reason,
          snippetIds,
          dismissed: false,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          formSuggestions: [suggestion, ...state.formSuggestions],
        }));
      },

      dismissFormSuggestion: (id) => {
        set((state) => ({
          formSuggestions: state.formSuggestions.map((s) =>
            s.id === id ? { ...s, dismissed: true } : s
          ),
        }));
      },

      getActiveFormSuggestions: () => {
        return get().formSuggestions.filter((s) => !s.dismissed);
      },

      // Project & User
      setCurrentProject: (projectId) => {
        set({ currentProjectId: projectId });
      },

      setCurrentUser: (userId) => {
        set({ currentUserId: userId });
      },

      // Utilities
      getTodayDate: () => {
        return new Date().toISOString().split('T')[0];
      },

      // Demo data - seed example recordings for testing
      hasExampleData: () => {
        return get().voiceNotes.some((n) => n.id.startsWith('demo-'));
      },

      seedExampleData: (projectId, userId) => {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();

        // Example voice notes with realistic construction content
        const exampleNotes: VoiceNote[] = [
          {
            id: 'demo-1',
            projectId,
            userId,
            audioUri: '',
            title: 'Concrete Pour - Section B Complete',
            transcriptText: 'Hey so we just finished the concrete pour for section B foundation. Um, the trucks arrived on time, we had about 45 yards total. The weather held up pretty well, you know, and the crew did a great job getting it leveled out before it started setting.',
            cleanedTranscript: 'Completed concrete pour for Section B foundation. 45 yards delivered on time. Weather conditions favorable. Crew finished leveling before initial set.',
            status: 'complete',
            createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
            updatedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
            duration: 28,
            version: 1,
          },
          {
            id: 'demo-2',
            projectId,
            userId,
            audioUri: '',
            title: 'Safety Issue - Missing Guardrails',
            transcriptText: 'Found a safety issue on the third floor. The guardrails on the east side are missing, someone must have moved them for the material delivery. I already talked to Mike about it and he is getting them put back up right now. We should probably add this to the safety meeting tomorrow.',
            cleanedTranscript: 'Safety issue identified: guardrails missing on third floor east side, removed for material delivery. Mike notified and reinstalling now. Item added for tomorrow\'s safety meeting.',
            status: 'complete',
            createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
            updatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
            duration: 22,
            version: 1,
          },
          {
            id: 'demo-3',
            projectId,
            userId,
            audioUri: '',
            title: 'Electrical Rough-In Progress',
            transcriptText: 'Electrical crew finished rough-in for units 101 through 105. They are moving on to 106 through 110 tomorrow. We had a small issue with the panel location in 103, it was like two inches off from the drawings, but we got it sorted out with the super.',
            cleanedTranscript: 'Electrical rough-in completed for units 101-105. Crew advancing to units 106-110 tomorrow. Panel location discrepancy in unit 103 resolved with superintendent (2" offset from drawings).',
            status: 'complete',
            createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
            updatedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
            duration: 35,
            version: 1,
          },
          {
            id: 'demo-4',
            projectId,
            userId,
            audioUri: '',
            title: 'Material Delivery Tomorrow',
            transcriptText: 'Just got confirmation that the framing lumber delivery is coming tomorrow morning around 7am. We will need the forklift available to unload. Make sure the staging area by the south entrance is cleared out before then.',
            cleanedTranscript: 'Framing lumber delivery confirmed for tomorrow 7am. Forklift required for unloading. South entrance staging area must be cleared beforehand.',
            status: 'complete',
            createdAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), // 30 min ago
            updatedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
            duration: 18,
            version: 1,
          },
          {
            id: 'demo-5',
            projectId,
            userId,
            audioUri: '',
            title: 'Plumber Coordination Meeting',
            transcriptText: 'Had a quick coordination meeting with the plumbing sub. They want to start the second floor rough-in next week but we need to make sure framing is done by then. I told them Wednesday at the earliest. They are also short one guy so they might run a day behind.',
            cleanedTranscript: 'Plumbing coordination: second floor rough-in scheduled for Wednesday pending framing completion. Note: plumbing crew short one worker, potential one-day delay.',
            status: 'complete',
            createdAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(), // 15 min ago
            updatedAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
            duration: 42,
            version: 1,
          },
        ];

        // Example categorized snippets - all professional, standalone statements
        const exampleSnippets: CategorizedSnippet[] = [
          { id: 'demo-s1', voiceNoteId: 'demo-1', category: 'Work Completed', content: 'Concrete pour for Section B foundation completed (45 yards).', createdAt: exampleNotes[0].createdAt },
          { id: 'demo-s2', voiceNoteId: 'demo-1', category: 'Team', content: 'Leveling completed before concrete initial set.', createdAt: exampleNotes[0].createdAt },
          { id: 'demo-s3', voiceNoteId: 'demo-2', category: 'Safety', content: 'Guardrails missing on 3rd floor east side - Mike reinstalling.', createdAt: exampleNotes[1].createdAt },
          { id: 'demo-s4', voiceNoteId: 'demo-2', category: 'Follow-up Items', content: 'Guardrail incident added to tomorrow\'s safety meeting agenda.', createdAt: exampleNotes[1].createdAt },
          { id: 'demo-s5', voiceNoteId: 'demo-3', category: 'Work Completed', content: 'Electrical rough-in completed for units 101-105.', createdAt: exampleNotes[2].createdAt },
          { id: 'demo-s6', voiceNoteId: 'demo-3', category: 'Work To Be Done', content: 'Electrical rough-in for units 106-110 scheduled for tomorrow.', createdAt: exampleNotes[2].createdAt },
          { id: 'demo-s7', voiceNoteId: 'demo-3', category: 'Issues', content: 'Panel location in unit 103 offset 2" from drawings - resolved with superintendent.', createdAt: exampleNotes[2].createdAt },
          { id: 'demo-s8', voiceNoteId: 'demo-4', category: 'Logistics', content: 'Framing lumber delivery scheduled tomorrow 7am - forklift required.', createdAt: exampleNotes[3].createdAt },
          { id: 'demo-s9', voiceNoteId: 'demo-4', category: 'Follow-up Items', content: 'South entrance staging area to be cleared before lumber delivery.', createdAt: exampleNotes[3].createdAt },
          { id: 'demo-s10', voiceNoteId: 'demo-5', category: 'Process', content: 'Plumbing second floor rough-in scheduled for Wednesday (pending framing completion).', createdAt: exampleNotes[4].createdAt },
          { id: 'demo-s11', voiceNoteId: 'demo-5', category: 'Issues', content: 'Plumbing crew short one worker - potential 1-day schedule delay.', createdAt: exampleNotes[4].createdAt },
        ];

        // Example daily summary - simple bullets, no sections
        const exampleSummary: DailySummary = {
          id: 'demo-summary',
          date: today,
          projectId,
          userId,
          summary: '• Concrete pour for Section B foundation completed (45 yards).\n• Electrical rough-in finished for units 101-105.\n• Guardrails missing on 3rd floor east side - Mike reinstalling.\n• Framing lumber delivery scheduled tomorrow 7am.\n• Plumbing second floor rough-in starts Wednesday (pending framing).',
          lastUpdatedAt: now.toISOString(),
          voiceNoteCount: 5,
          hasMinimumInfo: true,
        };

        set((state) => ({
          voiceNotes: [...exampleNotes, ...state.voiceNotes.filter(n => !n.id.startsWith('demo-'))],
          categorizedSnippets: [...exampleSnippets, ...state.categorizedSnippets.filter(s => !s.id.startsWith('demo-'))],
          dailySummaries: [exampleSummary, ...state.dailySummaries.filter(s => s.id !== 'demo-summary')],
        }));
      },
    }),
    {
      name: 'voice-diary-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
