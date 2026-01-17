/**
 * Data Provider - Handles data hydration from backend on app startup
 * and manages offline queue for recordings made without connectivity
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useDailyLogStore } from './store';
import {
  getProjects,
  getDailyLogs,
  getEvents,
  createProject as createProjectApi,
  createDailyLog as createDailyLogApi,
  createEvent as createEventApi,
} from './api';

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
      // Fetch projects from backend
      const backendProjects = await getProjects();
      console.log('[data] Fetched projects:', backendProjects.length);

      // Update store with backend projects
      const store = useDailyLogStore.getState();

      // Merge backend projects with local (backend is source of truth)
      for (const bp of backendProjects) {
        const existingLocal = store.projects.find(
          (p) => p.name === bp.name || backendIdMap.projects[p.id] === bp.id
        );

        if (!existingLocal) {
          // Add new project from backend
          const newProject = store.addProject(bp.name, bp.number || '', bp.address || '');
          setBackendId('projects', newProject.id, bp.id);
        } else {
          // Update mapping
          setBackendId('projects', existingLocal.id, bp.id);
        }
      }

      // Fetch daily logs for all projects
      let totalLogs = 0;
      for (const bp of backendProjects) {
        try {
          const logs = await getDailyLogs({ project_id: bp.id, limit: 100 });
          totalLogs += logs.length;
          // Note: Daily logs are fetched on-demand in history/detail pages
          // This just confirms connectivity
        } catch (err) {
          console.warn('[data] Failed to fetch logs for project:', bp.id, err);
        }
      }
      console.log('[data] Found daily logs:', totalLogs);

      // Fetch events
      const events = await getEvents({ limit: 100 });
      console.log('[data] Fetched events:', events.length);

      setState((s) => ({
        ...s,
        isHydrated: true,
        isSyncing: false,
        lastSyncAt: new Date().toISOString(),
      }));

      console.log('[data] Hydration complete');
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
};
