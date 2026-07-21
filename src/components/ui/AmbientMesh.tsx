// src/components/ui/AmbientMesh.tsx
'use client';

import { useSyncExternalStore } from 'react';
import { useVOTheme } from '@/hooks/useVOTheme';

/**
 * Ambient mesh gradient background component.
 * Renders a decorative animated gradient background for themes that support it.
 * Only the dark palette (Neon, Obsidian) has a mesh; light themes (Zen, Paper)
 * define --vo-mesh-gradient: none.
 *
 * Uses mounted state to prevent hydration mismatch since theme resolution
 * happens client-side via next-themes.
 */
export function AmbientMesh() {
  const { theme } = useVOTheme();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  // Return null during SSR and initial hydration
  if (!mounted) {
    return null;
  }

  // Only render for themes that use mesh gradient
  if (theme === 'zen' || theme === 'paper') {
    return null;
  }

  return (
    <div
      className="vo-ambient-mesh"
      aria-hidden="true"
      data-theme-mesh
    />
  );
}
