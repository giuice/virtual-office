# Story 3.3: Avatar Constellation V2

Status: done

## Story

As a user,
I want to see my colleagues' photos with clear status indicators,
So that I can instantly recognize who is speaking or listening.

## Acceptance Criteria

1. **AC1 – Enhanced UserAvatarPresence Component**
   - Extend existing `UserAvatarPresence.tsx` with new visual states and styling.
   - Add support for speaking, presenting, and muted/observer states.
   - Preserve all existing functionality (click handlers, tooltips, presence status).
   - [Source: docs/epics.md#story-3.3-avatar-constellation-v2]

2. **AC2 – Photo-First Design (36px Circular Avatars)**
   - Circular avatars at 36px size with 2px border.
   - Border color inherits from theme tokens (`--vo-card-bg`).
   - Continues using `EnhancedAvatarV2` internally for consistent avatar rendering.
   - [Source: docs/ux-space-grid-v2.html - .avatar]

3. **AC3 – Animated Status Rings**
   - Box-shadow glow for "Speaking" state using theme accent color (`--vo-accent`).
   - Solid border for "Presenting" state (2px accent color).
   - Dimmed opacity (0.5) for "Observer/Muted" state.
   - Pulse animation (2s duration) for active speaking indicator.
   - [Source: docs/ux-design-specification.md#6.1-component-strategy - AvatarConstellation]

4. **AC4 – Smart Stacking with Negative Margin Overlap in ModernSpaceCard**
   - Update `ModernSpaceCard.tsx` avatar section to use negative margin overlap (-10px).
   - Maximum 4 visible avatars in default state (reduce from current 8).
   - Proper z-index layering (rightmost avatar on top).
   - Avatars maintain 8px minimum separation per UX spec.
   - [Source: docs/ux-space-grid-v2.html - .avatars-row]

5. **AC5 – Overflow Badge for 5+ Participants**
   - "+N" badge displayed when participants exceed max visible count.
   - Badge styled using theme tokens (`--vo-pill-bg`, `--vo-pill-text`).
   - Badge positioned as last avatar in row (update existing Badge in ModernSpaceCard).
   - Click on badge expands to show all participants (optional stretch goal).
   - [Source: docs/ux-space-grid-v2.html - overflow avatar]

6. **AC6 – Hover Interaction with Scale Transform**
   - Hover on avatar: `translateY(-3px) scale(1.1)` with z-index bump.
   - Transition: 0.2s ease for smooth interaction.
   - Tooltips show name, role, and status on hover.
   - [Source: docs/ux-space-grid-v2.html - .avatar:hover]

7. **AC7 – Theme-Aware Styling**
   - All colors inherit from CSS variables defined in Story 3.1.
   - Component adapts to all four themes: Neon, Zen, Obsidian, Paper.
   - Speaking glow uses `--vo-accent` color token.
   - Border uses `--vo-card-bg` for contrast against card background.
   - [Source: docs/ux-space-grid-v2.html - theme definitions]

## Tasks / Subtasks

### Task 1: CSS Token Extensions for Avatar Status States (AC3, AC7)
- [x] 1.1 Add avatar-specific CSS tokens to `src/styles/themes/tokens.css`:
  - `--vo-avatar-border` (inherits from `--vo-card-bg`)
  - `--vo-avatar-speaking-glow` (inherits from `--vo-accent`)
  - `--vo-avatar-presenting-border` (inherits from `--vo-accent`)
  - `--vo-avatar-muted-opacity` (0.5)
- [x] 1.2 Add speaking pulse animation keyframes to tokens.css.
- [x] 1.3 Ensure tokens work across all 4 themes (Neon, Zen, Obsidian, Paper).
- [x] 1.4 Extend `tailwind.config.ts` with new `vo-avatar-*` utility classes if needed.

### Task 2: Enhance UserAvatarPresence Props Interface (AC1, AC3)
- [x] 2.1 Update `src/components/floor-plan/UserAvatarPresence.tsx` props interface:
  - Add `isSpeaking?: boolean` prop
  - Add `isPresenting?: boolean` prop
  - Add `isMuted?: boolean` prop (for observer/muted state)
  - Add `size?: 'sm' | 'md' | 'lg'` prop (default 'md' = 36px)
- [x] 2.2 Update component to accept and use new props.
- [x] 2.3 Preserve all existing functionality (click handlers, tooltips, status indicator).

### Task 3: Implement Status Ring Animations in UserAvatarPresence (AC3)
- [x] 3.1 Implement speaking state styling:
  - Box-shadow glow: `0 0 0 2px var(--vo-avatar-speaking-glow)`
  - Pulse animation: 2s infinite using CSS keyframes
- [x] 3.2 Implement presenting state styling:
  - Solid border: `2px solid var(--vo-avatar-presenting-border)`
  - No animation (static indicator)
- [x] 3.3 Implement observer/muted state styling:
  - Opacity: 0.5 (`var(--vo-avatar-muted-opacity)`)
  - Optional grayscale filter for visual cue
- [x] 3.4 Apply styles conditionally based on props.

### Task 4: Update ModernSpaceCard Avatar Section Layout (AC4)
- [x] 4.1 Modify avatar container in `ModernSpaceCard.tsx` from `flex-wrap gap-1` to inline-flex with negative margins.
- [x] 4.2 Implement negative margin overlap (-10px) via `ml-[-10px]` on avatars after first.
- [x] 4.3 Add z-index increment per avatar (using `style={{ zIndex: index }}`).
- [x] 4.4 Reduce max visible avatars from 8 to 4.
- [x] 4.5 Add left padding on container to compensate for first avatar overlap.

### Task 5: Update Overflow Badge Styling (AC5)
- [x] 5.1 Update overflow badge in `ModernSpaceCard.tsx` to match avatar size (36px circular).
- [x] 5.2 Style using theme tokens:
  - Background: `var(--vo-pill-bg)`
  - Text: `var(--vo-pill-text)`
- [x] 5.3 Position as last item in avatar row with proper z-index.
- [x] 5.4 Update tooltip to show "N more participants" on hover.
- [ ] 5.5 (Stretch) Add click-to-expand showing all participants in popover.

### Task 6: Add Hover Interactions to UserAvatarPresence (AC6)
- [x] 6.1 Add hover styles to avatar wrapper:
  - Transform: `translateY(-3px) scale(1.1)`
  - Transition: `0.2s ease`
  - Z-index bump on hover (z-50)
- [x] 6.2 Preserve existing tooltip behavior.
- [x] 6.3 Enhance tooltip to show status when speaking/presenting/muted:
  - Name (bold)
  - Status ("Speaking", "Presenting", "Muted", "Online", etc.)
- [x] 6.4 Ensure click-stop protocol preserved (`data-avatar-interactive`).

### Task 7: Theme Compatibility Testing (AC7)
- [x] 7.1 Test avatar styling renders correctly in Neon Cyberpunk theme.
- [x] 7.2 Test avatar styling renders correctly in Zen Garden theme.
- [x] 7.3 Test avatar styling renders correctly in Obsidian Stealth theme.
- [x] 7.4 Test avatar styling renders correctly in Paper White theme.
- [x] 7.5 Verify speaking glow color matches theme accent in all themes.

### Task 8: Accessibility Improvements (AC6)
- [x] 8.1 Ensure 44px minimum touch target on responsive breakpoints.
- [x] 8.2 Update screen reader announcement to include status (Speaking/Presenting/Muted).
- [x] 8.3 Ensure focus ring visible on keyboard navigation.
- [x] 8.4 Verify `data-avatar-interactive` attribute is present for click-stop protocol.

### Task 9: Unit Tests
- [x] 9.1 Test UserAvatarPresence renders with new status props.
- [x] 9.2 Test speaking state applies glow animation class.
- [x] 9.3 Test presenting state applies solid border class.
- [x] 9.4 Test muted state applies dimmed opacity.
- [x] 9.5 Test hover state applies correct transform.
- [x] 9.6 Test ModernSpaceCard limits visible avatars to 4.
- [x] 9.7 Test overflow badge displays correct "+N" count.
- [x] 9.8 Test click-stop propagation prevented.
- [x] 9.9 Test tooltip shows correct status information.

## Dev Notes

### ⚠️ CRITICAL: Extend Existing Components - Do NOT Create New Files
Per project convention, we extend existing components rather than creating new ones. This story modifies:
- `src/components/floor-plan/UserAvatarPresence.tsx` - Add status states (speaking, presenting, muted)
- `src/components/floor-plan/modern/ModernSpaceCard.tsx` - Update avatar layout with stacking and overflow

### Source of Truth for Styles
**`docs/ux-space-grid-v2.html`** is the authoritative reference for avatar constellation styling. Extract CSS patterns directly from this file:
- `.avatars-row` - Container flexbox layout with negative margins
- `.avatar` - Individual avatar styling (36px, border, negative margin)
- `.avatar:hover` - Hover transform effect
- `.avatar.speaking` - Speaking state box-shadow

### Requirements Context Summary
- Avatar Constellation V2 enhances the existing avatar display in ModernSpaceCard for Epic 3's visual overhaul.
- This story builds directly on Story 3.1's theme token system.
- Modifies existing `UserAvatarPresence.tsx` and `ModernSpaceCard.tsx` components.
- [Source: docs/ux-design-specification.md#6.1-component-strategy]

### Learnings from Previous Story

**From Story 3.2 (Status: done) - Note: Story 3.2 also modified existing components**

- **ModernSpaceCard.tsx**: Active space card at `src/components/floor-plan/modern/ModernSpaceCard.tsx` - this story continues modifications
- **Theme Token System**: CSS tokens in `src/styles/themes/tokens.css` - extend for avatar tokens
- **Click-Stop Protocol**: `data-avatar-interactive` must be preserved on UserAvatarPresence
- **Testing Pattern**: Follow existing test patterns in `__tests__/` directory
- **DEPRECATED**: `SpaceElement.tsx` and `dom-floor-plan.tsx` were removed - use `ModernSpaceCard.tsx`

[Source: docs/stories/3-2-space-card-v2-orbit-gallery-component.md#Dev-Agent-Record]

### Existing Infrastructure
- **UserAvatarPresence.tsx**: Current implementation at `src/components/floor-plan/UserAvatarPresence.tsx` - MODIFY this file.
- **ModernSpaceCard.tsx**: Current space card at `src/components/floor-plan/modern/ModernSpaceCard.tsx` - MODIFY avatar section.
- **EnhancedAvatarV2**: Canonical avatar component at `src/components/ui/enhanced-avatar-v2.tsx` - already used by UserAvatarPresence.
- **Theme tokens**: `src/styles/themes/tokens.css` - extend with avatar-specific tokens.
- **Tooltip components**: `src/components/ui/tooltip.tsx` - already used by UserAvatarPresence.
- **Badge component**: `src/components/ui/badge.tsx` - used for overflow count in ModernSpaceCard.
- **cn utility**: `src/lib/utils.ts` - use for className composition.

### Architecture Decisions
- **Modify Existing Components**: Extend `UserAvatarPresence.tsx` and `ModernSpaceCard.tsx` - do NOT create new files.
- **Props Extension**: Add new optional props to UserAvatarPresence for status states (backward compatible).
- **CSS-First Approach**: All styling via CSS custom properties and Tailwind classes.
- **Theme Inheritance**: All colors derive from theme tokens, no hardcoded values.
- **Status Props**: Speaking/presenting/muted states passed as props from parent component.

### CSS Token Structure for Avatar States
```css
[data-theme="neon"] {
  /* Avatar tokens - extend existing theme */
  --vo-avatar-border: var(--vo-card-bg);
  --vo-avatar-speaking-glow: var(--vo-accent);
  --vo-avatar-presenting-border: var(--vo-accent);
  --vo-avatar-muted-opacity: 0.5;
}

/* Speaking animation keyframes */
@keyframes vo-avatar-pulse {
  0% { box-shadow: 0 0 0 0 var(--vo-avatar-speaking-glow); }
  50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--vo-avatar-speaking-glow), transparent 50%); }
  100% { box-shadow: 0 0 0 0 var(--vo-avatar-speaking-glow); }
}
```

### Current ModernSpaceCard Avatar Implementation (for reference)
```tsx
// Current code in ModernSpaceCard.tsx - AvatarGroup is used for rendering avatars
// See src/components/floor-plan/modern/ModernSpaceCard.tsx
// ModernSpaceCard uses AvatarGroup component for avatar display
```

### Project Structure Alignment
- Modify: `src/components/floor-plan/UserAvatarPresence.tsx` (add status props and styling)
- Modify: `src/components/floor-plan/modern/ModernSpaceCard.tsx` (update avatar layout)
- Extend: `src/styles/themes/tokens.css` (add avatar tokens)
- Extend: `tailwind.config.ts` (add vo-avatar utilities if needed)
- New tests: `__tests__/user-avatar-presence-v2.test.tsx`
- [Source: AGENTS.md#project-structure-scoped]

### Dependencies & Risk Notes
- Must preserve click-stop protocol from AGENTS.md (`data-avatar-interactive` handling).
- Speaking/presenting states require parent component to provide props (ModernSpaceCard doesn't have this data yet).
- Real speaking detection not implemented - use props for manual control.
- Voice activity detection (VAD) is out of scope for this story.
- Performance: animations must maintain 60 FPS with 12+ avatars visible.

### References
- **🎯 SOURCE OF TRUTH: docs/ux-space-grid-v2.html** (Avatar CSS patterns)
- docs/epics.md#story-3.3-avatar-constellation-v2
- docs/ux-design-specification.md#6.1-component-strategy (AvatarConstellation spec)
- src/components/floor-plan/UserAvatarPresence.tsx (MODIFY this file)
- src/components/floor-plan/modern/ModernSpaceCard.tsx (MODIFY avatar section)
- src/components/ui/enhanced-avatar-v2.tsx (canonical avatar component)
- src/styles/themes/tokens.css (theme tokens from Story 3.1)
- docs/stories/3-2-space-card-v2-orbit-gallery-component.md (previous story)

## Dev Agent Record

### Context Reference

- [docs/sprint-artifacts/3-3-avatar-constellation-v2.context.xml](./3-3-avatar-constellation-v2.context.xml)

### Agent Model Used

Claude Opus 4.5 (Preview)

### Debug Log References

N/A - No debug issues encountered

### Completion Notes List

1. **CSS Tokens Added** (`src/styles/themes/tokens.css`):
   - `--vo-avatar-size: 36px`, `--vo-avatar-border-width: 2px`, `--vo-avatar-overlap: -10px`
   - `--vo-avatar-muted-opacity: 0.5`, `--vo-avatar-hover-lift: -3px`, `--vo-avatar-hover-scale: 1.1`
   - `@keyframes vo-avatar-speaking-pulse` (2s infinite)
   - Classes: `.vo-avatar-constellation`, `.vo-avatar-item`, `.vo-avatar-speaking`, `.vo-avatar-presenting`, `.vo-avatar-muted`, `.vo-avatar-overflow`

2. **UserAvatarPresence Enhanced** (`src/components/floor-plan/UserAvatarPresence.tsx`):
   - Added props: `isSpeaking`, `isPresenting`, `isMuted`, `size`, `showStatusInTooltip`
   - Hover: `translateY(-3px) scale(1.1)` with z-index bump
   - Click-stop protocol preserved (`data-avatar-interactive`)
   - Keyboard accessibility (Enter/Space activation)
   - Tooltip shows status when speaking/presenting/muted

3. **AvatarGroup Updated** (`src/components/floor-plan/modern/AvatarGroup.tsx`):
   - Smart stacking with `-10px` negative margin overlap
   - Max 4 visible avatars (reduced from 5)
   - Z-index layering (rightmost on top)
   - Themed overflow badge using `--vo-pill-bg`, `--vo-pill-text`
   - Added props: `speakingUserIds`, `presentingUserId`, `mutedUserIds`

4. **ModernSpaceCard Updated** (`src/components/floor-plan/modern/ModernSpaceCard.tsx`):
   - Updated max avatars: Orbit=4, Cinema=6

5. **Unit Tests** (`__tests__/user-avatar-presence-v2.test.tsx`):
   - 32 tests passing covering all 7 acceptance criteria
   - Tests: status props, hover transforms, tooltip content, accessibility, click-stop protocol

### File List

- src/styles/themes/tokens.css (MODIFIED - avatar tokens and animations)
- src/components/floor-plan/UserAvatarPresence.tsx (MODIFIED - status states, hover, accessibility)
- src/components/floor-plan/modern/AvatarGroup.tsx (MODIFIED - stacking, overflow badge)
- src/components/floor-plan/modern/ModernSpaceCard.tsx (MODIFIED - max avatars)
- __tests__/user-avatar-presence-v2.test.tsx (NEW - 32 unit tests)

## Change Log

- 2025-11-25: ✅ Story completed - All 7 ACs implemented, 32 tests passing
- 2025-11-25: Updated to reference ModernSpaceCard.tsx instead of removed SpaceElement.tsx.
- 2025-11-25: Story drafted via Scrum Master agent for Epic 3 visual overhaul (Story 3.3).
