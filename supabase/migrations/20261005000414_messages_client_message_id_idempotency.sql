-- Phase 4 T23 / FR-024, AC-029, AC-035
-- (spec-interview/phase-4-messaging-timeline): retrying a send never creates a
-- duplicate message.
--
-- The drawer composer generates one key (uuid) per composition and resends it
-- on every "Tentar de novo" of that composition. POST /api/messages/create
-- stores it in messages.client_message_id; a create repeating a key already
-- stored for the same sender and conversation returns the existing message
-- instead of inserting another. When a committed create loses its response
-- and the user retries, the server therefore keeps exactly one row.
--
-- Scope of uniqueness: (sender_id, conversation_id, client_message_id). The
-- sender is always the authenticated caller resolved on the server
-- (users.supabase_uid = auth.uid() -> users.id), so one user's key can never
-- match or block another user's message, and a key reused in another
-- conversation is a different message.
--
-- Concurrency: two simultaneous creates with the same key race on this unique
-- index; the loser gets unique_violation (23505), which the repository turns
-- into a read of the winning row (no 500, one row).
--
-- Backward compatible with the published app (BR-013):
--   * the column is nullable with no default; the published app sends no key,
--     its rows keep NULL and are outside the partial index, so legacy creates
--     behave exactly as before (any number of identical messages allowed);
--   * no existing column, policy, grant, trigger, or function changes; RLS on
--     messages already governs the new column like every other column;
--   * Realtime INSERT payloads gain one nullable field (ignored by the
--     published client mappers).
--
-- Locking/size: ADD COLUMN without a default is a catalog-only change but
-- takes a brief ACCESS EXCLUSIVE lock on messages; CREATE INDEX then holds a
-- SHARE lock (blocks writes) for one scan of the table. The partial index only
-- holds rows with a key (none at creation). lock_timeout makes the migration
-- fail fast instead of queueing message traffic behind a long transaction;
-- re-run it when that happens. Not CONCURRENTLY because migrations run inside
-- a transaction.
--
-- Transactional and re-runnable (if not exists).
--
-- Rollback (drops the key and the dedupe). Order: first roll the app back to
-- a build whose create route does not read/write client_message_id (the T23
-- route fails creates that carry a key once the column is gone; the published
-- app sends no key and is unaffected), then run:
--   begin;
--   drop index if exists public.messages_sender_conversation_client_message_id_key;
--   alter table public.messages drop column if exists client_message_id;
--   delete from supabase_migrations.schema_migrations where version = '20261005000414';
--   commit;

begin;

set local lock_timeout = '5s';

alter table public.messages
  add column if not exists client_message_id uuid;

comment on column public.messages.client_message_id is
  'Client-generated idempotency key of the composition that created this message (Phase 4 T23). NULL for messages created without a key. Unique per (sender_id, conversation_id).';

create unique index if not exists messages_sender_conversation_client_message_id_key
  on public.messages using btree (sender_id, conversation_id, client_message_id)
  where client_message_id is not null;

commit;
