# Unified Messaging System PRD

## 1. Introduction / Overview
Virtual Office needs a reliable, WhatsApp-like messaging experience that unifies direct messages (DMs) and space "room" chats inside a single drawer. Previous refactors produced fragmented plans and unstable behaviour; this PRD defines a precise feature set so we can rebuild messaging without regressions. The goal is to let teammates communicate instantly in DMs or shared rooms, with modern messaging affordances, robust realtime delivery, and resilient offline behaviour.

## 2. Goals
- Deliver a single messaging drawer that surfaces both DMs and room conversations with fast switching and clear unread states.
- Support WhatsApp-parity core features: media sharing, reactions, voice notes, typing indicators, read receipts, pinned/starred content, search, message history, and conversation management.
- Guarantee consistent realtime delivery (Supabase Realtime) with offline queueing/sync so messages are never lost.
- Provide analytics hooks for engagement, unread backlog, and delivery health.
- Maintain a stable architecture using current tech (Supabase Postgres + Realtime, Next.js 15, React 19, TypeScript 5) that junior developers can extend safely.

## 3. User Stories
1. **As a teammate**, I want to send and receive DMs with colleagues so we can coordinate quickly without leaving the Virtual Office.
2. **As a teammate inside a space**, I want the same drawer to surface space/room chats so conversations stay anchored to the context of the room I’m viewing.
3. **As a manager**, I need read receipts and typing indicators to understand responsiveness and availability.
4. **As a teammate**, I want to share media/files/voice notes in any conversation, just like WhatsApp, so rich collaboration is effortless.
5. **As a teammate**, I want to pin, star, and search messages so critical decisions or references are easy to find later.
6. **As a support/ops analyst**, I want analytics on active conversations, response times, and unread load so I can monitor messaging health.
7. **As a returning user after being offline**, I want my messages to sync automatically without missing content or duplicating sends.

## 4. Functional Requirements
1. **Conversation Management**
   1.1 The drawer must list conversations grouped by type (DMs, Rooms) with unread counts and ordering by latest activity.
   1.2 Users can start new DMs (search company directory) and join room chats from the drawer.
   1.3 Conversations support pinning, starring, and archiving; archived conversations should be discoverable via search.
2. **Messaging Experience**
   2.1 Users can send text, emojis, attachments (images, documents), and voice notes.
   2.2 Messages support reactions (emoji react) and replies/threads.
   2.3 Typing indicators and read receipts must update in realtime; fallback polling must reconcile state.
   2.4 Message history has no retention limit; infinite scroll/pagination should load older messages on demand.
   2.5 Users can search within a conversation and across conversations (by participant, keyword, starred/pinned).
3. **Realtime & Offline Reliability**
   3.1 Supabase Realtime channels should cover both per-conversation and global DM updates with reconnect/backoff logic.
   3.2 Offline sending should queue messages locally and retry automatically when connectivity resumes.
   3.3 Polling fallback (configurable interval) must reconcile missed events and refresh unread counts.
4. **Drawer UX**
   4.1 A single drawer component persists across routes, supporting minimize/restore, keyboard shortcuts, and focus management.
   4.2 Switching rooms in the floor plan must not dismiss or unexpectedly open the drawer unless explicitly requested.
   4.3 Scroll behaviour must keep the composer visible, auto-scroll only when the user is near the bottom, and surface a “new messages” jump button when not.
5. **Notifications (Desktop)**
   5.1 Browser notifications should fire for unread messages when the tab is unfocused (user opt-in required).
   5.2 Notification payloads must include sender, snippet, and conversation type; clicking focuses the drawer.
6. **Analytics & Observability**
   6.1 Emit structured logs/metrics for message send/receive latency, subscription reconnects, unread backlog, and user engagement (active chats per day).
   6.2 Provide an admin-accessible dashboard or export hooks (e.g., Supabase functions) for these metrics.
7. **Security & Compliance**
   7.1 Respect existing Supabase RLS policies; DMs restricted to participants, room chats restricted to space members.
   7.2 Audit trails should log message deletions/edits (if ever introduced) for future compliance work.

## 5. Non-Goals (Out of Scope)
- End-to-end encryption or zero-knowledge storage (future consideration).
- External guest users or cross-company federation.
- Mobile-native or desktop-native clients (web-responsive only).
- Migration of legacy data beyond what already exists (assume current schema; no wholesale data rewrite).
- Automated moderation, spam detection, or AI assistants.

## 6. Design Considerations
- Use existing component libraries (shadcn/ui, Radix) and Tailwind 4.1 style tokens.
- Maintain the canonical avatar components (`EnhancedAvatarV2`, `UploadableAvatar`).
- Drawer layout should resemble modern messengers: conversation list pane, detail pane (messages + composer), distinct styling for room vs DM context.
- Provide dark/light mode parity.
- Accessibility: keyboard navigation, screen reader labels for drawer controls, sufficient contrast for message bubbles and indicators.

## 7. Technical Considerations
- Backend: Supabase Postgres + Realtime (no new infra). Consider service-role clients for server routes that update unread counts.
- Frontend state: TanStack Query v5 for conversation/message caches; context provides drawer state only.
- Offline queue: leverage IndexedDB/localStorage for drafts and unsent messages; reconcile via Supabase RPC or direct table writes with retry.
- Storage: Reuse existing Supabase Storage buckets for media; ensure metadata (size/type) stored with messages.
- Testing: Vitest for unit/integration, Playwright for dual-session realtime scenarios, contract tests for APIs.
- Observability: extend `debugLogger` with telemetry toggles; consider edge logging via Supabase Edge Functions if needed.

## 8. Success Metrics
- 99% of messages delivered (sent + acknowledged) within 1s realtime or 5s fallback.
- 0 open high-severity bugs in messaging after 2 consecutive releases.
- Increase weekly active conversations per user by 20% post-launch.
- Reduce support tickets related to “lost messages/unread mismatch” to zero.
- Drawer interaction latency (open/switch conversation) < 150ms on average hardware.

## 9. Open Questions
1. Should voice notes be stored/transcoded in a specific format to support playback across browsers?
2. What retention policy (if any) is required for compliance/auditing beyond “no limit”? Do we need admin export/delete tooling?
3. Do we need message deletion or editing in v1, or should we defer entirely?
4. Which analytics platform (existing Supabase functions, third-party) should collect engagement metrics?
5. How should notifications behave when multiple tabs are open (dedupe, focus logic)?
6. Should starred/pinned items sync with other Virtual Office modules (e.g., tasks, announcements)?


## 10. Existing structure That can be used
### Scope Recap
- Deliver a rock-solid messaging system with a single unified drawer, accurate realtime delivery, and reliable unread/read semantics.
- Separate space (floor-plan) chats from direct messaging so navigation never triggers the wrong conversation.
- Provide fail-safe polling and observability so QA can verify fixes regardless of Supabase realtime quirks.

### Research Highlights
- Supabase realtime only fires for subscribed conversation IDs; current consumer missed background DMs.
- `/api/conversations/get` emitted snake_case timestamps, causing runtime errors during polling.
- Drawer lacks scoped routing/minimize logic, so floor-plan navigation opens DM drawer unintentionally.
- Unread counters update server-side but the recipient drawer never reorders conversations instantly, forcing refresh loops.
- Debug logging previously disabled outside development, hampering staging/production diagnostics.

### Repository and File Structure
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

```

