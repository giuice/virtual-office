# IP5_MessagingRealtimeUnification

## Overview
This plan addresses the incomplete migration from Socket.io to Supabase Realtime within the application's messaging system. Task T1_4 removed Socket.io code but did not fully implement Supabase Realtime subscriptions for receiving messages and updates. This plan outlines the steps to refactor the messaging context and related hooks to use Supabase Realtime exclusively, ensuring consistency with the presence system and eliminating leftover Socket.io dependencies/structures.

## Goals
- Remove the `useSocketEvents.ts` hook and its usage entirely.
- Implement Supabase Realtime subscriptions (`postgres_changes`) for the `messages` table (and potentially `conversations` table if needed for updates like unread counts).
- Refactor `MessagingContext.tsx` and related hooks (`useMessages`, `useConversations`) to rely solely on Supabase Realtime for message events.
- Ensure new messages, message status updates, and potentially conversation updates are handled correctly via Supabase subscriptions.
- Remove any invalid properties (like `isConnected`) derived from the old Socket.io structure in consuming components (e.g., `RoomMessaging.tsx`).
- Maintain or improve performance and stability of the messaging system.

## Technical Approach
1.  **Analyze Dependencies:** Thoroughly examine `MessagingContext.tsx`, `useMessages.ts`, `useConversations.ts`, and any components consuming messaging data (like `RoomMessaging.tsx`) to understand the current data flow and identify all points of interaction with the defunct `useSocketEvents.ts`.
2.  **Remove `useSocketEvents`:** Delete the `useSocketEvents.ts` file and remove its import and usage from `MessagingContext.tsx`.
3.  **Implement Supabase Subscription:**
    - Within `useMessages.ts` (or potentially a new dedicated hook if cleaner), establish a Supabase channel subscription.
    - Subscribe to `postgres_changes` on the `public.messages` table. Filter events appropriately (e.g., for messages belonging to the user's company or conversations).
    - Handle `INSERT` events (new messages) by calling the appropriate callback (e.g., `addMessageCallback` passed from the context or managed internally).
    - Handle `UPDATE` events (e.g., status changes, edits, reactions) by updating the local message state.
    - Consider if a subscription to the `conversations` table is needed for real-time updates like `last_message` or `unread_count`. If so, implement similarly.
4.  **Refactor Context:** Modify `MessagingContext.tsx` to integrate the new Supabase-driven message updates. Remove any state or functions related to `useSocketEvents`. Ensure the context provides the necessary data (messages, conversations) updated via Supabase.
5.  **Refactor Consuming Components:** Update components like `RoomMessaging.tsx` to remove dependencies on invalid properties (e.g., `isConnected`) and ensure they correctly consume data from the refactored context.
6.  **Testing:** Rigorously test message sending, receiving, status updates, and conversation updates in real-time scenarios. Monitor network requests and database interactions to ensure efficiency.

## Related Tasks
- T5_1_RefactorMessagingRealtime - Implement the core refactoring of messaging hooks and context for Supabase Realtime.

## Timeline & Risks
**Timeline:**
- Analysis: 0.5 days
- Implementation & Refactoring: 1-2 days
- Testing: 1 day

**Risks:**
- **Infinite Loops/Excessive Updates (HIGH):** Incorrectly configured subscriptions or update logic could lead to cascading updates or excessive database load. Careful filtering and state management are crucial. **MUST BE TESTED THOROUGHLY.**
- **Performance:** Realtime subscriptions can impact performance if not managed efficiently (e.g., subscribing to too much data).
- **Complexity:** Managing realtime state updates alongside existing data fetching logic (React Query) requires careful coordination.
- **Missed Edge Cases:** Forgetting to handle specific message update types (edits, reactions, deletions) via realtime.

**Mitigation Strategies:**
- Implement fine-grained Supabase RLS policies and subscription filters.
- Use careful state management (e.g., React Query `setQueryData`) to avoid unnecessary re-renders.
- Log subscription events and state changes during development.
- Test edge cases explicitly (rapid messages, concurrent updates, connection drops).
- Monitor Supabase realtime usage and database load during testing.