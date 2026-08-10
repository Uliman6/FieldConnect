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

// In-app notification
export interface DiaryNotification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  createdAt: string;
  read: boolean;
}

// Voice notes, categorized snippets, and daily summaries are now server
// state (Railway/Postgres, project-scoped) fetched via React Query - see
// getVoiceDiaryNotes/getVoiceDiarySummary in lib/api.ts. This store only
// holds what's genuinely device-local: which project/user is active right
// now, in-app notifications, and which form suggestions the user has
// dismissed on this device (a minor per-device nicety, not synced).
interface VoiceDiaryStore {
  currentProjectId: string | null;
  currentUserId: string | null;
  notifications: DiaryNotification[];
  // Keys are `${projectId}|${date}|${formType}`
  dismissedSuggestionKeys: string[];

  setCurrentProject: (projectId: string | null) => void;
  setCurrentUser: (userId: string | null) => void;

  addNotification: (type: DiaryNotification['type'], message: string) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  getUnreadNotifications: () => DiaryNotification[];

  dismissFormSuggestion: (projectId: string, date: string, formType: string) => void;
  isFormSuggestionDismissed: (projectId: string, date: string, formType: string) => boolean;

  getTodayDate: () => string;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const useVoiceDiaryStore = create<VoiceDiaryStore>()(
  persist(
    (set, get) => ({
      currentProjectId: null,
      currentUserId: null,
      notifications: [],
      dismissedSuggestionKeys: [],

      setCurrentProject: (projectId) => {
        set({ currentProjectId: projectId });
      },

      setCurrentUser: (userId) => {
        set({ currentUserId: userId });
      },

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

      dismissFormSuggestion: (projectId, date, formType) => {
        const key = `${projectId}|${date}|${formType}`;
        set((state) => ({
          dismissedSuggestionKeys: state.dismissedSuggestionKeys.includes(key)
            ? state.dismissedSuggestionKeys
            : [...state.dismissedSuggestionKeys, key],
        }));
      },

      isFormSuggestionDismissed: (projectId, date, formType) => {
        const key = `${projectId}|${date}|${formType}`;
        return get().dismissedSuggestionKeys.includes(key);
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
