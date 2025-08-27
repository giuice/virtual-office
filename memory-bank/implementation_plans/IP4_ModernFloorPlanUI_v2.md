# IP4_ModernFloorPlanUI_v2

## Overview
Rebuild the Modern Floor Plan UI with a DOM-first approach that is elegant, cozy, and performant. This replaces fragile or regressed work and ensures full alignment with Tailwind CSS v4 and Shadcn/UI components. We will eliminate remaining Konva usage, create a robust component system, and integrate with presence data efficiently.

## Goals
- Deliver a polished, cozy visual design that improves readability and delight.
- Make the floor plan fully DOM-based with responsive layouts and smooth motion.
- Remove any Konva dependencies and dead code paths.
- Integrate user presence and occupancy gracefully with accessible indicators.
- Optimize for Tailwind v4 utilities and tokens; respect reduced-motion.
- Maintain performance under frequent presence updates.

## Constraints & References
- Tailwind v4: follow `tailwind-upgrade-guide.md` and use the new utilities and config.
- Shadcn/UI components for primitives where helpful.
- No Konva. Prefer CSS transforms, transitions, and container queries.
- Accessibility AA contrast, keyboard navigation, and reduced-motion support.

## Technical Approach
1. Design tokens and theming using Tailwind v4 (colors, radius, shadows, spacing).
2. Core UI components:
   - SpaceCard (status, occupancy, type, actions)
   - Avatar/AvatarGroup with presence states
   - Status badges/indicators
   - Floor container and sections (zones)
3. Layout engine: simple, predictable grid/flex with optional zones; no canvas.
4. Motion system: CSS transitions (opacity/transform), staggered entries; honor reduced motion.
5. Data integration: use existing presence hooks/contexts with memoization and keys.
6. Testing: unit for utils/components, visual checks, a11y validations.

## Deliverables
- New/revised components in `src/components/floor-plan/modern/`
- Updated Tailwind tokens if needed
- Revised DOM floor plan `ModernFloorPlan` container
- Documentation for usage and states
- Tests where applicable

## Related Tasks
- T4_1_SpaceDesignSystem_v2 - Define tokens and base styles for Tailwind v4
- T4_2_SpaceCardComponent_v2 - Implement the core card with states
- T4_3_FloorPlanLayout_v2 - Build container + zones + arrangement
- T4_4_AnimationsTransitions_v2 - Add motion system and preferences
- T4_5_ResponsiveAdaptation_v2 - Ensure breakpoints and mobile ergonomics
- T4_6_KonvaCleanup - Remove deprecated Konva remnants and code paths

## Sequencing
1) T4_1 → 2) T4_2 → 3) T4_3 → 4) T4_4 → 5) T4_5; T4_6 can run in parallel after T4_1

## Acceptance Criteria
- No Konva imports anywhere in floor plan UI path.
- SpaceCard shows: name, type, status, capacity/occupancy, avatars, and interactions.
- Layout adapts from mobile to desktop with clear grouping and spacing.
- Animations are subtle, performant, and respect reduced-motion.
- a11y: Focus visible, keyboard navigation, ARIA for status, contrast AA.
- Measured render stability under presence churn (no jank in dev tools).

## Verification Steps
- Static checks: search for Konva usage.
- Visual QA across breakpoints; test hover/focus/selection.
- Lighthouse a11y checks; test prefers-reduced-motion.
- Run component tests; verify presence updates don’t spike renders.

## Risks & Mitigations
- Performance under presence churn → use memo, keys, virtualization if needed.
- Tailwind v4 migration drift → follow guide; add tokens centrally.
- Regression from existing components → keep APIs stable; adapter wrappers.
- Accessibility gaps → early audits and keyboard testing.

## Timeline
- Planning: 0.5 day
- Implementation: 3-4 days
- Testing/Polish: 1 day
