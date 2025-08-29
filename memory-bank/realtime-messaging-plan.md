# Realtime Messaging Plan (Supabase)

This document outlines how to deliver realtime chat messages with Supabase, including image attachments, persistence, efficient loading, and security. It builds on the existing presence implementation and current messaging scaffolding in the repo.

## Current State Summary

- Supabase presence is already used for user/activity updates (see `__tests__/realtime-presence.test.ts`).
- Messaging data model exists:
  - Tables: `conversations`, `messages`, `message_attachments`, `message_reactions` (see `docs/migration/all_tables_updated.md`).
  - API routes in place: `src/app/api/messages/create`, `get`, `react`, `status`, `typing`, `upload`, `attachments`; conversations routes `create`, `get`, `archive`, `read`.
  - Repositories: `SupabaseMessageRepository`, `SupabaseConversationRepository` already map DB rows to app types.
  - Client: `useMessageRealtime` subscribes to Postgres Changes on `messages` filtered by `conversation_id`; `useMessages` handles pagination & optimistic updates; UI components `ChatWindow` and `RoomMessaging` integrated via `MessagingProvider`.

## Goals

- Realtime delivery of messages for room and direct conversations.
- Image/file attachments supported and rendered.
- Persist all messages in Postgres; attachments in Supabase Storage.
- Efficient UI: load only a small window of recent messages by default; paginate older ones on demand.
- Enforce access control via RLS; scope all realtime updates to authorized users only.

## Realtime Strategy

- Use Supabase Realtime Postgres Changes for `messages` with a per-conversation filter:
  - Subscribe: `supabase.channel('messages-changes:<conversationId>').on('postgres_changes', { schema: 'public', table: 'messages', filter: 'conversation_id=eq.<conversationId>' }, handler).subscribe()`.
  - Events: listen for `INSERT`, `UPDATE`, `DELETE` to append, modify, and remove messages in the local cache.
- Optionally consider Broadcast + triggers later if scale requires avoiding per-row RLS checks.
- Subscribe when a chat view becomes active; unsubscribe when the view closes or the conversation switches.
- Prevent duplicates by correlating optimistic temp IDs vs. server IDs (current code ignores `INSERT` for IDs starting with `temp-`).

## Database Work

1. Publications (Postgres Changes):
   - Ensure `messages` (and optionally `message_reactions`) are in the `supabase_realtime` publication:
     ```sql
     drop publication if exists supabase_realtime;
     create publication supabase_realtime;
     alter publication supabase_realtime add table public.messages;
     alter table public.messages replica identity full; -- if we need old values on UPDATE/DELETE
     -- Optional
     -- alter publication supabase_realtime add table public.message_reactions;
     ```

2. RLS Policies (tighten as needed):
   - `messages`:
     - SELECT: user is in `conversations.participants` for `messages.conversation_id`.
     - INSERT: same participant check; `sender_id` must equal current user.
     - UPDATE: sender can edit message content/status (if allowed); system can update status.
     - DELETE: optional (e.g., sender can delete within a window or admins only).
   - `message_attachments` and `message_reactions` with analogous participant checks via joined `messages.conversation_id`.
   - `conversations` SELECT limited to participants; updates to `last_activity`, `unread_count` safeguarded.

3. Storage (bucket: `attachments`):
   - Path convention: `message-attachments/<conversationId>/<uuid.ext>`; thumbnails under `.../thumbnails/`.
   - MVP: bucket public for speed of delivery; later, switch to signed URLs with storage policies restricting paths to conversation participants.

## Backend/API Plan

- Message create (`POST /api/messages/create`):
  - Validate active session and that `senderId` is the current user.
  - Verify user is a participant in the conversation.
  - Insert message (status `sent` initially); update conversation `last_activity` and `unread_count` (server-side function or in-repo update).
  - Return the inserted row; realtime will deliver to other subscribers.

- Fetch messages (`GET /api/messages/get`):
  - Support `limit`, `cursor`, `direction` (`older`/`newer`) for windowed loading.
  - Return `{ messages, nextCursor, hasMore }` consistent with `useMessages` expectations.

- Upload attachment (`POST /api/messages/upload`):
  - Validate session; verify user is a conversation participant.
  - Upload to storage; create `message_attachments` row if `messageId` provided; otherwise return a temporary attachment descriptor for client to include when sending the message.
  - Option B (simpler flow): send text first to create a message, then upload attachments referencing `messageId`.

- Reactions/Status/Typing:
  - `POST /api/messages/react` toggles reaction entries.
  - `POST /api/messages/status` marks delivered/read; optionally update conversation `unread_count`.
  - `POST /api/messages/typing` can use Broadcast instead of DB writes for ephemeral typing.

- Security:
  - All routes validate session and enforce participant membership.
  - Keep payloads minimal; never trust client-supplied `status` for someone else’s messages.

## Frontend Plan

- Subscription lifecycle:
  - In `useMessageRealtime`, keep channel per `conversationId` with Postgres Changes filter.
  - Subscribe on open/setActive; unsubscribe on close/switch.

- Fetching & windowed loading:
  - On conversation open, load the most recent N (e.g., 20) messages.
  - Implement upward infinite scroll to load older pages using `cursor` until `hasMore` is false.
  - Do NOT preload full history in the popup; keep memory usage bounded.

- Sending messages:
  - Optimistic insert with temp ID and `MessageStatus.SENDING`.
  - On server response, reconcile ID and status; on realtime `INSERT`, dedupe using temp ID rule (already implemented).

- Attachments:
  - Add `messagingApi.uploadMessageAttachment(file, conversationId, messageId?)` helper and wire into `useMessages.uploadAttachment`.
  - UX: support paste/drag-drop; show uploading state; render thumbnails for images.

- Presence & typing:
  - Continue using presence for typing indicators via `channel.track`/`presence` events on a per-conversation channel, or use Broadcast for `typing` events.

- Error handling & retries:
  - Show transient errors on failed send/upload; allow retry.
  - Reconnect realtime automatically (Supabase SDK handles backoff); reflect connection state if useful.

## Validation & Testing

- Unit tests: repositories for `create/findByConversation/addAttachment/addReaction`.
- Integration tests: API routes for `messages/create`, `messages/get`, `messages/upload`.
- E2E path: open room chat, send text and image, receive realtime update in a second client, verify pagination when scrolling up.

## Scale & Security Considerations

- RLS + Postgres Changes can be CPU-bound at scale due to per-subscriber checks.
  - Mitigation: switch to Broadcast with DB triggers (`realtime.broadcast_changes`) per conversation topic if needed.
- Storage privacy: migrate to signed URLs with time-bound access; restrict bucket access via policies keyed by `conversationId` path.
- Data retention: optional archival policies; avoid loading archived conversations by default.

## Open Questions

- Should attachments be public (MVP) or signed (preferred for privacy)?
- Editing/deleting messages policy and visibility (time window, audit log)?
- Add a `client_id` column to `messages` to correlate optimistic sends for perfect dedupe?
- Who can update `unread_count`—API only, or DB trigger on insert/update?

## Next Steps (Proposed Order)

1. Confirm publication and RLS policies for `messages`, `message_attachments`, `message_reactions`.
2. Finalize `/api/messages/create` logic to set `last_activity` and validate sender/participants.
3. Implement/finish `messagingApi.uploadMessageAttachment` and wire to `useMessages.uploadAttachment`.
4. Ensure `ChatWindow` uses windowed loading and unsubscribes on close; verify `useMessageRealtime` runs only for active conversation.
5. Add minimal tests for repos and API routes; manual QA with two browser sessions.

## Supabase Schema Analysis (via repo docs)

- Conversations: `id`, `type`, `participants uuid[]`, `last_activity`, `name`, `is_archived`, `unread_count jsonb`, `room_id`, `visibility`.
- Messages: `id`, `conversation_id`, `sender_id`, `content`, `timestamp`, `type (message_type)`, `status (message_status)`, `reply_to_id`, `is_edited`.
- Attachments: `id`, `message_id`, `name`, `type`, `size`, `url`, `thumbnail_url?`.
- Reactions: `id`, `message_id`, `user_id`, `emoji`, `timestamp`.

References: `docs/migration/all_tables_updated.md`, `docs/supabase-realtime-guide.md`, repositories and API routes in `src/app/api/messages/*` and `src/repositories/implementations/supabase/*`.

