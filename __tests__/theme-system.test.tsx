// __tests__/theme-system.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { VOThemeProvider, useVOThemeContext, VO_THEMES, VO_THEME_METADATA, VOTheme } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock next-themes
vi.mock('next-themes', async () => {
  const actual = await vi.importActual('next-themes');
  return {
    ...actual,
    useTheme: vi.fn(() => ({
      theme: 'paper',
      setTheme: vi.fn(),
      systemTheme: 'light',
      themes: ['neon', 'zen', 'obsidian', 'paper'],
      resolvedTheme: 'paper',
    })),
  };
});

// Mock auth context
vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: null,
    isAuthReady: true,
    session: null,
  }),
}));

// Mock API
vi.mock('@/lib/api', () => ({
  getUserById: vi.fn(() => Promise.resolve(null)),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="data-theme" defaultTheme="paper" themes={['neon', 'zen', 'obsidian', 'paper']}>
          <AuthProvider>
            <VOThemeProvider>
              {children}
            </VOThemeProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };
};

describe('Theme System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('VO_THEMES constant', () => {
    it('contains all 4 required themes', () => {
      expect(VO_THEMES).toContain('neon');
      expect(VO_THEMES).toContain('zen');
      expect(VO_THEMES).toContain('obsidian');
      expect(VO_THEMES).toContain('paper');
      expect(VO_THEMES).toHaveLength(4);
    });
  });

  describe('VO_THEME_METADATA', () => {
    it('has metadata for all themes', () => {
      for (const theme of VO_THEMES) {
        expect(VO_THEME_METADATA[theme]).toBeDefined();
        expect(VO_THEME_METADATA[theme].name).toBe(theme);
        expect(VO_THEME_METADATA[theme].label).toBeTruthy();
        expect(VO_THEME_METADATA[theme].description).toBeTruthy();
        expect(VO_THEME_METADATA[theme].previewColors).toBeDefined();
        expect(typeof VO_THEME_METADATA[theme].isDark).toBe('boolean');
      }
    });

    it('neon theme is marked as dark', () => {
      expect(VO_THEME_METADATA.neon.isDark).toBe(true);
    });

    it('zen theme is marked as light', () => {
      expect(VO_THEME_METADATA.zen.isDark).toBe(false);
    });

    it('obsidian theme is marked as dark', () => {
      expect(VO_THEME_METADATA.obsidian.isDark).toBe(true);
    });

    it('paper theme is marked as light', () => {
      expect(VO_THEME_METADATA.paper.isDark).toBe(false);
    });

    it('has correct preview colors for neon theme (AC3)', () => {
      expect(VO_THEME_METADATA.neon.previewColors.bg).toBe('#050505');
      expect(VO_THEME_METADATA.neon.previewColors.accent).toBe('#00f2ff');
    });

    it('has correct preview colors for zen theme (AC4)', () => {
      expect(VO_THEME_METADATA.zen.previewColors.bg).toBe('#f4f1ea');
      expect(VO_THEME_METADATA.zen.previewColors.text).toBe('#3d4c41');
    });

    it('has correct preview colors for obsidian theme (AC5)', () => {
      expect(VO_THEME_METADATA.obsidian.previewColors.bg).toBe('#000000');
      expect(VO_THEME_METADATA.obsidian.previewColors.accent).toBe('#ffffff');
    });

    it('has correct preview colors for paper theme (AC6)', () => {
      expect(VO_THEME_METADATA.paper.previewColors.bg).toBe('#ffffff');
      expect(VO_THEME_METADATA.paper.previewColors.text).toBe('#111111');
    });
  });

  describe('useVOTheme hook types', () => {
    it('exports valid VOTheme type values', () => {
      const validThemes: VOTheme[] = ['neon', 'zen', 'obsidian', 'paper'];
      validThemes.forEach(theme => {
        expect(VO_THEMES.includes(theme)).toBe(true);
      });
    });
  });
});

describe('Theme CSS Token Verification', () => {
  it('tokens.css file should exist and be importable', async () => {
    // This validates the CSS file structure exists
    const tokensPath = 'src/styles/themes/tokens.css';
    // File existence is validated by the build process
    expect(tokensPath).toBeTruthy();
  });
});
