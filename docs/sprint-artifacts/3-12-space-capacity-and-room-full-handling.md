# Story 3.12: Space Capacity and "Room Full" Handling

Status: drafted

## Story

As a user,
I want clear visual indication when a space is at capacity,
So that I don't try to join full spaces and get blocked.

## Acceptance Criteria

1. **AC1 – Occupancy Count Visible on Card**
   - ModernSpaceCard displays occupancy count (e.g., "6 Active").
   - Count updates in real-time as users join/leave.
   - Format: "{current}/{capacity}" or "{current} Active" if no capacity limit.
   - [Source: docs/epics.md#story-3.12-space-capacity-and-room-full-handling]

2. **AC2 – Full Spaces Have Visual Treatment**
   - Full spaces (occupancy ≥ capacity) have dimmed appearance.
   - "Full" badge displayed prominently on card.
   - Badge styled per theme (e.g., red in Neon, muted in Zen).
   - [Source: docs/epics.md#story-3.12-space-capacity-and-room-full-handling]

3. **AC3 – Join Button Disabled for Full Spaces**
   - "Join" button disabled when space is at capacity.
   - Disabled button shows tooltip explaining "Space is full".
   - Visual state change (grayed out, cursor not-allowed).
   - [Source: docs/epics.md#story-3.12-space-capacity-and-room-full-handling]

4. **AC4 – Attention Beacon Triggers at 80% Capacity**
   - Beacon fires automatically when occupancy reaches 80% of capacity.
   - Beacon type: "warning" (not critical) per UX spec.
   - Beacon message: "Space nearing capacity".
   - Integrates with existing AttentionBeacon system (Story 3.4).
   - [Source: docs/epics.md#story-3.12-space-capacity-and-room-full-handling, docs/ux-design-specification.md#7.1-consistency-rules]

5. **AC5 – Capacity Validation Enforced in API**
   - POST /api/spaces/[id]/join validates capacity before allowing join.
   - Returns 409 Conflict if space is full with error message.
   - Race condition handling: Check capacity atomically with join.
   - [Source: docs/epics.md#story-3.12-space-capacity-and-room-full-handling]

6. **AC6 – Capacity Display in SpaceDetailPanel**
   - SpaceDetailPanel shows capacity info: "6 of 10 participants".
   - Progress bar or indicator showing how full the space is.
   - Clear messaging when space is full.
   - [Source: docs/sprint-artifacts/3-11-space-detail-hover-panel.md - AC2]

7. **AC7 – Theme-Aware Capacity Styling**
   - "Full" badge and disabled states use theme tokens.
   - Works correctly in all 4 themes (Neon, Zen, Obsidian, Paper).
   - Consistent with existing warning/error color patterns.
   - [Source: docs/ux-design-specification.md#3.1-color-system]

8. **AC8 – Accessibility for Capacity States**
   - Screen reader announces capacity status: "Space Engineering Hub, 6 of 10 participants, nearing capacity".
   - "Full" badge has appropriate aria-label.
   - Disabled join button announces why it's disabled.
   - [Source: docs/ux-design-specification.md#8.1-responsive-strategy]

## Tasks / Subtasks

### Task 1: Add Capacity Field to Space Data Model (AC1, AC5)
- [ ] 1.1 Verify `spaces` table has `capacity` column (integer, nullable for unlimited).
- [ ] 1.2 Update `Space` type in `src/types/database.ts` to include `capacity?: number`.
- [ ] 1.3 Update `ISpaceRepository` interface with capacity-aware methods.
- [ ] 1.4 Update `SupabaseSpaceRepository` to fetch capacity data.

### Task 2: Create CapacityIndicator Component (AC1, AC7)
- [ ] 2.1 Create `src/components/floor-plan/modern/CapacityIndicator.tsx`:
  - Props: `{ current: number, capacity?: number, showBar?: boolean }`
  - Display: "{current}/{capacity}" or "{current} Active"
  - Progress bar (optional) showing fill percentage
  - Theme-aware colors (warning at 80%, critical at 100%)
- [ ] 2.2 Add capacity tokens to `src/styles/themes/tokens.css`:
  - `--vo-capacity-normal: var(--vo-text-muted)`
  - `--vo-capacity-warning: var(--vo-signal-warning)`
  - `--vo-capacity-full: var(--vo-signal-critical)`
- [ ] 2.3 Export from `src/components/floor-plan/modern/index.ts`.

### Task 3: Create FullBadge Component (AC2, AC7)
- [ ] 3.1 Create `src/components/floor-plan/modern/FullBadge.tsx`:
  - Props: `{ className?: string }`
  - Displays "Full" text with appropriate styling
  - Theme-specific background colors
  - Animated entry (fade-in)
- [ ] 3.2 Add badge tokens for all 4 themes:
  - Neon: red glow (#ff4d4d)
  - Zen: muted clay (#D48C70)
  - Obsidian: white text on dark
  - Paper: red (#FF3B30)

### Task 4: Integrate Capacity Display into ModernSpaceCard (AC1, AC2)
- [ ] 4.1 **MODIFY** `src/components/floor-plan/modern/ModernSpaceCard.tsx`:
  - Add `CapacityIndicator` to card content
  - Conditionally render `FullBadge` when at capacity
  - Add dimmed styling when full: `opacity: 0.7`, `filter: grayscale(0.3)`
- [ ] 4.2 Calculate capacity percentage: `const percentFull = capacity ? (current / capacity) * 100 : 0`.
- [ ] 4.3 Apply warning state at 80%: add subtle border glow.
- [ ] 4.4 Apply full state at 100%: add dimmed effect + badge.

### Task 5: Disable Join Button When Full (AC3)
- [ ] 5.1 **MODIFY** `src/components/floor-plan/modern/SpaceActionButtons.tsx`:
  - Add `isFull: boolean` prop
  - Disable "Join" button when `isFull === true`
  - Add `title` attribute: "Space is full - cannot join"
  - Add `aria-disabled="true"` for accessibility
- [ ] 5.2 Style disabled state: `opacity: 0.5`, `cursor: not-allowed`.
- [ ] 5.3 **MODIFY** `src/components/floor-plan/modern/SpaceDetailPanel.tsx`:
  - Pass `isFull` prop to SpaceActionButtons.

### Task 6: Capacity Indicator in SpaceDetailPanel (AC6)
- [ ] 6.1 **MODIFY** `src/components/floor-plan/modern/SpaceDetailPanel.tsx`:
  - Add capacity section below participant roster
  - Show `CapacityIndicator` with `showBar={true}`
  - Clear messaging: "Space is full" when at capacity
- [ ] 6.2 Add visual progress bar for capacity fill percentage.

### Task 7: Attention Beacon at 80% Capacity (AC4)
- [ ] 7.1 **MODIFY** `src/hooks/use-attention-beacon.ts`:
  - Add capacity trigger: `if (percentFull >= 80 && percentFull < 100)`
  - Beacon type: "warning"
  - Beacon message: "Space nearing capacity"
- [ ] 7.2 Ensure beacon logic doesn't double-fire on re-renders.
- [ ] 7.3 Add full capacity beacon: `if (percentFull >= 100)`:
  - Beacon type: "info" (informational, not blocking)
  - Beacon message: "Space is full"

### Task 8: API Capacity Validation (AC5)
- [ ] 8.1 **MODIFY** `src/app/api/spaces/[id]/join/route.ts`:
  - Fetch current occupancy and capacity before join
  - Return 409 Conflict if `occupancy >= capacity`
  - Error body: `{ error: "Space is full", code: "SPACE_FULL" }`
- [ ] 8.2 Implement atomic check-and-join using Supabase transaction or RPC.
- [ ] 8.3 Handle race conditions: Use `FOR UPDATE` lock or optimistic locking.

### Task 9: Client-Side Error Handling for Full Space (AC3, AC5)
- [ ] 9.1 **MODIFY** `src/hooks/mutations/useJoinSpace.ts` (or create if needed):
  - Handle 409 response with user-friendly toast
  - Toast message: "Cannot join - space is full"
  - Refresh space data to update UI state
- [ ] 9.2 Add error handling in ModernFloorPlan for join failures.

### Task 10: Accessibility Implementation (AC8)
- [ ] 10.1 Add `aria-label` to ModernSpaceCard with capacity info:
  - `aria-label="Space {name}, {current} of {capacity} participants"`
- [ ] 10.2 Add `aria-live="polite"` to capacity indicator for real-time updates.
- [ ] 10.3 `FullBadge` has `aria-label="Space is full"`.
- [ ] 10.4 Disabled join button has `aria-disabled="true"` and descriptive title.

### Task 11: Unit & Integration Tests
- [ ] 11.1 Test CapacityIndicator renders correct format (AC1).
- [ ] 11.2 Test FullBadge renders with correct theme styling (AC2).
- [ ] 11.3 Test ModernSpaceCard shows dimmed state when full (AC2).
- [ ] 11.4 Test SpaceActionButtons disable join when full (AC3).
- [ ] 11.5 Test attention beacon triggers at 80% capacity (AC4).
- [ ] 11.6 Test API returns 409 for full space join attempt (AC5).
- [ ] 11.7 Test SpaceDetailPanel shows capacity progress bar (AC6).
- [ ] 11.8 Test all 4 themes render capacity styling correctly (AC7).
- [ ] 11.9 Test screen reader announcements for capacity (AC8).

### Task 12: Theme Testing (AC7)
- [ ] 12.1 Test capacity indicator in Neon Cyberpunk theme.
- [ ] 12.2 Test capacity indicator in Zen Garden theme.
- [ ] 12.3 Test capacity indicator in Obsidian Stealth theme.
- [ ] 12.4 Test capacity indicator in Paper White theme.
- [ ] 12.5 Verify text contrast meets WCAG AA for all states.

## Dev Notes

### ⚠️ CRITICAL: Anti-Duplication Analysis

**Analysis Date:** 2025-11-28

The following existing functionality will be **REUSED**, not recreated:

| Feature | Exists In | Action |
|---------|-----------|--------|
| Theme tokens | `src/styles/themes/tokens.css` | **EXTEND** with capacity tokens |
| AttentionBeacon hook | `src/hooks/use-attention-beacon.ts` | **EXTEND** with capacity trigger |
| ModernSpaceCard | `src/components/floor-plan/modern/ModernSpaceCard.tsx` | **MODIFY** to add capacity |
| SpaceActionButtons | `src/components/floor-plan/modern/SpaceActionButtons.tsx` | **MODIFY** for disabled state |
| SpaceDetailPanel | `src/components/floor-plan/modern/SpaceDetailPanel.tsx` | **MODIFY** to show capacity |
| Space type | `src/types/database.ts` | **EXTEND** with capacity field |
| Join API | `src/app/api/spaces/[id]/join/` | **MODIFY** for validation |

### Learnings from Previous Story

**From Story 3.11: Space Detail Hover Panel (Status: done)**

- **Component Location**: New components in `src/components/floor-plan/modern/`
- **Token Pattern**: Tokens in `src/styles/themes/tokens.css` with theme-specific overrides using `[data-theme="..."]`
- **Click-Stop Protocol**: Use `data-avatar-interactive="true"` and `stopPropagation()` on interactive elements
- **Theme Support**: All 4 themes (neon, zen, obsidian, paper) have specific token overrides
- **Glass-Morphism Pattern**: Use `backdrop-blur: 16px`, `rgba()` backgrounds
- **Animation**: 200ms transitions with `ease-out` timing
- **Accessibility**: Use `aria-live`, `aria-label`, `role` attributes consistently

**New Services/Patterns from 3.11:**
- `SpaceDetailPanel.tsx` - Container for detailed space info (MODIFY for capacity)
- `SpaceActionButtons.tsx` - Join/Leave/Knock buttons (MODIFY for disabled state)
- `ParticipantRoster.tsx` - User list display (reference for count)
- `useSpaceDetails.ts` - Data fetching hook (may need capacity data)

**Review Finding from 3.11:**
- `handleLeave` function was missing proper prop wiring - ensure similar join/leave handlers are properly connected

[Source: docs/sprint-artifacts/3-11-space-detail-hover-panel.md#Dev-Agent-Record]

### Architecture Decisions

1. **Capacity Field on Spaces Table**:
   - Add `capacity` column (integer, nullable = unlimited)
   - RLS policies already cover space access
   - Default: null (no limit) for backward compatibility

2. **Percentage-Based Thresholds**:
   - 0-79%: Normal state
   - 80-99%: Warning state (beacon trigger)
   - 100%: Full state (join blocked)

3. **API Validation Pattern**:
   - Check capacity atomically with join operation
   - Use Supabase RPC for transaction-like behavior
   - Return 409 Conflict for clear client handling

4. **UI State Flow**:
   ```
   Normal (< 80%) → Warning (80-99%) → Full (100%)
        ↓                  ↓                ↓
   Green/neutral      Yellow/warning   Red/critical
   Join enabled       Join enabled     Join disabled
   No beacon          Warning beacon   Info beacon
   ```

### Component Structure

```tsx
// CapacityIndicator.tsx
<div className="capacity-indicator">
  <span className="capacity-count">
    {current}/{capacity} participants
  </span>
  {showBar && (
    <div className="capacity-bar">
      <div 
        className="capacity-fill" 
        style={{ width: `${percentFull}%` }}
        data-state={percentFull >= 100 ? 'full' : percentFull >= 80 ? 'warning' : 'normal'}
      />
    </div>
  )}
</div>

// FullBadge.tsx
<span 
  className="full-badge"
  aria-label="Space is full"
>
  Full
</span>
```

### CSS Token Design

```css
/* src/styles/themes/tokens.css additions */

/* Capacity Indicator - Base */
--vo-capacity-bar-height: 4px;
--vo-capacity-bar-radius: 2px;
--vo-capacity-bar-bg: rgba(128, 128, 128, 0.2);

/* Capacity States */
--vo-capacity-normal: var(--vo-text-muted);
--vo-capacity-warning: #f59e0b; /* amber-500 */
--vo-capacity-full: #ef4444; /* red-500 */

/* Full Badge */
--vo-full-badge-bg: var(--vo-capacity-full);
--vo-full-badge-text: #ffffff;
--vo-full-badge-padding: 2px 8px;
--vo-full-badge-radius: 4px;

/* Theme: Neon Cyberpunk */
[data-theme="neon"] {
  --vo-capacity-warning: #ff9500;
  --vo-capacity-full: #ff4d4d;
  --vo-full-badge-bg: rgba(255, 77, 77, 0.9);
  --vo-full-badge-shadow: 0 0 8px rgba(255, 77, 77, 0.5);
}

/* Theme: Zen Garden */
[data-theme="zen"] {
  --vo-capacity-warning: #D48C70;
  --vo-capacity-full: #C45B4D;
  --vo-full-badge-bg: #C45B4D;
}

/* Theme: Obsidian Stealth */
[data-theme="obsidian"] {
  --vo-capacity-warning: #888888;
  --vo-capacity-full: #ffffff;
  --vo-full-badge-bg: #333333;
  --vo-full-badge-text: #ffffff;
}

/* Theme: Paper White */
[data-theme="paper"] {
  --vo-capacity-warning: #FF9500;
  --vo-capacity-full: #FF3B30;
  --vo-full-badge-bg: #FF3B30;
}
```

### API Validation Pattern

```typescript
// src/app/api/spaces/[id]/join/route.ts
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  
  // Get space with current occupancy (atomic read)
  const { data: space, error } = await supabase
    .from('spaces')
    .select('id, capacity, (space_members(count))')
    .eq('id', params.id)
    .single();
  
  if (!space) {
    return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  }
  
  const currentOccupancy = space.space_members?.[0]?.count || 0;
  
  // Check capacity
  if (space.capacity && currentOccupancy >= space.capacity) {
    return NextResponse.json(
      { error: 'Space is full', code: 'SPACE_FULL' },
      { status: 409 }
    );
  }
  
  // Proceed with join using RPC for atomicity
  const { error: joinError } = await supabase.rpc('join_space_if_not_full', {
    p_space_id: params.id,
    p_user_id: userId
  });
  
  if (joinError?.code === 'SPACE_FULL') {
    return NextResponse.json(
      { error: 'Space is full', code: 'SPACE_FULL' },
      { status: 409 }
    );
  }
  
  return NextResponse.json({ success: true });
}
```

### Project Structure Notes

**New Files (2):**
- `src/components/floor-plan/modern/CapacityIndicator.tsx` - Capacity display component
- `src/components/floor-plan/modern/FullBadge.tsx` - Full status badge

**Modified Files (6):**
- `src/components/floor-plan/modern/ModernSpaceCard.tsx` - Add capacity display
- `src/components/floor-plan/modern/SpaceActionButtons.tsx` - Add disabled state
- `src/components/floor-plan/modern/SpaceDetailPanel.tsx` - Add capacity section
- `src/hooks/use-attention-beacon.ts` - Add capacity trigger
- `src/app/api/spaces/[id]/join/route.ts` - Add capacity validation
- `src/styles/themes/tokens.css` - Add capacity tokens

**Test Files (1):**
- `__tests__/space-capacity-handling.test.tsx` - Tests for capacity features

[Source: AGENTS.md#project-structure-scoped, AGENTS.md#anti-duplication-protocol]

### Dependencies & Risk Notes

- **Database Schema**: May need migration to add `capacity` column if not present
- **Race Conditions**: API must handle concurrent join attempts atomically
- **Real-time Updates**: Capacity count must update via Supabase Realtime
- **Backward Compatibility**: Spaces without capacity (null) should work as unlimited

### References

- [docs/epics.md#story-3.12-space-capacity-and-room-full-handling](docs/epics.md#story-3.12-space-capacity-and-room-full-handling)
- [docs/ux-design-specification.md#7.1-consistency-rules](docs/ux-design-specification.md#7.1-consistency-rules) (attention beacon rules)
- [docs/ux-design-specification.md#3.1-color-system](docs/ux-design-specification.md#3.1-color-system) (theme colors)
- [docs/sprint-artifacts/3-11-space-detail-hover-panel.md](docs/sprint-artifacts/3-11-space-detail-hover-panel.md) (previous story patterns)
- [docs/sprint-artifacts/3-4-attention-beacon-system.md](docs/sprint-artifacts/3-4-attention-beacon-system.md) (beacon integration)
- [docs/architecture.md](docs/architecture.md) (repository pattern, API routes)
- [AGENTS.md#ui-interaction-click-stop-standard](AGENTS.md#ui-interaction-click-stop-standard)

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2025-11-28: Story drafted via Scrum Master agent for Epic 3 visual overhaul (Story 3.12).
