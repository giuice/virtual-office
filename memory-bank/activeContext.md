# Active Context
```guidance
**Date:** 4/6/2025
**Last Updated:** 4/6/2025, 2:52 PM (UTC-3:00)

**Purpose:** This file provides a concise overview of the current work focus, immediate next steps, and active decisions for the project.

**Use Guidelines:**
- **Current Work Focus:** List the 2-3 *most critical* tasks currently being actively worked on.
- **Next Steps:** List the immediate next steps required to advance the project.
- **Active Decisions and Considerations:** Document key decisions currently being considered.
- **Do NOT include:** Detailed task breakdowns, historical changes, long-term plans.
- **Maintain Brevity:** Keep this file concise and focused on the *current* state.
```

## Current Work Focus:
- **Phase:** Execution
- **Focus Area:** DOM Floor Plan (IP2) - Frontend Presence
- **Current Tasks:** T17_Component_UserAvatarPresence (✅ Completed), preparing T18_Integration_SpaceChat

## Next Steps:
1. Integrate space clicks with chat system (T18)
2. Clean up Konva remnants (T20)

## Active Decisions and Considerations:
- **Repository Pattern:** All data access via repositories and API routes
- **Supabase Realtime:** Used for live updates, combined with React Query cache
- **State Management:** React Query for server state, Zustand planned for UI state
- **Floor Plan:** DOM-based, replacing Konva (done)
- **Presence Data:** Grouped by space for efficient rendering (done)
- **Messaging Integration:** To be connected after presence components

## Recent Changes Summary
- **Apr 8:** Completed T17_Component_UserAvatarPresence - avatar with status indicator
- **Apr 8:** Completed T16_Component_SpaceElement
- **Apr 6:** Completed T15_Component_DomFloorPlan
- **Apr 6:** Completed T14_PresenceContext
- **Apr 6:** Completed T13_Hook_UserPresence

## Latest Action (2025-04-08)
- Completed T17_Component_UserAvatarPresence

## Status
- UserAvatarPresence component created and integrated
- Ready to proceed with chat integration
