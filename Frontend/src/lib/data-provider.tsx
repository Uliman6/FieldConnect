/**
 * Data Provider - Handles data hydration from backend on app startup
 * and manages offline queue for recordings made without connectivity
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useDailyLogStore } from './store';
import { Event as LocalEvent, Project as LocalProject, EventType, EventSeverity } from './types';
import {
  getProjects,
  getDailyLogs,
  getEvents,
  IndexedEvent,
  ProjectSummary,
  DailyLogSummary,
  createProject as createProjectApi,
  createDailyLog as createDailyLogApi,
  createEvent as createEventApi,
} from './api';
import { DailyLog, createEmptyDailyLog } from './types';

// ============================================
// TYPES
// ============================================

interface OfflineQueueItem {
  id: string;
  type: 'project' | 'dailyLog' | 'event';
  action: 'create' | 'update';
  data: any;
  createdAt: string;
  retryCount: number;
}

interface DataProviderState {
  isHydrated: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  error: string | null;
}

interface DataProviderContextValue extends DataProviderState {
  refresh: () => Promise<void>;
  syncNow: () => Promise<void>;
}

// ============================================
// INDEXEDDB OFFLINE QUEUE
// ============================================

const DB_NAME = 'fieldconnect-offline';
const DB_VERSION = 1;
const STORE_NAME = 'offline-queue';

let db: IDBDatabase | null = null;

async function openDatabase(): Promise<IDBDatabase> {
  if (db) return db;

  // Skip IndexedDB on non-web platforms for now
  if (Platform.OS !== 'web') {
    throw new Error('IndexedDB only available on web');
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

async function addToOfflineQueue(item: OfflineQueueItem): Promise<void> {
  if (Platform.OS !== 'web') {
    console.log('[offline] Skipping IndexedDB on native platform');
    return;
  }

  try {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(item);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('[offline] Failed to add to queue:', error);
  }
}

async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  if (Platform.OS !== 'web') {
    return [];
  }

  try {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  } catch (error) {
    console.error('[offline] Failed to get queue:', error);
    return [];
  }
}

async function removeFromOfflineQueue(id: string): Promise<void> {
  if (Platform.OS !== 'web') {
    return;
  }

  try {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('[offline] Failed to remove from queue:', error);
  }
}

async function clearOfflineQueue(): Promise<void> {
  if (Platform.OS !== 'web') {
    return;
  }

  try {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('[offline] Failed to clear queue:', error);
  }
}

// ============================================
// BACKEND ID MAPPING
// ============================================

// Maps local IDs to backend IDs (persisted in localStorage)
const BACKEND_ID_MAP_KEY = 'fieldconnect-backend-ids';
const CURRENT_PROJECT_KEY = 'fieldconnect-current-project';

interface BackendIdMap {
  projects: Record<string, string>;
  dailyLogs: Record<string, string>;
  events: Record<string, string>;
}

function loadBackendIdMap(): BackendIdMap {
  if (Platform.OS !== 'web') {
    return { projects: {}, dailyLogs: {}, events: {} };
  }

  try {
    const stored = localStorage.getItem(BACKEND_ID_MAP_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('[data] Failed to load backend ID map:', error);
  }
  return { projects: {}, dailyLogs: {}, events: {} };
}

function saveBackendIdMap(map: BackendIdMap): void {
  if (Platform.OS !== 'web') {
    return;
  }

  try {
    localStorage.setItem(BACKEND_ID_MAP_KEY, JSON.stringify(map));
  } catch (error) {
    console.error('[data] Failed to save backend ID map:', error);
  }
}

let backendIdMap = loadBackendIdMap();

export function getBackendId(type: keyof BackendIdMap, localId: string): string | null {
  return backendIdMap[type][localId] || null;
}

export function setBackendId(type: keyof BackendIdMap, localId: string, backendId: string): void {
  backendIdMap[type][localId] = backendId;
  saveBackendIdMap(backendIdMap);
}

// ============================================
// CURRENT PROJECT PERSISTENCE
// ============================================

function loadCurrentProjectName(): string | null {
  if (Platform.OS !== 'web') {
    return null;
  }

  try {
    return localStorage.getItem(CURRENT_PROJECT_KEY);
  } catch (error) {
    console.error('[data] Failed to load current project:', error);
    return null;
  }
}

function saveCurrentProjectName(projectName: string | null): void {
  if (Platform.OS !== 'web') {
    return;
  }

  try {
    if (projectName) {
      localStorage.setItem(CURRENT_PROJECT_KEY, projectName);
    } else {
      localStorage.removeItem(CURRENT_PROJECT_KEY);
    }
  } catch (error) {
    console.error('[data] Failed to save current project:', error);
  }
}

// ============================================
// DATA PROVIDER CONTEXT
// ============================================

const DataProviderContext = createContext<DataProviderContextValue | null>(null);

export function useDataProvider() {
  const context = useContext(DataProviderContext);
  if (!context) {
    throw new Error('useDataProvider must be used within DataProvider');
  }
  return context;
}

// ============================================
// DATA PROVIDER COMPONENT
// ============================================

interface DataProviderProps {
  children: React.ReactNode;
}

export function DataProvider({ children }: DataProviderProps) {
  const [state, setState] = useState<DataProviderState>({
    isHydrated: false,
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncAt: null,
    error: null,
  });

  // Check connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState) => {
      const online = netState.isConnected === true && netState.isInternetReachable !== false;
      setState((s) => ({ ...s, isOnline: online }));

      // Auto-sync when coming back online
      if (online && !state.isOnline) {
        console.log('[data] Back online, syncing...');
        processOfflineQueue();
      }
    });

    return () => unsubscribe();
  }, [state.isOnline]);

  // Hydrate data from backend on startup
  const hydrateFromBackend = useCallback(async () => {
    console.log('[data] Hydrating from backend...');
    setState((s) => ({ ...s, isSyncing: true, error: null }));

    try {
      const store = useDailyLogStore.getState();

      // ============================================
      // STEP 1: Fetch and sync PROJECTS
      // ============================================
      const backendProjects = await getProjects();
      console.log('[data] Fetched projects from backend:', backendProjects.length);

      // Build a set of backend project IDs we've seen
      const backendProjectIds = new Set(backendProjects.map((bp) => bp.id));

      // For each backend project, either update existing or add new
      for (const bp of backendProjects) {
        // Check if we already have this project (by backend ID mapping or by name)
        const existingByMapping = Object.entries(backendIdMap.projects).find(
          ([, backendId]) => backendId === bp.id
        );
        const existingByName = store.projects.find((p) => p.name === bp.name);

        if (existingByMapping) {
          // Already mapped, update mapping
          setBackendId('projects', existingByMapping[0], bp.id);
        } else if (existingByName) {
          // Found by name, create mapping
          setBackendId('projects', existingByName.id, bp.id);
          console.log('[data] Mapped existing project:', existingByName.name);
        } else {
          // New project from backend - add directly to store with backend ID
          const converted = convertBackendProjectToLocal(bp);
          // Directly set the project in store using the backend ID
          useDailyLogStore.setState((s) => ({
            projects: [...s.projects, converted],
          }));
          setBackendId('projects', bp.id, bp.id);
          console.log('[data] Added project from backend:', bp.name);
        }
      }

      // Remove local projects that don't exist on backend anymore
      const currentStoreAfterSync = useDailyLogStore.getState();
      const projectsToRemove = currentStoreAfterSync.projects.filter((localProject) => {
        // Check if this local project has a backend mapping
        const backendId = backendIdMap.projects[localProject.id] || localProject.id;
        // Keep only if it exists on backend
        return !backendProjectIds.has(backendId) && !backendProjectIds.has(localProject.id);
      });

      if (projectsToRemove.length > 0) {
        console.log('[data] Removing deleted projects:', projectsToRemove.map((p) => p.name));
        useDailyLogStore.setState((s) => ({
          projects: s.projects.filter((p) => !projectsToRemove.some((r) => r.id === p.id)),
          // Also remove related daily logs and events
          dailyLogs: s.dailyLogs.filter((l) => !projectsToRemove.some((r) => r.id === l.project_id)),
          events: s.events.filter((e) => !projectsToRemove.some((r) => r.id === e.project_id)),
        }));
      }

      // ============================================
      // STEP 2: Fetch and sync EVENTS
      // ============================================
      const backendEvents = await getEvents({ limit: 200 });
      console.log('[data] Fetched events from backend:', backendEvents.length);

      // Get current local events
      const currentStore = useDailyLogStore.getState();
      const localEventIds = new Set(currentStore.events.map((e) => e.id));

      // Track which backend events we've added
      const addedEventIds = new Set<string>();

      for (const be of backendEvents) {
        // Skip if we already have this event locally (by ID or by backend mapping)
        const existingByMapping = Object.entries(backendIdMap.events).find(
          ([, backendId]) => backendId === be.id
        );

        if (localEventIds.has(be.id) || existingByMapping) {
          continue;
        }

        // Get the project ID (use backend project ID directly)
        const projectId = be.project?.id || '';

        if (projectId) {
          // Convert and add to store
          const localEvent = convertBackendEventToLocal(be, projectId);
          useDailyLogStore.setState((s) => ({
            events: [...s.events, localEvent],
          }));
          setBackendId('events', be.id, be.id);
          addedEventIds.add(be.id);
        }
      }

      if (addedEventIds.size > 0) {
        console.log('[data] Added events from backend:', addedEventIds.size);
      }

      // Build a set of backend event IDs
      const backendEventIds = new Set(backendEvents.map((be) => be.id));

      // Remove local events that don't exist on backend anymore
      const storeAfterEventSync = useDailyLogStore.getState();
      const eventsToRemove = storeAfterEventSync.events.filter((localEvent) => {
        // Check if this local event has a backend mapping
        const backendId = backendIdMap.events[localEvent.id] || localEvent.id;
        // Keep only if it exists on backend
        return !backendEventIds.has(backendId) && !backendEventIds.has(localEvent.id);
      });

      if (eventsToRemove.length > 0) {
        console.log('[data] Removing deleted events:', eventsToRemove.length);
        useDailyLogStore.setState((s) => ({
          events: s.events.filter((e) => !eventsToRemove.some((r) => r.id === e.id)),
        }));
      }

      // ============================================
      // STEP 3: Fetch and sync DAILY LOGS
      // ============================================
      const backendDailyLogs = await getDailyLogs({ limit: 200 });
      console.log('[data] Fetched daily logs from backend:', backendDailyLogs.length);

      // Get current local daily logs
      const storeForLogs = useDailyLogStore.getState();
      const localLogIds = new Set(storeForLogs.dailyLogs.map((l) => l.id));
      const backendLogIds = new Set(backendDailyLogs.map((bl) => bl.id));

      // Add backend logs that don't exist locally
      const addedLogIds = new Set<string>();
      for (const bl of backendDailyLogs) {
        // Skip if we already have this log locally (by ID or by backend mapping)
        const existingByMapping = Object.entries(backendIdMap.dailyLogs).find(
          ([, backendId]) => backendId === bl.id
        );

        if (localLogIds.has(bl.id) || existingByMapping) {
          // Update mapping if needed
          if (!existingByMapping) {
            setBackendId('dailyLogs', bl.id, bl.id);
          }
          continue;
        }

        // Get the project ID
        const projectId = bl.project?.id || bl.projectId;

        if (projectId) {
          // Convert and add to store
          const localLog = convertBackendDailyLogToLocal(bl, projectId);
          useDailyLogStore.setState((s) => ({
            dailyLogs: [...s.dailyLogs, localLog],
          }));
          setBackendId('dailyLogs', bl.id, bl.id);
          addedLogIds.add(bl.id);
        }
      }

      if (addedLogIds.size > 0) {
        console.log('[data] Added daily logs from backend:', addedLogIds.size);
      }

      // Push local-only logs to backend (logs without backend ID mapping)
      const storeAfterFetch = useDailyLogStore.getState();
      const localOnlyLogs = storeAfterFetch.dailyLogs.filter((localLog) => {
        const backendId = backendIdMap.dailyLogs[localLog.id];
        return !backendId && !backendLogIds.has(localLog.id);
      });

      if (localOnlyLogs.length > 0) {
        console.log('[data] Syncing local-only daily logs to backend:', localOnlyLogs.length);
        for (const localLog of localOnlyLogs) {
          try {
            // Get backend project ID
            const backendProjectId = backendIdMap.projects[localLog.project_id] || localLog.project_id;

            const result = await createDailyLogApi({
              projectId: backendProjectId,
              date: localLog.date,
              preparedBy: localLog.prepared_by || undefined,
              status: localLog.status || undefined,
              weather: localLog.weather || undefined,
              dailyTotalsWorkers: localLog.daily_totals_workers || undefined,
              dailyTotalsHours: localLog.daily_totals_hours || undefined,
              tasks: localLog.tasks?.map(t => ({
                company_name: t.company_name,
                workers: t.workers,
                hours: t.hours,
                task_description: t.task_description,
                notes: t.notes,
              })),
              pending_issues: localLog.pending_issues?.map(i => ({
                title: i.title,
                description: i.description,
                category: i.category,
                severity: i.severity,
                location: i.location,
              })),
              inspection_notes: localLog.inspection_notes?.map(n => ({
                inspection_type: n.inspection_type,
                inspector_name: n.inspector_name,
                result: n.result,
                notes: n.notes,
                follow_up_needed: n.follow_up_needed,
              })),
            });
            setBackendId('dailyLogs', localLog.id, result.id);
            console.log('[data] Synced daily log:', localLog.date, '→', result.id);
          } catch (error) {
            console.error('[data] Failed to sync daily log:', localLog.id, error);
          }
        }
      }

      // ============================================
      // STEP 4: Auto-select project if needed
      // ============================================
      const updatedStore = useDailyLogStore.getState();
      const currentProjectValid = updatedStore.currentProjectId &&
        updatedStore.projects.some((p) => p.id === updatedStore.currentProjectId);

      if (!currentProjectValid && updatedStore.projects.length > 0) {
        // Try to restore last used project from localStorage
        const savedProjectName = loadCurrentProjectName();
        let projectToSelect = savedProjectName
          ? updatedStore.projects.find((p) => p.name === savedProjectName)
          : null;

        // Fall back to first project if saved project not found
        if (!projectToSelect) {
          projectToSelect = updatedStore.projects[0];
        }

        console.log('[data] Selecting project:', projectToSelect.name);
        updatedStore.setCurrentProject(projectToSelect.id);
        saveCurrentProjectName(projectToSelect.name);

        // Also create a daily log for today if none exists
        const today = new Date().toISOString().split('T')[0];
        const storeAfterSelect = useDailyLogStore.getState();
        const existingLog = storeAfterSelect.dailyLogs.find(
          (l) => l.project_id === projectToSelect!.id && l.date === today
        );
        if (!existingLog) {
          console.log('[data] Creating daily log for today');
          storeAfterSelect.createDailyLog(projectToSelect.id);
        } else {
          storeAfterSelect.setCurrentLog(existingLog.id);
        }
      }

      // ============================================
      // STEP 5: Update state
      // ============================================
      const finalStore = useDailyLogStore.getState();
      console.log('[data] Hydration complete:', {
        projects: finalStore.projects.length,
        events: finalStore.events.length,
        dailyLogs: finalStore.dailyLogs.length,
      });

      setState((s) => ({
        ...s,
        isHydrated: true,
        isSyncing: false,
        lastSyncAt: new Date().toISOString(),
      }));
    } catch (error) {
      console.error('[data] Hydration failed:', error);
      setState((s) => ({
        ...s,
        isHydrated: true, // Still mark as hydrated so app doesn't block
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Failed to sync with server',
      }));
    }
  }, []);

  // Process offline queue
  const processOfflineQueue = useCallback(async () => {
    const queue = await getOfflineQueue();
    if (queue.length === 0) {
      setState((s) => ({ ...s, pendingCount: 0 }));
      return;
    }

    console.log('[data] Processing offline queue:', queue.length, 'items');
    setState((s) => ({ ...s, isSyncing: true, pendingCount: queue.length }));

    for (const item of queue) {
      try {
        if (item.type === 'project' && item.action === 'create') {
          const result = await createProjectApi(item.data);
          setBackendId('projects', item.data.localId, result.id);
        } else if (item.type === 'dailyLog' && item.action === 'create') {
          const result = await createDailyLogApi(item.data);
          setBackendId('dailyLogs', item.data.localId, result.id);
        } else if (item.type === 'event' && item.action === 'create') {
          const result = await createEventApi(item.data);
          setBackendId('events', item.data.localId, result.id);
        }

        await removeFromOfflineQueue(item.id);
        setState((s) => ({ ...s, pendingCount: s.pendingCount - 1 }));
      } catch (error) {
        console.error('[data] Failed to process queue item:', item.id, error);
        // Update retry count
        await addToOfflineQueue({ ...item, retryCount: item.retryCount + 1 });
      }
    }

    setState((s) => ({ ...s, isSyncing: false }));
  }, []);

  // Initial hydration
  useEffect(() => {
    hydrateFromBackend();
  }, [hydrateFromBackend]);

  // Check for pending items
  useEffect(() => {
    const checkPending = async () => {
      const queue = await getOfflineQueue();
      setState((s) => ({ ...s, pendingCount: queue.length }));
    };
    checkPending();
  }, []);

  const refresh = useCallback(async () => {
    await hydrateFromBackend();
  }, [hydrateFromBackend]);

  const syncNow = useCallback(async () => {
    if (state.isOnline) {
      await processOfflineQueue();
      await hydrateFromBackend();
    }
  }, [state.isOnline, processOfflineQueue, hydrateFromBackend]);

  const contextValue: DataProviderContextValue = {
    ...state,
    refresh,
    syncNow,
  };

  return (
    <DataProviderContext.Provider value={contextValue}>
      {children}
    </DataProviderContext.Provider>
  );
}

// ============================================
// HELPER HOOKS
// ============================================

/**
 * Hook to check if app is online
 */
export function useIsOnline() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected === true && state.isInternetReachable !== false);
    });
    return () => unsubscribe();
  }, []);

  return isOnline;
}

/**
 * Hook to add item to offline queue
 */
export function useOfflineQueue() {
  const addToQueue = useCallback(async (
    type: OfflineQueueItem['type'],
    action: OfflineQueueItem['action'],
    data: any
  ) => {
    const item: OfflineQueueItem = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substring(2)}`,
      type,
      action,
      data,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };
    await addToOfflineQueue(item);
    return item.id;
  }, []);

  return { addToQueue };
}

// ============================================
// EXPORTS
// ============================================

export {
  addToOfflineQueue,
  getOfflineQueue,
  removeFromOfflineQueue,
  clearOfflineQueue,
  saveCurrentProjectName,
};

// ============================================
// DATA CONVERSION HELPERS
// ============================================

/**
 * Convert backend project to local format
 */
function convertBackendProjectToLocal(bp: ProjectSummary): LocalProject {
  return {
    id: bp.id,
    name: bp.name,
    number: bp.number || '',
    address: bp.address || '',
    created_at: bp.createdAt,
    updated_at: bp.updatedAt,
  };
}

/**
 * Convert backend event to local format
 */
function convertBackendEventToLocal(be: IndexedEvent, projectId: string): LocalEvent {
  return {
    id: be.id,
    project_id: projectId,
    created_at: be.createdAt,
    local_audio_uri: '', // Backend events don't have local audio
    transcript_text: be.transcriptText,
    status: 'completed',
    event_type: (be.eventType as EventType) || 'Other',
    severity: (be.severity as EventSeverity) || 'Medium',
    title: be.title || 'Untitled Event',
    description: be.description || '', // Include description
    notes: be.notes || '',
    location: be.location || '',
    trade_vendor: be.tradeVendor || '',
    is_resolved: be.isResolved || false,
    resolved_at: null,
    linked_daily_log_id: null,
    action_items: [], // Backend doesn't return action_items in list, will be fetched on detail view
    item_status: be.itemStatus || undefined,
    status_changed_at: be.statusChangedAt || undefined,
    status_changed_by: be.statusChangedBy || undefined,
  };
}

/**
 * Convert backend daily log to local format
 */
function convertBackendDailyLogToLocal(bl: DailyLogSummary, projectId: string): DailyLog {
  return {
    id: bl.id,
    project_id: projectId,
    date: bl.date,
    prepared_by: bl.preparedBy || '',
    weather: {
      low_temp: null,
      high_temp: null,
      precipitation: '',
      wind: '',
      sky_condition: 'Clear',
      weather_delay: bl.weather?.weather_delay || false,
    },
    daily_totals_workers: bl.dailyTotalsWorkers || 0,
    daily_totals_hours: bl.dailyTotalsHours || 0,
    tasks: [],
    visitors: [],
    equipment: [],
    materials: [],
    pending_issues: [],
    inspection_notes: [],
    additional_work: [],
    daily_summary_notes: '',
    voice_artifacts: [],
    status: (bl.status as 'draft' | 'completed') || 'draft',
    sync_status: 'synced',
    last_synced_at: new Date().toISOString(),
    created_at: bl.createdAt,
    updated_at: bl.updatedAt,
  };
}
