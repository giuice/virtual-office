# T4_3_FloorPlanLayout_v2 Instructions

## Objective
Implement the ModernFloorPlan container and layout with zones/groups, responsive arrangement, and optional mini-map.

## Context
[Implementation Plan: IP4_ModernFloorPlanUI_v2]
We will refactor the floor plan layout to be DOM-first with clear grouping and navigation aids.

## Dependencies
- T4_1 and T4_2 v2
- Presence context

## Steps
1. Create `src/components/floor-plan/modern/ModernFloorPlan.tsx` as the container.
2. Implement sections/zones with headers and grid/flex arrangements.
3. Add optional controls header (filters/sort) and breadcrumb.
4. Ensure smooth scrolling and keyboard navigation.
5. Integrate presence updates without jank; test with mocked churn.

## Expected Output
- A modern, responsive container organizing SpaceCards into intuitive zones.
