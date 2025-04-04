# Active Context
```guidance
**Date:** 4/2/2025
**Last Updated:** 4/4/2025, 5:34 PM (UTC-3:00) // Updated timestamp

**Purpose:** This file provides a concise overview of the current work focus, immediate next steps, and active decisions for the project.

**Use Guidelines:**
- **Current Work Focus:** List the 2-3 *most critical* tasks currently being actively worked on.
- **Next Steps:** List the immediate next steps required to advance the project.
- **Active Decisions and Considerations:** Document key decisions currently being considered.
- **Do NOT include:** Detailed task breakdowns, historical changes, long-term plans.
- **Maintain Brevity:** Keep this file concise and focused on the *current* state.
```
## Current Work Focus:
- **Fix Invitation System:** Resolved critical issues with the invitation system by addressing the mismatch between Firebase UIDs and database UUIDs.
    - **API Routes:** Updated invitation acceptance and user update routes to properly handle ID conversions.
    - **Error Handling:** Improved error handling and user feedback in the join page.
    - **Testing Interface:** Created admin interface for testing invitation creation and management.
- **Implement React Query for Spaces:** Setting up React Query for server state management, starting with space data.
    - **Initial Setup:** Installed dependencies, created `QueryProvider`, integrated into layout.
    - **Query Hooks:** Implemented `useSpaces` and `useSpace` hooks.
    - **Floor Plan Refactor:** Updated `FloorPlan` component to use `useSpaces` hook.
    - **Mutation Hooks:** Implemented `useCreateSpace`, `useUpdateSpace`, `useDeleteSpace` hooks.
    - **Component Integration:** Integrated mutation hooks into `RoomDialog` and `FloorPlan` components.
    - **Real-time Updates:** Implemented `useSpaceRealtime` hook and integrated it with the dashboard layout.
- **Implement Avatars in Floor Plan:** Implemented user avatars in the floor plan with tooltips showing user information.

## Next Steps:

1.  **Test Invitation System:** Verify the invitation creation and acceptance flow with the fixed implementation.
2.  ~~Implement React Query Mutations: Create mutation hooks (`useCreateSpace`, `useUpdateSpace`, etc.) in `src/hooks/mutations/`.~~ (Completed)
3.  ~~**Integrate Mutations:** Update components (e.g., `RoomDialog`) to use mutation hooks for creating/updating spaces.~~ (Completed)
4.  ~~**Implement Real-time Updates:** Create `useSpaceRealtime` hook to invalidate queries based on Supabase real-time events.~~ (Completed)
5.  **Test React Query Integration:** Verify data fetching, mutations, and real-time updates for spaces.
6.  **Test Messaging Functionality:** (Deferred until React Query setup is stable for relevant components) Perform end-to-end testing.
7.  **Implement Space Persistence:** Ensure users remain in their selected space even after logging out and back in.

## Active Decisions and Considerations:

- **Firebase UID vs Database UUID:** Implemented a solution to handle the mismatch between Firebase UIDs and database UUIDs by detecting ID format and converting as needed.
- **Data Migration:** Confirmed decision: No data migration needed; start fresh.
- **Server State Management:** Adopted **React Query** for fetching, caching, and synchronizing server state, replacing the need for custom context providers (like the planned `SpaceContext`).
- **UI State Management:** Plan to use **Zustand** for managing client-side UI state (e.g., selected items, filters) once React Query is integrated.
- **Form Management:** Plan to use **React Hook Form** for handling forms (e.g., room creation/editing) later.
- **Repository Pattern:** Adopted for data access abstraction. Interfaces and Supabase implementations complete. API routes refactored. React Query hooks will use repositories.
- **Real-time:** Implemented Supabase Realtime with React Query for automatic cache invalidation. Existing Socket.IO implementation (`socket-server.js`, hooks) remains for messaging until fully migrated/replaced.
- **Dependency Injection:** Currently using manual instantiation of repositories (in hooks/API routes); consider a more formal DI approach later.

## Recent Changes Summary (See changelog.md for details)
- **Apr 4:** Fixed critical error in the invitation system where Firebase UIDs were being used directly in database operations expecting UUIDs. Implemented ID format detection and conversion in API routes.
- **Apr 4:** Implemented user avatars in the floor plan with tooltips showing user information. Implemented space persistence across sessions with the `useLastSpace` hook to ensure users remain in their selected space even after logging out and back in.
- **Apr 4:** Integrated React Query mutation hooks into components. Updated `FloorPlan` component to use `useUpdateSpace` hook for the `handleEnterSpace` function, replacing the TODO comment with proper implementation.
- **Apr 2:** Implemented React Query mutation hooks (`useCreateSpace`, `useUpdateSpace`, `useDeleteSpace`) for spaces. Set up React Query, implemented space query hooks, refactored FloorPlan component. Fixed LocalSpace type definitions. Refactored RoomDialog component into smaller units.
- **Apr 1:** Implemented Space Reservation Repository (Interface & Supabase). Resolved MessagingContext duplication, moved hooks, cleaned types, fixed API calls. Refactored various API routes (Messages, Spaces, Companies, Conversations, Invitations) to use Repositories.
