# Active Context
```guidance
**Date:** 4/6/2025
**Last Updated:** 4/6/2025, 12:21 PM (UTC-3:00)

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
- **Focus Area:** Implementing DOM Floor Plan (IP2) - Phase 2: Frontend Presence
- **Current Tasks:** T13_Hook_UserPresence - Real-time presence hook (✅ Completed)

## Next Steps:
1. Begin T14_PresenceContext: Create context/provider using the presence hook
2. Integrate PresenceContext into floor plan components
3. Develop UserAvatarPresence and SpaceElement components

## Active Decisions and Considerations:
- **Repository Pattern:** All data access via repositories and API routes
- **Supabase Realtime:** Used for live updates, combined with React Query cache
- **State Management:** React Query for server state, Zustand planned for UI state
- **Floor Plan:** DOM-based, replacing Konva
- **Presence Data:** Grouped by space for efficient rendering
- **Messaging Integration:** To be connected after presence components

## Recent Changes Summary
- **Apr 6:** Completed T13_Hook_UserPresence with grouping by space, repository-backed
- **Apr 5:** Added current_space_id to users table, updated repositories
- **Apr 5:** Created API endpoints for user location and listing

## Latest Action (2025-04-06)
- Completed T13_Hook_UserPresence: repository-backed, real-time presence hook with grouping by space

## Status
- Presence hook complete and tested
- Ready to proceed with PresenceContext implementation (T14)
