# SPEC: Phase 4 — Messaging Timeline

Goal: In the production messaging drawer, two users can see who read a message and when, send and view file attachments, record/send/play voice notes, find their starred messages (including old ones), and get desktop notifications for new DM/group messages — without regressing existing messaging.

Approved: 2026-10-03 by the owner (interview rounds 1–3 and confirmation recorded in `state.md`, Verdict: Ready).
Amended: 2026-10-04 by the owner — BR-012/AC-032: online migrations happen once, at phase end (see `state.md` "Contract amendments").

## 1. Summary

The Virtual Office messaging drawer (`MessagingDrawer` → `MessageFeed` → `MessageComposer` / `MessageItem`, state in `MessagingContext`) already supports text, direct/group/room conversations, replies/threads, reactions, typing, manual history loading, and a basic read icon. Backend pieces exist for read receipts, attachment upload/read, and per-message stars, but the production drawer does not expose them as complete user workflows. This phase completes four timeline capabilities — read-receipt details, attachments, voice notes, starred filter — plus desktop notifications for new DM/group messages and loss-free failed sends, reusing existing APIs, repositories, hooks, and the TanStack Query cache.

## 2. Problem statement

Workspace members chatting in the drawer cannot tell who actually read their message, cannot attach files from the production composer (its file button has no handler; the working upload composer only lives on a debug page), cannot send voice notes at all, cannot use stars (the menu entry exists but is not wired), and are not notified of new messages when the tab is in the background. These gaps make the messaging drawer insufficient for day-to-day office communication.

## 3. Goals and success metrics

### Goals
- G1: A sender sees which members read their message and when.
- G2: A user can attach files (pick, drag/drop, paste as Should) with progress and usable previews.
- G3: A user can record, review, send, and play voice notes.
- G4: A user can star messages and filter a conversation to their starred messages, reaching messages beyond the loaded page.
- G5: A user is notified on the desktop of new DM/group messages when not looking at that conversation.
- G6: No existing messaging behavior regresses; every database change reaches the online target in a controlled, verified way.

### Success metrics
- Two real accounts, in the production drawer, complete each flow without defects: read details (who + when), send/view files, send/play voice note, find an old starred message, receive a desktop notification. Each flow is covered by a passing two-account Playwright E2E test.
- The existing-messaging regression E2E (text, reply/thread, reaction, typing, history, real-time delivery) passes after each slice.
- Every migration written in this phase is recorded as applied to the online target `vhabpcoyypobgasacsko`, with catalog readback and smoke evidence, before the next task started.
- Owner UAT in the browser accepts the phase.

## 4. Users and stakeholders

### Primary users
- Workspace members who are members (`conversation_members`) of direct, group, or room conversations, acting as **sender** (author of a message) or **recipient** (any other member).

### Secondary users
- Users with a room microphone open in spatial audio (Phase 3) who record voice notes.

### Stakeholders
- Product owner (performs UAT, authorizes each online migration, owns application deployment).

## 5. Scope

### In scope
- Production messaging drawer only, for `direct`, `group`, and `room` conversations.
- Read-receipt details, read-marking rule, live receipt updates, unread counter alignment.
- Attachments in the production composer and feed.
- Voice notes (record, review, send, play), including room-microphone interaction.
- Star/unstar and the per-conversation starred filter with jump-to-message.
- Desktop notifications for new messages in DM and group conversations.
- Preserving composer content when a send/upload fails (retry in place).
- Replacing, in messaging test files this phase touches, tests that only mirror implementation with equivalent integration/E2E coverage (see BR-016).

### Out of scope
- Offline queue / automatic resend without network (Phase 5).
- Missed-message recovery after reconnect and polling fallback (Phase 5); typing and multi-device sync changes (Phase 5). Existing behavior must not regress.
- @mentions, notification rules (mute, room notifications), messaging metrics (Phase 5).
- Message text search, automatic infinite scroll, "New messages" affordance (backlog).
- Deleting or editing messages, removing attachments after send.
- Voice transcription; inline PDF rendering; GIF autoplay requirements.
- The debug page `src/app/debug/messaging-comparison`.
- Broad cleanup of the test suite beyond touched messaging tests.
- Application deployment (owner-owned).

## 6. User journeys

- J1 Read details: Ana sends "Reunião às 15h" in a room. Bruno opens the drawer on that room with the tab focused and the message on screen → a receipt is recorded. Ana, with the conversation open, sees the indicator change live to "Lida por 1"; opening it shows Bruno, his avatar, and read time.
- J2 Attachments: Ana drags 3 files (PNG, PDF, XLSX) into the composer, types optional text, watches per-file progress, removes one, and sends after the remaining uploads finish. Bruno sees an image thumbnail (opens a lightbox) and file cards with name, size, and download.
- J3 Voice note: Ana, with the room mic open, clicks the mic button; the room mic auto-mutes with a visible notice; she records with live waveform and timer, stops, listens, and sends; the room mic returns to open. Bruno plays the note in the feed.
- J4 Starred: Bruno stars a message, later toggles "Favoritas" in the conversation header, sees his starred messages newest-message-first, clicks an old one; the feed returns to normal, loads history with a loading indicator until it reaches the message, scrolls to it, and highlights it.
- J5 Notification: Bruno has granted notification permission and has the tab in the background; Ana sends him a DM → Bruno receives a desktop notification.
- J6 Failed send: Ana's send fails → her text and files remain in the composer with an error and "Tentar de novo".

## 7. Functional requirements

| ID | Requirement | Priority | Acceptance signal |
|---|---|---|---|
| FR-001 | On messages the current user sent, show a read summary "Lida por N" (N = distinct non-sender readers) in direct, group, and room conversations. | Must | AC-001 |
| FR-002 | Opening the read summary (click, and keyboard) shows each reader's avatar, name, and read time, most recent first. No denominator and no "not read" list. | Must | AC-002 |
| FR-003 | Reader identities and times are exposed by the application UI and application API only to the message's sender. | Must | AC-003 |
| FR-004 | A receipt is recorded for a recipient only when the message is rendered visibly on screen, with the drawer open on that conversation and the browser tab visible/focused. Sender messages never produce receipts. | Must | AC-004, AC-005 |
| FR-005 | While the sender has the conversation open, the read summary and reader list update in real time when a recipient reads. | Must | AC-006 |
| FR-006 | The conversation-list unread counter decreases only as messages are marked read under FR-004. | Must | AC-007 |
| FR-007 | The production composer accepts files via the file picker and via drag-and-drop onto the composer/drawer. | Must | AC-008 |
| FR-008 | A message may carry up to 5 files, each ≤ 10 MB, of types JPEG, PNG, GIF, WebP, PDF, TXT, DOC, DOCX, XLS, XLSX; text is optional; attachment-only messages are allowed. Violations are rejected with a clear message before upload and enforced server-side. | Must | AC-009, AC-010 |
| FR-009 | Each pending file shows upload progress and can be removed/cancelled; the message is sent only after all its uploads complete; an upload failure shows an error and a retry action. | Must | AC-011, AC-012 |
| FR-010 | Files from cancelled, removed, or failed uploads are never visible to any user and are deleted from storage; files not attached to a sent message are never visible to anyone. | Must | AC-013 |
| FR-011 | Feed previews: images as inline thumbnails that open a larger view (lightbox); PDF/Office/TXT as a card with icon, name, size, and download. Content is served via short-lived signed URLs to conversation members only. | Must | AC-014, AC-015 |
| FR-012 | Pasting an image from the clipboard (Ctrl+V) into the composer adds it as a pending attachment under FR-008/FR-009 rules. | Should | AC-016 |
| FR-013 | Voice recording: a mic button starts recording with live waveform and elapsed timer; the user stops, previews playback, then sends or discards. | Must | AC-017 |
| FR-014 | Recording auto-stops at 2 minutes; a visible warning appears during the last 10 seconds. | Must | AC-018 |
| FR-015 | Delivered voice notes play in the feed for sender and recipients with play/pause, duration, and waveform/progress display. | Must | AC-017 |
| FR-016 | If the user's spatial-audio room microphone is open when recording starts, it is muted automatically with a visible notice and restored to its prior state when recording stops, is discarded, or is sent. A previously muted mic stays muted. | Must | AC-019 |
| FR-017 | Microphone permission denied, no microphone, or unsupported recording: the composer shows a clear reason and how to enable; text and attachments keep working; when unsupported, the record button is disabled with an explanation. | Must | AC-020 |
| FR-018 | Voice notes are stored as attachments in the private attachments storage with duration and waveform metadata; audio MIME types are accepted only for voice notes. | Must | AC-021 |
| FR-019 | Chrome and Edge desktop: record and play are mandatory. Firefox and Safari desktop: best effort — a note recorded in Chrome either plays or shows a clear "cannot play" message. | Must | AC-017, AC-022 |
| FR-020 | Star/unstar is available on messages in the production feed; stars are personal (not visible to others), persist, and apply across the user's devices; the star state is visible on the message. | Must | AC-023 |
| FR-021 | A conversation-header control switches the feed to "my starred messages in this conversation", ordered by message date (newest first), paginated, including messages outside the initially loaded page; it switches back to the normal feed. | Must | AC-024 |
| FR-022 | Selecting a starred result returns to the normal feed, loads history (with a loading indicator) until the message is present, scrolls to it, and highlights it. If the message is no longer accessible, a notice appears and the feed stays stable. | Must | AC-025, AC-026 |
| FR-023 | Desktop notifications for new messages from others in direct and group conversations when the tab is hidden or the drawer is not open on that conversation; permission is requested explicitly by a user action; denied permission disables notifications without affecting messaging. No notifications for own messages or room conversations. | Must | AC-027, AC-028 |
| FR-024 | When sending text and/or attachments fails, the composer keeps the text, reply target, and pending files, with an error and a retry action. | Must | AC-029 |
| FR-025 | After the existing Realtime reconnect, receipts, stars, and attachment messages shown in the feed are consistent with the server (refreshed through the existing cache/subscription paths). | Must | AC-030 |

## 8. Business rules

| ID | Rule | Rationale |
|---|---|---|
| BR-001 | "Read" = the message was visibly rendered on the recipient's screen with the drawer open on that conversation and the tab visible/focused. Opening a conversation does not by itself mark unseen messages read. | Faithful to actual reading (R1-q4). |
| BR-002 | A sender never generates a read receipt for their own message. | R1-q16-B. |
| BR-003 | Only the message's sender can see reader identities/times. Receipts are always on; there is no opt-out. | R1-q5. |
| BR-004 | The summary shows only "Lida por N" and the readers list; no "of M" denominator and no unread-members list. | Membership changes over time (R2-q11). |
| BR-005 | The unread counter follows BR-001 (example: 20 unread, only the last 5 seen → counter shows 15 until the user scrolls). | R3-b. |
| BR-006 | Attachments: max 5 per message, 10 MB each, allowlist per FR-008; audio types only for voice notes. | Existing server/bucket limits (R1-q6, q7). |
| BR-007 | A message with attachments is created only after all its uploads succeed; no partially-attached message is ever visible. | R1-q9. |
| BR-008 | Voice notes are at most 2 minutes. | R1-q11. |
| BR-009 | Stars are personal; the starred list is ordered by message date, newest first. | R2-q14. |
| BR-010 | Desktop notifications only for others' messages in direct/group conversations, only when the tab is hidden or the drawer is not open on that conversation. | R2-q3. |
| BR-011 | Attachments and voice notes are reachable only by conversation members via short-lived signed URLs; never by public URL. | R1-q16-A. |
| BR-012 | Migration gate (amended 2026-10-04 by the owner): during the phase every migration is applied to the local database and tested only. When all other phase work is complete, all phase migrations are applied to the online target `vhabpcoyypobgasacsko` together, after the owner is notified (migration list, target, rollback) and gives OK, followed by catalog readback and a smoke check. The phase is not complete until this is done. | R1-q17 note, R2-q6 note, R3-a; amendment: owner 2026-10-04 ("vamos fazer isso quando toda a fase estiver finalizada"). |
| BR-013 | Every migration is additive/backward compatible with the currently published application. | R2-q7. |
| BR-014 | No new paid service (storage tier, transcoding, media SaaS). | R1-q16-D. |
| BR-015 | Identity: RLS and routes resolve the app user via `users.supabase_uid = auth.uid()::text`; foreign keys use `users.id`; never compare `users.id` with `auth.uid()`. | R1-q16-E. |
| BR-016 | Tests: new tests are integration and E2E; unit tests only when strictly necessary, with written justification. In messaging test files this phase touches, tests that only mirror implementation are replaced by equivalent integration/E2E coverage and then removed, each removal recorded with reason in TRACK; no test is removed without equivalent coverage. | R1-q18 note, R2-q8. |
| BR-017 | Existing drawer behavior must not regress: text, replies/threads, reactions, typing, history loading, real-time delivery, current reconnect. | R1-q16-C, R2-q2. |

## 9. Data and integrations

### Data inputs
- `message_read_receipts(id, message_id, user_id, read_at, conversation_id)` — existing; member-visible SELECT policy `read_receipts_in_own_conversations`; in the Realtime publication.
- `conversation_members` — membership for direct/group/room (`private.is_conversation_member`).
- Message attachments metadata and the private `attachments` storage bucket (existing upload/read routes: `src/app/api/messages/upload/route.ts`, `src/app/api/messages/attachment/[id]/route.ts`).
- Message stars (existing route `src/app/api/messages/[messageId]/star/route.ts`, repository `getStarredMessages(userId, conversationId?)`; no list route exists yet).
- Voice-note metadata: duration and waveform (type `VoiceNoteAttachment` exists).

### Data outputs
- Receipts written per BR-001; reader details returned to the sender only.
- Attachment and voice-note records linked to sent messages; storage objects deleted for cancelled/failed uploads.
- Paginated starred-message results per user and conversation.

### Integrations
- Supabase Postgres, Storage, Auth, Realtime (existing project contracts).
- Browser APIs: MediaRecorder/getUserMedia (voice), Notifications API, Page Visibility, IntersectionObserver-equivalent visibility detection, Drag and Drop, Clipboard.
- Phase 3 spatial-audio microphone state (mute/restore during recording).

## 10. Constraints and assumptions

### Constraints
- Next.js App Router, React, strict TypeScript, Supabase, TanStack Query, shadcn/ui/Radix; reuse existing repositories/routes/hooks; server routes use `createSupabaseServerClient` and `auth.getUser()`.
- Browser floor: Chrome and Edge desktop mandatory; Firefox/Safari best effort.
- Limits: 10 MB per file, 5 files per message, voice ≤ 2 min.
- Database: local only during the phase; all phase migrations applied online together at phase end after the owner's OK (BR-012, amended 2026-10-04); additive migrations (BR-013); online target `vhabpcoyypobgasacsko` (historical migration-provenance concern must be preflighted before the first online application).
- Application deployment is owned by the owner; this phase ends with the application verified locally against the online database.
- No new paid services.

### Assumptions
Only assumptions explicitly confirmed by the user:
- Delivery in ordered slices within this single SPEC (e.g., receipts + starred → attachments → voice), with notifications and failed-send preservation placed by the plan (R1-q1).

## 11. Edge cases and failure modes

| Case | Expected behavior |
|---|---|
| Recipient has the drawer open but the tab in background | No receipt; receipt recorded when the tab becomes visible with the message on screen. |
| Recipient opens a conversation with 20 unread, sees only last 5 | 5 receipts; unread counter shows 15 until scrolling reveals the rest. |
| Sender views own message | No receipt for the sender; summary counts only other members. |
| Non-sender member tries to get reader details (UI or app API) | Not shown/denied. |
| Room with many readers | Reader list scrolls; most recent first. |
| File > 10 MB, disallowed type, or a 6th file | Rejected before upload with a clear message; server also rejects. |
| One of several uploads fails | Error on that file with retry; message not sent until all succeed or the file is removed. |
| User cancels/removes a pending file | Upload aborted; stored object deleted; never visible. |
| User closes the tab mid-upload | No message is created; the file is never visible to anyone. |
| Send fails (network/server error) | Text, reply target, and files stay in the composer with error and retry. |
| Non-member requests an attachment URL/ID | Denied; no public URL exists. |
| Mic permission denied / no device / unsupported | Clear message; text and attachments work; record disabled when unsupported. |
| Recording reaches 2 minutes | Auto-stops; warning shown from 1:50. |
| Room mic open when recording starts | Muted with notice; restored on stop/discard/send. Room mic previously muted → remains muted. |
| Chrome-recorded note opened in Safari/Firefox | Plays, or shows a clear "cannot play" message. |
| Starred message is older than loaded history | History loads with indicator until reached; scroll + highlight. |
| Starred message no longer accessible (user left/removed from conversation) | Notice; feed stays stable. |
| User stars on one device | Star state appears on the user's other devices after refresh/cache update. |
| Notification permission denied/unsupported | No notifications; messaging unaffected. |
| New DM while the user is viewing that DM with the tab visible | No notification. |
| New room message while tab hidden | No notification (rooms excluded). |
| Realtime reconnects | Existing reconnect continues working; receipts/stars/attachments consistent after reconnect. |

## 12. Security, privacy, compliance, and abuse considerations

- Attachments/voice in a private bucket; reads via short-lived signed URLs after membership authorization (BR-011).
- Reader details restricted to the sender at the application UI/API (BR-003). The current RLS lets any member select all receipts of a conversation; whether table-level reads are also narrowed is decided in planning subject to BR-013 compatibility, and recorded.
- Server-side enforcement of size/type/count limits; audio MIME accepted only for voice notes; per-message attachment cap limits abuse.
- Authorization via `auth.getUser()`; service role never replaces membership checks; identity per BR-015.
- Every migration, RLS/storage policy, repository, or route change passes the Supabase/RLS review gate.

## 13. Accessibility, localization, and usability considerations

- All new controls (attach, remove/cancel, retry, record/stop/send/discard, play/pause, star, starred filter, reader list) are keyboard operable with screen-reader labels.
- Works at the current drawer width, including narrow screens.
- UI copy follows the existing application language (Portuguese strings such as "Lida por N").
- Portal menus/popovers stop pointer/click/key propagation per project UI rules.

## 14. Acceptance criteria

- AC-001 (FR-001, BR-004): Given A sent a message in a direct, a group, and a room conversation, when 1 or more other members read it, then A sees "Lida por N" with N equal to the distinct non-sender readers, with no denominator.
- AC-002 (FR-002, BR-004): Given a message read by B then C, when A opens the summary by click or keyboard, then A sees C then B with avatar, name, and read time, and no not-read list.
- AC-003 (FR-003, BR-003): Given B (non-sender member) and A's message read by C, when B views the message and calls the application API for its details, then B sees no reader identities/times and the API returns no reader details to B.
- AC-004 (FR-004, BR-001, BR-005): Given B has the drawer open on the conversation, when the message is off-screen or the tab is hidden, then no receipt exists; when the tab is visible and the message is on screen, then a receipt exists. Given 20 unread and only 5 visible, then exactly 5 receipts exist.
- AC-005 (FR-004, BR-002): Given A views their own messages, then no receipt with A's user is created for them.
- AC-006 (FR-005): Given A has the conversation open, when B reads A's message, then A's summary/list updates without reload.
- AC-007 (FR-006, BR-005): Given B has 20 unread in a conversation, when B opens it and sees only the last 5, then the list counter shows 15; after scrolling all into view, it shows 0.
- AC-008 (FR-007): Given the production drawer, when A picks files via the file button or drops files onto the composer, then they appear as pending attachments.
- AC-009 (FR-008, BR-006): Given A adds a 6th file, a file > 10 MB, or a disallowed type, then it is rejected with a clear message before upload; a direct request bypassing the UI is rejected by the server.
- AC-010 (FR-008): Given A sends a message with attachments and no text, then B receives an attachment-only message.
- AC-011 (FR-009, BR-007): Given A sends 3 files, then per-file progress is shown and B sees the message only after all 3 uploads complete, never partially attached.
- AC-012 (FR-009): Given one upload fails, then that file shows an error and retry; retry succeeds and the message can be sent.
- AC-013 (FR-010): Given A removes/cancels a pending file or an upload fails and is abandoned, then the storage object is deleted (or never referenced) and no user can see it; given A closes the tab mid-upload, then no message exists and the file is not visible.
- AC-014 (FR-011): Given B receives an image and a PDF, then B sees an inline thumbnail that opens a larger view and a card with icon, name, size, and download.
- AC-015 (FR-011, BR-011): Given C is not a member, when C requests the attachment via the application API or a guessed storage path, then access is denied; given a member, content loads via a signed URL that expires.
- AC-016 (FR-012, Should): Given an image in the clipboard, when A presses Ctrl+V in the composer, then it becomes a pending attachment.
- AC-017 (FR-013, FR-015, FR-019): Given Chrome or Edge with mic permission, when A records, stops, previews, and sends a voice note, then a live waveform and timer were shown during recording, and both A and B can play it with play/pause, duration, and progress.
- AC-018 (FR-014, BR-008): Given A records continuously, then a warning appears at 1:50 and recording auto-stops at 2:00 with the note ready to preview/send.
- AC-019 (FR-016): Given A's room mic is open, when A starts recording, then the room mic is muted with a visible notice; after send, discard, or stop, it returns to open; given it was muted, it remains muted.
- AC-020 (FR-017): Given mic permission is denied (or no device/unsupported), when A tries to record, then a clear reason and guidance appear, and A can still send text and files; when unsupported, the record button is disabled with explanation.
- AC-021 (FR-018, BR-006, BR-011): Given a voice note is sent, then it is stored in the private attachments storage with duration and waveform metadata; given an audio file is uploaded as a regular attachment, then it is rejected.
- AC-022 (FR-019): Given a note recorded in Chrome, when opened in Firefox or Safari, then it plays or shows a clear cannot-play message (checked at least once per browser available; result recorded).
- AC-023 (FR-020, BR-009): Given A stars a message, then the star shows for A on that message and on A's other session after refresh, B sees no star from A, and unstarring removes it.
- AC-024 (FR-021, BR-009): Given A starred messages including one older than the first loaded page, when A toggles the starred filter, then A sees only their starred messages in that conversation ordered by message date newest first, including the old one, with pagination; toggling back restores the normal feed.
- AC-025 (FR-022): Given A selects an old starred result, then the normal feed loads history with a visible loading indicator until the message is present, scrolls to it, and highlights it.
- AC-026 (FR-022): Given the starred message is no longer accessible to A, when A selects it, then a notice appears and the feed remains stable (no error screen, no infinite loading).
- AC-027 (FR-023, BR-010): Given B granted permission via an explicit action, when A sends B a DM or a group message while B's tab is hidden or the drawer is not on that conversation, then B gets a desktop notification; when B is viewing that conversation with the tab visible, or the message is B's own, or it is a room message, then no notification.
- AC-028 (FR-023): Given notification permission is denied or unsupported, then no notification is attempted and messaging works normally.
- AC-029 (FR-024): Given a send fails, then the text, reply target, and pending files remain in the composer with an error and retry; retry sends exactly one message.
- AC-030 (FR-025, BR-017): Given the Realtime connection drops and the existing reconnect restores it, then receipts, stars, and attachment messages displayed match the server, and existing reconnect behavior is unchanged.
- AC-031 (BR-017): After each slice, the regression E2E covering text send, reply/thread, reaction, typing indicator, history loading, and real-time delivery between two accounts passes.
- AC-032 (BR-012, amended 2026-10-04): For every migration created in this phase, TRACK records local application + passing tests; at phase end, TRACK records the owner notification (list, target, rollback), the owner's OK, online application of every phase migration to `vhabpcoyypobgasacsko`, catalog readback, and smoke result.
- AC-033 (BR-013): Each migration is reviewed as additive, and after online application the existing (pre-phase) messaging flows smoke-checked against the online database still work.
- AC-034 (BR-014): The phase diff adds no paid service, SDK, or storage/transcoding provider; dependency additions (if any) are free and listed in TRACK.
- AC-035 (BR-015, BR-011): The Supabase/RLS review gate passes for every migration, policy, repository, and route change, including the users.id vs supabase_uid check.
- AC-036 (BR-016): New tests are integration/E2E; any unit test added carries a written justification; every removed test is listed in TRACK with reason and the replacing integration/E2E test.
- AC-037 (Section 13): New controls are reachable and operable by keyboard with accessible names, and the drawer flows work at narrow width (verified in E2E or recorded manual check).

## 15. Test strategy

- Test levels:
  - Integration (local Supabase Postgres/Storage): receipt write rules (visibility-driven API, no sender receipts), sender-only reader-detail API, attachment limits/MIME/count, signed-URL authorization and non-member denial, orphan cleanup, starred list pagination/order, any new RPC/route/policy and its RLS.
  - E2E (Playwright, two real authenticated accounts, Chrome): one test per flow — receipts (incl. live update and unread counter), attachments (pick/drag, progress, failure/retry, previews), voice (fake media device; record/preview/send/play; 2-min limit can use a test-configurable clock if needed without changing the product limit; room-mic mute/restore), starred (filter, old message jump, inaccessible notice), notifications (granted/denied permission, hidden tab), failed-send preservation, reconnect consistency, and the existing-messaging regression suite.
  - Unit: only when strictly necessary (e.g., a pure waveform/duration computation that cannot be meaningfully covered otherwise), with justification recorded.
- TDD from acceptance criteria where practical: each test names its AC ID.
- Test data: two seeded accounts in the same company with a direct, a group, and a room conversation; a conversation with > 1 page of history containing an old starred message; sample files of each allowed type, an oversized file, and a disallowed type.
- Environments: local Supabase for integration/E2E; online target only for post-migration readback and smoke (BR-012); Firefox/Safari checks recorded best effort.
- Existing tests: handled per BR-016.
- Mandatory failure-path tests: oversized/disallowed/6th file, upload failure + retry, cancel/remove cleanup, non-member attachment access, non-sender reader-detail access, mic denied/unsupported, notification denied, send failure preservation, inaccessible starred message.
- Completion also requires `npm run type-check`, `npm run lint`, and `npm run build` passing.

## 16. Validation and launch checklist

- All Must FRs and AC-001..AC-037 (except AC-016 as Should) have evidence in TRACK.
- Every migration applied online per BR-012 with readback and smoke recorded (AC-032/AC-033).
- Supabase/RLS review gate passed (AC-035).
- Type-check, lint, build, integration, and E2E pass; regression suite passes.
- Owner UAT in the browser with two accounts.
- Hand-off states the application is ready to deploy against the online database; deployment is performed by the owner.

## 17. Open questions

Non-blocking; resolved in planning/execution with evidence:
- Whether to also narrow table-level RLS on `message_read_receipts` to the sender/own rows, if compatible with the published app (BR-013).
- Exact audio container/codec meeting the Chrome/Edge floor and the Safari/Firefox best-effort rule.
- Desktop-notification click behavior beyond the browser default (focusing the window); opening the specific conversation may be added if trivial and is not a gate.
- Storage reclamation for uploads abandoned by closing the tab (they are never visible per FR-010); a scheduled job is not required by this SPEC.
