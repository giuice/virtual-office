# Story 4A.3: Pinned and Starred Message Indicators

Status: planning

## Story

As a user,
I want to pin important messages and star messages for later reference,
So that I can quickly find key information in busy conversations.

## Acceptance Criteria

1. **AC1 – Context Menu Actions**
   - Message context menu includes "Pin Message" and "Star Message" options.
   - Actions are accessible via keyboard and screen readers.
   - [Source: docs/epics.md#story-4a3-pinned-and-starred-message-indicators]

2. **AC2 – Pinned Messages Display**
   - Pinned messages show a visual pin icon indicator.
   - Pinned messages appear in a dedicated "Pinned Messages" section/header at the top of the feed or in a side panel.
   - [Source: docs/epics.md#story-4a3-pinned-and-starred-message-indicators]

3. **AC3 – Starred Messages & Filter**
   - Starred messages show a visual star icon indicator.
   - User can view a list of their starred messages via a "Starred" filter or view.
   - [Source: docs/epics.md#story-4a3-pinned-and-starred-message-indicators]

4. **AC4 – Toggle Semantics**
   - "Unpin" and "Unstar" options replace the add actions in the context menu for already pinned/starred messages.
   - Actions are optimistic with rollback on failure.
   - [Source: docs/epics.md#story-4a3-pinned-and-starred-message-indicators]

5. **AC5 – Persistence & Realtime**
   - Pin/Star state persists via API (`POST /api/messages/pin`, `/api/messages/star`).
   - Pin updates propagate in real-time to all users (Pins are shared).
   - Star updates are private to the user (Stars are personal).
   - [Source: docs/epics.md#story-4a3-pinned-and-starred-message-indicators]

## Tasks / Subtasks

### Task 1: Database & API (AC5)
- [ ] 1.1 Create migration for `pinned_messages` (shared) and `starred_messages` (per user) tables/columns.
- [ ] 1.2 Implement repository methods for `pinMessage`, `unpinMessage`, `starMessage`, `unstarMessage`.
- [ ] 1.3 Create API endpoints `/api/messages/[id]/pin` and `/api/messages/[id]/star`.
- [ ] 1.4 Ensure RLS policies: Pins readable by all in conversation, writable by members; Stars private to user.

### Task 2: UI Components & Context Menu (AC1, AC4)
- [ ] 2.1 Update `MessageItem` context menu to include Pin/Star actions.
- [ ] 2.2 Implement optimistic updates in `useMessageActions` (or similar hook).
- [ ] 2.3 Add visual indicators (icons) to `MessageItem` for pinned/starred state.

### Task 3: Pinned Messages View (AC2)
- [ ] 3.1 Create `PinnedMessagesList` component to display pinned messages for the conversation.
- [ ] 3.2 Integrate `PinnedMessagesList` into `MessagingDrawer` (e.g., in a header or collapsible section).

### Task 4: Starred Messages Filter (AC3)
- [ ] 4.1 Create `StarredMessagesList` component or filter mode for `MessageFeed`.
- [ ] 4.2 Add "Show Starred" toggle/view control to `MessagingDrawer`.

### Task 5: Realtime Updates (AC5)
- [ ] 5.1 Listen for realtime events on `pinned_messages` table (or equivalent).
- [ ] 5.2 Update local cache when pins change remotely.

## Dev Notes

### Architecture
- **Pins:** Shared state. Stored likely as a flag on message or a separate relation `conversation_pins`.
- **Stars:** User-specific state. Stored in `user_stars` or similar relation.
- **Realtime:** Pins need to broadcast. Stars do not need to broadcast to others, but should sync across user's devices.

### Dependencies
- Existing `MessageItem` and context menu.
- Supabase Realtime setup.

### References
- docs/epics.md#story-4a3-pinned-and-starred-message-indicators
