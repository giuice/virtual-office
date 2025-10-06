# MESSAGING_MINIMAL_VIABLE_IMPLEMENTATION_PLAN

## Executive Summary
- Define a narrowly scoped, verifiable path to restore direct messaging basics: realtime delivery, attention-grabbing UI, and read state propagation.
- Ground every step in current code realities so junior developers can execute without guessing.
- Prioritise observability and regression safety before altering behaviour.

## Research Findings
- `src/hooks/useConversations.ts:14-217` keeps conversations in local React state, so `useConversationRealtime` invalidations never reach the UI and unread counts/ordering drift.
- `src/hooks/realtime/useConversationRealtime.ts:1-52` invalidates `['conversations', userId]`, but no query owns that key, confirming state/cache mismatch.
- `src/components/messaging/MessagingDrawer.tsx:23-34` only renders when `activeConversation` or `lastDirectConversation` is populated; receivers never auto-populate these fields, so no popup appears.
- `src/hooks/realtime/useMessageSubscription.ts:21-134` mirrors message rows into the cache but never touches conversation metadata (last activity, unread, drawer triggers).
- `src/contexts/AuthContext.tsx:47-74` relies on `beforeunload` + async fetch for offline status, which browsers routinely cancel, explaining ghost-online users.
- `src/hooks/useUserPresence.ts:18-210` lacks a heartbeat/backoff; `users.last_active` only updates on explicit API calls, so stale sessions persist past the two-minute grace window.

## Implementation Strategy
- Phase 0 – Instrumentation: add targeted logging/metrics hooks to verify resolver, message, and presence flows before changing logic.
- Phase 1 – Conversation cache: migrate `useConversations` to React Query, wiring it to realtime invalidation and exposing a derived selector for unread/ordering.
- Phase 2 – Message-driven updates: extend `useMessageSubscription` and `MessagingContext` to raise unread counts, bump last activity, and prime the drawer when a new DM arrives.
- Phase 3 – Read/delivered semantics: mark conversations as read on focus, emit delivery acknowledgements, and reconcile optimistic sends.
- Phase 4 – Presence hardening: replace fragile `beforeunload` calls with `navigator.sendBeacon`, page visibility fallbacks, and a 45s heartbeat that zeroes `current_space_id` on failure.
- Phase 5 – Verification: automated tests (unit + integration) plus dual-browser manual scenarios to prove send, receive, unread, and presence flows.

## Repository and File Structure
```
src/
├─ contexts/
│  ├─ AuthContext.tsx
│  └─ messaging/
│     └─ MessagingContext.tsx
├─ hooks/
│  ├─ useConversations.ts
│  ├─ useMessages.ts
│  ├─ realtime/
│  │  ├─ useConversationRealtime.ts
│  │  └─ useMessageSubscription.ts
├─ components/
│  └─ messaging/
│     ├─ MessagingDrawer.tsx
│     ├─ message-feed.tsx
│     └─ conversation-list.tsx
├─ lib/
│  └─ messaging-api.ts
└─ repositories/
   └─ implementations/
      └─ supabase/
         └─ SupabaseConversationRepository.ts
memory-bank/tasks/
└─ operation-clean-slate-messaging-refactor-plan.md
```

**Existing files to modify**
- `src/hooks/useConversations.ts` — Source of truth for conversations; owned by Messaging team; risk: list regressions.
- `src/hooks/realtime/useConversationRealtime.ts` — Realtime bridge; Messaging; risk: dropped subscriptions.
- `src/hooks/realtime/useMessageSubscription.ts` — Message listener; Messaging; risk: duplicate inserts.
- `src/hooks/useMessages.ts` — Infinite query + optimistic send; Messaging; risk: stale caches.
- `src/contexts/messaging/MessagingContext.tsx` — Public API to consumers; Core Platform; risk: breaking provider contract.
- `src/components/messaging/MessagingDrawer.tsx` & `message-feed.tsx` — UI shell; Frontend; risk: UX regressions.
- `src/lib/messaging-api.ts` — Client API glue; Platform; risk: auth leakage.
- `src/contexts/AuthContext.tsx` & `src/hooks/useUserPresence.ts` — Presence lifecycle; Auth/Presence squad; risk: double sign-out.
- `src/repositories/implementations/supabase/SupabaseConversationRepository.ts` — DB side unread updates; Data layer; risk: RLS violations.

**New files to create**
- None. Extend existing modules per Anti-Duplication rule.

**Change-impact table**
| File | Symbols to touch | Dependencies | Tests impacted |
| --- | --- | --- | --- |
| `src/hooks/useConversations.ts` | `useConversations`, `refreshConversations`, `updateConversationWithMessage` | React Query, `messagingApi` | Add hook unit tests; update messaging integration tests |
| `src/hooks/realtime/useMessageSubscription.ts` | anonymous subscription handler | Supabase channel, React Query cache | Add realtime subscription tests |
| `src/contexts/messaging/MessagingContext.tsx` | context value assembly | Hooks above | Update provider smoke tests |
| `src/components/messaging/MessagingDrawer.tsx` | `MessagingDrawer` | Messaging context, Company context | Frontend interaction tests |
| `src/contexts/AuthContext.tsx` | `updateStatus`, effect, `signOut` | `lib/api.ts`, browser events | Auth/presence tests |
| `src/hooks/useUserPresence.ts` | `useUserPresence`, `safeUpdateLocation` | Supabase client, debounce | Presence hook tests |
| `src/repositories/implementations/supabase/SupabaseConversationRepository.ts` | `incrementUnreadCount`, `updateLastActivityTimestamp` | Supabase service client | Repository integration tests |

## Detailed Action Plan
- [ ] Phase 0 – Observability scaffolding
  Paths: `src/lib/messaging-api.ts`, `src/hooks/useMessages.ts`, `src/hooks/useConversations.ts`
  Symbols: `messagingApi.sendMessage`, `refreshConversations`, `sendMessage`
  Rationale: capture timing + payload snapshots (console.debug gated by env) so we can confirm resolver → message → subscription flow before altering logic.
  Dependencies: enable only in development, guard behind `process.env.NODE_ENV`.
  Testing: manually send DM between two browsers; verify console shows resolver + message timeline; check Supabase dashboard for matching inserts.
  Validation: remove logging if noise > 5% of console; rollback by toggling a single feature flag constant.

- [ ] Phase 1 – React Query conversation cache
  Paths: `src/hooks/useConversations.ts`, `src/hooks/realtime/useConversationRealtime.ts`, `src/contexts/messaging/MessagingContext.tsx`
  Symbols: `useConversations`, `useConversationRealtime`, `MessagingProvider`
  Rationale: migrate conversation storage to `useQuery` so realtime invalidations work and derived selectors stay consistent.
  Dependencies: ensure `QueryClientProvider` already wraps app; reuse `messagingApi.getConversations`.
  Testing: unit-test hook with React Query test utils; run `npm run test -- conversations`; manual verify that opening dashboard triggers single network request with cached re-fetch on focus.
  Validation: confirm conversation order updates after DB `last_activity` update; rollback by reverting to current stateful implementation (preserve old code behind feature flag until stable).

- [ ] Phase 2 – Message-driven conversation updates & drawer trigger
  Paths: `src/hooks/realtime/useMessageSubscription.ts`, `src/hooks/useConversations.ts`, `src/components/messaging/MessagingDrawer.tsx`, `src/components/messaging/message-feed.tsx`
  Symbols: subscription handler, `updateConversationWithMessage`, `MessagingDrawer`, `MessageFeed`
  Rationale: whenever a new message arrives, bump conversation cache, increment unread for recipients, and auto-select `lastDirectConversation` when recipient has no active chat.
  Dependencies: require Phase 1 cache work; ensure unread increments from repository stay idempotent.
  Testing: dual-browser DM test; expect recipient gets minimized drawer badge within 1s; verify unread badge increments and clears after opening feed.
  Validation: monitor React Query devtools for cache consistency; rollback by disabling new drawer trigger flag.

- [ ] Phase 3 – Read/delivered semantics
  Paths: `src/hooks/useMessages.ts`, `src/hooks/useConversations.ts`, `src/lib/messaging-api.ts`, `src/repositories/implementations/supabase/SupabaseConversationRepository.ts`
  Symbols: `sendMessage`, `markConversationAsRead`, `updateMessageStatusLocal`, `incrementUnreadCount`
  Rationale: ensure optimistic send flips to `delivered` on subscription echo, and active viewers call `markConversationAsRead` when pane focused.
  Dependencies: Phase 2 (needs accurate unread state).
  Testing: console log statuses, DB check `messages.status`; run integration tests that assert unread map cleared.
  Validation: add telemetry counter for failed status transitions; rollback by short-circuiting new status handler.

- [ ] Phase 4 – Presence reliability
  Paths: `src/contexts/AuthContext.tsx`, `src/hooks/useUserPresence.ts`, `src/lib/api.ts`
  Symbols: `updateStatus`, `handleBeforeUnload` replacement, `safeUpdateLocation`
  Rationale: replace fetch-on-unload with `navigator.sendBeacon`, add `pagehide`/`visibilitychange` listeners, and schedule a 45s heartbeat to refresh `last_active`.
  Dependencies: browser environment; ensure heartbeat cleared on logout.
  Testing: sign in, close tab, confirm Supabase `users.status` flips to `offline` within 60s; run presence hook tests verifying heartbeat timers.
  Validation: instrumentation to log heartbeat failures; rollback by disabling heartbeat interval.

- [ ] Phase 5 – QA & regression harness
  Paths: `__tests__/messaging/*`, `__tests__/presence/*`, Playwright specs under `tests/`
  Symbols: add new Vitest suites (`useConversations`, realtime subscription), extend Playwright scenario `messaging-direct.spec.ts`
  Rationale: lock behaviour with automated coverage so future refactors cannot regress DM basics.
  Dependencies: earlier phases complete.
  Testing: `npm run type-check`, `npm run lint`, `npm run test`, targeted Playwright run `npx playwright test messaging-direct.spec.ts`.
  Validation: capture before/after metrics (message delivery latency, offline detection time); rollback by reverting failing tests before merge.

## Risk Mitigation
- Stage rollout behind environment-guarded feature flag to toggle back without redeploy.
- Use Supabase SQL sandbox to test unread increment RPCs before touching production tables.
- Add logging throttling to avoid console spam that could hide genuine errors.
- Pair manual QA with automated checks to catch UI regressions early.

## Success Criteria
- New DM triggers popup/minimised drawer for recipient within 1 second.
- Conversation list reflects latest message order and unread counts for both participants.
- Sender sees message status transition to `sent` → `delivered`; recipient sees unread clear on view.
- Closing browser or losing network marks user offline and clears `current_space_id` within 60 seconds.
- All messaging and presence tests pass without flakiness over three consecutive CI runs.

## Open Questions and Assumptions
- Confirm Supabase RLS policies already allow service-role updates to `conversations.unread_count`; otherwise add explicit policy adjustments.
- Need clarity on expected behaviour for multiple simultaneous DMs—should the drawer stack or replace? (Assume single active drawer for now.)
- Determine whether mobile browsers must be supported for popup behaviour; affects visibility event handling.
- Validate whether legacy `useMessageRealtime` hook can be removed post Phase 2 or must remain for backward compatibility.
