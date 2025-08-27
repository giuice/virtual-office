# T4_1_SpaceDesignSystem_v2 Instructions

## Objective
Define Tailwind v4 design tokens and base styles for the modern floor plan. Establish component guidelines for SpaceCard, Avatar/AvatarGroup, and Status indicators. Ensure accessibility and cozy, elegant aesthetics.

## Context
[Implementation Plan: IP4_ModernFloorPlanUI_v2]
Previous efforts regressed. This refresh aligns tokens and utilities with Tailwind v4 and clarifies component states and usage patterns, eliminating Konva assumptions.

## Dependencies
- Tailwind v4 config and `tailwind-upgrade-guide.md`
- Shadcn/UI primitives
- Presence hooks/contexts
- Existing modern components in `src/components/floor-plan/modern/` for reference

## Steps
1. ✅ Define tokens: colors, radius, shadows, spacing, typography scale in Tailwind v4.
2. Document state variants: hover, active, selected, disabled; status (available, busy, locked).
3. Create a tokens file if helpful (e.g., `designTokens.ts`) and ensure Tailwind config references where needed.
4. Specify component guidelines: content areas, densities, avatar sizes, overflow handling.
5. Accessibility: contrast AA, focus ring styles, keyboard focus order, ARIA for status.
6. ✅ Update docs under `docs/components/modern-ui-components-guide.md` with the finalized tokens and guidelines.

## Expected Output
- Updated tokens and documentation for Tailwind v4.
- Component usage guidelines covering core states and variants.
- No Konva references; DOM-first assumptions documented.

<RESULTS>
- Action completed: Tailwind v4 token refinement and documentation update.
- Outcome: Added interactive state tokens in `designTokens.ts`; expanded docs with tokens/states/a11y guidance.
- Observations: Existing globals.css and Tailwind v4 setup already solid; minimal changes needed.
- Issues encountered: None.
</RESULTS>

<DEP_MATRIX_START>
# KEY DEFINITIONS
K15: src/components/ui
K16: src/components/floor-plan/modern/designTokens.ts
K17: docs/components/modern-ui-components-guide.md

# MATRIX (Row depends on Column)
	| K15 | K16 | K17 |
K16|  -  |  -  |  d  |
K17|  d  |  >  |  -  |
<DEP_MATRIX_END>
