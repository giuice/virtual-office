// src/hooks/useVOTheme.ts
'use client';

import { useVOThemeContext, VOTheme, VO_THEME_METADATA, VO_THEMES, VOThemeMetadata } from '@/contexts/ThemeContext';

/**
 * Hook for accessing and controlling Virtual Office themes.
 * Provides theme state, setters, and metadata.
 * 
 * @example
 * ```tsx
 * const { theme, setTheme, themes, themeMetadata } = useVOTheme();
 * 
 * // Switch to neon theme
 * setTheme('neon');
 * 
 * // Check if current theme is dark
 * if (themeMetadata.isDark) {
 *   // Apply dark-specific logic
 * }
 * ```
 */
export function useVOTheme() {
  const context = useVOThemeContext();
  return context;
}

/**
 * Hook for getting theme metadata without setting capabilities.
 * Useful for components that only need to read theme info.
 */
export function useVOThemeMetadata(): VOThemeMetadata {
  const { themeMetadata } = useVOThemeContext();
  return themeMetadata;
}

/**
 * Hook for checking if current theme is dark.
 */
export function useIsDarkTheme(): boolean {
  const { themeMetadata } = useVOThemeContext();
  return themeMetadata.isDark;
}

/**
 * Utility to get theme metadata by name.
 */
export function getThemeMetadata(theme: VOTheme): VOThemeMetadata {
  return VO_THEME_METADATA[theme];
}

/**
 * Check if a string is a valid VO theme.
 */
export function isValidVOTheme(value: string): value is VOTheme {
  return VO_THEMES.includes(value as VOTheme);
}

// Re-export types for convenience
export type { VOTheme, VOThemeMetadata };
export { VO_THEMES, VO_THEME_METADATA };
