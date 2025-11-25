# Story 3.1: Reality Distortion Engine (Theme System)

Status: ready-for-dev

## Story

As a user,
I want to switch between different visual themes (Neon, Zen, Obsidian, Paper),
So that I can align the workspace with my current mood or lighting conditions.

## Acceptance Criteria

1. **AC1 – Theme Switcher UI**
   - Theme switcher UI available in header/settings area (dropdown or palette selector).
   - Switcher is keyboard-accessible and screen-reader friendly.
   - [Source: docs/epics.md#story-3.1-reality-distortion-engine-theme-system]

2. **AC2 – CSS Variable Token System**
   - All themes implemented via CSS custom properties (variables).
   - Tailwind tokens extended for semantic aliases (`--vo-signal-critical`, `--vo-accent`, etc.).
   - Variables support colors, gradients, shadows, and glass effects.
   - [Source: docs/ux-design-specification.md#3.1-color-system]

3. **AC3 – Neon Cyberpunk Theme**
   - High contrast, void black base (`#050505`).
   - Cyan (`#00F2FF`) and Magenta (`#FF00FF`) accent signals.
   - Gradient mesh background with blur effects.
   - [Source: docs/ux-space-grid-v2.html - Neon theme]

4. **AC4 – Zen Garden Theme**
   - Soft earth tones, rice paper base (`#F4F1EA`).
   - Moss green text (`#3D4C41`), clay accents (`#D48C70`).
   - Minimal gradients, subtle natural feel.
   - [Source: docs/ux-color-themes.html - Zen Garden]

5. **AC5 – Obsidian Stealth Theme**
   - True black base (`#000000`), carbon surfaces (`#1A1A1A`).
   - White text, minimal decorative elements.
   - No gradient mesh, clean monochrome aesthetic.
   - [Source: docs/ux-space-grid-v2.html - Obsidian theme]

6. **AC6 – Paper White Theme**
   - Pure white base (`#FFFFFF`), ink black text (`#111111`).
   - Red signals (`#FF3B30`) for attention/critical states.
   - Clean, document-like appearance.
   - [Source: docs/ux-space-grid-v2.html - Paper theme]

7. **AC7 – Theme Persistence**
   - Theme preference persists in `users.preferences.theme` via Supabase.
   - Falls back to localStorage for unauthenticated users.
   - Default theme: system preference (light/dark) maps to Paper/Obsidian.
   - [Source: docs/epics.md#story-3.1]

8. **AC8 – Instant Theme Switching**
   - Theme changes apply instantly without page reload.
   - Smooth transition animation (300-400ms) for color changes.
   - No flash of unstyled content (FOUC).
   - [Source: docs/ux-design-specification.md]

## Tasks / Subtasks

### Task 1: CSS Token Foundation (AC2)
- [ ] 1.1 Create `src/styles/themes/tokens.css` with base CSS custom properties structure.
- [ ] 1.2 Define semantic token aliases (`--vo-bg-base`, `--vo-text-primary`, `--vo-signal-critical`, `--vo-accent`, `--vo-glass-bg`, `--vo-glass-border`).
- [ ] 1.3 Extend `globals.css` to import theme tokens and set up theme data attributes.
- [ ] 1.4 Update `tailwind.config.ts` to reference new CSS variables for Tailwind utility classes.
- [ ] 1.5 Add transition utilities for smooth theme switching (`transition-colors`, `transition-all`).

### Task 2: Theme Definitions (AC3, AC4, AC5, AC6)
- [ ] 2.1 Create `[data-theme="neon"]` CSS block with Neon Cyberpunk tokens:
  - `--vo-bg-base: #050505`
  - `--vo-text-primary: #ffffff`
  - `--vo-accent: #00f2ff`
  - `--vo-signal-critical: #ff00ff`
  - `--vo-glass-bg: rgba(10, 10, 16, 0.7)`
  - `--vo-mesh-gradient` for ambient background
- [ ] 2.2 Create `[data-theme="zen"]` CSS block with Zen Garden tokens:
  - `--vo-bg-base: #f4f1ea`
  - `--vo-text-primary: #3d4c41`
  - `--vo-accent: #6b8c76`
  - `--vo-signal-critical: #d48c70`
- [ ] 2.3 Create `[data-theme="obsidian"]` CSS block with Obsidian Stealth tokens:
  - `--vo-bg-base: #000000`
  - `--vo-text-primary: #e0e0e0`
  - `--vo-accent: #ffffff`
  - No mesh gradient, minimal shadows
- [ ] 2.4 Create `[data-theme="paper"]` CSS block with Paper White tokens:
  - `--vo-bg-base: #ffffff`
  - `--vo-text-primary: #111111`
  - `--vo-signal-critical: #ff3b30`
- [ ] 2.5 Add ambient mesh gradient component for themes that support it (Neon).

### Task 3: Theme Context & Hook (AC7, AC8)
- [ ] 3.1 Create `src/contexts/ThemeContext.tsx` extending next-themes with Virtual Office themes.
- [ ] 3.2 Create `useVOTheme` hook exposing: `theme`, `setTheme`, `themes`, `resolvedTheme`.
- [ ] 3.3 Implement theme persistence to Supabase `users.preferences.theme` for authenticated users.
- [ ] 3.4 Add localStorage fallback for unauthenticated users.
- [ ] 3.5 Map system preference (prefers-color-scheme) to default VO theme (light→paper, dark→obsidian).

### Task 4: Theme Switcher Component (AC1)
- [ ] 4.1 Create `src/components/ui/ThemeSwitcher.tsx` using Radix DropdownMenu.
- [ ] 4.2 Display theme options with color preview swatches.
- [ ] 4.3 Mark current theme with checkmark/highlight.
- [ ] 4.4 Add keyboard navigation (arrow keys, Enter to select).
- [ ] 4.5 Add `aria-label` and screen reader announcements for accessibility.
- [ ] 4.6 Optional: Add keyboard shortcuts hint (future enhancement).

### Task 5: Integration & Layout Updates (AC8)
- [ ] 5.1 Update `src/app/layout.tsx` to use enhanced ThemeProvider with VO themes.
- [ ] 5.2 Add ThemeSwitcher to dashboard header or settings dropdown.
- [ ] 5.3 Apply `data-theme` attribute to `<html>` or `<body>` element.
- [ ] 5.4 Add ambient mesh background component to root layout (conditionally rendered per theme).
- [ ] 5.5 Test theme switching in dashboard, floor plan, and messaging drawer contexts.

### Task 6: Theme Sync with User Profile (AC7)
- [ ] 6.1 Update `useAuth` or create `useUserPreferences` hook to sync theme preference.
- [ ] 6.2 On login, apply user's saved theme preference.
- [ ] 6.3 On theme change, debounce and persist to Supabase (avoid excessive writes).
- [ ] 6.4 Handle offline state: queue preference update for sync on reconnect.

### Task 7: Testing & Validation (AC1-AC8)
- [ ] 7.1 Visual regression: capture screenshots of all 4 themes in key views (dashboard, floor plan, drawer).
- [ ] 7.2 Accessibility audit: ensure contrast ratios meet WCAG 2.1 AA (4.5:1 text, 3:1 UI).
- [ ] 7.3 Test theme persistence: refresh page, log out/in, verify theme restores.
- [ ] 7.4 Test instant switching: no FOUC, smooth transitions.
- [ ] 7.5 Test keyboard navigation in ThemeSwitcher.
- [ ] 7.6 Manual testing checklist across Chrome, Firefox, Safari.

## Dev Notes

### ⚠️ CRITICAL: Source of Truth for Styles
**`docs/ux-space-grid-v2.html`** is the authoritative reference for all theme tokens, colors, and CSS variables. Any conflicts between documentation or existing code must defer to this file.

Extract theme tokens directly from the CSS in `ux-space-grid-v2.html`:
- `[data-theme="neon"]` - Neon Cyberpunk theme
- `[data-theme="zen"]` - Zen Garden theme  
- `[data-theme="obsidian"]` - Obsidian Stealth theme
- `[data-theme="paper"]` - Paper White theme

### Requirements Context Summary
- The "Reality Distortion Engine" is the foundation for Epic 3's visual overhaul.
- This story provides the CSS variable infrastructure that all subsequent Epic 3 stories depend on (SpaceCard, AvatarConstellation, NowBoard, etc.).
- Themes must work with existing shadcn/ui components without breaking them.
- Priority is investor demos - visual polish matters.
- [Source: docs/ux-design-specification.md#1.1-design-system-choice]

### Existing Infrastructure
- **next-themes**: Already integrated via `ThemeProvider` in `src/providers/theme-provider.tsx`.
- **Tailwind CSS 4**: Using `@theme` directive and CSS custom properties in `globals.css`.
- **shadcn/ui**: Components rely on `--background`, `--foreground`, `--primary`, etc. variables.
- **User preferences**: `users.preferences.theme` field exists in database schema.

### Architecture Decisions
- **Extend next-themes**: Don't replace, extend. Add VO-specific themes alongside light/dark.
- **CSS-first approach**: All theme tokens as CSS custom properties for maximum flexibility.
- **Semantic aliases**: Use `--vo-*` prefix for Virtual Office tokens to avoid conflicts with shadcn.
- **Layered inheritance**: VO tokens can reference shadcn tokens where appropriate.

### Theme Token Structure
```css
[data-theme="neon"] {
  /* Base colors */
  --vo-bg-base: #050505;
  --vo-bg-surface: rgba(20, 20, 25, 0.6);
  --vo-text-primary: #ffffff;
  --vo-text-muted: #8b9bb4;
  
  /* Semantic colors */
  --vo-accent: #00f2ff;
  --vo-signal-critical: #ff00ff;
  --vo-signal-warning: #f4c759;
  --vo-signal-success: #4acf81;
  
  /* Glass morphism */
  --vo-glass-bg: rgba(10, 10, 16, 0.7);
  --vo-glass-border: rgba(255, 255, 255, 0.1);
  --vo-glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  
  /* Effects */
  --vo-mesh-gradient: radial-gradient(...);
  --vo-beacon-glow: rgba(0, 242, 255, 0.8);
  
  /* Map to shadcn tokens for component compatibility */
  --background: var(--vo-bg-base);
  --foreground: var(--vo-text-primary);
  --primary: var(--vo-accent);
  /* etc. */
}
```

### Project Structure Alignment
- Theme tokens: `src/styles/themes/` (new directory)
- Theme context: `src/contexts/ThemeContext.tsx` (new)
- Theme hook: `src/hooks/useVOTheme.ts` (new)
- ThemeSwitcher: `src/components/ui/ThemeSwitcher.tsx` (new)
- [Source: docs/architecture.md#project-structure-scoped]

### Dependencies & Risk Notes
- Ensure shadcn components remain functional with new theme tokens.
- Test dark mode preference detection on various browsers.
- Consider bundle size impact of ambient mesh gradient (CSS-only preferred).
- Supabase sync should be debounced to prevent excessive API calls.

### References
- **🎯 SOURCE OF TRUTH: docs/ux-space-grid-v2.html** (theme tokens, colors, effects)
- docs/epics.md#story-3.1-reality-distortion-engine-theme-system
- docs/ux-design-specification.md#3.1-color-system
- docs/ux-color-themes.html (supplementary color reference)
- src/providers/theme-provider.tsx (existing next-themes setup)
- src/app/globals.css (current CSS variable structure)

## Dev Agent Record

### Context Reference
- Story context file: `docs/stories/3.1-reality-distortion-engine.context.xml` ✅ Created 2025-11-25

### Agent Model Used
_To be filled by dev agent_

### Debug Log References
_To be filled during implementation_

### Completion Notes List
_To be filled during implementation_

### File List
_To be filled during implementation - expected files:_
- src/styles/themes/tokens.css (new)
- src/styles/themes/neon.css (new)
- src/styles/themes/zen.css (new)
- src/styles/themes/obsidian.css (new)
- src/styles/themes/paper.css (new)
- src/contexts/ThemeContext.tsx (new)
- src/hooks/useVOTheme.ts (new)
- src/components/ui/ThemeSwitcher.tsx (new)
- src/app/globals.css (modified)
- src/app/layout.tsx (modified)
- tailwind.config.ts (modified)

## Change Log

- 2025-11-25: Story drafted via Scrum Master agent for Epic 3 visual foundation work.
