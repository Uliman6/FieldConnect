// API service for backend communication
// Handles event indexing, search, and follow-up tracking

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { getAuthToken, useAuthStore } from './auth-store';
import type { PdfTemplate, EventTemplateData, TemplateType, DocumentSchema, SchemaDocumentType, SchemaField, EventSchemaData, Photo } from './types';

// Backend API base URL - configure via ENV tab in Vibecode
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Check if the device is online
 */
export async function isOnline(): Promise<boolean> {
  const netInfo = await NetInfo.fetch();
  return netInfo.isConnected === true && netInfo.isInternetReachable === true;
}

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface EventIndex {
  id: string;
  eventId: string;
  createdAt: string;
  updatedAt: string;
  inspectors: string[] | null;
  trades: string[] | null;
  materials: string[] | null;
  issueTypes: string[] | null;
  locations: string[] | null;
  ahj: string[] | null;
  systems: string[] | null;
  costImpact: number | null;
  needsFollowUp: boolean;
  followUpReason: string | null;
  followUpDueDate: string | null;
  keywordsSummary: string | null;
}

// Checklist/Comments types
export interface EventCommentData {
  id: string;
  createdAt: string;
  eventId: string;
  text: string;
  authorName: string | null;
  commentType: 'comment' | 'status_change' | 'edit';
  previousStatus: string | null;
  newStatus: string | null;
}

export interface ChecklistFilters {
  category?: 'PUNCH_LIST' | 'RFI';
  project_id?: string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  limit?: number;
}

export interface ChecklistResponse {
  items: IndexedEvent[];
  counts: {
    total: number;
    open: number;
    inProgress: number;
    closed: number;
  };
}

export interface IndexedEvent {
  id: string;
  title: string | null;
  transcriptText: string | null;
  eventType: string | null;
  severity: string | null;
  description: string | null;
  notes: string | null;
  location: string | null;
  tradeVendor: string | null;
  createdAt: string;
  isResolved: boolean | null;
  // Checklist status fields
  itemStatus: 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | null;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  project: {
    id: string;
    name: string;
  } | null;
  index: EventIndex | null;
  // Schema data (for punch lists/RFIs)
  schemaData?: {
    schemaId: string;
    fieldValues: Record<string, string | null>;
    extractionConfidence?: number | null;
    generatedPdfPath?: string | null;
    schema?: {
      documentType?: string;
      name?: string;
    };
  } | null;
  // Comments (when fetched with include)
  comments?: EventCommentData[];
}

export interface IndexStats {
  totalIndexed: number;
  needsFollowUp: number;
  withCostImpact: number;
  totalCostImpact: number;
  topInspectors: { name: string; count: number }[];
  topTrades: { name: string; count: number }[];
  topIssueTypes: { name: string; count: number }[];
  topAHJ: { name: string; count: number }[];
  topSystems: { name: string; count: number }[];
}

export interface FollowUpEvent {
  id: string;
  title: string | null;
  transcriptText: string | null;
  severity: string | null;
  createdAt: string;
  project: {
    id: string;
    name: string;
  } | null;
  followUpReason: string | null;
  costImpact: number | null;
  issueTypes: string[] | null;
}

export interface SearchFilters {
  inspector?: string;
  trade?: string;
  material?: string;
  issue_type?: string;
  location?: string;
  ahj?: string;
  system?: string;
  needs_follow_up?: boolean;
  has_cost_impact?: boolean;
  min_cost?: number;
  max_cost?: number;
  project_id?: string;
  limit?: number;
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Generic fetch wrapper with error handling and auth
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Add auth token if available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized - auto logout
  if (response.status === 401) {
    useAuthStore.getState().logout();
    throw new Error('Session expired. Please login again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Search events by indexed keywords
 */
export async function searchEventsByKeywords(
  filters: SearchFilters
): Promise<{ count: number; filters: SearchFilters; results: IndexedEvent[] }> {
  const params = new URLSearchParams();

  if (filters.inspector) params.append('inspector', filters.inspector);
  if (filters.trade) params.append('trade', filters.trade);
  if (filters.material) params.append('material', filters.material);
  if (filters.issue_type) params.append('issue_type', filters.issue_type);
  if (filters.location) params.append('location', filters.location);
  if (filters.ahj) params.append('ahj', filters.ahj);
  if (filters.system) params.append('system', filters.system);
  if (filters.needs_follow_up !== undefined) {
    params.append('needs_follow_up', String(filters.needs_follow_up));
  }
  if (filters.has_cost_impact) params.append('has_cost_impact', 'true');
  if (filters.min_cost !== undefined) params.append('min_cost', String(filters.min_cost));
  if (filters.max_cost !== undefined) params.append('max_cost', String(filters.max_cost));
  if (filters.project_id) params.append('project_id', filters.project_id);
  if (filters.limit) params.append('limit', String(filters.limit));

  const query = params.toString();
  return apiFetch(`/api/events/indexed/search${query ? `?${query}` : ''}`);
}

/**
 * Get all events that need follow-up
 */
export async function getFollowUpEvents(options: {
  project_id?: string;
  include_resolved?: boolean;
  limit?: number;
} = {}): Promise<{ count: number; results: FollowUpEvent[] }> {
  const params = new URLSearchParams();

  if (options.project_id) params.append('project_id', options.project_id);
  if (options.include_resolved) params.append('include_resolved', 'true');
  if (options.limit) params.append('limit', String(options.limit));

  const query = params.toString();
  return apiFetch(`/api/events/indexed/follow-ups${query ? `?${query}` : ''}`);
}

/**
 * Get aggregated statistics from indexed events
 */
export async function getIndexStats(projectId?: string): Promise<IndexStats> {
  const query = projectId ? `?project_id=${projectId}` : '';
  return apiFetch(`/api/events/indexed/stats${query}`);
}

/**
 * Re-index all events (admin operation)
 */
export async function reindexAllEvents(): Promise<{
  message: string;
  indexed: number;
  errors: number;
  total: number;
}> {
  return apiFetch('/api/events/indexed/reindex', { method: 'POST' });
}

/**
 * Index a single event
 */
export async function indexEvent(eventId: string): Promise<{
  message: string;
  index: EventIndex;
}> {
  return apiFetch(`/api/events/${eventId}/index`, { method: 'POST' });
}

/**
 * Get the index for a specific event
 */
export async function getEventIndex(eventId: string): Promise<{
  eventId: string;
  title: string | null;
  project: { id: string; name: string } | null;
  index: EventIndex | null;
  isIndexed: boolean;
}> {
  return apiFetch(`/api/events/${eventId}/index`);
}

/**
 * Update follow-up status for an event
 */
export async function updateEventFollowUp(
  eventId: string,
  data: {
    needs_follow_up?: boolean;
    follow_up_reason?: string;
    follow_up_due_date?: string | null;
  }
): Promise<{ message: string; index: EventIndex }> {
  return apiFetch(`/api/events/${eventId}/follow-up`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Get all events (basic list)
 */
export async function getEvents(filters: {
  project_id?: string;
  event_type?: string;
  severity?: string;
  is_resolved?: boolean;
  limit?: number;
} = {}): Promise<IndexedEvent[]> {
  const params = new URLSearchParams();

  if (filters.project_id) params.append('project_id', filters.project_id);
  if (filters.event_type) params.append('event_type', filters.event_type);
  if (filters.severity) params.append('severity', filters.severity);
  if (filters.is_resolved !== undefined) {
    params.append('is_resolved', String(filters.is_resolved));
  }
  if (filters.limit) params.append('limit', String(filters.limit));

  const query = params.toString();
  return apiFetch(`/api/events${query ? `?${query}` : ''}`);
}

/**
 * Full-text search events
 */
export async function searchEvents(
  query: string,
  filters: {
    project_id?: string;
    event_type?: string;
    severity?: string;
    limit?: number;
  } = {}
): Promise<{
  query: string;
  count: number;
  results: IndexedEvent[];
}> {
  const params = new URLSearchParams();
  params.append('q', query);

  if (filters.project_id) params.append('project_id', filters.project_id);
  if (filters.event_type) params.append('event_type', filters.event_type);
  if (filters.severity) params.append('severity', filters.severity);
  if (filters.limit) params.append('limit', String(filters.limit));

  return apiFetch(`/api/events/search?${params.toString()}`);
}

/**
 * Find similar events
 */
export async function findSimilarEvents(
  eventIdOrText: string,
  isText: boolean = false,
  projectId?: string,
  limit: number = 5
): Promise<{
  sourceEventId: string | null;
  sourceText: string | null;
  count: number;
  similarEvents: IndexedEvent[];
}> {
  const body = isText
    ? { text: eventIdOrText, project_id: projectId, limit }
    : { event_id: eventIdOrText, limit };

  return apiFetch('/api/events/find-similar', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ============================================
// REACT QUERY HOOKS HELPERS
// ============================================

// ============================================
// DAILY LOG TYPES
// ============================================

export interface DailyLogSummary {
  id: string;
  projectId: string;
  date: string;
  preparedBy: string | null;
  status: string | null;
  dailyTotalsWorkers: number | null;
  dailyTotalsHours: number | null;
  weather: {
    conditions?: string;
    temperature?: number;
    weather_delay?: boolean;
  } | null;
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    name: string;
    number: string | null;
  } | null;
  _count: {
    tasks: number;
    pendingIssues: number;
    inspectionNotes: number;
  };
}

export interface DailyLogDetail extends DailyLogSummary {
  tasks: {
    id: string;
    companyName: string | null;
    workers: number | null;
    hours: number | null;
    taskDescription: string | null;
    notes: string | null;
  }[];
  visitors: {
    id: string;
    time: string | null;
    companyName: string | null;
    visitorName: string | null;
    notes: string | null;
  }[];
  equipment: {
    id: string;
    equipmentType: string | null;
    quantity: number | null;
    hours: number | null;
    notes: string | null;
  }[];
  materials: {
    id: string;
    material: string | null;
    quantity: number | null;
    unit: string | null;
    supplier: string | null;
    notes: string | null;
  }[];
  pendingIssues: {
    id: string;
    title: string | null;
    description: string | null;
    category: string | null;
    severity: string | null;
    assignee: string | null;
    dueDate: string | null;
    externalEntity: string | null;
    location: string | null;
  }[];
  inspectionNotes: {
    id: string;
    inspectorName: string | null;
    ahj: string | null;
    inspectionType: string | null;
    result: string | null;
    notes: string | null;
    followUpNeeded: boolean | null;
  }[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  number: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// DAILY LOG API FUNCTIONS
// ============================================

/**
 * Get list of daily logs
 */
export async function getDailyLogs(filters: {
  project_id?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
} = {}): Promise<DailyLogSummary[]> {
  const params = new URLSearchParams();

  if (filters.project_id) params.append('project_id', filters.project_id);
  if (filters.status) params.append('status', filters.status);
  if (filters.start_date) params.append('start_date', filters.start_date);
  if (filters.end_date) params.append('end_date', filters.end_date);
  if (filters.limit) params.append('limit', String(filters.limit));

  const query = params.toString();
  return apiFetch(`/api/daily-logs${query ? `?${query}` : ''}`);
}

/**
 * Get a single daily log with all details
 */
export async function getDailyLog(id: string): Promise<DailyLogDetail> {
  return apiFetch(`/api/daily-logs/${id}`);
}

/**
 * Get PDF download URL for a daily log (raw URL without auth - use fetchDailyLogPdf instead)
 */
export function getDailyLogPdfUrl(id: string): string {
  return `${API_BASE_URL}/api/reports/daily-log/${id}`;
}

/**
 * Get PDF preview URL for a daily log (raw URL without auth - use fetchDailyLogPdf instead)
 */
export function getDailyLogPdfPreviewUrl(id: string): string {
  return `${API_BASE_URL}/api/reports/daily-log/${id}/preview`;
}

/**
 * Fetch PDF with authentication and return blob URL (web) or file path (native)
 * This properly handles auth for PDF downloads across platforms
 */
export async function fetchDailyLogPdf(id: string, preview: boolean = false): Promise<string> {
  const endpoint = preview
    ? `/api/reports/daily-log/${id}/preview`
    : `/api/reports/daily-log/${id}`;

  const url = `${API_BASE_URL}${endpoint}`;
  const token = getAuthToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (Platform.OS === 'web') {
    // Web: Use blob URL
    const response = await fetch(url, { headers });

    if (response.status === 401) {
      useAuthStore.getState().logout();
      throw new Error('Session expired. Please login again.');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `Failed to fetch PDF: ${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } else {
    // Native (iOS/Android): Download to file system
    const filename = `daily-log-${id}${preview ? '-preview' : ''}.pdf`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;

    const downloadResult = await FileSystem.downloadAsync(url, fileUri, {
      headers,
    });

    if (downloadResult.status !== 200) {
      if (downloadResult.status === 401) {
        useAuthStore.getState().logout();
        throw new Error('Session expired. Please login again.');
      }
      throw new Error(`Failed to fetch PDF: ${downloadResult.status}`);
    }

    return downloadResult.uri;
  }
}

/**
 * Get list of projects
 */
export async function getProjects(limit: number = 100): Promise<ProjectSummary[]> {
  return apiFetch(`/api/projects?limit=${limit}`);
}

/**
 * Get a single project
 */
export async function getProject(id: string): Promise<ProjectSummary> {
  return apiFetch(`/api/projects/${id}`);
}

// ============================================
// CREATE/UPDATE API FUNCTIONS
// ============================================

/**
 * Create a new project
 */
export async function createProject(data: {
  id?: string; // Client-provided ID for local-first sync
  name: string;
  number?: string;
  address?: string;
}): Promise<ProjectSummary> {
  return apiFetch('/api/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a project and all associated daily logs
 */
export async function deleteProjectApi(id: string): Promise<void> {
  await apiFetch(`/api/projects/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Create a new daily log with nested data
 */
export async function createDailyLog(data: {
  id?: string; // Client-provided ID for local-first sync
  projectId: string;
  date: string;
  preparedBy?: string;
  status?: string;
  weather?: Record<string, unknown>;
  dailyTotalsWorkers?: number;
  dailyTotalsHours?: number;
  transcript?: string; // Raw transcript for AI parsing
  tasks?: Array<{
    company_name?: string;
    workers?: number;
    hours?: number;
    task_description?: string;
    notes?: string;
  }>;
  pending_issues?: Array<{
    title?: string;
    description?: string;
    category?: string;
    severity?: string;
    location?: string;
  }>;
  inspection_notes?: Array<{
    inspection_type?: string;
    inspector_name?: string;
    result?: string;
    notes?: string;
    follow_up_needed?: boolean;
  }>;
  materials?: Array<{
    material?: string;
    quantity?: number;
    unit?: string;
    supplier?: string;
    notes?: string;
  }>;
  equipment?: Array<{
    equipment_type?: string;
    quantity?: number;
    hours?: number;
    notes?: string;
  }>;
  visitors?: Array<{
    visitor_name?: string;
    company_name?: string;
    time?: string;
    notes?: string;
  }>;
}): Promise<DailyLogDetail> {
  // Fix timezone issue: append T12:00:00 to date to ensure it's treated as noon local time
  // This prevents the date from shifting when converted to UTC
  const dateWithTime = data.date.includes('T') ? data.date : `${data.date}T12:00:00`;

  return apiFetch('/api/daily-logs', {
    method: 'POST',
    body: JSON.stringify({
      id: data.id, // Client-provided ID for local-first sync
      project_id: data.projectId,
      date: dateWithTime,
      prepared_by: data.preparedBy,
      status: data.status,
      weather: data.weather,
      daily_totals_workers: data.dailyTotalsWorkers,
      daily_totals_hours: data.dailyTotalsHours,
      transcript: data.transcript, // Send transcript for AI parsing
      tasks: data.tasks,
      pending_issues: data.pending_issues,
      inspection_notes: data.inspection_notes,
      materials: data.materials,
      equipment: data.equipment,
      visitors: data.visitors,
    }),
  });
}

/**
 * Update a daily log
 */
export async function updateDailyLogApi(
  id: string,
  data: {
    preparedBy?: string;
    status?: string;
    weather?: Record<string, unknown>;
    dailyTotalsWorkers?: number;
    dailyTotalsHours?: number;
  }
): Promise<DailyLogDetail> {
  return apiFetch(`/api/daily-logs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      prepared_by: data.preparedBy,
      status: data.status,
      weather: data.weather,
      daily_totals_workers: data.dailyTotalsWorkers,
      daily_totals_hours: data.dailyTotalsHours,
    }),
  });
}

/**
 * Delete a daily log and all associated data
 */
export async function deleteDailyLogApi(id: string): Promise<void> {
  await apiFetch(`/api/daily-logs/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Create a daily log from transcript using AI parsing
 * This sends the raw transcript to the backend for AI-powered parsing
 */
export async function createDailyLogFromTranscript(data: {
  id?: string; // Client-provided ID for local-first sync
  projectId: string;
  transcript: string;
  date?: string;
  preparedBy?: string;
}): Promise<DailyLogDetail> {
  // Fix timezone issue: append T12:00:00 to date
  const dateWithTime = data.date
    ? (data.date.includes('T') ? data.date : `${data.date}T12:00:00`)
    : undefined;

  return apiFetch('/api/daily-logs/from-transcript', {
    method: 'POST',
    body: JSON.stringify({
      id: data.id, // Client-provided ID for local-first sync
      project_id: data.projectId,
      transcript: data.transcript,
      date: dateWithTime,
      prepared_by: data.preparedBy,
    }),
  });
}

/**
 * Create a new event
 */
export async function createEvent(data: {
  id?: string; // Client-provided ID for local-first sync
  projectId: string;
  title?: string;
  transcriptText?: string;
  eventType?: string;
  severity?: string;
  description?: string;
  notes?: string;
  location?: string;
  tradeVendor?: string;
  isResolved?: boolean;
}): Promise<IndexedEvent> {
  return apiFetch('/api/events', {
    method: 'POST',
    body: JSON.stringify({
      id: data.id, // Client-provided ID for local-first sync
      project_id: data.projectId,
      title: data.title,
      transcript_text: data.transcriptText,
      event_type: data.eventType,
      severity: data.severity,
      description: data.description,
      notes: data.notes,
      location: data.location,
      trade_vendor: data.tradeVendor,
      is_resolved: data.isResolved,
    }),
  });
}

/**
 * Update an event
 */
export async function updateEventApi(
  id: string,
  data: {
    title?: string;
    transcriptText?: string;
    eventType?: string;
    severity?: string;
    description?: string;
    notes?: string;
    location?: string;
    tradeVendor?: string;
    isResolved?: boolean;
  }
): Promise<IndexedEvent> {
  return apiFetch(`/api/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: data.title,
      transcript_text: data.transcriptText,
      event_type: data.eventType,
      severity: data.severity,
      description: data.description,
      notes: data.notes,
      location: data.location,
      trade_vendor: data.tradeVendor,
      is_resolved: data.isResolved,
    }),
  });
}

/**
 * Delete an event
 */
export async function deleteEventApi(id: string): Promise<void> {
  return apiFetch(`/api/events/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Add a task to a daily log
 */
export async function addTaskApi(
  dailyLogId: string,
  data: {
    companyName?: string;
    workers?: number;
    hours?: number;
    taskDescription?: string;
    notes?: string;
  }
): Promise<{ id: string }> {
  return apiFetch(`/api/daily-logs/${dailyLogId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({
      company_name: data.companyName,
      workers: data.workers,
      hours: data.hours,
      task_description: data.taskDescription,
      notes: data.notes,
    }),
  });
}

/**
 * Add a pending issue to a daily log
 */
export async function addPendingIssueApi(
  dailyLogId: string,
  data: {
    title?: string;
    description?: string;
    category?: string;
    severity?: string;
    assignee?: string;
    location?: string;
  }
): Promise<{ id: string }> {
  return apiFetch(`/api/daily-logs/${dailyLogId}/pending-issues`, {
    method: 'POST',
    body: JSON.stringify({
      title: data.title,
      description: data.description,
      category: data.category,
      severity: data.severity,
      assignee: data.assignee,
      location: data.location,
    }),
  });
}

// ============================================
// NESTED ITEM CRUD FUNCTIONS
// ============================================

// Tasks
export async function updateTaskApi(
  dailyLogId: string,
  taskId: string,
  data: {
    companyName?: string;
    workers?: number;
    hours?: number;
    taskDescription?: string;
    notes?: string;
  }
): Promise<{ id: string }> {
  return apiFetch(`/api/daily-logs/${dailyLogId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      company_name: data.companyName,
      workers: data.workers,
      hours: data.hours,
      task_description: data.taskDescription,
      notes: data.notes,
    }),
  });
}

export async function deleteTaskApi(dailyLogId: string, taskId: string): Promise<void> {
  await apiFetch(`/api/daily-logs/${dailyLogId}/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

// Pending Issues
export async function updatePendingIssueApi(
  dailyLogId: string,
  issueId: string,
  data: {
    title?: string;
    description?: string;
    category?: string;
    severity?: string;
    assignee?: string;
    location?: string;
  }
): Promise<{ id: string }> {
  return apiFetch(`/api/daily-logs/${dailyLogId}/pending-issues/${issueId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: data.title,
      description: data.description,
      category: data.category,
      severity: data.severity,
      assignee: data.assignee,
      location: data.location,
    }),
  });
}

export async function deletePendingIssueApi(dailyLogId: string, issueId: string): Promise<void> {
  await apiFetch(`/api/daily-logs/${dailyLogId}/pending-issues/${issueId}`, {
    method: 'DELETE',
  });
}

// Visitors
export async function addVisitorApi(
  dailyLogId: string,
  data: {
    time?: string;
    companyName?: string;
    visitorName?: string;
    notes?: string;
  }
): Promise<{ id: string }> {
  return apiFetch(`/api/daily-logs/${dailyLogId}/visitors`, {
    method: 'POST',
    body: JSON.stringify({
      time: data.time,
      company_name: data.companyName,
      visitor_name: data.visitorName,
      notes: data.notes,
    }),
  });
}

export async function updateVisitorApi(
  dailyLogId: string,
  visitorId: string,
  data: {
    time?: string;
    companyName?: string;
    visitorName?: string;
    notes?: string;
  }
): Promise<{ id: string }> {
  return apiFetch(`/api/daily-logs/${dailyLogId}/visitors/${visitorId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      time: data.time,
      company_name: data.companyName,
      visitor_name: data.visitorName,
      notes: data.notes,
    }),
  });
}

export async function deleteVisitorApi(dailyLogId: string, visitorId: string): Promise<void> {
  await apiFetch(`/api/daily-logs/${dailyLogId}/visitors/${visitorId}`, {
    method: 'DELETE',
  });
}

// Equipment
export async function addEquipmentApi(
  dailyLogId: string,
  data: {
    equipmentType?: string;
    quantity?: number;
    hours?: number;
    notes?: string;
  }
): Promise<{ id: string }> {
  return apiFetch(`/api/daily-logs/${dailyLogId}/equipment`, {
    method: 'POST',
    body: JSON.stringify({
      equipment_type: data.equipmentType,
      quantity: data.quantity,
      hours: data.hours,
      notes: data.notes,
    }),
  });
}

export async function updateEquipmentApi(
  dailyLogId: string,
  equipmentId: string,
  data: {
    equipmentType?: string;
    quantity?: number;
    hours?: number;
    notes?: string;
  }
): Promise<{ id: string }> {
  return apiFetch(`/api/daily-logs/${dailyLogId}/equipment/${equipmentId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      equipment_type: data.equipmentType,
      quantity: data.quantity,
      hours: data.hours,
      notes: data.notes,
    }),
  });
}

export async function deleteEquipmentApi(dailyLogId: string, equipmentId: string): Promise<void> {
  await apiFetch(`/api/daily-logs/${dailyLogId}/equipment/${equipmentId}`, {
    method: 'DELETE',
  });
}

// Materials
export async function addMaterialApi(
  dailyLogId: string,
  data: {
    material?: string;
    quantity?: number;
    unit?: string;
    supplier?: string;
    notes?: string;
  }
): Promise<{ id: string }> {
  return apiFetch(`/api/daily-logs/${dailyLogId}/materials`, {
    method: 'POST',
    body: JSON.stringify({
      material: data.material,
      quantity: data.quantity,
      unit: data.unit,
      supplier: data.supplier,
      notes: data.notes,
    }),
  });
}

export async function updateMaterialApi(
  dailyLogId: string,
  materialId: string,
  data: {
    material?: string;
    quantity?: number;
    unit?: string;
    supplier?: string;
    notes?: string;
  }
): Promise<{ id: string }> {
  return apiFetch(`/api/daily-logs/${dailyLogId}/materials/${materialId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      material: data.material,
      quantity: data.quantity,
      unit: data.unit,
      supplier: data.supplier,
      notes: data.notes,
    }),
  });
}

export async function deleteMaterialApi(dailyLogId: string, materialId: string): Promise<void> {
  await apiFetch(`/api/daily-logs/${dailyLogId}/materials/${materialId}`, {
    method: 'DELETE',
  });
}

// Inspection Notes
export async function addInspectionNoteApi(
  dailyLogId: string,
  data: {
    inspectorName?: string;
    ahj?: string;
    inspectionType?: string;
    result?: string;
    notes?: string;
    followUpNeeded?: boolean;
  }
): Promise<{ id: string }> {
  return apiFetch(`/api/daily-logs/${dailyLogId}/inspection-notes`, {
    method: 'POST',
    body: JSON.stringify({
      inspector_name: data.inspectorName,
      ahj: data.ahj,
      inspection_type: data.inspectionType,
      result: data.result,
      notes: data.notes,
      follow_up_needed: data.followUpNeeded,
    }),
  });
}

export async function updateInspectionNoteApi(
  dailyLogId: string,
  noteId: string,
  data: {
    inspectorName?: string;
    ahj?: string;
    inspectionType?: string;
    result?: string;
    notes?: string;
    followUpNeeded?: boolean;
  }
): Promise<{ id: string }> {
  return apiFetch(`/api/daily-logs/${dailyLogId}/inspection-notes/${noteId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      inspector_name: data.inspectorName,
      ahj: data.ahj,
      inspection_type: data.inspectionType,
      result: data.result,
      notes: data.notes,
      follow_up_needed: data.followUpNeeded,
    }),
  });
}

export async function deleteInspectionNoteApi(dailyLogId: string, noteId: string): Promise<void> {
  await apiFetch(`/api/daily-logs/${dailyLogId}/inspection-notes/${noteId}`, {
    method: 'DELETE',
  });
}

/**
 * Parse an event transcript using AI for intelligent extraction
 * Returns: title, event_type, severity, action_items, location, trade_vendor
 */
export interface ParsedEvent {
  success: boolean;
  title: string;
  event_type: string;
  severity: string;
  action_items: string[];
  location: string;
  trade_vendor: string;
  duration: string;
  summary: string;
}

export async function parseEventWithAI(
  transcript: string,
  projectName?: string
): Promise<ParsedEvent> {
  return apiFetch('/api/transcripts/parse-event', {
    method: 'POST',
    body: JSON.stringify({
      transcript,
      projectName,
    }),
  });
}

// ============================================
// INSIGHTS API (Unified Learning/Issue Tracking)
// ============================================

export interface Insight {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceType: 'event' | 'pending_issue' | 'inspection_note' | 'additional_work' | 'manual';
  sourceId: string | null;
  projectId: string;
  dailyLogId: string | null;
  dailyLogDate: string | null;
  title: string;
  description: string | null;
  rawText: string | null;
  category: 'issue' | 'learning' | 'observation' | 'safety' | 'quality' | 'cost_impact' | 'delay' | 'rework';
  severity: string | null;
  inspectors: string[] | null;
  trades: string[] | null;
  materials: string[] | null;
  issueTypes: string[] | null;
  locations: string[] | null;
  ahj: string[] | null;
  systems: string[] | null;
  costImpact: number | null;
  needsFollowUp: boolean;
  followUpReason: string | null;
  followUpDueDate: string | null;
  isResolved: boolean;
  resolvedAt: string | null;
  keywordsSummary: string | null;
  isTest: boolean;
  project: {
    id: string;
    name: string;
  } | null;
}

export interface InsightsStats {
  total: number;
  byCategory: { category: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
  bySourceType: { sourceType: string; count: number }[];
  needsFollowUp: number;
  unresolved: number;
  withCostImpact: number;
  totalCostImpact: number;
  topTrades: { name: string; count: number }[];
  topIssueTypes: { name: string; count: number }[];
  topSystems: { name: string; count: number }[];
}

export interface InsightSearchFilters {
  query?: string;
  projectId?: string;
  category?: string;
  severity?: string;
  sourceType?: string;
  needsFollowUp?: boolean;
  isResolved?: boolean;
  isTest?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

/**
 * Get insights with optional filters
 */
export async function getInsights(filters: InsightSearchFilters = {}): Promise<Insight[]> {
  const params = new URLSearchParams();

  if (filters.query) params.append('query', filters.query);
  if (filters.projectId) params.append('projectId', filters.projectId);
  if (filters.category) params.append('category', filters.category);
  if (filters.severity) params.append('severity', filters.severity);
  if (filters.sourceType) params.append('sourceType', filters.sourceType);
  if (filters.needsFollowUp !== undefined) params.append('needsFollowUp', String(filters.needsFollowUp));
  if (filters.isResolved !== undefined) params.append('isResolved', String(filters.isResolved));
  if (filters.isTest !== undefined) params.append('isTest', String(filters.isTest));
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.limit) params.append('limit', String(filters.limit));

  const query = params.toString();
  return apiFetch(`/api/insights${query ? `?${query}` : ''}`);
}

/**
 * Get insight by ID
 */
export async function getInsight(id: string): Promise<Insight> {
  return apiFetch(`/api/insights/${id}`);
}

/**
 * Get similar insights by insight ID (uses embeddings if available)
 */
export interface SimilarInsight {
  id: string;
  title: string;
  category: string;
  severity: string | null;
  sourceType: string;
  createdAt: string;
  project: { id: string; name: string } | null;
  similarity: number;
  trades?: string[];
  systems?: string[];
  issueTypes?: string[];
}

export async function getSimilarInsights(
  insightId: string,
  options: { limit?: number; includeTest?: boolean; crossProject?: boolean } = {}
): Promise<SimilarInsight[]> {
  const params = new URLSearchParams();
  if (options.limit) params.append('limit', String(options.limit));
  if (options.includeTest !== undefined) params.append('includeTest', String(options.includeTest));
  if (options.crossProject !== undefined) params.append('crossProject', String(options.crossProject));

  const query = params.toString();
  return apiFetch(`/api/insights/${insightId}/similar${query ? `?${query}` : ''}`);
}

/**
 * Get insights statistics
 */
export async function getInsightsStats(options: {
  projectId?: string;
  isTest?: boolean;
} = {}): Promise<InsightsStats> {
  const params = new URLSearchParams();
  if (options.projectId) params.append('projectId', options.projectId);
  if (options.isTest !== undefined) params.append('isTest', String(options.isTest));

  const query = params.toString();
  return apiFetch(`/api/insights/stats${query ? `?${query}` : ''}`);
}

/**
 * Find similar insights by text
 */
export async function findSimilarInsights(
  text: string,
  options: { projectId?: string; includeTest?: boolean; limit?: number } = {}
): Promise<{
  query: string;
  extracted: {
    inspectors: string[];
    trades: string[];
    materials: string[];
    issueTypes: string[];
    locations: string[];
    systems: string[];
  };
  results: (Insight & { similarityScore: number })[];
}> {
  return apiFetch('/api/insights/find-similar-by-text', {
    method: 'POST',
    body: JSON.stringify({
      text,
      projectId: options.projectId,
      includeTest: options.includeTest,
      limit: options.limit,
    }),
  });
}

/**
 * Natural language query for insights
 * Example: "create a list of all items for next building inspection"
 */
export interface NLQueryResult {
  originalQuery: string;
  parsed: {
    intent: string;
    category: string;
    timeFrame: string;
    dateValue?: string;
    trades: string[];
    systems: string[];
    locations: string[];
    status: string;
    keywords: string[];
    outputFormat: string;
  };
  filters: Record<string, unknown>;
  results: Insight[];
  summary: string;
  formatted?: string;
}

export async function queryInsights(
  query: string,
  options: { projectId?: string; includeTest?: boolean; format?: 'list' | 'checklist' } = {}
): Promise<NLQueryResult> {
  return apiFetch('/api/insights/query', {
    method: 'POST',
    body: JSON.stringify({
      query,
      projectId: options.projectId,
      includeTest: options.includeTest,
      format: options.format || 'list',
    }),
  });
}

/**
 * Index all daily log items into insights
 */
export async function indexAllInsights(isTest: boolean = false): Promise<{
  success: boolean;
  message: string;
  results: {
    pendingIssues: { indexed: number; errors: number };
    inspectionNotes: { indexed: number; errors: number };
    events: { indexed: number; errors: number };
  };
}> {
  return apiFetch('/api/insights/index-all', {
    method: 'POST',
    body: JSON.stringify({ isTest }),
  });
}

/**
 * Update an insight
 */
export async function updateInsight(
  id: string,
  data: {
    isResolved?: boolean;
    needsFollowUp?: boolean;
    followUpReason?: string;
    followUpDueDate?: string | null;
    severity?: string;
    category?: string;
  }
): Promise<Insight> {
  return apiFetch(`/api/insights/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Clear all test insights data
 */
export async function clearTestInsights(): Promise<{
  success: boolean;
  message: string;
  insights: number;
  patterns: number;
}> {
  return apiFetch('/api/insights/test-data', { method: 'DELETE' });
}

/**
 * Export insights as PDF with filters
 * Returns a blob URL for download/share
 */
export async function fetchInsightsExportPdf(filters: {
  projectId?: string;
  category?: string;
  sourceType?: string;
  trade?: string;
  issueType?: string;
  system?: string;
  severity?: string;
  isResolved?: boolean;
  needsFollowUp?: boolean;
} = {}): Promise<string> {
  const params = new URLSearchParams();
  params.append('format', 'pdf');

  if (filters.projectId) params.append('projectId', filters.projectId);
  if (filters.category) params.append('category', filters.category);
  if (filters.sourceType) params.append('sourceType', filters.sourceType);
  if (filters.trade) params.append('trade', filters.trade);
  if (filters.issueType) params.append('issueType', filters.issueType);
  if (filters.system) params.append('system', filters.system);
  if (filters.severity) params.append('severity', filters.severity);
  if (filters.isResolved !== undefined) params.append('isResolved', String(filters.isResolved));
  if (filters.needsFollowUp !== undefined) params.append('needsFollowUp', String(filters.needsFollowUp));

  const url = `${API_BASE_URL}/api/insights/export?${params.toString()}`;
  const token = getAuthToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (Platform.OS === 'web') {
    const response = await fetch(url, { headers });

    if (response.status === 401) {
      useAuthStore.getState().logout();
      throw new Error('Session expired. Please login again.');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `Failed to export PDF: ${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } else {
    // Native (iOS/Android): Download to file system
    const filename = `insights-export-${Date.now()}.pdf`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;

    const downloadResult = await FileSystem.downloadAsync(url, fileUri, {
      headers,
    });

    if (downloadResult.status === 401) {
      useAuthStore.getState().logout();
      throw new Error('Session expired. Please login again.');
    }

    if (downloadResult.status !== 200) {
      throw new Error(`Failed to export PDF: ${downloadResult.status}`);
    }

    return downloadResult.uri;
  }
}

/**
 * Get a single event from backend by ID
 */
export async function getEvent(id: string): Promise<IndexedEvent> {
  return apiFetch(`/api/events/${id}`);
}

// ============================================
// PDF TEMPLATES API
// ============================================

/**
 * Get all active PDF templates
 * @param options.projectId - If provided, gets project-specific templates + admin defaults as fallback
 * @param options.adminOnly - If true, only returns admin/default templates
 */
export async function getTemplates(options?: {
  projectId?: string;
  adminOnly?: boolean;
}): Promise<PdfTemplate[]> {
  const params = new URLSearchParams();
  if (options?.projectId) params.append('projectId', options.projectId);
  if (options?.adminOnly) params.append('adminOnly', 'true');

  const queryString = params.toString();
  return apiFetch(`/api/templates${queryString ? `?${queryString}` : ''}`);
}

/**
 * Get project-specific templates only (not including admin defaults)
 */
export async function getProjectTemplates(projectId: string): Promise<PdfTemplate[]> {
  return apiFetch(`/api/templates/project/${projectId}`);
}

/**
 * Get a single template by ID
 */
export async function getTemplate(id: string): Promise<PdfTemplate> {
  return apiFetch(`/api/templates/${id}`);
}

/**
 * Upload a new PDF template
 * @param data.projectId - Optional project ID to make this a project-specific template
 */
export async function uploadTemplate(
  file: File,
  data: {
    name: string;
    description?: string;
    templateType: TemplateType;
    projectId?: string;
  }
): Promise<PdfTemplate> {
  const formData = new FormData();
  formData.append('pdf', file);
  formData.append('name', data.name);
  if (data.description) formData.append('description', data.description);
  formData.append('templateType', data.templateType);
  if (data.projectId) formData.append('projectId', data.projectId);

  const url = `${API_BASE_URL}/api/templates`;
  const token = getAuthToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    throw new Error('Session expired. Please login again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || `Upload failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Update a template
 */
export async function updateTemplate(
  id: string,
  file: File | null,
  data: {
    name?: string;
    description?: string;
    templateType?: TemplateType;
  }
): Promise<PdfTemplate> {
  const formData = new FormData();
  if (file) formData.append('pdf', file);
  if (data.name) formData.append('name', data.name);
  if (data.description !== undefined) formData.append('description', data.description);
  if (data.templateType) formData.append('templateType', data.templateType);

  const url = `${API_BASE_URL}/api/templates/${id}`;
  const token = getAuthToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body: formData,
  });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    throw new Error('Session expired. Please login again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || `Update failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Delete a template (soft delete)
 */
export async function deleteTemplate(id: string): Promise<void> {
  await apiFetch(`/api/templates/${id}`, { method: 'DELETE' });
}

/**
 * Get template download URL
 */
export function getTemplateDownloadUrl(id: string): string {
  return `${API_BASE_URL}/api/templates/${id}/download`;
}

/**
 * Attach a template to an event
 */
export async function attachTemplateToEvent(
  eventId: string,
  templateId: string
): Promise<IndexedEvent> {
  return apiFetch(`/api/events/${eventId}/template`, {
    method: 'POST',
    body: JSON.stringify({ templateId }),
  });
}

/**
 * Get event template data
 */
export async function getEventTemplateData(eventId: string): Promise<EventTemplateData> {
  return apiFetch(`/api/events/${eventId}/template-data`);
}

/**
 * Update event template field values
 */
export async function updateEventTemplateData(
  eventId: string,
  templateId: string,
  fieldValues: Record<string, string | boolean>
): Promise<{ filledPath: string; fieldValues: Record<string, string | boolean> }> {
  return apiFetch(`/api/events/${eventId}/template-data`, {
    method: 'PATCH',
    body: JSON.stringify({ templateId, fieldValues }),
  });
}

/**
 * Get filled PDF download URL for an event
 */
export function getFilledPdfUrl(eventId: string): string {
  return `${API_BASE_URL}/api/events/${eventId}/filled-pdf`;
}

/**
 * Download filled PDF with auth
 */
export async function fetchFilledPdf(eventId: string): Promise<string> {
  const url = `${API_BASE_URL}/api/events/${eventId}/filled-pdf`;
  const token = getAuthToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (Platform.OS === 'web') {
    const response = await fetch(url, { headers });

    if (response.status === 401) {
      useAuthStore.getState().logout();
      throw new Error('Session expired. Please login again.');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `Failed to fetch PDF: ${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } else {
    // Native (iOS/Android): Download to file system
    const filename = `filled-${eventId}.pdf`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;

    const downloadResult = await FileSystem.downloadAsync(url, fileUri, {
      headers,
    });

    if (downloadResult.status === 401) {
      useAuthStore.getState().logout();
      throw new Error('Session expired. Please login again.');
    }

    if (downloadResult.status !== 200) {
      throw new Error(`Failed to fetch PDF: ${downloadResult.status}`);
    }

    return downloadResult.uri;
  }
}

// ============================================
// DOCUMENT SCHEMAS API (AI-Learned Schemas)
// ============================================

export interface AnalyzeDocumentResult {
  message: string;
  fileName: string;
  extractedTextLength: number;
  schema: {
    documentName: string;
    description: string;
    fields: SchemaField[];
    sections?: string[];
    confidence: number;
  };
}

export interface LearnSchemaResult {
  message: string;
  schema: DocumentSchema;
}

/**
 * Get all document schemas
 */
export async function getDocumentSchemas(options?: {
  projectId?: string;
  type?: SchemaDocumentType;
}): Promise<DocumentSchema[]> {
  const params = new URLSearchParams();
  if (options?.projectId) params.append('projectId', options.projectId);
  if (options?.type) params.append('type', options.type);

  const query = params.toString();
  return apiFetch(`/api/document-schemas${query ? `?${query}` : ''}`);
}

/**
 * Get a single document schema by ID
 */
export async function getDocumentSchema(id: string): Promise<DocumentSchema> {
  return apiFetch(`/api/document-schemas/${id}`);
}

/**
 * Learn schema from uploaded document (with AI analysis)
 */
export async function learnDocumentSchema(
  file: File,
  data: {
    name?: string;
    documentType: SchemaDocumentType;
    projectId?: string;
    description?: string;
  }
): Promise<LearnSchemaResult> {
  const formData = new FormData();
  formData.append('document', file);
  if (data.name) formData.append('name', data.name);
  formData.append('documentType', data.documentType);
  if (data.projectId) formData.append('projectId', data.projectId);
  if (data.description) formData.append('description', data.description);

  const url = `${API_BASE_URL}/api/document-schemas`;
  const token = getAuthToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    throw new Error('Session expired. Please login again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || error.details || `Upload failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Analyze document without saving (preview)
 */
export async function analyzeDocument(
  file: File,
  documentType?: SchemaDocumentType
): Promise<AnalyzeDocumentResult> {
  const formData = new FormData();
  formData.append('document', file);
  if (documentType) formData.append('documentType', documentType);

  const url = `${API_BASE_URL}/api/document-schemas/analyze`;
  const token = getAuthToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    throw new Error('Session expired. Please login again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || error.details || `Analysis failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Update a document schema
 */
export async function updateDocumentSchema(
  id: string,
  data: {
    name?: string;
    description?: string;
    fields?: SchemaField[];
    isActive?: boolean;
  }
): Promise<{ message: string; schema: DocumentSchema }> {
  return apiFetch(`/api/document-schemas/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a document schema (soft delete)
 */
export async function deleteDocumentSchema(id: string): Promise<void> {
  await apiFetch(`/api/document-schemas/${id}`, { method: 'DELETE' });
}

// ============================================
// EVENT SCHEMA DATA API (Apply to Document)
// ============================================

export interface ApplySchemaResult {
  message: string;
  schemaData: EventSchemaData & {
    extractionNotes?: string | null;
  };
}

/**
 * Apply a document schema to an event - AI extracts fields from transcript
 */
export async function applySchemaToEvent(
  eventId: string,
  schemaId: string
): Promise<ApplySchemaResult> {
  return apiFetch(`/api/events/${eventId}/apply-schema`, {
    method: 'POST',
    body: JSON.stringify({ schemaId }),
  });
}

/**
 * Get schema data for an event
 */
export async function getEventSchemaData(eventId: string): Promise<EventSchemaData> {
  return apiFetch(`/api/events/${eventId}/schema-data`);
}

/**
 * Update schema data field values (manual edit)
 */
export async function updateEventSchemaData(
  eventId: string,
  fieldValues: Record<string, string | null>
): Promise<{ message: string; schemaData: EventSchemaData }> {
  return apiFetch(`/api/events/${eventId}/schema-data`, {
    method: 'PATCH',
    body: JSON.stringify({ fieldValues }),
  });
}

/**
 * Remove schema data from event
 */
export async function removeEventSchemaData(eventId: string): Promise<{ message: string }> {
  return apiFetch(`/api/events/${eventId}/schema-data`, { method: 'DELETE' });
}

/**
 * Re-extract fields from transcript using same schema
 */
export async function reExtractSchemaData(
  eventId: string
): Promise<ApplySchemaResult> {
  return apiFetch(`/api/events/${eventId}/re-extract`, { method: 'POST' });
}

/**
 * Generate PDF from schema data
 */
export async function generateSchemaPdf(
  eventId: string
): Promise<{ message: string; fileName: string }> {
  return apiFetch(`/api/events/${eventId}/generate-pdf`, { method: 'POST' });
}

/**
 * Download generated PDF (returns blob URL on web, file path on native)
 */
export async function downloadSchemaPdf(eventId: string): Promise<string> {
  const token = getAuthToken();
  const url = `${API_BASE_URL}/api/events/${eventId}/download-pdf`;

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (Platform.OS === 'web') {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error('Failed to download PDF');
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } else {
    // Native (iOS/Android): Download to file system
    const filename = `schema-${eventId}.pdf`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;

    const downloadResult = await FileSystem.downloadAsync(url, fileUri, {
      headers,
    });

    if (downloadResult.status !== 200) {
      throw new Error(`Failed to download PDF: ${downloadResult.status}`);
    }

    return downloadResult.uri;
  }
}

// ============================================
// PHOTOS API
// ============================================

/**
 * Upload a photo for an event or daily log
 */
export async function uploadPhoto(
  file: File | Blob,
  data: {
    eventId?: string;
    dailyLogId?: string;
    caption?: string;
  }
): Promise<Photo> {
  if (!data.eventId && !data.dailyLogId) {
    throw new Error('Either eventId or dailyLogId is required');
  }

  const formData = new FormData();
  formData.append('photo', file);
  if (data.eventId) formData.append('event_id', data.eventId);
  if (data.dailyLogId) formData.append('daily_log_id', data.dailyLogId);
  if (data.caption) formData.append('caption', data.caption);

  const url = `${API_BASE_URL}/api/photos/upload`;
  const token = getAuthToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    throw new Error('Session expired. Please login again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || `Upload failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get photo metadata by ID
 */
export async function getPhoto(id: string): Promise<Photo> {
  return apiFetch(`/api/photos/${id}`);
}

/**
 * Get photo file URL (for display in img tag)
 */
export function getPhotoFileUrl(id: string): string {
  return `${API_BASE_URL}/api/photos/${id}/file`;
}

/**
 * Fetch photo file with authentication
 */
export async function fetchPhotoFile(id: string): Promise<string> {
  const url = `${API_BASE_URL}/api/photos/${id}/file`;
  const token = getAuthToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    throw new Error('Session expired. Please login again.');
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch photo: ${response.status}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Get all photos for an event
 */
export async function getEventPhotos(eventId: string): Promise<Photo[]> {
  return apiFetch(`/api/events/${eventId}/photos`);
}

/**
 * Get all photos for a daily log
 */
export async function getDailyLogPhotos(dailyLogId: string): Promise<Photo[]> {
  return apiFetch(`/api/daily-logs/${dailyLogId}/photos`);
}

/**
 * Update photo metadata (caption)
 */
export async function updatePhoto(
  id: string,
  data: { caption?: string }
): Promise<Photo> {
  return apiFetch(`/api/photos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a photo
 */
export async function deletePhoto(id: string): Promise<void> {
  await apiFetch(`/api/photos/${id}`, { method: 'DELETE' });
}

// ============================================
// CHECKLIST API (Punch Lists & RFIs)
// ============================================

/**
 * Get checklist items (punch lists and RFIs) with status filtering
 */
export async function getChecklistItems(
  filters: ChecklistFilters = {}
): Promise<ChecklistResponse> {
  const params = new URLSearchParams();

  if (filters.category) params.append('category', filters.category);
  if (filters.project_id) params.append('project_id', filters.project_id);
  if (filters.status) params.append('status', filters.status);
  if (filters.limit) params.append('limit', String(filters.limit));

  const query = params.toString();
  return apiFetch(`/api/events/checklist${query ? `?${query}` : ''}`);
}

/**
 * Update event status (OPEN, IN_PROGRESS, CLOSED)
 */
export async function updateEventStatus(
  eventId: string,
  data: {
    status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
    comment?: string;
    changedBy?: string;
  }
): Promise<{
  message: string;
  event: IndexedEvent;
  comment: EventCommentData | null;
}> {
  return apiFetch(`/api/events/${eventId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Get comments/revision history for an event
 */
export async function getEventComments(eventId: string): Promise<EventCommentData[]> {
  return apiFetch(`/api/events/${eventId}/comments`);
}

/**
 * Add a comment/follow-up to an event
 */
export async function addEventComment(
  eventId: string,
  data: {
    text: string;
    authorName?: string;
  }
): Promise<EventCommentData> {
  return apiFetch(`/api/events/${eventId}/comments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a comment
 */
export async function deleteEventComment(
  eventId: string,
  commentId: string
): Promise<void> {
  await apiFetch(`/api/events/${eventId}/comments/${commentId}`, {
    method: 'DELETE',
  });
}

export const queryKeys = {
  events: ['events'] as const,
  event: (id: string) => ['events', id] as const,
  eventSearch: (query: string) => ['events', 'search', query] as const,
  eventIndex: (eventId: string) => ['events', eventId, 'index'] as const,
  indexedSearch: (filters: SearchFilters) => ['events', 'indexed', 'search', filters] as const,
  followUps: (projectId?: string) => ['events', 'follow-ups', projectId] as const,
  indexStats: (projectId?: string) => ['events', 'stats', projectId] as const,
  similarEvents: (eventId: string) => ['events', eventId, 'similar'] as const,
  dailyLogs: (projectId?: string) => ['daily-logs', projectId] as const,
  dailyLog: (id: string) => ['daily-logs', id] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  insights: (filters?: InsightSearchFilters) => ['insights', filters] as const,
  insight: (id: string) => ['insights', id] as const,
  similarInsights: (id: string) => ['insights', id, 'similar'] as const,
  insightsStats: (projectId?: string, isTest?: boolean) => ['insights', 'stats', projectId, isTest] as const,
  templates: ['templates'] as const,
  template: (id: string) => ['templates', id] as const,
  eventTemplateData: (eventId: string) => ['events', eventId, 'template-data'] as const,
  documentSchemas: (options?: { projectId?: string; type?: SchemaDocumentType }) => ['document-schemas', options] as const,
  documentSchema: (id: string) => ['document-schemas', id] as const,
  eventSchemaData: (eventId: string) => ['events', eventId, 'schema-data'] as const,
  eventPhotos: (eventId: string) => ['events', eventId, 'photos'] as const,
  dailyLogPhotos: (dailyLogId: string) => ['daily-logs', dailyLogId, 'photos'] as const,
  photo: (id: string) => ['photos', id] as const,
  // Checklist/Comments queries
  checklist: (filters?: ChecklistFilters) => ['checklist', filters] as const,
  eventComments: (eventId: string) => ['events', eventId, 'comments'] as const,
};
