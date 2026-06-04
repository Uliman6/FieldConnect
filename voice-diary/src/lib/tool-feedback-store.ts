import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ToolBrand,
  ToolFeedbackCategory,
  ToolFeedbackEntry,
  ToolFeedbackSnippet,
  Project,
} from './types';

interface ToolFeedbackStore {
  // State
  selectedToolBrand: ToolBrand | null;
  currentProjectId: string | null;
  projects: Project[];
  feedbackEntries: ToolFeedbackEntry[];
  feedbackSnippets: ToolFeedbackSnippet[];
  notifications: Array<{ id: string; type: string; message: string }>;

  // Actions
  setSelectedToolBrand: (brand: ToolBrand | null) => void;
  setCurrentProject: (projectId: string | null) => void;
  setProjects: (projects: Project[]) => void;
  addProject: (name: string) => Project;

  addFeedbackEntry: (projectId: string, toolBrand: ToolBrand, audioUri: string, duration: number, userId?: string) => ToolFeedbackEntry;
  updateFeedbackEntry: (id: string, updates: Partial<ToolFeedbackEntry>) => void;
  getFeedbackForProject: (projectId: string) => ToolFeedbackEntry[];
  getFeedbackForBrand: (projectId: string, brand: ToolBrand) => ToolFeedbackEntry[];

  addFeedbackSnippet: (feedbackId: string, toolBrand: ToolBrand, category: ToolFeedbackCategory, sentiment: 'positive' | 'negative' | 'neutral', content: string) => void;
  updateFeedbackSnippet: (id: string, updates: Partial<ToolFeedbackSnippet>) => void;
  deleteFeedbackSnippet: (id: string) => void;
  getSnippetsForBrand: (projectId: string, brand: ToolBrand) => ToolFeedbackSnippet[];
  getSnippetsForProject: (projectId: string) => ToolFeedbackSnippet[];
  getSnippetsForDate: (projectId: string, date: string) => ToolFeedbackSnippet[];

  addNotification: (type: string, message: string) => void;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const useToolFeedbackStore = create<ToolFeedbackStore>()(
  persist(
    (set, get) => ({
      selectedToolBrand: null,
      currentProjectId: null,
      projects: [],
      feedbackEntries: [],
      feedbackSnippets: [],
      notifications: [],

      setSelectedToolBrand: (brand) => set({ selectedToolBrand: brand }),
      setCurrentProject: (projectId) => set({ currentProjectId: projectId }),
      setProjects: (projects) => set({ projects }),

      addProject: (name) => {
        const now = new Date().toISOString();
        const project: Project = {
          id: generateId(),
          name,
          location: '',
          client: '',
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ projects: [project, ...state.projects] }));
        return project;
      },

      addFeedbackEntry: (projectId, toolBrand, audioUri, duration, userId) => {
        const entry: ToolFeedbackEntry = {
          id: generateId(),
          projectId,
          userId,
          toolBrand,
          audioUri,
          transcriptText: null,
          status: 'recording',
          createdAt: new Date().toISOString(),
          duration,
        };
        set((state) => ({ feedbackEntries: [entry, ...state.feedbackEntries] }));
        return entry;
      },

      updateFeedbackEntry: (id, updates) => {
        set((state) => ({
          feedbackEntries: state.feedbackEntries.map((e) =>
            e.id === id ? { ...e, ...updates } : e
          ),
        }));
      },

      getFeedbackForProject: (projectId) => {
        return get().feedbackEntries.filter((e) => e.projectId === projectId);
      },

      getFeedbackForBrand: (projectId, brand) => {
        return get().feedbackEntries.filter((e) => e.projectId === projectId && e.toolBrand === brand);
      },

      addFeedbackSnippet: (feedbackId, toolBrand, category, sentiment, content) => {
        const snippet: ToolFeedbackSnippet = {
          id: generateId(),
          feedbackId,
          toolBrand,
          category,
          sentiment,
          content,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ feedbackSnippets: [snippet, ...state.feedbackSnippets] }));
      },

      updateFeedbackSnippet: (id, updates) => {
        set((state) => ({
          feedbackSnippets: state.feedbackSnippets.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        }));
      },

      deleteFeedbackSnippet: (id) => {
        set((state) => ({
          feedbackSnippets: state.feedbackSnippets.filter((s) => s.id !== id),
        }));
      },

      getSnippetsForBrand: (projectId, brand) => {
        const entryIds = new Set(get().feedbackEntries.filter((e) => e.projectId === projectId && e.toolBrand === brand).map((e) => e.id));
        return get().feedbackSnippets.filter((s) => entryIds.has(s.feedbackId));
      },

      getSnippetsForProject: (projectId) => {
        const entryIds = new Set(get().feedbackEntries.filter((e) => e.projectId === projectId).map((e) => e.id));
        return get().feedbackSnippets.filter((s) => entryIds.has(s.feedbackId));
      },

      getSnippetsForDate: (projectId, date) => {
        const entryIds = new Set(
          get().feedbackEntries
            .filter((e) => e.projectId === projectId && e.createdAt.startsWith(date))
            .map((e) => e.id)
        );
        return get().feedbackSnippets.filter((s) => entryIds.has(s.feedbackId));
      },

      addNotification: (type, message) => {
        const notification = { id: generateId(), type, message };
        set((state) => ({ notifications: [notification, ...state.notifications].slice(0, 20) }));
      },
    }),
    {
      name: 'tool-feedback-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
