// src/components/ui/AmbientMesh.tsx
'use client';

import { useVOTheme } from '@/hooks/useVOTheme';

/**
 * Ambient mesh gradient background component.
 * Renders a decorative animated gradient background for themes that support it.
 * Automatically hidden for themes without mesh (Obsidian, Paper).
 */
export function AmbientMesh() {
  const { theme } = useVOTheme();

  // Only render for themes that use mesh gradient
  if (theme === 'obsidian' || theme === 'paper') {
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

export default AmbientMesh;
