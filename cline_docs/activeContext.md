# Active Context
```guidance
**Date:** 4/2/2025
**Last Updated:** 4/2/2025, 10:54 PM (UTC-3:00) // Updated timestamp

**Purpose:** This file provides a concise overview of the current work focus, immediate next steps, and active decisions for the project.

**Use Guidelines:**
- **Current Work Focus:** List the 2-3 *most critical* tasks currently being actively worked on.
- **Next Steps:** List the immediate next steps required to advance the project.
- **Active Decisions and Considerations:** Document key decisions currently being considered.
- **Do NOT include:** Detailed task breakdowns, historical changes, long-term plans.
- **Maintain Brevity:** Keep this file concise and focused on the *current* state.
```
## Current Work Focus:
- **Implement React Query for Spaces:** Setting up React Query for server state management, starting with space data.
    - **Initial Setup:** Installed dependencies, created `QueryProvider`, integrated into layout.
    - **Query Hooks:** Implemented `useSpaces` and `useSpace` hooks.
    - **Floor Plan Refactor:** Updated `FloorPlan` component to use `useSpaces` hook.
    - **Mutation Hooks:** Implemented `useCreateSpace`, `useUpdateSpace`, `useDeleteSpace` hooks. // Added this line
- **Test Messaging Functionality:** (Previous focus, now secondary pending React Query completion for related components) Perform end-to-end testing of core messaging features.

## Next Steps:

1.  ~~Implement React Query Mutations: Create mutation hooks (`useCreateSpace`, `useUpdateSpace`, etc.) in `src/hooks/mutations/`.~~ (Completed)
2.  **Integrate Mutations:** Update components (e.g., `RoomDialog`) to use mutation hooks for creating/updating spaces. // Highlighted as next
3.  **Implement Real-time Updates:** Create `useSpaceRealtime` hook to invalidate queries based on Supabase real-time events.
4.  **Test React Query Integration:** Verify data fetching, mutations, and real-time updates for spaces.
5.  **Test Messaging Functionality:** (Deferred until React Query setup is stable for relevant components) Perform end-to-end testing.

## Active Decisions and Considerations:

- **Data Migration:** Confirmed decision: No data migration needed; start fresh.
- **Server State Management:** Adopted **React Query** for fetching, caching, and synchronizing server state, replacing the need for custom context providers (like the planned `SpaceContext`).
- **UI State Management:** Plan to use **Zustand** for managing client-side UI state (e.g., selected items, filters) once React Query is integrated.
- **Form Management:** Plan to use **React Hook Form** for handling forms (e.g., room creation/editing) later.
- **Repository Pattern:** Adopted for data access abstraction. Interfaces and Supabase implementations complete. API routes refactored. React Query hooks will use repositories.
- **Real-time:** Plan to integrate Supabase Realtime with React Query for automatic cache invalidation. Existing Socket.IO implementation (`socket-server.js`, hooks) remains for messaging until fully migrated/replaced.
- **Dependency Injection:** Currently using manual instantiation of repositories (in hooks/API routes); consider a more formal DI approach later.

## Recent Changes Summary (See changelog.md for details)
- **Apr 2:** Implemented React Query mutation hooks (`useCreateSpace`, `useUpdateSpace`, `useDeleteSpace`) for spaces. Set up React Query, implemented space query hooks, refactored FloorPlan component. Fixed LocalSpace type definitions. Refactored RoomDialog component into smaller units. // Added mutation hooks summary
- **Apr 1:** Implemented Space Reservation Repository (Interface & Supabase). Resolved MessagingContext duplication, moved hooks, cleaned types, fixed API calls. Refactored various API routes (Messages, Spaces, Companies, Conversations, Invitations) to use Repositories.
