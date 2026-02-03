/**
 * Language Provider
 * Manages language state and provides translation functions to the app
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { I18n } from 'i18n-js';

import en from './locales/en';
import tr from './locales/tr';
import es from './locales/es';

// Types
export type LanguageCode = 'en' | 'tr' | 'es';

export interface LanguageInfo {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
}

// Supported languages
export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'tr', name: 'Turkish', nativeName: 'Turkce', flag: '🇹🇷' },
  { code: 'es', name: 'Spanish', nativeName: 'Espanol', flag: '🇪🇸' },
];

// Storage keys
const LANGUAGE_STORAGE_KEY = '@fieldconnect_language';
const TRANSCRIPTION_LANGUAGE_KEY = '@fieldconnect_transcription_language';

// Create i18n instance
const i18n = new I18n({
  en,
  tr,
  es,
});

i18n.defaultLocale = 'en';
i18n.enableFallback = true;

// Context types
interface LanguageContextType {
  // Current language
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => Promise<void>;

  // Transcription language (can be different from UI language)
  transcriptionLanguage: LanguageCode;
  setTranscriptionLanguage: (lang: LanguageCode) => Promise<void>;

  // Translation function
  t: (key: string, options?: Record<string, unknown>) => string;

  // Language info
  supportedLanguages: LanguageInfo[];
  currentLanguageInfo: LanguageInfo;

  // Loading state
  isLoading: boolean;
}

// Create context
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Helper to check valid language
function isValidLanguage(code: string): code is LanguageCode {
  return ['en', 'tr', 'es'].includes(code);
}

// Provider component
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [transcriptionLanguage, setTranscriptionLanguageState] = useState<LanguageCode>('en');
  const [isLoading, setIsLoading] = useState(true);

  // Initialize languages from storage or device
  useEffect(() => {
    async function initializeLanguages() {
      try {
        // Load saved UI language
        const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (savedLanguage && isValidLanguage(savedLanguage)) {
          setLanguageState(savedLanguage);
          i18n.locale = savedLanguage;
        } else {
          // Use device locale
          const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
          const lang = isValidLanguage(deviceLocale) ? deviceLocale : 'en';
          setLanguageState(lang);
          i18n.locale = lang;
        }

        // Load saved transcription language
        const savedTranscriptionLang = await AsyncStorage.getItem(TRANSCRIPTION_LANGUAGE_KEY);
        if (savedTranscriptionLang && isValidLanguage(savedTranscriptionLang)) {
          setTranscriptionLanguageState(savedTranscriptionLang);
        } else {
          // Default to UI language
          const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
          const lang = isValidLanguage(deviceLocale) ? deviceLocale : 'en';
          setTranscriptionLanguageState(lang);
        }
      } catch (error) {
        console.error('[LanguageProvider] Error initializing:', error);
      } finally {
        setIsLoading(false);
      }
    }

    initializeLanguages();
  }, []);

  // Set UI language
  const setLanguage = useCallback(async (lang: LanguageCode) => {
    try {
      setLanguageState(lang);
      i18n.locale = lang;
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch (error) {
      console.error('[LanguageProvider] Error saving language:', error);
    }
  }, []);

  // Set transcription language
  const setTranscriptionLanguage = useCallback(async (lang: LanguageCode) => {
    try {
      setTranscriptionLanguageState(lang);
      await AsyncStorage.setItem(TRANSCRIPTION_LANGUAGE_KEY, lang);
    } catch (error) {
      console.error('[LanguageProvider] Error saving transcription language:', error);
    }
  }, []);

  // Translation function
  const t = useCallback((key: string, options?: Record<string, unknown>) => {
    return i18n.t(key, options);
  }, [language]); // Re-create when language changes

  // Current language info
  const currentLanguageInfo = useMemo(() => {
    return SUPPORTED_LANGUAGES.find(l => l.code === language) || SUPPORTED_LANGUAGES[0];
  }, [language]);

  // Context value
  const value = useMemo(() => ({
    language,
    setLanguage,
    transcriptionLanguage,
    setTranscriptionLanguage,
    t,
    supportedLanguages: SUPPORTED_LANGUAGES,
    currentLanguageInfo,
    isLoading,
  }), [language, transcriptionLanguage, t, currentLanguageInfo, isLoading, setLanguage, setTranscriptionLanguage]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// Hook to use language context
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

// Export i18n instance for direct use if needed
export { i18n };
