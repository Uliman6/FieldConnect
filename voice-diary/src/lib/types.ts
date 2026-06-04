// User
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'EDITOR' | 'VIEWER';
}

// Project
export interface Project {
  id: string;
  name: string;
  location: string;
  client: string;
  createdAt: string;
  updatedAt: string;
}

// Voice Diary Categories
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

// Voice Note
export interface VoiceNote {
  id: string;
  projectId: string;
  userId?: string;
  audioUri: string;
  title: string | null;
  transcriptText: string | null;
  cleanedTranscript: string | null;
  status: 'recording' | 'transcribing' | 'processing' | 'complete' | 'error';
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  duration: number;
  version: number;
  previousVersionId?: string;
}

// Categorized Snippet
export interface CategorizedSnippet {
  id: string;
  voiceNoteId: string;
  category: VoiceDiaryCategory;
  content: string;
  createdAt: string;
}

// Daily Summary
export interface DailySummary {
  id: string;
  date: string;
  projectId: string;
  userId?: string;
  summary: string;
  lastUpdatedAt: string;
  voiceNoteCount: number;
  hasMinimumInfo: boolean;
}

// Notification
export interface DiaryNotification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  createdAt: string;
  read: boolean;
}

// Form Suggestion
export interface FormSuggestion {
  id: string;
  formType: string;
  formName: string;
  reason: string;
  snippetIds: string[];
  dismissed: boolean;
  createdAt: string;
}

// Form Types for user selection (only showing active forms)
export const FORM_TYPES = [
  { id: 'daily_log', name: 'Daily Log', icon: 'FileText', description: 'Daily work summary and progress' },
  { id: 'inspection_notes', name: 'Inspection Notes', icon: 'ClipboardCheck', description: 'Site inspection findings' },
  { id: 'field_notes', name: 'Field Notes', icon: 'PenTool', description: 'Personal notes and observations' },
] as const;

export type FormTypeId = typeof FORM_TYPES[number]['id'];

// Tool Feedback Types
export const TOOL_BRANDS = ['DeWalt', 'Milwaukee', 'Hilti', 'Makita'] as const;
export type ToolBrand = typeof TOOL_BRANDS[number];

export const TOOL_FEEDBACK_CATEGORIES = [
  'Safety',
  'Productivity',
  'Comfort',
  'Reliability',
  'Feature Request',
  'Tip',
] as const;
export type ToolFeedbackCategory = typeof TOOL_FEEDBACK_CATEGORIES[number];

export interface ToolFeedbackEntry {
  id: string;
  projectId: string;
  userId?: string;
  toolBrand: ToolBrand;
  audioUri: string;
  transcriptText: string | null;
  status: 'recording' | 'transcribing' | 'processing' | 'complete' | 'error';
  errorMessage?: string;
  createdAt: string;
  duration: number;
}

export interface ToolFeedbackSnippet {
  id: string;
  feedbackId: string;
  toolBrand: ToolBrand;
  category: ToolFeedbackCategory;
  sentiment: 'positive' | 'negative' | 'neutral';
  content: string;
  createdAt: string;
}

export interface ToolFeedbackProcessResult {
  success: boolean;
  snippets?: Array<{
    category: ToolFeedbackCategory;
    sentiment: 'positive' | 'negative' | 'neutral';
    content: string;
  }>;
  summary?: string;
}

// API Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface TranscriptionResponse {
  success: boolean;
  text?: string;
  error?: string;
  provider?: string;
}

export interface VoiceDiaryProcessResult {
  success: boolean;
  newSnippets?: Array<{
    category: VoiceDiaryCategory;
    content: string;
  }>;
  summary?: string;
  hasMinimumInfo?: boolean;
  formSuggestions?: Array<{
    formType: string;
    formName: string;
    reason: string;
    snippetIds: string[];
  }>;
  title?: string;
  cleanedTranscript?: string;
}
