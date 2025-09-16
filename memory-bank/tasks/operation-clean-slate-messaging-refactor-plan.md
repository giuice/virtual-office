# Operation Clean Slate: A Robust Refactor of the Messaging System (Condensed)

## 1. Introduction & Goal
- Problem: Messaging instability due to architectural issues (delivery, navigation bugs).
- Goal: Simple, reliable, real-time messaging with clear separation of concerns.
- Audience: Junior-friendly plan with rationale, now compressed for token efficiency.

### Progress Update — 2025-04-27
- ✅ Conversation resolver (DM + room) is live and resolving canonical ids through the API gateway.
- ✅ Database uniqueness hardened via migration `20250427_conversation_uniqueness.sql`, which adds the participants fingerprint trigger and reenables the `DIRECT`/`ROOM` partial indexes.
- ✅ First cross-user DM flow verified end to end (resolver → message CRUD → realtime subscription).
- ⚠️ Remaining UX polish surfaced during testing:
  - DM message lists still render raw sender ids outside the debug page; align with production avatar/name presentation.
  - Floor plan status header lacks unread/badge indicators, so outgoing DMs are invisible to recipients.
  - Closing the direct-message drawer or popover keeps the conversation mounted with blank content; introduce a true close/teardown path.
  - Popup lifecycle should clear view state but retain the selected participant for quick reopen.

These feed into the Phase 3 and Outstanding Tasks sections below.

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
- ✅ Implemented via resolver service + DB trigger/index combo in `20250427_conversation_uniqueness.sql`; treat these constraints as production baseline.

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
- Status: Implemented (minimal test hook + page); used to verify subscriptions. ✅

### Task 1.3 — Create-Message Endpoint
- Status: Using server client, validates `conversationId` + non-empty `content.trim()`; clamps `type`/`status` to enums. ✅
- TODO: Update conversation `lastActivity` once partial updates are supported.

---

## 4. Phase 2 — Core Hooks (Active)
- Task 2.1 — `useMessageSubscription(conversationId)` mirrors INSERT/UPDATE/DELETE into the cache with idempotent writes. ✅ Validate UPDATE/DELETE rendering once edit UI lands.
- Task 2.2 — `useMessages` supplies historical windows and clears stale caches on conversation switch. ✅ Continue to watch memory pressure with many rooms.
- Task 2.3 — `sendMessage` mutation performs optimistic add + reconciliation. ✅ Review failure UX (status badges) after notification work.
- Task 2.4 — Notifications/unread: pending (no toast/badge yet). Needs integration with floor-plan header + DM drawer badges.

Note: Hook behavior assumes a single canonical conversation id per DM/room. This is guaranteed by the Conversation Resolver described below.

---

## 5. Phase 3 — UI Interaction (Condensed)
- Implemented Click-Stop Standard (see `/.github/copilot-instructions.md`).
- Touched: `SpaceElement`, `UserAvatarPresence`, `UserInteractionMenu` — portal guards + `data-avatar-interactive` + propagation stops.
- Outstanding UI Tasks (2025-04-27):
  1. Message rendering parity — reuse shared avatar/name utilities in DM/room views (floor plan drawer, MessagingDrawer) to replace raw ids.
  2. Floor plan awareness — surface unread counts or badges in the status header when new DMs arrive.
  3. Drawer teardown — implement a close handler that clears `activeConversation`/`lastDirectConversation` so the drawer fully collapses when users click “×”.
  4. Popup lifecycle — closing the DM dialog should clear UI state but keep the resolved participant handy for quick reopen.
  5. Recipient alerting — wire unread counts + toast/badge notifications once Phase 2 Task 2.4 is complete.

---

## 6. Deprecation & Cleanup (Planned)
- Remove temporary realtime test and legacy realtime hooks after new subscription hook lands.
- Search and remove dangling imports/usages post-deprecation.

---

## 7. Final Verification (Concise)
- No teleport when interacting with messaging actions inside spaces.
- Send shows instantly (optimistic); recipient sees realtime arrival.
- Toast/desktop notification on unread (when not active); clicking opens and clears. ⚠️ Pending Task 2.4 / Outstanding UI Task 5.
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

## Implementation — Messaging Resolver & Realtime
- `POST /api/conversations/resolve` (`src/app/api/conversations/resolve/route.ts`) authenticates with the SSR client, validates payloads, and dispatches to `ConversationResolverService` with a service-role repository for writes. The resolver covers DIRECT fingerprints and ROOM lookups, retries on `23505`, and enforces company/ACL rules (`src/lib/services/ConversationResolverService.ts`).
- Entry points now funnel through `messagingApi.resolveConversation`: conversation hooks (`src/hooks/useConversations.ts`) power `UserInteractionMenu`, the floor-plan message dialog, ChatWindow openers, and the auto room binding hook (`src/hooks/useAutoRoomConversation.ts`). The debug harness creates sessions with resolver-backed calls (`src/app/debug/messaging-test/page.tsx`).
- Database uniqueness is enforced via trigger + indexes in `src/migrations/20250427_conversation_uniqueness.sql`, with repository writes supplying `participantsFingerprint` (`SupabaseConversationRepository`).
- `useMessageSubscription` processes INSERT/UPDATE/DELETE into the paginated cache (`src/hooks/realtime/useMessageSubscription.ts`), and `MessagingContext` mounts a single subscription for the active conversation (`src/contexts/messaging/MessagingContext.tsx`), keeping legacy `useMessageRealtime` flagged for removal.
- Unread UX pulls from `conversation.unreadCount`: optimistic mark-as-read + total badge in `useConversations` and rendered counters in `src/components/messaging/conversation-list.tsx`.
- Debug join UX offers a explicit join-by-id control that hits the join API and syncs the global active conversation (`src/app/debug/messaging-test/page.tsx`).
- Tests cover resolver idempotency and conflict handling in `__tests__/conversation-resolver.test.ts`; realtime subscription cache specs remain a future addition.

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
