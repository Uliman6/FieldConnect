// Daily Log Types for Construction Job Site App

// Authentication Types
export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export type Severity = 'Low' | 'Medium' | 'High';
export type IssueCategory = 'Coordination' | 'Design' | 'QAQC' | 'Safety' | 'Schedule' | 'Procurement' | 'Inspection' | 'Other';
export type InspectionResult = 'Pass' | 'Fail' | 'Partial';
export type AdditionalWorkTag = 'owner_request' | 'design_ambiguity' | 'vendor_issue' | 'field_condition' | 'other';
export type SkyCondition = 'Clear' | 'Partly Cloudy' | 'Cloudy' | 'Overcast' | 'Rainy' | 'Stormy';

// Event Capture Types
export type EventType = 'Delay' | 'Quality' | 'Safety' | 'Inspection' | 'Material' | 'Equipment' | 'Coordination' | 'Trade Damage' | 'Other';
export type EventStatus = 'recorded' | 'uploaded' | 'transcribed';
export type EventSeverity = 'Low' | 'Medium' | 'High';

// Event for real-time voice capture
export interface Event {
  id: string;
  project_id: string;
  created_at: string;
  local_audio_uri: string;
  transcript_text: string | null;
  status: EventStatus;
  event_type: EventType;
  severity: EventSeverity;
  title: string;
  notes: string;
  description: string; // Clean, professional interpretation of the transcription
  // Optional fields
  location: string;
  trade_vendor: string;
  linked_daily_log_id: string | null;
  // Action items extracted from transcript
  action_items: string[];
  // Resolution tracking
  is_resolved: boolean;
  resolved_at: string | null;
  // Checklist status tracking
  item_status?: ItemStatus;
  status_changed_at?: string | null;
  status_changed_by?: string | null;
  // Comments (when fetched with include)
  comments?: EventComment[];
  // Sync placeholders (nullable for now)
  server_id: string | null;
  last_synced_at: string | null;
  sync_status: SyncStatus;
}

// Voice Artifact Status for async transcription pipeline
export type VoiceArtifactStatus = 'recorded' | 'uploaded' | 'transcribed';

// Section keys for voice recordings
export type VoiceSectionKey =
  | 'pending_issues'
  | 'inspection_notes'
  | 'additional_work'
  | 'daily_summary'
  | 'master_recording';

// Voice Artifact for tracking audio recordings and transcriptions
export interface VoiceArtifact {
  id: string;
  section_key: VoiceSectionKey;
  entity_id?: string; // ID of the related entity (issue, note, work entry)
  local_audio_uri: string;
  transcript_text: string | null;
  status: VoiceArtifactStatus;
  created_at: string;
}

// Sync status for tracking backend synchronization
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error';

// Log metadata for sync tracking
export interface LogMetadata {
  sync_status: SyncStatus;
  last_synced_at: string | null;
  sync_error?: string | null;
  device_id: string;
  app_version: string;
}

// Project Info
export interface Project {
  id: string;
  name: string;
  number: string;
  address: string;
  procore_project_id?: string | null;
  created_at: string;
  updated_at: string;
}

// Weather Conditions
export interface WeatherConditions {
  low_temp: number | null;
  high_temp: number | null;
  precipitation: string;
  wind: string;
  sky_condition: SkyCondition;
  weather_delay: boolean;
}

// Activity/Task Entry
export interface TaskEntry {
  id: string;
  company_name: string;
  workers: number;
  hours: number;
  task_description: string;
  notes: string;
}

// Visitor Entry
export interface VisitorEntry {
  id: string;
  time: string;
  company_name: string;
  visitor_name: string;
  notes: string;
}

// Equipment Entry
export interface EquipmentEntry {
  id: string;
  company: string;
  equipment: string;
  notes: string;
}

// Material Entry
export interface MaterialEntry {
  id: string;
  company: string;
  material_name: string;
  phase_code: string;
  quantity: string;
  notes: string;
}

// Pending Issue (Critical Section)
export interface PendingIssue {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  severity: Severity;
  assignee: string;
  due_date: string | null;
  external_entity: string; // AHJ, inspector, owner, architect, vendor/sub
  location: string; // area/room/level
  audio_uri?: string; // Optional stored audio
  related_rfi_ids?: string[] | null;
  related_co_ids?: string[] | null;
  source_event_id?: string | null; // Reference to original event if bridged from Event Capture
}

// Inspection Note
export interface InspectionNote {
  id: string;
  inspector_name: string;
  ahj: string; // Authority Having Jurisdiction
  inspection_type: string;
  result: InspectionResult;
  notes: string;
  follow_up_needed: boolean;
  audio_uri?: string;
}

// Additional Work Entry
export interface AdditionalWorkEntry {
  id: string;
  description: string;
  tag: AdditionalWorkTag;
  audio_uri?: string;
}

// Main Daily Log
export interface DailyLog {
  id: string;
  project_id: string;
  date: string;
  prepared_by: string;

  // Weather
  weather: WeatherConditions;

  // Daily Totals (auto-calculated from tasks)
  daily_totals_workers: number;
  daily_totals_hours: number;

  // Repeating sections
  tasks: TaskEntry[];
  visitors: VisitorEntry[];
  equipment: EquipmentEntry[];
  materials: MaterialEntry[];

  // Insight capture sections
  pending_issues: PendingIssue[];
  inspection_notes: InspectionNote[];
  additional_work: AdditionalWorkEntry[];

  // Daily summary notes (free-form voice-enabled section)
  daily_summary_notes: string;
  daily_summary_audio_uri?: string;

  // Voice artifacts for async transcription
  voice_artifacts: VoiceArtifact[];

  // Metadata
  status: 'draft' | 'completed';
  sync_status: SyncStatus;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// Helper to create empty daily log
export function createEmptyDailyLog(projectId: string): DailyLog {
  const now = new Date().toISOString();
  const today = new Date().toISOString().split('T')[0];

  return {
    id: generateId(),
    project_id: projectId,
    date: today,
    prepared_by: '',
    weather: {
      low_temp: null,
      high_temp: null,
      precipitation: '',
      wind: '',
      sky_condition: 'Clear',
      weather_delay: false,
    },
    daily_totals_workers: 0,
    daily_totals_hours: 0,
    tasks: [],
    visitors: [],
    equipment: [],
    materials: [],
    pending_issues: [],
    inspection_notes: [],
    additional_work: [],
    daily_summary_notes: '',
    voice_artifacts: [],
    status: 'draft',
    sync_status: 'pending',
    last_synced_at: null,
    created_at: now,
    updated_at: now,
  };
}

// Helper to generate proper UUIDs (standard v4 format)
// Using crypto.randomUUID() which is available in modern browsers and Node.js
// This generates collision-proof UUIDs that can be used as both local and backend IDs
export function generateId(): string {
  // crypto.randomUUID() is available in all modern environments
  // Falls back to a manual implementation for older environments
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Helper to create empty entries
export function createEmptyTask(): TaskEntry {
  return {
    id: generateId(),
    company_name: '',
    workers: 0,
    hours: 0,
    task_description: '',
    notes: '',
  };
}

export function createEmptyVisitor(): VisitorEntry {
  return {
    id: generateId(),
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    company_name: '',
    visitor_name: '',
    notes: '',
  };
}

export function createEmptyEquipment(): EquipmentEntry {
  return {
    id: generateId(),
    company: '',
    equipment: '',
    notes: '',
  };
}

export function createEmptyMaterial(): MaterialEntry {
  return {
    id: generateId(),
    company: '',
    material_name: '',
    phase_code: '',
    quantity: '',
    notes: '',
  };
}

export function createEmptyIssue(): PendingIssue {
  return {
    id: generateId(),
    title: '',
    description: '',
    category: 'Other',
    severity: 'Medium',
    assignee: '',
    due_date: null,
    external_entity: '',
    location: '',
  };
}

export function createEmptyInspectionNote(): InspectionNote {
  return {
    id: generateId(),
    inspector_name: '',
    ahj: '',
    inspection_type: '',
    result: 'Pass',
    notes: '',
    follow_up_needed: false,
  };
}

export function createEmptyAdditionalWork(): AdditionalWorkEntry {
  return {
    id: generateId(),
    description: '',
    tag: 'other',
  };
}

// Helper to create voice artifact
export function createVoiceArtifact(
  sectionKey: VoiceSectionKey,
  localAudioUri: string,
  entityId?: string
): VoiceArtifact {
  return {
    id: generateId(),
    section_key: sectionKey,
    entity_id: entityId,
    local_audio_uri: localAudioUri,
    transcript_text: null,
    status: 'recorded',
    created_at: new Date().toISOString(),
  };
}

// Helper to create empty event
export function createEmptyEvent(projectId: string, audioUri: string): Event {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    project_id: projectId,
    created_at: now,
    local_audio_uri: audioUri,
    transcript_text: null,
    status: 'recorded',
    event_type: 'Other',
    severity: 'Medium',
    title: 'Untitled Event',
    description: '',
    notes: '',
    location: '',
    trade_vendor: '',
    linked_daily_log_id: null,
    action_items: [],
    is_resolved: false,
    resolved_at: null,
    server_id: null,
    last_synced_at: null,
    sync_status: 'pending',
  };
}

// Map event type to issue category for daily log bridging
export function mapEventTypeToIssueCategory(eventType: EventType): IssueCategory {
  const mapping: Record<EventType, IssueCategory> = {
    'Delay': 'Schedule',
    'Quality': 'QAQC',
    'Safety': 'Safety',
    'Inspection': 'Inspection',
    'Material': 'Procurement',
    'Equipment': 'Other',
    'Coordination': 'Coordination',
    'Other': 'Other',
  };
  return mapping[eventType];
}

// ============================================
// PDF TEMPLATE TYPES
// ============================================

export type TemplateType = 'PUNCH_LIST' | 'RFI' | 'CUSTOM';

export type FormFieldType = 'text' | 'checkbox' | 'dropdown' | 'radio' | 'list' | 'date';

export interface FormFieldDefinition {
  name: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  options?: string[] | null;
}

export interface PdfTemplate {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  description: string | null;
  templateType: TemplateType;
  version: number;
  isActive: boolean;
  projectId: string | null; // null = admin/default template
  fileName: string;
  filePath: string;
  fileSize: number;
  formFields: FormFieldDefinition[];
  createdById: string | null;
}

export interface EventTemplateData {
  id: string;
  createdAt: string;
  updatedAt: string;
  eventId: string;
  templateId: string;
  fieldValues: Record<string, string | boolean>;
  generatedPdfPath: string | null;
  template?: PdfTemplate;
}

// ============================================
// DOCUMENT SCHEMA TYPES (AI-Learned Schemas)
// ============================================

export type SchemaDocumentType = 'PUNCH_LIST' | 'RFI' | 'DAILY_REPORT' | 'SAFETY_REPORT' | 'INSPECTION' | 'CUSTOM';

export type SchemaFieldType = 'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'select' | 'multiline' | 'person' | 'company' | 'location' | 'attachment';

export interface SchemaField {
  name: string;
  label: string;
  type: SchemaFieldType;
  description?: string;
  required: boolean;
  examples?: string[];
}

export interface DocumentSchema {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  description: string | null;
  documentType: SchemaDocumentType;
  version: number;
  isActive: boolean;
  projectId: string | null;
  sourceFileName: string | null;
  fields: SchemaField[];
  analysisNotes: string | null;
  confidence: number | null;
}

// ============================================
// EVENT SCHEMA DATA TYPES (Apply to Document)
// ============================================

export interface EventSchemaData {
  id: string;
  createdAt: string;
  updatedAt: string;
  eventId: string;
  schemaId: string;
  fieldValues: Record<string, string | null>;
  extractedAt: string | null;
  extractionConfidence: number | null;
  lastEditedAt: string | null;
  wasManuallyEdited: boolean;
  // Generated PDF fields
  generatedPdfPath: string | null;
  generatedPdfName: string | null;
  pdfGeneratedAt: string | null;
  schema?: DocumentSchema;
}

// ============================================
// CHECKLIST STATUS TYPES (Punch Lists & RFIs)
// ============================================

export type ItemStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED';

export type CommentType = 'comment' | 'status_change' | 'edit';

export interface EventComment {
  id: string;
  createdAt: string;
  eventId: string;
  text: string;
  authorName: string | null;
  commentType: CommentType;
  previousStatus: string | null;
  newStatus: string | null;
}

// Checklist item counts for dashboard
export interface ChecklistCounts {
  total: number;
  open: number;
  inProgress: number;
  closed: number;
}

// ============================================
// PHOTO TYPES
// ============================================

export interface Photo {
  id: string;
  createdAt: string;
  updatedAt: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  caption: string | null;
  takenAt: string | null;
  eventId: string | null;
  dailyLogId: string | null;
}
