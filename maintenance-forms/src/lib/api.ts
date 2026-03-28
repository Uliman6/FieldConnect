import axios, { AxiosInstance } from 'axios';
import type {
  LoginRequest,
  LoginResponse,
  MaintenanceVisit,
  MaintenancePump,
  MaintenancePumpComponent,
  MaintenancePumpForm,
  CreateVisitRequest,
  CreatePumpRequest,
  UpdatePumpRequest,
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

  async getCurrentUser() {
    const response = await this.client.get<{ user: LoginResponse['user'] }>('/auth/me');
    return response.data.user;
  }

  logout() {
    this.setToken(null);
    localStorage.removeItem('user');
  }

  // ============================================
  // VISITS
  // ============================================

  async listVisits(params?: { status?: string; visit_type?: string; limit?: number }): Promise<MaintenanceVisit[]> {
    const response = await this.client.get<MaintenanceVisit[]>('/maintenance/visits', { params });
    return response.data;
  }

  async getVisit(id: string): Promise<MaintenanceVisit> {
    const response = await this.client.get<MaintenanceVisit>(`/maintenance/visits/${id}`);
    return response.data;
  }

  async createVisit(data: CreateVisitRequest): Promise<MaintenanceVisit> {
    const response = await this.client.post<MaintenanceVisit>('/maintenance/visits', data);
    return response.data;
  }

  async updateVisit(id: string, data: Partial<CreateVisitRequest & { status: string }>): Promise<MaintenanceVisit> {
    const response = await this.client.put<MaintenanceVisit>(`/maintenance/visits/${id}`, data);
    return response.data;
  }

  async deleteVisit(id: string): Promise<void> {
    await this.client.delete(`/maintenance/visits/${id}`);
  }

  // ============================================
  // PUMPS
  // ============================================

  async addPump(visitId: string, data: CreatePumpRequest): Promise<MaintenancePump> {
    const response = await this.client.post<MaintenancePump>(`/maintenance/visits/${visitId}/pumps`, data);
    return response.data;
  }

  async updatePump(pumpId: string, data: UpdatePumpRequest): Promise<MaintenancePump> {
    const response = await this.client.put<MaintenancePump>(`/maintenance/pumps/${pumpId}`, data);
    return response.data;
  }

  async deletePump(pumpId: string): Promise<void> {
    await this.client.delete(`/maintenance/pumps/${pumpId}`);
  }

  // ============================================
  // PUMP COMPONENTS
  // ============================================

  async upsertPumpComponent(pumpId: string, data: {
    componentType: string;
    componentData?: Record<string, unknown>;
    brand?: string;
    modelNumber?: string;
    serialNumber?: string;
  }): Promise<MaintenancePumpComponent> {
    const response = await this.client.post<MaintenancePumpComponent>(
      `/maintenance/pumps/${pumpId}/components`,
      data
    );
    return response.data;
  }

  async getPumpComponents(pumpId: string): Promise<MaintenancePumpComponent[]> {
    const response = await this.client.get<MaintenancePumpComponent[]>(
      `/maintenance/pumps/${pumpId}/components`
    );
    return response.data;
  }

  // ============================================
  // PUMP FORMS
  // ============================================

  async createOrUpdatePumpForm(pumpId: string, data: {
    formType: string;
    formData: Record<string, unknown>;
    status?: 'pending' | 'in_progress' | 'completed';
  }): Promise<MaintenancePumpForm> {
    const response = await this.client.post<MaintenancePumpForm>(
      `/maintenance/pumps/${pumpId}/forms`,
      data
    );
    return response.data;
  }

  async getPumpForms(pumpId: string): Promise<MaintenancePumpForm[]> {
    const response = await this.client.get<MaintenancePumpForm[]>(
      `/maintenance/pumps/${pumpId}/forms`
    );
    return response.data;
  }

  // ============================================
  // OCR
  // ============================================

  async extractNameplateOcr(data: {
    imageBase64: string;
    equipmentType?: string;
    fieldsToExtract?: string[];
  }): Promise<OcrResponse> {
    const response = await this.client.post<OcrResponse>('/forms/ocr/nameplate', data);
    return response.data;
  }

  async uploadPhoto(imageBase64: string): Promise<{ url: string }> {
    const response = await this.client.post<{ url: string }>('/forms/upload-photo', { imageBase64 });
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
  // AI UTILITIES
  // ============================================

  async cleanupNotes(rawText: string, language: string = 'tr'): Promise<{ success: boolean; cleanedText: string; source: string }> {
    const response = await this.client.post<{ success: boolean; cleanedText: string; source: string }>(
      '/maintenance/cleanup-notes',
      { rawText, language }
    );
    return response.data;
  }

  async downloadPdf(visitId: string): Promise<Blob> {
    const response = await this.client.get(`/maintenance/visits/${visitId}/pdf`, {
      responseType: 'blob'
    });
    return response.data;
  }

  // ============================================
  // VISIT FORMS (for Servis Raporu)
  // ============================================

  async createOrUpdateVisitForm(visitId: string, data: {
    formType: string;
    formData: Record<string, unknown>;
    status?: 'pending' | 'in_progress' | 'completed';
  }): Promise<{ success: boolean }> {
    const response = await this.client.post<{ success: boolean }>(
      `/maintenance/visits/${visitId}/forms`,
      data
    );
    return response.data;
  }
}

// OCR Response type
export interface OcrResponse {
  success: boolean;
  extractedData: Record<string, string | null>;
  formFields: Record<string, string>;
  rawResponse?: string;
}

// Transcription Response type
export interface TranscriptionResponse {
  success: boolean;
  text?: string;
  error?: string;
  provider?: string;
}

export const api = new ApiClient();
