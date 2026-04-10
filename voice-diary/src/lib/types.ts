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
