## Relevant Files

- `src/components/messaging/MessagingDrawer.tsx` - Persistent drawer shell to orchestrate unified DM and room conversations.
- `src/components/messaging/ConversationList.tsx` - Conversation list surface to group by type, support pin/star/archive, and show unread counts.
- `src/components/messaging/EnhancedMessageFeed.tsx` - Message timeline requiring reactions, replies, scroll management, and pinned/starred affordances.
- `src/components/messaging/EnhancedMessageComposer.tsx` - Canonical composer to extend for attachments, voice notes, and offline queueing.
- `src/components/messaging/message-item.tsx` - Individual message renderer to integrate reactions, reply previews, and read receipts.
- `src/contexts/messaging/MessagingContext.tsx` - State container for active conversation, presence, and optimistic updates.
- `src/hooks/useConversations.ts` - Query/realtime hook for conversation lists; will power grouped drawer data.
- `src/hooks/useMessages.ts` - Message data hook to extend with pagination, resend queue, and optimistic reconciliation.
- `src/hooks/realtime/useMessageSubscription.ts` - Realtime bridge that needs reconnection, backoff, and multi-channel support.
- `src/hooks/useTypingIndicator.ts` - Typing indicator management to align with refreshed presence contract.
- `src/repositories/interfaces/IConversationRepository.ts` - Interface to evolve for pin/star/archive, unread math, and analytics taps.
- `src/repositories/interfaces/IMessageRepository.ts` - Interface to cover attachments, voice notes, reactions, and read receipts.
- `src/repositories/implementations/supabase/SupabaseConversationRepository.ts` - Supabase implementation to update for new fields and pagination.
- `src/repositories/implementations/supabase/SupabaseMessageRepository.ts` - Supabase implementation for message CRUD, attachments, and status transitions.
- `src/app/api/conversations/get/route.ts` - Drawer bootstrap endpoint returning unified conversation payloads.
- `src/app/api/conversations/create/route.ts` - API entry for starting new conversations to update with DM/room parity rules.
- `src/app/api/conversations/archive/route.ts` - Archive/unarchive handler to align with new states.
- `src/app/api/messages/create/route.ts` - Message send endpoint to extend for attachments, voice notes, and offline retries.
- `src/app/api/messages/react/route.ts` - Reaction handler to ensure emoji reactions and analytics coverage.
- `src/app/api/messages/status/route.ts` - Read receipt endpoint to align with new lifecycle semantics.
- `src/app/api/messages/typing/route.ts` - Typing indicator endpoint for realtime signalling fallback.
- `__tests__/messaging-api.test.ts` - Vitest suite validating messaging API contracts.
- `__tests__/api/messages-api.test.ts` - Additional API coverage for message workflows and RLS constraints.
- `__tests__/api/playwright/messages-api.spec.ts` - Playwright flow for end-to-end messaging interactions.

### Notes

- Mirror existing repository patterns and Supabase client usage (`createSupabaseServerClient`) when extending APIs.
- Update or add Vitest and Playwright coverage alongside feature changes to lock regressions.

## Tasks

- [ ] 1.0 Messaging Data Contracts & API Foundation
  - [ ] 1.1 Audit `src/types/messaging.ts`, `IConversationRepository`, and `IMessageRepository` to catalogue gaps for pin/star/archive, reactions, attachments, and read receipts; document proposed schema deltas with Supabase migrations.
  - [ ] 1.2 Extend conversation repository interface + `SupabaseConversationRepository` to return grouped DM/room payloads with pinned order, unread summaries, and archived filters consistent with PRD requirements.
  - [ ] 1.3 Update `src/app/api/conversations/get/route.ts`, `create/route.ts`, and `archive/route.ts` to align responses and validation with new repository contracts and RLS-checked access rules.
  - [ ] 1.4 Expand message repository interface + `SupabaseMessageRepository` plus `src/app/api/messages/create|react|status/route.ts` to cover attachments, voice notes metadata, reactions, and read receipt updates.
  - [ ] 1.5 Refresh unit coverage in `__tests__/messaging-api.test.ts` and `__tests__/api/messages-api.test.ts` to exercise new APIs, including negative RLS scenarios.

- [ ] 2.0 Unified Drawer UX & Conversation Surfacing
  - [ ] 2.1 Map active drawer state requirements in `MessagingDrawer.tsx` and `MessagingContext.tsx`, ensuring state survives route changes and supports minimize/restore controls.
  - [ ] 2.2 Refactor `ConversationList.tsx` to group DMs vs rooms, surface pinned conversations, unread badges, and canonical avatars while respecting click-stop guards.
  - [ ] 2.3 Integrate conversation search/start flows by wiring `ConversationList` with company directory data and `useConversations` mutations for DM creation and room joining.
  - [ ] 2.4 Ensure room navigation sync keeps the drawer stable by reconciling `MessagingDrawer` with floor-plan context and preventing unintended toggles.
  - [ ] 2.5 Update Playwright flow `__tests__/api/playwright/messages-api.spec.ts` to validate drawer interactions, filtering, and cross-room switching.

- [ ] 3.0 Timeline & Composer Feature Parity
  - [ ] 3.1 Extend `EnhancedMessageFeed.tsx` and `message-item.tsx` to render replies, reaction chips, pinned/starred indicators, and read receipts with accessible affordances.
  - [ ] 3.2 Add infinite scroll + pagination to `EnhancedMessageFeed` by leveraging `useMessages` cursors and ensuring auto-scroll respects the “new messages” button logic.
  - [ ] 3.3 Upgrade `EnhancedMessageComposer.tsx` for attachments (drag/drop, preview), voice note recording, and emoji picker integration with optimistic enqueue.
  - [ ] 3.4 Layer conversation-level search and star filters within the feed, reusing query hooks to deliver scoped results without breaking realtime updates.
  - [ ] 3.5 Backfill component tests (Testing Library) for composer/feed behaviour and expand any existing Vitest snapshot coverage.

- [ ] 4.0 Realtime Resilience & Offline Reliability
  - [ ] 4.1 Reinforce `useMessageSubscription.ts` with multi-channel subscriptions, exponential backoff, and resume logic tied to Supabase Realtime status.
  - [ ] 4.2 Implement offline queue + retry logic inside `useMessages` or `MessagingContext`, persisting unsent entries via `useLocalStorage` with clear recovery UX.
  - [ ] 4.3 Add polling fallback hooks that reconcile missed messages/unread counts when realtime is unavailable, including instrumentation toggles.
  - [ ] 4.4 Synchronise typing indicators and read receipts by coordinating `useTypingIndicator.ts`, `useConversations.ts`, and status APIs for multi-client accuracy.
  - [ ] 4.5 Expand integration tests (Vitest + mocked realtime) to cover reconnect, offline send, and duplicate message prevention flows.

- [ ] 5.0 Analytics, Notifications & Observability
  - [ ] 5.1 Define analytics events/metrics (latency, unread backlog, engagement) and implement emitters in hooks (`useMessages`, `useConversations`) using `debugLogger.messaging`.
  - [ ] 5.2 Add structured logging + dashboards or Supabase functions to expose conversation usage data for admins, ensuring role-based access.
  - [ ] 5.3 Enhance desktop notification logic via `useNotification.ts` to respect permissions, include conversation metadata, and focus the drawer on click.
  - [ ] 5.4 Document operational runbooks and alert thresholds for messaging health, linking to new metrics.
  - [ ] 5.5 Extend Playwright or vitest smoke cases to verify notifications fire only when expected and instrumentation toggles do not regress UX.
