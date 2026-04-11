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
    const newTheme: ColorScheme = colorScheme === 'dark' ? 'light' : 'dark';
    globalTheme = newTheme;
    localStorage.setItem('theme', newTheme);
    if (globalSetTheme) {
      globalSetTheme(newTheme);
    }
    // Force re-render by dispatching storage event
    window.dispatchEvent(new Event('themechange'));
  }, [colorScheme]);

  return { colorScheme, toggleTheme };
}
