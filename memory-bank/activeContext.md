# Active Context
```guidance
**Date:** 4/2/2025
**Last Updated:** 4/5/2025, 11:06 AM (UTC-3:00) // Updated timestamp

**Purpose:** This file provides a concise overview of the current work focus, immediate next steps, and active decisions for the project.

**Use Guidelines:**
- **Current Work Focus:** List the 2-3 *most critical* tasks currently being actively worked on.
- **Next Steps:** List the immediate next steps required to advance the project.
- **Active Decisions and Considerations:** Document key decisions currently being considered.
- **Do NOT include:** Detailed task breakdowns, historical changes, long-term plans.
- **Maintain Brevity:** Keep this file concise and focused on the *current* state.
```
## Current Work Focus:
- **Phase**: Execution
- **Focus Area**: Implementing fixes for floor plan visualization and messaging system
- **Current Tasks**: 
  - T8_FloorPlanVisibilityFixes - Fix space visualization and loading issues
  - T9_MessagingAuthenticationFixes - Fix authentication and session issues in messaging
  - T10_UserInteractionFixes - Fix user-to-user interaction for messaging

## Next Steps:
1. Complete T8_FloorPlanVisibilityFixes
   - Fix black space rendering and visibility issues
   - Ensure all created spaces appear on the floor plan
   - Fix user avatar display across different sessions
2. Complete T9_MessagingAuthenticationFixes
   - Fix 401 Unauthorized errors for sending messages
   - Fix "No active session" errors for typing indicators
3. Complete T10_UserInteractionFixes
   - Enable clicking on users to send messages
   - Fix conversation initialization between users
4. Proceed with remaining tasks after critical fixes
   - T2_RepositoryEnhancement - Ensure repositories fully implement interfaces
   - T3_ReactQueryMigration - Refactor messaging hooks to use React Query
   - T4_RealtimeMessaging - Implement Supabase Realtime for messaging

## Active Decisions and Considerations:
- **Testing Strategy:** Developed an alternative testing approach for Next.js App Router API routes due to challenges with direct unit testing. Focus on testing core logic separately from route handlers.
- **Messaging System Architecture:** Need to evaluate current messaging architecture and identify improvements for reliability and performance.
- **Real-time Updates for Messages:** Consider how to best implement real-time updates for messages using Supabase Realtime and React Query.
- **Firebase UID vs Database UUID:** Implemented a solution to handle the mismatch between Firebase UIDs and database UUIDs by detecting ID format and converting as needed.
- **Server State Management:** Adopted **React Query** for fetching, caching, and synchronizing server state, replacing the need for custom context providers (like the planned `SpaceContext`).
- **UI State Management:** Plan to use **Zustand** for managing client-side UI state (e.g., selected items, filters) once React Query is integrated.
- **Repository Pattern:** Adopted for data access abstraction. Interfaces and Supabase implementations complete. API routes refactored. React Query hooks will use repositories.
- **Real-time:** Implemented Supabase Realtime with React Query for automatic cache invalidation. Existing Socket.IO implementation (`socket-server.js`, hooks) remains for messaging until fully migrated/replaced.
- **Floor Plan Visualization Priority:** Prioritizing floor plan visibility fixes over other tasks as users are experiencing black spaces and missing elements.

## Recent Changes Summary (See changelog.md for details)
- **Apr 5:** Restructured implementation plan to prioritize critical floor plan and messaging fixes. Added tasks T8, T9, and T10 to address immediate usability issues.
- **Apr 4:** Completed implementation of messaging API features (file attachments, message status, typing indicators, conversation archive/read status) and corresponding API routes with proper handling of Firebase UID vs Database UUID mismatch.
- **Apr 4:** Transitioned to Execution phase to implement fixes for messaging and conversations system.
- **Apr 4:** Fixed critical error in the invitation system where Firebase UIDs were being used directly in database operations expecting UUIDs. Implemented ID format detection and conversion in API routes.
- **Apr 4:** Implemented user avatars in the floor plan with tooltips showing user information. Implemented space persistence across sessions with the `useLastSpace` hook to ensure users remain in their selected space even after logging out and back in.
- **Apr 4:** Integrated React Query mutation hooks into components. Updated `FloorPlan` component to use `useUpdateSpace` hook for the `handleEnterSpace` function, replacing the TODO comment with proper implementation.
- **Apr 2:** Implemented React Query mutation hooks (`useCreateSpace`, `useUpdateSpace`, `useDeleteSpace`) for spaces. Set up React Query, implemented space query hooks, refactored FloorPlan component. Fixed LocalSpace type definitions. Refactored RoomDialog component into smaller units.

## Latest Action (2025-04-05 ~15:15 UTC-3)

**Goal:** Resolve incorrect user assignments in spaces (e.g., users appearing in 'Cozinha' when `userIds` should be empty).

**Investigation & Actions:**
- Verified API initially returned incorrect `userIds`.
- Investigated `SupabaseSpaceRepository` and identified/fixed data mapping issues for `userIds` (Steps 287-289).
- Examined `useSpaces`, `useSpaceMutations`, and `CompanyContext` data flow.
- Added logging to `CompanyContext` to verify the `spaces` state after fetching.

**Outcome:**
- Confirmed via `console.log` in `CompanyContext` that the correct data (`userIds: []` for 'Cozinha') is now being fetched from the API and stored in the client-side context state.
- The UI now correctly reflects user assignments based on the fixed data flow.
- The root cause was traced back to the data mapping logic in `SupabaseSpaceRepository`.

**Status:** User assignment issue appears resolved.
