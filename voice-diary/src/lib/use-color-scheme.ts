import { useState, useEffect, useCallback } from 'react';

type ColorScheme = 'light' | 'dark';

// Global state to share across components
let globalTheme: ColorScheme | null = null;
let globalSetTheme: ((theme: ColorScheme) => void) | null = null;

export function useColorScheme(): ColorScheme {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => {
    if (globalTheme) return globalTheme;
    // Check localStorage first
    const saved = localStorage.getItem('theme') as ColorScheme | null;
    if (saved === 'dark' || saved === 'light') {
      globalTheme = saved;
      return saved;
    }
    // Default to light for better visibility
    globalTheme = 'light';
    return 'light';
  });

  useEffect(() => {
    globalSetTheme = setColorScheme;
    return () => {
      globalSetTheme = null;
    };
  }, []);

  useEffect(() => {
    globalTheme = colorScheme;
    localStorage.setItem('theme', colorScheme);
    // Update document class for Tailwind dark mode
    if (colorScheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [colorScheme]);

  return colorScheme;
}

export function useThemeToggle() {
  const colorScheme = useColorScheme();

  const toggleTheme = useCallback(() => {
    // Use globalTheme to get current value (avoids stale closure)
    const currentTheme = globalTheme || 'light';
    const newTheme: ColorScheme = currentTheme === 'dark' ? 'light' : 'dark';
    globalTheme = newTheme;
    localStorage.setItem('theme', newTheme);
    // Update document class immediately
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    if (globalSetTheme) {
      globalSetTheme(newTheme);
    }
  }, []);

  return { colorScheme, toggleTheme };
}
