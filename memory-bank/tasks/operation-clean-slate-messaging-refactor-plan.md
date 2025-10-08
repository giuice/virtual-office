# Operation Clean Slate — Perfect Messaging System Plan

> Canonical details live in `IMPLEMENTATION_PLAN.md`. Keep this document in sync whenever the plan changes.

## Scope Recap
- Deliver a rock-solid messaging system with a single unified drawer, accurate realtime delivery, and reliable unread/read semantics.
- Separate space (floor-plan) chats from direct messaging so navigation never triggers the wrong conversation.
- Provide fail-safe polling and observability so QA can verify fixes regardless of Supabase realtime quirks.

## Research Highlights
- Supabase realtime only fires for subscribed conversation IDs; current consumer missed background DMs.
- `/api/conversations/get` emitted snake_case timestamps, causing runtime errors during polling.
- Drawer lacks scoped routing/minimize logic, so floor-plan navigation opens DM drawer unintentionally.
- Unread counters update server-side but the recipient drawer never reorders conversations instantly, forcing refresh loops.
- Debug logging previously disabled outside development, hampering staging/production diagnostics.

## Execution Phases
1. Observability & Feature Flags
2. Data Contract Hardening (API + repositories)
3. React Query Ownership (conversations/messages)
4. Realtime Backbone (multi-channel + backoff)
5. Drawer UX Overhaul (minimize, scroll, routing)
6. Space Chat Isolation
7. Delivery & Read Semantics
8. QA Harness & Rollout

## File Touchpoints (no new files)
```
src/utils/debug-logger.ts
src/lib/messaging-api.ts
src/app/api/conversations/get/route.ts
src/repositories/implementations/supabase/SupabaseConversationRepository.ts
src/contexts/messaging/MessagingContext.tsx
src/hooks/useConversations.ts
src/hooks/useMessages.ts
src/hooks/realtime/useMessageSubscription.ts
src/hooks/realtime/useConversationRealtime.ts
src/components/messaging/MessagingDrawer.tsx
src/components/messaging/message-feed.tsx
tests/messaging/* (Vitest & Playwright specs)
```

## Action Checklist
- [ ] Observability & Flags — logging toggles, `MESSAGING_V2` guard
- [ ] API/Repository Normalisation — camelCase conversion, auth, unread math
- [ ] React Query Ownership — consolidate conversation/message caches
- [ ] Realtime Backbone — per-conversation + global subscriptions, backoff
- [ ] Drawer UX Overhaul — minimized badge, scroll, routing hygiene
- [ ] Space Chat Isolation — guard floor-plan interactions
- [ ] Delivery & Read Semantics — consistent unread/read flow
- [ ] QA Harness & Rollout — automated tests, staging checklist

## Risks & Mitigations
- **Realtime disconnects**: implement exponential backoff & reconnection logging.
- **API drift**: add integration tests covering timestamp/unread mapping.
- **UX regression**: release behind feature flag; keep legacy drawer fallback.
- **Performance**: throttle polling interval via env with sane defaults.

## Exit Criteria
- Drawer opens for new DMs within 1s (realtime) or 5s (poll fallback).
- Conversation ordering/unread matches database after each message.
- Floor-plan navigation never opens DM drawer unintentionally.
- Read receipts clear unread counts immediately upon viewer focus.
- All automated suites (unit, integration, e2e) pass three consecutive runs with `MESSAGING_V2` enabled.

## Open Questions & Dependencies
- Confirm Supabase RLS policies for unread updates using service-role clients.
- Decide UX for concurrent DM alerts (queue vs. replace badge state).
- Define mobile drawer behaviour (modal vs. anchored panel).
- Determine whether room chats should live inside drawer tabs or stay separate.
- Evaluate message retention limits / pagination requirements.

