# Task: Implement Real-time Features using Supabase Subscriptions

**Date:** 3/31/2025

**Objective:** Replace the existing Socket.IO-based real-time communication system with Supabase Realtime Subscriptions and Presence features to reflect database changes and user activity instantly in the frontend.

**Depends On:**
*   Completion of Supabase database setup and schema application.
*   Implementation of Supabase client (`src/lib/supabase/client.ts`).
*   Refactoring of API routes to use repositories (ensuring DB changes trigger Realtime).

**Identified Real-time Features (from previous Socket.IO implementation):**

*   New messages appearing in conversations/rooms.
*   Message reaction updates (add/remove).
*   Message status updates (potentially, though less common for real-time).
*   Typing indicators.
*   User presence/status updates (potentially needed).

**Supabase Realtime Concepts:**

*   **Database Changes:** Subscribe to INSERT, UPDATE, DELETE events on specific tables, schemas, or filtered rows (e.g., messages in a specific conversation).
*   **Presence:** Track user online status within specific channels (e.g., who is viewing a specific conversation or is active in the app).
*   **Broadcast:** Send ephemeral messages directly between clients subscribed to the same channel, without persisting to the database (ideal for typing indicators).

**Refactoring Steps:**

1.  **Remove Socket.IO:**
    *   Uninstall Socket.IO packages: `npm uninstall socket.io socket.io-client`
    *   Delete the standalone server file: `socket-server.js`
    *   Remove Socket.IO client setup and event listeners/emitters from frontend contexts/components (e.g., `MessagingContext.tsx`).
    *   Remove any Socket.IO event emission logic from API routes.

2.  **Implement Real-time Subscriptions (Client-Side):**
    *   **Messaging Context (`MessagingContext.tsx` or similar):**
        *   Import the `supabase` client.
        *   When a user views a conversation, create a Supabase channel specific to that conversation (e.g., `supabase.channel('conversation:' + conversationId)`).
        *   **Subscribe to New Messages:** Use `.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, payload => { ... })` to listen for new messages in the current conversation. Update the local message state with `payload.new`.
        *   **Subscribe to Message Updates (Optional):** Listen for UPDATEs on `messages` if needed (e.g., for `isEdited` status).
        *   **Subscribe to Reactions:** Use `.on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions', filter: `message_id=in.(${messageIdsInView.join(',')})` }, payload => { ... })` to listen for reaction changes on currently visible messages. Update reaction counts/display based on `payload.new` or `payload.old`. This requires dynamically updating the filter as messages scroll into view. Alternatively, fetch reactions when a message is rendered and rely less on real-time for this specific feature if performance is a concern.
        *   **Unsubscribe:** Call `supabase.removeChannel(channel)` or `channel.unsubscribe()` when the user leaves the conversation or the component unmounts.

3.  **Implement Typing Indicators (Client-Side using Broadcast):**
    *   **Messaging Context/Input Component:**
        *   When the user starts typing in the input for a conversation:
            *   Get the conversation channel (create if needed).
            *   Use `channel.track({ event: 'typing', typing: true })` or `channel.send({ type: 'broadcast', event: 'typing', payload: { userId: currentUser.id, isTyping: true } })`. `track` might be simpler if presence is also used.
        *   When the user stops typing (e.g., after a timeout):
            *   Send `typing: false` event via `track` or `send`.
        *   **Listen for Typing Events:** Use `channel.on('broadcast', { event: 'typing' }, ({ payload }) => { ... })` or monitor presence state changes if using `track`. Update the UI to show/hide typing indicators for other users.

4.  **Implement Presence (Client-Side):**
    *   **Global Context (e.g., `PresenceContext` or `AuthContext`):**
        *   Create a general presence channel (e.g., `supabase.channel('global_presence')`).
        *   Use `channel.subscribe(async (status) => { if (status === 'SUBSCRIBED') { await channel.track({ user_id: currentUser.id, online_at: new Date().toISOString() }); } })`.
        *   Listen for presence events: `channel.on('presence', { event: 'sync' }, () => { const presenceState = channel.presenceState(); ... })` and `channel.on('presence', { event: 'join' }, ({ key, newPresences }) => { ... })` and `channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => { ... })`.
        *   Update a global state mapping user IDs to their presence status (online/offline).
    *   **User Status Display:** Components displaying user avatars/status can consume this global presence state.
    *   *(Optional):* Track presence per-conversation or per-space channel for more granular "who's here" features.

5.  **Backend Adjustments:**
    *   Ensure Row Level Security (RLS) policies are enabled and correctly configured in Supabase for all relevant tables (`messages`, `conversations`, `message_reactions`, etc.). Realtime subscriptions respect RLS policies. Users should only receive events for data they are authorized to see.
    *   The API routes no longer need to emit events; Supabase handles broadcasting based on successful database operations.

**Testing:**

*   Open multiple browser windows/clients logged in as different users.
*   **Messages:** Send messages in a shared conversation; verify they appear instantly for other participants.
*   **Reactions:** Add/remove reactions; verify updates appear for others viewing the message.
*   **Typing:** Start typing in one client; verify the indicator appears for others in the same conversation and disappears when typing stops.
*   **Presence:** Log users in/out or simulate browser closes; verify online status updates correctly for other users.
*   Check browser developer console for any Supabase Realtime connection errors or subscription issues.
*   Verify RLS prevents users from receiving real-time updates for conversations/data they shouldn't access.

**Completion Criteria:**
*   All Socket.IO code is removed.
*   Core real-time features (messaging, reactions, typing, presence) are functional using Supabase Realtime.
*   Frontend state updates correctly based on received real-time events.
*   RLS policies are in place and effective for real-time subscriptions.