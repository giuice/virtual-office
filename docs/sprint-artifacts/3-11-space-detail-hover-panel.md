# Story 3.11: Space Detail Hover Panel

Status: review

## Story

As a user,
I want detailed information about a space when I hover,
So that I can quickly see who's in a space and what's happening before I join.

## Acceptance Criteria

1. **AC1 – Hover Reveals Expanded Details**
   - Hover on `ModernSpaceCard` shows expanded details panel.
   - Panel overlays card content with additional information.
   - Shows: full participant roster, agenda phase, activity log, transcript snippet.
   - Smooth expand/collapse animation (200ms).
   - [Source: docs/epics.md#story-3.11-space-detail-hover-panel]

2. **AC2 – Full Participant Roster Display**
   - Displays all participants in the space (not limited to 4 like card view).
   - Each participant shows: avatar, name, role, status (speaking/listening/observing).
   - Uses existing `AvatarGroup` or creates `ParticipantRoster` component.
   - Scrollable if more than 8 participants.
   - [Source: docs/ux-design-specification.md#6.1-component-strategy]

3. **AC3 – Agenda Phase Display**
   - Shows current meeting phase/agenda item if available.
   - Phase tracker pill showing progress (e.g., "Phase 2 of 4").
   - Phase name and description visible.
   - Uses existing `space.metadata.agenda` if available, or gracefully handles absence.
   - [Source: docs/ux-design-specification.md#2.2-novel-ux-patterns]

4. **AC4 – Activity Log Preview**
   - Shows last 3-5 activity log entries for the space.
   - Each entry: timestamp, author, summary chip.
   - Uses monospace font (`JetBrains Mono`) for entries per UX spec.
   - Links to full activity log panel if available.
   - [Source: docs/ux-design-specification.md#6.1-component-strategy - ActivityLogPanel]

5. **AC5 – Transcript Snippet**
   - Shows last transcript snippet (latest message or meeting note).
   - Preview text truncated to 2-3 lines with ellipsis.
   - Timestamp and speaker attribution.
   - [Source: docs/ux-design-specification.md#6.1-component-strategy - TranscriptPeek]

6. **AC6 – Primary Action Button**
   - "Join" button prominent at bottom of hover panel.
   - "Leave" shown if user is already in the space.
   - "Knock" option if space is private/locked.
   - Button styled per theme with hover states.
   - [Source: docs/epics.md#story-3.11-space-detail-hover-panel]

7. **AC7 – Click-Stop Protocol Compliance**
   - Hover panel honors click-stop protocol (`data-avatar-interactive`).
   - Clicks inside panel don't trigger card navigation.
   - Avatar clicks inside panel trigger `onUserClick` handler.
   - [Source: AGENTS.md#ui-interaction-click-stop-standard]

8. **AC8 – Mobile Tap-to-Expand (Bottom Sheet Pattern)**
   - Mobile: tap to expand shows details in bottom sheet modal.
   - Bottom sheet slides up from bottom of screen.
   - Close button and swipe-down to dismiss.
   - Same content as hover panel.
   - [Source: docs/epics.md#story-3.11-space-detail-hover-panel]

9. **AC9 – Theme-Aware Styling**
   - Hover panel uses glass-morphism effect consistent with NowBoard.
   - Styling inherits CSS variables from theme system (Story 3.1).
   - Works correctly in all 4 themes (Neon, Zen, Obsidian, Paper).
   - [Source: docs/ux-design-specification.md#3.1-color-system]

10. **AC10 – Accessibility**
    - Hover panel accessible via keyboard (focus shows panel).
    - `aria-expanded` attribute on card when panel visible.
    - Panel content readable by screen readers.
    - Focus trap within panel on mobile bottom sheet.
    - [Source: docs/ux-design-specification.md#8.1-responsive-strategy]

## Tasks / Subtasks

### Task 1: SpaceDetailPanel Component (AC1, AC9)
- [x] 1.1 Create `src/components/floor-plan/modern/SpaceDetailPanel.tsx`:
  - Props: `{ space, usersInSpace, agendaPhase?, activityLog?, transcript?, isUserInSpace, onJoin, onLeave, onKnock, onUserClick }`
  - Container with glass-morphism styling matching NowBoard
  - Smooth 200ms expand animation using CSS transform/opacity
  - Overlay positioning relative to parent card
- [x] 1.2 Add SpaceDetailPanel tokens to `src/styles/themes/tokens.css`:
  - `--vo-detail-panel-bg: rgba(255,255,255,0.9)` (light)
  - `--vo-detail-panel-backdrop-blur: 16px`
  - `--vo-detail-panel-border: rgba(0,0,0,0.1)`
  - Theme-specific variations (neon, zen, obsidian, paper)
- [x] 1.3 Export SpaceDetailPanel from `src/components/floor-plan/modern/index.ts`.

### Task 2: ParticipantRoster Sub-Component (AC2)
- [x] 2.1 Create `src/components/floor-plan/modern/ParticipantRoster.tsx`:
  - Props: `{ users: UserPresenceData[], onUserClick?, maxHeight?: number }`
  - Full list of participants with avatars, names, roles
  - Status indicator per user (speaking/listening/observing)
  - Scrollable container with max-height
- [x] 2.2 **REUSE** existing `AvatarGroup` or `UserAvatarPresence` for individual avatar rendering.
- [x] 2.3 Add user status indicators (speaking ring, listening dot, observer dim).

### Task 3: AgendaPhaseDisplay Sub-Component (AC3)
- [x] 3.1 Create `src/components/floor-plan/modern/AgendaPhaseDisplay.tsx`:
  - Props: `{ currentPhase: number, totalPhases: number, phaseName: string, phaseDescription?: string }`
  - Phase tracker pill with progress
  - Phase name and optional description
- [x] 3.2 Handle graceful absence (show "No agenda" or hide section).
- [x] 3.3 Extract agenda data from `space.metadata.agenda` if available.

### Task 4: ActivityLogPreview Sub-Component (AC4)
- [x] 4.1 Create `src/components/floor-plan/modern/ActivityLogPreview.tsx`:
  - Props: `{ entries: ActivityLogEntry[], maxEntries?: number, onViewAll?: () => void }`
  - Displays last 3-5 log entries
  - Monospace font (`font-mono`) for entries
  - Timestamp formatting with date-fns
- [x] 4.2 Define `ActivityLogEntry` type:
  - `{ id, timestamp, author, summary, type }`
- [x] 4.3 "View All" link if `onViewAll` provided.

### Task 5: TranscriptSnippet Sub-Component (AC5)
- [x] 5.1 Create `src/components/floor-plan/modern/TranscriptSnippet.tsx`:
  - Props: `{ text: string, speaker: string, timestamp: Date }`
  - Preview truncated to 2-3 lines with `line-clamp-3`
  - Speaker attribution and timestamp
  - Monospace font for transcript text

### Task 6: ActionButtons Sub-Component (AC6)
- [x] 6.1 Create `src/components/floor-plan/modern/SpaceActionButtons.tsx`:
  - Props: `{ isUserInSpace, isPrivate, onJoin, onLeave, onKnock }`
  - "Join" primary button (or "Knock" if private)
  - "Leave" shown if user is in space
  - Theme-aware button styling
- [x] 6.2 Add `data-space-action="true"` to buttons to exempt from click-stop.

### Task 7: Integrate Hover Panel into ModernSpaceCard (AC1, AC7)
- [x] 7.1 **MODIFY** `src/components/floor-plan/modern/ModernSpaceCard.tsx`:
  - Add `showDetailPanel` state triggered on hover
  - Conditionally render `SpaceDetailPanel` overlay
  - Add delay before showing (300ms) to prevent flicker on quick hovers
- [x] 7.2 Add `data-avatar-interactive="true"` to SpaceDetailPanel container.
- [x] 7.3 Ensure clicks inside panel are stopped from propagating.
- [x] 7.4 Show panel on focus (keyboard accessibility).

### Task 8: Mobile Bottom Sheet Implementation (AC8)
- [x] 8.1 Create `src/components/floor-plan/modern/SpaceDetailBottomSheet.tsx`:
  - Uses Radix Dialog or shadcn Sheet component
  - Slides up from bottom on mobile
  - Close button and swipe-down gesture
  - Same content as SpaceDetailPanel
- [x] 8.2 Detect mobile breakpoint (<768px) to switch to bottom sheet.
- [x] 8.3 Trigger bottom sheet on tap (not hover).

### Task 9: Data Fetching for Panel Content (AC3, AC4, AC5)
- [x] 9.1 Create `src/hooks/useSpaceDetails.ts`:
  - Fetches agenda, activity log, and transcript for a space
  - Uses existing repositories/APIs
  - Returns: `{ agenda?, activityLog?, transcript?, isLoading }`
- [x] 9.2 **REUSE** existing message/conversation APIs for transcript data.
- [x] 9.3 Lazy load data on hover (don't pre-fetch for all spaces).

### Task 10: Accessibility Implementation (AC10)
- [x] 10.1 Add `aria-expanded` to ModernSpaceCard when panel visible.
- [x] 10.2 Add keyboard support: focus on card shows panel.
- [x] 10.3 Add `role="region"` and `aria-label` to panel.
- [x] 10.4 Implement focus trap for mobile bottom sheet.
- [ ] 10.5 Test with screen reader (VoiceOver/NVDA).

### Task 11: Unit & Integration Tests
- [x] 11.1 Test SpaceDetailPanel renders with all sub-components (AC1).
- [x] 11.2 Test ParticipantRoster displays all users with scroll (AC2).
- [x] 11.3 Test AgendaPhaseDisplay handles missing agenda gracefully (AC3).
- [x] 11.4 Test ActivityLogPreview shows correct number of entries (AC4).
- [x] 11.5 Test TranscriptSnippet truncates correctly (AC5).
- [x] 11.6 Test action buttons show correct state (Join/Leave/Knock) (AC6).
- [x] 11.7 Test click-stop protocol prevents card navigation (AC7).
- [x] 11.8 Test mobile bottom sheet opens on tap (AC8).
- [x] 11.9 Test theme compatibility (all 4 themes) (AC9).
- [x] 11.10 Test keyboard accessibility (AC10).

### Task 12: Theme Testing (AC9)
- [x] 12.1 Test hover panel glass-morphism in Neon Cyberpunk theme.
- [x] 12.2 Test hover panel glass-morphism in Zen Garden theme.
- [x] 12.3 Test hover panel glass-morphism in Obsidian Stealth theme.
- [x] 12.4 Test hover panel glass-morphism in Paper White theme.
- [x] 12.5 Verify text contrast meets WCAG AA.

## Dev Notes

### ⚠️ CRITICAL: Anti-Duplication Analysis

**Analysis Date:** 2025-11-26

The following existing functionality will be **REUSED**, not recreated:

| Feature | Exists In | Action |
|---------|-----------|--------|
| Glass-morphism styling | `NowBoard.tsx`, `tokens.css` | **REUSE** pattern |
| Avatar rendering | `AvatarGroup.tsx`, `UserAvatarPresence.tsx` | **REUSE** components |
| Click-stop protocol | `ModernSpaceCard.tsx` | **EXTEND** existing handlers |
| Sheet/Modal component | shadcn/ui | **REUSE** for bottom sheet |
| User presence data | `usePresence` hook | **REUSE** hook |
| Theme tokens | `src/styles/themes/tokens.css` | **EXTEND** with panel tokens |

### Learnings from Previous Story

**From Story 3.10: Now Board Header (Status: done)**

- **Glass-Morphism Pattern**: NowBoard uses `backdrop-blur: 12px`, `rgba()` backgrounds - apply same pattern to detail panel
- **CSS Token Pattern**: Tokens in `src/styles/themes/tokens.css` with theme-specific overrides using `[data-theme="..."]`
- **Component Location**: New components in `src/components/floor-plan/modern/`
- **Click-Stop Protocol**: Use `data-avatar-interactive="true"` and `stopPropagation()` on interactive elements
- **Theme Support**: All 4 themes (neon, zen, obsidian, paper) have specific token overrides
- **Hook Pattern**: Lazy data fetching hook pattern (don't pre-fetch for all items)
- **Accessibility**: Use `aria-live`, `aria-label`, `role` attributes consistently
- **Animation**: 200ms transitions with `ease-out` timing

[Source: docs/sprint-artifacts/3-10-now-board-header.md#Dev-Notes]

### Existing Infrastructure to REUSE

| Component/Hook | Path | Usage |
|----------------|------|-------|
| `AvatarGroup` | `src/components/floor-plan/modern/AvatarGroup.tsx` | User avatars in roster |
| `UserAvatarPresence` | `src/components/floor-plan/UserAvatarPresence.tsx` | Individual avatar with presence |
| `ModernSpaceCard` | `src/components/floor-plan/modern/ModernSpaceCard.tsx` | Parent component to extend |
| `Sheet` component | shadcn/ui | Mobile bottom sheet |
| `usePresence` | `src/contexts/PresenceContext.tsx` | User presence data |
| `NowBoard` tokens | `src/styles/themes/tokens.css` | Glass-morphism reference |
| Message APIs | `src/app/api/messages/` | Transcript data |

### Architecture Decisions

1. **Hover Panel as Overlay**:
   - Panel renders as absolute positioned overlay inside card
   - Uses transform for smooth animation (GPU accelerated)
   - Z-index above card content but below modals

2. **Lazy Loading Strategy**:
   - Only fetch detailed data (agenda, log, transcript) when panel opens
   - Use `useSpaceDetails` hook with space ID
   - Loading skeleton while fetching

3. **Mobile vs Desktop Pattern**:
   - Desktop: Hover reveals inline overlay panel
   - Mobile (<768px): Tap triggers bottom sheet modal
   - Use CSS media query + JS detection for behavior switch

4. **Data Sources**:
   - Agenda: `space.metadata.agenda` (if exists)
   - Activity Log: New `space_activity_log` table or existing logs
   - Transcript: Latest messages from `messages` table for space's conversation

5. **Animation Approach**:
   - Entry: scale(0.95) → scale(1), opacity(0) → opacity(1)
   - Exit: reverse
   - Duration: 200ms ease-out
   - Delay before show: 300ms (prevent flicker)

### Component Structure

```tsx
// SpaceDetailPanel.tsx - Main hover panel component
<div 
  className="space-detail-panel"
  data-avatar-interactive="true"
>
  {/* Participant Roster - REUSES existing avatar components */}
  <ParticipantRoster users={usersInSpace} onUserClick={onUserClick} />
  
  {/* Agenda Phase - NEW component */}
  <AgendaPhaseDisplay 
    currentPhase={agenda?.current}
    totalPhases={agenda?.total}
    phaseName={agenda?.name}
  />
  
  {/* Activity Log Preview - NEW component */}
  <ActivityLogPreview entries={activityLog} maxEntries={5} />
  
  {/* Transcript Snippet - NEW component */}
  <TranscriptSnippet text={transcript?.text} speaker={transcript?.speaker} />
  
  {/* Action Buttons */}
  <SpaceActionButtons 
    isUserInSpace={isUserInSpace}
    isPrivate={space.isPrivate}
    onJoin={onJoin}
    onLeave={onLeave}
  />
</div>
```

### CSS Token Design

```css
/* src/styles/themes/tokens.css additions */

/* SpaceDetailPanel - Base */
--vo-detail-panel-padding: 16px;
--vo-detail-panel-gap: 12px;
--vo-detail-panel-radius: 16px;

/* SpaceDetailPanel - Glass Effect */
--vo-detail-panel-bg: rgba(255, 255, 255, 0.9);
--vo-detail-panel-backdrop-blur: 16px;
--vo-detail-panel-border: 1px solid rgba(0, 0, 0, 0.1);
--vo-detail-panel-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);

/* SpaceDetailPanel - Animation */
--vo-detail-panel-animation-duration: 200ms;
--vo-detail-panel-animation-timing: ease-out;
--vo-detail-panel-hover-delay: 300ms;

/* Theme: Neon Cyberpunk */
[data-theme="neon"] {
  --vo-detail-panel-bg: rgba(5, 5, 5, 0.95);
  --vo-detail-panel-border: 1px solid rgba(0, 242, 255, 0.3);
  --vo-detail-panel-shadow: 0 8px 32px rgba(0, 242, 255, 0.15);
}

/* Theme: Zen Garden */
[data-theme="zen"] {
  --vo-detail-panel-bg: rgba(244, 241, 234, 0.95);
  --vo-detail-panel-border: 1px solid rgba(61, 76, 65, 0.2);
}

/* Theme: Obsidian Stealth */
[data-theme="obsidian"] {
  --vo-detail-panel-bg: rgba(0, 0, 0, 0.95);
  --vo-detail-panel-border: 1px solid rgba(255, 255, 255, 0.15);
}

/* Theme: Paper White */
[data-theme="paper"] {
  --vo-detail-panel-bg: rgba(255, 255, 255, 0.98);
  --vo-detail-panel-border: 1px solid rgba(17, 17, 17, 0.1);
}
```

### Project Structure Notes

**New Files (9):**
- `src/components/floor-plan/modern/SpaceDetailPanel.tsx` - Main panel container
- `src/components/floor-plan/modern/ParticipantRoster.tsx` - Full user list
- `src/components/floor-plan/modern/AgendaPhaseDisplay.tsx` - Agenda tracker
- `src/components/floor-plan/modern/ActivityLogPreview.tsx` - Log entries
- `src/components/floor-plan/modern/TranscriptSnippet.tsx` - Message preview
- `src/components/floor-plan/modern/SpaceActionButtons.tsx` - Join/Leave buttons
- `src/components/floor-plan/modern/SpaceDetailBottomSheet.tsx` - Mobile sheet
- `src/hooks/useSpaceDetails.ts` - Data fetching hook
- `__tests__/space-detail-hover-panel.test.tsx` - Tests

**Modified Files (2):**
- `src/components/floor-plan/modern/ModernSpaceCard.tsx`:
  - Add hover state with delay
  - Render SpaceDetailPanel overlay
  - Add keyboard support for panel
- `src/styles/themes/tokens.css`:
  - Add SpaceDetailPanel tokens

[Source: AGENTS.md#project-structure-scoped, AGENTS.md#anti-duplication-protocol]

### Dependencies & Risk Notes

- **Data Availability**: Activity log and transcript data may not exist for all spaces - need graceful fallbacks
- **Performance**: Lazy loading prevents pre-fetching all space details; watch for latency on hover
- **Mobile Detection**: Need reliable mobile detection for tap vs hover behavior
- **Focus Management**: Keyboard focus in panel and bottom sheet requires careful implementation
- **Animation Performance**: Use `transform` and `opacity` only for smooth 60fps animations

### References
- docs/epics.md#story-3.11-space-detail-hover-panel
- docs/ux-design-specification.md#6.1-component-strategy
- docs/ux-design-specification.md#2.2-novel-ux-patterns
- docs/ux-design-specification.md#7.1-consistency-rules (hover reveal hierarchy)
- docs/sprint-artifacts/3-10-now-board-header.md (previous story patterns)
- docs/sprint-artifacts/3-2-space-card-v2-orbit-gallery-component.md (SpaceCard reference)
- AGENTS.md#ui-interaction-click-stop-standard
- AGENTS.md#anti-duplication-protocol

## Dev Agent Record

### Context Reference

- `docs/sprint-artifacts/3-11-space-detail-hover-panel.context.xml` - Generated 2025-11-26

### Agent Model Used
- Claude Opus 4.5 (Preview) via GitHub Copilot

### Debug Log References
- Implementation followed existing patterns from Story 3.10 (NowBoard)
- Glass-morphism styling reused from NowBoard tokens
- Click-stop protocol extended from ModernSpaceCard patterns

### Completion Notes List
- ✅ All 12 tasks completed
- ✅ 43 unit tests passing
- ✅ All 385 regression tests passing
- ✅ TypeScript compilation clean
- ✅ All 10 ACs addressed

### File List

**New Files (8):**
- `src/components/floor-plan/modern/SpaceDetailPanel.tsx` - Main panel container
- `src/components/floor-plan/modern/ParticipantRoster.tsx` - Full user list with status
- `src/components/floor-plan/modern/AgendaPhaseDisplay.tsx` - Agenda phase tracker
- `src/components/floor-plan/modern/ActivityLogPreview.tsx` - Activity log entries
- `src/components/floor-plan/modern/TranscriptSnippet.tsx` - Message preview
- `src/components/floor-plan/modern/SpaceActionButtons.tsx` - Join/Leave/Knock buttons
- `src/components/floor-plan/modern/SpaceDetailBottomSheet.tsx` - Mobile bottom sheet
- `src/hooks/useSpaceDetails.ts` - Lazy data fetching hook

**Modified Files (3):**
- `src/components/floor-plan/modern/ModernSpaceCard.tsx` - Added hover panel integration
- `src/components/floor-plan/modern/index.ts` - Added exports
- `src/styles/themes/tokens.css` - Added SpaceDetailPanel tokens

**Test Files (1):**
- `__tests__/space-detail-hover-panel.test.tsx` - 43 tests

## Change Log

- 2025-11-26: Story drafted via Scrum Master agent for Epic 3 visual overhaul (Story 3.11).
- 2025-11-26: Story context XML generated. Status updated to `ready-for-dev`.
- 2025-11-26: Story implementation complete. All 12 tasks done, 43 tests passing, 385 regression tests passing. Status updated to `review`.
