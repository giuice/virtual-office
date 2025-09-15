# Operation Clean Slate: A Robust Refactor of the Messaging System (Condensed)

## 1. Introduction & Goal
- Problem: Messaging instability due to architectural issues (delivery, navigation bugs).
- Goal: Simple, reliable, real-time messaging with clear separation of concerns.
- Audience: Junior-friendly plan with rationale, now compressed for token efficiency.

## 2. Guiding Principles
- Simplicity: Prefer clear, minimal solutions.
- Separation: History fetch vs realtime subscribe vs UI are distinct.
- Source of truth: React Query cache holds normalized message data.
- Docs-first: Follow current official docs; avoid stale patterns.

## Data Insights (DB)
- IDs: Use internal `users.id` everywhere (not auth.uid).
- System messages: `sender_id` nullable → render special style, no avatar.
- Unread: Use `conversations.unread_count` (jsonb) for per-user counts.

### Conversation ID Invariants (Critical)
- DM uniqueness: Exactly one `DIRECT` conversation per unordered user pair {A, B}. Enforce via a server-side resolver and DB uniqueness. See `memory-bank/tasks/conversation-id-invariants-and-resolver-plan.md`.
- Room uniqueness: Exactly one `ROOM` conversation per `room_id` reused everywhere.
- Resolver-only creation: All UI entry points (floor-plan, chat, debug) must resolve via a single API endpoint; no ad-hoc creation in components.

---

## 3. Phase 1 — Foundation (Condensed)

### Updated References (Condensed)
- Realtime: In Client Components, use `channel.on('postgres_changes', ...)` + cleanup `removeChannel` in `useEffect`.
- Filters: Specify `{ schema, table, event }`; narrow scope as needed.
- Auth/SSR: Use `@supabase/ssr` (or auth-helpers) middleware to refresh sessions for SSR/API.

### Findings and Learned (Key Points)
- Use `postgres_changes` (modern API); manage channels with cleanup.
- Server fetch initial data; client subscribes to new events.
- Always normalize timestamps to `Date` at the query layer.

### Functional Spec (Condensed)
- Conversations: types (`DIRECT`, `ROOM`, `GROUP`), participants by `users.id`, sort by `lastActivity`.
- Messages: per conversation; `senderId` may be `null`; render ASC by `timestamp`.
- Pagination (keyset by `timestamp`):
  - Initial: select last N DESC; client reverses to ASC for render.
  - Older: `cursorBefore` → `timestamp < cursorBefore` DESC; client reverses and prepends.
  - Newer (optional): `cursorAfter` → `timestamp > cursorAfter` ASC; client appends.
- Realtime: Subscribe per conversation; dedupe by `id`; handle INSERT now, UPDATE/DELETE later.

### Immediate Fix — Historical Messages
- Status: Implemented via keyset pagination end-to-end.
- Behavior: Last N visible on open; older pages prepend; sending uses optimistic update.

### Task 1.2 — Realtime Sanity Test
- Status: Implemented (minimal test hook + page); used to verify subscriptions.

### Task 1.3 — Create-Message Endpoint
- Status: Using server client, validates `conversationId` + non-empty `content.trim()`; clamps `type`/`status` to enums.
- TODO: Update conversation `lastActivity` once partial updates are supported.

---

## 4. Phase 2 — Core Hooks (Active)
- Task 2.1: Build `useMessageSubscription(conversationId)` to write INSERTs into cache, dedupe by `id`; plan for UPDATE/DELETE.
- Task 2.2: `useMessages` focuses on history (already refactored); in UI call both `useMessages` and `useMessageSubscription`.
- Task 2.3: Sending: `useMutation` + optimistic add; replace by `id` on confirm.
- Task 2.4: Notifications/unread: toast on unread increments for non-active convo; desktop notifications optional; badges from `unread_count`.

Note: Hook behavior assumes a single canonical conversation id per DM/room. This is guaranteed by the Conversation Resolver described below.

---

## 5. Phase 3 — UI Interaction (Condensed)
- Implemented Click-Stop Standard (see `/.github/copilot-instructions.md`).
- Touched: `SpaceElement`, `UserAvatarPresence`, `UserInteractionMenu` — portal guards + `data-avatar-interactive` + propagation stops.

---

## 6. Deprecation & Cleanup (Planned)
- Remove temporary realtime test and legacy realtime hooks after new subscription hook lands.
- Search and remove dangling imports/usages post-deprecation.

---

## 7. Final Verification (Concise)
- No teleport when interacting with messaging actions inside spaces.
- Send shows instantly (optimistic); recipient sees realtime arrival.
- Toast/desktop notification on unread (when not active); clicking opens and clears.
- Project passes `npm run lint` and `npm run type-check`.

---

## Findings — 2025-09-13 (Joined from Debugging)
- Dev noise: 404s for `/_next/src/*` and `/src/*` seen during dev (Next dev overlay/source-maps). Mitigated by excluding these in `middleware` matcher.
- Presence logs: `useUserPresence` initialized with `userId: undefined` when outside a space. Benign during messaging debug.
- Join flow: Adding a participant to a conversation can be blocked by RLS. Solution: use server-side Supabase service client for the participant update; keep normal auth for user context.
- Realtime: Subscription filter stable with `conversation_id=eq.<id>`. Cache writes append to the last page; dedupe by `id`. Timestamps normalized to `Date`.
- Message create: After insert, update `conversations.lastActivity` and increment `unread_count` for non-senders. These failures are non-fatal and logged.

---

## Progress Update — 2025-09-13
- API `POST /api/messages/create`: now also updates `lastActivity` and increments `unread_count`.
- API `POST /api/conversations/join`: uses service-role client for RLS-safe participant add; 404 if conversation missing; improved errors.
- Middleware: matcher excludes `/_next/*`, `__nextjs`, and `/src/*` to reduce dev noise.
- Hook `useMessageSubscription`: implemented for INSERT; wired into ChatWindow; deprecate legacy `useMessageRealtime` (migration pending).
- Context wiring: plan to centralize subscription in `MessagingContext` to avoid duplicate per-component subscriptions (pending).

---

## TODO — Next Session (Prioritized)
0) Conversation resolver and uniqueness (Top priority):
  - Implement `POST /api/conversations/resolve` (transactional, idempotent). DIRECT: resolve by participants fingerprint; ROOM: resolve by `room_id`. Authorize with SSR; if RLS blocks inserts, validate then use service-role for creation.
  - Wire all entry points (floor-plan avatar menu, room panels, debug page, ChatWindow openers) to call `messagingApi.resolveConversation` and then `setActiveConversation`.
  - Add DB uniqueness: unique index on `room_id` for `type='ROOM'`; participants fingerprint unique partial index for `type='DIRECT'` (or computed in resolver). Prepare one-off data repair script to consolidate duplicates before enabling indexes.
  - Reference: `memory-bank/tasks/conversation-id-invariants-and-resolver-plan.md`.

1) Realtime cache completeness:
   - Extend `useMessageSubscription` to handle UPDATE and DELETE: update message fields (`content`, `status`, `isEdited`, `reactions`), and remove on DELETE. Maintain pagination cache shape.

2) Subscription centralization:
   - Wire `useMessageSubscription` in `MessagingContext` for the active conversation; ensure no duplicate subscriptions exist. Migrate remaining consumers from `useMessageRealtime`.

3) Unread UX:
   - Conversation list badge: read from `conversations.unread_count[userId]`.
   - Clear on read: on conversation focus, call API to zero unread for current user; update cache optimistically.

4) Debug join UX:
   - On `src/app/debug/messaging-test/page.tsx`, add a small "Join by Conversation ID" input + button that calls the join API. Show success/error.

5) Tests (Vitest/Playwright):
  - Unit: `useMessageSubscription` cache updates (INSERT/UPDATE/DELETE). Resolver idempotency under concurrency.
  - API: messages/create updates `lastActivity` and unread; conversations/join respects RLS via service client; conversations/resolve enforces uniqueness and authorization.
  - E2E (dev): two-browser realtime delivery for DM and room via resolved conversation ids; repeated opens reuse same id.

6) Cleanup:
   - Remove deprecated `useMessageRealtime` after migration.
   - Verify middleware matcher in prod build; ensure no legit routes are excluded.

7) Docs:
   - Update any developer README snippets for messaging flow, cache keys, and subscription policy.

---

## Quick Verification Steps
- Commands:
  - `npm run type-check`
  - `npm run lint`
  - `npm run dev`
- Manual:
  - Open two sessions. For DM: use avatar menu to “Send Message” → verify the same conversation id is reused across attempts and messages deliver in realtime. For room: enter the same room in both sessions, verify a single room conversation id is used and realtime delivery works. Confirm lastActivity bumps and unread increments for non-active users.

# APPENDICE
## Updated References

### Subscribing to Realtime Changes in a Next.js Client Component

This is the core pattern for receiving realtime updates in the browser.

```tsx
'use client'

import { useEffect, useState } from 'react'
import supabase from '../../utils/supabase' // Note: We will use our browser client

export default function RealtimePosts({ serverPosts }: { serverPosts: any }) {
  const [posts, setPosts] = useState(serverPosts)

  useEffect(() => {
    setPosts(serverPosts)
  }, [serverPosts])

  useEffect(() => {
    const channel = supabase
      .channel('*')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) =>
        setPosts((posts: any) => [...posts, payload.new])
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [serverPosts])

  return <pre>{JSON.stringify(posts, null, 2)}</pre>
}
```

### General Realtime Subscription Syntax

The `postgres_changes` event is the modern way to listen for database changes.

```typescript
const userListener = supabase
  .channel('public:user')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'user' }, (payload) =>
    handleAllEventsPayload()
  )
  .subscribe()
```

### Middleware for Session Management

Ensuring the user's session is refreshed is critical for Server Components and authenticated requests.

```typescript
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // Create a Supabase client configured to use cookies
  const supabase = createMiddlewareClient({ req, res })

  // Refresh session if expired - required for Server Components
  await supabase.auth.getSession()

  return res
}
```

