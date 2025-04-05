# Active Context
```guidance
**Date:** 4/2/2025
**Last Updated:** 4/5/2025, 3:45 PM (UTC-3:00) // Updated timestamp

**Purpose:** This file provides a concise overview of the current work focus, immediate next steps, and active decisions for the project.

**Use Guidelines:**
- **Current Work Focus:** List the 2-3 *most critical* tasks currently being actively worked on.
- **Next Steps:** List the immediate next steps required to advance the project.
- **Active Decisions and Considerations:** Document key decisions currently being considered.
- **Do NOT include:** Detailed task breakdowns, historical changes, long-term plans.
- **Maintain Brevity:** Keep this file concise and focused on the *current* state.
```
## Current Work Focus:
- **Phase**: Strategy
- **Focus Area**: Planning DOM Floor Plan Implementation (IP2)
- **Current Tasks**: N/A (Strategy Phase)

## Next Steps:
1.  **Finalize Strategy:** Review and confirm Implementation Plan IP2 and associated tasks T11-T20. (Completed)
2.  **Update Memory Bank:** Update `activeContext.md` and `progress.md` with IP2 details. (In Progress)
3.  **Transition to Execution:** User to switch mode to ACT.
4.  **Begin Implementation:** Start executing tasks for IP2, beginning with T11_DB_AddUserLocation.

## Active Decisions and Considerations:
- **Testing Strategy:** Developed an alternative testing approach for Next.js App Router API routes due to challenges with direct unit testing. Focus on testing core logic separately from route handlers.
- **Messaging System Architecture:** Need to evaluate current messaging architecture and identify improvements for reliability and performance.
- **Real-time Updates for Messages:** Consider how to best implement real-time updates for messages using Supabase Realtime and React Query.
- **Firebase UID vs Database UUID:** Implemented a solution to handle the mismatch between Firebase UIDs and database UUIDs by detecting ID format and converting as needed.
- **Server State Management:** Adopted **React Query** for fetching, caching, and synchronizing server state, replacing the need for custom context providers (like the planned `SpaceContext`).
- **UI State Management:** Plan to use **Zustand** for managing client-side UI state (e.g., selected items, filters) once React Query is integrated.
- **Repository Pattern:** Adopted for data access abstraction. Interfaces and Supabase implementations complete. API routes refactored. React Query hooks will use repositories.
- **Real-time:** Implemented Supabase Realtime with React Query for automatic cache invalidation. Existing Socket.IO implementation (`socket-server.js`, hooks) remains for messaging until fully migrated/replaced.
- **Floor Plan Technology:** Decided to replace Konva canvas implementation with standard DOM elements (HTML/CSS/Shadcn) for better integration, accessibility, and potentially simpler maintenance (IP2).
- **Floor Plan Visualization Priority:** Previous fixes (T8) addressed immediate Konva issues. Now focusing on the strategic replacement with DOM (IP2).

## Recent Changes Summary (See changelog.md for details)
- **Apr 5:** Restructured implementation plan to prioritize critical floor plan and messaging fixes. Added tasks T8, T9, and T10 to address immediate usability issues.
- **Apr 4:** Completed implementation of messaging API features (file attachments, message status, typing indicators, conversation archive/read status) and corresponding API routes with proper handling of Firebase UID vs Database UUID mismatch.
- **Apr 4:** Transitioned to Execution phase to implement fixes for messaging and conversations system.
- **Apr 4:** Fixed critical error in the invitation system where Firebase UIDs were being used directly in database operations expecting UUIDs. Implemented ID format detection and conversion in API routes.
- **Apr 4:** Implemented user avatars in the floor plan with tooltips showing user information. Implemented space persistence across sessions with the `useLastSpace` hook to ensure users remain in their selected space even after logging out and back in.
- **Apr 4:** Integrated React Query mutation hooks into components. Updated `FloorPlan` component to use `useUpdateSpace` hook for the `handleEnterSpace` function, replacing the TODO comment with proper implementation.
- **Apr 2:** Implemented React Query mutation hooks (`useCreateSpace`, `useUpdateSpace`, `useDeleteSpace`) for spaces. Set up React Query, implemented space query hooks, refactored FloorPlan component. Fixed LocalSpace type definitions. Refactored RoomDialog component into smaller units.

## Latest Action (2025-04-05 ~15:45 UTC-3)

**Goal:** Plan the implementation of the DOM-based floor plan (replacing Konva).

**Phase:** Strategy

**Actions:**
- Transitioned to Strategy phase.
- Reviewed project brief and user request for DOM floor plan.
- Outlined core concepts, architecture, and high-level tasks (T11-T20).
- Created detailed instruction files for tasks T11 through T20.
- Created Implementation Plan document `IP2_DomFloorPlanImplementation.md`.
- Updating `activeContext.md` (this action).

**Outcome:**
- Detailed plan and task instructions for DOM floor plan implementation are ready.
- Implementation Plan document created.

**Status:** Ready to update `progress.md` and then transition to Execution phase upon user confirmation.
