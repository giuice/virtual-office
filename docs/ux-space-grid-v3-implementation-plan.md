# Virtual Office: Space Grid v3 Implementation Plan

This document outlines the step-by-step plan to implement the "Reality Distortion" and "Tactile Glassmorphism" UX concepts from the `ux-space-grid-v3.html` prototype into the Next.js/Tailwind/shadcn architecture of Virtual Office.

## 1. Create Reality Distortion Theme System
**Goal:** Move away from hardcoded CSS variables in a single file and integrate these themes into Tailwind.

*   **Action:** Update `tailwind.config.ts` (or `app/globals.css`) to define our new color palettes (Neon, Zen, Obsidian, Paper).
*   **Action:** Use CSS variables mapped to Tailwind colors so we can easily switch themes by changing a `data-theme` attribute on the `<body>`.

## 2. Implement Tactile Glassmorphism Utilities
**Goal:** Make the premium frosted glass and dynamic glow available as reusable Tailwind classes or React components.

*   **Action:** Create a reusable `GlassPanel` component (or extend shadcn's `Card`) that includes the SVG noise texture overlay (`.noise-overlay`).
*   **Action:** Create a `useMouseGlow` hook that tracks mouse position and applies the `--mouse-x` and `--mouse-y` CSS variables to the card for that dynamic specular highlight (`.glow-overlay`).

## 3. Build Organic Attention Beacon Component
**Goal:** Upgrade the current beacon to the double-ring spring animation.

*   **Action:** Create a new `AttentionBeacon` component (or update the existing one).
*   **Action:** Use Tailwind's `animate-ping` as a base, but write a custom `@keyframes` in our global CSS for that specific `organic-ripple` effect to get the timing right.

## 4. Upgrade Avatar Constellation Component
**Goal:** Make the avatars expressive and handle the "speaking" state gracefully.

*   **Action:** Update `UserAvatarPresence.tsx` (or the relevant avatar component).
*   **Action:** Add the `speaking-pulse` animation and the Z-axis translation on hover. Ensure it handles overflow (the `+4` badge) cleanly.

## 5. Refactor SpaceCard with Container Queries
**Goal:** The card needs to adapt its internal layout based on its width (Cinema mode vs. Orbit mode).

*   **Action:** Refactor the `SpaceCard` component.
*   **Action:** Use Tailwind's `@container` queries (e.g., `@container/space`) to change the layout from stacked to split-pane when the card gets wide enough.
*   **Action:** Integrate the `GlassPanel` and `useMouseGlow` here.

## 6. Implement Multi-Perspective Layout Switcher
**Goal:** Add controls to switch between Orbit, Analyst, and Cinema modes.

*   **Action:** Update the `SpaceGridOverview` (or the main floor plan container).
*   **Action:** Use a state variable to track the current layout mode and apply different CSS Grid classes (e.g., `grid-cols-[repeat(auto-fill,minmax(320px,1fr))]` for Orbit) based on that state.
