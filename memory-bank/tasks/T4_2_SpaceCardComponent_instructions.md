# T4_2_SpaceCardComponent Instructions

## Objective
Implement a modern, visually appealing space card component to represent individual spaces in the floor plan.

## Context
[Implementation Plan: IP4_ModernFloorPlanUI]
Based on the design system developed in T4_1_SpaceDesignSystem, this task focuses on implementing the actual React component for representing spaces. The space card is the fundamental building block of the floor plan UI and needs to be visually pleasing while effectively communicating space information and status.

## Dependencies
- T4_1_SpaceDesignSystem (Design guidelines and tokens)
- src/components/ui/avatar-with-fallback.tsx (For user avatars)
- src/components/ui (Shadcn/UI components)
- src/types/database.ts (Space and User types)
- src/lib/utils.ts (For class merging utilities)

## Steps
1. Create a new SpaceCard component:
   - Create file at `src/components/floor-plan/space-card.tsx`
   - Define component props interface
   - Implement basic component structure

2. Implement visual styling based on design system:
   - Apply color schemes for different space types
   - Implement hover and focus states
   - Add proper borders, shadows, and visual hierarchy

3. Add space information display:
   - Space name and type with appropriate typography
   - Status indicator
   - Capacity visualization
   - Description/purpose (if available)

4. Implement user presence visualization:
   - Avatar display for users in the space
   - Handling for multiple users (stacking, overflow)
   - Status indicators for users
   - "Empty space" visualization

5. Add interaction handlers:
   - Click to enter space
   - Click again to view details
   - Hover effects and feedback
   - Loading/transitioning states

6. Optimize for accessibility and performance:
   - Ensure proper contrast ratios
   - Add appropriate aria attributes
   - Optimize renders using React.memo
   - Add keyboard navigation support

7. Create variations for different space types:
   - Custom styling for each space type
   - Appropriate visual indicators
   - Different layouts if needed

8. Add animations and transitions:
   - Smooth state transitions
   - Entry/exit animations
   - Hover effects
   - Loading states

## Expected Output
- A reusable `SpaceCard` component that:
  - Displays space information clearly and elegantly
  - Shows users present in the space
  - Provides visual feedback for interactions
  - Adapts its appearance based on space type and state
  - Follows accessibility best practices
  - Is visually consistent with the design system
