# T6_3_AvatarGroupLayoutFix Instructions

## Objective
Resolve the spacing and overlap issues in the AvatarGroup component to ensure avatars are displayed with proper layering and consistent spacing across all browsers and screen sizes.

## Context
[Implementation Plan: IP6_AvatarSystemFixes]

The current AvatarGroup component has issues with avatars completely overlapping each other instead of showing a proper cascading arrangement. Despite recent attempts to fix this with CSS classes, the problem persists. The component needs a more robust approach using explicit inline styles and proper z-index management to ensure consistent display across different environments.

## Dependencies
- AvatarGroup component (`src/components/floor-plan/modern/AvatarGroup.tsx`)
- ModernUserAvatar component (`src/components/floor-plan/modern/ModernUserAvatar.tsx`)
- Design tokens (`src/components/floor-plan/modern/designTokens.ts`)
- Utility functions (`src/lib/utils.ts`)

## Steps
1. **Analyze Current Layout Implementation:**
   - Review existing AvatarGroup and ModernUserAvatar components
   - Identify styling conflicts or browser-specific issues
   - Test current implementation across different browsers
   - Document specific failures in layout rendering

2. **Revise AvatarGroup Component Structure:**
   - Update component to use a more robust layout approach
   - Modify how child avatar components are rendered and positioned
   - Implement proper container elements with positional context
   - Ensure accessibility attributes are maintained

3. **Implement Reliable Avatar Positioning:**
   - Replace class-based positioning with explicit inline styles
   - Use fixed pixel values for consistent spacing (e.g., `style={{ marginLeft: '-12px' }}`)
   - Position avatars absolutely within a relative container if needed
   - Ensure responsive behavior is maintained

4. **Add Z-Index Management:**
   - Implement progressive z-index values for proper layering
   - Ensure earlier avatars appear in front of later ones
   - Use sufficiently separated z-index values to prevent conflicts
   - Test with varying numbers of avatars

5. **Enhance Avatar Ring Styling:**
   - Improve visual separation between overlapping avatars
   - Add appropriate border/ring styles to create visual distinction
   - Ensure rings are consistent in size and color
   - Handle dark/light mode differences appropriately

6. **Add Browser-Specific Adjustments:**
   - Identify and fix any browser-specific rendering issues
   - Add conditional styles or polyfills if necessary
   - Test thoroughly in Chrome, Firefox, Safari, and Edge
   - Ensure mobile browser compatibility

7. **Create Comprehensive Test Cases:**
   - Test with varying numbers of avatars (1, 2, 3, 5, 10+)
   - Test with the "more" indicator showing
   - Test with different avatar sizes
   - Verify proper scaling on different screen sizes and zoom levels
   - Test with both avatar images and fallback initials

## Expected Output
- AvatarGroup component displays avatars with proper cascading overlap
- Each avatar is partially visible with consistent spacing
- Z-index layering ensures proper stacking order
- Component works consistently across all major browsers
- Responsive behavior is maintained at different screen sizes
- Layout is visually appealing and matches design specifications
- No console errors or layout warnings
