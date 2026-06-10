# Messaging System Audit — Handoff & Fix Plan

**Date:** 2026-06-10
**Scope:** Full messaging subsystem — API routes (`src/app/api/messages/*`, `src/app/api/conversations/*`), repositories (`SupabaseMessageRepository`, `SupabaseConversationRepository`), client API (`src/lib/messaging-api.ts`), hooks (`useMessages`, `useConversations`, `useTypingIndicator`, `useConversationPresence`), realtime (`useMessageSubscription`, `useConversationRealtime`), context (`MessagingContext`), and the messaging migrations/RLS.
**Method:** Static code analysis + schema cross-check against `migrations/database-structure.md` (live `list_tables` dump) + existing test run.
**Test baseline:** `vitest run` on the 4 messaging test files → **42 pass, 0 fail**. The bugs below live in paths the tests do not cover.

> Per project protocol: findings marked **[code-confirmed]** are provable from source/schema alone. Findings marked **[needs runtime evidence]** should be reproduced (network tab / DB state / logs) before the fix lands.

---

## Implementation Progress (update as fixes land)

### Phase 0 — Stop the bleeding
- [x] **S-01** — authorization on `/api/conversations/join` → commit `b17a696` (+ shared helper `src/lib/auth/authorize.ts`)
- [x] **S-02 / B-09** — legacy `/api/conversations/create` deleted (removes the debug-leak 500 path) → commit `eb70105`
- [x] **S-04** — `messages/create` hardened: `status='sent'` forced server-side, `replyToId` validated same-conversation, 8 KB content cap, authz via `requireConversationParticipant`; route tests added (`__tests__/api/messages-create-route.test.ts`, 6 pass) → commit `3772c70`
- [x] **X-01 (verification)** — **CONFIRMED 2026-06-10 with runtime evidence**: anonymous REST request (anon key only, no session) reads `users` rows including `email`, `status`, `role`, `current_space_id` (HTTP 200 + data), reads `spaces`, and an anonymous `PATCH` on `users` returns **204 (write permitted)**. Dedicated task opened: `docs/rls-enablement-task.md`. Remediation itself is a separate track (touches presence — consult `/presence-safety` first).
- [ ] **S-03** — attachments bucket (private + signed URLs, size/MIME limits) — not yet started

### Phase 1 — pending (not started)
### Phase 2 — pending (not started)
### Phase 3 — pending (not started)

---

## Executive Summary

The messaging system works for the happy path (send/receive text in an open conversation) but has **2 critical security holes**, **~8 features that are silently broken end-to-end** (unread counts, mark-as-read, typing indicators, reaction-removal sync, message status, grouped/summary endpoints), and a **split-brain architecture**: conversations live in `useState` + 5-second polling while a parallel realtime layer invalidates TanStack Query keys nobody uses. There are also three overlapping, mutually inconsistent read-tracking mechanisms. A separate, **platform-wide critical** RLS gap was found outside messaging (see §6).

---

## 1. CRITICAL — Security

### S-01. `/api/conversations/join` has no authorization at all [code-confirmed]
`src/app/api/conversations/join/route.ts:22-36` — any authenticated user can join **any** conversation by ID, including other people's private DMs, because the route uses the **service-role client** to call `addParticipant` with zero checks (no participant check, no conversation-type check, no company check). Joining a DM then passes every "is participant" check elsewhere, granting full read/write of the conversation history.
**Fix:** require that the conversation is a `room` type AND the room is accessible to the requester (same company, room visibility), or that the user was invited. Never allow joining `direct` conversations. Add a test that a non-participant joining a DM gets 403.

### S-02. Error responses leak internals [code-confirmed]
`src/app/api/conversations/create/route.ts:154-169` returns `error.message`, full **stack trace**, the raw request body, and user IDs to the client on any 500. Several routes also `console.log` full conversation payloads.
**Fix:** return a generic 500; log details server-side only.

### S-03. Attachments bucket is public; no upload limits [code-confirmed]
`src/app/api/messages/upload/route.ts:107-151` — files are stored in the public `attachments` bucket and exposed via `getPublicUrl`. Anyone with the URL reads private-conversation attachments without auth (URLs are UUID-based but shareable/loggable forever). There is **no file-size or content-type limit**, no rate limit, and "thumbnail" is just a second full-size copy of the file.
**Fix:** private bucket + signed URLs (or storage RLS), enforce max size + allowed MIME types, drop the fake thumbnail or implement real resizing.

### S-04. `messages/create` trusts client-supplied fields [code-confirmed]
`src/app/api/messages/create/route.ts:56-66`:
- `status` comes from the client (a sender can create a message pre-marked `read`/`delivered`).
- `replyToId` is not validated — can point to a message in a *different* conversation (cross-conversation reference leak in UI).
- No max content length (unbounded payloads).
**Fix:** force `status = 'sent'` server-side; validate `replyToId` belongs to the same conversation; cap content length (e.g. 8–16 KB).

### S-05. Inconsistent reliance on RLS vs explicit checks [code-confirmed]
`/api/messages/get` does **no** participant check in the route — it is protected *only* because the repo happens to use the user-scoped client and the `read_messages_in_own_conversations` policy. Other routes (`messages/create`, `pin`, `conversations/join`) use the **service-role** client "to work around RLS mismatches" and re-implement checks by hand (or, in S-01, forget them). This mixed model is how S-01 happened.
**Fix (spec):** one rule — every route resolves the requester profile, performs an explicit participant/company check via a shared helper (`assertParticipant(conversationId, userDbId)`), and only then may use service-role for the mutation. RLS remains defense-in-depth, not the primary gate.

---

## 2. HIGH — Features silently broken end-to-end

### B-01. Mark-as-read is double-broken → unread counts never reset [code-confirmed]
1. **Server:** `src/app/api/conversations/read/route.ts:44` checks `conversation.participants.includes(userId)` where `userId` is the **Supabase UID**, but participants store **DB UUIDs** (the resolver builds them from `users.id`). The check always fails → **permanent 403**. The comment on line 43 ("participants field likely contains Firebase UIDs") is wrong legacy lore — this is the #1 ID-mismatch bug class called out in CLAUDE.md.
2. **Client:** `markConversationAsRead` is exposed by `MessagingContext` (`MessagingContext.tsx:427`) but **no component ever calls it** — opening a conversation never marks it read.
**Consequence:** `unread_count` only ever increments. Badges grow forever.
**Fix:** compare against `userDbId` (already available from `validateUserSession`); call `markConversationAsRead` when a conversation becomes active/visible; add a route test for the participant check using DB IDs.

### B-02. Typing indicators are dead, and implemented twice [code-confirmed]
- `/api/messages/typing/route.ts:44-54` upserts into **`typing_indicators` — a table that does not exist** in the live schema (absent from the `list_tables` dump; no migration creates it). The route swallows the error and returns `success: true`.
- Nothing subscribes to `typing_indicators` anyway.
- A second, parallel implementation exists in `useConversationPresence.ts` using Realtime broadcast on `conversation:{id}` — and `EnhancedMessageComposer.tsx:122` uses the **broken API-based hook** (`useTypingIndicator`), not the broadcast one. `useConversationPresence.sendTypingIndicator` also creates a brand-new channel object per call without subscribing (channel leak).
**Fix (spec):** delete the API route, the `useTypingIndicator` hook, and the DB-based path entirely. Keep ONE implementation: Realtime **broadcast** on the existing conversation channel (per `/supabase-realtime` guidance — typing is ephemeral; it should never touch Postgres). Wire the composer to it.

### B-03. Reaction *removal* never syncs to other clients [code-confirmed]
`realtime_messaging_setup.sql:193-196` — `REPLICA IDENTITY FULL` is commented out, so `DELETE` events on `message_reactions` deliver `payload.old` containing **only the PK `id`**. `useMessageSubscription.ts:441-446` then reads `payload.old.message_id / user_id / emoji` → all `undefined` → `handleReactionUpdate` no-ops. Other clients keep showing a reaction that was removed until refetch. **[needs runtime evidence — confirm replica identity on live DB: `SELECT relreplident FROM pg_class WHERE relname='message_reactions';`]**
**Fix:** `ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;` (tiny table rows, WAL cost negligible) or migrate reaction sync to broadcast.

### B-04. Realtime inserts land in the wrong page of the messages cache [code-confirmed]
The infinite query stores **page 0 = newest** window (`useMessages.ts:101-108` reverses pages for display; optimistic sends append to page 0 at `useMessages.ts:217`). But the realtime handler `appendMessageToCache` (`useMessageSubscription.ts:95-111`) appends to the **last** page — the *oldest* one. With more than one page loaded, incoming messages render in the middle of history, and a sent message can appear **twice** (optimistic replaced in page 0 + realtime copy in the last page; `dedupeMessages` only dedupes within a single page).
**Fix:** make `appendMessageToCache` target page 0 (same as optimistic path), dedupe across **all** pages, and reuse one shared cache-update helper for both paths.

### B-05. `/api/messages/status` silently fails for receivers; three read-tracking systems [code-confirmed]
- The DELIVERED/READ branch updates `messages.status` through the **user-scoped** client (`status/route.ts:17-18,71`), but RLS `update_own_messages` is **sender-only** → the update matches 0 rows; the route still returns `success: true`.
- Design-level: a single `status` column per message can't represent per-recipient read state in group/room conversations.
- The system currently has **three** overlapping read mechanisms: `conversations.unread_count` JSONB (broken, B-01), `messages.status` (broken, this item), and `message_read_receipts` (written on a path no UI triggers). None works.
**Fix (spec):** pick ONE model — recommended: per-user `last_read_at` on a `conversation_members` table (see D-01), derive unread counts by query, drop `messages.status` mutation by receivers and the `unread_count` JSONB. This is the core re-design of Phase 2 below.

### B-06. Conversation realtime is a no-op; 5-second polling is the real sync [code-confirmed]
`useConversationRealtime.ts:25,36-37,48` invalidates TanStack keys `['conversations', userId]` / `['conversation', id]` — **no query uses those keys**; the conversation list lives in `useState` inside `useConversations`. So conversation realtime does nothing, and `MessagingContext.tsx:175-223` compensates by polling `refreshConversations()` every 5 s. The poll effect's deps include `conversationsManager.conversations`, so each poll (new array identity) tears down and recreates the timer, and re-runs the "restore active conversation" effect.
**Fix:** move the conversation list into TanStack Query (key `['conversations', userId]`) so the existing invalidations work, then delete the polling loop. (Conversations *are* in the realtime publication per `20251009_messaging_features_phase3_realtime.sql`.)

### B-07. Stale-closure retry logic in `ensureOpenForMessage` [code-confirmed]
`MessagingContext.tsx:256-257,294` — after `await refreshConversations()`, the code re-reads `conversationsManager.conversations` from the **same render closure**, which never reflects the refresh. Steps 3 and 5 of the retry ladder can only succeed by accident (a concurrent re-render). Fixing B-06 (query cache) fixes this too, since the cache can be read imperatively via `queryClient.getQueryData`.

### B-08. Client/server response-shape mismatches → endpoints that always return empty [code-confirmed]
- `messagingApi.getGroupedConversations` (`messaging-api.ts:836-839`) reads `data.direct`/`data.rooms`, but the route returns `{ grouped: { direct, rooms } }` (`conversations/get/route.ts:120-126`) → always `[]`.
- `messagingApi.getUnreadSummary` (`messaging-api.ts:890-895`) reads `data.totalUnread`, but the route returns `{ summary: {...} }` (`conversations/get/route.ts:74`) → always 0.
Currently no production component calls these (dead-but-broken API surface). Decide: fix the shapes **or delete** both client methods and the route branches.

### B-09. Legacy `/api/conversations/create` has broken DM dedup [code-confirmed]
The route computes a **plaintext** fingerprint `sorted.join(':')` (`conversations/create/route.ts:81-82,116`), but the DB trigger (`20250427_conversation_uniqueness.sql:24`) overwrites it with an **MD5** hash. `findDirectByFingerprint(plaintext)` can never match → dedup always misses → insert hits the unique index → 500 (with the S-02 debug leak). The proper path (`/api/conversations/resolve` + `ConversationResolverService:230-231`) hashes correctly. No client code calls `/create` anymore.
**Fix:** delete the route (mirrors the recent removal of legacy space routes).

---

## 3. MEDIUM — Race conditions, consistency, performance

### M-01. `unread_count` and `participants` use read-modify-write on shared rows [code-confirmed]
`SupabaseConversationRepository.markAsRead` (322-361), `incrementUnreadCount` (388-430), `addParticipant` (432-472) all do fetch → mutate in JS → write back. Two concurrent messages lose increments; two concurrent joins lose a participant. Made worse by `messages/create` doing the increment per message.
**Fix:** atomic SQL (`jsonb_set` with arithmetic in a single UPDATE, `array_append ... WHERE NOT participants @> ...`) or RPC; or eliminated entirely by the D-01 redesign.

### M-02. Archive semantics are split-brain [code-confirmed]
The archive route writes a **per-user preference** (`conversations/archive/route.ts:55`), but `findByUser` filters on the **global** `is_archived` column (`SupabaseConversationRepository.ts:166-168`), and the client optimistically flips the global `isArchived` field (`useConversations.ts:328-334`). Result: archiving hides nothing in the standard list; grouped and standard queries disagree.
**Fix:** filter by the per-user preference in `findByUser` (join already exists), and make the optimistic update target `preferences.isArchived`.

### M-03. Keyset pagination breaks on equal timestamps; redundant probe queries [code-confirmed]
- Cursor is `timestamp` only (`SupabaseMessageRepository.findByConversation:221-236`); messages with identical timestamps (bulk inserts, same-ms sends) can be skipped or duplicated across pages. Use a composite cursor `(timestamp, id)`.
- `messages/get/route.ts:64-110` discards the repo's own `hasMore` (it already fetches `limit+1`) and issues an **extra probe query per request** to recompute `hasMoreOlder`. Return the repo's `hasMore` instead — one query saved on every message fetch.

### M-04. State mutation inside `setConversations` updater [code-confirmed]
`useConversations.updateConversationWithMessage:637` mutates `conversation.unreadCount[key]` where `unreadCount` is still **the same object referenced by previous state** (only the conversation wrapper was shallow-copied). Also `getOrCreateRoomConversation`/`getOrCreateUserConversation` (165-174, 250-262) call `setConversations` purely to *read* state inside the updater — an anti-pattern that breaks under StrictMode double-invoke. Both disappear with the B-06 query migration.

### M-05. MessagingContext value is rebuilt every render; no memo [code-confirmed]
`MessagingContext.tsx:404-447` — the context `value` is a fresh object each render, and the provider re-renders at least every 5 s (poll). Every consumer of `useMessaging()` re-renders constantly. Memoize the value (or split into state/actions contexts) after the polling is removed.

### M-06. Per-conversation channel fan-out + global subscriptions [code-confirmed]
`MessagingContext` subscribes to **one Realtime channel per conversation** (`useMessageSubscription.ts:413-426`) — N channels for N conversations — plus a global `messages:all` channel when the v2 flag is on, plus a global `message_reactions:all` channel. RLS filters rows server-side, but this is heavy on sockets and on the realtime quota.
**Fix (spec):** one channel with `filter: conversation_id=in.(...)` or rely on a single RLS-scoped table subscription; reconcile the "focused vs all" double-hook setup in `MessagingContext.tsx:338-352`.

### M-07. `useMessages` nukes all other conversation caches on every switch [code-confirmed]
`useMessages.ts:56-72` `removeQueries` for every other conversation each time the active conversation changes — defeating TanStack caching (full refetch on every switch back) and racing with the realtime handler that re-seeds those very caches (`appendMessageToCache` creates `{pages:[...]}` skeletons for non-active conversations). Pick one policy: keep caches with a `gcTime`, or scope the realtime append to cached conversations only.

### M-08. `mapRowToMessage` invents fields; UPDATE path resets them [code-confirmed]
`useMessageSubscription.ts:37-49` maps `row.attachments ?? []` — the `messages` table has no such columns, so realtime-delivered messages always show **no attachments** until a refetch. Similarly `SupabaseMessageRepository.update:450-451` returns the message with attachments/reactions emptied — any caller writing that into cache corrupts it.

### M-09. No rate limiting on any messaging mutation [code-confirmed]
`messages/create`, `react`, `typing`, `upload` are all unthrottled. Combined with no content cap (S-04) this is a spam/DoS vector. Add basic per-user rate limits (middleware or Postgres-based counters).

### M-10. `users.unread`-style privacy leak in conversation payloads [code-confirmed]
Every participant receives the full `unread_count` map for **all** participants (serialized in `conversations/get`). Minor, but the D-01 redesign should keep per-user read state private to its owner.

---

## 4. LOW — Hygiene & dead code

| ID | Finding | Location |
|----|---------|----------|
| L-01 | `import set from 'lodash/set'` unused; file header says `src/contexts/messaging/useConversations.ts` but file lives in `src/hooks/` | `useConversations.ts:1,9` |
| L-02 | Huge blocks of commented-out instrumentation | `conversations/get/route.ts` (~60 lines) |
| L-03 | `getOrCreateRoomConversation` in `messaging-api.ts:431-458` fetches the whole conversation list to find a room conv, then resolves anyway — the resolver alone is enough; also duplicated by the hook version | `messaging-api.ts`, `useConversations.ts:142` |
| L-04 | Deprecated `addReaction`/`removeReaction` wrappers; deprecated test file `__tests__/messaging-api.test.ts.deprecated` | `messaging-api.ts:544-553` |
| L-05 | 4 near-identical copies of the attachments/reactions enrichment block (~40 lines each) in `SupabaseMessageRepository` (`findByConversation`, `getUnreadMessages`, `getPinnedMessages`, `getStarredMessages`) — extract one `enrichMessages(messages)` helper | `SupabaseMessageRepository.ts:288-362,641-678,762-793,883-913` |
| L-06 | `findById` runs 5 sequential queries (message, attachments, reactions, pins, stars) — parallelize or select with joins | `SupabaseMessageRepository.ts:130-209` |
| L-07 | Three different auth patterns across routes (`validateUserSession` vs `getUser()+findBySupabaseUid` vs mixed service-role) + recurring false "Firebase UID" comments — standardize on one helper | all routes |
| L-08 | `conversations/preferences` GET does no participant check (leaks only defaults; low) | `preferences/route.ts:11-65` |
| L-09 | Phase-3 migration adds `message_pins`/`message_stars` to the realtime publication, but the live tables are `pinned_messages`/`starred_messages` (renamed in `20251120` refactor) — publication entries are stale; pin/star changes don't sync (no client subscribes today) | `20251009_messaging_features_phase3_realtime.sql:23,27` |
| L-10 | `getUnreadMessages` loads **all** messages of a conversation unbounded | `SupabaseMessageRepository.ts:594-606` |
| L-11 | `useConversations.findByUser` reports `hasMore: true` whenever `items.length === limit` even if the next page is empty | `SupabaseConversationRepository.ts:192-197` |

---

## 5. Root-cause design problems (what the fix plan is built around)

1. **`participants` as a UUID array on `conversations`** forces: read-modify-write races (M-01), JSONB unread counters (B-01/M-01), no per-member metadata (read cursor, role, mute), `contains` queries, and the UID-vs-DB-ID confusion that produced B-01. → Replace with a **`conversation_members` join table** (`conversation_id, user_id, last_read_at, joined_at, archived_at, …`). `conversation_preferences` already proves the pattern and can be folded in or kept alongside.
2. **Conversation list state lives outside TanStack Query** while realtime invalidates query keys → polling band-aid, stale closures, context-wide re-renders (B-06/B-07/M-04/M-05).
3. **Three read-tracking mechanisms, zero working** (B-01, B-05). One model must win.
4. **No single authorization helper** → each route reinvents (or forgets) the participant check (S-01, S-05, B-01).

---

## 6. Other findings outside messaging scope (do not ignore)

### X-01. RLS is DISABLED on core tables — platform-critical [needs runtime verification]
Per the live `list_tables` dump in `migrations/database-structure.md`, `rls_enabled: false` on: **`users`, `companies`, `spaces`, `announcements`, `invitations`, `meeting_notes`, `meeting_note_action_items`, `space_members`, `space_presence_log`, `space_reservations`**.
With default Supabase grants, **anyone holding the publishable anon key (shipped in the JS bundle) can read — and likely write — these tables directly**, bypassing every API route: all user emails/status/locations, company settings, invitations (which contain tokens). This dwarfs everything else in this document.
**Verify immediately** (e.g. anonymous `select` against `users` via the anon key, or `mcp_supabase_get_advisors` security lint), then enable RLS + policies table by table. The presence skill's rules (location updates via service-role routes) already assume server-side authority, so enabling RLS should be low-friction for those flows.

### X-02. `messages.update` RLS policy has no `WITH CHECK`
`update_own_messages` constrains *which rows* a sender can update but not *what values* — a sender can rewrite `conversation_id` of their own message into another conversation. Low exploitability, worth tightening when touching RLS.

---

## 7. Remediation Plan (phased, each phase shippable)

### Phase 0 — Stop the bleeding (security, ~1 day)
1. **S-01**: add authorization to `/api/conversations/join` (room-only + company check). *Test: non-participant join of DM → 403.*
2. **S-02**: strip debug payloads from error responses (or just do B-09's route deletion, which removes the worst offender).
3. **S-04**: force `status='sent'`, validate `replyToId`, cap content length in `messages/create`.
4. **B-09**: delete `/api/conversations/create` (no callers).
5. **X-01**: run the verification query; if confirmed, open a dedicated RLS-enablement task immediately (separate track — touches presence; consult `/presence-safety` before policies on `users`).

### Phase 1 — Make existing features actually work (~2-3 days)
1. **B-01**: fix the UID comparison in `conversations/read`; call `markConversationAsRead` when a conversation is opened/visible. *Test: route test with DB IDs; e2e unread badge clears.*
2. **B-03**: `REPLICA IDENTITY FULL` migration for `message_reactions`. *Verify with two browsers.*
3. **B-04**: realtime insert → page 0 + cross-page dedupe; share one cache-append helper with the optimistic path. *Test: load 2+ pages, receive realtime message, assert ordering and no duplicate.*
4. **B-02**: delete DB/API typing path; wire composer to the broadcast implementation; fix the channel-leak in `useConversationPresence`. (Use `/supabase-realtime` skill when implementing.)
5. **B-08**: delete `getGroupedConversations`/`getUnreadSummary` client methods + route branches, or fix shapes if a consumer is planned.
6. **M-02**: per-user archive filtering in `findByUser` + client optimistic fix.
7. **M-03**: composite `(timestamp, id)` cursor; drop the probe query.

### Phase 2 — Architecture consolidation (the real fix, ~1 week)
1. **Conversations into TanStack Query** (key `['conversations', userId]`): rewrite `useConversations` as `useQuery` + mutations; realtime invalidation (B-06) starts working; delete the 5 s polling, the stale-closure retries (B-07), the `setConversations`-as-reader hacks (M-04); memoize/split `MessagingContext` (M-05).
2. **One read model**: introduce `conversation_members` (`conversation_id, user_id, last_read_at, archived_at, joined_at`), backfill from `participants` + `conversation_preferences`; unread = `count(messages where timestamp > last_read_at)` (server-computed); drop `unread_count` JSONB writes, drop receiver-side `messages.status` mutation (B-05), keep `message_read_receipts` only if per-message receipts are a product requirement.
3. **One authorization helper**: `requireParticipant(conversationId)` used by every route; service-role only after the check (S-05).
4. **Channel topology**: single subscription strategy instead of per-conversation channels + globals (M-06); reconcile with cache policy (M-07).
5. Migration order: ship the table + dual-write → backfill → switch reads → remove old columns. Each step behind its own commit with tests.

### Phase 3 — Hygiene (opportunistic)
L-01…L-11, M-08, M-09 (rate limiting), M-10. Extract `enrichMessages()` (L-05) before any other repo work to shrink the 900-line repository.

### Test gaps to close alongside
- Route-level authz tests: join (S-01), read (B-01), status (B-05) — the current 42 tests cover the resolver and client wrappers, not these paths.
- A realtime cache-merge unit test for `appendMessageToCache` with multi-page data (B-04).
- An e2e "two users chat" Playwright flow (send → receive → react → unreact → mark read) — would have caught B-01/B-03/B-04 outright.

---

## 8. Open questions for the team

1. Is per-message read-receipt UI (✓✓ style) a product requirement, or is conversation-level `last_read_at` enough? (Decides how much of B-05/Phase 2.2 survives.)
2. Is the `messaging_v2` feature flag (`messagingFeatureFlags.isV2Enabled`) still meaningful? It currently toggles the global `messages:all` channel — candidate for removal in Phase 2.4.
3. Should incoming DMs auto-open the drawer (`ensureOpenForMessage` does this today)? Comments in the polling code say auto-open was removed, but the realtime path still does it.
4. `attachments` bucket: any compliance requirement (signed URLs vs public) before Phase 0.3 ships?

**Status: Pending user confirmation** — this is an audit handoff; no production code was modified.
