# Messaging: source baseline for the next SPEC

Reconciled: 2026-10-03
Status: historical — superseded. Phase 4 was specified, executed, and owner-accepted on 2026-10-06 in `spec-interview/phase-4-messaging-timeline/` (see REPORT.md there). This inventory describes the source before that work.

The owner confirmed Knock and screen sharing are finished. The next product area in the historical roadmap is **Phase 4 — Messaging Timeline**, followed by Phase 5 — Messaging Resilience. GSD is retired: its skills and `.planning/` files are consultation material only. New development uses `spec-to-done`, with an approved Ready SPEC and its artifacts under `spec-interview/<slug>/`.

This document records the production-source inventory and suggested questions. It does not launch Specify, approve a scope, or establish readiness. The existing screen-sharing SPEC state is `closed`; the spaces-visualization SPEC state is `frozen`. Neither is a contract for messaging.

## Existing production path

[MessagingDrawer](../../src/components/messaging/MessagingDrawer.tsx) renders [MessageFeed](../../src/components/messaging/message-feed.tsx), which uses [MessageComposer](../../src/components/messaging/message-composer.tsx) and [MessageItem](../../src/components/messaging/message-item.tsx). [MessagingContext](../../src/contexts/messaging/MessagingContext.tsx) owns the active conversation, drawer visibility, and message hooks.

Already present in this path: text sending, room/DM conversations, replies/threads, reactions, manual history loading, basic auto-scroll, read-state indicators, and typing indicators. Hooks, API routes, and repositories provide additional partial infrastructure. Source presence is not proof of current two-user runtime behavior.

The [enhanced composer](../../src/components/messaging/EnhancedMessageComposer.tsx) and [enhanced feed](../../src/components/messaging/EnhancedMessageFeed.tsx) have reusable upload/action code, but their consumers are the [debug comparison page](../../src/app/debug/messaging-comparison/messaging-comparison-client.tsx). Their existence does not make the same behavior available in the production drawer.

## Phase 4 remaining workflows

| Historical ID | What exists | What remains |
| --- | --- | --- |
| MSG-01 — read receipts | Visible conversations are marked read through the authorized route/RPC; the paginated repository derives `READ` when a non-sender receipt exists; MessageItem displays an icon. | The paginated query selects only `message_id` from receipts, so the feed does not receive/render reader identities and read times. Define group semantics and complete the authorized reader/time view. |
| MSG-02 — attachments | Upload/read/delete APIs, private-storage authorization, attachment types, upload helpers, and image/file rendering exist. The enhanced composer can choose/upload files. | The production composer opens a file input with no selection handler; its send callback only sends text/reply. Integrate upload/send/preview, drag/drop, progress, errors/cancellation, and attachment-only messages. Validate the actual Storage/schema contract on the execution target. |
| MSG-03 — voice notes | `VoiceNoteAttachment` defines duration/waveform metadata. | No messaging recorder or waveform workflow was found; MessageContent has no voice/audio playback branch. Define and implement capture, send, durable attachment metadata, playback, and permission/failure behavior. |
| MSG-04 — starred filter | Per-message star/unstar routes, mutations, star metadata, and repository retrieval exist. | Production MessageFeed passes no star/unstar callbacks. No production starred-message filter or client retrieval path was found. Complete actions, current-user filtering, pagination, and navigation to results beyond the loaded page. |

Reference implementation boundaries:

- [Message repository](../../src/repositories/implementations/supabase/SupabaseMessageRepository.ts): paginated enrichment, receipt-derived status, attachment/pin/star data, and `getStarredMessages`.
- [Conversation read route](../../src/app/api/conversations/read/route.ts): authorization followed by atomic conversation-read RPC.
- [Upload route](../../src/app/api/messages/upload/route.ts), [attachment read/delete route](../../src/app/api/messages/attachment/[id]/route.ts), and [message star route](../../src/app/api/messages/[messageId]/star/route.ts): existing server boundaries to inspect/reuse.
- [Message hooks](../../src/hooks/useMessages.ts), [action hooks](../../src/hooks/useMessageActions.ts), [client API](../../src/lib/messaging-api.ts), and [types](../../src/types/messaging.ts).

## Existing foundations relevant to later work

| Reference item | Current source | Limit |
| --- | --- | --- |
| RESIL-02 — subscription reconnect | [useMessageSubscription](../../src/hooks/realtime/useMessageSubscription.ts) has bounded exponential delay, channel ownership, retirement fences, timer cleanup, and stable-subscription handling. | Do not rebuild this from scratch or mark all reconnect acceptance complete. Reconcile missed events, recovery, and account/company switching against real runtime behavior. |
| RESIL-04 — typing | [useConversationPresence](../../src/hooks/useConversationPresence.ts), MessageFeed, and TypingIndicator already send/receive typing with idle/TTL cleanup. | Source implementation exists; this inspection did not verify two-user delivery, privacy, or all degraded-channel behavior. |
| MSG-05/06 — history and scrolling | useInfiniteQuery/composite cursors, chronological cache pages, a Load more button, and scrollIntoView already exist. | Automatic history loading, preserving scroll when reading older messages, and a New Messages affordance remain distinct from those basics. Historical v2 placement is input for the next SPEC, not a readiness decision. |
| MSG-07 — conversation content search | ConversationSearch discovers users/rooms for new conversations. | It is not a search of message text. Do not count it as that requirement. |

The rest of Phase 5 was not exhaustively audited. Historical requirements remain reference until the new SPEC confirms scope and acceptance.

## Suggested next slice and Specify questions

Suggested first slice: **read receipt details + starred-message filtering**. Existing backend contracts make these smaller than a complete media composer. This recommendation has not been approved as the new scope.

Before planning implementation, Specify should resolve:

- First slice versus the full messaging set; production drawer surfaces and DM/group/room coverage.
- Read semantics: any-reader versus all-read, identities/timestamps, privacy, and what counts as actually read.
- Starred scope: current conversation versus all conversations; ordering, pagination, and opening the original thread/message.
- Attachments: file types/limits, preview formats, progress, failed/partial uploads, deletion, and authorization.
- Voice notes: duration, waveform, recording controls, cancellation, send/retry, playback, and browser floor.
- Test/acceptance references: two authenticated identities, unread/read timing, starred history beyond page one, authorized attachment delivery, and voice playback. Prefer user-approved expected outcomes and E2E scenarios; existing focused tests are useful evidence but do not prove the full flow.

Use these as interview input. A historical plan or this inventory cannot replace the user-confirmed Ready SPEC gate.

## Prior completion and evidence boundaries

- The owner confirmed Knock and screen sharing complete on 2026-10-03. Historical Phase 2 UAT recorded Knock request, banner, and approval/auto-entry passes; later Presence remediation records server-only contracts and bidirectional browser smoke. This does not certify the separate full Presence cutover project.
- Phase 3 contains 15 execution plans and 15 summaries. [03-TRACKER.md](../../.planning/phases/03-video-and-screen-sharing/03-TRACKER.md) records production screen-share migrations/readback on 2026-08-01, live two-user delivery on 2026-08-04, and the 2026-09-23 startup-race correction. The August UAT and verification reports remain historical snapshots, superseded for product-phase routing by the owner acceptance.
- This reconciliation changed documentation only. No new application/browser/database tests, schema changes, online database operations, deployment, or new development contract occurred.
- Last recorded target: Supabase project `vhabpcoyypobgasacsko`. Its historical migration-provenance concern must be rechecked before future online migrations; this document does not claim fresh compatibility or hosted deployment.
