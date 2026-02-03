/**
 * Internationalization (i18n) Configuration
 * Supports English, Turkish, and Spanish
 */

import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en';
import tr from './locales/tr';
import es from './locales/es';

// Create i18n instance
const i18n = new I18n({
  en,
  tr,
  es,
});

// Configuration
i18n.defaultLocale = 'en';
i18n.enableFallback = true;

// Storage key for language preference
const LANGUAGE_STORAGE_KEY = '@fieldconnect_language';

// Supported languages
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'tr', name: 'Turkish', nativeName: 'Turkce', flag: '🇹🇷' },
  { code: 'es', name: 'Spanish', nativeName: 'Espanol', flag: '🇪🇸' },
] as const;

export type LanguageCode = 'en' | 'tr' | 'es';

/**
 * Initialize language from storage or device locale
 */
export async function initializeLanguage(): Promise<LanguageCode> {
  try {
    // Check for saved preference
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (savedLanguage && isValidLanguage(savedLanguage)) {
      i18n.locale = savedLanguage;
      return savedLanguage as LanguageCode;
    }

    // Fall back to device locale
    const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
    const language = isValidLanguage(deviceLocale) ? deviceLocale : 'en';
    i18n.locale = language;
    return language as LanguageCode;
  } catch (error) {
    console.error('[i18n] Error initializing language:', error);
    i18n.locale = 'en';
    return 'en';
  }
}

/**
 * Set the current language and save preference
 */
export async function setLanguage(language: LanguageCode): Promise<void> {
  try {
    i18n.locale = language;
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch (error) {
    console.error('[i18n] Error saving language:', error);
  }
}

/**
 * Get current language
 */
export function getCurrentLanguage(): LanguageCode {
  return i18n.locale as LanguageCode;
}

/**
 * Check if a language code is supported
 */
export function isValidLanguage(code: string): code is LanguageCode {
  return ['en', 'tr', 'es'].includes(code);
}

/**
 * Get Whisper-compatible language code for transcription
 */
export function getTranscriptionLanguageCode(language: LanguageCode): string {
  const transcriptionCodes: Record<LanguageCode, string> = {
    en: 'en',
    tr: 'tr',
    es: 'es',
  };
  return transcriptionCodes[language] || 'en';
}

/**
 * Translation function - shorthand for i18n.t()
 */
export function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}

export { i18n };
export default i18n;
