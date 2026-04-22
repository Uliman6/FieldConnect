import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from './api';
import { useVoiceDiaryStore } from './voice-diary-store';
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
            localStorage.removeItem('voice-diary-storage');
            localStorage.removeItem('voice-diary-forms');
            useVoiceDiaryStore.setState({
              voiceNotes: [],
              categorizedSnippets: [],
              dailySummaries: [],
              notifications: [],
              formSuggestions: [],
              currentProjectId: null,
            });
          }

          setUser(currentUser);
          localStorage.setItem('voice-diary-last-user-id', currentUser.id);
          useVoiceDiaryStore.getState().setCurrentUser(currentUser.id);
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
      // Different user logging in - clear all previous user's data
      console.log('[auth] Different user detected, clearing previous data');
      localStorage.removeItem('voice-diary-storage');
      localStorage.removeItem('voice-diary-forms');
      // Reset store state
      useVoiceDiaryStore.setState({
        voiceNotes: [],
        categorizedSnippets: [],
        dailySummaries: [],
        notifications: [],
        formSuggestions: [],
        currentProjectId: null,
      });
    }

    setUser(response.user);
    localStorage.setItem('user', JSON.stringify(response.user));
    localStorage.setItem('voice-diary-last-user-id', response.user.id);
    // Set current user in store for data filtering
    useVoiceDiaryStore.getState().setCurrentUser(response.user.id);
  };

  const register = async (email: string, password: string, name: string) => {
    const response = await api.register({ email, password, name });

    // New user registration - clear any existing data from previous users
    const lastUserId = localStorage.getItem('voice-diary-last-user-id');
    if (lastUserId && lastUserId !== response.user.id) {
      console.log('[auth] New user registration, clearing previous data');
      localStorage.removeItem('voice-diary-storage');
      localStorage.removeItem('voice-diary-forms');
      useVoiceDiaryStore.setState({
        voiceNotes: [],
        categorizedSnippets: [],
        dailySummaries: [],
        notifications: [],
        formSuggestions: [],
        currentProjectId: null,
      });
    }

    setUser(response.user);
    localStorage.setItem('user', JSON.stringify(response.user));
    localStorage.setItem('voice-diary-last-user-id', response.user.id);
    // Set current user in store for data filtering
    useVoiceDiaryStore.getState().setCurrentUser(response.user.id);
  };

  const logout = () => {
    api.logout();
    setUser(null);
    // Clear user context in store
    useVoiceDiaryStore.getState().setCurrentUser(null);
    useVoiceDiaryStore.getState().setCurrentProject(null);
    // Clear all voice-diary data to prevent data leakage between users
    localStorage.removeItem('voice-diary-storage');
    localStorage.removeItem('voice-diary-forms');
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
