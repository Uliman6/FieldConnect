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
  audioUri: string;
  transcriptText: string | null;
  status: 'recording' | 'transcribing' | 'processing' | 'complete' | 'error';
  errorMessage?: string;
  createdAt: string;
  duration: number; // seconds
}

// A categorized snippet from a voice note
export interface CategorizedSnippet {
  id: string;
  voiceNoteId: string;
  category: VoiceDiaryCategory;
  content: string;
  createdAt: string;
}

// Daily summary for a specific date
export interface DailySummary {
  date: string; // YYYY-MM-DD
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

  // Actions - Voice Notes
  addVoiceNote: (audioUri: string, duration: number) => VoiceNote;
  updateVoiceNote: (id: string, updates: Partial<VoiceNote>) => void;
  deleteVoiceNote: (id: string) => void;
  getVoiceNotesForDate: (date: string) => VoiceNote[];

  // Actions - Snippets
  addSnippet: (voiceNoteId: string, category: VoiceDiaryCategory, content: string) => void;
  getSnippetsForCategory: (category: VoiceDiaryCategory, date?: string) => CategorizedSnippet[];
  getSnippetsForDate: (date: string) => CategorizedSnippet[];

  // Actions - Summary
  updateDailySummary: (date: string, summary: string, hasMinimumInfo: boolean) => void;
  getDailySummary: (date: string) => DailySummary | undefined;

  // Actions - Notifications
  addNotification: (type: DiaryNotification['type'], message: string) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  getUnreadNotifications: () => DiaryNotification[];

  // Actions - Form Suggestions
  addFormSuggestion: (formType: string, formName: string, reason: string, snippetIds: string[]) => void;
  dismissFormSuggestion: (id: string) => void;
  getActiveFormSuggestions: () => FormSuggestion[];

  // Actions - Project
  setCurrentProject: (projectId: string | null) => void;

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

      // Voice Notes
      addVoiceNote: (audioUri, duration) => {
        const note: VoiceNote = {
          id: generateId(),
          audioUri,
          transcriptText: null,
          status: 'recording',
          createdAt: new Date().toISOString(),
          duration,
        };
        set((state) => ({
          voiceNotes: [note, ...state.voiceNotes],
        }));
        return note;
      },

      updateVoiceNote: (id, updates) => {
        set((state) => ({
          voiceNotes: state.voiceNotes.map((note) =>
            note.id === id ? { ...note, ...updates } : note
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

      getVoiceNotesForDate: (date) => {
        return get().voiceNotes.filter((note) =>
          note.createdAt.startsWith(date)
        );
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

      getSnippetsForCategory: (category, date) => {
        return get().categorizedSnippets.filter((snippet) => {
          const matchesCategory = snippet.category === category;
          const matchesDate = date ? snippet.createdAt.startsWith(date) : true;
          return matchesCategory && matchesDate;
        });
      },

      getSnippetsForDate: (date) => {
        return get().categorizedSnippets.filter((snippet) =>
          snippet.createdAt.startsWith(date)
        );
      },

      // Summary
      updateDailySummary: (date, summary, hasMinimumInfo) => {
        set((state) => {
          const existing = state.dailySummaries.find((s) => s.date === date);
          const voiceNoteCount = state.voiceNotes.filter((n) =>
            n.createdAt.startsWith(date)
          ).length;

          if (existing) {
            return {
              dailySummaries: state.dailySummaries.map((s) =>
                s.date === date
                  ? { ...s, summary, hasMinimumInfo, lastUpdatedAt: new Date().toISOString(), voiceNoteCount }
                  : s
              ),
            };
          }

          return {
            dailySummaries: [
              ...state.dailySummaries,
              {
                date,
                summary,
                lastUpdatedAt: new Date().toISOString(),
                voiceNoteCount,
                hasMinimumInfo,
              },
            ],
          };
        });
      },

      getDailySummary: (date) => {
        return get().dailySummaries.find((s) => s.date === date);
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

      // Project
      setCurrentProject: (projectId) => {
        set({ currentProjectId: projectId });
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
