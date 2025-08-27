# T4_6_KonvaCleanup Instructions

## Objective
Eliminate remaining Konva dependencies and dead code paths from the floor plan UI.

## Context
[Implementation Plan: IP4_ModernFloorPlanUI_v2]

## Dependencies
- Code search for `konva` imports/usages

## Steps
1. Search the repo for `konva` and `react-konva` imports.
2. Remove unused files and references; replace with DOM equivalents if any remain.
3. Update docs to state DOM-first approach; add deprecation notes.
4. Run tests and build to confirm no references remain.

## Expected Output
- Zero Konva usage in the codebase; clear documentation of replacement approach.
