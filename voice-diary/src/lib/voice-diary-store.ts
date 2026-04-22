import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  VoiceNote,
  CategorizedSnippet,
  DailySummary,
  DiaryNotification,
  FormSuggestion,
  VoiceDiaryCategory,
  Project,
} from './types';
import { VOICE_DIARY_CATEGORIES } from './types';

interface VoiceDiaryStore {
  // State
  voiceNotes: VoiceNote[];
  categorizedSnippets: CategorizedSnippet[];
  dailySummaries: DailySummary[];
  notifications: DiaryNotification[];
  formSuggestions: FormSuggestion[];
  projects: Project[];
  currentProjectId: string | null;
  currentUserId: string | null;

  // Actions - Projects (local storage)
  setProjects: (projects: Project[]) => void;
  addProject: (name: string, location?: string, client?: string) => Project;

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
  getActiveFormSuggestions: (projectId?: string) => FormSuggestion[];
  getValidFormSuggestions: (projectId?: string) => { formType: string; formName: string; snippetIds: string[]; snippets: CategorizedSnippet[] }[];
  clearOrphanedFormSuggestions: () => void;
  clearAllFormSuggestions: () => void;

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
      projects: [],
      currentProjectId: null,
      currentUserId: null,

      // Projects
      setProjects: (projects) => {
        set({ projects });
      },

      addProject: (name, location = '', client = '') => {
        const now = new Date().toISOString();
        const project: Project = {
          id: generateId(),
          name,
          location,
          client,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          projects: [project, ...state.projects],
        }));
        return project;
      },

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
          categorizedSnippets: state.categorizedSnippets.filter(
            (snippet) => snippet.voiceNoteId !== id
          ),
        }));
      },

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
          title: null,
          transcriptText: null,
          cleanedTranscript: null,
          status: 'recording',
          createdAt: now,
          updatedAt: now,
          duration: newDuration,
          version: original.version + 1,
          previousVersionId: originalId,
        };

        set((state) => ({
          voiceNotes: [newNote, ...state.voiceNotes],
          categorizedSnippets: state.categorizedSnippets.filter(
            (s) => s.voiceNoteId !== originalId
          ),
        }));

        return newNote;
      },

      getVoiceNotesForDate: (date, projectId) => {
        const { voiceNotes, currentUserId } = get();
        return voiceNotes.filter((note) => {
          const matchesDate = note.createdAt.startsWith(date);
          const matchesProject = projectId ? note.projectId === projectId : true;
          // Filter by user if currentUserId is set
          const matchesUser = !currentUserId || note.userId === currentUserId;
          return matchesDate && matchesProject && matchesUser;
        });
      },

      getVoiceNotesForProject: (projectId) => {
        const { voiceNotes, currentUserId } = get();
        return voiceNotes.filter((note) => {
          const matchesProject = note.projectId === projectId;
          // Filter by user if currentUserId is set
          const matchesUser = !currentUserId || note.userId === currentUserId;
          return matchesProject && matchesUser;
        });
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

      // Summary
      updateDailySummary: (date, projectId, summary, hasMinimumInfo, userId) => {
        set((state) => {
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
          notifications: [notification, ...state.notifications].slice(0, 50),
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

      getActiveFormSuggestions: (_projectId) => {
        const { formSuggestions, categorizedSnippets } = get();
        const existingSnippetIds = new Set(categorizedSnippets.map(s => s.id));

        return formSuggestions.filter((s) => {
          if (s.dismissed) return false;
          return s.snippetIds.some(id => existingSnippetIds.has(id));
        });
      },

      getValidFormSuggestions: (projectId) => {
        const { formSuggestions, categorizedSnippets, voiceNotes } = get();

        const relevantSnippetIds = projectId
          ? new Set(
              categorizedSnippets
                .filter(s => {
                  const note = voiceNotes.find(n => n.id === s.voiceNoteId);
                  return note?.projectId === projectId;
                })
                .map(s => s.id)
            )
          : new Set(categorizedSnippets.map(s => s.id));

        const formTypeMap = new Map<string, { formType: string; formName: string; snippetIds: Set<string> }>();

        for (const suggestion of formSuggestions) {
          if (suggestion.dismissed) continue;

          const validSnippetIds = suggestion.snippetIds.filter(id => relevantSnippetIds.has(id));
          if (validSnippetIds.length === 0) continue;

          if (formTypeMap.has(suggestion.formType)) {
            const existing = formTypeMap.get(suggestion.formType)!;
            validSnippetIds.forEach(id => existing.snippetIds.add(id));
          } else {
            formTypeMap.set(suggestion.formType, {
              formType: suggestion.formType,
              formName: suggestion.formName,
              snippetIds: new Set(validSnippetIds),
            });
          }
        }

        return Array.from(formTypeMap.values()).map(item => ({
          formType: item.formType,
          formName: item.formName,
          snippetIds: Array.from(item.snippetIds),
          snippets: categorizedSnippets.filter(s => item.snippetIds.has(s.id)),
        }));
      },

      clearOrphanedFormSuggestions: () => {
        const { formSuggestions, categorizedSnippets } = get();
        const existingSnippetIds = new Set(categorizedSnippets.map(s => s.id));

        set({
          formSuggestions: formSuggestions.filter(s =>
            s.snippetIds.some(id => existingSnippetIds.has(id))
          ),
        });
      },

      clearAllFormSuggestions: () => {
        set({ formSuggestions: [] });
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

      // Demo data
      hasExampleData: () => {
        return get().voiceNotes.some((n) => n.id.startsWith('demo-'));
      },

      seedExampleData: (projectId, userId) => {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();

        const exampleNotes: VoiceNote[] = [
          {
            id: 'demo-1',
            projectId,
            userId,
            audioUri: '',
            title: 'Concrete Pour Complete',
            transcriptText: 'Finished the concrete pour for section B foundation. 45 yards total, trucks arrived on time.',
            cleanedTranscript: 'Completed concrete pour for Section B foundation. 45 yards delivered on time.',
            status: 'complete',
            createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
            duration: 28,
            version: 1,
          },
          {
            id: 'demo-2',
            projectId,
            userId,
            audioUri: '',
            title: 'Safety Issue - Guardrails',
            transcriptText: 'Found a safety issue on the third floor. Guardrails missing on east side.',
            cleanedTranscript: 'Safety issue: guardrails missing on third floor east side. Mike reinstalling now.',
            status: 'complete',
            createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
            duration: 22,
            version: 1,
          },
          {
            id: 'demo-3',
            projectId,
            userId,
            audioUri: '',
            title: 'Electrical Rough-In',
            transcriptText: 'Electrical crew finished rough-in for units 101 through 105.',
            cleanedTranscript: 'Electrical rough-in completed for units 101-105. Advancing to 106-110 tomorrow.',
            status: 'complete',
            createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
            duration: 35,
            version: 1,
          },
        ];

        const exampleSnippets: CategorizedSnippet[] = [
          { id: 'demo-s1', voiceNoteId: 'demo-1', category: 'Work Completed', content: 'Concrete pour for Section B foundation completed (45 yards).', createdAt: exampleNotes[0].createdAt },
          { id: 'demo-s2', voiceNoteId: 'demo-1', category: 'Logistics', content: 'Concrete trucks arrived on schedule.', createdAt: exampleNotes[0].createdAt },
          { id: 'demo-s3', voiceNoteId: 'demo-2', category: 'Safety', content: 'Guardrails missing on 3rd floor east side - Mike reinstalling.', createdAt: exampleNotes[1].createdAt },
          { id: 'demo-s4', voiceNoteId: 'demo-2', category: 'Follow-up Items', content: 'Add guardrail incident to safety meeting agenda.', createdAt: exampleNotes[1].createdAt },
          { id: 'demo-s5', voiceNoteId: 'demo-3', category: 'Work Completed', content: 'Electrical rough-in completed for units 101-105.', createdAt: exampleNotes[2].createdAt },
          { id: 'demo-s6', voiceNoteId: 'demo-3', category: 'Work To Be Done', content: 'Electrical rough-in for units 106-110 scheduled tomorrow.', createdAt: exampleNotes[2].createdAt },
        ];

        const exampleSummary: DailySummary = {
          id: 'demo-summary',
          date: today,
          projectId,
          userId,
          summary: '• Concrete pour for Section B foundation completed (45 yards).\n• Electrical rough-in finished for units 101-105.\n• Guardrails missing on 3rd floor east side - being reinstalled.',
          lastUpdatedAt: now.toISOString(),
          voiceNoteCount: 3,
          hasMinimumInfo: true,
        };

        const exampleFormSuggestions: FormSuggestion[] = [
          {
            id: 'demo-fs1',
            formType: 'safety_report',
            formName: 'Safety Report',
            reason: 'Safety issue with guardrails reported',
            snippetIds: ['demo-s3', 'demo-s4'],
            dismissed: false,
            createdAt: now.toISOString(),
          },
          {
            id: 'demo-fs2',
            formType: 'daily_log',
            formName: 'Daily Log',
            reason: 'Work completed updates',
            snippetIds: ['demo-s1', 'demo-s5', 'demo-s6'],
            dismissed: false,
            createdAt: now.toISOString(),
          },
        ];

        set((state) => ({
          voiceNotes: [...exampleNotes, ...state.voiceNotes.filter(n => !n.id.startsWith('demo-'))],
          categorizedSnippets: [...exampleSnippets, ...state.categorizedSnippets.filter(s => !s.id.startsWith('demo-'))],
          dailySummaries: [exampleSummary, ...state.dailySummaries.filter(s => s.id !== 'demo-summary')],
          formSuggestions: [...exampleFormSuggestions, ...state.formSuggestions.filter(s => !s.id.startsWith('demo-'))],
        }));
      },
    }),
    {
      name: 'voice-diary-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Re-export categories for convenience
export { VOICE_DIARY_CATEGORIES };
export type { VoiceDiaryCategory };
