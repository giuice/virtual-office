# Story 3.10: Now Board Header

Status: ready-for-dev

## Story

As a leader,
I want a summary bar showing the office pulse at a glance,
So that I can instantly see active beacons, key metrics, and filters.

## Acceptance Criteria

1. **AC1 – NowBoard Component Structure (Consolidates Existing UI)**
   - `NowBoard` component replaces existing Status Cards grid at top of floor plan.
   - Shows: total spaces, active users, beacons count (reuse existing calculations).
   - Relocates filter chips for neighborhoods from controls bar.
   - Relocates search input from controls bar.
   - Adds NEW: Live beacon alerts queue with severity icons.
   - [Source: docs/epics.md#story-3.10-now-board-header]

2. **AC2 – Key Metrics Display (REUSE Existing Data)**
   - **REUSE**: Online users from `usePresence().users` (already in Status Cards).
   - **REUSE**: Active meetings from `usersInSpaces` calculation (already in Status Cards).
   - **ADD**: Total spaces count (`spaces.length`).
   - **ADD**: Active beacon count with severity breakdown (normal/critical).
   - Compact glass-morphism format replaces current Card-based Status Cards.
   - [Source: docs/ux-design-specification.md#6.1-component-strategy - NowBoard module]

3. **AC3 – Beacon Queue List (NEW Functionality)**
   - **NEW**: Aggregated beacon alerts displayed as list/chips in NowBoard.
   - Each beacon shows: space name, severity icon, reason.
   - Critical beacons prioritized (appear first).
   - Click beacon focuses corresponding SpaceCard in grid (scroll + highlight).
   - Beacon list scrollable if more than 3-4 active beacons.
   - [Source: docs/ux-design-specification.md#6.1-component-strategy - NowBoard]

4. **AC4 – Neighborhood Filters Integration (RELOCATE)**
   - **RELOCATE**: Move existing `NeighborhoodFilters` component from controls bar to NowBoard.
   - **REUSE**: `useNeighborhoodFilters` hook state (no changes to logic).
   - Maintain "All" filter option behavior.
   - [Source: docs/epics.md#story-3.10-now-board-header]

5. **AC5 – Space Search Input (RELOCATE & ENHANCE)**
   - **RELOCATE**: Move existing search input from controls bar to NowBoard.
   - **ENHANCE**: Create dedicated `SpaceSearch` component with clear button.
   - **REUSE**: Existing `searchQuery` state and filter logic in floor-plan.tsx.
   - Search combines with neighborhood filters (already implemented).
   - [Source: docs/epics.md#story-3.10-now-board-header]

6. **AC6 – Accessibility (aria-live Region)**
   - `aria-live="polite"` region for new beacon announcements.
   - Screen reader announces: "New beacon on [Space Name], [Severity]".
   - Metrics announced as summary on focus.
   - Filter chips keyboard accessible (already implemented in Story 3.9).
   - [Source: docs/epics.md#story-3.10-now-board-header]

7. **AC7 – Theme-Aware Styling**
   - NowBoard uses glass-morphism effect (blur backdrop, subtle border).
   - Styling inherits CSS variables from theme system (Story 3.1).
   - Works correctly in all 4 themes (Neon, Zen, Obsidian, Paper).
   - Metrics, beacons, and filters styled consistently with SpaceCard V2.
   - [Source: docs/ux-design-specification.md#3.1-color-system]

8. **AC8 – Deprecate Status Cards Grid**
   - **REMOVE**: Existing Status Cards grid (3 cards: Online Users, Active Meetings, Messages).
   - Functionality consolidated into NowBoard with improved visual design.
   - No duplicate metrics display.
   - [Source: Anti-Duplication Protocol - AGENTS.md]

9. **AC9 – Responsive Behavior**
   - Desktop (≥1440px): Full NowBoard with all elements visible.
   - Tablet (1024-1439px): Compact metrics, collapsible beacon list.
   - Mobile (<1024px): Metrics as icon badges, search accessible via icon.
   - [Source: docs/ux-design-specification.md#8.1-responsive-strategy]

## Tasks / Subtasks

### Task 1: NowBoard Component Structure (AC1, AC7)
- [ ] 1.1 Create `src/components/floor-plan/modern/NowBoard.tsx`:
  - Container with glass-morphism styling (backdrop-blur, border)
  - Props: `{ spaces, users, usersInSpaces, beacons, neighborhoods, filters, search }`
  - Responsive layout using flexbox/grid
  - Theme-aware CSS variables
- [ ] 1.2 Add NowBoard tokens to `src/styles/themes/tokens.css`:
  - `--vo-now-board-bg: rgba(255,255,255,0.8)` (light)
  - `--vo-now-board-backdrop-blur: 12px`
  - `--vo-now-board-border: rgba(0,0,0,0.1)`
  - Theme-specific variations (neon, zen, obsidian, paper)
- [ ] 1.3 Create `src/components/floor-plan/modern/NowBoardMetrics.tsx`:
  - Sub-component for metrics display
  - Props: `{ totalSpaces, onlineUsers, activeMeetings, normalBeacons, criticalBeacons }`
  - Compact format with icons and counts (no Card wrapper)
- [ ] 1.4 Export NowBoard from `src/components/floor-plan/modern/index.ts`.

### Task 2: Consolidate Existing Metrics (AC2, AC8) - REUSE NOT RECREATE
- [ ] 2.1 **REUSE** existing data sources in `floor-plan.tsx`:
  - `users?.length` → Online Users (from `usePresence()`)
  - `Array.from(usersInSpaces.values()).filter(...)` → Active Meetings
  - `spaces.length` → Total Spaces
- [ ] 2.2 **REMOVE** Status Cards grid from `floor-plan.tsx` (lines 210-236):
  - Delete the `<div className="grid grid-cols-1 md:grid-cols-3 gap-4">` section
  - Metrics now displayed in NowBoard
- [ ] 2.3 Pass existing data to NowBoard (no new hooks needed):
  - Props from floor-plan.tsx: `{ spaces, users, usersInSpaces }`

### Task 3: Beacon Aggregation Hook (AC3) - NEW FUNCTIONALITY
- [ ] 3.1 Create `src/hooks/useBeaconAggregator.ts`:
  - Aggregates beacon states from all spaces
  - Uses existing `useAttentionBeacon` logic per space
  - Returns: `{ activeBeacons: BeaconInfo[], normalCount, criticalCount }`
  - `BeaconInfo`: `{ spaceId, spaceName, severity, reason, lastChange }`
- [ ] 3.2 Integrate with `ModernFloorPlan` or `floor-plan.tsx`:
  - Collect beacon states from rendered SpaceCards
  - Or compute beacon states at parent level for all spaces

### Task 4: Beacon Queue Component (AC3) - NEW FUNCTIONALITY
- [ ] 4.1 Create `src/components/floor-plan/modern/BeaconQueue.tsx`:
  - List of active beacons sorted by severity (critical first)
  - Each item shows: space name, severity icon, reason text
  - Click handler prop: `onBeaconClick(spaceId: string)`
  - Max-height with scroll for overflow (limit 10 beacons)
- [ ] 4.2 Implement `scrollToSpace` handler in `floor-plan.tsx`:
  - Use `scrollIntoView({ behavior: 'smooth', block: 'center' })`
  - Target element via `data-space-id={id}` attribute
  - Set `highlightedSpaceId` to trigger visual highlight
- [ ] 4.3 **MODIFY** `ModernSpaceCard.tsx`:
  - Add `data-space-id={space.id}` attribute to root element

### Task 5: Relocate Neighborhood Filters (AC4) - RELOCATE NOT RECREATE
- [ ] 5.1 **MODIFY** `src/components/floor-plan/floor-plan.tsx`:
  - Remove `NeighborhoodFilters` from controls bar (around line 279)
  - Keep `useNeighborhoodFilters` hook and state where it is
  - Pass filter props to NowBoard component
- [ ] 5.2 Render `NeighborhoodFilters` inside NowBoard:
  - Import existing component (no changes to component)
  - Pass through: `neighborhoods, activeFilters, onToggle, onShowAll, isShowingAll`

### Task 6: Relocate & Enhance Search (AC5) - RELOCATE NOT RECREATE
- [ ] 6.1 Create `src/components/floor-plan/modern/SpaceSearch.tsx`:
  - Search input with magnifying glass icon (lucide: `Search`)
  - Clear button (X) when text present (lucide: `X`)
  - Props: `{ value, onChange, onClear, placeholder }`
  - Glass-morphism styling consistent with NowBoard
- [ ] 6.2 **MODIFY** `src/components/floor-plan/floor-plan.tsx`:
  - Remove search Input from controls bar (around line 264)
  - Keep existing `searchQuery` state (`useState`)
  - Pass search props to NowBoard: `{ searchQuery, setSearchQuery }`
- [ ] 6.3 Render `SpaceSearch` inside NowBoard:
  - Connect to existing state (no new hook needed)

### Task 7: Integrate NowBoard into Floor Plan (AC1, AC8)
- [ ] 7.1 **MODIFY** `src/components/floor-plan/floor-plan.tsx`:
  - Import NowBoard component
  - Delete Status Cards grid (Task 2.2)
  - Render NowBoard in place of Status Cards
  - Pass all required props
- [ ] 7.2 Simplify controls bar:
  - Keep: Manage Rooms, Use Template, Filter by Type, Perspective Switcher, Create Room, Neighborhoods
  - Remove: NeighborhoodFilters (moved to NowBoard), Search Input (moved to NowBoard)

### Task 8: Accessibility Implementation (AC6)
- [ ] 8.1 Add `aria-live` region in NowBoard:
  - `<div role="status" aria-live="polite">` for beacon announcements
  - Track previous beacon count, announce new ones
- [ ] 8.2 Add `aria-label` to metrics section:
  - Label: "Office pulse: X spaces, Y online, Z in meetings, W beacons"
- [ ] 8.3 Ensure search input is accessible:
  - `aria-label="Search spaces"`
  - Clear button: `aria-label="Clear search"`
- [ ] 8.4 Test keyboard navigation:
  - Tab order: Metrics → Beacon Queue → Filters → Search
  - Focus ring visible on all interactive elements

### Task 9: Responsive Design (AC9)
- [ ] 9.1 Add responsive breakpoints to NowBoard:
  - Desktop: Full layout, all elements visible
  - Tablet: Metrics condensed, beacon list collapsible
  - Mobile: Icon-only metrics, search behind icon
- [ ] 9.2 Add responsive tokens to `tokens.css`:
  - `--vo-now-board-height: 80px` (desktop)
  - `--vo-now-board-height-tablet: 60px`
  - `--vo-now-board-height-mobile: 48px`

### Task 10: Unit & Integration Tests
- [ ] 10.1 Test NowBoard renders with correct metrics (reuses existing data).
- [ ] 10.2 Test BeaconQueue sorts by severity (critical first).
- [ ] 10.3 Test beacon click scrolls to space and highlights.
- [ ] 10.4 Test SpaceSearch filters spaces correctly (existing logic).
- [ ] 10.5 Test neighborhood filters still work in NowBoard.
- [ ] 10.6 Test `aria-live` announces beacon changes.
- [ ] 10.7 Test responsive layouts at breakpoints.
- [ ] 10.8 Test theme compatibility (all 4 themes).
- [ ] 10.9 Test Status Cards grid is removed (no duplicate metrics).
- [ ] 10.10 Test keyboard navigation order.

### Task 11: Theme Testing (AC7)
- [ ] 11.1 Test NowBoard glass-morphism in Neon Cyberpunk theme.
- [ ] 11.2 Test NowBoard glass-morphism in Zen Garden theme.
- [ ] 11.3 Test NowBoard glass-morphism in Obsidian Stealth theme.
- [ ] 11.4 Test NowBoard glass-morphism in Paper White theme.
- [ ] 11.5 Verify metrics contrast meets WCAG AA.
- [ ] 11.6 Verify beacon icons visible in all themes.

## Dev Notes

### ⚠️ CRITICAL: Anti-Duplication Analysis Completed

**Analysis Date:** 2025-11-26

The following existing functionality was identified and will be **REUSED or RELOCATED**, not recreated:

| Feature | Exists In | Action |
|---------|-----------|--------|
| Online Users metric | `floor-plan.tsx` Status Cards (line 213) | **REUSE** data, remove Card |
| Active Meetings metric | `floor-plan.tsx` Status Cards (line 222) | **REUSE** data, remove Card |
| Messages metric | `floor-plan.tsx` Status Cards (line 231) | **REMOVE** (placeholder `--`) |
| Search query state | `floor-plan.tsx` `useState` (line 60) | **REUSE** existing state |
| Search input | `floor-plan.tsx` controls bar (line 264) | **RELOCATE** to NowBoard |
| Search filter logic | `floor-plan.tsx` `filteredSpaces` (line 87) | **REUSE** existing logic |
| Neighborhood filters | `floor-plan.tsx` controls bar (line 279) | **RELOCATE** to NowBoard |
| `useNeighborhoodFilters` | `src/hooks/useNeighborhoodFilters.ts` | **REUSE** hook |
| `NeighborhoodFilters` component | `src/components/floor-plan/modern/` | **REUSE** component |
| `useAttentionBeacon` hook | `src/hooks/useAttentionBeacon.ts` | **EXTEND** for aggregation |
| `AttentionBeacon` component | `src/components/floor-plan/modern/` | **REUSE** for queue items |

### What's Actually NEW in This Story

1. **NowBoard container component** - Glass-morphism styled header
2. **NowBoardMetrics sub-component** - Compact metric display format
3. **BeaconQueue component** - Aggregated list of all active beacons
4. **`useBeaconAggregator` hook** - Collects beacon states across all spaces
5. **SpaceSearch component** - Enhanced search input with clear button
6. **Scroll-to-space functionality** - Click beacon → navigate to card
7. **`aria-live` beacon announcements** - Accessibility for beacon changes

### Learnings from Previous Story

**From Story 3.9: Space Grouping and Neighborhoods (Status: done)**

- **CSS Token Pattern**: Neighborhood tokens in `src/styles/themes/tokens.css` - follow same pattern for NowBoard tokens
- **Hook Pattern**: Created `useNeighborhoodFilters.ts` - use this hook in NowBoard for filter state
- **Component Location**: New components in `src/components/floor-plan/modern/` - add NowBoard there
- **Integration Pattern**: Modified `floor-plan.tsx` to add filters - same approach for NowBoard
- **Admin Checks**: Added `isAdmin` prop propagation - maintain consistency
- **Accessibility**: Filter chips have keyboard nav and aria-labels - apply to NowBoard elements
- **Theme Support**: Colors work in all 4 themes - ensure NowBoard glass-morphism also works

[Source: docs/sprint-artifacts/3-9-space-grouping-and-neighborhoods.md#Dev-Agent-Record]

### Existing Infrastructure to REUSE (Not Duplicate)

| Component/Hook | Path | Usage |
|----------------|------|-------|
| `NeighborhoodFilters` | `src/components/floor-plan/modern/NeighborhoodFilters.tsx` | **RELOCATE** to NowBoard |
| `useNeighborhoodFilters` | `src/hooks/useNeighborhoodFilters.ts` | Pass state to NowBoard |
| `useAttentionBeacon` | `src/hooks/useAttentionBeacon.ts` | Extend for aggregation |
| `AttentionBeacon` | `src/components/floor-plan/modern/AttentionBeacon.tsx` | Reuse in BeaconQueue |
| `usePresence` | `src/contexts/PresenceContext.tsx` | Get `users`, `usersInSpaces` |
| `searchQuery` state | `floor-plan.tsx` line 60 | Existing useState |
| `filteredSpaces` logic | `floor-plan.tsx` line 87 | Existing filter |

### Code to REMOVE (Consolidate into NowBoard)

```tsx
// DELETE from floor-plan.tsx (lines 210-236) - Status Cards Grid
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <Card>Online Users: {users?.length || 0}</Card>
  <Card>Active Meetings: {...}</Card>
  <Card>Messages: --</Card>
</div>

// RELOCATE from controls bar - NeighborhoodFilters
{neighborhoods.length > 0 && (
  <NeighborhoodFilters ... />  // Move to NowBoard
)}

// RELOCATE from controls bar - Search Input
<Input
  placeholder="Search rooms..."
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  className="w-[200px] h-9"
/>  // Replace with SpaceSearch in NowBoard
```

### Architecture Decisions

1. **NowBoard Replaces Status Cards**: 
   - Delete existing 3-card grid
   - NowBoard provides same data in compact glass-morphism format
   - Single source of metrics display

2. **Filter Relocation Strategy**:
   - NeighborhoodFilters MOVES from controls bar to NowBoard
   - Search Input MOVES from controls bar to NowBoard (as SpaceSearch)
   - Filter/search STATE remains in floor-plan.tsx (single source of truth)
   - Pass state + handlers as props to NowBoard

3. **Beacon Aggregation**:
   - New `useBeaconAggregator` hook collects states from all spaces
   - Uses existing `useAttentionBeacon` logic internally
   - Provides sorted list for BeaconQueue display

4. **Scroll-to-Space Navigation**:
   - Use `scrollIntoView({ behavior: 'smooth', block: 'center' })`
   - Add `data-space-id={id}` attribute to ModernSpaceCard
   - Reuse existing `highlightedSpaceId` state for visual highlight

5. **No New Metrics Hooks**:
   - Reuse `users` from `usePresence()` → Online count
   - Reuse `usersInSpaces` from `usePresence()` → Active meetings
   - Reuse `spaces.length` → Total spaces
   - Only NEW: beacon count aggregation

### Component Structure

```tsx
// NowBoard.tsx - CONSOLIDATES existing functionality
<div className="now-board">
  {/* Left: Metrics - REUSES existing data from floor-plan.tsx */}
  <NowBoardMetrics
    totalSpaces={spaces.length}
    onlineUsers={users.length}
    activeMeetings={spacesWithUsers.length}
    normalBeacons={aggregatedBeacons.normalCount}
    criticalBeacons={aggregatedBeacons.criticalCount}
  />
  
  {/* Center: Beacon Queue - NEW component */}
  <BeaconQueue
    beacons={aggregatedBeacons.activeBeacons}
    onBeaconClick={scrollToSpace}
  />
  
  {/* Right: Filters + Search - RELOCATED from controls bar */}
  <div className="now-board-filters">
    <NeighborhoodFilters ... />  {/* REUSE existing component */}
    <SpaceSearch ... />  {/* NEW: enhanced version of existing Input */}
  </div>
</div>
```

### CSS Token Design

```css
/* src/styles/themes/tokens.css additions */

/* NowBoard - Base */
--vo-now-board-height: 80px;
--vo-now-board-padding: 12px 24px;
--vo-now-board-gap: 24px;

/* NowBoard - Glass Effect */
--vo-now-board-bg: rgba(255, 255, 255, 0.7);
--vo-now-board-backdrop-blur: 12px;
--vo-now-board-border: 1px solid rgba(0, 0, 0, 0.08);
--vo-now-board-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);

/* NowBoard - Metrics */
--vo-now-board-metric-icon-size: 20px;
--vo-now-board-metric-font-size: 14px;

/* NowBoard - Beacon Queue */
--vo-now-board-beacon-item-height: 32px;
--vo-now-board-beacon-max-height: 120px;

/* Theme: Neon Cyberpunk */
[data-theme="neon"] {
  --vo-now-board-bg: rgba(5, 5, 5, 0.85);
  --vo-now-board-border: 1px solid rgba(0, 242, 255, 0.2);
  --vo-now-board-shadow: 0 4px 24px rgba(0, 242, 255, 0.1);
}

/* Theme: Zen Garden */
[data-theme="zen"] {
  --vo-now-board-bg: rgba(244, 241, 234, 0.9);
  --vo-now-board-border: 1px solid rgba(61, 76, 65, 0.15);
}

/* Theme: Obsidian Stealth */
[data-theme="obsidian"] {
  --vo-now-board-bg: rgba(0, 0, 0, 0.9);
  --vo-now-board-border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Theme: Paper White */
[data-theme="paper"] {
  --vo-now-board-bg: rgba(255, 255, 255, 0.95);
  --vo-now-board-border: 1px solid rgba(17, 17, 17, 0.1);
}
```

### Project Structure Notes

**New Files (6):**
- `src/components/floor-plan/modern/NowBoard.tsx` - Main container
- `src/components/floor-plan/modern/NowBoardMetrics.tsx` - Metrics sub-component
- `src/components/floor-plan/modern/BeaconQueue.tsx` - Beacon list NEW
- `src/components/floor-plan/modern/SpaceSearch.tsx` - Enhanced search input
- `src/hooks/useBeaconAggregator.ts` - Beacon aggregation hook NEW
- `__tests__/now-board.test.tsx` - Tests

**Modified Files (4):**
- `src/components/floor-plan/floor-plan.tsx`:
  - **DELETE**: Status Cards grid (lines 210-236)
  - **DELETE**: NeighborhoodFilters from controls bar
  - **DELETE**: Search Input from controls bar
  - **ADD**: NowBoard component with props
- `src/components/floor-plan/modern/index.ts` - Export NowBoard components
- `src/styles/themes/tokens.css` - Add NowBoard tokens
- `src/components/floor-plan/modern/ModernSpaceCard.tsx` - Add `data-space-id` attribute

**Reused (NOT recreated):**
- `src/components/floor-plan/modern/NeighborhoodFilters.tsx` - Relocated
- `src/hooks/useNeighborhoodFilters.ts` - Passed through
- `src/hooks/useAttentionBeacon.ts` - Extended for aggregation
- `searchQuery` state in floor-plan.tsx - Existing

[Source: AGENTS.md#project-structure-scoped, AGENTS.md#anti-duplication-protocol]

### Dependencies & Risk Notes

- **Beacon Aggregation**: Need to run `useAttentionBeacon` for each space in parent - may have performance implications with 50+ spaces. Consider memoization.
- **Status Cards Removal**: Verify no other code depends on Status Cards before deletion.
- **Filter State**: Keep state in floor-plan.tsx to avoid prop drilling issues.
- **Glass Morphism**: `backdrop-blur` may have performance issues on lower-end devices - provide fallback.
- **Scroll Behavior**: `scrollIntoView` may conflict with any existing scroll handlers.

### References
- docs/epics.md#story-3.10-now-board-header
- docs/ux-design-specification.md#6.1-component-strategy (NowBoard module)
- docs/ux-design-specification.md#5.1-critical-user-paths (Leader Command Path)
- docs/ux-design-specification.md#8.1-responsive-strategy
- docs/ux-space-grid-v2.html (Now Board implementation reference)
- docs/sprint-artifacts/3-9-space-grouping-and-neighborhoods.md (previous story patterns)
- docs/sprint-artifacts/3-4-attention-beacon-system.md (beacon hook reference)
- AGENTS.md#anti-duplication-protocol (critical reference)

## Dev Agent Record

### Context Reference

- **Story Context XML**: `docs/sprint-artifacts/3-10-now-board-header.context.xml`
- **Generated**: 2025-11-26
- **Contains**: Full technical context including code interfaces, constraints, anti-duplication rules, test specifications

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2025-11-26: Story drafted via Scrum Master agent for Epic 3 visual overhaul (Story 3.10).
- 2025-11-26: **Story revised after Anti-Duplication Analysis:**
  - AC1: Clarified NowBoard CONSOLIDATES existing Status Cards grid
  - AC2: Changed to REUSE existing metrics data, not create new hooks
  - AC3: Clarified as NEW functionality (beacon aggregation)
  - AC4, AC5: Changed to RELOCATE, not recreate
  - AC8: NEW - Added explicit deprecation of Status Cards grid
  - AC9: Renumbered from AC8
  - Task 2: Changed from "create metrics hook" to "consolidate/remove existing"
  - Task 3: Changed to beacon AGGREGATION (new hook)
  - Task 5, 6: Changed to RELOCATE existing functionality
  - Dev Notes: Added complete Anti-Duplication Analysis table
  - Dev Notes: Added "Code to REMOVE" section with specific line numbers
  - Reduced new files from 7 to 6 (no `useFloorPlanMetrics.ts`, no `useSpaceSearch.ts`)
- 2025-11-26: **Story context XML generated** - Status updated to `ready-for-dev`
  - Generated `3-10-now-board-header.context.xml` with full technical context
  - Includes: code interfaces, constraints, anti-duplication rules, test specifications
  - All artifacts, dependencies, and implementation notes documented

