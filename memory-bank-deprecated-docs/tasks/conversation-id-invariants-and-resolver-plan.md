# Conversation ID Invariants & Resolver — Stabilizing DMs and Rooms

Owner: Platform
Status: Draft for review
Related: messaging-id-unification-and-avatar-menu-plan.md, REALTIME_MESSAGE_INTEGRATION_PLAN.md, operation-clean-slate-messaging-refactor-plan.md

## 1) Scope & Problem Statement
- Problem: Direct messages and room chats do not consistently reuse a single canonical conversation id. Different entry points sometimes create new conversations, breaking history continuity and realtime subscriptions (floor-plan vs debug/chat views).
- Goal: Enforce strict uniqueness so:
  - DM between the same two users always resolves to the same conversation id (WhatsApp mimic).
  - Room chat uses a single conversation id per room forever.
  - All entry points (floor-plan, chat list, debug page, system services) resolve via one server-side path.

## 2) Non-Negotiable Invariants
- Identity: Use database user ids (`users.id`) everywhere in messaging domain.
- DM uniqueness: There is at most one `type = 'DIRECT'` conversation for an unordered pair of user ids {A, B}.
- Room uniqueness: There is at most one `type = 'ROOM'` conversation per `room_id`.
- Resolver-only creation: Conversations can only be created by a dedicated server-side resolver that enforces these constraints atomically.
- Idempotency: Repeated calls to resolve the same target return the same conversation id (no duplicates) under high concurrency.

## 3) Data Model Constraints (DB-Level Guarantees)
Add or verify these Postgres constraints/indexes to guarantee uniqueness at the database level.

### 3.1 DIRECT conversations
- Approach A (preferred): Add a persisted, normalized participants fingerprint and a unique partial index.
  - Column: `participants_fingerprint text GENERATED ALWAYS AS (
      md5(array_to_string(
        (SELECT array_agg(p ORDER BY p) FROM jsonb_array_elements_text(participants) AS p),
        ':'
      ))
    ) STORED`
  - Unique index: `CREATE UNIQUE INDEX uniq_direct_participants_fingerprint
      ON conversations (participants_fingerprint)
      WHERE type = 'DIRECT';`

### 3.2 ROOM conversations
- Unique index: `CREATE UNIQUE INDEX uniq_room_conversation ON conversations (room_id)
    WHERE type = 'ROOM';`

Notes:
- If generated columns are not allowed, compute the fingerprint in the resolver and store as a normal `text` column.
- Keep existing `participants jsonb` with DB user ids.

## 4) Server-Side Conversation Resolver (Single Entry Point)
Create a robust resolver in server code, exposed via an API route, that is the only pathway to create or fetch conversations.

### 4.1 API surface
- `POST /api/conversations/resolve`
  - Body for DM: `{ type: 'DIRECT', userId: '<targetUserDbId>' }`
  - Body for Room: `{ type: 'ROOM', roomId: '<roomId>' }`
  - Returns: `{ conversation: Conversation }`

### 4.2 Authorization
- Validate session via SSR server client. Map auth → DB id.
- DIRECT: requester must equal one of the two participants.
- ROOM: requester must have access to the room (company/space membership rules).

### 4.3 Algorithm (transactional)
- Begin transaction at `SERIALIZABLE` or `READ COMMITTED` with retry on conflict.
- DIRECT
  1) Compute ordered pair `[min(a,b), max(a,b)]` and `participants_fingerprint`.
  2) Try `SELECT` by fingerprint where `type='DIRECT'`.
  3) If found → return. If not → `INSERT` with the same fingerprint and participants.
  4) Handle unique violation by re-`SELECT` and return.
- ROOM
  1) Try `SELECT` by `room_id` where `type='ROOM'`.
  2) If not found → `INSERT` with `type='ROOM'`, `room_id`, and initial participants if policy requires.
  3) On unique violation, re-`SELECT` and return.

### 4.4 RLS posture
- Prefer operating with normal SSR client if RLS permits inserts for authorized users. If not, perform an explicit authorization check (requester is allowed) and then use the service-role client to create/fetch inside the resolver. Log usages; reduce over time by aligning policies.

## 5) Floor-Plan and UI Integration
- Replace all ad-hoc “create or join conversation” code paths with a single `messagingApi.resolveConversation` call.
- Floor-plan avatar “Send Message”:
  - Call `resolveConversation({ type:'DIRECT', userId })` and then `setActiveConversation` with the returned conversation.
- Room panels / on entering a space:
  - Call `resolveConversation({ type:'ROOM', roomId })` and `setActiveConversation`.
- MessagingContext: centralize realtime subscription by `activeConversation.id`. Ensure switching clears previous messages cache before loading new history.

## 6) Migration & Data Repair Plan
- Audit duplicates:
  - DM duplicates: group by sorted participants; keep earliest `created_at` as canonical. Repoint messages from duplicates to canonical conversation id, then delete orphan conversations.
  - Room duplicates: group by `room_id`; same consolidation.
- Provide a one-off SQL script or Node script in `scripts/` to perform migration safely with dry-run mode.
- After repair, add the unique indexes. Run in a maintenance window.

## 7) Tests (Must-Haves)
- Unit
  - Resolver returns same conversation id for the same DM pair across calls.
  - Resolver returns same room conversation id for same room.
  - Concurrent resolves lead to a single row (simulate unique violation retry).
- API
  - Authorization: non-participant cannot resolve DM; room access enforced.
  - RLS: with normal SSR client, authorized resolves succeed; otherwise service-role fallback path (post-authorization) works.
- Integration (Vitest/Playwright)
  - Floor-plan: User A clicks “Send Message” on User B → DM opens; subsequent initiations reuse same id; realtime delivery occurs.
  - Room: Enter room twice, message history continuity preserved; other users in room receive realtime messages.

## 8) Rollout Steps
1) Implement resolver and API route with transaction + retry on unique conflict.
2) Wire all UI entry points (floor-plan avatar menu, DM list, room panels) to call resolver.
3) Add migration scripts to dedupe and then add unique indexes.
4) Add unit + API + integration tests for invariants and idempotency.
5) Toggle feature flag in code to enforce resolver-only creation. Remove legacy creation paths.

## 9) Risks & Mitigations
- RLS mismatches causing insert failures: mitigate with explicit authorization checks then service-role writes; follow up by aligning policies.
- Live duplicates before uniqueness in place: perform data repair first in staging; enable index after verification.
- Cache/subscription mismatches when switching conversations: standardize on clearing `['messages', oldId]` before activating a new conversation; centralize in `MessagingContext`.

## 10) Acceptance Criteria
- Same two users always resolve to the same `DIRECT` conversation id.
- Each room has exactly one `ROOM` conversation id reused everywhere.
- All UI surfaces use resolver; no ad-hoc creation remains.
- Realtime events deliver to the active conversation without duplicates; switching conversations shows correct history.
- Tests pass: unit, API, and key Playwright scenarios for floor-plan and room messaging.

## 11) Implementation Notes (Reuse/Extend)
- Types: reuse `src/types/messaging.ts` Conversation/Message types; no new domain types.
- Repositories: implement resolver via existing repositories; add a small `ConversationResolverService` in server layer.
- Supabase clients: use `createSupabaseServerClient` for SSR; employ service-role only after explicit authorization checks.
- Logging: add structured logs `[ConversationResolver]` with ids and decision path; guard behind env flag.
