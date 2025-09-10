# Messaging ID Unification + Avatar Menu — Junior Dev Plan

Owner: Platform
Status: In progress — core hooks refactored; UI/menu wired
Scope: Messaging (hooks, APIs, repos), Floor-plan avatar interactions, Realtime/UI wiring

## Goals
- Fix identity mismatches by standardizing on Database User ID (`users.id`) across messaging domain (participants, `sender_id`, `user_id`).
- Ensure Realtime updates are reflected in the UI (React Query vs local state alignment).
- Restore “Send Message” interaction on floor-plan avatars using existing canonical components.
- Keep Supabase UID (`auth.users.id`) at authentication boundaries only; map to DB ID server-side for RLS.

## Canonical Identity Decision
- Canonical domain ID: Database User ID (`users.id`).
- Supabase UID usage: Auth only and RLS mapping via `users.supabase_uid`.
- Naming convention: `userDbId` for DB UUID, `supabaseUid` for auth UID.

## What You’ll Change (High-Level)
1) Hooks to use DB IDs:
   - `src/hooks/realtime/useConversationRealtime.ts`
   - `src/hooks/useConversations.ts`
2) API routes to validate DB IDs and use server Supabase client:
   - `src/app/api/messages/typing/route.ts`
   - `src/app/api/messages/status/route.ts`
   - `src/app/api/messages/upload/route.ts`
3) Realtime/UI alignment for messages:
  - `src/hooks/useMessages.ts` (consume React Query via `useInfiniteQuery`)
  - `src/hooks/realtime/useMessageRealtime.ts` (verify cache keys used by UI)
4) Floor-plan avatar interactions:
   - Integrate `InteractiveUserAvatar` or menu wrapper where `ModernUserAvatar` is rendered.
5) Repositories remain DB-ID centric (verify):
   - `src/repositories/*` (no functional change if already DB IDs; just confirm)
6) RLS presence policy correction (migration):
   - Ensure policies map `auth.uid()` → `users.supabase_uid`, not `users.id` direct.

## File-by-File Checklist (Exact Paths + Expected Edits)

Legend: [x] done, [ ] pending

### 1) useConversationRealtime (DB ID) — [x]
File: `src/hooks/realtime/useConversationRealtime.ts`
- Current: Hook receives `userId?: string` (coming from `useAuth().user?.id`, a Supabase UID) and does `participants.includes(userId)`.
- Change: Pass the DB ID instead. Source DB ID from caller (see `useConversations.ts`). No functional logic changes beyond comparing DB IDs.
- Acceptance: Conversation list invalidates/updates when any participant (by DB ID) receives INSERT/UPDATE/DELETE events.

### 2) useConversations (DB ID everywhere) — [x]
File: `src/hooks/useConversations.ts`
- Current:
  - Calls `useConversationRealtime(user?.id)` (Supabase UID).
  - Uses `user.id` in `participants` arrays and comparisons.
- Change:
  - Retrieve DB ID from `CompanyContext.currentUserProfile?.id`.
  - Pass DB ID into `useConversationRealtime` and use it for `participants` and comparisons.
  - When creating conversations: `participants: [currentUserDbId, otherUserDbId]`.
- Acceptance: Direct and room conversations include DB IDs; no mixed-ID comparisons remain.

### 3) messages/typing API (DB ID + server-client) — [x]
File: `src/app/api/messages/typing/route.ts`
- Current:
  - Uses `validateUserSession()` but compares `conversation.participants.includes(userId)` (Supabase UID) and writes `typing_indicators.user_id` with Supabase UID.
  - Uses `createRouteHandlerClient` (browser helper) in API route.
- Change:
  - Compare with `userDbId` and write `typing_indicators.user_id = userDbId`.
  - Use `createSupabaseServerClient()` (SSR server client) per repo rules.
- Acceptance: Non-participants (by DB ID) rejected; typing indicator rows written with DB ID.

### 4) messages/status API (participant validation with DB ID) — [x]
File: `src/app/api/messages/status/route.ts`
- Current: For READ/DELIVERED compares participants with Supabase UID; sender checks use DB ID already.
- Change: Compare conversation participants with `userDbId` instead of Supabase UID. Use server client consistently where needed.
- Acceptance: Only participants (DB ID) can mark messages delivered/read; sender DB ID remains for SENT/FAILED checks.

### 5) messages/upload API (DB ID validation) — [ ]
File: `src/app/api/messages/upload/route.ts`
- Current: Validates `conversation.participants.includes(userId)` (Supabase UID).
- Change: Validate with `userDbId`. Continue storage logic unchanged.
- Acceptance: Only participants by DB ID can upload; behavior unchanged otherwise.

### 6) Realtime/UI alignment for messages — [x]
Files:
- `src/hooks/realtime/useMessageRealtime.ts`
- `src/hooks/useMessages.ts`
- Current: Realtime writes to React Query cache key `['messages', conversationId]` but UI hook renders local state, so realtime updates don’t show.
- Options (pick one and apply consistently):
  A) Render from React Query (preferred): Update `useMessages` to use `useInfiniteQuery` keyed by `['messages', conversationId]` and let the realtime hook mutate that cache.
  B) Keep local state: Update `useMessageRealtime` to call an injected setter from `useMessages` (avoid duplicate caches).
- Acceptance: When a new message arrives via Realtime, it appears in the active chat without manual refresh.

### 7) Floor-plan avatar interaction menu — [x]
Files:
- `src/components/floor-plan/modern/ModernUserAvatar.tsx` (render site)
- Integration points where floor plan lists/users are rendered.
- Change: Wrap avatar with the existing `InteractiveUserAvatar` or render `UserInteractionMenu` on click.
  - Reuse canonical components: `src/components/messaging/InteractiveUserAvatar.tsx` and `UserInteractionMenu.tsx`.
  - Ensure the click/trigger surfaces are accessible and don’t break tooltips.
- Acceptance: Clicking another user shows a menu with “Send Message” (opens/creates conversation) and other actions.

### 8) Repositories verification (DB IDs) — [x]
Files: `src/repositories/*`
- Action: Confirm interfaces and implementations accept and store DB IDs for participants/senders. Keep `findBySupabaseUid()` only as boundary helper.
- Acceptance: No repository APIs require Supabase UID for domain relations.

### 9) Presence RLS correction (migration) — [ ] as-needed
Files: `src/migrations/*` and new migration file
- Action: Ensure RLS policies use `auth.uid()` mapped via `users.supabase_uid`; do not compare `users.id = auth.uid()`.
- Deliver: Add a new migration that fixes the presence/messaging-related policies if any mismatch remains.
- Acceptance: Policies compile; tests confirm authorized access with correct mapping.

## Coding Notes
- Server code and API routes: use `createSupabaseServerClient()` from `src/lib/supabase/server-client.ts` (never the browser client). SSR cookie adapter updated to `getAll`/`setAll` per `@supabase/ssr`.
- `validateUserSession()` now uses the SSR server client; it returns `{ supabaseUid, userDbId }` and should be the sole source for identity in API routes.
- Get current IDs in APIs: use `validateUserSession()` to obtain `{ supabaseUid, userDbId }`.
- Types: Reuse `src/types/messaging.ts` and `src/types/database.ts`. Do not invent parallel types.
- Naming: Use `userDbId` and `supabaseUid` in code; avoid ambiguous `userId`.

## Step-by-Step Implementation Order (Suggested)
1) Decide canonical ID (already done here: DB ID).
2) Hooks: `useConversations` and `useConversationRealtime` to DB ID.
3) APIs: fix `typing`, `status`, `upload` to DB ID + server client.
4) Realtime/UI: align `useMessages` with `useMessageRealtime` cache.
5) Avatar menu: integrate `InteractiveUserAvatar` on floor plan.
6) Repos audit: confirm DB ID usage.
7) Migration: presence RLS fix if needed.
8) Tests: unit + Playwright, then manual verification.

## Quick Status Summary (2025-09-09)
- Done:
  - Hooks migrated to DB ID: `useConversations` now uses `CompanyContext.currentUserProfile.id`; `useConversationRealtime` treats `userId` as DB ID and invalidates `['conversations', userDbId]` and `['conversation', id]` on INSERT/UPDATE/DELETE.
  - Cache keys standardized to DB ID. No Supabase UID usage remains in these hooks.
  - Type-check on modified files passed; repositories already DB-ID centric.
  - Supabase SSR client aligned with latest API: `src/lib/supabase/server-client.ts` now uses `cookies.getAll/setAll`.
  - `validateUserSession()` migrated to use the SSR server client (no `createRouteHandlerClient`), keeps return `{ supabaseUid, userDbId }`.
  - API routes updated to DB ID + server client:
    - Typing: `src/app/api/messages/typing/route.ts` validates participants via `userDbId` and writes `typing_indicators.user_id = userDbId` using SSR client.
    - Status: `src/app/api/messages/status/route.ts` validates participants via `userDbId` and uses SSR client for conversation checks.
- Next:
  - Finish messages/upload API DB-ID validation.
  - Resolve event propagation so menu opens even inside clickable space cards.
  - Remove duplicate components (see Anti-Duplication below).
  - Add a global DM drawer surface to show DMs after `setActiveConversation`.
  - Add unload/heartbeat presence cleanup.

## Pending Work
– API: complete `messages/upload` DB-ID validation.
– Floor-plan: stop event propagation on avatar/menu triggers; guard space-card `onClick`.
– Messaging UI: add `MessagingDrawer` mounted in `src/app/layout.tsx` to render DMs when `activeConversation` is direct.
– Presence: add `sendBeacon` on unload/pagehide and heartbeat.
– RLS: add migration only if tests surface policy gaps.

## Anti-Duplication (Remove Duplicates)
- Keep canonical:
  - `src/components/messaging/message-feed.tsx` + `RoomMessaging` for room chat
  - `src/components/messaging/MessageList.tsx` and `message-item.tsx`
  - `src/components/messaging/message-composer.tsx` (keep; fold enhancements as needed)
  - `src/components/messaging/conversation-list.tsx` (feature-rich, context-aware)
- Duplicates to remove/deprecate:
  - `src/components/messaging/ConversationList.tsx` (older placeholder) → remove; replace imports with `conversation-list.tsx`.
  - Nested `MessagingProvider` in `src/components/floor-plan/room-chat-integration.tsx` → remove; use root provider only.
  - Prefer one composer: if both `EnhancedMessageComposer.tsx` and `message-composer.tsx` overlap, standardize on `message-composer.tsx` for now.

Action items (junior-friendly):
1) Search references to `ConversationList` (PascalCase file) and replace with lowercase `conversation-list.tsx` export.
2) Delete `src/components/messaging/ConversationList.tsx` after refs updated.
3) Edit `room-chat-integration.tsx` to remove its `MessagingProvider` wrapper.
4) Ensure only one composer is used by message UIs; remove dead imports of the other.

## Next Steps (Follow Up  )
1) Event handling on avatars
  - Files: `src/components/messaging/InteractiveUserAvatar.tsx`, `src/components/floor-plan/modern/AvatarGroup.tsx`, `src/components/floor-plan/modern/ModernSpaceCard.tsx`
  - Do: Add `onMouseDown/onPointerDownCapture/onClick` handlers that call `e.stopPropagation()` on the avatar/menu trigger; in `ModernSpaceCard`, ignore clicks when `event.target.closest('[data-avatar-interactive]')` returns a node.
  - Accept: Clicking an avatar opens the menu and does NOT enter the space.

2) Complete upload API DB-ID validation
  - File: `src/app/api/messages/upload/route.ts`
  - Do: Use `createSupabaseServerClient()`; map auth → DB via repository; validate `participants.includes(userDbId)`.
  - Accept: Only conversation participants can upload.

3) DM drawer surface
  - Files: new `src/components/messaging/MessagingDrawer.tsx`; mount in `src/app/layout.tsx` beneath `CallNotifications`.
  - Do: If `useMessaging().activeConversation?.type === DIRECT`, render `ChatWindow` and a close control.
  - Accept: After “Send Message”, the DM drawer appears without navigating.

4) Presence cleanup
  - File: `src/hooks/useUserPresence.ts`
  - Do: Add `beforeunload/pagehide` handlers to send a `navigator.sendBeacon` to `/api/users/location` with `{ userId, spaceId: null }`. Add a 60s heartbeat to update `lastActive`.
  - Accept: Closing the tab clears presence within a short grace window.

5) Tests
  - Vitest: unit tests for `useMessages` cache updates, `useConversations` DB-ID comparisons.
  - Playwright: avatar menu opens without navigating; DM drawer opens and sends a message; room chat loads and posts; presence clears after closing.

## Acceptance Criteria
- Direct and room conversations store and compare DB IDs only.
- Sending a message in a space is received by other users in that space.
- Realtime message appears in the UI without refresh.
- Floor-plan avatar click shows user interaction menu; “Send Message” opens/creates a DM.
- API routes reject non-participants based on DB IDs and operate with server client.
- All tests pass: unit, integration, E2E.

## Testing Guide
Commands:
```bash
npm run type-check
npm run lint
npm run test
npm run test:e2e  # if configured, otherwise use Playwright UI
```

Unit/Integration (Vitest):
- Add/adjust tests to assert DB ID usage in `participants`, `senderId`, and API validation.
- Verify `useConversationRealtime` updates caches when conversations change.
- Verify `useMessages` renders from React Query or correctly receives realtime pushes.

Playwright (E2E):
- Scenario 1: User A and User B in same space — A sends a space message; B sees it live.
- Scenario 2: A clicks B’s avatar on floor plan → “Send Message” → DM opens; both can exchange messages live.
- Scenario 3: Unauthorized user cannot send typing indicators or upload attachments to a conversation they’re not in.

Manual Checks:
- Inspect network calls to ensure API routes are hit and return 2xx.
- Verify Supabase Realtime subscriptions connect and receive payloads.

## Rollback Plan
- Changes are mostly client and API logic; keep commits small and feature-scoped.
- If migration alters RLS, deploy in a separate step with verification. Keep a revert migration ready.

## Time Estimates (per junior dev)
- Hooks (useConversations/useConversationRealtime): 0.5 day
- APIs (typing/status/upload): 0.5–1 day
- Realtime/UI alignment: 0.5 day
- Avatar menu integration: 0.5 day
- Repos audit + small fixes: 0.5 day
- Tests + stabilization: 0.5–1 day

## Gotchas
- Don’t use browser Supabase client in API routes; use server client.
- Ensure presence/messaging RLS compares via `users.supabase_uid` mapping.
- Keep cache keys consistent between realtime and UI.
- Avoid mixing Supabase UID and DB ID in the same array.

## References
- Architecture snapshot and rules: `./.github/copilot-instructions.md`
- Supabase server client: `src/lib/supabase/server-client.ts`
- Auth session mapping: `src/lib/auth/session.ts`
- Canonical avatar components: `EnhancedAvatarV2`, `UploadableAvatar`
- Messaging components: `InteractiveUserAvatar`, `UserInteractionMenu`

# [LESSONS LEARNED]
- Centralize identity: Use Database User ID end-to-end in the domain; restrict Supabase UID to auth/RLS boundaries via a single mapping helper (`validateUserSession`).
- Single source of truth for lists: Drive UI from React Query caches that realtime updates; avoid parallel local state for the same dataset.
- API route hygiene: Never use browser clients in server routes; always use the SSR Supabase client to satisfy RLS and session context.
- Consistent cache keys: Align hooks and realtime on shared keys (e.g., `['conversations', userDbId]`, `['messages', conversationId]`) to ensure invalidations work predictably.
- Incremental refactors: Start with hooks (client identity), then APIs (server validation), then realtime/UI wiring; this isolates risk and keeps behavior verifiable.

---

## NEWLY DISCOVERED REGRESSIONS (2025-09-10)

### 1. Avatar Interaction Menu Not Displaying
**Symptoms**: Clicking another user's avatar on the floor plan does nothing (no dropdown / menu). Navigation suppression works (space not entered), but menu trigger absent.
**Observed State**: `ModernUserAvatar` wraps `InteractiveUserAvatar`; propagation handlers previously blocked `pointerdown` & `mousedown` (now reduced to `click` only). Still no menu.
**Suspected Causes**:
- Radix `DropdownMenuTrigger` not receiving pointer events due to wrapping structure or missing focusable element.
- The child passed into `UserInteractionMenu` may not forward ref / proper trigger semantics (needs `asChild` with a button or interactive element).
- Identity check in `UserInteractionMenu` (`currentUser?.id === user.id`) may compare Supabase UID vs DB ID mismatch, prematurely bypassing menu wrapper.
**Impact**: Core UX (messaging initiation) blocked; plan goal unmet.
**Next Steps (Planned)**:
1. Inspect `useAuth().user.id` vs `UserInteractionMenu.user.id` to confirm mismatch.
2. Convert avatar trigger to explicit `button` element with `type="button"` & `data-avatar-interactive`.
3. Add temporary debug logs inside `UserInteractionMenu` to confirm early return path.
4. If ID mismatch: inject DB ID into AuthContext or derive current DB ID from `CompanyContext` inside menu.

### 2. Room Chat Not Working / No Realtime Delivery
**Symptoms**: Room chat panel opens but: (a) messages not created or not visible to others; (b) switching rooms retains old messages; (c) realtime events absent.
**Observed State**: `MessageFeed` previously only initialized conversation on first mount (fixed to re-run on `roomId` change, but still failing). `useAutoRoomConversation` now sets active conversation yet realtime subscription may not resubscribe.
**Suspected Causes**:
- Realtime subscription uses `conversationId` but stale `activeConversation` persists due to race between auto-creation and manual initialization.
- Conversation creation via `messagingApi.createConversation` may not persist expected `roomId` or participants, leading to authorization failures (RLS drop of messages on insert).
- Upload / send APIs might still pass mixed IDs causing server rejection silently (unhandled error path in UI).
- Missing invalidation / `queryClient.removeQueries(['messages', oldId])` when switching rooms causing UI to show stale cache pages.
**Impact**: Core room messaging unusable; realtime objective unmet.
**Next Steps (Planned)**:
1. Add defensive log in `useMessageRealtime` for subscription status + payload counts per room switch.
2. Force message cache reset on `roomId` change: `queryClient.removeQueries({ queryKey: ['messages', previousId] })` before setting new conversation.
3. Verify backend conversation record (roomId, participants DB IDs) via temporary diagnostic API call or SQL (if allowed) to ensure correct row shape.
4. Add explicit error surfaced in UI when `sendMessage` promise rejects.
5. Add test harness (Vitest) to simulate conversation switch and assert new subscription.

### 3. Identity Consistency Risk Inside Interaction Components
**Symptoms**: Conditional logic that hides menu for current user may trigger for all users if comparing different ID domains.
**Suspected Causes**: `useAuth()` returns Supabase auth UID; avatar/menu provided a DB ID. Without mapping, equality false positives.
**Next Steps**: Centralize `currentUserDbId` retrieval in `UserInteractionMenu` via `CompanyContext` and compare DB IDs explicitly.

### 4. Missing Explicit Loading / Error Feedback in Room Chat
**Symptoms**: Silent failures leave empty UI with no user guidance.
**Next Steps**: Add inline state banners (loading, error) & a retry action for conversation init.

### Temporary Mitigation Plan
- Insert structured debug logs (prefixed `[MessagingDebug]`) for: conversation creation, activeConversation changes, realtime subscription lifecycle, avatar menu suppression path.
- After capture, remove logs behind feature flag `process.env.NEXT_PUBLIC_DEBUG_MESSAGING`.

### Risk Assessment
- High risk of continued confusion without test coverage for multi-room switching & avatar menu triggers.
- Potential RLS misconfiguration still unverified for messaging tables with DB ID participants.

### Proposed Additional Acceptance Criteria
1. Avatar menu opens within 150ms click on non-self user across at least 3 different floor plan contexts.
2. Switching between 2 distinct rooms clears prior messages and loads only new room's history within 500ms (network permitting).
3. Realtime INSERT for a room conversation triggers cache update exactly once (no duplicates) verified by message ID count.
4. No console errors in happy-path interaction flows.

---
