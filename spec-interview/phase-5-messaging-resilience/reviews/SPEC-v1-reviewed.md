# SPEC: Phase 5 — Messaging Resilience

Goal: In the production messaging drawer, no message a user sends is lost or duplicated across network and Realtime outages, reloads, several tabs, and several devices; typing, unread state, and @mention notifications stay live and correct; and messaging health is observable through redacted logs — without regressing existing messaging.

Status: Draft — pending adversarial review and owner approval. Interview rounds 1–2 and confirmation recorded in `state.md` (Verdict: Ready).

## 1. Summary

The Virtual Office messaging drawer (`MessagingDrawer` → `MessageFeed` → `MessageComposer` / `MessageItem`, state in `MessagingContext`, data in `useMessages` / `useConversations`, Realtime in `useMessageSubscription` / `useConversationRealtime`, typing in `useConversationPresence`) was completed for timeline features in Phase 4. Phase 4 also delivered a failed send that keeps text/reply/files with a single-message retry (`clientMessageId` idempotency), a Realtime catch-up after reconnect, and opt-in desktop notifications for DM/group messages. This phase adds: a persistent per-user offline outbox for text messages; a connection banner; automatic reconnection of every messaging Realtime channel with polling fallback; a reliable, named, members-only typing indicator; live cross-device unread sync; @mentions with desktop notifications (including rooms); messaging health metrics as redacted server logs; and two Phase 4 database follow-ups plus restoring the open conversation after reload.

## 2. Problem statement

Workspace members using the chat on unstable networks or sleeping laptops lose work and trust: a message sent offline fails and must be retried by hand, a reload discards it, and nothing tells the user the chat is disconnected. If Realtime drops, the conversation-list channel never reconnects by itself and there is no fallback, so new messages and unread counts silently stop updating. The typing indicator disappears after ~4 s of continuous typing and is broadcast on a public channel. Reading a conversation on one device leaves stale unread badges on the user's other devices. There is no way to mention someone, so room conversations (which never notify) cannot reach a specific person. Nobody can tell in production whether messaging is healthy.

## 3. Goals and success metrics

### Goals
- G1: A text message the user sends is never silently lost: it is delivered, pending, or visibly failed with an action.
- G2: No message is ever stored or shown twice because of automatic resends, several tabs, or lost responses.
- G3: Messaging recovers from network and Realtime outages without user action, and keeps updating through polling while Realtime is down.
- G4: Typing indicators are reliable, named, and visible only to conversation members.
- G5: Unread/read state and own sent messages stay in sync live across the same user's tabs and devices.
- G6: A user can @mention conversation members, and the mentioned person is notified on the desktop, including in rooms.
- G7: Messaging health (latency, delivery, connection) is observable in technical logs without exposing content.
- G8: No existing messaging behavior regresses; every database change reaches the online target in a controlled, verified way at phase end.

### Success metrics
- Pending messages are delivered within 10 s after connectivity returns, without any click, in their original order, each exactly once.
- With Realtime down and HTTP working, other members' new messages appear within 45 s of the outage start, and within 15 s of being sent once polling is active (plus request time).
- Each flow above is covered by a passing two-account (and, where relevant, two-tab / two-device) Playwright E2E test that passed 3 consecutive runs.
- The existing messaging regression E2E suite passes after each slice.
- Every migration written in this phase is applied to the online target `vhabpcoyypobgasacsko` at phase end with explicit owner authorization, catalog readback, and a runtime smoke check.
- Owner final test (new app against the online database) accepts the phase.

## 4. Users and stakeholders

### Primary users
- All workspace members who use the chat in direct, group, and room conversations (members of `conversation_members`), as sender, recipient, or mentioned user.

### Secondary users
- The same user on several tabs of one browser and on several devices/browsers at once.
- The owner/operator, who reads the messaging metric logs.

### Stakeholders
- Owner (Giuliano): approves the SPEC, performs the final test, authorizes the online migrations at phase end, and deploys the application.

## 5. Scope

### In scope
- Persistent offline outbox (IndexedDB, per application user, per browser) for text messages and replies; pending state in the feed; cancel; ordered automatic drain; rejection, rate-limit, and 24 h expiry handling; session-expiry and sign-out rules.
- Connection banner in the drawer ("Sem conexão" / "Reconectando…").
- Automatic reconnection with exponential backoff for every messaging Realtime channel (feed/receipts/reactions channel and the conversation-list channel) with catch-up.
- Polling fallback after > 30 s of Realtime outage, while the tab is visible.
- Typing indicator: continuous display while typing, names, DM/group/room, private members-only channel, own sessions excluded, expiry.
- Live cross-device/tab sync of unread counters and read state, and of the user's own sent messages.
- @mentions: autocomplete of conversation members, highlighted mention, server-validated mention records, desktop notification (DM, group, room, thread reply), feed highlight for the mentioned user.
- Messaging metrics as redacted structured server logs via an authenticated application route.
- Phase 4 follow-ups: membership check inside `mark_conversation_read`; `get_unread_counts` not executable by `anon`; restore the open conversation after page reload.

### Out of scope
- Queuing attachments or voice notes offline (they keep the Phase 4 composer failure + "Tentar de novo").
- Editing a pending message (cancel and rewrite instead).
- Web Push / service worker / notifications with the browser or tab closed.
- `@todos` / `@here`; a separate mention-only notification preference; scrolling to the message on notification click.
- Draft persistence (same device or across devices); live sync of stars; cross-device dismissal of notifications.
- Usage/engagement metrics (messages per day, active conversations); a metrics UI or external analytics service.
- Safari and mobile browsers; drawer layout below ~400 px.
- Other Phase 4 follow-ups: pending-upload cap, toaster covering the composer, pin no-op/English copy, orphan storage objects, "Favoritas" discoverability.
- Deploying the application (owner action).

## 6. User journeys

- J1 Offline send: A loses internet, keeps writing; each message appears as "pendente" with a clock; the banner says "Sem conexão — mensagens serão enviadas quando voltar". Internet returns; within 10 s every pending message is delivered in order and B sees each once.
- J2 Reload while offline: A reloads with pending messages; they are still pending after reload and deliver when back online.
- J3 Two tabs: A has two tabs; the pending message shows in both; only one tab sends it; cancelling in either removes it from both.
- J4 Rejection: A's pending message targets a room A has since lost access to; it turns into a visible failure with the text kept and "Tentar de novo" / "Apagar"; later pending messages for that room wait; messages for other conversations still deliver.
- J5 Sign-out: A clicks Sair with 2 pending messages; a dialog warns that leaving deletes them; A chooses Cancelar or Sair mesmo.
- J6 Realtime outage: the WebSocket drops; after 5 s the banner shows "Reconectando…"; after 30 s the open conversation and the list update every 15 s by polling; when Realtime returns, polling stops and the banner disappears.
- J7 Typing: B types continuously in a group; A sees "Bruno está digitando…" the whole time; it disappears ≤ 5 s after B stops.
- J8 Two devices: A reads conversation X on the laptop; the desktop's badge for X clears without reload.
- J9 Mention: A types "@" in a room chat, picks Bruno; Bruno's tab is hidden; Bruno gets "Ana mencionou você em <sala>" with the full message text; clicking opens the room; the message is highlighted for Bruno.
- J10 Reload restore: A reloads with the drawer open on conversation X; the drawer reopens on X.

## 7. Functional requirements

| ID | Requirement | Priority | Acceptance signal |
|---|---|---|---|
| FR-001 | When A sends a message with text and/or a reply target and no attachments, and the browser is offline or the create request fails transiently (network error, timeout, 5xx, rate limit), the message is stored in A's persistent outbox and shown in the feed as pending (clock icon + "pendente" text) instead of the Phase 4 composer failure; the composer clears. | Must | AC-001, AC-003 |
| FR-002 | Pending messages are sent automatically when connectivity returns (browser online, successful Realtime reconnection, or periodic retry), per conversation in creation order, one in flight per conversation, reusing each message's `clientMessageId`; delivered within 10 s after connectivity returns; the pending item becomes the normal sent message. | Must | AC-002, AC-038 |
| FR-003 | The outbox survives reload and closing the tab; pending messages of the current user appear in every tab of the same browser; at most one tab sends a given pending message at a time. | Must | AC-004, AC-005 |
| FR-004 | A pending message that is not currently in flight can be cancelled from any tab; it disappears from all tabs and is never sent. While in flight it shows "enviando" without cancel. | Must | AC-006 |
| FR-005 | A definitive rejection (BR-005) stops automatic attempts for that message; it shows as failed in the feed with its text preserved and actions "Tentar de novo" and "Apagar"; later pending messages of the same conversation wait until it is resolved; other conversations are unaffected. | Must | AC-007, AC-008 |
| FR-006 | A rate-limit rejection is transient: the message stays pending and is retried automatically (honoring a server retry delay when provided), preserving order and without duplicates. | Must | AC-009 |
| FR-007 | A pending message older than 24 h from when the user pressed send is never sent automatically; it shows as failed ("expirada") with "Tentar de novo" (manual send) and "Apagar". | Must | AC-010 |
| FR-008 | A message with attachments or a voice note is not queued: offline or on failure it keeps the Phase 4 behavior (stays in the composer with failure message and "Tentar de novo"). | Must | AC-011 |
| FR-009 | The outbox is scoped to the application user (`users.id`) on that browser. If the session ends without an explicit sign-out (expiry, revocation), the outbox is kept and drains only after the same user signs in again (subject to FR-007); another user signing in on that browser never sees, sends, or deletes it. | Must | AC-012 |
| FR-010 | When the user clicks Sair (any in-app sign-out entry point) with N > 0 pending/failed outbox messages, a dialog shows "Você tem N mensagens não enviadas. Sair apaga essas mensagens." with "Sair mesmo" (deletes that user's outbox, then signs out) and "Cancelar" (keeps session and outbox). With N = 0 sign-out is unchanged. | Must | AC-013 |
| FR-011 | The drawer shows a discreet banner: "Sem conexão — mensagens serão enviadas quando voltar" as soon as the browser reports offline; "Reconectando…" when messaging Realtime has been disconnected for more than 5 s while the browser is online; the banner disappears by itself once connectivity and Realtime are restored. | Must | AC-014 |
| FR-012 | Every messaging Realtime channel (messages/receipts/reactions and the conversation list) reconnects automatically after `TIMED_OUT`, `CHANNEL_ERROR`, or `CLOSED`, with exponential backoff and a capped delay, resumes subscriptions without user action, and runs a catch-up refetch of the open feed and the conversation list on resume. | Must | AC-015 |
| FR-013 | Polling fallback: while messaging Realtime has been disconnected for more than 30 s and the tab is visible, the app fetches the open conversation's new messages and the conversation list (unread counts) every 15 s; when the tab becomes visible while still disconnected it fetches immediately, then every 15 s; no polling while the tab is hidden; polling stops once Realtime is connected again. | Must | AC-016 |
| FR-014 | The typing indicator stays visible while the other person types continuously and disappears at most 5 s after they stop typing, blur the composer, send, leave the conversation, or close the tab. | Must | AC-017 |
| FR-015 | The indicator names typists: 1 → "Ana está digitando…", 2 → "Ana e Bruno estão digitando…", 3+ → "N pessoas estão digitando…", in direct, group, and room conversations. | Must | AC-018 |
| FR-016 | Typing signals travel on a private Realtime channel authorized so that only members of that conversation can join and receive them. | Must | AC-019 |
| FR-017 | A user never sees their own typing indicator, including from their other tabs or devices. | Must | AC-020 |
| FR-018 | When the user reads messages on one tab/device, the unread counters and read state on their other tabs/devices update live, without reload, focus change, or reconnect. | Must | AC-021 |
| FR-019 | A message the user sends from one device/tab appears on their other devices/tabs live. | Must | AC-022 |
| FR-020 | In the composer, typing "@" opens a list of the conversation's current members (excluding the user), filtered as they type, operable by mouse and keyboard (arrows, Enter/Tab, Esc); choosing inserts a highlighted mention. In a room the list contains only members of the room conversation. | Must | AC-023 |
| FR-021 | The server records a message's mentions as application user IDs and accepts only users who are members of the conversation at send time (excluding the sender); any other "@name" stays plain text and creates no mention. | Must | AC-024 |
| FR-022 | With the Phase 4 desktop-notification toggle on and permission granted, a mentioned user receives a desktop notification for a message that mentions them in a direct, group, or room conversation, including thread replies, under BR-011; title "<Autor> mencionou você em <conversa>", body the full message text; clicking opens the conversation in the drawer; exactly one notification per message. | Must | AC-025, AC-026 |
| FR-023 | Mentions render distinctly for everyone in the feed; a message that mentions the viewing user is highlighted for that user. | Must | AC-027 |
| FR-024 | The client records metric events — send latency (press → server confirmed), time spent in the outbox, send outcomes by reason (success, no network, lost access, invalid, expired, rate limited), Realtime drops/reconnections and outage duration, polling activations and duration — and sends them in batches to an authenticated application route that writes structured log lines under BR-013. Unauthenticated requests are rejected and not logged. | Must | AC-028 |
| FR-025 | Metric collection and delivery never block, slow, or break messaging: if the metrics route fails, messaging behaves normally and no error is shown. | Must | AC-029 |
| FR-026 | `mark_conversation_read` refuses to mark a conversation for a user who is not a member of it. | Must | AC-030 |
| FR-027 | `get_unread_counts` is not executable by the `anon` role; authenticated use keeps working. | Must | AC-031 |
| FR-028 | After a page reload, if the drawer was open, it reopens on the same conversation for the same user on the same browser; if that conversation is no longer accessible, the conversation list opens without an error. | Must | AC-032 |
| FR-029 | Existing messaging behavior (Phase 4 flows: receipts, attachments, voice notes, stars, DM/group notifications, failed-send retry for attachment messages, reconnect catch-up) does not regress. | Must | AC-033 |

## 8. Business rules

| ID | Rule | Rationale |
|---|---|---|
| BR-001 | The outbox belongs to one application user (`users.id`) on one browser. It is never read, sent, or deleted while another user is signed in. | R1-q3 A, R1-q16 A, R2-q5 A |
| BR-002 | Only text messages and replies without attachments/voice are queued. | R1-q4 A |
| BR-003 | Per conversation, outbox messages are sent in creation order, one in flight at a time; a failed (definitive or expired) message blocks later messages of that conversation until the user retries or deletes it. Conversations are independent. | R1-q5 A, R1-q2 E |
| BR-004 | Each outbox message gets a stable `clientMessageId` when the user presses send; every attempt (automatic, manual, any tab) reuses it; the server stores at most one message per (sender, conversation, `clientMessageId`). | R1-q2 B, R1-q16 B |
| BR-005 | Send outcome classes: transient = browser offline, network error, timeout, HTTP 5xx, rate limit (429) → stay pending and retry automatically; session = 401 → hold until the same user is authenticated again; definitive = no access / conversation not found (403 `NOT_PARTICIPANT`, 404), invalid content (400, 413 `CONTENT_TOO_LARGE`, 422), `CLIENT_MESSAGE_ID_REUSED` (409) → failed, no automatic retry. | R1-q5 C, R2-q4 A, R2-q5 A |
| BR-006 | Expiry: a message still unsent 24 h after the user pressed send becomes failed ("expirada") and is never sent automatically; a manual "Tentar de novo" sends it with the same `clientMessageId`. | R1-q5 D, R2-q3 B |
| BR-007 | Cancel is available only while a message waits (not in flight). A cancelled message is removed from the outbox in all tabs and never sent. | R1-q5 B, R2-q7 A |
| BR-008 | An explicit user sign-out with outbox messages requires confirmation; confirming deletes that user's outbox. A sign-out not initiated by the user (expiry, revocation) keeps it. | R2-q5 A, R2-q6 A |
| BR-009 | Typing: only conversation members receive typing signals; a user's own typing (any session) is never shown to them; an indicator expires ≤ 5 s after the last typing signal. | R1-q8 A, D, E; R1-q16 E |
| BR-010 | Mentions: only users who are current members of the conversation at send time can be mentioned (rooms: members of the room conversation); self-mentions are not recorded; `@todos`/`@here` do not exist. | R1-q10 A, E; R2-q10 A |
| BR-011 | Desktop-notification eligibility (extends Phase 4): toggle on and permission granted; never for the user's own message; never while that conversation is in view in a visible tab; DM/group: every new message; room: only messages that mention the user; at most one notification per message across the user's tabs. | R1-q10 B, R1-q16 C, R2-q8 A, R2-q9 A–C |
| BR-012 | Polling runs only while messaging Realtime is disconnected for more than 30 s and the tab is visible, every 15 s (immediately on becoming visible), and stops when Realtime reconnects. | R1-q7 A, R1-q16 D, R2-q12 C |
| BR-013 | Metric log lines contain only event type, outcome/reason, durations/counts, conversation type, timestamp, and app version — never message text, attachment names, conversation names, user names or emails, or user/conversation identifiers. | R1-q12 B, R2-q2, confirmation point 9 |
| BR-014 | Database rollout: migrations stay local during the phase (written + applied locally with recorded rollback SQL); at phase end they are applied to `vhabpcoyypobgasacsko` only with explicit owner authorization, followed by catalog readback and a runtime smoke check; the application is deployed by the owner after the migrations; rollback is app first, then migrations. | R1-q13 A |
| BR-015 | Tests: only integration (real local Supabase/API route) and E2E (real UI, Playwright); no new unit tests; a touched unit test is replaced by integration/E2E coverage and deleted, recorded in TRACK. Each new E2E spec counts only after 3 consecutive passing runs. | AGENTS.md test policy, R2-q13 A |
| BR-016 | Conversation restore is per browser and per user: a different user signing in never reopens the previous user's conversation; a closed drawer stays closed. | R2-q11 A, B, D |

## 9. Data and integrations

### Data inputs
- Composer text, reply target, and mention selections (user IDs) per message.
- Browser connectivity events (`online`/`offline`), Realtime channel status, tab visibility.
- Server responses from `POST /api/messages/create` (status, `clientMessageId` replay, rate-limit retry delay when present).

### Data outputs
- Browser IndexedDB outbox, keyed by application user ID: `clientMessageId`, conversation ID, text, reply target, mention user IDs, created-at, attempt state, failure reason. Deleted per BR-007/BR-008; never shared across users.
- Database: message mention records (message ID + mentioned application user ID), readable under the same conversation-membership rules as the message.
- Realtime authorization policy for private typing topics (members only).
- `mark_conversation_read` with an internal membership check; `get_unread_counts` without `anon` EXECUTE.
- Structured metric log lines (BR-013) from an authenticated application route.
- Persisted drawer state per user: open flag + active conversation ID (browser storage).

### Integrations
- Supabase Postgres, Realtime (`postgres_changes`, private broadcast topics with RLS on `realtime.messages`), Auth (server routes use `createSupabaseServerClient` + `auth.getUser()`).
- Browser APIs: IndexedDB, Web Locks/BroadcastChannel or equivalent for cross-tab coordination, Notification API (existing Phase 4), Page Visibility.
- Hosting logs (Vercel) and/or Supabase logs as the metrics sink — no new external analytics dependency.

## 10. Constraints and assumptions

### Constraints
- Next.js App Router, TypeScript strict, Supabase, TanStack Query; reuse existing hooks, repositories, API routes, and query keys (`['messages', id]`, `['conversations', userId]`, …) rather than parallel implementations.
- Identity: RLS compares `users.supabase_uid` with `auth.uid()::text`; foreign keys use `users.id`; messages link to rooms through `conversations.room_id`.
- Browsers: Chrome and Edge desktop (automated), Firefox desktop. Safari and mobile not required.
- Background notifications are page-level only (tab open but hidden); no service worker.
- No message text or names in metrics (BR-013); no new external analytics service.
- The sign-out confirmation must not change the existing presence logout sequence (presence-safety rules apply to that touch point).
- Online database changes only at phase end with explicit authorization (BR-014); the hosted app currently runs the pre-Phase-4 build until the owner deploys.
- Repository test policy (BR-015); type-check, lint, and build must pass.

### Assumptions
- None beyond the user-confirmed answers recorded in `state.md`.

## 11. Edge cases and failure modes

| Case | Expected behavior |
|---|---|
| Request reaches the server but the response is lost | Message stays pending; the retry reuses `clientMessageId`; server returns the stored message; exactly one message exists (AC-038). |
| Two tabs come online at the same time with the same outbox | Only one tab sends each message; each is stored and shown once (AC-005). |
| User cancels in tab 2 while tab 1 is about to send | Cancel only while waiting; once in flight the item shows "enviando" without cancel; no message sent after a completed cancel (AC-006). |
| Lost access to the conversation before reconnect | First message fails definitively with text kept; later messages of that conversation wait; other conversations deliver (AC-007). |
| Access regained after a definitive failure | "Tentar de novo" delivers it; then the waiting messages deliver in order (AC-008). |
| Server rate limit during drain | Messages stay pending and retry automatically; order and uniqueness preserved (AC-009). |
| Laptop asleep > 24 h with pending messages | They become "expirada" failures, not sent automatically (AC-010). |
| Offline message with attachment or voice note | Not queued; Phase 4 composer failure + retry (AC-011). |
| Session expires while messages are pending; another user signs in on the same browser | The other user never sees or sends them; the original user's messages drain after they sign in again (AC-012). |
| User clicks Sair with pending messages | Confirmation dialog; Cancelar keeps everything; Sair mesmo deletes the outbox and signs out (AC-013). |
| IndexedDB unavailable (private mode, blocked storage) | Queue cannot persist: message keeps the Phase 4 composer failure + "Tentar de novo" — never silently dropped (AC-039). |
| Realtime drop shorter than 5 s | No "Reconectando…" banner (AC-014). |
| Realtime down > 30 s, tab hidden | No polling; on becoming visible, fetch immediately then every 15 s (AC-016). |
| Realtime back after polling | Polling requests stop; catch-up shows no duplicates (AC-015, AC-016). |
| Typist closes the tab or loses connection mid-typing | Indicator disappears ≤ 5 s (AC-017). |
| Non-member tries to join a typing topic | Join refused / no events received (AC-019). |
| "@name" for a non-member or forged mention ID in a direct API call | No mention recorded, no notification (AC-024). |
| Mention in a DM that would also notify as a DM | Exactly one notification (AC-026). |
| Mentioned user is viewing that conversation in a visible tab | No notification (AC-026). |
| Metrics route down or slow | Messaging unaffected, no visible error (AC-029). |
| Restored conversation no longer accessible after reload | Conversation list opens without error (AC-032). |

## 12. Security, privacy, compliance, and abuse considerations
- Outbox content lives only in the user's browser, scoped to their application user ID, and is deleted on explicit sign-out after confirmation; it is never exposed to another user on a shared browser.
- Typing topics become private and members-only (Realtime RLS on `realtime.messages`, using `users.supabase_uid = auth.uid()::text` → `users.id` membership).
- Mentions are validated server-side against conversation membership; clients cannot notify or tag non-members by forging IDs; mention records are readable only by conversation members.
- Notifications never leak content of conversations the user is not a member of.
- Metric logs follow BR-013 (no content, names, or identifiers); the metrics route requires authentication and bounds payload size and batch length to avoid log abuse.
- `mark_conversation_read` membership check and `anon` revoke on `get_unread_counts` close two Phase 4 findings.
- No service-role key in client code; service-role use never replaces application authorization checks.
- Every migration, RLS policy, route, and repository change passes the Supabase/RLS review gate.

## 13. Accessibility, localization, and usability considerations
- UI copy in Brazilian Portuguese, using the exact strings in this SPEC where given.
- Connection banner uses `role="status"` / polite live region; pending, sending, failed, and expired states have text labels, not only icons.
- Pending-item actions ("Cancelar", "Tentar de novo", "Apagar") and the sign-out dialog are keyboard-operable with visible focus; the dialog traps focus and Esc means Cancelar.
- The mention list follows the combobox/listbox pattern (arrow keys, Enter/Tab to select, Esc to close) and is announced to screen readers.
- The mention highlight does not rely on color alone.

## 14. Acceptance criteria

- AC-001 (FR-001, BR-002): Given A's browser context is offline, when A sends a text message in a conversation with B, then A's feed shows it as pending with a clock and the text "pendente", the composer is empty, and B does not see it.
- AC-002 (FR-002, BR-003, BR-004): Given A queued 3 messages offline in conversation X, when connectivity returns, then within 10 s and without any click B sees exactly those 3 messages, once each, in the original order, and A's items become normal sent messages.
- AC-003 (FR-001, BR-005): Given the browser reports online but A's create request fails with a network error, when A sends, then the message becomes pending (not a composer failure) and is delivered automatically once requests succeed.
- AC-004 (FR-003): Given A has a pending message, when A reloads the page while still offline, then the message is still pending; when back online it is delivered exactly once.
- AC-005 (FR-003, BR-004; must-not R1-q16 B): Given A has two tabs open, when A queues 2 messages offline in tab 1, then both appear as pending in tab 2; when both tabs come back online simultaneously, then B receives each message exactly once and the database holds exactly one row per `clientMessageId`.
- AC-006 (FR-004, BR-007): Given a waiting pending message, when A cancels it in tab 2, then it disappears from both tabs and is never delivered after reconnect; given an in-flight item, then it shows "enviando" and no cancel action.
- AC-007 (FR-005, BR-003, BR-005): Given A queued m1 and m2 in room conversation X and m3 in DM Y, and A lost access to X before reconnecting, when connectivity returns, then m1 shows as failed with its text and "Tentar de novo" / "Apagar", m2 stays waiting and is not sent, and m3 is delivered.
- AC-008 (FR-005, BR-003): Given AC-007's state, when A regains access to X and clicks "Tentar de novo" on m1, then m1 and then m2 are delivered in order; given instead A clicks "Apagar" on m1, then m1 is never delivered and m2 is attempted next.
- AC-009 (FR-006, BR-005): Given A's drain hits the server's create rate limit, then the rejected messages stay pending and are retried automatically, and B finally sees all of them in order, once each.
- AC-010 (FR-007, BR-006): Given a pending message whose send time is more than 24 h ago, when connectivity returns, then it is not sent and shows as failed "expirada" with "Tentar de novo" / "Apagar"; "Tentar de novo" delivers it once.
- AC-011 (FR-008, BR-002): Given A is offline, when A sends a message with a file or a voice note, then it stays in the composer with the Phase 4 failure message and "Tentar de novo", and nothing is added to the outbox.
- AC-012 (FR-009, BR-001; must-not R1-q16 A): Given A has pending messages and A's session ends without sign-out (session revoked server-side), when C signs in on the same browser, then C sees none of A's pending messages and none is sent as C; when A later signs in again, A's messages (< 24 h) are delivered as A.
- AC-013 (FR-010, BR-008): Given A has 2 outbox messages, when A clicks Sair, then the dialog shows "Você tem 2 mensagens não enviadas. Sair apaga essas mensagens." with "Sair mesmo" / "Cancelar"; Cancelar keeps the session and both messages; Sair mesmo signs out, and after A signs in again the outbox is empty. Given 0 outbox messages, Sair signs out without a dialog and the presence logout behaves as before.
- AC-014 (FR-011): Given the drawer is open, when the browser goes offline, then "Sem conexão — mensagens serão enviadas quando voltar" appears immediately; when only Realtime drops for 3 s, no banner appears; when Realtime stays down for more than 5 s, "Reconectando…" appears; when connectivity and Realtime return, the banner disappears without user action.
- AC-015 (FR-012): Given both the messages channel and the conversation-list channel lose Realtime, when Realtime becomes available again, then both resubscribe without user action, B's messages sent during the outage appear once, unread counts are correct, and the recorded reconnect events show increasing, capped retry delays.
- AC-016 (FR-013, BR-012; must-not R1-q16 D): Given Realtime is blocked while HTTP works and A's tab is visible, when B sends a message at the outage start, then A sees it within 45 s; a message B sends after polling started appears within 15 s plus request time; the list's unread counts also update. When A's tab is hidden, no polling requests are made; when it becomes visible, a fetch happens immediately. After Realtime reconnects, no polling request occurs during the next 60 s.
- AC-017 (FR-014; must-not R1-q16 E): Given B types continuously for 15 s, then A sees the typing indicator at every 1 s sample; when B stops, it disappears within 5 s; when B closes the tab mid-typing, it disappears within 5 s.
- AC-018 (FR-015): Given a group or room with A, B, C, D, when B types, A sees "<B> está digitando…"; when B and C type, "<B> e <C> estão digitando…"; when B, C, and D type, "3 pessoas estão digitando…"; the same applies in a direct conversation for one typist.
- AC-019 (FR-016, BR-009): Given authenticated non-member E, when E tries to join conversation X's typing topic with the Realtime client, then the join is refused or E receives no typing events, while member A receives B's typing events (integration test against local Realtime).
- AC-020 (FR-017, BR-009): Given A has two tabs and a second device on conversation X, when A types in tab 1, then neither tab 2 nor the second device shows A as typing.
- AC-021 (FR-018): Given A is signed in on two devices (separate browser contexts) with 3 unread messages in X, when A reads them on device 1, then device 2's unread counter for X goes to 0 without reload, focus change, or reconnect.
- AC-022 (FR-019): Given A is signed in on two devices, when A sends a message on device 1, then it appears on device 2 without reload.
- AC-023 (FR-020, BR-010): Given A types "@" in a room conversation, then the list shows only room-conversation members other than A, filters as A types, and supports arrows/Enter/Tab/Esc and mouse; choosing "Bruno" inserts a highlighted mention; a workspace user who never joined the room chat is not listed.
- AC-024 (FR-021, BR-010; must-not R1-q16 F): Given a direct API request that sends a message mentioning a non-member user ID and the sender's own ID, then the message is stored with no mention record for either and no notification reaches the non-member (integration test on the real API route and local DB).
- AC-025 (FR-022, BR-011): Given B has notifications enabled and permission granted, B's tab hidden, when A mentions B in a room, then B receives one notification titled "<A> mencionou você em <sala>" with the full text; clicking it opens that room conversation in the drawer; when A sends a room message without mentioning B, B receives none.
- AC-026 (FR-022, BR-011; must-not R1-q16 C): Given B has notifications enabled, then a mention in a DM yields exactly one notification; a mention in a thread reply yields a notification; a mention while B views that conversation in a visible tab yields none; A's own message mentioning A yields none for A; with the toggle off, none.
- AC-027 (FR-023): Given A's message mentions B, then all members see the mention styled distinctly, and only B sees the whole message highlighted (with a non-color cue).
- AC-028 (FR-024, BR-013): Given a send, a reconnect, and a polling episode occur, then the metrics route receives the corresponding events and writes structured log lines with event type, reason, and durations; a scan of those lines finds no message text, conversation or user names, emails, or user/conversation IDs; an unauthenticated request to the route is rejected and writes nothing.
- AC-029 (FR-025): Given the metrics route returns errors, when A sends, goes offline, and reconnects, then all messaging behaves as in AC-001/AC-002 and no error is shown to A.
- AC-030 (FR-026): Given user E is not a member of conversation X, when `mark_conversation_read` is invoked for E and X through every role that can execute it, then X's read state for E is not changed and the call is refused (integration test on local DB).
- AC-031 (FR-027): Given the `anon` role, when it calls `get_unread_counts`, then permission is denied; an authenticated member still gets correct counts (integration test on local DB).
- AC-032 (FR-028, BR-016): Given A has the drawer open on X, when A reloads, then the drawer reopens on X; given A lost access to X, then the conversation list opens with no error; given C signs in on that browser, then C does not see A's conversation restored; given the drawer was closed, it stays closed.
- AC-033 (FR-029): The existing Phase 4 messaging E2E regression suite and DB integration suite pass after each slice; `npm run type-check`, `npm run lint`, and `npm run build` pass.
- AC-034 (BR-014): Every migration of the phase is applied locally with recorded rollback SQL; at phase end, after explicit owner authorization, it is applied to `vhabpcoyypobgasacsko`, the catalog is read back from that target, and a runtime smoke check passes; the hand-off states the app is ready to deploy after the migrations.
- AC-035 (§12): The Supabase/RLS review gate passes for every migration, RLS/Realtime policy, repository, and API route change.
- AC-036 (BR-015): Each new E2E spec passed 3 consecutive runs; no unit test was added; every touched unit test was replaced by integration/E2E coverage and deleted, recorded in TRACK.
- AC-037 (FR-011, §13): The banner is announced via a polite live region, pending/failed/expired states have text labels, and the sign-out dialog and mention list are fully keyboard-operable.
- AC-038 (FR-002, BR-004): Given A's create request reaches the server but the response is dropped, when the message is retried automatically, then exactly one message exists and B sees it once.
- AC-039 (FR-001, R1-q2 A): Given IndexedDB is unavailable, when A sends a text message while offline, then it is not lost: it stays in the composer with the Phase 4 failure message and "Tentar de novo".

## 15. Test strategy

- Test levels:
  - Integration (local Supabase Postgres/Realtime and real API routes): mention validation and storage (AC-024), private typing-topic authorization (AC-019), `mark_conversation_read` membership (AC-030), `get_unread_counts` anon revoke (AC-031), create-route idempotency under replay and rate limit (AC-009, AC-038 server side), metrics route authentication and redaction (AC-028).
  - E2E (Playwright, real UI, two real accounts; plus two tabs of one account and a second device as a separate browser context): every other AC. Outages are simulated with browser-context offline mode and by blocking only the Realtime WebSocket, in both directions; lost responses with request pass-through then response drop. Expired items may use a test-controlled clock without changing the product rule.
  - Unit: none (repository policy, BR-015).
- Tests trace to acceptance criteria: each test names its AC ID; written from the ACs before or with the implementation.
- Test data: two accounts (A, B) in one company plus extra accounts for group/room typing and non-member cases (C/D/E); a DM, a group, and a room conversation; a room the test can remove A from and re-add A to.
- Environments: local Supabase for integration/E2E; online target only for phase-end readback and smoke (BR-014). Chrome automated; Edge and Firefox checks recorded.
- Reliability: each new E2E spec counts only after 3 consecutive passing runs (BR-015).
- Mandatory failure-path tests: offline send, network error while online, lost response, two-tab drain, cancel, definitive rejection and recovery, rate limit, expiry, attachment offline, IndexedDB unavailable, session revoked + other user, sign-out with pending, short vs long Realtime drop, hidden-tab polling, polling stop, typing tab close, non-member typing join, forged mention, metrics route failure, restore with lost access.

## 16. Validation and launch checklist

- All Must FRs and AC-001..AC-039 have evidence in TRACK.
- Supabase/RLS review gate passed (AC-035).
- Type-check, lint, build, integration, E2E, and the regression suite pass; new E2E specs passed 3 consecutive runs.
- Phase-end migrations applied online with authorization, readback, and smoke recorded (AC-034).
- Owner final test of the new app against the online database with two accounts.
- Hand-off states the application is ready to deploy after the migrations; deployment is performed by the owner.

## 17. Open questions

- Non-blocking: if per-company or per-conversation breakdown of metrics is wanted later, adding identifiers to metric logs needs a new owner decision (BR-013 forbids them now).
