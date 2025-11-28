# Story 3.12: Space Capacity and "Room Full" Handling

Status: done

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

## ⚠️ PRE-IMPLEMENTATION AUDIT (2025-11-28)

**CRITICAL**: The following functionality ALREADY EXISTS and must NOT be recreated:

| Feature | Location | Status |
|---------|----------|--------|
| `CapacityIndicator` component | `src/components/floor-plan/modern/StatusIndicators.tsx` | ✅ EXISTS |
| Capacity display on card | `ModernSpaceCard.tsx` line 345-350 | ✅ INTEGRATED |
| Client-side capacity check | `ModernFloorPlan.tsx` line 114-116 | ✅ WORKS |
| `Space.capacity` type | `src/types/database.ts` line 113 | ✅ EXISTS |
| API for location | `/api/users/location` | ✅ USE THIS |
| Beacon at 80% | `useAttentionBeacon.ts` line 136-145 | ✅ EXISTS |

**DO NOT CREATE**: New `/api/spaces/[id]/join` route - use existing `/api/users/location`

---

## Tasks / Subtasks (REVISED - Reduced Scope)

### Task 1: Create FullBadge Component (AC2, AC7) — NEW
- [x] 1.1 Create `src/components/floor-plan/modern/FullBadge.tsx`:
  - Props: `{ className?: string }`
  - Displays "Full" text with appropriate styling
  - Theme-specific background colors
  - Animated entry (fade-in)
- [x] 1.2 Add badge tokens for all 4 themes in `tokens.css`:
  - Neon: red glow (#ff4d4d)
  - Zen: muted clay (#D48C70)
  - Obsidian: white text on dark
  - Paper: red (#FF3B30)
- [x] 1.3 Export from `src/components/floor-plan/modern/index.ts`.

### Task 2: Add Full State Visual Treatment to ModernSpaceCard (AC2) — MODIFY EXISTING
- [x] 2.1 **MODIFY** `src/components/floor-plan/modern/ModernSpaceCard.tsx`:
  - Calculate `isFull = space.capacity > 0 && usersInSpace.length >= space.capacity`
  - Conditionally render `FullBadge` when `isFull`
  - Add dimmed styling when full: `opacity: 0.7`, `filter: grayscale(0.3)`
- [x] 2.2 **NOTE**: `CapacityIndicator` already integrated - NO CHANGES NEEDED

### Task 3: Disable Join Button When Full (AC3) — MODIFY EXISTING
- [x] 3.1 **MODIFY** `src/components/floor-plan/modern/SpaceActionButtons.tsx`:
  - Add `isFull?: boolean` prop to interface
  - Disable "Join" button when `isFull === true`
  - Add `title` attribute: "Space is full - cannot join"
  - Add `aria-disabled="true"` for accessibility
- [x] 3.2 **MODIFY** `src/components/floor-plan/modern/SpaceDetailPanel.tsx`:
  - Calculate `isFull` from `space.capacity` and `usersInSpace.length`
  - Pass `isFull` prop to `SpaceActionButtons`

### Task 4: Add Capacity Display to SpaceDetailPanel (AC6) — MODIFY EXISTING
- [x] 4.1 **MODIFY** `src/components/floor-plan/modern/SpaceDetailPanel.tsx`:
  - Import existing `CapacityIndicator` from `./StatusIndicators`
  - Add capacity section below participant roster header
  - Show `CapacityIndicator` with `size="md"`
- [x] 4.2 Add optional progress bar (extend existing CapacityIndicator if needed)

### Task 5: Add API Capacity Validation (AC5) — MODIFY EXISTING API
- [x] 5.1 **MODIFY** `src/app/api/users/location/route.ts`:
  - Before updating location, fetch space capacity
  - If `spaceId` provided and space is at capacity, return 409 Conflict
  - Error body: `{ error: "Space is full", code: "SPACE_FULL" }`
- [x] 5.2 **DO NOT CREATE** new `/api/spaces/[id]/join` - use existing location API

### Task 6: Client-Side Error Handling for Full Space (AC3, AC5)
- [x] 6.1 **MODIFY** `src/hooks/useLastSpace.ts`:
  - Handle 409 response with user-friendly toast
  - Toast message: "Cannot join - space is full"
- [x] 6.2 **MODIFY** `src/components/floor-plan/modern/ModernFloorPlan.tsx`:
  - The client validation already exists (line 114-116)
  - Just ensure error message is user-friendly

### Task 7: Accessibility Improvements (AC8)
- [x] 7.1 Add `aria-label` to ModernSpaceCard with capacity info
- [x] 7.2 `FullBadge` has `role="status"` and `aria-label="Space is full"`
- [x] 7.3 Disabled join button has `aria-disabled="true"` and descriptive title

### Task 8: Unit & Integration Tests
- [x] 8.1 Test FullBadge renders with correct theme styling (AC2)
- [x] 8.2 Test ModernSpaceCard shows dimmed state when full (AC2)
- [x] 8.3 Test SpaceActionButtons disable join when full (AC3)
- [x] 8.4 Test API returns 409 for full space join attempt (AC5)
- [x] 8.5 Test SpaceDetailPanel shows CapacityIndicator (AC6)

---

## ❌ REMOVED TASKS (Already Implemented)

The following tasks were **removed** because functionality already exists:

| Original Task | Reason Removed |
|--------------|----------------|
| Task 1: Add Capacity Field | `Space.capacity` already exists in `database.ts` |
| Task 2: Create CapacityIndicator | Already exists in `StatusIndicators.tsx` |
| Task 4.1: Add CapacityIndicator to card | Already integrated in `ModernSpaceCard.tsx` |
| Task 7: Beacon at 80% | Already implemented in `useAttentionBeacon.ts` |
| Task 8: Create new JOIN API | Use existing `/api/users/location` |

---

## Dev Notes

### ⚠️ CRITICAL: Pre-Implementation Audit Findings

**Audit Date:** 2025-11-28

#### ✅ EXISTING FUNCTIONALITY (DO NOT RECREATE)

| Feature | Location | Evidence |
|---------|----------|----------|
| `CapacityIndicator` | `StatusIndicators.tsx` L176-227 | Fully functional with tooltips |
| Capacity on card | `ModernSpaceCard.tsx` L345-350 | Already renders `<CapacityIndicator>` |
| Client capacity check | `ModernFloorPlan.tsx` L114-116 | Blocks join when full |
| `Space.capacity` type | `database.ts` L113 | `capacity: number` |
| Beacon at 80% | `useAttentionBeacon.ts` L136-145 | Trigger implemented |
| Location API | `/api/users/location` | Working, tested |

#### 🎯 ACTUAL NEW WORK REQUIRED

1. **FullBadge component** — Visual "Full" badge (NEW)
2. **Dimmed card styling** — CSS for full state (EXTEND)
3. **Disabled join button** — Add `isFull` prop (MODIFY)
4. **API capacity validation** — Add check to existing `/api/users/location` (MODIFY)
5. **Capacity in SpaceDetailPanel** — Reuse existing CapacityIndicator (MODIFY)

### Files to Modify (Reduced Scope)

| File | Action | Changes |
|------|--------|---------|
| `ModernSpaceCard.tsx` | MODIFY | Add FullBadge, dimmed styling |
| `SpaceActionButtons.tsx` | MODIFY | Add `isFull` prop |
| `SpaceDetailPanel.tsx` | MODIFY | Add CapacityIndicator (reuse existing) |
| `/api/users/location/route.ts` | MODIFY | Add capacity check before update |
| `tokens.css` | EXTEND | Add full-badge tokens |

### New Files (Only 1)

| File | Purpose |
|------|---------|
| `FullBadge.tsx` | "Full" badge component |

### Learnings from Previous Story

**From Story 3.11: Space Detail Hover Panel (Status: done)**

- **Component Location**: New components in `src/components/floor-plan/modern/`
- **Token Pattern**: Tokens in `src/styles/themes/tokens.css` with theme-specific overrides using `[data-theme="..."]`
- **Click-Stop Protocol**: Use `data-avatar-interactive="true"` and `stopPropagation()` on interactive elements
- **Theme Support**: All 4 themes (neon, zen, obsidian, paper) have specific token overrides
- **Animation**: 200ms transitions with `ease-out` timing
- **Accessibility**: Use `aria-live`, `aria-label`, `role` attributes consistently

### Architecture Decisions

1. **USE EXISTING API** — `/api/users/location` not `/api/spaces/[id]/join`
   - The location API already updates `current_space_id`
   - Just add capacity validation before the update
   - Return 409 Conflict if full

2. **Percentage-Based Thresholds** (already implemented in beacon):
   - 0-79%: Normal state
   - 80-99%: Warning state (beacon fires - ALREADY WORKS)
   - 100%: Full state (join blocked - client check EXISTS)

3. **UI State Flow**:
   ```
   Normal (< 80%) → Warning (80-99%) → Full (100%)
        ↓                  ↓                ↓
   Green/neutral      Yellow/warning   Red/critical
   Join enabled       Join enabled     Join disabled
   No beacon          Warning beacon   Full badge shown
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

### Project Structure Notes (REVISED)

**New Files (1 ONLY):**
- `src/components/floor-plan/modern/FullBadge.tsx` - Full status badge

**Modified Files (4):**
- `src/components/floor-plan/modern/ModernSpaceCard.tsx` - Add FullBadge, dimmed styling
- `src/components/floor-plan/modern/SpaceActionButtons.tsx` - Add `isFull` disabled state
- `src/components/floor-plan/modern/SpaceDetailPanel.tsx` - Add CapacityIndicator (reuse existing)
- `src/app/api/users/location/route.ts` - Add capacity validation

**Test Files (1):**
- `__tests__/space-capacity-handling.test.tsx` - Tests for new features

**⚠️ FILES THAT ALREADY EXIST (NO CHANGES):**
- `CapacityIndicator` - Already in `StatusIndicators.tsx`
- `useAttentionBeacon.ts` - 80% trigger already works
- `Space.capacity` type - Already in `database.ts`

### Dependencies & Risk Notes

- **Database Schema**: `spaces.capacity` column already exists (verified in `database-structure.md`)
- **Race Conditions**: API must handle concurrent join attempts
- **Real-time Updates**: Capacity count already updates via Supabase Realtime
- **Backward Compatibility**: `capacity = 0` means unlimited

### References

- [docs/epics.md#story-3.12-space-capacity-and-room-full-handling](docs/epics.md#story-3.12-space-capacity-and-room-full-handling)
- [docs/ux-design-specification.md#3.1-color-system](docs/ux-design-specification.md#3.1-color-system) (theme colors)
- [docs/sprint-artifacts/3-11-space-detail-hover-panel.md](docs/sprint-artifacts/3-11-space-detail-hover-panel.md) (previous story)
- [AGENTS.md#ui-interaction-click-stop-standard](AGENTS.md#ui-interaction-click-stop-standard)

## Dev Agent Record

### Context Reference

- [3-12-space-capacity-and-room-full-handling.context.xml](3-12-space-capacity-and-room-full-handling.context.xml)

### Agent Model Used

Claude Opus 4.5 (Preview)

### Debug Log References

N/A

### Completion Notes List

1. Task 1 completed: Created `FullBadge.tsx` component with theme-aware styling
2. Task 2 completed: Added `isFull` calculation, `FullBadge` rendering, and dimmed styling to `ModernSpaceCard`
3. Task 3 completed: Added `isFull` prop to `SpaceActionButtons`, disables Join button when full
4. Task 4 completed: Added `CapacityIndicator` to `SpaceDetailPanel` with capacity display
5. Task 5 completed: Added capacity validation to `/api/users/location` route (returns 409 when full)
6. Task 6 completed: Added 409 SPACE_FULL handling in `useLastSpace` hook, improved error messages
7. Task 7 completed: Enhanced `aria-label` on `ModernSpaceCard` with capacity info
8. Task 8 completed: Added 16 unit tests for capacity handling (all passing)

### File List

**New Files:**
- `src/components/floor-plan/modern/FullBadge.tsx` — Full status badge component
- `__tests__/space-capacity-handling.test.tsx` — Unit tests for Story 3.12

**Modified Files:**
- `src/styles/themes/tokens.css` — Added `--vo-full-badge-*` tokens for all 4 themes
- `src/components/floor-plan/modern/index.ts` — Exported `FullBadge`
- `src/components/floor-plan/modern/ModernSpaceCard.tsx` — Added `isFull` logic, `FullBadge`, dimmed styling, enhanced aria-label
- `src/components/floor-plan/modern/SpaceActionButtons.tsx` — Added `isFull` prop to disable Join button
- `src/components/floor-plan/modern/SpaceDetailPanel.tsx` — Added `isFull` prop, `CapacityIndicator`
- `src/components/floor-plan/modern/SpaceDetailBottomSheet.tsx` — Added `isFull` passthrough
- `src/app/api/users/location/route.ts` — Added capacity validation (409 Conflict)
- `src/hooks/useLastSpace.ts` — Added SPACE_FULL error handling
- `src/components/floor-plan/modern/ModernFloorPlan.tsx` — Improved error message

## Change Log

- 2025-11-28: Story drafted via Scrum Master agent for Epic 3 visual overhaul (Story 3.12).
- 2025-11-28: Story context XML generated via `*create-story-context` workflow. Status: ready-for-dev.
- 2025-11-28: **MAJOR REVISION** - Pre-implementation audit identified significant existing functionality:
  - ❌ REMOVED: Task 1 (capacity field already exists)
  - ❌ REMOVED: Task 2 (CapacityIndicator already exists in StatusIndicators.tsx)
  - ❌ REMOVED: Task 7 (beacon at 80% already works in useAttentionBeacon.ts)
  - ❌ REMOVED: Task 8 (use existing /api/users/location, not new API)
  - ✅ REDUCED: From 12 tasks to 8 tasks
  - ✅ REDUCED: From 8 new/modified files to 5 files
  - ✅ REDUCED: From 2 new components to 1 (only FullBadge.tsx)
- 2025-11-28: **IMPLEMENTATION COMPLETE** - Dev Agent (Claude Opus 4.5) implemented all 8 tasks:
  - All ACs (AC1-AC8) addressed
  - 16 unit tests passing (401 total tests in suite)
  - TypeScript type-check passing
  - Status changed to: ready-for-review
- 2025-11-28: **CODE REVIEW APPROVED** - Systematic validation passed:
  - 8/8 ACs validated with file:line evidence
  - 8/8 Tasks confirmed complete
  - Accessibility: role="status", aria-label, aria-disabled
  - Theme tokens: 5 themes covered (root, neon, zen, obsidian, paper)
- 2025-11-28: **MANUAL VALIDATION PASSED** - User confirmed story complete. Status: done
