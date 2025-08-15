# T4_1_SpaceDesignSystem Instructions

## Objective
<<<<<<< HEAD
Define and implement a cohesive design system for the virtual office floor plan spaces, establishing visual standards (colors, typography, spacing) and creating the foundational modern UI components (Space representation, User Avatar, Status Indicators) based on a cozy and elegant aesthetic.

## Context
[Implementation Plan: IP4_ModernFloorPlanUI]
The current floor plan UI lacks a consistent and modern visual language. This task focuses on creating a unified design system and implementing the core building blocks for the modernized floor plan, replacing older implementations with a DOM-first approach using Tailwind CSS and Shadcn/UI.

**IMPORTANT**: it's tailwind 4 Consult `tailwind-upgrade-guide.md` for more info

## Dependencies
- React
- Tailwind CSS / `tailwind.config.js` 
- Shadcn/UI library (`@/components/ui/*`)
- Existing floor plan components (`src/components/floor-plan/SpaceElement.tsx`, `src/components/floor-plan/UserAvatarPresence.tsx` for reference/replacement)
- Presence context/hook (`@/hooks/useUserPresence`) for user status data
- Type definitions (`@/types/database`, `@/types/ui`)
- `src/lib/utils.ts`

## Steps
1.  ✅ **Analyze & Define Visual Style:**
    - Review current space representations, identify inconsistencies, and document states/interactions needing visual representation.
    - Establish/refine core visual guidelines (color palette, typography, spacing, border-radius, shadows) for spaces and related components, aligning with the "cozy and elegant" aesthetic. Define hover, active, and selected states.
2.  ✅ **Design & Implement Space Component:**
    - Design the primary component for displaying a space (e.g., as a card) using the defined visual style. Ensure clear visual hierarchy and areas for name, occupancy, and status.
    - Implement this component using React/Tailwind/Shadcn (DOM-based), potentially refactoring/replacing parts of `SpaceElement.tsx`.
3.  ✅ **Design & Implement Avatar Component:**
    - Design the component for displaying user avatars within the floor plan context, using the defined visual style.
    - Implement this component using React/Tailwind/Shadcn, clearly showing user presence status (online, away, etc.), potentially refactoring/replacing `UserAvatarPresence.tsx`.
4.  ✅ **Design & Implement Status Indicators:**
    - Design visual indicators for space status (available, occupied, locked, etc.), occupancy levels (empty, partially filled, full), and space types.
    - Create/implement these indicators (e.g., badges, icons, color cues) and integrate them into the new Space component.
5.  ✅ **Document Design Tokens & Guidelines:**
    - Create/update design tokens (e.g., in `tailwind.config.js` or a separate file) for colors, sizes, etc.
    - Briefly document component variations and usage guidelines.
6.  **Verify Implementation:**
    - Ensure the new components do not rely on the Konva library.
    - Test different visual states and interactions.
    - Validate accessibility of color choices and contrast.
7.  **(Optional) Storybook/Testing:** Add basic Storybook stories for the new components or simple unit tests if feasible.

## Expected Output
- Defined design tokens (colors, spacing, etc.).
- Documentation/guidelines for space visual states and component usage.
- Reusable React components for modern space representation, user avatars within the floor plan, and status indicators, styled with Tailwind/Shadcn.
- Components verified to be DOM-based (no Konva) and ready for integration.
=======
Create a cohesive design system for spaces in the floor plan, establishing visual standards for different space types, states, and interactions.

## Context
[Implementation Plan: IP4_ModernFloorPlanUI]
The current floor plan UI lacks a consistent and modern visual language. This task focuses on creating a unified design system that will serve as the foundation for all space-related UI components, ensuring visual consistency and a cozy, elegant aesthetic throughout the application.

## Dependencies
- src/components/ui (Shadcn/UI components)
- src/lib/utils.ts (Utility functions)
- src/types/database.ts (Space and related type definitions)
- tailwind.config.js (For customizing theme)

## Steps
1. Analyze current space visuals and identify improvement opportunities:
   - Review current space representations
   - Identify inconsistencies and visual weaknesses
   - Document space states and interactions that need visual representation

2. Create color palette and visual hierarchy for spaces:
   - Define enhanced color scheme for different space types (workspace, conference, social, etc.)
   - Create hover, active, and selected states
   - Design occupancy indicators with varying levels

3. Design space card component system:
   - Create base card design with consistent padding, borders, and shadows
   - Design header, content, and footer areas
   - Define typography styles for space names, types, and descriptions

4. Create visual indicators:
   - Design status indicators (available, occupied, locked, etc.)
   - Create capacity visualization (empty, partially filled, full)
   - Design space type icons or visual elements

5. Document design tokens and usage guidelines:
   - Create a design tokens file for colors, sizes, shadows, etc.
   - Document component variations and when to use them
   - Create examples for different space types and states

6. Create prototype implementations using Tailwind classes:
   - Implement example space cards with Tailwind classes
   - Test different visual states and interactions
   - Validate accessibility of color choices and contrast

## Expected Output
- Design tokens file with colors, spacing, and typography definitions
- Documentation of space visual states and interactions
- Prototype implementations with Tailwind classes
- Design guidelines for space-related components
- Consistent visual system for all space types and states
>>>>>>> 38f8e365dfb5dfbe3884efa9094a8119a5703726
