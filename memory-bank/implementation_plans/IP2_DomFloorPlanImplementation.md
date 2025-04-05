# IP2_DomFloorPlanImplementation

## Overview
This plan outlines the implementation of a new interactive floor plan for the virtual office application, replacing the existing Konva canvas-based solution with a standard DOM-based approach using HTML elements, CSS (Tailwind), and Shadcn UI components. It includes adding real-time user presence tracking and interaction capabilities like entering spaces and linking to the chat system.

## Goals
- Replace the Konva canvas floor plan with a DOM-based equivalent.
- Display spaces (rooms) accurately based on database information.
- Implement real-time user presence, showing user avatars within their current space.
- Allow users to "enter" a space by clicking on it, updating their location in the backend.
- Integrate the "enter space" action with the existing messaging system to open the relevant space chat.
- Remove all Konva-related code and dependencies cleanly.

## Components
- `users` table (Database): Add `current_space_id` column.
- `IUserRepository` / `SupabaseUserRepository`: Add `updateLocation` method.
- `/api/users/location` (API Route): New PUT endpoint to update user location.
- `useUserPresence` (Hook): Fetches presence data, handles real-time updates (Supabase Realtime), provides location update function.
- `PresenceContext` / `PresenceProvider` (Context): Manages and provides presence data/functions.
- `DomFloorPlan` (Component): Refactored main floor plan container using DOM elements.
- `SpaceElement` (Component): Renders a single clickable space with users inside.
- `UserAvatarPresence` (Component): Renders a user avatar with status indicator.

## Technical Approach
The implementation will utilize standard web technologies. Spaces and user avatars will be rendered as HTML `div` elements styled with Tailwind CSS and potentially Shadcn UI components (like `Card`, `Avatar`). User location will be stored in a new `current_space_id` field in the `users` Supabase table. Clicking a space will trigger a call to a new API endpoint (`PUT /api/users/location`) via a React Query mutation in the `useUserPresence` hook. This hook will also use `useQuery` to fetch initial presence data and Supabase Realtime subscriptions to receive live updates on user location and status changes, updating the React Query cache accordingly. A `PresenceContext` will distribute the presence data and update function to the necessary components, primarily the refactored `DomFloorPlan`. The `DomFloorPlan` will map over spaces and render `SpaceElement` components, which in turn render `UserAvatarPresence` components for users within that space. Clicking a `SpaceElement` will also trigger logic (likely within `DomFloorPlan`) to activate the corresponding chat via `MessagingContext`.

## Related Tasks
- **T11_DB_AddUserLocation:** Add `current_space_id` to `users` table and update repository.
- **T12_API_UpdateUserLocation:** Create API route to update user location.
- **T13_Hook_UserPresence:** Implement hook for fetching/subscribing to presence data and updating location.
- **T14_Component_PresenceContext:** Create context/provider for presence data.
- **T15_Component_DomFloorPlan:** Refactor main floor plan component to use DOM, integrate presence.
- **T16_Component_SpaceElement:** Create component to render a single space and handle entry clicks.
- **T17_Component_UserAvatarPresence:** Create component to render user avatar with status.
- **T18_Integration_SpaceChat:** Connect space entry click to open the relevant chat panel.
- **T19_Realtime_Backend:** Verify/implement backend broadcasting for presence updates (Supabase Realtime/RLS).
- **T20_Cleanup_Konva:** Remove old Konva code and dependencies after successful implementation.

## Timeline (Estimate)
- **Phase 1: Backend & Data Layer:** Complete T11, T12, T19. (Focus on DB changes, API endpoint, and ensuring Realtime works)
- **Phase 2: Frontend Core & Presence:** Complete T13, T14, T17, T16, T15. (Build the core hook, context, UI elements, and main floor plan rendering)
- **Phase 3: Integration & Cleanup:** Complete T18, T20. (Connect to chat, remove old code)

## Risks and Mitigations
- **Risk 1:** Complexity in managing real-time updates (Supabase Realtime RLS/subscriptions).
  - **Mitigation 1:** Prioritize T19, test Realtime updates thoroughly with manual DB changes before building complex frontend logic. Ensure RLS policies are correct.
- **Risk 2:** Performance issues rendering many users/spaces or handling frequent updates.
  - **Mitigation 2:** Use React Query effectively for caching. Optimize filtering/rendering logic. Profile performance if issues arise and consider optimizations (e.g., virtualized rendering if needed, though likely overkill initially).
- **Risk 3:** Styling and positioning complexity for DOM elements to match desired layout.
  - **Mitigation 3:** Start with a simpler layout (e.g., grid/flex) if absolute positioning based on DB coordinates proves difficult initially. Refine styling iteratively.
- **Risk 4:** `MessagingContext` integration (T18) might require refactoring `MessagingContext` itself.
  - **Mitigation 4:** Verify `MessagingContext` capabilities early (during T18 planning/start). If refactoring is needed, create a separate task or adjust T18 scope accordingly.
- **Risk 5:** Ensuring complete removal of Konva without breaking unrelated functionality.
  - **Mitigation 5:** Perform T20 only after extensive testing of the new implementation. Use project-wide search carefully. Rely on version control.
