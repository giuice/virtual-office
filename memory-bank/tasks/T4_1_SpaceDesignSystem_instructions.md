# T4_1_SpaceDesignSystem Instructions

## Objective
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
