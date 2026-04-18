import axios, { AxiosInstance } from 'axios';
import type {
  LoginRequest,
  LoginResponse,
  Project,
  TranscriptionResponse,
  VoiceDiaryProcessResult,
  CategorizedSnippet,
} from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_URL}/api`,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token to requests
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    // Load token from localStorage
    const savedToken = localStorage.getItem('auth_token');
    if (savedToken) {
      this.token = savedToken;
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  getToken() {
    return this.token;
  }

  // ============================================
  // AUTH
  // ============================================

  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/auth/login', data);
    this.setToken(response.data.token);
    return response.data;
  }

  async register(data: { email: string; password: string; name: string }): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/auth/register', data);
    this.setToken(response.data.token);
    return response.data;
  }

  async getCurrentUser() {
    const response = await this.client.get<{ user: LoginResponse['user'] }>('/auth/me');
    return response.data.user;
  }

  logout() {
    this.setToken(null);
    localStorage.removeItem('user');
  }

  // ============================================
  // PROJECTS
  // ============================================

  async getProjects(): Promise<Project[]> {
    const response = await this.client.get<Project[]>('/projects');
    return response.data;
  }

  async createProject(data: { name: string; location?: string; client?: string }): Promise<Project> {
    const response = await this.client.post<Project>('/projects', data);
    return response.data;
  }

  // ============================================
  // TRANSCRIPTION
  // ============================================

  async transcribeAudio(audioBlob: Blob, filename: string = 'recording.webm'): Promise<TranscriptionResponse> {
    const formData = new FormData();
    formData.append('audio', audioBlob, filename);

    const response = await this.client.post<TranscriptionResponse>('/transcripts/transcribe', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  // ============================================
  // VOICE DIARY
  // ============================================

  async processVoiceNote(
    transcript: string,
    existingSnippets: Array<{ category: string; content: string }>,
    noteCount: number
  ): Promise<VoiceDiaryProcessResult> {
    const response = await this.client.post<VoiceDiaryProcessResult>('/voice-diary/process', {
      transcript,
      existingSnippets,
      noteCount,
    });
    return response.data;
  }

  async categorizeTranscript(transcript: string): Promise<{
    success: boolean;
    snippets?: CategorizedSnippet[];
    error?: string;
  }> {
    const response = await this.client.post('/voice-diary/categorize', { transcript });
    return response.data;
  }

  async generateDailySummary(
    snippets: Array<{ category: string; content: string }>,
    noteCount: number
  ): Promise<{
    success: boolean;
    summary?: string;
    hasMinimumInfo?: boolean;
    error?: string;
  }> {
    const response = await this.client.post('/voice-diary/summarize', { snippets, noteCount });
    return response.data;
  }

  // ============================================
  // FEEDBACK
  // ============================================

  async submitFeedback(data: {
    text: string;
    userId?: string;
    userName?: string;
    timestamp: string;
  }): Promise<{ success: boolean; id?: string }> {
    const response = await this.client.post('/voice-diary/feedback', data);
    return response.data;
  }

  async getFeedback(): Promise<Array<{
    id: string;
    text: string;
    userId?: string;
    userName?: string;
    timestamp: string;
  }>> {
    const response = await this.client.get('/voice-diary/feedback');
    return response.data;
  }

  // ============================================
  // ADMIN
  // ============================================

  async getAllUserEntries(): Promise<Array<{
    id: string;
    userId: string;
    userName?: string;
    projectName?: string;
    transcriptText?: string;
    createdAt: string;
  }>> {
    const response = await this.client.get('/admin/entries');
    return response.data;
  }
}

export const api = new ApiClient();
