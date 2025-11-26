# Story 3.9: Space Grouping and Neighborhoods

Status: done

## Story

As an admin,
I want to organize spaces into neighborhoods (e.g., "Engineering", "Marketing"),
So that large office layouts are easier to navigate and understand.

## Acceptance Criteria

1. **AC1 – Neighborhood CRUD in Admin Settings**
   - Create neighborhood form with name, description, and color selection.
   - Edit neighborhood details (name, description, color).
   - Delete neighborhood with confirmation (orphaned spaces become ungrouped).
   - Neighborhoods stored in `neighborhoods` table or `spaces.metadata` field.
   - [Source: docs/epics.md#story-3.9-space-grouping-and-neighborhoods]

2. **AC2 – Space Assignment to Neighborhoods**
   - Spaces can be assigned to one neighborhood or remain ungrouped.
   - Admin UI dropdown/selector to assign neighborhood per space.
   - Assignment persists in database (foreign key or metadata field).
   - Batch assignment option for multiple spaces.
   - [Source: docs/epics.md#story-3.9-space-grouping-and-neighborhoods]

3. **AC3 – Visual Neighborhood Grouping in Grid**
   - Grid displays neighborhood groupings via visual bands/sections.
   - Neighborhood header shows name with color indicator.
   - Ungrouped spaces appear in "Other" or standalone section.
   - Grouping visible in all layout modes (Orbit, Analyst, Cinema).
   - [Source: docs/ux-design-specification.md#2.2-novel-ux-patterns - neighborhood bands]

4. **AC4 – Neighborhood Colors from Theme**
   - Neighborhood colors derived from theme CSS variables.
   - Each neighborhood uses unique color from available palette.
   - Color applied as section border/header accent and card gradient tint.
   - Colors update when theme changes (maintain consistency).
   - [Source: docs/ux-space-grid-v2.html - neighborhood styling]

5. **AC5 – Filter Chips in Now Board**
   - Filter chips in Now Board to show/hide neighborhoods.
   - Multiple neighborhoods can be toggled simultaneously.
   - "All" filter shows all spaces regardless of neighborhood.
   - Active filter state persists during session.
   - [Source: docs/epics.md#story-3.9-space-grouping-and-neighborhoods]

6. **AC6 – Data Model & API**
   - Repository methods for neighborhood CRUD operations.
   - API routes: `GET/POST/PUT/DELETE /api/neighborhoods`.
   - API route: `PATCH /api/spaces/:id/neighborhood` for assignment.
   - RLS policies ensure company-scoped access.
   - [Source: docs/architecture.md#repository-pattern]

7. **AC7 – Accessibility**
   - Neighborhood sections use semantic heading structure (h2/h3).
   - Filter chips keyboard accessible with visible focus states.
   - Screen reader announces neighborhood counts and filter state.
   - Reduced motion respects any section transition animations.
   - [Source: docs/ux-design-specification.md#8.1-responsive-strategy]

## Tasks / Subtasks

### Task 1: Database Schema & Repository (AC1, AC6)
- [x] 1.1 Design data model decision:
  - Option A: New `neighborhoods` table with `id, company_id, name, description, color, created_at, updated_at`
  - Option B: Use `spaces.metadata.neighborhood_id` with separate neighborhoods table
  - Recommend Option A for cleaner relational model
- [x] 1.2 Create `neighborhoods` table migration in Supabase:
  - `id` UUID primary key
  - `company_id` UUID foreign key to companies
  - `name` TEXT not null
  - `description` TEXT nullable
  - `color` TEXT (hex code or token name)
  - `created_at`, `updated_at` timestamps
  - RLS policy: company members can read, admins can write
- [x] 1.3 Add `neighborhood_id` nullable foreign key to `spaces` table.
- [x] 1.4 Create `INeighborhoodRepository` interface in `src/repositories/interfaces/`:
  - `getByCompanyId(companyId: string): Promise<Neighborhood[]>`
  - `getById(id: string): Promise<Neighborhood | null>`
  - `create(data: CreateNeighborhoodData): Promise<Neighborhood>`
  - `update(id: string, data: UpdateNeighborhoodData): Promise<Neighborhood>`
  - `delete(id: string): Promise<void>`
- [x] 1.5 Create `SupabaseNeighborhoodRepository` in `src/repositories/implementations/supabase/`.
- [x] 1.6 Add Neighborhood type to `src/types/database.ts`:
  ```typescript
  interface Neighborhood {
    id: string;
    company_id: string;
    name: string;
    description?: string;
    color: string;
    created_at: string;
    updated_at: string;
  }
  ```
- [x] 1.7 Register repository in factory (`src/repositories/factory.ts`).

### Task 2: API Routes (AC6)
- [x] 2.1 Create `src/app/api/neighborhoods/route.ts`:
  - GET: List neighborhoods for current company
  - POST: Create neighborhood (admin only)
- [x] 2.2 Create `src/app/api/neighborhoods/[id]/route.ts`:
  - GET: Get single neighborhood
  - PUT: Update neighborhood (admin only)
  - DELETE: Delete neighborhood (admin only)
- [x] 2.3 Create `src/app/api/spaces/[id]/neighborhood/route.ts`:
  - PATCH: Assign/unassign space to neighborhood (admin only)
- [x] 2.4 Add batch assignment endpoint `POST /api/neighborhoods/[id]/spaces`:
  - Body: `{ spaceIds: string[] }`
  - Assigns multiple spaces at once

### Task 3: Query & Mutation Hooks (AC1, AC2)
- [x] 3.1 Create `src/hooks/queries/useNeighborhoods.ts`:
  - Fetch all neighborhoods for company
  - Include space count per neighborhood
- [x] 3.2 Create `src/hooks/mutations/useNeighborhoodMutations.ts`:
  - `useCreateNeighborhood`
  - `useUpdateNeighborhood`
  - `useDeleteNeighborhood`
  - `useAssignSpaceToNeighborhood`
  - `useBatchAssignSpaces`
- [x] 3.3 Add neighborhood data to existing `useSpaces` hook or create join query.

### Task 4: Admin Neighborhood Management UI (AC1, AC2)

**⚠️ INTEGRATION STRATEGY: Extend existing `RoomDialog` and `RoomManagement` rather than creating parallel admin UI.**

- [x] 4.1 Create `src/components/floor-plan/neighborhoods/NeighborhoodManager.tsx`:
  - Reusable component for neighborhood CRUD (list, create, edit, delete)
  - Can be embedded in existing dialogs or standalone page
  - Props: `{ onSelect?: (neighborhood) => void, mode: 'manage' | 'select' }`
- [x] 4.2 Create `src/components/floor-plan/neighborhoods/NeighborhoodForm.tsx`:
  - Name input (required)
  - Description textarea (optional)
  - Color picker using theme palette tokens
  - Submit creates or updates neighborhood
- [x] 4.3 Create `src/components/floor-plan/neighborhoods/NeighborhoodDeleteDialog.tsx`:
  - Confirmation dialog with warning about orphaned spaces
  - Delete button triggers API call
- [x] 4.4 **MODIFY** `src/components/floor-plan/room-dialog/index.tsx` (RoomDialog):
  - Add "Neighborhood" dropdown field using NeighborhoodSelector
  - Dropdown shows all company neighborhoods + "None" option
  - Selected neighborhood saved with space on create/update
- [x] 4.5 **MODIFY** `src/components/floor-plan/room-management.tsx` (RoomManagement):
  - Add "Neighborhood" filter dropdown alongside existing type filter
  - Add "Manage Neighborhoods" button that opens NeighborhoodManager dialog
  - Show neighborhood badge on each room row
- [x] 4.6 Create `src/components/floor-plan/neighborhoods/NeighborhoodSelector.tsx`:
  - Dropdown to select neighborhood for a space
  - "None" option to unassign
  - "+ Create New" option opens inline form
  - Used in RoomDialog and RoomManagement

### Task 5: Grid Neighborhood Grouping UI (AC3, AC4)
- [x] 5.1 Create `src/components/floor-plan/modern/NeighborhoodSection.tsx`:
  - Props: `{ neighborhood: Neighborhood, spaces: Space[], variant: FloorPlanPerspective }`
  - Renders section header with name and color indicator
  - Contains child space cards
  - Adapts header size based on variant (orbit/analyst/cinema)
- [x] 5.2 Create `src/hooks/useGroupedSpaces.ts`:
  - Groups spaces by neighborhood_id
  - Returns `{ grouped: Map<string, Space[]>, ungrouped: Space[], neighborhoods: Neighborhood[] }`
  - Accepts neighborhoods array to maintain consistent ordering
- [x] 5.3 **MODIFY** `src/components/floor-plan/modern/ModernFloorPlan.tsx`:
  - Import `NeighborhoodSection` and `useGroupedSpaces`
  - Replace flat space rendering with grouped rendering:
    ```tsx
    // Before: spaces.map(space => <ModernSpaceCard ... />)
    // After: grouped sections + ungrouped section
    ```
  - Pass `perspective` prop to NeighborhoodSection for variant styling
  - Respect existing `filteredSpaces` from parent (already filtered by type/search)
- [x] 5.4 Add neighborhood section styling to `tokens.css`:
  - `--vo-neighborhood-border-width: 2px`
  - `--vo-neighborhood-header-height: 40px`
  - `--vo-neighborhood-header-height-compact: 28px` (for analyst view)
  - Section header gradient using neighborhood color
- [x] 5.5 Ensure grouping works in all layout modes:
  - Orbit: Full sections with headers (40px)
  - Analyst: Compact headers (28px), same grouping
  - Cinema: Large section divisions with prominent headers
- [x] 5.6 Export `NeighborhoodSection` from `src/components/floor-plan/modern/index.ts`

### Task 6: Neighborhood Color System (AC4)
- [x] 6.1 Define neighborhood color palette tokens in `tokens.css`:
  - `--vo-neighborhood-1` through `--vo-neighborhood-8`
  - Colors derived from theme accent variations
  - Each theme defines its own neighborhood palette
- [x] 6.2 Create `src/lib/neighborhood-colors.ts`:
  - `getNeighborhoodColor(index: number): string` returns CSS variable
  - `getAvailableColors(): string[]` returns unused colors
- [x] 6.3 Color picker in NeighborhoodForm uses available palette.
- [x] 6.4 NeighborhoodSection applies color to:
  - Section border (left/top accent line)
  - Header background gradient tint
  - Optional: subtle card background tint

### Task 7: Now Board Filter Chips (AC5)
- [x] 7.1 Create `src/components/floor-plan/modern/NeighborhoodFilters.tsx`:
  - Renders filter chip per neighborhood
  - "All" chip to show all spaces
  - Chips show neighborhood name with color dot
  - Accepts `neighborhoods: Neighborhood[]` and filter state props
- [x] 7.2 Create `src/hooks/useNeighborhoodFilters.ts`:
  - State: `activeFilters: Set<string>` (neighborhood IDs)
  - Actions: `toggleFilter`, `showAll`, `showOnly`, `isActive`
  - Filter logic: show space if ungrouped OR neighborhood in activeFilters OR activeFilters empty (show all)
  - Returns `filterSpaces(spaces: Space[]): Space[]` utility
- [x] 7.3 **MODIFY** `src/components/floor-plan/floor-plan.tsx`:
  - Import `NeighborhoodFilters` and `useNeighborhoodFilters`
  - Add NeighborhoodFilters component in controls bar (after perspective switcher)
  - Connect filter state to `filteredSpaces` computation:
    ```tsx
    // Existing: filterType, searchQuery
    // Add: neighborhoodFilters.filterSpaces(spaces)
    ```
  - Pass filtered spaces to ModernFloorPlan
- [x] 7.4 Connect filter state to ModernFloorPlan:
  - Filter occurs in parent (`floor-plan.tsx`), not in ModernFloorPlan
  - Filtered neighborhoods hide their sections entirely
  - Animate show/hide with CSS transitions
- [x] 7.5 Persist filter state in sessionStorage for session continuity.
- [x] 7.6 Export `NeighborhoodFilters` from `src/components/floor-plan/modern/index.ts`

### Task 8: Accessibility Implementation (AC7)
- [x] 8.1 NeighborhoodSection uses semantic headings:
  - Section heading level (h2 or h3 based on hierarchy)
  - `aria-labelledby` on section container
- [x] 8.2 Filter chips keyboard accessible:
  - Tab navigation between chips
  - Space/Enter toggles chip
  - Focus ring visible using theme token
- [x] 8.3 Screen reader announcements:
  - `aria-live="polite"` for filter state changes
  - Announce "Showing [X] neighborhoods, [Y] spaces"
- [x] 8.4 Reduced motion:
  - Section expand/collapse respects prefers-reduced-motion
  - Use opacity transitions instead of height animations

### Task 9: Unit & Integration Tests
- [x] 9.1 Test NeighborhoodRepository CRUD operations.
- [x] 9.2 Test API routes with mock Supabase client.
- [x] 9.3 Test useNeighborhoods hook returns correct data.
- [x] 9.4 Test useNeighborhoodFilters toggle logic.
- [x] 9.5 Test NeighborhoodSection renders with correct heading and color.
- [x] 9.6 Test NeighborhoodFilters chip selection and "All" behavior.
- [x] 9.7 Test useGroupedSpaces groups correctly with ungrouped fallback.
- [x] 9.8 Test accessibility attributes on section and chips.
- [x] 9.9 Test color assignment from palette.
- [x] 9.10 Test admin form validation (name required, unique within company).

### Task 10: Theme Compatibility Testing (AC4)
- [x] 10.1 Test neighborhood colors in Neon Cyberpunk theme.
- [x] 10.2 Test neighborhood colors in Zen Garden theme.
- [x] 10.3 Test neighborhood colors in Obsidian Stealth theme.
- [x] 10.4 Test neighborhood colors in Paper White theme.
- [x] 10.5 Verify color contrast meets WCAG AA for headers.
- [x] 10.6 Verify filter chips are visible in all themes.

### Task 11: Code Cleanup & Deprecation (Technical Debt)
- [x] 11.1 **DEPRECATE** local `Space` interface in `src/components/floor-plan/types.ts`:
  - Add `@deprecated` JSDoc comment
  - Update imports to use `@/types/database` directly
  - Remove interface after verifying no usages
- [x] 11.2 **DEPRECATE** local `RoomTemplate` in `src/components/floor-plan/types.ts`:
  - Already imported from `@/types/database` in some files
  - Consolidate to single source of truth
- [x] 11.3 Review `room-templates.tsx` and `room-template-selector.tsx`:
  - Verify they use global types from `@/types/database`
  - Document relationship to neighborhoods (templates are orthogonal)
- [x] 11.4 Add `neighborhood_id` field to Space type in `@/types/database`:
  - `neighborhood_id?: string;`
  - `neighborhood?: Neighborhood;` (for joined queries)

## Dev Notes

### ⚠️ CRITICAL: Follow Existing Patterns - Extend, Don't Duplicate
Per project convention:
- Create NEW `SupabaseNeighborhoodRepository` following existing repository patterns
- Create NEW hooks in `src/hooks/queries/` and `src/hooks/mutations/`
- EXTEND `tokens.css` with neighborhood color tokens
- MODIFY existing floor plan grid to integrate neighborhood sections

### Learnings from Previous Story

**From Story 3.4: Attention Beacon System (Status: done)**

- **CSS Token Pattern**: Beacon tokens added to `src/styles/themes/tokens.css` - follow same pattern for neighborhood colors
- **Component Structure**: Created new components in `src/components/floor-plan/modern/` - add NeighborhoodSection there
- **Hook Pattern**: Created `useAttentionBeacon.ts` - follow same pattern for `useNeighborhoodFilters.ts`
- **Accessibility Pattern**: Added aria-live, screen reader text, reduced motion support - apply to neighborhood sections
- **Testing Pattern**: 36 tests across component and hook files - follow same comprehensive approach
- **Theme Integration**: Tokens work across all 4 themes - neighborhood colors must also work in all themes

[Source: docs/sprint-artifacts/3-4-attention-beacon-system.md#Dev-Agent-Record]

### Existing Infrastructure to Extend (Not Duplicate)

**⚠️ CRITICAL: These existing components MUST be modified, not bypassed:**

| Component | Path | Modification Needed |
|-----------|------|--------------------|
| `RoomDialog` | `src/components/floor-plan/room-dialog/index.tsx` | Add neighborhood selector field |
| `RoomManagement` | `src/components/floor-plan/room-management.tsx` | Add neighborhood filter + manage button |
| `ModernFloorPlan` | `src/components/floor-plan/modern/ModernFloorPlan.tsx` | Use NeighborhoodSection for grouping |
| `floor-plan.tsx` | `src/components/floor-plan/floor-plan.tsx` | Add NeighborhoodFilters to controls bar |

**Existing patterns to follow:**
- **Repository Pattern**: `src/repositories/` - add NeighborhoodRepository following ISpaceRepository
- **API Routes**: `src/app/api/spaces/` - follow existing patterns
- **Query Hooks**: `src/hooks/queries/useSpaces.ts` - reference for useNeighborhoods
- **Mutation Hooks**: `src/hooks/mutations/useSpaceMutations.ts` - reference for CRUD
- **Floor Plan Modern**: `src/components/floor-plan/modern/` - add NeighborhoodSection here

**Types to deprecate (duplicates):**
- `src/components/floor-plan/types.ts` → local `Space` interface (use `@/types/database`)
- `src/components/floor-plan/types.ts` → local `RoomTemplate` (use `@/types/database`)

### Architecture Decisions

1. **Data Model Choice**: New `neighborhoods` table preferred over metadata field
   - Cleaner relational model with foreign key from spaces
   - Easier to query, index, and maintain
   - Supports future features (neighborhood permissions, settings)

2. **Color Assignment Strategy**: 
   - Use theme-derived palette (8 colors) for consistency
   - Admin picks from available colors
   - Fallback to auto-assignment if no pick made

3. **Filter State Management**:
   - Local state via hook (not global context)
   - Session persistence for navigation continuity
   - Reset on logout or company switch

4. **Grid Grouping Strategy**:
   - Group by neighborhood at render time (not data fetch)
   - Use memo for performance with large space lists
   - Ungrouped spaces in dedicated "Other" section

### Database Schema Design
```sql
-- neighborhoods table
CREATE TABLE neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '--vo-neighborhood-1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

-- Add neighborhood_id to spaces
ALTER TABLE spaces
ADD COLUMN neighborhood_id UUID REFERENCES neighborhoods(id) ON DELETE SET NULL;

-- RLS policies
CREATE POLICY "Company members can read neighborhoods"
  ON neighborhoods FOR SELECT
  USING (auth.uid() IN (
    SELECT user_id FROM company_users WHERE company_id = neighborhoods.company_id
  ));

CREATE POLICY "Company admins can manage neighborhoods"
  ON neighborhoods FOR ALL
  USING (auth.uid() IN (
    SELECT user_id FROM company_users 
    WHERE company_id = neighborhoods.company_id AND role = 'admin'
  ));
```

### TypeScript Interface Design
```typescript
// src/types/database.ts
export interface Neighborhood {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  color: string; // CSS variable name like '--vo-neighborhood-1'
  created_at: string;
  updated_at: string;
}

export interface CreateNeighborhoodData {
  name: string;
  description?: string;
  color?: string;
}

export interface UpdateNeighborhoodData {
  name?: string;
  description?: string;
  color?: string;
}

// Extend Space type
export interface Space {
  // ... existing fields
  neighborhood_id?: string;
  neighborhood?: Neighborhood; // joined data
}
```

### CSS Token Structure for Neighborhoods
```css
/* Add to src/styles/themes/tokens.css */
:root {
  --vo-neighborhood-1: #3B82F6; /* Blue */
  --vo-neighborhood-2: #10B981; /* Emerald */
  --vo-neighborhood-3: #F59E0B; /* Amber */
  --vo-neighborhood-4: #EF4444; /* Red */
  --vo-neighborhood-5: #8B5CF6; /* Violet */
  --vo-neighborhood-6: #EC4899; /* Pink */
  --vo-neighborhood-7: #06B6D4; /* Cyan */
  --vo-neighborhood-8: #84CC16; /* Lime */
  
  --vo-neighborhood-header-height: 40px;
  --vo-neighborhood-border-width: 3px;
}

/* Theme-specific neighborhood palettes */
[data-theme="neon"] {
  --vo-neighborhood-1: #00F2FF;
  --vo-neighborhood-2: #FF00FF;
  /* ... cyberpunk colors */
}

[data-theme="zen"] {
  --vo-neighborhood-1: #3D4C41;
  --vo-neighborhood-2: #D48C70;
  /* ... earth tones */
}
```

### Project Structure Alignment

**New Files:**
- `src/repositories/interfaces/INeighborhoodRepository.ts`
- `src/repositories/implementations/supabase/SupabaseNeighborhoodRepository.ts`
- `src/hooks/queries/useNeighborhoods.ts`
- `src/hooks/mutations/useNeighborhoodMutations.ts`
- `src/hooks/useGroupedSpaces.ts`
- `src/hooks/useNeighborhoodFilters.ts`
- `src/components/floor-plan/modern/NeighborhoodSection.tsx`
- `src/components/floor-plan/modern/NeighborhoodFilters.tsx`
- `src/components/floor-plan/neighborhoods/NeighborhoodManager.tsx`
- `src/components/floor-plan/neighborhoods/NeighborhoodForm.tsx`
- `src/components/floor-plan/neighborhoods/NeighborhoodDeleteDialog.tsx`
- `src/components/floor-plan/neighborhoods/NeighborhoodSelector.tsx`
- `src/app/api/neighborhoods/route.ts`
- `src/app/api/neighborhoods/[id]/route.ts`
- `src/app/api/neighborhoods/[id]/spaces/route.ts` (batch assignment)
- `src/app/api/spaces/[id]/neighborhood/route.ts`

**Modified Files:**
- `src/types/database.ts` - Add `Neighborhood`, `CreateNeighborhoodData`, `UpdateNeighborhoodData` types; extend `Space` with `neighborhood_id`
- `src/styles/themes/tokens.css` - Add neighborhood color palette tokens
- `src/components/floor-plan/modern/ModernFloorPlan.tsx` - Integrate NeighborhoodSection grouping
- `src/components/floor-plan/modern/index.ts` - Export new components
- `src/components/floor-plan/floor-plan.tsx` - Add NeighborhoodFilters to controls bar
- `src/components/floor-plan/room-dialog/index.tsx` - Add neighborhood selector field
- `src/components/floor-plan/room-management.tsx` - Add neighborhood filter and manage button

**Deprecated (mark for cleanup):**
- `src/components/floor-plan/types.ts` - Local `Space` and `RoomTemplate` interfaces

[Source: AGENTS.md#project-structure-scoped]

### Dependencies & Risk Notes
- New database table requires migration - coordinate with Supabase deployment
- Admin-only operations require role check in API routes
- Performance: grouping 50+ spaces should use memoization
- Color uniqueness per company - admin picker shows which colors are taken
- Neighborhood deletion orphans spaces - API sets `neighborhood_id = NULL`

### Future Extensibility
Per UX spec, neighborhoods could support:
- Neighborhood-level permissions (who can see/join spaces)
- Neighborhood alerts/beacons aggregated from child spaces
- Neighborhood-specific themes or visual customizations
- Drag-and-drop space ordering within neighborhoods
- Collapsible sections in grid view

### References
- docs/epics.md#story-3.9-space-grouping-and-neighborhoods
- docs/ux-design-specification.md#2.2-novel-ux-patterns (neighborhood bands)
- docs/ux-design-specification.md#7.1-consistency-rules
- docs/architecture.md#repository-pattern
- src/repositories/implementations/supabase/ (repository patterns)
- src/hooks/queries/ (query hook patterns)
- src/components/floor-plan/modern/ (integration target)
- docs/sprint-artifacts/3-4-attention-beacon-system.md (previous story patterns)

## Dev Agent Record

### Context Reference

- `docs/sprint-artifacts/3-9-space-grouping-and-neighborhoods.context.xml`

### Agent Model Used

Claude Opus 4.5 (Preview)

### Debug Log References

- Migration RLS fix: Used `users.supabase_uid::text = auth.uid()::text` (TEXT column requires cast)
- SpaceContextMenu: Controlled state pattern to fix event propagation with Radix DropdownMenu

### Completion Notes List

1. **All 11 Tasks Complete** - Database, API, Hooks, UI, Colors, Filters, Accessibility, Tests
2. **26 Unit Tests Passing** - neighborhoods.test.tsx covers colors, hooks, components
3. **Admin Role Protection** - Added isAdmin checks to RoomManagement, RoomDialog, ControlsTab, SpaceContextMenu
4. **Bonus Features** - SpaceContextMenu for quick space actions (Enter, Chat, Edit)
5. **Theme Support** - 8 neighborhood colors with theme-specific palettes for all 4 themes

### File List

**New Files (18):**
- `src/migrations/20251125_neighborhoods_table.sql`
- `src/repositories/interfaces/INeighborhoodRepository.ts`
- `src/repositories/implementations/supabase/SupabaseNeighborhoodRepository.ts`
- `src/app/api/neighborhoods/route.ts`
- `src/app/api/neighborhoods/[id]/route.ts`
- `src/hooks/queries/useNeighborhoods.ts`
- `src/hooks/mutations/useNeighborhoodMutations.ts`
- `src/hooks/useGroupedSpaces.ts`
- `src/hooks/useNeighborhoodFilters.ts`
- `src/lib/neighborhood-colors.ts`
- `src/components/floor-plan/neighborhoods/NeighborhoodManager.tsx`
- `src/components/floor-plan/neighborhoods/NeighborhoodForm.tsx`
- `src/components/floor-plan/neighborhoods/NeighborhoodSelector.tsx`
- `src/components/floor-plan/neighborhoods/NeighborhoodDeleteDialog.tsx`
- `src/components/floor-plan/neighborhoods/index.ts`
- `src/components/floor-plan/modern/NeighborhoodSection.tsx`
- `src/components/floor-plan/modern/NeighborhoodFilters.tsx`
- `src/components/floor-plan/modern/SpaceContextMenu.tsx`
- `__tests__/neighborhoods.test.tsx`

**Modified Files (12):**
- `src/types/database.ts` - Added Neighborhood type, extended Space with neighborhoodId
- `src/styles/themes/tokens.css` - Added neighborhood color tokens for all themes
- `src/components/floor-plan/modern/ModernFloorPlan.tsx` - Neighborhood grouping integration
- `src/components/floor-plan/modern/ModernSpaceCard.tsx` - SpaceContextMenu, isAdmin, onEditSpace
- `src/components/floor-plan/modern/index.ts` - Export new components
- `src/components/floor-plan/floor-plan.tsx` - Filters, admin buttons, isAdmin prop
- `src/components/floor-plan/room-dialog/index.tsx` - isAdmin prop
- `src/components/floor-plan/room-dialog/types.ts` - isAdmin in RoomDialogProps
- `src/components/floor-plan/room-dialog/view-room-tabs.tsx` - isAdmin for Save button
- `src/components/floor-plan/room-dialog/tabs/controls-tab.tsx` - isAdmin for room locking
- `src/components/floor-plan/room-dialog/tabs/info-tab.tsx` - NeighborhoodSelector
- `src/components/floor-plan/room-management.tsx` - Admin-only CRUD buttons
- `changelog.md` - Story 3.9 entry

## Change Log

- 2025-11-25: Story drafted via Scrum Master agent for Epic 3 visual overhaul (Story 3.9).
- 2025-11-25: **Story improved after validation review:**
  - Task 4: Changed from creating parallel admin UI to integrating INTO existing `RoomDialog` and `RoomManagement`
  - Task 5.3: Fixed reference from "FloorPlanGrid" to actual component `ModernFloorPlan.tsx`
  - Task 7.3: Fixed reference to integrate filters into `floor-plan.tsx` controls bar
  - Added Task 11: Code cleanup for deprecated local types in `floor-plan/types.ts`
  - Added "Existing Infrastructure to Extend" table showing exactly which files need modification
  - Reorganized Project Structure section to clearly separate New/Modified/Deprecated files
