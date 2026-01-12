import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Project,
  DailyLog,
  TaskEntry,
  VisitorEntry,
  EquipmentEntry,
  MaterialEntry,
  PendingIssue,
  InspectionNote,
  AdditionalWorkEntry,
  VoiceArtifact,
  VoiceSectionKey,
  Event,
  EventType,
  EventSeverity,
  createEmptyDailyLog,
  createEmptyEvent,
  generateId,
  createVoiceArtifact,
  mapEventTypeToIssueCategory,
} from './types';

interface DailyLogStore {
  // Projects
  projects: Project[];
  currentProjectId: string | null;

  // Daily Logs
  dailyLogs: DailyLog[];
  currentLogId: string | null;

  // Events
  events: Event[];

  // User info
  userName: string;

  // Project Actions
  addProject: (name: string, number: string, address: string) => Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setCurrentProject: (id: string | null) => void;

  // Daily Log Actions
  createDailyLog: (projectId: string) => DailyLog;
  updateDailyLog: (id: string, updates: Partial<DailyLog>) => void;
  deleteDailyLog: (id: string) => void;
  setCurrentLog: (id: string | null) => void;
  getCurrentLog: () => DailyLog | null;

  // Task Actions
  addTask: (logId: string, task: TaskEntry) => void;
  updateTask: (logId: string, taskId: string, updates: Partial<TaskEntry>) => void;
  removeTask: (logId: string, taskId: string) => void;

  // Visitor Actions
  addVisitor: (logId: string, visitor: VisitorEntry) => void;
  updateVisitor: (logId: string, visitorId: string, updates: Partial<VisitorEntry>) => void;
  removeVisitor: (logId: string, visitorId: string) => void;

  // Equipment Actions
  addEquipment: (logId: string, equipment: EquipmentEntry) => void;
  updateEquipment: (logId: string, equipmentId: string, updates: Partial<EquipmentEntry>) => void;
  removeEquipment: (logId: string, equipmentId: string) => void;

  // Material Actions
  addMaterial: (logId: string, material: MaterialEntry) => void;
  updateMaterial: (logId: string, materialId: string, updates: Partial<MaterialEntry>) => void;
  removeMaterial: (logId: string, materialId: string) => void;

  // Pending Issue Actions
  addIssue: (logId: string, issue: PendingIssue) => void;
  updateIssue: (logId: string, issueId: string, updates: Partial<PendingIssue>) => void;
  removeIssue: (logId: string, issueId: string) => void;

  // Inspection Note Actions
  addInspectionNote: (logId: string, note: InspectionNote) => void;
  updateInspectionNote: (logId: string, noteId: string, updates: Partial<InspectionNote>) => void;
  removeInspectionNote: (logId: string, noteId: string) => void;

  // Additional Work Actions
  addAdditionalWork: (logId: string, work: AdditionalWorkEntry) => void;
  updateAdditionalWork: (logId: string, workId: string, updates: Partial<AdditionalWorkEntry>) => void;
  removeAdditionalWork: (logId: string, workId: string) => void;

  // Voice Artifact Actions
  addVoiceArtifact: (logId: string, sectionKey: VoiceSectionKey, audioUri: string, entityId?: string) => void;
  updateVoiceArtifact: (logId: string, artifactId: string, updates: Partial<VoiceArtifact>) => void;
  removeVoiceArtifact: (logId: string, artifactId: string) => void;

  // Event Actions
  addEvent: (projectId: string, audioUri: string) => Event;
  updateEvent: (eventId: string, updates: Partial<Event>) => void;
  deleteEvent: (eventId: string) => void;
  getEvent: (eventId: string) => Event | undefined;
  getEventsForProject: (projectId: string) => Event[];
  addEventToDailyLog: (eventId: string) => { success: boolean; dailyLogId?: string };
  toggleEventResolved: (eventId: string) => void;

  // User Actions
  setUserName: (name: string) => void;

  // Utility
  recalculateTotals: (logId: string) => void;
}

export const useDailyLogStore = create<DailyLogStore>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,
      dailyLogs: [],
      currentLogId: null,
      events: [],
      userName: '',

      // Project Actions
      addProject: (name, number, address) => {
        const now = new Date().toISOString();
        const project: Project = {
          id: generateId(),
          name,
          number,
          address,
          created_at: now,
          updated_at: now,
        };
        set((state) => ({
          projects: [...state.projects, project],
          currentProjectId: project.id,
        }));
        return project;
      },

      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p
          ),
        }));
      },

      deleteProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          dailyLogs: state.dailyLogs.filter((l) => l.project_id !== id),
          events: state.events.filter((e) => e.project_id !== id),
          currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
          currentLogId: state.dailyLogs.find((l) => l.id === state.currentLogId)?.project_id === id
            ? null
            : state.currentLogId,
        }));
      },

      setCurrentProject: (id) => {
        set({ currentProjectId: id, currentLogId: null });
      },

      // Daily Log Actions
      createDailyLog: (projectId) => {
        const log = createEmptyDailyLog(projectId);
        log.prepared_by = get().userName;
        set((state) => ({
          dailyLogs: [...state.dailyLogs, log],
          currentLogId: log.id,
        }));
        return log;
      },

      updateDailyLog: (id, updates) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === id ? { ...l, ...updates, updated_at: new Date().toISOString() } : l
          ),
        }));
      },

      deleteDailyLog: (id) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.filter((l) => l.id !== id),
          currentLogId: state.currentLogId === id ? null : state.currentLogId,
        }));
      },

      setCurrentLog: (id) => {
        set({ currentLogId: id });
      },

      getCurrentLog: () => {
        const state = get();
        return state.dailyLogs.find((l) => l.id === state.currentLogId) ?? null;
      },

      // Task Actions
      addTask: (logId, task) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId ? { ...l, tasks: [...l.tasks, task], updated_at: new Date().toISOString() } : l
          ),
        }));
        get().recalculateTotals(logId);
      },

      updateTask: (logId, taskId, updates) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  tasks: l.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
                  updated_at: new Date().toISOString(),
                }
              : l
          ),
        }));
        get().recalculateTotals(logId);
      },

      removeTask: (logId, taskId) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? { ...l, tasks: l.tasks.filter((t) => t.id !== taskId), updated_at: new Date().toISOString() }
              : l
          ),
        }));
        get().recalculateTotals(logId);
      },

      // Visitor Actions
      addVisitor: (logId, visitor) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId ? { ...l, visitors: [...l.visitors, visitor], updated_at: new Date().toISOString() } : l
          ),
        }));
      },

      updateVisitor: (logId, visitorId, updates) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  visitors: l.visitors.map((v) => (v.id === visitorId ? { ...v, ...updates } : v)),
                  updated_at: new Date().toISOString(),
                }
              : l
          ),
        }));
      },

      removeVisitor: (logId, visitorId) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? { ...l, visitors: l.visitors.filter((v) => v.id !== visitorId), updated_at: new Date().toISOString() }
              : l
          ),
        }));
      },

      // Equipment Actions
      addEquipment: (logId, equipment) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId ? { ...l, equipment: [...l.equipment, equipment], updated_at: new Date().toISOString() } : l
          ),
        }));
      },

      updateEquipment: (logId, equipmentId, updates) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  equipment: l.equipment.map((e) => (e.id === equipmentId ? { ...e, ...updates } : e)),
                  updated_at: new Date().toISOString(),
                }
              : l
          ),
        }));
      },

      removeEquipment: (logId, equipmentId) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? { ...l, equipment: l.equipment.filter((e) => e.id !== equipmentId), updated_at: new Date().toISOString() }
              : l
          ),
        }));
      },

      // Material Actions
      addMaterial: (logId, material) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId ? { ...l, materials: [...l.materials, material], updated_at: new Date().toISOString() } : l
          ),
        }));
      },

      updateMaterial: (logId, materialId, updates) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  materials: l.materials.map((m) => (m.id === materialId ? { ...m, ...updates } : m)),
                  updated_at: new Date().toISOString(),
                }
              : l
          ),
        }));
      },

      removeMaterial: (logId, materialId) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? { ...l, materials: l.materials.filter((m) => m.id !== materialId), updated_at: new Date().toISOString() }
              : l
          ),
        }));
      },

      // Pending Issue Actions
      addIssue: (logId, issue) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? { ...l, pending_issues: [...l.pending_issues, issue], updated_at: new Date().toISOString() }
              : l
          ),
        }));
      },

      updateIssue: (logId, issueId, updates) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  pending_issues: l.pending_issues.map((i) => (i.id === issueId ? { ...i, ...updates } : i)),
                  updated_at: new Date().toISOString(),
                }
              : l
          ),
        }));
      },

      removeIssue: (logId, issueId) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  pending_issues: l.pending_issues.filter((i) => i.id !== issueId),
                  updated_at: new Date().toISOString(),
                }
              : l
          ),
        }));
      },

      // Inspection Note Actions
      addInspectionNote: (logId, note) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? { ...l, inspection_notes: [...l.inspection_notes, note], updated_at: new Date().toISOString() }
              : l
          ),
        }));
      },

      updateInspectionNote: (logId, noteId, updates) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  inspection_notes: l.inspection_notes.map((n) => (n.id === noteId ? { ...n, ...updates } : n)),
                  updated_at: new Date().toISOString(),
                }
              : l
          ),
        }));
      },

      removeInspectionNote: (logId, noteId) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  inspection_notes: l.inspection_notes.filter((n) => n.id !== noteId),
                  updated_at: new Date().toISOString(),
                }
              : l
          ),
        }));
      },

      // Additional Work Actions
      addAdditionalWork: (logId, work) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? { ...l, additional_work: [...l.additional_work, work], updated_at: new Date().toISOString() }
              : l
          ),
        }));
      },

      updateAdditionalWork: (logId, workId, updates) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  additional_work: l.additional_work.map((w) => (w.id === workId ? { ...w, ...updates } : w)),
                  updated_at: new Date().toISOString(),
                }
              : l
          ),
        }));
      },

      removeAdditionalWork: (logId, workId) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  additional_work: l.additional_work.filter((w) => w.id !== workId),
                  updated_at: new Date().toISOString(),
                }
              : l
          ),
        }));
      },

      // Voice Artifact Actions
      addVoiceArtifact: (logId, sectionKey, audioUri, entityId) => {
        const artifact = createVoiceArtifact(sectionKey, audioUri, entityId);
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  voice_artifacts: [...(l.voice_artifacts ?? []), artifact],
                  updated_at: new Date().toISOString(),
                }
              : l
          ),
        }));
      },

      updateVoiceArtifact: (logId, artifactId, updates) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  voice_artifacts: (l.voice_artifacts ?? []).map((a) =>
                    a.id === artifactId ? { ...a, ...updates } : a
                  ),
                  updated_at: new Date().toISOString(),
                }
              : l
          ),
        }));
      },

      removeVoiceArtifact: (logId, artifactId) => {
        set((state) => ({
          dailyLogs: state.dailyLogs.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  voice_artifacts: (l.voice_artifacts ?? []).filter((a) => a.id !== artifactId),
                  updated_at: new Date().toISOString(),
                }
              : l
          ),
        }));
      },

      // Event Actions
      addEvent: (projectId, audioUri) => {
        const event = createEmptyEvent(projectId, audioUri);
        set((state) => ({
          events: [...state.events, event],
        }));
        return event;
      },

      updateEvent: (eventId, updates) => {
        set((state) => ({
          events: state.events.map((e) =>
            e.id === eventId ? { ...e, ...updates } : e
          ),
        }));
      },

      deleteEvent: (eventId) => {
        set((state) => ({
          events: state.events.filter((e) => e.id !== eventId),
        }));
      },

      getEvent: (eventId) => {
        return get().events.find((e) => e.id === eventId);
      },

      getEventsForProject: (projectId) => {
        return get().events.filter((e) => e.project_id === projectId);
      },

      addEventToDailyLog: (eventId) => {
        const state = get();
        const event = state.events.find((e) => e.id === eventId);
        if (!event) {
          return { success: false };
        }

        const today = new Date().toISOString().split('T')[0];

        // Find or create today's daily log for the same project
        let dailyLog = state.dailyLogs.find(
          (l) => l.project_id === event.project_id && l.date === today
        );

        if (!dailyLog) {
          // Create a new daily log for today
          dailyLog = createEmptyDailyLog(event.project_id);
          dailyLog.prepared_by = state.userName;
          set((s) => ({
            dailyLogs: [...s.dailyLogs, dailyLog!],
          }));
        }

        // Create a pending issue from the event
        const issue: PendingIssue = {
          id: generateId(),
          title: event.title,
          description: event.notes || 'See event audio',
          category: mapEventTypeToIssueCategory(event.event_type),
          severity: event.severity,
          assignee: '',
          due_date: null,
          external_entity: event.trade_vendor,
          location: event.location,
          audio_uri: event.local_audio_uri,
          source_event_id: event.id,
        };

        // Add the issue to the daily log
        set((s) => ({
          dailyLogs: s.dailyLogs.map((l) =>
            l.id === dailyLog!.id
              ? {
                  ...l,
                  pending_issues: [...l.pending_issues, issue],
                  updated_at: new Date().toISOString(),
                }
              : l
          ),
          // Update the event to link to the daily log
          events: s.events.map((e) =>
            e.id === eventId
              ? { ...e, linked_daily_log_id: dailyLog!.id }
              : e
          ),
        }));

        return { success: true, dailyLogId: dailyLog.id };
      },

      toggleEventResolved: (eventId) => {
        set((state) => ({
          events: state.events.map((e) =>
            e.id === eventId
              ? {
                  ...e,
                  is_resolved: !e.is_resolved,
                  resolved_at: !e.is_resolved ? new Date().toISOString() : null,
                }
              : e
          ),
        }));
      },

      // User Actions
      setUserName: (name) => {
        set({ userName: name });
      },

      // Utility
      recalculateTotals: (logId) => {
        set((state) => {
          const log = state.dailyLogs.find((l) => l.id === logId);
          if (!log) return state;

          const totalWorkers = log.tasks.reduce((sum, t) => sum + t.workers, 0);
          const totalHours = log.tasks.reduce((sum, t) => sum + t.hours, 0);

          return {
            dailyLogs: state.dailyLogs.map((l) =>
              l.id === logId
                ? { ...l, daily_totals_workers: totalWorkers, daily_totals_hours: totalHours }
                : l
            ),
          };
        });
      },
    }),
    {
      name: 'daily-log-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
