# Active Context
```guidance
**Date:** 4/5/2025
**Last Updated:** 4/5/2025, 4:01 PM (UTC-3:00)

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
- **Focus Area**: Implementing DOM Floor Plan (IP2) - Phase 1: Backend & Data Layer
- **Current Tasks**: T11_DB_AddUserLocation - Adding current_space_id to users table

## Next Steps:
1. Apply SQL migration to Supabase database
2. Test new updateLocation repository method
3. Proceed with T12_API_UpdateUserLocation once current task is verified

## Active Decisions and Considerations:
- **SQL Migration Strategy:** Created migration with ON DELETE SET NULL for the current_space_id foreign key constraint, ensuring safe space deletion handling
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
- **Apr 5:** Added current_space_id column to users table with foreign key constraint and index
- **Apr 5:** Updated User type and repository implementations to support user location tracking
- **Apr 5:** Restructured implementation plan to prioritize critical floor plan and messaging fixes

## Latest Action (2025-04-05 ~16:01 UTC-3)

**Goal:** Implement T11_DB_AddUserLocation by adding current_space_id to users table.

**Phase:** Execution

**Actions:**
- Created SQL migration for adding current_space_id column
- Updated User type in database.ts
- Added updateLocation method to IUserRepository
- Implemented updateLocation in SupabaseUserRepository

**Outcome:**
- All code changes for T11 are complete
- Ready to apply SQL migration to Supabase

**Status:** Awaiting SQL migration execution and verification
