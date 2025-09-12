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

## Progress Update — 2025-09-12

Completed
- API `GET /api/messages/get`: added `cursorBefore`/`cursorAfter`, initial last-N via DESC + reverse, legacy offset path preserved.
- Repository `SupabaseMessageRepository.findByConversation`: keyset-by-timestamp with `lt/gt`; reverse for `cursorBefore`; offset fallback kept.
- Client API `messagingApi.getMessages`: accepts new cursors; normalizes `timestamp` to `Date`.
- Hook `useMessages`: uses keyset pagination, `nextCursorBefore`, and removes inline realtime logic.
- Create-message API: trims content, rejects empty; clamps `type`/`status` to enums; TODO for `lastActivity`.
- UI Interaction (Click-Stop Standard): implemented guards in `SpaceElement`; marked `UserAvatarPresence` and `UserInteractionMenu` as interactive; stopped propagation for Radix portal content and items. Documented in `/.github/copilot-instructions.md`.

Next
1) Realtime: implement `src/hooks/realtime/useMessageSubscription.ts` to append/merge events into the cache, dedup by `id`, and handle edits/deletes.
2) Migrate any remaining consumers to keyset semantics (`nextCursorBefore`/`hasMoreOlder`) and prepend on older loads.
3) Conversation `lastActivity`: add repository support for partial updates; update on message creation.
4) Unread counts: update `conversations.unread_count` on insert/read and render badges; wire to notifications.
5) Tests: unit tests for repository keyset/route; UI tests for paging and click-stop (no teleport on menu actions).
6) UI Migration (future): plan shadcn → DaisyUI while preserving `data-avatar-interactive` and portal event-stopping contracts.

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

