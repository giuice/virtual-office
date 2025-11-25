// src/contexts/ThemeContext.tsx
'use client';

import { createContext, useContext, useCallback, useEffect, useState, useMemo } from 'react';
import { useTheme as useNextTheme } from 'next-themes';
import { useAuth } from '@/contexts/AuthContext';
import { getUserById } from '@/lib/api';

/** Virtual Office theme names */
export type VOTheme = 'neon' | 'zen' | 'obsidian' | 'paper';

/** All available themes */
export const VO_THEMES: VOTheme[] = ['neon', 'zen', 'obsidian', 'paper'];

/** Theme metadata for UI display */
export interface VOThemeMetadata {
  name: VOTheme;
  label: string;
  description: string;
  previewColors: {
    bg: string;
    accent: string;
    text: string;
  };
  isDark: boolean;
}

export const VO_THEME_METADATA: Record<VOTheme, VOThemeMetadata> = {
  neon: {
    name: 'neon',
    label: 'Neon Cyberpunk',
    description: 'High contrast void with cyan and magenta accents',
    previewColors: {
      bg: '#050505',
      accent: '#00f2ff',
      text: '#ffffff',
    },
    isDark: true,
  },
  zen: {
    name: 'zen',
    label: 'Zen Garden',
    description: 'Soft earth tones with natural moss accents',
    previewColors: {
      bg: '#f4f1ea',
      accent: '#6b8c76',
      text: '#3d4c41',
    },
    isDark: false,
  },
  obsidian: {
    name: 'obsidian',
    label: 'Obsidian Stealth',
    description: 'True black monochrome minimalism',
    previewColors: {
      bg: '#000000',
      accent: '#ffffff',
      text: '#e0e0e0',
    },
    isDark: true,
  },
  paper: {
    name: 'paper',
    label: 'Paper White',
    description: 'Clean document aesthetic with ink black text',
    previewColors: {
      bg: '#ffffff',
      accent: '#111111',
      text: '#111111',
    },
    isDark: false,
  },
};

interface VOThemeContextType {
  /** Current active theme */
  theme: VOTheme;
  /** Set theme (persists to Supabase for authenticated users) */
  setTheme: (theme: VOTheme) => void;
  /** All available themes */
  themes: VOTheme[];
  /** Theme metadata for current theme */
  themeMetadata: VOThemeMetadata;
  /** All theme metadata */
  allThemeMetadata: typeof VO_THEME_METADATA;
  /** Resolved theme (after system preference) */
  resolvedTheme: VOTheme;
  /** Whether system preference is being used */
  isSystemPreference: boolean;
  /** Whether theme is loading/syncing */
  isLoading: boolean;
}

const VOThemeContext = createContext<VOThemeContextType | undefined>(undefined);

/** Debounce helper */
function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number
): (...args: TArgs) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: TArgs) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

interface VOThemeProviderProps {
  children: React.ReactNode;
  /** Default theme if none is set */
  defaultTheme?: VOTheme;
}

export function VOThemeProvider({ children, defaultTheme = 'paper' }: VOThemeProviderProps) {
  const { theme: nextTheme, setTheme: setNextTheme, systemTheme } = useNextTheme();
  const { user, isAuthReady } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [initialSyncDone, setInitialSyncDone] = useState(false);

  // Map system theme to VO theme (light -> paper, dark -> obsidian)
  const mapSystemTheme = useCallback((sysTheme: string | undefined): VOTheme => {
    if (sysTheme === 'dark') return 'obsidian';
    return 'paper';
  }, []);

  // Determine current theme
  const currentTheme = useMemo((): VOTheme => {
    if (nextTheme === 'system') {
      return mapSystemTheme(systemTheme);
    }
    // Validate that nextTheme is a valid VO theme
    if (VO_THEMES.includes(nextTheme as VOTheme)) {
      return nextTheme as VOTheme;
    }
    return defaultTheme;
  }, [nextTheme, systemTheme, mapSystemTheme, defaultTheme]);

  const resolvedTheme = useMemo((): VOTheme => {
    return currentTheme;
  }, [currentTheme]);

  const isSystemPreference = nextTheme === 'system';

  // Persist theme to Supabase (debounced)
  const persistThemeToSupabase = useMemo(
    () =>
      debounce(async (userId: string, themeValue: VOTheme) => {
        try {
          // Get user profile first to get the database ID
          const userProfile = await getUserById(userId);
          if (!userProfile) {
            console.warn('No user profile found for theme persistence');
            return;
          }

          const response = await fetch(`/api/users/update?id=${userProfile.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              preferences: {
                ...userProfile.preferences,
                theme: themeValue,
              },
            }),
          });

          if (!response.ok) {
            console.error('Failed to persist theme preference:', await response.text());
          }
        } catch (error) {
          console.error('Error persisting theme to Supabase:', error);
        }
      }, 1000),
    []
  );

  // Load user's theme preference on auth ready
  useEffect(() => {
    async function loadUserTheme() {
      if (!isAuthReady || !user || initialSyncDone) return;

      setIsLoading(true);
      try {
        const userProfile = await getUserById(user.id);
        if (userProfile?.preferences?.theme) {
          const savedTheme = userProfile.preferences.theme as string;
          if (VO_THEMES.includes(savedTheme as VOTheme)) {
            setNextTheme(savedTheme);
          }
        }
      } catch (error) {
        console.error('Error loading user theme preference:', error);
      } finally {
        setIsLoading(false);
        setInitialSyncDone(true);
      }
    }

    loadUserTheme();
  }, [isAuthReady, user, initialSyncDone, setNextTheme]);

  // Mark loading complete for unauthenticated users
  useEffect(() => {
    if (isAuthReady && !user) {
      setIsLoading(false);
      setInitialSyncDone(true);
    }
  }, [isAuthReady, user]);

  // Apply theme to HTML element
  useEffect(() => {
    const html = document.documentElement;
    
    // Enable transitions after initial load
    if (initialSyncDone) {
      html.setAttribute('data-theme-transition', 'true');
      // Remove after transitions complete to prevent interference with other animations
      const timeout = setTimeout(() => {
        html.removeAttribute('data-theme-transition');
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [currentTheme, initialSyncDone]);

  const setTheme = useCallback(
    (newTheme: VOTheme) => {
      setNextTheme(newTheme);

      // Persist to Supabase for authenticated users
      if (user) {
        persistThemeToSupabase(user.id, newTheme);
      }
    },
    [setNextTheme, user, persistThemeToSupabase]
  );

  const value: VOThemeContextType = useMemo(
    () => ({
      theme: currentTheme,
      setTheme,
      themes: VO_THEMES,
      themeMetadata: VO_THEME_METADATA[currentTheme],
      allThemeMetadata: VO_THEME_METADATA,
      resolvedTheme,
      isSystemPreference,
      isLoading,
    }),
    [currentTheme, setTheme, resolvedTheme, isSystemPreference, isLoading]
  );

  return <VOThemeContext.Provider value={value}>{children}</VOThemeContext.Provider>;
}

export function useVOThemeContext() {
  const context = useContext(VOThemeContext);
  if (context === undefined) {
    throw new Error('useVOThemeContext must be used within a VOThemeProvider');
  }
  return context;
}
