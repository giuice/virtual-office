# SPEC: Phase 5 — Messaging Resilience

Goal: In the production messaging drawer, no message a user sends is lost or duplicated across network and Realtime outages, reloads, several tabs, account changes, and several devices; typing, unread/read state, and @mention notifications stay live and correct; and messaging health is observable through redacted logs — without regressing existing messaging.

Status: Draft v2 — revised after adversarial review r2 (`reviews/sol-review-spec-r2.md`); pending re-review and owner approval. Interview rounds 1–2, confirmation, and post-review owner decisions D1–D4 recorded in `state.md` (Verdict: Ready).

## 1. Summary

The Virtual Office messaging drawer (`MessagingDrawer` → `MessageFeed` → `MessageComposer` / `MessageItem`, state in `MessagingContext`, data in `useMessages` / `useConversations`, Realtime in `useMessageSubscription` / `useConversationRealtime`, typing in `useConversationPresence`) was completed for timeline features in Phase 4. Phase 4 also delivered a failed send that keeps text/reply/files with a single-message retry (`clientMessageId` idempotency in `POST /api/messages/create`), a Realtime catch-up after reconnect, and opt-in desktop notifications for DM/group messages. This phase adds: a durable per-user outbox for text messages with safe cross-tab and cross-account behavior; a connection banner; application-level recovery and health for every messaging Realtime stream with polling fallback; a reliable, named, members-only typing indicator; live cross-device unread/read sync; @mentions with desktop notifications (including rooms); messaging health metrics as redacted server logs; and two Phase 4 database follow-ups plus restoring the open conversation after reload.

## 2. Problem statement

Workspace members using the chat on unstable networks or sleeping laptops lose work and trust: a send that fails must be retried by hand, a reload or closed tab discards it (the idempotency key lives only in component memory), and nothing tells the user the chat is disconnected. Realtime recovery is incomplete: the SDK retries errored/timed-out channels, but the application only tracks and catches up the messages channel, has no recovery for terminal closures of the conversation-list channel, and has no fallback, so new messages and unread counts can silently stop updating. The typing indicator disappears after ~4 s of continuous typing and is broadcast on a public channel. Reading on one device leaves stale unread badges on the user's other devices. Nobody can mention someone, so room conversations (which never notify) cannot reach a specific person. Nobody can tell in production whether messaging is healthy.

## 3. Goals and success metrics

### Goals
- G1: A text message the user sends is never silently lost: it is delivered, pending, or visibly failed with an action.
- G2: No message is ever stored or shown twice because of automatic resends, several tabs, lost responses, or account changes; a message is never stored under a different sender.
- G3: Messaging recovers from network and Realtime outages without user action and keeps updating through polling while Realtime is down.
- G4: Typing indicators are reliable, named, and visible only to conversation members.
- G5: Unread/read state and own sent messages stay in sync live (≤ 5 s) across the same user's tabs and devices.
- G6: A user can @mention conversation members, and the mentioned person is notified on the desktop, including in rooms.
- G7: Messaging health (latency, delivery, connection) is observable in technical logs without exposing content.
- G8: No existing messaging behavior regresses; every database change reaches the online target in a controlled, verified way at phase end.

### Success metrics
- With ≤ 10 pending messages and create quota available, all pending messages are delivered within 10 s after connectivity returns, without any click, in their original order, each exactly once; with more, delivery continues automatically within the server rate limit (D1).
- With Realtime down and HTTP working, other members' new messages appear within 45 s of the outage start, and within 15 s (plus request time) of being sent once polling is active.
- Cross-device/tab sync of unread counts, read state, and own sent messages within 5 s (D4).
- Each flow is covered by a passing Playwright E2E test (two accounts, and two tabs / two devices where relevant) that passed 3 consecutive runs in Chrome and Edge.
- The existing messaging regression E2E suite passes after each slice.
- Every migration of the phase is applied to the online target `vhabpcoyypobgasacsko` at phase end with explicit owner authorization, catalog readback, and a runtime smoke check.
- Owner final test (new app against the online database) accepts the phase.

## 4. Users and stakeholders

### Primary users
- All workspace members who use the chat in direct, group, and room conversations (members of `conversation_members`), as sender, recipient, or mentioned user.

### Secondary users
- The same user on several tabs of one browser and on several devices/browsers at once; several users sharing one browser.
- The owner/operator, who reads the messaging metric logs.

### Stakeholders
- Owner (Giuliano): approves the SPEC, performs the final test, authorizes the online migrations at phase end, and deploys the application.

## 5. Scope

### In scope
- Durable outbox (IndexedDB, per application user, per browser) for text messages and replies, written before dispatch; pending/sending/unknown/failed/expired states; cancel; ordered automatic drain; cross-tab claim and recovery; identity fencing; rejection, rate-limit, and 24 h expiry handling; session-end and sign-out rules.
- Server support: sender fencing on create; read-only lookup of a stored message by `clientMessageId`; replays of already-stored messages not consuming the create quota; mentions persisted atomically with the message.
- Connection banner in the drawer.
- Application-level recovery, health, and catch-up for every messaging Realtime stream (messages/receipts/reactions, conversation list, typing of the open conversation).
- Polling fallback after > 30 s of Realtime outage, while the tab is visible.
- Typing indicator: continuous display, names, DM/group/room, private members-only channel, own sessions excluded, expiry.
- Live (≤ 5 s) cross-device/tab sync of unread counters, read state, and own sent messages.
- @mentions: autocomplete, highlighted mention, server-validated atomic mention records, desktop notification (DM, group, room, thread reply) with browser-wide viewing suppression, feed highlight.
- Messaging metrics as redacted structured server logs via an authenticated, rate-limited application route.
- Phase 4 follow-ups: membership check inside `mark_conversation_read`; `get_unread_counts` not executable by `anon`; restore the open conversation after page reload.

### Out of scope
- Loading the application while offline (service worker / offline app shell) (D2).
- Queuing attachments or voice notes (they keep the Phase 4 behavior).
- Editing a pending message (cancel and rewrite instead).
- Web Push / notifications with the browser or tab closed; cross-device notification suppression or dismissal.
- `@todos` / `@here`; self-mentions; a separate mention-only notification preference; scrolling to the message on notification click.
- Draft persistence; live sync of stars.
- Usage/engagement metrics; a metrics UI or external analytics service.
- Immediate revocation of typing signals for a tampered client of a removed member (accepted residual risk ≤ access-token lifetime, D3).
- Safari and mobile browsers; drawer layout below ~400 px.
- Other Phase 4 follow-ups: pending-upload cap, toaster covering the composer, pin no-op/English copy, orphan storage objects, "Favoritas" discoverability.
- Deploying the application (owner action).

## 6. User journeys

- J1 Offline send: A loses internet and keeps writing; each message appears as pending; the banner says "Sem conexão — mensagens serão enviadas quando voltar". Internet returns; within 10 s every pending message is delivered in order and B sees each once.
- J2 Reload/close: A has pending messages and reloads while offline (the browser shows its normal offline error) or closes the tab. When the page loads again with internet, the pending messages are there and are sent.
- J3 Two tabs: A's pending message shows in both tabs; only one tab sends it; if that tab closes mid-send, the other finishes it once; cancelling a waiting message in either tab removes it from both.
- J4 Rejection: A's pending message targets a room A has since lost access to; it becomes a visible failure with the text kept and "Tentar de novo" / "Apagar"; later pending messages for that room wait; other conversations still deliver.
- J5 Sign-out: A clicks Sair with 2 unsent messages; a dialog warns that leaving deletes them; Cancelar leaves A exactly where A was; Sair mesmo signs A out.
- J6 Shared browser: A's session ends without Sair; C signs in on the same browser; C never sees A's messages and nothing is sent as C; when A signs in again, A's messages are sent as A.
- J7 Realtime outage: after 5 s the banner shows "Reconectando…"; after 30 s the open conversation and the list update every 15 s; when Realtime returns, polling stops and the banner disappears.
- J8 Typing: B types continuously in a group; A sees "Bruno está digitando…" the whole time; it disappears ≤ 5 s after B stops.
- J9 Two devices: A reads part of conversation X on the laptop; within 5 s the desktop's badge and read state for X match.
- J10 Mention: A types "@" in a room chat and picks Bruno; Bruno's tab is hidden; Bruno gets "Ana mencionou você em <sala>" with the full text; clicking opens the room; the message is highlighted for Bruno.
- J11 Reload restore: A reloads with the drawer open on conversation X; the drawer reopens on X.

## 7. Functional requirements

| ID | Requirement | Priority | Acceptance signal |
|---|---|---|---|
| FR-001 | Every eligible send (text and/or reply, no attachments/voice; online or offline) is first written durably to the current user's outbox with its `clientMessageId`, conversation, content, reply target, and mention IDs, and only then dispatched and the composer cleared. The item shows in the feed as pending while not confirmed by the server. | Must | AC-001, AC-003, AC-040 |
| FR-002 | Pending items are sent automatically when connectivity returns (browser online, Realtime recovery, or periodic retry), per conversation in creation order, one in flight per conversation, always with their own `clientMessageId`. With ≤ 10 pending and quota available, all are delivered within 10 s of connectivity returning; with more, delivery continues within the rate limit. A confirmed item becomes the normal sent message and leaves the outbox. | Must | AC-002, AC-009, AC-038 |
| FR-003 | The outbox survives reload and tab close. Reloading while offline shows the browser's normal offline error; when the app loads again, the pending items are shown and sent. Items of the current user appear in every tab of the same browser. | Must | AC-004 |
| FR-004 | Cross-tab ownership: at most one tab holds the claim to dispatch a given item at a time (atomic claim); a claim is released when its tab closes or crashes, and another tab then resumes the item (reconciling first, FR-006); no tab dispatches an item while another live tab holds its claim; at most one create request per `clientMessageId` is in progress at any time across tabs. | Must | AC-005, AC-041 |
| FR-005 | Cancel: an item can be cancelled from any tab only if it is known not to be stored (never dispatched, or last attempt definitively rejected, or reconciled as not stored); the cancel is an atomic transition that wins or loses against a claim — a cancelled item is never dispatched afterwards, and an item already dispatched shows "enviando" without cancel. | Must | AC-006 |
| FR-006 | Unknown outcome: when a dispatched request ends without a response (network error, timeout, tab closed) or with a 5xx, the item is in unknown state. Before any cancel, expiry, or new dispatch, the app reconciles it with a read-only server lookup by `clientMessageId` (which never creates a message): if stored, the item resolves as delivered; if not stored, it returns to waiting. | Must | AC-038, AC-042 |
| FR-007 | A definitive rejection (BR-005) stops automatic attempts for that item; it shows as failed with its text and actions "Tentar de novo" and "Apagar"; later items of the same conversation wait until it is resolved; other conversations are unaffected. For `CLIENT_MESSAGE_ID_REUSED`, "Tentar de novo" sends the same content under a new `clientMessageId`. | Must | AC-007, AC-008, AC-043 |
| FR-008 | A rate-limit rejection is transient: the item stays pending and is retried automatically, preserving order and without duplicates. A create replay that returns an already-stored message does not consume the create quota. | Must | AC-009 |
| FR-009 | An item still not stored 24 h after the user pressed send is never sent automatically: once reconciled as not stored, it shows as failed "expirada" with "Tentar de novo" (manual send, same key) and "Apagar"; an unknown item found stored on reconciliation resolves as delivered, never as expired. | Must | AC-010, AC-042 |
| FR-010 | Attachments/voice are never queued. A file whose upload fails offline keeps the existing per-file error and retry (send stays disabled until uploads finish); a message whose uploads succeeded but whose create request fails keeps the Phase 4 composer failure and "Tentar de novo". | Must | AC-011 |
| FR-011 | Identity fencing: each item belongs to an application user (`users.id`). Before every dispatch the app checks that the authenticated user equals the item's owner; every dispatch carries the expected sender, and the create route rejects (without storing) a request whose authenticated user differs. When the authenticated user changes or signs out in any tab, all drains in all tabs stop; completions that arrive afterwards do not change another user's view. | Must | AC-012, AC-044 |
| FR-012 | Session end without explicit sign-out: an item is held (not failed, not deleted) only when the client's auth state reports the session ended (signed out, or refresh rejected); a 401 while the client still holds a valid session is treated as transient. Held items drain after the same user signs in again (subject to FR-009); another user on the browser never sees, sends, or deletes them. | Must | AC-012 |
| FR-013 | When the user clicks Sair at any in-app sign-out entry point with N > 0 unsent items, a dialog shows "Você tem N mensagens não enviadas. Sair apaga essas mensagens." with "Sair mesmo" and "Cancelar". Cancelar produces no logout request, success notice, or navigation. Sair mesmo stops drains in all tabs, deletes that user's outbox, and runs the existing sign-out (including the Presence logout sequence unchanged). With N = 0 sign-out is unchanged. | Must | AC-013 |
| FR-014 | Banner: "Sem conexão — mensagens serão enviadas quando voltar" as soon as the browser reports offline; "Reconectando…" when any required messaging Realtime stream (messages/receipts/reactions, conversation list) has been unhealthy for more than 5 s while the browser is online; it disappears by itself once all are healthy. | Must | AC-014 |
| FR-015 | Every messaging Realtime stream (messages/receipts/reactions, conversation list, typing of the open conversation) has application-level health and recovery: after an error, timeout, or terminal closure it rejoins without user action using exponential backoff with a capped delay (in addition to the SDK's own retries), and on recovery the messages and conversation-list streams trigger a catch-up refetch of the open feed and the list; the typing stream rejoins. | Must | AC-015 |
| FR-016 | Polling fallback: while any required stream has been unhealthy for more than 30 s and the tab is visible, the app fetches the open conversation's new messages and the conversation list every 15 s; on becoming visible while still unhealthy it fetches immediately, then every 15 s; no polling while hidden; once all streams are healthy no new polling request starts. Results merged from polling and Realtime never duplicate or degrade messages. | Must | AC-016 |
| FR-017 | The typing indicator stays visible while the other person types continuously and disappears at most 5 s after they stop, blur the composer, send, leave the conversation, or close the tab. | Must | AC-017 |
| FR-018 | The indicator names typists: 1 → "Ana está digitando…", 2 → "Ana e Bruno estão digitando…", 3+ → "N pessoas estão digitando…", in direct, group, and room conversations. | Must | AC-018 |
| FR-019 | Typing signals travel only on a private Realtime topic whose join and send are authorized for current conversation members; anon clients, authenticated non-members, and public-topic attempts never receive them; the app removes a member's client from the topic as soon as it learns of the removal. Payload: user identity and typing flag only. Residual risk accepted (D3): a tampered client of a removed member may receive typing signals until its access token expires. | Must | AC-019 |
| FR-020 | A user never sees their own typing indicator, including from their other tabs or devices. | Must | AC-020 |
| FR-021 | Within 5 s and without reload, focus change, or reconnect: when the user reads messages (fully or partly) on one tab/device, their other tabs/devices show the same unread counts and read state; the sender's receipt summary/details agree with the stored receipts on all of the sender's sessions. | Must | AC-021 |
| FR-022 | Within 5 s and without reload, a message the user sends from one device/tab appears on their other devices/tabs. | Must | AC-022 |
| FR-023 | In the composer, typing "@" opens a list of the conversation's current members except the user, filtered as they type, operable by mouse and keyboard (arrows, Enter/Tab, Esc); choosing inserts a highlighted mention. In a room the list contains only members of the room conversation. | Must | AC-023 |
| FR-024 | The server stores mentions in the same transaction as the message, as application user IDs of conversation members at send time other than the sender; other IDs and "@name" text create no mention. Mentions are part of the idempotent composition (same key with different mentions → `CLIENT_MESSAGE_ID_REUSED`). Clients cannot write mention records directly; only conversation members can read them. | Must | AC-024 |
| FR-025 | With the Phase 4 desktop-notification toggle on and permission granted, a mentioned user receives one desktop notification for a message that mentions them (direct, group, room, thread reply), decided from authoritative mention data, titled "<Autor> mencionou você em <conversa>" with the full text; clicking opens the conversation. Suppression is browser-wide: no tab notifies if any of the user's tabs in that browser is visible and viewing that conversation, regardless of which tab receives the event first. | Must | AC-025, AC-026 |
| FR-026 | Mentions render distinctly for everyone; a message that mentions the viewing user is highlighted for that user with a non-color cue. | Must | AC-027 |
| FR-027 | The client records metric events — send latency (press → server confirmed), outbox wait time, send outcomes by reason, Realtime stream drops/recoveries and outage duration, polling activations and duration — in a bounded buffer (oldest dropped when full) and sends them in batches, fire-and-forget, to an authenticated, per-user rate-limited application route. The route accepts only closed event/reason enums and bounded numeric fields, drops anything else, adds a server-derived app version, and writes structured log lines under BR-013. | Must | AC-028 |
| FR-028 | Metrics never block, slow, or break messaging: messaging code never awaits metric delivery; an erroring or hanging metrics route changes no messaging behavior or timing and shows no error. | Must | AC-029 |
| FR-029 | `mark_conversation_read` refuses to mark a conversation for a user who is not a member of it. | Must | AC-030 |
| FR-030 | `get_unread_counts` is not executable by the `anon` role; authenticated use keeps working. | Must | AC-031 |
| FR-031 | After a page reload, if the drawer was open, it reopens on the same conversation for the same user on the same browser; if that conversation is no longer accessible, the conversation list opens without an error; a closed drawer stays closed. | Must | AC-032 |
| FR-032 | Existing messaging behavior (Phase 4 flows: receipts, attachments, voice notes, stars, DM/group notifications and their once-across-tabs claim, failed-send retry for attachment messages, reconnect catch-up) does not regress. | Must | AC-033 |

## 8. Business rules

| ID | Rule | Rationale |
|---|---|---|
| BR-001 | The outbox belongs to one application user (`users.id`) on one browser; it is never shown, dispatched, or deleted while another user is authenticated, and the server never stores an item under a sender other than its owner. | R1-q3 A, R1-q16 A, R2-q5 A; review r2 #6 |
| BR-002 | Only text messages and replies without attachments/voice are queued. | R1-q4 A |
| BR-003 | Per conversation, items are sent in creation order, one in flight at a time; a failed (definitive or expired) item blocks later items of that conversation until the user retries or deletes it. Conversations are independent. | R1-q5 A, R1-q2 E |
| BR-004 | Each item gets a stable `clientMessageId` when the user presses send; every attempt reuses it (except the `CLIENT_MESSAGE_ID_REUSED` retry, FR-007); the server stores at most one message per (sender, conversation, `clientMessageId`). | R1-q2 B, R1-q16 B |
| BR-005 | Outcome classes: transient = browser offline before dispatch, HTTP 429, HTTP 401 while the client session is valid → retry automatically; unknown = network error/timeout/no response after dispatch, HTTP 5xx → reconcile (FR-006); session-ended = client auth reports signed out / refresh rejected → hold (FR-012); definitive = 403 `NOT_PARTICIPANT`, 404, 400, 413 `CONTENT_TOO_LARGE`, 422, 409 `CLIENT_MESSAGE_ID_REUSED`, sender mismatch → failed, no automatic retry. | R1-q5 C, R2-q4 A, R2-q5 A; review r2 #2, #11 |
| BR-006 | Expiry: an item not stored 24 h after the user pressed send becomes "expirada" and is never sent automatically; a manual "Tentar de novo" sends it with the same key. | R1-q5 D, R2-q3 B |
| BR-007 | Cancel only for items known not to be stored and not claimed; a cancelled item is removed in all tabs and never dispatched. | R1-q5 B, R2-q7 A; review r2 #2, #5 |
| BR-008 | An explicit user sign-out with unsent items requires confirmation; confirming deletes that user's outbox; a sign-out not initiated by the user keeps it. Cancelling has no side effect. | R2-q5 A, R2-q6 A |
| BR-009 | Typing: only current conversation members join and send on a conversation's typing topic; a user's own typing (any session) is never shown to them; an indicator expires ≤ 5 s after the last signal; residual exposure to a tampered removed-member client is bounded by access-token lifetime (D3). | R1-q8 A, D, E; R1-q16 E; D3 |
| BR-010 | Mentions: only current members of the conversation at send time, other than the sender, can be mentioned (rooms: members of the room conversation); no `@todos`/`@here`. | R1-q10 A, E; R2-q10 A; D4 |
| BR-011 | Desktop-notification eligibility (extends Phase 4): toggle on and permission granted; never for the user's own message; never while any tab of the user in that browser is visible and viewing that conversation; DM/group: every new message; room: only messages that mention the user; at most one notification per message per browser. | R1-q10 B, R1-q16 C, R2-q8 A, R2-q9 A–C; review r2 #9 |
| BR-012 | Polling runs only while a required Realtime stream has been unhealthy for more than 30 s and the tab is visible, every 15 s (immediately on becoming visible), and no new poll starts once all streams are healthy. | R1-q7 A, R1-q16 D, R2-q12 C |
| BR-013 | Metric log lines contain only closed-enum event type and outcome/reason, bounded durations/counts, conversation type, timestamp, and server-derived app version — never message text, attachment names, conversation names, user names or emails, user/conversation identifiers, or any client-supplied free text. | R1-q12 B, R2-q2, confirmation point 9; review r2 #14 |
| BR-014 | Database rollout: migrations stay local during the phase (written + applied locally with recorded rollback SQL); at phase end they are applied to `vhabpcoyypobgasacsko` only with explicit owner authorization, followed by catalog readback and a runtime smoke check; the application is deployed by the owner after the migrations; rollback is app first, then migrations. | R1-q13 A |
| BR-015 | Tests: only integration (real local Supabase/Realtime/API routes) and E2E (real UI, Playwright); no new unit tests; a touched unit test is replaced by integration/E2E coverage and deleted, recorded in TRACK. Each new E2E spec counts only after 3 consecutive passing runs. | AGENTS.md test policy, R2-q13 A |
| BR-016 | Conversation restore is per browser and per user; a different user never inherits it. | R2-q11 A, B, D |

## 9. Data and integrations

### Data inputs
- Composer text, reply target, and mention selections (user IDs).
- Browser connectivity events, Realtime stream status, tab visibility, Supabase auth state changes.
- Responses from `POST /api/messages/create` (status and error code) and from the read-only lookup by `clientMessageId`.

### Data outputs
- Browser IndexedDB outbox keyed by application user ID: `clientMessageId`, conversation ID, text, reply target, mention user IDs, pressed-send time, state (waiting / claimed / unknown / failed + reason / expired), claim owner and lease. Deleted per BR-007/BR-008; never shared across users.
- Database: mention records written atomically with the message; private typing-topic authorization (RLS on `realtime.messages`, `users.supabase_uid = auth.uid()::text` → `users.id` membership); `mark_conversation_read` with an internal membership check; `get_unread_counts` without `anon` EXECUTE.
- API: create route sender fencing and quota-free replays; read-only lookup of the caller's own message by conversation and `clientMessageId`; authenticated, rate-limited metrics route.
- Structured metric log lines (BR-013).
- Persisted drawer state per user: open flag + active conversation ID.

### Integrations
- Supabase Postgres, Realtime (`postgres_changes`, private broadcast topics), Auth (server routes use `createSupabaseServerClient` + `auth.getUser()`).
- Browser APIs: IndexedDB, Web Locks and/or BroadcastChannel for cross-tab claims and signals, Notification API (Phase 4), Page Visibility.
- Hosting/Supabase logs as the metrics sink; no new external analytics dependency.

## 10. Constraints and assumptions

### Constraints
- Next.js App Router, TypeScript strict, Supabase, TanStack Query; reuse existing hooks, repositories, routes, and query keys rather than parallel implementations.
- Identity: RLS compares `users.supabase_uid` with `auth.uid()::text`; foreign keys use `users.id`; messages link to rooms through `conversations.room_id`.
- Browsers: Chrome and Edge desktop (automated E2E); Firefox desktop (verified). Safari and mobile not required.
- No service worker; background notifications are page-level only.
- No message text, names, or identifiers in metrics (BR-013); no external analytics service.
- The sign-out confirmation must not change the Presence logout sequence (presence-safety rules apply to that touch point).
- Online database changes only at phase end with explicit authorization (BR-014); the hosted app currently runs the pre-Phase-4 build until the owner deploys.
- Repository test policy (BR-015); type-check, lint, and build must pass.

### Assumptions
- None beyond the user-confirmed answers and owner decisions recorded in `state.md`.

## 11. Edge cases and failure modes

| Case | Expected behavior |
|---|---|
| Tab closed right after pressing send, before server confirmation | Item is already in the outbox; on next load it is reconciled and delivered once (AC-040). |
| Request stored but response lost | Item becomes unknown; lookup finds it stored; resolves as delivered; never offered for cancel or expired (AC-038, AC-042). |
| Two tabs come online together | One claim per item; at most one create request per key at a time; each stored and shown once (AC-005). |
| Owning tab closes or hangs mid-request | Closed: another tab reconciles and finishes once. Hung but alive: no other tab dispatches that item (AC-041). |
| Cancel races a claim | Exactly one wins; a cancelled item is never dispatched; a dispatched item cannot be cancelled (AC-006). |
| Lost access before reconnect | First item fails definitively with text; later items of that conversation wait; other conversations deliver (AC-007). |
| Access regained after failure | "Tentar de novo" delivers it, then the waiting items in order (AC-008). |
| `CLIENT_MESSAGE_ID_REUSED` | Failed; "Tentar de novo" resends the content under a new key, once (AC-043). |
| Server rate limit during drain | Items stay pending, retried automatically, order and uniqueness preserved; replays do not consume quota (AC-009). |
| Laptop asleep > 24 h | Not-stored items become "expirada"; stored ones resolve as delivered (AC-010, AC-042). |
| Offline attachment / voice | Upload failure: per-file error + retry; create failure after upload: Phase 4 composer failure; nothing in the outbox (AC-011). |
| IndexedDB unavailable | Eligible send keeps the Phase 4 composer failure + "Tentar de novo" on failure — never silently dropped (AC-039). |
| Account switched while a drain is paused | Drain stops; no dispatch as the new user; server rejects any request whose sender differs from the item owner (AC-044). |
| Session ends without Sair; other user signs in | Other user never sees/sends A's items; A's items drain after A signs in (AC-012). |
| Temporary Auth failure (401 with valid client session) | Treated as transient; retried; not held or deleted (AC-012). |
| Sair with unsent items | Dialog; Cancelar has no side effects at any entry point; Sair mesmo stops drains everywhere and deletes the outbox (AC-013). |
| Realtime drop < 5 s | No "Reconectando…" banner (AC-014). |
| Only the conversation-list stream fails | Detected and recovered independently; banner/polling follow its health (AC-015, AC-016). |
| Polling and Realtime deliver the same message | Shown once, not degraded (AC-016). |
| Realtime down > 30 s, tab hidden | No polling; on visible, fetch immediately then every 15 s (AC-016). |
| Typist closes the tab mid-typing | Indicator disappears ≤ 5 s (AC-017). |
| Anon, outsider, public-topic, or removed-member typing access | Refused / no events; removed member's app leaves at once; tampered client bounded by D3 (AC-019). |
| Forged mention IDs or changed mentions on replay | No mention for non-members/self; changed mentions under one key → 409 (AC-024). |
| Hidden tab receives a mention event first while another tab views that conversation | No notification (AC-026). |
| Malicious or hanging metrics traffic | Unknown fields/free text dropped or rejected; route rate-limited; messaging unaffected (AC-028, AC-029). |
| Restored conversation no longer accessible | Conversation list opens without error (AC-032). |

## 12. Security, privacy, compliance, and abuse considerations
- Outbox content lives only in the user's browser, scoped to the application user ID, fenced against account switches on the client and on the server (expected-sender check), and deleted on confirmed explicit sign-out.
- The read-only lookup returns only the caller's own message for that key and never creates.
- Typing topics are private and members-only for join and send (Realtime RLS with `users.supabase_uid = auth.uid()::text` → `users.id`); residual exposure to tampered removed-member clients accepted (D3).
- Mentions are validated and stored server-side in the message transaction; clients cannot write them directly; only members can read them.
- Notifications never leak content of conversations the user is not a member of.
- Metrics: closed enums, bounded numbers, server-derived version, per-user rate limit, no free text (BR-013); unauthenticated requests are rejected and produce no metric log line.
- `mark_conversation_read` membership check and `anon` revoke on `get_unread_counts` close two Phase 4 findings.
- No service-role key in client code; service-role use never replaces application authorization checks.
- Every migration, RLS/Realtime policy, repository, and API route change passes the Supabase/RLS review gate.

## 13. Accessibility, localization, and usability considerations
- UI copy in Brazilian Portuguese. The banner text, sign-out dialog text, typing phrases, and mention notification title in this SPEC are required; item-state labels ("pendente", "enviando", "expirada") and actions ("Cancelar", "Tentar de novo", "Apagar") are proposed, and equivalent Portuguese wording with the same meaning is accepted (D4).
- Connection banner uses a polite live region; item states have text labels, not only icons.
- Item actions and the sign-out dialog are keyboard-operable with visible focus; the dialog traps focus and Esc means Cancelar.
- The mention list follows the combobox/listbox pattern and is announced to screen readers.
- The mention highlight does not rely on color alone.

## 14. Acceptance criteria

- AC-001 (FR-001, BR-002): Given A's browser context is offline, when A sends a text message, then A's feed shows it as pending with a text label, the composer is empty, the outbox holds it, and B does not see it.
- AC-002 (FR-002, BR-003, BR-004): Given A queued 3 messages offline in conversation X with quota available, when connectivity returns, then within 10 s and without any click B sees exactly those 3 messages, once each, in the original order, and A's items become normal sent messages.
- AC-003 (FR-001, BR-005): Given the browser reports online but A's create request fails with a network error after dispatch, then the item becomes unknown, is reconciled, and is delivered exactly once without user action once requests succeed.
- AC-004 (FR-003): Given A has a pending item, when A reloads while offline, then the browser's offline error is shown; when the network returns and the app loads again, the item is shown as pending and is delivered exactly once. Given A closes the tab with a pending item, then reopening the app later delivers it once.
- AC-005 (FR-004, BR-004; must-not R1-q16 B): Given A has two tabs and queued 2 messages offline in tab 1, then both appear in tab 2; when both tabs come back online simultaneously, then the network log of both tabs shows at most one create request in progress per `clientMessageId` at any time, B receives each message exactly once, and the database holds one row per key.
- AC-006 (FR-005, BR-007): Given a waiting item never dispatched, when A cancels it in tab 2 at the moment tab 1 tries to claim it, then either the cancel wins (the item disappears from both tabs and no create request for it is ever sent) or the claim wins (no cancel action is offered and the item is delivered once); given a dispatched item, it shows "enviando" and offers no cancel.
- AC-007 (FR-007, BR-003, BR-005): Given A queued m1 and m2 in room conversation X and m3 in DM Y, and A lost access to X before reconnecting, when connectivity returns, then m1 shows failed with its text and "Tentar de novo" / "Apagar", m2 stays waiting with no create request sent, and m3 is delivered.
- AC-008 (FR-007, BR-003): Given AC-007's state, when A regains access to X and clicks "Tentar de novo" on m1, then m1 and then m2 are delivered in order; given instead A clicks "Apagar" on m1, then m1 is never delivered and m2 is attempted next.
- AC-009 (FR-002, FR-008, BR-005): Given A's create quota is exhausted when A's 12 queued items start draining, then rejected items stay pending and retry automatically, and B finally sees all 12 in order, once each; a replay of an already-stored message returns it without reducing the remaining quota (integration test on the real route).
- AC-010 (FR-009, BR-006): Given a never-dispatched item whose send time is more than 24 h ago, when connectivity returns, then no create request is sent for it and it shows "expirada" with "Tentar de novo" / "Apagar"; "Tentar de novo" delivers it once.
- AC-011 (FR-010, BR-002): Given A is offline, when A adds a file, then its upload shows the existing per-file error and retry, Send stays disabled, and nothing enters the outbox; given A's uploads succeeded and then the network drops, when A sends, then the message stays in the composer with the Phase 4 failure and "Tentar de novo", and nothing enters the outbox.
- AC-012 (FR-011, FR-012, BR-001, BR-005; must-not R1-q16 A): Given A has unsent items and A's browser session ends without Sair (auth cookies/storage cleared or refresh token revoked so the client reports signed out), when C signs in on the same browser, then C sees none of A's items and no create request is sent while C is authenticated; when A signs in again, A's items (< 24 h) are delivered as A. Given a 401 while A's client session is valid, then the item stays pending and is retried.
- AC-013 (FR-013, BR-008): Given A has 2 unsent items, when A clicks Sair from each in-app entry point, then the dialog shows "Você tem 2 mensagens não enviadas. Sair apaga essas mensagens."; Cancelar sends no logout request, shows no notice, and does not navigate; Sair mesmo with a drain in flight in another tab stops all drains, deletes the outbox, and signs out with the Presence logout sequence as before; after A signs in again the outbox is empty. Given 0 unsent items, Sair signs out without a dialog.
- AC-014 (FR-014): Given the drawer is open, when the browser goes offline, then "Sem conexão — mensagens serão enviadas quando voltar" appears immediately; when only Realtime drops for 3 s, no banner appears; when a required stream stays unhealthy for more than 5 s, "Reconectando…" appears; when all recover, the banner disappears without user action.
- AC-015 (FR-015): Given each required stream is dropped independently (messages stream only; conversation-list stream only, including a terminal closure; typing stream only), when Realtime becomes available again, then that stream recovers without user action; B's messages sent during the outage appear once; unread counts are correct; typing works again; recorded recovery events show increasing, capped retry delays.
- AC-016 (FR-016, BR-012; must-not R1-q16 D): Given Realtime is blocked while HTTP works and A's tab is visible, when B sends a message at the outage start, then A sees it within 45 s; a message B sends after polling started appears within 15 s plus request time; the list's unread counts update. When A's tab is hidden, no polling requests are made; when it becomes visible, a fetch happens immediately. When Realtime recovers while a poll is in flight, the message delivered by both appears once, and no new polling request starts during the next 60 s.
- AC-017 (FR-017; must-not R1-q16 E): Given B types continuously for 15 s, then A sees the typing indicator at every 1 s sample; when B stops, it disappears within 5 s; when B closes the tab mid-typing, it disappears within 5 s.
- AC-018 (FR-018): Given a group or room with A, B, C, D, when B types, A sees "<B> está digitando…"; B and C → "<B> e <C> estão digitando…"; B, C, D → "3 pessoas estão digitando…"; a direct conversation shows the single-typist phrase.
- AC-019 (FR-019, BR-009): With real local Realtime: an anon client, an authenticated non-member, and a client on the public topic name receive no typing events of conversation X and cannot send typing events members receive; member A receives B's typing; when member E is removed from X, E's app leaves the topic and shows/receives no further typing for X (integration + E2E).
- AC-020 (FR-020, BR-009): Given A has two tabs and a second device on X, when A types in tab 1, then neither tab 2 nor the second device shows A as typing.
- AC-021 (FR-021): Given A on two devices with 6 unread in X, when A reads only the first 3 on device 1, then within 5 s device 2 shows 3 unread for X; after reading the rest, 0. Given A is the sender of messages read by B, then A's receipt summary/details on both of A's sessions match the stored receipts within 5 s.
- AC-022 (FR-022): Given A on two devices, when A sends on device 1, then it appears on device 2 within 5 s without reload.
- AC-023 (FR-023, BR-010): Given A types "@" in a room conversation, then the list shows only room-conversation members other than A, filters as A types, and supports arrows/Enter/Tab/Esc and mouse; choosing "Bruno" inserts a highlighted mention; a workspace user who never joined the room chat is not listed.
- AC-024 (FR-024, BR-010; must-not R1-q16 F): On the real route and local DB: a message mentioning a non-member ID and the sender's own ID stores no mention for either and notifies neither; a replay under the same key with different mention IDs returns `CLIENT_MESSAGE_ID_REUSED` and changes nothing; a forced failure of mention storage stores neither the message nor any mention; anon and non-members cannot read mention records; no client can insert/update/delete them directly.
- AC-025 (FR-025, BR-011): Given B has notifications enabled and permission granted, B's tab hidden or viewing another conversation, when A mentions B in a room, then B receives exactly one notification "<A> mencionou você em <sala>" with the full text; clicking opens that room in the drawer; a room message without a mention of B produces none.
- AC-026 (FR-025, BR-011; must-not R1-q16 C): Given B has notifications enabled, then a DM mention yields exactly one notification; a thread-reply mention yields one; with B's two tabs where the hidden tab receives the event first and the visible tab is viewing that conversation, none; A's own message yields none for A; with the toggle off, none; a mention across B's two hidden tabs yields exactly one.
- AC-027 (FR-026): Given A's message mentions B, then all members see the mention styled distinctly, and only B sees the whole message highlighted with a non-color cue.
- AC-028 (FR-027, BR-013): Given a send, a stream recovery, and a polling episode occur, then the metrics route writes structured lines with enum event type/reason, durations, and server-derived version; a scan finds no message text, names, emails, or user/conversation IDs; a payload with unknown fields, free-text strings, out-of-range numbers, or a forged version produces no such values in the logs; requests beyond the per-user rate limit are rejected; an unauthenticated request is rejected and produces no metric log line.
- AC-029 (FR-028): Given the metrics route errors, and separately hangs without responding, when A sends, goes offline, and reconnects, then AC-001/AC-002 behavior and timing hold and no error is shown.
- AC-030 (FR-029): Given user E is not a member of X, when `mark_conversation_read` is invoked for E and X through every role that can execute it, then the call is refused and E's read state for X is unchanged (integration, local DB).
- AC-031 (FR-030): Given the `anon` role, when it calls `get_unread_counts`, then permission is denied; an authenticated member still gets correct counts (integration, local DB).
- AC-032 (FR-031, BR-016): Given the drawer open on X, when A reloads, then it reopens on X; given A lost access to X, then the list opens with no error; given C signs in on that browser, then C does not get A's conversation; given the drawer was closed, it stays closed.
- AC-033 (FR-032): The existing Phase 4 messaging E2E regression suite and DB integration suite pass after each slice; `npm run type-check`, `npm run lint`, and `npm run build` pass.
- AC-034 (BR-014): Every migration of the phase is applied locally with recorded rollback SQL; at phase end, after explicit owner authorization, it is applied to `vhabpcoyypobgasacsko`, the catalog is read back from that target, and a runtime smoke check passes; the hand-off states the app is ready to deploy after the migrations.
- AC-035 (§12): The Supabase/RLS review gate passes for every migration, RLS/Realtime policy, repository, and API route change.
- AC-036 (BR-015): Each new E2E spec passed 3 consecutive runs in Chrome and in Edge; the key flows (outbox, banner, typing, mentions) were verified in Firefox and recorded; no unit test was added; every touched unit test was replaced and deleted, recorded in TRACK.
- AC-037 (FR-014, §13): The banner is announced via a polite live region, item states have text labels, and the sign-out dialog and mention list are fully keyboard-operable.
- AC-038 (FR-002, FR-006, BR-004): Given A's create request is stored but its response is dropped, then the item becomes unknown, the lookup resolves it as delivered without a second create, and B sees it once.
- AC-039 (FR-001, R1-q2 A): Given IndexedDB is unavailable, when A's eligible send fails, then it stays in the composer with the Phase 4 failure and "Tentar de novo" — not lost.
- AC-040 (FR-001): Given A is online and the create request is held, when A closes the tab before the server confirms, then on reopening the app the item is reconciled and B sees the message exactly once.
- AC-041 (FR-004): Given tab 1 holds the claim and its create request is held, then tab 2 sends no create request for that item while tab 1 is alive; when tab 1 is closed, tab 2 reconciles and the message is stored once.
- AC-042 (FR-006, FR-009): Given an unknown item whose request was actually stored, when A tries to cancel it or its 24 h passes, then no cancel is offered before reconciliation, the lookup resolves it as delivered, and it never shows "expirada".
- AC-043 (FR-007): Given an item rejected with `CLIENT_MESSAGE_ID_REUSED`, when A clicks "Tentar de novo", then its content is stored once under a new key and the conflicting stored message is unchanged.
- AC-044 (FR-011, BR-001): Given A's drain is paused mid-item and the browser's session switches to C (a member of the same conversation), when the drain would resume, then no create request is sent as C; a crafted create request carrying A as expected sender with C's session is rejected and stores nothing.

## 15. Test strategy

- Test levels:
  - Integration (local Supabase Postgres/Realtime and real API routes): sender fencing and quota-free replay on create (AC-009, AC-044), lookup route (AC-038, AC-042 server side), mention atomicity/validation/RLS (AC-024), private typing-topic authorization incl. anon/outsider/public topic (AC-019), `mark_conversation_read` membership (AC-030), `get_unread_counts` anon revoke (AC-031), metrics route auth, enum validation, rate limit, redaction (AC-028).
  - E2E (Playwright, real UI; two or more real accounts; two tabs of one account; a second device as a separate browser context): every other AC. Outages: browser-context offline mode and blocking only the Realtime WebSocket or a single stream, in both directions; lost responses via request pass-through then response drop; held requests via delayed pass-through to the real server. These shape the network only; the app, routes, and Supabase stay real. Expiry may use a test-controlled clock without changing the product rule.
  - Unit: none (BR-015).
- Tests trace to acceptance criteria by AC ID; written from the ACs before or with the implementation.
- Test data: accounts A, B, C, D, E in one company; a DM, a group, and a room conversation; a room the test can remove A/E from and re-add; a way to exhaust A's create quota locally.
- Environments: local Supabase for integration/E2E; Chrome and Edge for automated E2E; Firefox verification of key flows recorded; online target only for phase-end readback and smoke (BR-014).
- Reliability: each new E2E spec counts only after 3 consecutive passing runs (BR-015).
- Mandatory failure-path tests: every AC-003..AC-013 and AC-038..AC-044 scenario, short vs long Realtime drop, independent stream failures, hidden-tab polling, polling/Realtime overlap, typing tab close, typing access by anon/outsider/removed member, forged/changed mentions, visible+hidden tab notification race, malicious and hanging metrics traffic, restore with lost access.

## 16. Validation and launch checklist

- All Must FRs and AC-001..AC-044 have evidence in TRACK.
- Supabase/RLS review gate passed (AC-035).
- Type-check, lint, build, integration, E2E, and the regression suite pass; new E2E specs passed 3 consecutive runs in Chrome and Edge; Firefox verification recorded.
- Phase-end migrations applied online with authorization, readback, and smoke recorded (AC-034).
- Owner final test of the new app against the online database with two accounts.
- Hand-off states the application is ready to deploy after the migrations; deployment is performed by the owner.

## 17. Open questions

- Non-blocking: per-company or per-conversation metric breakdowns would need identifiers in logs, which BR-013 forbids; a later owner decision is required to add them.
