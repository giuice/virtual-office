// src/components/ui/AmbientMesh.tsx
'use client';

import { useState, useEffect } from 'react';
import { useVOTheme } from '@/hooks/useVOTheme';

/**
 * Ambient mesh gradient background component.
 * Renders a decorative animated gradient background for themes that support it.
 * Automatically hidden for themes without mesh (Obsidian, Paper).
 * 
 * Uses mounted state to prevent hydration mismatch since theme resolution
 * happens client-side via next-themes.
 */
export function AmbientMesh() {
  const { theme } = useVOTheme();
  const [mounted, setMounted] = useState(false);

  // Only render after client-side hydration to prevent SSR mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Return null during SSR and initial hydration
  if (!mounted) {
    return null;
  }

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
