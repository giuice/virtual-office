 # PERFECT_MESSAGING_SYSTEM_IMPLEMENTATION_PLAN

## Executive Summary
- Design an end-to-end overhaul of messaging so DMs and space chats share one reliable drawer, realtime delivery is deterministic, and unread/scroll states never desync.
- Stabilise the stack across browser tabs by hardening Supabase subscriptions, adding resilient polling, and tightening repository contracts with explicit tests.
- Deliver a phased rollout guarded by feature flags, complete with observability and QA scripts so regressions cannot slip through future sessions.

## Research Findings
- Realtime gaps: current `useMessageSubscription` only attaches to active IDs, leaving background DMs invisible when Supabase emits outside that scope.
- API inconsistencies: `/api/conversations/get` returns snake_case timestamps; consumers treat them as `Date`, triggering runtime errors and defeating unread sort/order.
- Drawer scope: floor-plan space clicks reuse the messaging context but do not segregate space chats versus DMs, causing accidental drawer opens when browsing rooms.
- Delivery mismatch: message send route increments unread counts but the recipient drawer never refreshes conversation metadata, so new messages show up in the wrong chat or not at all until poll catches up.
- UI limitations: `MessagingDrawer` lacks scroll-to-bottom persistence and a badge/minimize UX, making it easy to miss new content even after delivery.
- Observability gaps: logs depend on `NODE_ENV==='development'`, so production toggles and QA in staging cannot inspect failures.

## Implementation Strategy
1. **Instrumentation Refresh** — unify debug flag handling, add structured logging around Supabase channel lifecycle, and capture conversation IDs involved in every promotion.
2. **Data Contract Hardening** — normalise API payloads, verify repository outputs, and introduce integration tests covering unread math, participants, and timestamps.
3. **Realtime Backbone** — migrate to multi-channel subscriptions (one per conversation + global DM channel), add exponential backoff, and ensure message inserts map to the correct conversation cache.
4. **Drawer Experience** — rebuild drawer to support per-conversation routing, dedicated minimize badge, scroll container with sticky composer, and optional grouping for room chats.
5. **Delivery Semantics** — enforce sender/recipient flows: optimistic send, server acknowledgment, unread increment, drawer promotion, and read receipts on focus.
6. **Space Chat Isolation** — separate floor-plan chat entry points from DM drawer (feature flag), with context boundaries preventing accidental openings.
7. **QA & Rollout** — provide Playwright dual-session scripts, Vitest integration tests, and seed data loaders; gate new behaviour behind `NEXT_PUBLIC_MESSAGING_V2` for gradual release.

## Research Findings (Trace Evidence)
1. `temp/console.log`: duplicate `useConversations.direct` resolve calls and missing `onInsert` signals prove subscription gap.
2. Browser logs: `TypeError: c.lastActivity.getTime` indicates snake_case timestamps flowing to UI without hydration.
3. Supabase console: realtime events target `messages:conversationId` channels; our hook previously dropped non-active IDs, explaining silent failures.
4. UX feedback: opening floor-plan triggers DM drawer because context lacks guard between space messaging and direct conversations.

## Implementation Strategy
- Already detailed above; each phase maps to Detailed Action Plan tasks.

## Repository and File Structure
```
src/
├─ app/
│  └─ api/
│     └─ conversations/get/route.ts             # Normalise payloads, enforce auth
├─ components/
│  └─ messaging/
│     ├─ MessagingDrawer.tsx                    # Rebuild unified drawer
│     ├─ message-feed.tsx                       # Scroll + read acknowledgement
│     └─ space-message-panel.tsx (existing)     # Ensure isolation
├─ contexts/
│  └─ messaging/
│     ├─ MessagingContext.tsx                   # Subscription manager, polling
│     └─ types.ts                               # Context contract
├─ hooks/
│  ├─ useConversations.ts                       # React Query cache owner
│  ├─ useMessages.ts                            # Optimistic flow
│  └─ realtime/
│     ├─ useMessageSubscription.ts              # Multi-channel + backoff
│     └─ useConversationRealtime.ts             # Conversation metadata stream
├─ lib/
│  ├─ messaging-api.ts                          # Client fetch helpers
│  └─ supabase/
│     └─ client builders                        # Ensure realtime config
├─ repositories/
│  └─ implementations/supabase/
│     └─ SupabaseConversationRepository.ts      # unread_count + timestamps
└─ tests/
   ├─ messaging/                                # Vitest suites
   └─ e2e/messaging.spec.ts                     # Playwright dual-session
```

| Path | Role | Owner | Risks |
| --- | --- | --- | --- |
| `src/contexts/messaging/MessagingContext.tsx` | subscription orchestration | Messaging pod | regressions in state management |
| `src/components/messaging/MessagingDrawer.tsx` | UI surface | Frontend | UX regressions, focus traps |
| `src/hooks/useConversations.ts` | cache + selectors | Messaging | stale data, infinite loops |
| `src/app/api/conversations/get/route.ts` | API contract | Platform | auth, RLS, pagination |
| `src/repositories/implementations/supabase/SupabaseConversationRepository.ts` | data integrity | Platform | RLS, unread math |
| `src/hooks/realtime/useMessageSubscription.ts` | realtime bridge | Messaging | missed events |

**New files to create**
- None; reuse existing structure per Anti-Duplication Protocol.

| File | Symbols to add / modify / remove | Dependencies | Tests impacted |
| --- | --- | --- | --- |
| `src/contexts/messaging/MessagingContext.tsx` | `conversationChannels`, `ensureOpenForMessage`, `pollingController` | `useMessageSubscription`, `useConversations`, Supabase | Vitest: context tests; Playwright DM flow |
| `src/hooks/realtime/useMessageSubscription.ts` | `subscribeToConversations`, `subscribeToGlobal`, exponential backoff | Supabase client | Unit tests for subscription lifecycle |
| `src/hooks/useConversations.ts` | `useQuery` owner, unread selectors | TanStack Query, messaging API | Hook tests |
| `src/components/messaging/MessagingDrawer.tsx` | `MessagingDrawerV2`, minimize badge, scroll area | shadcn/ui, context | Playwright UI, visual QA |
| `src/app/api/conversations/get/route.ts` | payload normalisation, auth check | Supabase service client | API integration tests |
| `src/repositories/...SupabaseConversationRepository.ts` | typed mapper, unread increment | Supabase | Repository tests |

## Detailed Action Plan
- [X] **Observability & Flags**
  - Paths: `src/utils/debug-logger.ts`, `src/lib/messaging/config.ts`
  - Symbols: `messagingDebugEnabled`, `MESSAGING_V2_FLAG`
  - Rationale: enable logging and feature flag control in all environments
  - Dependencies: none
  - Tests: unit tests to ensure flag precedence
  - Validation: toggle flag in staging and confirm logs stream
  - Journal: Added `messagingFeatureFlags` helpers, storage listeners, and surfaced V2 state through `MessagingContext`.

- [ ] **API & Repository Normalisation**
  - Paths: `src/app/api/conversations/get/route.ts`, `src/repositories/implementations/supabase/SupabaseConversationRepository.ts`
  - Symbols: `mapConversationRow`, `withAuthorizedUser`
  - Rationale: guarantee timestamps/unread are correctly typed and filtered
  - Dependencies: Supabase RLS policies
  - Tests: integration test using Supabase test harness, verifying unread math
  - Validation: run `npm run test -- messaging/repository.spec.ts`
  - Journal: Server route now authenticates via Supabase profile, emits camelCase payloads; repository handles type/archive filters and string cursors (tests still pending).

- [ ] **React Query Ownership**
  - Paths: `src/hooks/useConversations.ts`, `src/hooks/useMessages.ts`
  - Symbols: `useQuery`, `useInfiniteQuery`, derived selectors
  - Rationale: ensure single source of truth for conversation data, enabling invalidation and selectors for unread/ordering
  - Dependencies: messaging API helpers
  - Tests: Vitest hook tests for ordering and unread
  - Validation: `npm run test -- use-conversations.spec.ts`

- [ ] **Realtime Backbone**
  - Paths: `src/hooks/realtime/useMessageSubscription.ts`, `src/hooks/realtime/useConversationRealtime.ts`
  - Symbols: `subscribeToConversation`, `subscribeToGlobal`, backoff + retry
  - Rationale: deliver deterministic delivery notifications even when tabs go idle
  - Dependencies: Supabase realtime config
  - Tests: mock Supabase channels to confirm re-subscribe on `broadcast.state` changes
  - Validation: run mocked realtime unit tests; manual dual-browser test

- [ ] **Drawer UX Overhaul**
  - Paths: `src/components/messaging/MessagingDrawer.tsx`, `src/components/messaging/message-feed.tsx`
  - Symbols: `MessagingDrawerV2`, `DrawerBadge`, `ScrollAnchor`
  - Rationale: provide minimized badge, scroll restoration, per-conversation routing
  - Dependencies: shadcn/ui components, context contract
  - Tests: Playwright spec verifying popup, minimize, X close
  - Validation: `npx playwright test messaging-drawer.spec.ts`

- [ ] **Space Chat Isolation**
  - Paths: `src/components/floor-plan/*`, `src/contexts/messaging/MessagingContext.tsx`
  - Symbols: `openSpaceChat`, `isSpaceChatActive`
  - Rationale: prevent DM drawer opening when navigating floor-plan rooms
  - Dependencies: floor-plan components, context
  - Tests: React Testing Library simulation to ensure DM drawer stays closed when opening space details
  - Validation: manual check via floor-plan UI

- [ ] **Delivery & Read Semantics**
  - Paths: `src/hooks/useMessages.ts`, `src/app/api/messages/create/route.ts`, `src/repositories/...SupabaseConversationRepository.ts`
  - Symbols: `acknowledgeDelivery`, `markConversationAsRead`, `updateLastActivity`
  - Rationale: make sender/recipient flows consistent, ensuring unread counts clear on view
  - Dependencies: Supabase service role flow
  - Tests: integration test verifying unread decrement on mark-as-read; Playwright spec to ensure read clears
  - Validation: run Vitest integration + Playwright DM read spec

- [ ] **QA Harness & Rollout**
  - Paths: `tests/messaging/*`, `.github/workflows/ci.yml` (if exists)
  - Symbols: new Vitest suites, Playwright scenarios, feature-flag toggles
  - Rationale: regression guard before enabling `MESSAGING_V2`
  - Dependencies: existing CI pipeline
  - Tests: run `npm run lint`, `npm run type-check`, `npm run test`, Playwright e2e
  - Validation: stage with flag on, confirm manual checklist

## Risk Mitigation
- Add feature flag `NEXT_PUBLIC_MESSAGING_V2`; ship behind toggle for staged rollout.
- Maintain existing drawer as fallback until new path passes QA.
- Build Supabase channel watchdog (backoff + rejoin) to avoid silent disconnects.
- Add telemetry counters for missed promotion events to catch future regressions.

## Success Criteria
- Sender sees message status progress `sending → sent → delivered`; recipient receives popup within 1 second (realtime) or 5 seconds (poll fallback).
- Drawer opens only when messaging context requests it; floor-plan navigation never triggers DM drawer.
- Conversation ordering matches database `last_activity` after each message without manual refresh.
- Unread badges decrement immediately on reader focus; scroll sticks to newest message unless user scrolls up.
- Automated suites (unit, integration, e2e) pass three consecutive runs with `MESSAGING_V2` enabled.

## Open Questions and Assumptions
- Confirm Supabase RLS allows service-role writes on `unread_count`; otherwise adjust policies or use RPC with auth context.
- Decide UX for multiple simultaneous DM events (queue vs. replace) within drawer badge.
- Clarify mobile behaviour (responsive drawer vs. full-screen modal).
- Validate whether team wants combined DM/room list or separate tabs inside drawer.
- Determine if message retention / pagination limits need adjustments for larger histories.
