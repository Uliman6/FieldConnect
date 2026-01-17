// API service for backend communication
// Handles event indexing, search, and follow-up tracking

import NetInfo from '@react-native-community/netinfo';
import { getAuthToken, useAuthStore } from './auth-store';

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

export interface IndexedEvent {
  id: string;
  title: string | null;
  transcriptText: string | null;
  eventType: string | null;
  severity: string | null;
  createdAt: string;
  isResolved: boolean | null;
  project: {
    id: string;
    name: string;
  } | null;
  index: EventIndex | null;
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
 * Fetch PDF with authentication and return blob URL
 * This properly handles auth for PDF downloads
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
 * Create a new daily log with nested data
 */
export async function createDailyLog(data: {
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
  projectId: string;
  title?: string;
  transcriptText?: string;
  eventType?: string;
  severity?: string;
  notes?: string;
  location?: string;
  tradeVendor?: string;
  isResolved?: boolean;
}): Promise<IndexedEvent> {
  return apiFetch('/api/events', {
    method: 'POST',
    body: JSON.stringify({
      project_id: data.projectId,
      title: data.title,
      transcript_text: data.transcriptText,
      event_type: data.eventType,
      severity: data.severity,
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

export const queryKeys = {
  events: ['events'] as const,
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
};
