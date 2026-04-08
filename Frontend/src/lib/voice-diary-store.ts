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
  transcriptText: string | null;
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
          transcriptText: null,
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
    }),
    {
      name: 'voice-diary-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
