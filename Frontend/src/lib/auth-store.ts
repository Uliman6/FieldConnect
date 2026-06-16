import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, AuthResponse } from './types';
import { useDailyLogStore } from './store';
import { useVoiceDiaryStore } from './voice-diary-store';

// Resets all user-specific store data (both in-memory and persisted) to prevent
// cross-user data leakage when logging out or switching accounts on a shared device
async function clearUserStores(): Promise<void> {
  // Reset in-memory Zustand state immediately
  useDailyLogStore.setState({
    projects: [],
    currentProjectId: null,
    dailyLogs: [],
    currentLogId: null,
    events: [],
    userName: '',
    currentUserId: null,
  });
  useVoiceDiaryStore.setState({
    voiceNotes: [],
    categorizedSnippets: [],
    dailySummaries: [],
    notifications: [],
    formSuggestions: [],
    currentProjectId: null,
    currentUserId: null,
  });

  // Also clear the persisted AsyncStorage keys so the next app load starts clean
  const storeKeys = ['daily-log-storage', 'voice-diary-storage'];
  await AsyncStorage.multiRemove(storeKeys);
  if (Platform.OS === 'web') {
    storeKeys.forEach((key) => localStorage.removeItem(key));
  }
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
const TOKEN_KEY = 'fieldconnect_auth_token';
const USER_KEY = 'fieldconnect_user';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  clearError: () => void;
}

// Platform-specific storage
async function setStorageItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function getStorageItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  } else {
    return await SecureStore.getItemAsync(key);
  }
}

async function removeStorageItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    // Clear any previously persisted store data before loading a new user's session
    await clearUserStores();

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      const { user, token } = data as AuthResponse;

      // Store credentials
      await setStorageItem(TOKEN_KEY, token);
      await setStorageItem(USER_KEY, JSON.stringify(user));

      useDailyLogStore.getState().setCurrentUserId(user.id);
      set({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  register: async (email: string, password: string, name?: string) => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      const { user, token } = data as AuthResponse;

      // Store credentials
      await setStorageItem(TOKEN_KEY, token);
      await setStorageItem(USER_KEY, JSON.stringify(user));

      useDailyLogStore.getState().setCurrentUserId(user.id);
      set({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    await removeStorageItem(TOKEN_KEY);
    await removeStorageItem(USER_KEY);
    await clearUserStores();

    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  loadStoredAuth: async () => {
    set({ isLoading: true });

    try {
      const token = await getStorageItem(TOKEN_KEY);
      const userStr = await getStorageItem(USER_KEY);

      if (token && userStr) {
        const user = JSON.parse(userStr) as User;

        // Verify token is still valid by calling /me
        const response = await fetch(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          const verifiedUser = data.user as User;

          // On cold start the Zustand store may be hydrated from a different user's
          // persisted data. Clear it before proceeding if user IDs don't match.
          const storedUserId = useDailyLogStore.getState().currentUserId;
          if (storedUserId !== verifiedUser.id) {
            await clearUserStores();
          }

          useDailyLogStore.getState().setCurrentUserId(verifiedUser.id);
          set({
            user: verifiedUser,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
          return;
        }
      }

      // No valid auth found
      await removeStorageItem(TOKEN_KEY);
      await removeStorageItem(USER_KEY);
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      // Clear invalid stored auth
      await removeStorageItem(TOKEN_KEY);
      await removeStorageItem(USER_KEY);
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));

// Helper to get current token for API requests
export function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}

// Helper to check if user has specific role
export function hasRole(requiredRoles: User['role'][]): boolean {
  const user = useAuthStore.getState().user;
  return user ? requiredRoles.includes(user.role) : false;
}
