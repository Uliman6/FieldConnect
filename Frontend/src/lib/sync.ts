// Sync utilities for Daily Log backend integration

import { Platform } from 'react-native';
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
  SyncStatus,
  Event,
} from './types';
import { useDailyLogStore } from './store';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import {
  createProject as createProjectApi,
  createDailyLog as createDailyLogApi,
  createDailyLogFromTranscript,
  updateDailyLogApi,
  createEvent as createEventApi,
  updateEventApi,
  getProjects,
} from './api';
import { setBackendId, getBackendId } from './data-provider';

// App version constant - update this when releasing new versions
const APP_VERSION = '1.0.0';

// Backend API base URL - configure via ENV tab in Vibecode
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

// Get or create a unique device ID
let cachedDeviceId: string | null = null;

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  // Try to get a unique identifier
  try {
    const iosId = await Application.getIosIdForVendorAsync?.();
    if (iosId) {
      cachedDeviceId = iosId;
      return cachedDeviceId;
    }
  } catch {
    // iOS not available
  }

  try {
    const androidId = Application.getAndroidId?.();
    if (androidId) {
      cachedDeviceId = androidId;
      return cachedDeviceId;
    }
  } catch {
    // Android not available
  }

  // Fallback for web or unknown platforms
  cachedDeviceId = `device-${Device.modelName ?? 'unknown'}-${Date.now()}`;
  return cachedDeviceId;
}

// Sync payload interfaces for backend communication
export interface DailyLogPayload {
  project: Project;
  daily_log: {
    id: string;
    project_id: string;
    date: string;
    prepared_by: string;
    weather: DailyLog['weather'];
    daily_totals_workers: number;
    daily_totals_hours: number;
    daily_summary_notes: string;
    daily_summary_audio_uri?: string;
    status: DailyLog['status'];
    created_at: string;
    updated_at: string;
  };
  tasks: TaskEntry[];
  visitors: VisitorEntry[];
  equipment: EquipmentEntry[];
  materials: MaterialEntry[];
  pending_issues: PendingIssue[];
  inspection_notes: InspectionNote[];
  additional_work_entries: AdditionalWorkEntry[];
  voice_artifacts: VoiceArtifact[];
  metadata: {
    created_at: string;
    updated_at: string;
    device_id: string;
    user_id: string | null;
    app_version: string;
  };
}

export interface SyncResult {
  synced: string[];
  failed: { id: string; error: string }[];
}

/**
 * Check if the device is online
 */
export async function isOnline(): Promise<boolean> {
  const netInfo = await NetInfo.fetch();
  return netInfo.isConnected === true && netInfo.isInternetReachable === true;
}

/**
 * Export a daily log into a stable JSON payload suitable for backend sync.
 * This function aggregates all related data into a single payload.
 */
export async function exportDailyLogPayload(logId: string): Promise<DailyLogPayload | null> {
  const state = useDailyLogStore.getState();
  const log = state.dailyLogs.find((l) => l.id === logId);

  if (!log) {
    console.warn(`[sync] Daily log not found: ${logId}`);
    return null;
  }

  const project = state.projects.find((p) => p.id === log.project_id);

  if (!project) {
    console.warn(`[sync] Project not found for log: ${logId}`);
    return null;
  }

  const deviceId = await getDeviceId();
  const now = new Date().toISOString();

  return {
    project: {
      id: project.id,
      name: project.name,
      number: project.number,
      address: project.address,
      procore_project_id: project.procore_project_id,
      created_at: project.created_at,
      updated_at: project.updated_at,
    },
    daily_log: {
      id: log.id,
      project_id: log.project_id,
      date: log.date,
      prepared_by: log.prepared_by,
      weather: log.weather,
      daily_totals_workers: log.daily_totals_workers,
      daily_totals_hours: log.daily_totals_hours,
      daily_summary_notes: log.daily_summary_notes ?? '',
      daily_summary_audio_uri: log.daily_summary_audio_uri,
      status: log.status,
      created_at: log.created_at,
      updated_at: log.updated_at,
    },
    tasks: log.tasks.map((t) => ({ ...t })),
    visitors: log.visitors.map((v) => ({ ...v })),
    equipment: log.equipment.map((e) => ({ ...e })),
    materials: log.materials.map((m) => ({ ...m })),
    pending_issues: log.pending_issues.map((i) => ({ ...i })),
    inspection_notes: log.inspection_notes.map((n) => ({ ...n })),
    additional_work_entries: log.additional_work.map((w) => ({ ...w })),
    voice_artifacts: (log.voice_artifacts ?? []).map((a) => ({ ...a })),
    metadata: {
      created_at: log.created_at,
      updated_at: now,
      device_id: deviceId,
      user_id: null, // Will be populated when auth is implemented
      app_version: APP_VERSION,
    },
  };
}

/**
 * Export multiple daily logs for batch sync
 */
export async function exportDailyLogsPayload(logIds: string[]): Promise<DailyLogPayload[]> {
  const payloads: DailyLogPayload[] = [];

  for (const logId of logIds) {
    const payload = await exportDailyLogPayload(logId);
    if (payload) {
      payloads.push(payload);
    }
  }

  return payloads;
}

/**
 * Get all logs that need to be synced (pending or error status)
 */
export function getUnsyncedLogIds(): string[] {
  const state = useDailyLogStore.getState();
  return state.dailyLogs
    .filter((l) => l.sync_status === 'pending' || l.sync_status === 'error')
    .map((l) => l.id);
}

/**
 * Update log sync status
 */
function updateLogSyncStatus(logId: string, status: SyncStatus, lastSyncedAt?: string): void {
  const state = useDailyLogStore.getState();
  const updates: Partial<DailyLog> = { sync_status: status };
  if (lastSyncedAt) {
    updates.last_synced_at = lastSyncedAt;
  }
  state.updateDailyLog(logId, updates);
}

/**
 * Sync daily logs to the backend
 */
export async function syncDailyLogs(logIds?: string[]): Promise<SyncResult> {
  // Check if API is configured
  if (!API_BASE_URL) {
    console.log('[sync] No API URL configured. Set EXPO_PUBLIC_API_URL in ENV tab.');
    return { synced: [], failed: [] };
  }

  // Check connectivity
  const online = await isOnline();
  if (!online) {
    console.log('[sync] Device is offline, skipping sync');
    return { synced: [], failed: [] };
  }

  // Get logs to sync
  const idsToSync = logIds ?? getUnsyncedLogIds();
  if (idsToSync.length === 0) {
    console.log('[sync] No logs to sync');
    return { synced: [], failed: [] };
  }

  console.log(`[sync] Syncing ${idsToSync.length} logs...`);

  // Mark logs as syncing
  for (const id of idsToSync) {
    updateLogSyncStatus(id, 'syncing');
  }

  try {
    // Export payloads
    const payloads = await exportDailyLogsPayload(idsToSync);

    // Send to backend
    const response = await fetch(`${API_BASE_URL}/api/sync/daily-logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ logs: payloads }),
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
    }

    const result: SyncResult = await response.json();

    // Update sync status for successful syncs
    const now = new Date().toISOString();
    for (const id of result.synced) {
      updateLogSyncStatus(id, 'synced', now);
    }

    // Update sync status for failed syncs
    for (const failure of result.failed) {
      updateLogSyncStatus(failure.id, 'error');
      console.warn(`[sync] Failed to sync log ${failure.id}: ${failure.error}`);
    }

    console.log(`[sync] Completed: ${result.synced.length} synced, ${result.failed.length} failed`);
    return result;
  } catch (error) {
    console.error('[sync] Sync error:', error);

    // Mark all as error
    for (const id of idsToSync) {
      updateLogSyncStatus(id, 'error');
    }

    return {
      synced: [],
      failed: idsToSync.map((id) => ({
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })),
    };
  }
}

/**
 * Upload a voice artifact audio file
 */
export async function uploadVoiceArtifact(
  logId: string,
  artifactId: string,
  localUri: string
): Promise<{ success: boolean; remoteUri?: string; error?: string }> {
  if (!API_BASE_URL) {
    return { success: false, error: 'No API URL configured' };
  }

  const online = await isOnline();
  if (!online) {
    return { success: false, error: 'Device is offline' };
  }

  try {
    // Read file as base64
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (!fileInfo.exists) {
      return { success: false, error: 'Audio file not found' };
    }

    // Upload file
    const uploadResult = await FileSystem.uploadAsync(
      `${API_BASE_URL}/api/voice-artifacts/${artifactId}/upload`,
      localUri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'audio',
      }
    );

    if (uploadResult.status !== 200) {
      return { success: false, error: `Upload failed: ${uploadResult.status}` };
    }

    const response = JSON.parse(uploadResult.body);

    // Update artifact status in store
    useDailyLogStore.getState().updateVoiceArtifact(logId, artifactId, {
      status: 'uploaded',
    });

    return { success: true, remoteUri: response.remote_uri };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Get sync status summary for display
 */
export function getSyncStatusSummary(): {
  pending: number;
  syncing: number;
  synced: number;
  error: number;
} {
  const state = useDailyLogStore.getState();
  return state.dailyLogs.reduce(
    (acc, log) => {
      const status = log.sync_status ?? 'pending';
      acc[status]++;
      return acc;
    },
    { pending: 0, syncing: 0, synced: 0, error: 0 }
  );
}

// ============================================
// EVENT EXPORT FUNCTIONS
// ============================================

export interface EventPayload {
  event: Event;
  project: {
    id: string;
    name: string;
    number: string;
    address: string;
  } | null;
  metadata: {
    device_id: string;
    app_version: string;
    exported_at: string;
  };
}

// Enhanced audio file reference for JSON exports
export interface AudioFileReference {
  audio_file_id: string;
  entity_type: 'event' | 'pending_issue' | 'inspection_note' | 'additional_work' | 'daily_summary' | 'voice_artifact';
  entity_id: string;
  section_key: string;
  project_id: string;
  daily_log_id: string | null;
  created_at: string;
  filename: string;
  mime_type: string;
  original_uri: string;
  transcript_text: string | null;
}

export interface EnhancedAudioManifest {
  audio_files: AudioFileReference[];
  audio_pack_filename: string | null;
  audio_manifest_included: boolean;
}

export interface AllDataPayload {
  projects: Project[];
  daily_logs: DailyLogPayload[];
  events: EventPayload[];
  export_metadata: {
    device_id: string;
    app_version: string;
    exported_at: string;
  };
  // Legacy format (kept for backward compatibility)
  audio_manifest?: {
    events: { event_id: string; audio_uri: string }[];
    voice_artifacts: { log_id: string; artifact_id: string; audio_uri: string }[];
  };
  // Enhanced format with audio file IDs and linkage info
  enhanced_audio_manifest?: EnhancedAudioManifest;
}

export interface ExportOptions {
  date_from?: string;
  date_to?: string;
  project_id?: string;
  include_audio_manifest?: boolean;
  include_enhanced_audio_manifest?: boolean;
  audio_pack_filename?: string;
}

/**
 * Export a single event into a stable JSON payload
 */
export async function exportEventPayload(eventId: string): Promise<EventPayload | null> {
  const state = useDailyLogStore.getState();
  const event = state.events.find((e) => e.id === eventId);

  if (!event) {
    console.warn(`[export] Event not found: ${eventId}`);
    return null;
  }

  const project = state.projects.find((p) => p.id === event.project_id);
  const deviceId = await getDeviceId();
  const now = new Date().toISOString();

  return {
    event: { ...event },
    project: project
      ? {
          id: project.id,
          name: project.name,
          number: project.number,
          address: project.address,
        }
      : null,
    metadata: {
      device_id: deviceId,
      app_version: APP_VERSION,
      exported_at: now,
    },
  };
}

/**
 * Export all data with optional filters
 */
export async function exportAllDataPayload(options: ExportOptions = {}): Promise<AllDataPayload> {
  const state = useDailyLogStore.getState();
  const deviceId = await getDeviceId();
  const now = new Date().toISOString();

  // Filter projects
  let filteredProjects = [...state.projects];
  if (options.project_id) {
    filteredProjects = filteredProjects.filter((p) => p.id === options.project_id);
  }
  const projectIds = new Set(filteredProjects.map((p) => p.id));

  // Filter daily logs
  let filteredLogs = state.dailyLogs.filter((l) => projectIds.has(l.project_id));
  if (options.date_from) {
    filteredLogs = filteredLogs.filter((l) => l.date >= options.date_from!);
  }
  if (options.date_to) {
    filteredLogs = filteredLogs.filter((l) => l.date <= options.date_to!);
  }

  // Filter events
  let filteredEvents = state.events.filter((e) => projectIds.has(e.project_id));
  if (options.date_from) {
    filteredEvents = filteredEvents.filter(
      (e) => e.created_at.split('T')[0] >= options.date_from!
    );
  }
  if (options.date_to) {
    filteredEvents = filteredEvents.filter(
      (e) => e.created_at.split('T')[0] <= options.date_to!
    );
  }

  // Export daily log payloads
  const dailyLogPayloads: DailyLogPayload[] = [];
  for (const log of filteredLogs) {
    const payload = await exportDailyLogPayload(log.id);
    if (payload) {
      dailyLogPayloads.push(payload);
    }
  }

  // Export event payloads
  const eventPayloads: EventPayload[] = [];
  for (const event of filteredEvents) {
    const payload = await exportEventPayload(event.id);
    if (payload) {
      eventPayloads.push(payload);
    }
  }

  // Build result
  const result: AllDataPayload = {
    projects: filteredProjects,
    daily_logs: dailyLogPayloads,
    events: eventPayloads,
    export_metadata: {
      device_id: deviceId,
      app_version: APP_VERSION,
      exported_at: now,
    },
  };

  // Add audio manifest if requested
  if (options.include_audio_manifest) {
    const eventAudioManifest: { event_id: string; audio_uri: string }[] = [];
    const voiceArtifactManifest: { log_id: string; artifact_id: string; audio_uri: string }[] = [];

    for (const event of filteredEvents) {
      if (event.local_audio_uri) {
        eventAudioManifest.push({
          event_id: event.id,
          audio_uri: event.local_audio_uri,
        });
      }
    }

    for (const log of filteredLogs) {
      for (const artifact of log.voice_artifacts ?? []) {
        if (artifact.local_audio_uri) {
          voiceArtifactManifest.push({
            log_id: log.id,
            artifact_id: artifact.id,
            audio_uri: artifact.local_audio_uri,
          });
        }
      }
    }

    result.audio_manifest = {
      events: eventAudioManifest,
      voice_artifacts: voiceArtifactManifest,
    };
  }

  // Add enhanced audio manifest if requested
  if (options.include_enhanced_audio_manifest) {
    const audioFiles: AudioFileReference[] = [];

    // Helper to determine mime type
    const getMimeType = (uri: string): string => {
      const lowerUri = uri.toLowerCase();
      if (lowerUri.includes('.m4a')) return 'audio/m4a';
      if (lowerUri.includes('.mp4')) return 'audio/mp4';
      if (lowerUri.includes('.wav')) return 'audio/wav';
      if (lowerUri.includes('.webm')) return 'audio/webm';
      if (lowerUri.includes('.aac')) return 'audio/aac';
      if (lowerUri.includes('.mp3')) return 'audio/mpeg';
      return 'audio/m4a';
    };

    // Helper to get file extension
    const getExt = (mimeType: string): string => {
      const map: Record<string, string> = {
        'audio/m4a': 'm4a',
        'audio/mp4': 'm4a',
        'audio/wav': 'wav',
        'audio/webm': 'webm',
        'audio/aac': 'aac',
        'audio/mpeg': 'mp3',
      };
      return map[mimeType] ?? 'm4a';
    };

    // Generate ID
    const genId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

    // Process events
    for (const event of filteredEvents) {
      if (event.local_audio_uri) {
        const mimeType = getMimeType(event.local_audio_uri);
        const ext = getExt(mimeType);
        audioFiles.push({
          audio_file_id: genId(),
          entity_type: 'event',
          entity_id: event.id,
          section_key: 'event',
          project_id: event.project_id,
          daily_log_id: event.linked_daily_log_id,
          created_at: event.created_at,
          filename: `event_${event.id.slice(0, 16)}.${ext}`,
          mime_type: mimeType,
          original_uri: event.local_audio_uri,
          transcript_text: event.transcript_text,
        });
      }
    }

    // Process daily logs
    for (const log of filteredLogs) {
      // Daily summary audio
      if (log.daily_summary_audio_uri) {
        const mimeType = getMimeType(log.daily_summary_audio_uri);
        const ext = getExt(mimeType);
        audioFiles.push({
          audio_file_id: genId(),
          entity_type: 'daily_summary',
          entity_id: log.id,
          section_key: 'daily_summary',
          project_id: log.project_id,
          daily_log_id: log.id,
          created_at: log.created_at,
          filename: `daily_summary_${log.id.slice(0, 16)}.${ext}`,
          mime_type: mimeType,
          original_uri: log.daily_summary_audio_uri,
          transcript_text: null,
        });
      }

      // Pending issues
      for (const issue of log.pending_issues) {
        if (issue.audio_uri) {
          const mimeType = getMimeType(issue.audio_uri);
          const ext = getExt(mimeType);
          audioFiles.push({
            audio_file_id: genId(),
            entity_type: 'pending_issue',
            entity_id: issue.id,
            section_key: 'pending_issues',
            project_id: log.project_id,
            daily_log_id: log.id,
            created_at: log.created_at,
            filename: `pending_issue_${issue.id.slice(0, 16)}.${ext}`,
            mime_type: mimeType,
            original_uri: issue.audio_uri,
            transcript_text: null,
          });
        }
      }

      // Inspection notes
      for (const note of log.inspection_notes) {
        if (note.audio_uri) {
          const mimeType = getMimeType(note.audio_uri);
          const ext = getExt(mimeType);
          audioFiles.push({
            audio_file_id: genId(),
            entity_type: 'inspection_note',
            entity_id: note.id,
            section_key: 'inspection_notes',
            project_id: log.project_id,
            daily_log_id: log.id,
            created_at: log.created_at,
            filename: `inspection_note_${note.id.slice(0, 16)}.${ext}`,
            mime_type: mimeType,
            original_uri: note.audio_uri,
            transcript_text: null,
          });
        }
      }

      // Additional work
      for (const work of log.additional_work) {
        if (work.audio_uri) {
          const mimeType = getMimeType(work.audio_uri);
          const ext = getExt(mimeType);
          audioFiles.push({
            audio_file_id: genId(),
            entity_type: 'additional_work',
            entity_id: work.id,
            section_key: 'additional_work',
            project_id: log.project_id,
            daily_log_id: log.id,
            created_at: log.created_at,
            filename: `additional_work_${work.id.slice(0, 16)}.${ext}`,
            mime_type: mimeType,
            original_uri: work.audio_uri,
            transcript_text: null,
          });
        }
      }

      // Voice artifacts
      for (const artifact of log.voice_artifacts ?? []) {
        if (artifact.local_audio_uri) {
          const mimeType = getMimeType(artifact.local_audio_uri);
          const ext = getExt(mimeType);
          audioFiles.push({
            audio_file_id: genId(),
            entity_type: 'voice_artifact',
            entity_id: artifact.id,
            section_key: 'voice_artifacts',
            project_id: log.project_id,
            daily_log_id: log.id,
            created_at: artifact.created_at,
            filename: `voice_artifact_${artifact.id.slice(0, 16)}.${ext}`,
            mime_type: mimeType,
            original_uri: artifact.local_audio_uri,
            transcript_text: artifact.transcript_text,
          });
        }
      }
    }

    result.enhanced_audio_manifest = {
      audio_files: audioFiles,
      audio_pack_filename: options.audio_pack_filename ?? null,
      audio_manifest_included: true,
    };
  }

  return result;
}

/**
 * Generate export filename
 */
export function generateExportFilename(scope: string): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
  return `lessons_applied_export_${timestamp}_${scope}.json`;
}

/**
 * Save export to file system and return URI
 * On web, returns a data URI that can be used for download
 */
export async function saveExportToFile(data: object, filename: string): Promise<string | null> {
  const jsonString = JSON.stringify(data, null, 2);

  // Handle web platform - return data URI for download
  if (Platform.OS === 'web') {
    try {
      // Create a data URI that can be used directly
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(jsonString)}`;
      console.log(`[export] Created data URI for: ${filename}`);
      return dataUri;
    } catch (error) {
      console.error('[export] Failed to create data URI:', error);
      return null;
    }
  }

  // Handle native platforms
  try {
    const fileUri = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, jsonString, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    console.log(`[export] Saved to: ${fileUri}`);
    return fileUri;
  } catch (error) {
    console.error('[export] Failed to save file:', error);
    return null;
  }
}

/**
 * Get date range helpers
 */
export function getDateRange(days: number): { date_from: string; date_to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return {
    date_from: from.toISOString().split('T')[0],
    date_to: now.toISOString().split('T')[0],
  };
}

// ============================================
// REAL-TIME BACKEND SYNC FUNCTIONS
// ============================================

// Track backend IDs for local entities (maps local ID -> backend ID)
const backendIdMap = {
  projects: new Map<string, string>(),
  dailyLogs: new Map<string, string>(),
  events: new Map<string, string>(),
};

/**
 * Sync a project to the backend (creates if new, returns backend ID)
 * IMPORTANT: Checks for existing project by name to prevent duplicates
 */
export async function syncProjectToBackend(project: Project): Promise<string | null> {
  try {
    // Check if already synced (check persisted map first, then in-memory cache)
    const existingBackendId = getBackendId('projects', project.id) || backendIdMap.projects.get(project.id);
    if (existingBackendId) {
      // Update in-memory cache
      backendIdMap.projects.set(project.id, existingBackendId);
      return existingBackendId;
    }

    // IMPORTANT: Check if project with same name already exists in backend
    // This prevents creating duplicate projects
    console.log('[sync] Checking for existing project by name:', project.name);
    const backendProjects = await getProjects();
    const existingByName = backendProjects.find(
      (bp) => bp.name.toLowerCase() === project.name.toLowerCase()
    );

    if (existingByName) {
      console.log('[sync] Found existing project by name:', project.name, '->', existingByName.id);
      backendIdMap.projects.set(project.id, existingByName.id);
      setBackendId('projects', project.id, existingByName.id);
      return existingByName.id;
    }

    // No existing project found, create new one
    console.log('[sync] Creating new project in backend:', project.name);
    const result = await createProjectApi({
      name: project.name,
      number: project.number || undefined,
      address: project.address || undefined,
    });

    backendIdMap.projects.set(project.id, result.id);
    setBackendId('projects', project.id, result.id);
    console.log('[sync] Project created:', project.id, '->', result.id);
    return result.id;
  } catch (error) {
    console.error('[sync] Failed to sync project:', error);
    return null;
  }
}

/**
 * Sync a daily log to the backend
 * Parses transcription from voice artifacts to extract structured data
 */
export async function syncDailyLogToBackend(dailyLog: DailyLog): Promise<string | null> {
  try {
    // Check if already synced (check persisted map first, then in-memory cache)
    const existingBackendId = getBackendId('dailyLogs', dailyLog.id) || backendIdMap.dailyLogs.get(dailyLog.id);
    if (existingBackendId) {
      // Update in-memory cache
      backendIdMap.dailyLogs.set(dailyLog.id, existingBackendId);
      console.log('[sync] Updating daily log in backend:', existingBackendId);
      await updateDailyLogApi(existingBackendId, {
        preparedBy: dailyLog.prepared_by || undefined,
        status: dailyLog.status || undefined,
        weather: dailyLog.weather || undefined,
        dailyTotalsWorkers: dailyLog.daily_totals_workers || undefined,
        dailyTotalsHours: dailyLog.daily_totals_hours || undefined,
      });

      // Update sync status
      const store = useDailyLogStore.getState();
      store.updateDailyLog(dailyLog.id, {
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
      });

      return existingBackendId;
    }

    // Get backend project ID (check persisted map first)
    let backendProjectId = getBackendId('projects', dailyLog.project_id) || backendIdMap.projects.get(dailyLog.project_id);
    if (!backendProjectId) {
      // Try to sync the project first
      const store = useDailyLogStore.getState();
      const project = store.projects.find(p => p.id === dailyLog.project_id);
      if (project) {
        backendProjectId = await syncProjectToBackend(project);
      }
    }

    if (!backendProjectId) {
      console.error('[sync] Cannot sync daily log: project not synced');
      return null;
    }

    // Extract transcription from voice artifacts
    let transcriptText = '';
    if (dailyLog.voice_artifacts && dailyLog.voice_artifacts.length > 0) {
      // Combine all transcriptions from voice artifacts
      transcriptText = dailyLog.voice_artifacts
        .filter(a => a.transcript_text)
        .map(a => a.transcript_text)
        .join('. ');
    }

    // Also include daily summary notes if available
    if (dailyLog.daily_summary_notes) {
      transcriptText = transcriptText
        ? `${transcriptText}. ${dailyLog.daily_summary_notes}`
        : dailyLog.daily_summary_notes;
    }

    let result;

    // If we have transcript text, use AI parsing on the backend
    if (transcriptText && transcriptText.trim().length > 20) {
      console.log('[sync] Using AI parsing for transcript, length:', transcriptText.length);

      result = await createDailyLogFromTranscript({
        projectId: backendProjectId,
        transcript: transcriptText,
        date: dailyLog.date,
        preparedBy: dailyLog.prepared_by || undefined,
      });

      console.log('[sync] AI parsed daily log created:', {
        tasks: result.tasks?.length || 0,
        pendingIssues: result.pendingIssues?.length || 0,
        inspectionNotes: result.inspectionNotes?.length || 0,
        dailyTotalsWorkers: result.dailyTotalsWorkers,
        dailyTotalsHours: result.dailyTotalsHours,
      });
    } else {
      // No transcript - use existing data directly
      console.log('[sync] No transcript, using existing data');

      const tasks = (dailyLog.tasks || []).map(t => ({
        company_name: t.company_name,
        workers: t.workers,
        hours: t.hours,
        task_description: t.task_description,
        notes: t.notes,
      }));

      const pendingIssues = (dailyLog.pending_issues || []).map(i => ({
        title: i.title,
        description: i.description,
        category: i.category,
        severity: i.severity,
        location: i.location,
      }));

      const inspectionNotes = (dailyLog.inspection_notes || []).map(n => ({
        inspection_type: n.inspection_type,
        inspector_name: n.inspector_name,
        result: n.result,
        notes: n.notes,
        follow_up_needed: n.follow_up_needed,
      }));

      const materials = (dailyLog.materials || []).map(m => ({
        material: m.material,
        quantity: m.quantity,
        unit: m.unit,
        supplier: m.supplier,
        notes: m.notes,
      }));

      const equipment = (dailyLog.equipment || []).map(e => ({
        equipment_type: e.equipment_type,
        quantity: e.quantity,
        hours: e.hours,
        notes: e.notes,
      }));

      const visitors = (dailyLog.visitors || []).map(v => ({
        visitor_name: v.visitor_name,
        company_name: v.company_name,
        time: v.time,
        notes: v.notes,
      }));

      result = await createDailyLogApi({
        projectId: backendProjectId,
        date: dailyLog.date,
        preparedBy: dailyLog.prepared_by || undefined,
        status: dailyLog.status || 'draft',
        weather: dailyLog.weather || undefined,
        dailyTotalsWorkers: dailyLog.daily_totals_workers || undefined,
        dailyTotalsHours: dailyLog.daily_totals_hours || undefined,
        tasks: tasks.length > 0 ? tasks : undefined,
        pending_issues: pendingIssues.length > 0 ? pendingIssues : undefined,
        inspection_notes: inspectionNotes.length > 0 ? inspectionNotes : undefined,
        materials: materials.length > 0 ? materials : undefined,
        equipment: equipment.length > 0 ? equipment : undefined,
        visitors: visitors.length > 0 ? visitors : undefined,
      });
    }

    backendIdMap.dailyLogs.set(dailyLog.id, result.id);
    setBackendId('dailyLogs', dailyLog.id, result.id);
    console.log('[sync] Daily log synced:', dailyLog.id, '->', result.id);

    // Update sync status in store
    const store = useDailyLogStore.getState();
    store.updateDailyLog(dailyLog.id, {
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
    });

    return result.id;
  } catch (error) {
    console.error('[sync] Failed to sync daily log:', error);

    // Update sync status to error
    const store = useDailyLogStore.getState();
    store.updateDailyLog(dailyLog.id, {
      sync_status: 'error',
    });

    return null;
  }
}

/**
 * Sync an event to the backend
 */
export async function syncEventToBackend(event: Event): Promise<string | null> {
  try {
    // Check if already synced (check persisted map first, then in-memory cache)
    const existingBackendId = getBackendId('events', event.id) || backendIdMap.events.get(event.id);
    if (existingBackendId) {
      // Update in-memory cache
      backendIdMap.events.set(event.id, existingBackendId);
      console.log('[sync] Updating event in backend:', existingBackendId);
      await updateEventApi(existingBackendId, {
        title: event.title || undefined,
        description: event.description || undefined,
        transcriptText: event.transcript_text || undefined,
        eventType: event.event_type || undefined,
        severity: event.severity || undefined,
        notes: event.notes || undefined,
        location: event.location || undefined,
        tradeVendor: event.trade_vendor || undefined,
        isResolved: event.is_resolved,
      });
      return existingBackendId;
    }

    // Get backend project ID (check persisted map first)
    let backendProjectId = getBackendId('projects', event.project_id) || backendIdMap.projects.get(event.project_id);
    if (!backendProjectId) {
      // Try to sync the project first
      const store = useDailyLogStore.getState();
      const project = store.projects.find(p => p.id === event.project_id);
      if (project) {
        backendProjectId = await syncProjectToBackend(project);
      }
    }

    if (!backendProjectId) {
      console.error('[sync] Cannot sync event: project not synced');
      return null;
    }

    console.log('[sync] Creating event in backend');
    const result = await createEventApi({
      projectId: backendProjectId,
      title: event.title || undefined,
      description: event.description || undefined,
      transcriptText: event.transcript_text || undefined,
      eventType: event.event_type || undefined,
      severity: event.severity || undefined,
      notes: event.notes || undefined,
      location: event.location || undefined,
      tradeVendor: event.trade_vendor || undefined,
      isResolved: event.is_resolved,
    });

    backendIdMap.events.set(event.id, result.id);
    setBackendId('events', event.id, result.id); // Persist to data-provider map
    console.log('[sync] Event synced:', event.id, '->', result.id);
    return result.id;
  } catch (error) {
    console.error('[sync] Failed to sync event:', error);
    return null;
  }
}

/**
 * Sync all local data to backend
 */
export async function syncAllDataToBackend(): Promise<{
  projects: number;
  dailyLogs: number;
  events: number;
  errors: number;
}> {
  const store = useDailyLogStore.getState();
  const results = { projects: 0, dailyLogs: 0, events: 0, errors: 0 };

  // Check connectivity first
  const online = await isOnline();
  if (!online) {
    console.log('[sync] Device is offline, skipping sync');
    return results;
  }

  // Sync projects first
  for (const project of store.projects) {
    const backendId = await syncProjectToBackend(project);
    if (backendId) {
      results.projects++;
    } else {
      results.errors++;
    }
  }

  // Sync daily logs
  for (const dailyLog of store.dailyLogs) {
    const backendId = await syncDailyLogToBackend(dailyLog);
    if (backendId) {
      results.dailyLogs++;
    } else {
      results.errors++;
    }
  }

  // Sync events
  for (const event of store.events) {
    const backendId = await syncEventToBackend(event);
    if (backendId) {
      results.events++;
    } else {
      results.errors++;
    }
  }

  console.log('[sync] Full sync complete:', results);
  return results;
}

/**
 * Load backend ID mappings by matching names
 * Call this on app startup to restore mappings
 */
export async function loadBackendMappings(): Promise<void> {
  try {
    const store = useDailyLogStore.getState();
    const backendProjects = await getProjects();

    // Match local projects to backend by name
    for (const localProject of store.projects) {
      const match = backendProjects.find(bp => bp.name === localProject.name);
      if (match) {
        backendIdMap.projects.set(localProject.id, match.id);
        setBackendId('projects', localProject.id, match.id);
      }
    }

    console.log('[sync] Loaded project mappings:', backendIdMap.projects.size);
  } catch (error) {
    console.error('[sync] Failed to load backend mappings:', error);
  }
}

/**
 * Check if entity is synced (uses persisted backend ID map)
 */
export function isSynced(type: 'projects' | 'dailyLogs' | 'events', localId: string): boolean {
  return !!getBackendId(type, localId) || backendIdMap[type].has(localId);
}
