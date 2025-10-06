# Operation Clean Slate — Messaging Minimal Viable Plan (Synced with IMPLEMENTATION_PLAN.md)

> Canonical execution details live in `IMPLEMENTATION_PLAN.md`. This document mirrors that plan for the Clean Slate initiative; keep both files in sync when updating.

## Scope Recap
- Restore direct messaging fundamentals: realtime delivery, attention-grabbing UI, and accurate read/unread state.
- Resolve the "no popup" complaint by ensuring recipients get an actionable drawer/minimized chat when a DM arrives.
- Fix ghost-online users by hardening presence teardown when tabs close or sessions expire.

## Research Highlights
- `src/hooks/useConversations.ts:14-217` stores data in local state, so realtime invalidations (`useConversationRealtime`) never refresh the UI.
- `src/hooks/realtime/useConversationRealtime.ts:1-52` targets `['conversations', userId]` but nothing owns that query, leaving unread counts stale.
- `src/components/messaging/MessagingDrawer.tsx:23-34` only renders when `activeConversation` or `lastDirectConversation` is set; recipients never seed these, so no drawer appears.
- `src/hooks/realtime/useMessageSubscription.ts:21-134` updates message lists but ignores conversation metadata (last activity, unread), so badges and ordering lag.
- `src/contexts/AuthContext.tsx:47-74` depends on `beforeunload` + fetch for offline status, which browsers drop on abrupt closes.
- `src/hooks/useUserPresence.ts:18-210` lacks heartbeat/backoff; stale `last_active` values keep users online for minutes after disconnect.

## Execution Phases
1. **Instrumentation** — add gated logging around resolver → send → subscription to observe the broken flow before editing logic.
2. **Conversation Cache** — migrate `useConversations` to React Query, align `useConversationRealtime`, and expose derived unread/order helpers.
3. **Message-Driven Updates** — extend `useMessageSubscription` and context to bump unread counts, reorder conversations, and prime the drawer for new DMs.
4. **Read/Delivery Semantics** — mark conversations as read on focus, reconcile optimistic sends, and ensure repository unread math stays idempotent.
5. **Presence Hardening** — replace fragile unload fetch with `navigator.sendBeacon`, add page visibility fallbacks, and schedule a heartbeat to clear stale sessions.
6. **Verification Loop** — unit/integration tests plus two-browser manual runs to validate DM + presence behaviour.

## File Touchpoints
```
src/hooks/useConversations.ts
src/hooks/realtime/useConversationRealtime.ts
src/hooks/realtime/useMessageSubscription.ts
src/hooks/useMessages.ts
src/contexts/messaging/MessagingContext.tsx
src/components/messaging/MessagingDrawer.tsx
src/components/messaging/message-feed.tsx
src/lib/messaging-api.ts
src/contexts/AuthContext.tsx
src/hooks/useUserPresence.ts
src/repositories/implementations/supabase/SupabaseConversationRepository.ts
```

- Owner notes: Messaging pod owns hooks/UI; Platform owns context/API; Auth/Presence squad owns status lifecycle. Coordinate before landing breaking changes.
- No new files. Extend existing exports to avoid duplication.

## Action Checklist
- [ ] **Phase 0 – Observability scaffolding**
  Paths: `src/lib/messaging-api.ts`, `src/hooks/useMessages.ts`, `src/hooks/useConversations.ts`
  Symbols: `messagingApi.sendMessage`, `refreshConversations`, `sendMessage`
  Outcome: deterministic logs for resolver → send → subscription timing.
  Tests: manual dual-browser DM; verify console timeline + Supabase inserts.
  Rollback: disable via env-guard flag.

- [ ] **Phase 1 – React Query conversation cache**
  Paths: `src/hooks/useConversations.ts`, `src/hooks/realtime/useConversationRealtime.ts`, `src/contexts/messaging/MessagingContext.tsx`
  Symbols: `useConversations`, `useConversationRealtime`, `MessagingProvider`
  Outcome: conversations sourced from React Query with working invalidation and derived selectors.
  Tests: hook unit tests, `npm run test -- conversations`, manual dashboard load.
  Rollback: reinstate current local-state implementation behind feature flag.

- [ ] **Phase 2 – Message-driven updates & drawer trigger**
  Paths: `src/hooks/realtime/useMessageSubscription.ts`, `src/hooks/useConversations.ts`, `src/components/messaging/MessagingDrawer.tsx`, `src/components/messaging/message-feed.tsx`
  Symbols: subscription handler, `updateConversationWithMessage`, `MessagingDrawer`, `MessageFeed`
  Outcome: unread counts bump instantly; recipients get minimized drawer badge / popup for new DM.
  Tests: dual-browser DM; expect popup within 1s; unread badge increments & clears on open.
  Rollback: guard new drawer trigger with feature flag.

- [ ] **Phase 3 – Read/delivery semantics**
  Paths: `src/hooks/useMessages.ts`, `src/hooks/useConversations.ts`, `src/lib/messaging-api.ts`, `src/repositories/implementations/supabase/SupabaseConversationRepository.ts`
  Symbols: `sendMessage`, `markConversationAsRead`, `updateMessageStatusLocal`, `incrementUnreadCount`
  Outcome: sender sees `sent → delivered`; viewer clears unread when feed focused.
  Tests: integration tests verifying unread map; DB check `messages.status` transitions.
  Rollback: short-circuit status handler to legacy behaviour.

- [ ] **Phase 4 – Presence reliability**
  Paths: `src/contexts/AuthContext.tsx`, `src/hooks/useUserPresence.ts`, `src/lib/api.ts`
  Symbols: `updateStatus`, new `pagehide`/heartbeat logic, `safeUpdateLocation`
  Outcome: closing or idling tab marks user offline and clears `current_space_id` inside 60s.
  Tests: close browser and observe Supabase rows; hook unit tests covering heartbeat timers.
  Rollback: disable heartbeat interval and beacon dispatchers.

- [ ] **Phase 5 – QA & regression harness**
  Paths: `__tests__/messaging/*`, `__tests__/presence/*`, Playwright DM spec
  Symbols: new Vitest suites (`useConversations`, realtime), Playwright `messaging-direct.spec.ts`
  Outcome: automated proof for DM + presence flows; all suites green locally and in CI.
  Tests: `npm run type-check`, `npm run lint`, `npm run test`, `npx playwright test messaging-direct.spec.ts`.
  Rollback: quarantine flaky tests before merge.

## Risks & Mitigations
- **Cache churn**: migrating to React Query can thrash caches; mitigate with memoized selectors and devtools verification.
- **Realtime disconnects**: wrap Supabase channel lifecycle with retries and log failures.
- **Presence spam**: throttle heartbeat/beacon to avoid API overload; batch updates if needed.
- **UX regressions**: keep popup trigger behind flag until design signs off.

## Exit Criteria
- Recipient gets DM drawer notification within 1 second of message insert.
- Conversation list ordering/unread matches database within a single refresh cycle.
- Message statuses progress `sending → sent → delivered` deterministically.
- Offline users disappear from presence roster within 60 seconds of closing tab.
- All messaging/presence automated tests pass three consecutive runs, and manual dual-browser smoke passes.

## Open Questions & Dependencies
- Confirm RLS permits service-role updates on `conversations.unread_count`; adjust policies if not.
- Decide whether multiple simultaneous DM drawers should queue or replace (assumed single for MVP).
- Clarify mobile browser support requirements for popup behaviour and visibility events.
- Determine deprecation timeline for legacy `useMessageRealtime` hook once new path stabilises.
