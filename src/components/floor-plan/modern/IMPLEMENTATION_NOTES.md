# Modern Floor Plan UI Implementation

## Overview
This directory contains new modern UI components for the floor plan system, following an elegant and cozy design aesthetic. The implementation uses Tailwind 4 for styling and follows a component-based approach with DOM elements (no Konva dependency).

## Components

### `designTokens.ts`
- Contains design system tokens for the floor plan UI
- Defines consistent styling for spaces, avatars, and status indicators
- Includes helper functions to map types and statuses to visual styles

### `ModernUserAvatar.tsx`
- Enhanced user avatar component with status indicator
- Supports various sizes and tooltip placements
- Designed to work as standalone or in avatar groups

### `AvatarGroup.tsx`
- Groups user avatars with configurable overlap effect
- Handles empty states and "more users" indicators
- Responsive sizing and tooltip support

### `StatusIndicators.tsx`
- Contains multiple indicator components:
  - `SpaceStatusBadge`: Shows space availability status
  - `SpaceTypeIndicator`: Shows space type with appropriate icon
  - `CapacityIndicator`: Shows occupancy level with color-coded indicators

### `ModernSpaceCard.tsx`
- Main space representation component
- Supports compact and full modes
- Visual feedback for hover, highlighted, and occupied states
- Integrated status indicators and user avatars

### `ModernFloorPlan.tsx`
- Container component for the entire floor plan
- Supports different layout options (default, compact, spaced)
- Handles space interactions and user presence
- Error handling and loading states

## Integration

To replace the current floor plan implementation with this modern version:

1. Import from the modern package:
   ```tsx
   import { ModernFloorPlan } from '@/components/floor-plan/modern';
   ```

2. Replace current `DomFloorPlan` usage with `ModernFloorPlan`:
   ```tsx
   <ModernFloorPlan
     spaces={spaces}
     onSpaceSelect={handleSpaceSelect}
     onOpenChat={handleOpenChat}
     highlightedSpaceId={selectedSpaceId}
     layout="default"
     compactCards={false}
   />
   ```

3. For individual space cards, use `ModernSpaceCard` instead of `SpaceElement`.

## Design Tokens

The design system uses a set of carefully selected styles for a cozy, elegant aesthetic:

- **Spaces:** Color-coded by type with subtle background colors
- **Status:** Clear visual indicators for available, occupied, and locked spaces
- **Shadows:** Light shadows with hover effects for depth
- **Typography:** Clean hierarchical text styling
- **Animation:** Subtle hover effects and transitions

## Testing

The components have been designed for compatibility with the existing data model and hooks. To test:

1. Replace the existing floor plan component in a view
2. Verify all interactions work correctly
3. Check responsive behavior across different screen sizes
4. Ensure accessibility standards are maintained

## Next Steps

- Add full integration with live pages
- Create test cases for the new components
- Consider enhancements for space filtering
- Add animation transitions between states

## Dependencies

- Tailwind 4 (as per tailwind-upgrade-guide.md)
- Shadcn/UI components
- Lucide-react for icons
