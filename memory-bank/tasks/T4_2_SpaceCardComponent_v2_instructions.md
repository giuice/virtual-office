# T4_2_SpaceCardComponent_v2 Instructions

## Objective
Implement the SpaceCard component with Tailwind v4 styling and Shadcn primitives, showing name, type, status, occupancy, and avatars with overflow handling.

## Context
[Implementation Plan: IP4_ModernFloorPlanUI_v2]
SpaceCard is the central unit. It must be responsive, accessible, and performant under presence updates.

## Dependencies
- T4_1_SpaceDesignSystem_v2 (tokens/guidelines)
- Shadcn/UI components
- AvatarWithFallback
- Presence data hooks

## Steps
1. Create `src/components/floor-plan/modern/SpaceCard.tsx` with props for space info and presence list.
2. Render header (name/type), status badge, occupancy visualization, avatar group with overflow.
3. Add interaction handlers: onClick enter, onDetails for more.
4. Apply animations for hover/focus and selection using CSS transitions.
5. Memoize and split subcomponents where needed; ensure keyboard navigation and ARIA.

## Expected Output
- Reusable SpaceCard following v4 tokens with complete states.
- Efficient rendering with memoization; accessible and testable.
