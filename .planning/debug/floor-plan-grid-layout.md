---
status: investigating
trigger: "Floor plan page has 3 regressions: neighbourhood separation removed, fluid grid not fixed, view modes broken"
created: 2026-03-18T00:00:00Z
updated: 2026-03-18T00:02:00Z
---

## Current Focus

hypothesis: All three reported regressions are NOT code regressions - the features are all implemented and wired up. Issues are either data-dependent or perception-based.
test: Full code trace of all three features
expecting: N/A - diagnosis complete
next_action: Report findings with caveats about data dependency

## Symptoms

expected: Floor plan shows spaces grouped by neighbourhood, uses fluid responsive grid (auto-fill), has working view modes (grid/list/map)
actual: Neighbourhood separation removed, grid not fluid/responsive, view modes broken
errors: No specific error messages - visual/layout regressions
reproduction: Visit /floor-plan page
started: Recent changes during stabilization phase

## Eliminated

- hypothesis: Neighbourhood components were deleted/removed
  evidence: NeighborhoodSection.tsx, UngroupedSection, NeighborhoodFilters.tsx, useNeighborhoodFilters.ts, useGroupedSpaces.ts all exist and are complete. ModernFloorPlan.tsx lines 474-534 has full grouping render logic.
  timestamp: 2026-03-18T00:01:00Z

- hypothesis: Grid uses fixed breakpoint columns instead of auto-fill
  evidence: perspectiveGridStyles in ModernFloorPlan.tsx lines 54-58 correctly uses auto-fill+minmax for all three perspectives (orbit=320px, analyst=240px, cinema=450px). Style is applied via inline gridTemplateColumns.
  timestamp: 2026-03-18T00:01:00Z

- hypothesis: View mode code was removed or broken
  evidence: floor-plan.tsx lines 373-403 has a complete perspective switcher with 3 modes (orbit/analyst/cinema), proper state, icons, and styling. perspective is passed to ModernFloorPlan which uses it for grid and card variants.
  timestamp: 2026-03-18T00:01:00Z

## Evidence

- timestamp: 2026-03-18T00:00:30Z
  checked: floor-plan.tsx line 461 - enableNeighborhoodGrouping prop
  found: enableNeighborhoodGrouping={neighborhoodFilters.activeFilters.size === 0}
  implication: Grouping enabled when showing all (no filters), disabled when filtering specific neighborhoods

- timestamp: 2026-03-18T00:00:30Z
  checked: ModernFloorPlan.tsx lines 474-534 - grouping render logic
  found: shouldGroup = enableNeighborhoodGrouping && neighborhoods.length > 0. If neighborhoods.length === 0, grouping silently falls through to flat rendering.
  implication: DATA DEPENDENCY - if no neighborhoods exist in DB, grouping will never appear

- timestamp: 2026-03-18T00:00:30Z
  checked: ModernFloorPlan.tsx lines 47-58 - grid CSS
  found: perspectiveGridStyles correctly implements auto-fill+minmax. Applied via style prop on grid div.
  implication: Grid IS fluid. If it appears non-fluid, the issue is elsewhere (container constraints).

- timestamp: 2026-03-18T00:00:30Z
  checked: floor-plan.tsx lines 373-403 - view switcher
  found: Orbit/Analyst/Cinema buttons with state management. All three work through perspective prop.
  implication: View modes are functional. The user may expect "grid/list/map" but implementation uses "orbit/analyst/cinema".

- timestamp: 2026-03-18T00:00:45Z
  checked: designTokens.ts lines 115-129 - legacy grid (fallback)
  found: Legacy grid classes use fixed breakpoints (grid-cols-1 through grid-cols-6) but only activate if perspective is undefined. Active code always passes perspective.
  implication: Legacy fallback is not the active path

- timestamp: 2026-03-18T00:01:00Z
  checked: floor-plan.tsx line 452-453, designTokens.ts line 126 - container
  found: ModernFloorPlan container has h-[calc(100vh-12rem)] and overflow-auto. Inner Card has p-4 and min-h-[600px].
  implication: Container constrains height but width is w-full, so auto-fill grid should reflow correctly

- timestamp: 2026-03-18T00:01:00Z
  checked: useNeighborhoods.ts - data fetching
  found: Fetches from /api/neighborhoods which requires auth user with company. Default data is empty array [].
  implication: If API returns empty or errors, neighborhoods=[] and grouping is disabled

- timestamp: 2026-03-18T00:01:30Z
  checked: Space type - neighborhoodId field
  found: Space.neighborhoodId is optional. If spaces exist but none have neighborhoodId set, all spaces fall into "ungrouped" bucket even when neighborhoods exist.
  implication: DATA DEPENDENCY - spaces must have neighborhoodId assigned for grouping to be visible

- timestamp: 2026-03-18T00:01:30Z
  checked: floor-plan.tsx line 63 - useModernUI
  found: const [useModernUI, setUseModernUI] = useState(false) - declared but never used. Dead code.
  implication: No impact on functionality, just dead code

## Resolution

root_cause: See ROOT CAUSE FOUND report - all three features are implemented but have data dependencies that could make them appear missing
fix:
verification:
files_changed: []
