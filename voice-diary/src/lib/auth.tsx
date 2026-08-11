import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from './api';
import { useVoiceDiaryStore } from './voice-diary-store';
import { useToolFeedbackStore } from './tool-feedback-store';
import type { User } from './types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Syncs entries and summaries from backend to local store (for cross-device sync)
async function syncEntriesFromBackend() {
  try {
    console.log('[auth] Syncing from backend...');

    // Fetch entries and summaries in parallel
    const [entriesResult, summariesResult] = await Promise.all([
      api.getMyEntries(),
      api.getMySummaries(),
    ]);

    const entries = entriesResult.success ? entriesResult.entries : undefined;
    const summaries = summariesResult.success ? summariesResult.summaries : undefined;

    if (entries || summaries) {
      useVoiceDiaryStore.getState().syncFromBackend(entries || [], summaries);
      console.log('[auth] Sync complete');
    }
  } catch (err) {
    console.error('[auth] Failed to sync:', err);
  }
}

// Clears all user-scoped store data (in-memory + localStorage) to prevent
// cross-user data leakage when switching accounts or on cold start
function clearAllUserStores() {
  localStorage.removeItem('voice-diary-storage');
  localStorage.removeItem('voice-diary-forms');
  localStorage.removeItem('tool-feedback-storage');
  useVoiceDiaryStore.setState({
    voiceNotes: [],
    categorizedSnippets: [],
    dailySummaries: [],
    notifications: [],
    formSuggestions: [],
    currentProjectId: null,
  });
  useToolFeedbackStore.setState({
    selectedToolBrand: null,
    currentProjectId: null,
    projects: [],
    feedbackEntries: [],
    feedbackSnippets: [],
    notifications: [],
    dailyChecks: [],
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = api.getToken();
      if (token) {
        try {
          const currentUser = await api.getCurrentUser();

          // Check if stored data belongs to a different user
          const lastUserId = localStorage.getItem('voice-diary-last-user-id');
          if (lastUserId && lastUserId !== currentUser.id) {
            console.log('[auth] Session restored for different user, clearing stale data');
            clearAllUserStores();
          }

          setUser(currentUser);
          localStorage.setItem('voice-diary-last-user-id', currentUser.id);
          useVoiceDiaryStore.getState().setCurrentUser(currentUser.id);
          // Sync entries from backend for cross-device access
          syncEntriesFromBackend();
        } catch {
          // Token invalid, clear it
          api.logout();
          useVoiceDiaryStore.getState().setCurrentUser(null);
        }
      }
      setIsLoading(false);
    };
    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.login({ email, password });

    // Check if this is a different user than before - if so, clear all data
    const lastUserId = localStorage.getItem('voice-diary-last-user-id');
    if (lastUserId && lastUserId !== response.user.id) {
      console.log('[auth] Different user detected, clearing previous data');
      clearAllUserStores();
    }

    setUser(response.user);
    localStorage.setItem('user', JSON.stringify(response.user));
    localStorage.setItem('voice-diary-last-user-id', response.user.id);
    // Set current user in store for data filtering
    useVoiceDiaryStore.getState().setCurrentUser(response.user.id);
    // Sync entries from backend for cross-device access
    syncEntriesFromBackend();
  };

  const register = async (email: string, password: string, name: string) => {
    const response = await api.register({ email, password, name });

    // New user registration - clear any existing data from previous users
    const lastUserId = localStorage.getItem('voice-diary-last-user-id');
    if (lastUserId && lastUserId !== response.user.id) {
      console.log('[auth] New user registration, clearing previous data');
      clearAllUserStores();
    }

    setUser(response.user);
    localStorage.setItem('user', JSON.stringify(response.user));
    localStorage.setItem('voice-diary-last-user-id', response.user.id);
    // Set current user in store for data filtering
    useVoiceDiaryStore.getState().setCurrentUser(response.user.id);
    // Sync entries from backend (for new users, this will likely be empty)
    syncEntriesFromBackend();
  };

  const logout = () => {
    api.logout();
    setUser(null);
    clearAllUserStores();
    localStorage.removeItem('voice-diary-last-user-id');
    localStorage.removeItem('user');
    localStorage.removeItem('voice-diary-current-project');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
