# T5_1_RefactorMessagingRealtime Instructions

## Objective
Refactor the messaging system's realtime functionality to use Supabase Realtime subscriptions exclusively, removing the remnants of the previous Socket.io implementation (`useSocketEvents.ts`) and ensuring message events (new messages, status updates) are handled correctly and efficiently via Supabase `postgres_changes`.

## Context
[Implementation Plan: IP5_MessagingRealtimeUnification]
Task T1_4 removed Socket.io dependencies but left the messaging system (`MessagingContext`, `useMessages`, etc.) still structured around the now-defunct `useSocketEvents` hook. This task completes the migration by implementing direct Supabase Realtime subscriptions for messages, aligning it with the presence system's implementation and fixing related issues (like invalid `isConnected` properties). **Extreme caution is required to avoid performance issues or update loops.**

## Dependencies
- `virtual-office/src/contexts/messaging/MessagingContext.tsx`
- `virtual-office/src/hooks/useMessages.ts`
- `virtual-office/src/hooks/useConversations.ts` (Potentially, if conversation updates are handled via realtime)
- `virtual-office/src/hooks/useSocketEvents.ts` (To be deleted)
- `virtual-office/src/lib/supabase/client.ts`
- `virtual-office/src/types/messaging.ts`
- Components consuming `MessagingContext` (e.g., `virtual-office/src/components/messaging/RoomMessaging.tsx`)

## Steps
1.  **Analyze Current State:** Review `MessagingContext.tsx`, `useMessages.ts`, `useConversations.ts`, and `useSocketEvents.ts` to fully map how message events are currently (incorrectly) handled or expected to be handled.
2.  **Remove `useSocketEvents`:**
    - Delete the file `virtual-office/src/hooks/useSocketEvents.ts`.
    - Remove its import and usage from `virtual-office/src/contexts/messaging/MessagingContext.tsx`.
    - Remove any related state or functions (e.g., `typingUsers`, `sendTypingIndicator` if purely socket-based) from `MessagingContext.tsx`.
3.  **Implement Supabase Subscription in `useMessages`:**
    - Inside the `useMessages` hook (`virtual-office/src/hooks/useMessages.ts`), add a `useEffect` hook to manage the Supabase subscription.
    - Create a Supabase channel (e.g., `messaging-channel:${activeConversationId}` or a more general channel if appropriate).
    - Subscribe to `postgres_changes` on the `public.messages` table. **Crucially, apply filters** to only receive relevant messages (e.g., `filter: `conversation_id=eq.${activeConversationId}`).
    - In the subscription callback:
        - Handle `INSERT` events: Add the new message to the local state (e.g., using `queryClient.setQueryData`). Be careful to avoid duplicates if the message was already added optimistically.
        - Handle `UPDATE` events: Update the corresponding message in the local state (for status changes, edits, reactions).
        - Handle `DELETE` events: Remove the message from the local state.
    - Ensure the channel is properly unsubscribed in the `useEffect` cleanup function.
    - Add connection status tracking similar to `useUserPresence` if desired, or rely on the global status.
4.  **(Optional) Implement Conversation Subscription:** If realtime updates for conversation properties (like `last_message`, `unread_count`) are needed, implement a similar subscription mechanism, likely within `useConversations.ts`, subscribing to the `conversations` table with appropriate filters.
5.  **Refactor `MessagingContext`:** Ensure the context correctly provides the message data managed by the updated `useMessages` hook. Remove any remnants related to `useSocketEvents`.
6.  **Refactor Consuming Components:**
    - Open `virtual-office/src/components/messaging/RoomMessaging.tsx`.
    - Remove the usage of the invalid `isConnected` property.
    - Verify it correctly consumes and displays messages from the refactored context.
7.  **Testing (CRITICAL):**
    - Test sending and receiving messages in real-time between different users.
    - Test message status updates (sending, delivered, read - if implemented).
    - Test behavior during connection drops and reconnections (if status monitoring is added).
    - **Monitor network tab and Supabase dashboard for excessive requests or unexpected behavior.**
    - Verify no console errors related to Socket.io or the old structure remain.

## Expected Output
- `useSocketEvents.ts` file deleted.
- `useMessages.ts` (and potentially `useConversations.ts`) updated with Supabase Realtime subscriptions for messages.
- `MessagingContext.tsx` refactored to use the new Supabase-driven hooks.
- Consuming components like `RoomMessaging.tsx` updated to work with the refactored context and remove invalid properties.
- Fully functional realtime messaging based solely on Supabase.
- No performance degradation or excessive database load from realtime subscriptions.