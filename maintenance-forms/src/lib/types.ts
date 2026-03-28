// Visit Types
export type VisitType = 'BAKIM' | 'SERVIS_SUPERVISORLUK' | 'DEVREYE_ALIM';

export type PumpCategory = 'MAIN' | 'JOCKEY';
export type PumpModel = 'VERTICAL' | 'HORIZONTAL';
export type PumpType = 'ELEKTRIKLI' | 'DIZEL';

// User
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'EDITOR' | 'VIEWER';
}

// Maintenance Visit
export interface MaintenanceVisit {
  id: string;
  userId: string;
  companyName: string | null;
  address: string | null;
  visitType: VisitType | null;
  notes: string | null;
  status: 'draft' | 'in_progress' | 'completed';
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  pumps: MaintenancePump[];
  _count?: {
    pumps: number;
  };
}

// Maintenance Pump
export interface MaintenancePump {
  id: string;
  visitId: string;
  pumpCategory: PumpCategory;
  pumpModel: PumpModel | null;
  pumpType: PumpType | null;
  brand: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  photoUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  forms?: MaintenancePumpForm[];
  components?: MaintenancePumpComponent[];
}

// Maintenance Pump Component
export interface MaintenancePumpComponent {
  id: string;
  pumpId: string;
  componentType: string;
  componentName: string | null;
  erpTag: string | null;
  erpData: Record<string, unknown> | null;
  brand: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  componentData: Record<string, unknown>;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// Maintenance Pump Form
export interface MaintenancePumpForm {
  id: string;
  pumpId: string;
  formType: string;
  formData: Record<string, unknown>;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface CreateVisitRequest {
  companyName?: string;
  address?: string;
  visitType?: VisitType;
  notes?: string;
}

export interface CreatePumpRequest {
  pumpCategory: PumpCategory;
  pumpModel?: PumpModel;
  pumpType?: PumpType;
  brand?: string;
  modelNumber?: string;
  serialNumber?: string;
  photoUrl?: string;
}

export interface UpdatePumpRequest {
  pumpModel?: PumpModel;
  pumpType?: PumpType;
  brand?: string;
  modelNumber?: string;
  serialNumber?: string;
  photoUrl?: string;
  sortOrder?: number;
}

export interface CreateComponentRequest {
  componentType: string;
  componentName?: string;
  erpTag?: string;
  brand?: string;
  modelNumber?: string;
  serialNumber?: string;
  componentData?: Record<string, unknown>;
}
