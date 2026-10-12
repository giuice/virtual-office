Status: closed

# Spec Interview State — phase-5-messaging-resilience

## Scope restatement

Phase 5 — Messaging Resilience: make the production messaging drawer reliable
across network disruptions, multiple devices/tabs, and background usage —
offline send queue, Realtime reconnection with backoff and polling fallback,
typing indicators, cross-device read-receipt sync, @mention desktop
notifications, and messaging health metrics (RESIL-01..07) — starting from the
state Phase 4 delivered (failed-send retry, reconnect catch-up, opt-in DM/group
desktop notifications). User request 2026-10-06: "finalizamos a fase 4 …
vamos prosseguir com a fase 5".

## Context inputs (not answers)

The user did NOT authorize using supplied documents as interview answers. These
inform questions only:

- `.planning/ROADMAP.md` Phase 5 (historical; RESIL-01..07, success criteria).
- `.planning/REQUIREMENTS.md` traceability rows RESIL-01..07.
- `spec-interview/phase-4-messaging-timeline/REPORT.md` and TRACK T21 follow-ups.
- Source inventory (Explore agent, 2026-10-06; production `src/`, debug excluded):
  - Send: composer → `useMessages.sendMessage` → `POST /api/messages/create`
    (plain fetch, no timeout). Failure keeps text/reply/files + manual
    "Tentar de novo"; `clientMessageId` idempotency (migration
    20261005000414; 200 on replay, 409 on key reuse). Create is rate limited.
    No online/offline listeners, no IndexedDB/outbox, drafts not persisted.
  - Realtime: one channel `messaging-db-changes:*` (messages, receipts,
    reactions) with backoff 250 ms→5 s, reset after 30 s stable; catch-up
    refetch on `system` ok. `useConversationRealtime` (fixed channel name
    `conversations-changes`) has no retry/backoff. No connection banner in
    the drawer. visibilitychange used only for receipts/notifications.
  - Polling: none (explicit "no polling (audit B-06)", MessagingContext.tsx:30).
  - Typing: broadcast `typing` on public channel `conversation:${id}`
    (useConversationPresence.ts); sends true once, false after 2 s idle;
    remote expiry 4 s → indicator vanishes during continuous typing.
  - Multi-device receipts: other device gets receipt INSERT but does not
    invalidate `['conversations', userId]` → unread badges stale until
    focus/reconnect.
  - Analytics: none for messaging (only debugLogger console tracing).
    Presence/auth have redacted observability modules.
  - Desktop notifications: page-level only (Notification API, localStorage
    opt-in, cross-tab claim via Web Locks); DM/group only; no service
    worker/push; no @mention concept anywhere in `src`.
  - Multi-tab: no BroadcastChannel/leader tab.
  - Tests: DB suite `__tests__/messaging-db/*`; E2E `__tests__/api/playwright/messaging-*`
    incl. `messaging-reconnect-consistency.spec.ts`.

## Rounds

- Round 1: `round-1.html` (18 questions, all domains) — answered 2026-10-06
  (all notes empty).
- Round 2: `round-2.html` (13 questions) — answered 2026-10-06 (notes empty).
- Confirmation round: native question UI — 2026-10-06, user chose "Confirmo".

## Round 2 answers (user, 2026-10-06; option labels from round-2.html)

- R2-q1 A: metrics are IN, Must, as technical logs (no UI). Resolves the
  R1-q1/R1-q12 conflict.
- R2-q2 metrics recorded (never message text): A send time (click → server
  confirmed) and time spent in the offline queue; B send successes vs failures
  by reason (no network, lost access, expired, rate limit); C Realtime drops,
  reconnections and outage duration; D polling-fallback activations and
  duration. E (usage/engagement per company) NOT selected.
- R2-q3 B: pending message expires after 24 hours → visible failure, no
  auto-send.
- R2-q4 A: rate limit (429) is NOT definitive — wait and retry automatically,
  keeping order. (Corrects the R1-q5 C option wording.)
- R2-q5 A: session expiry (no explicit Sair) keeps the queue; when the SAME
  user signs in again it sends (unless expired by the 24 h rule); another user
  never sees it.
- R2-q6 A: explicit Sair with pending → warning "Você tem N mensagens não
  enviadas. Sair apaga essas mensagens." with "Sair mesmo" / "Cancelar".
- R2-q7 A: pending appears in all tabs of the same browser; only one tab sends
  (no duplicate); cancelling in any tab cancels.
- R2-q8 A: mentions use the same Phase 4 desktop-notifications toggle
  (on = DM, group, and mentions).
- R2-q9 A one notification per message (DM/group mention not doubled); B text
  "Ana mencionou você em <sala/conversa>" + full message text; C mention in a
  thread reply also notifies; E a message that mentions me is highlighted in
  the feed for me. D (scroll to message on click) NOT selected.
- R2-q10 A: in a ROOM, the @ list contains only members of the room
  conversation (people who already joined the room chat).
- R2-q11 A reopen the chat, if it was open, in the same conversation after
  reload; B if access was lost, open the conversation list without error;
  D only same browser + same user. C (draft persistence) NOT selected.
- R2-q12 A "Reconectando…" banner only if the outage lasts > ~5 s; B "Sem
  conexão" appears as soon as the browser goes offline; C returning to the tab
  while Realtime is still down fetches immediately, then every 15 s. D NOT
  selected.
- R2-q13 A each new E2E spec must pass 3 consecutive runs before counting;
  B simulate browser offline and Realtime-only outage, both directions; C two
  tabs of the same user + a second device (separate browser context); D DB
  tests: only members mark read; anon cannot call get_unread_counts.

## Round 1 answers (user, 2026-10-06; option labels from round-1.html)

- R1-q1 Must items: R1 offline queue, R2 Realtime reconnect incl. conversation
  list, R3 polling fallback >30s, R4 reliable typing, R5 live cross-device
  unread/read sync, R7 @mention desktop notifications. R6 metrics NOT selected.
- R1-q2 "reliable" = A no message silently lost (delivers or visible failure
  with action); B never duplicates (auto-resend, several tabs); C pending
  messages deliver within ~10 s after connectivity returns without clicks;
  D with Realtime down, others' new messages appear within ~30–45 s via
  polling; E offline-sent order preserved.
- R1-q3 A: queue in IndexedDB per user; survives reload/close; deleted on logout.
- R1-q4 A: queue only text + replies; attachments/voice offline keep the
  Phase 4 failure-in-composer + "Tentar de novo".
- R1-q5 A in order, one at a time per conversation, later ones wait if one
  fails; B pending shown in feed with clock state, cancellable before sending;
  C definitive rejection (lost access, invalid content, rate limit) stops
  retrying, shows failure with text preserved; D pending expires after a time
  (example 24 h) and becomes a visible failure without auto-send. E (edit
  pending) not selected.
- R1-q6 A: discreet banner at the top of the chat ("Sem conexão — mensagens
  serão enviadas quando voltar" / "Reconectando…"), hides itself when normal.
- R1-q7 A: poll every 15 s, only while tab visible: open conversation +
  conversation list (unread); stops as soon as Realtime returns.
- R1-q8 A keeps showing during continuous typing, disappears ~5 s after stop;
  B names ("Ana está digitando…", "Ana e Bruno…", "3 pessoas…"); C DM, group,
  room; D private channel, only conversation members receive typing; E never
  show my own typing from my other tabs/devices.
- R1-q9 A unread counter + read state sync live across my devices; B messages
  I sent from another device appear immediately. C stars, D drafts, E
  cross-device notification dismissal NOT selected.
- R1-q10 A typing @ opens member list of the conversation, choosing inserts a
  highlighted mention; B mentioned user gets desktop notification even in a
  ROOM; E mention valid only for conversation members, otherwise plain text.
  C (notify even with DM/group notifications off) and D (@todos/@here) NOT
  selected.
- R1-q11 A: background = tab open but hidden/minimized (Phase 4 model); no
  service worker / Web Push.
- R1-q12 B: metrics, if included, as technical logs only (Supabase/Vercel), no
  UI. (Conflicts with R1-q1 not selecting R6 → asked in round 2.)
- R1-q13 A: migrations local during the phase; online at phase end with
  explicit authorization; app deployment stays with the user.
- R1-q14 A Chrome + Edge desktop (automated), B Firefox desktop. Safari and
  mobile NOT selected.
- R1-q15 Phase 4 follow-ups in scope: A DB — membership check in
  mark_conversation_read and block anon from get_unread_counts; C restore the
  open conversation after page reload. B, D, E, F not selected.
- R1-q16 Must never happen: A one user's pending message sent by another user
  who later logs in on the same browser; B duplicates when two tabs drain the
  same queue; C notification for my own message or the conversation I'm
  viewing; D polling continuing after Realtime returned; E typing stuck after
  the person left/closed the tab; F mention notifying a non-member.
- R1-q17 A: acceptance like Phase 4 — two-account E2E (simulated internet and
  Realtime outages) + local DB integration tests + owner final test against the
  online DB. (Repo policy: no unit tests.)
- R1-q18 A: all company members who use chat (DM, group, room); no admin
  specifics except possibly metrics.

## Current understanding

| Area | Status | Notes |
|---|---|---|
| Goals | Clear | R1-q1 (R1–R5, R7) + R2-q1 A (R6 as logs); success signals R1-q2 A–E. |
| Users | Clear | R1-q18 A. |
| Requirements | Clear | R1-q3..q12, R1-q15 A/C, R2-q2, q7, q8, q9, q10, q11, q12. |
| Constraints | Clear | R1-q13 A, R1-q14 A+B, R1-q11 A, R1-q4 A. |
| Edge cases | Clear | R1-q16 A–F, R2-q5, R2-q6, R2-q11 B, R2-q4. |
| Business rules | Clear | R1-q5 A–D, R2-q3 (24 h), R2-q4 (429 retry), R1-q10 E, R2-q10 A. |
| Acceptance criteria | Clear | R1-q17 A, R1-q2 measurable targets, R2-q13. |
| Test strategy (code only) | Clear | E2E two accounts + DB integration, R2-q13 A–D; no unit tests (repo policy). |

## Remaining unknowns

- None blocking. Stated for confirmation (implementation framing, correctable):
  metric logs travel from the browser to an authenticated app endpoint that
  writes redacted structured logs (no message text; no conversation names).

## Confirmation (user, 2026-10-06)

Presented a 12-point summary of the current understanding (offline queue,
rate-limit retry, session/logout, banner, reconnection + 15 s polling, typing,
cross-device unread, @mentions, metrics as redacted logs via an authenticated
app route, Phase 4 follow-ups A/C, out-of-scope list, acceptance/rollout) via
the native question UI with options "Confirmo" / "Tenho correções". User
selected "Confirmo (Recommended)" with no note. Recorded as user approval of
the current understanding.

## SPEC readiness check

- Goals are specific and measurable: Pass — R1-q1, R2-q1 A, R1-q2 A–E (10 s delivery, 30–45 s polling).
- Users and stakeholders are identified: Pass — R1-q18 A; owner as UAT/rollout authority R1-q13 A, R1-q17 A.
- In-scope and out-of-scope boundaries are explicit: Pass — R1-q1, R1-q4 A, R1-q9, R1-q10 (C/D out), R1-q11 A, R1-q14, R1-q15 A/C, R2-q11 C out; confirmation point 11.
- Functional requirements are testable: Pass — R1-q3..q12, R2-q2, R2-q7..q12.
- Business rules are explicit: Pass — R1-q5 A–D, R2-q3 B (24 h), R2-q4 A, R1-q10 E, R2-q8 A, R2-q9 A, R2-q10 A.
- Constraints are explicit: Pass — R1-q13 A, R1-q14 A+B, R1-q11 A, R2-q2 (no message text).
- Edge cases and failure modes are covered: Pass — R1-q16 A–F, R2-q4..q6, R2-q11 B, R2-q12 A–C.
- Acceptance criteria are observable: Pass — R1-q17 A, R1-q2, R2-q13 A–D.
- Every Must-priority functional requirement has at least one acceptance criterion: Pass — SPEC §14 traceability (checked when written).
- Every mandatory business rule, hard constraint, and must-not-happen condition is validated by at least one acceptance criterion: Pass — SPEC §14 traceability (checked when written).
- Test strategy is defined (code projects only): Pass — R1-q17 A, R2-q13 A–D; repo AGENTS.md test policy.
- Open questions are non-blocking or intentionally deferred: Pass — none blocking.
- The user confirmed the current understanding after the additions/corrections question: Pass — Confirmation 2026-10-06.

Verdict: Ready

## SPEC adversarial review gate (AGENTS.md)

- SPEC.md written 2026-10-06 (Status: Draft — pending adversarial review and owner approval).
- Attempt 1 (2026-10-06): direct Codex CLI 0.155.1, `--model gpt-6.1-sol -c model_reasoning_effort="max" --sandbox read-only`,
  prompt `reviews/review-prompt.txt`. Startup confirmed model gpt-6.1-sol / effort max, then the API rejected the request:
  `400 invalid_request_error: The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account.`
  No review output produced (`reviews/sol-review-spec-r1.stderr.log`). Result: FAILED / unverified. Gate open.
  Per delegation-anthropic.md no model/effort substitution without the owner; owner decision requested.
- Attempt 2 (2026-10-06, after the owner updated Codex to 0.160.1): same command (`-m gpt-6.1-sol --config model_reasoning_effort="max"`, read-only).
  Startup confirmed model gpt-6.1-sol / reasoning effort max; exit 0; output `reviews/sol-review-spec-r2.md`.
  Verdict: revision required (19 findings: 9 High, 9 Medium, 1 Low). SPEC v1 preserved as `reviews/SPEC-v1-reviewed.md`.

## Owner decisions after SPEC review r2 (native question UI, 2026-10-06)

- D1 (finding 3): "10s até 10 msgs" — with ≤ 10 pending and create quota available, delivery within 10 s; above that,
  delivery continues automatically within the limit; a replay that returns an already-stored message no longer
  consumes the create quota.
- D2 (finding 4): "Fila sobrevive" — reloading offline shows the normal browser error; when the page loads again the
  pending messages appear and are sent. No service worker / offline app shell.
- D3 (finding 7): "Aceitar até ~1h" — non-members never join; a removed member is taken off the channel by the app
  immediately; a tampered client may still receive only the typing signal until its access token expires (~1 h).
  Accepted residual risk.
- D4 (findings 16, 19, 15): selected "Sem auto-menção" (self not in the @ list, not recorded). Note: "faça o que
  considera as melhores praticas" — owner delegated the remaining small points: copy is proposed, equivalent
  Portuguese allowed; "ao vivo" across devices = within 5 s (orchestrator choice under this delegation).

### Disposition of review r2 findings (SPEC v2, 2026-10-06)

All 19 accepted and fixed in SPEC v2 (none rejected):
1 durable write before dispatch → FR-001, AC-040. 2 unknown-outcome + read-only lookup → FR-005/006/009, BR-005/007, AC-038/042.
3 delivery target qualified per D1 + quota-free replay → §3, FR-002/008, AC-009. 4 offline reload per D2 → FR-003, AC-004, §5 out.
5 atomic claim/cancel, lease recovery, ≤1 request per key → FR-004/005, AC-005/006/041. 6 identity fencing client+server → FR-011, BR-001, AC-044, AC-013 in-flight.
7 typing revocation per D3 → FR-019, BR-009, AC-019. 8 atomic mentions, mentions in composition, authoritative data → FR-024/025, AC-024.
9 browser-wide viewing suppression → FR-025, BR-011, AC-026. 10 409 retry with new key → FR-007, AC-043. 11 typed outcomes, 401 vs session end → FR-012, BR-005, AC-012.
12 Cancelar no side effects at every entry point → FR-013, AC-013. 13 §2 corrected; per-stream health incl. typing; independent drops; overlap → FR-014/015/016, AC-015/016.
14 metrics hardening (enums, bounds, server version, rate limit, bounded buffer, fire-and-forget, hang test) → FR-027/028, BR-013, AC-028/029.
15 partial read + sender receipts + 5 s (D4) → FR-021/022, AC-021/022. 16 self-mention excluded per D4 owner choice → BR-010, FR-023/024.
17 attachment upload-fail vs create-fail split → FR-010, AC-011. 18 Edge automated, Firefox verified → §10, AC-036, §15. 19 copy marked proposed per D4 → §13.
- Attempt 3 / re-review r3 (2026-10-06): same direct CLI, model gpt-6.1-sol, reasoning effort max confirmed in stderr; exit 0;
  `reviews/sol-review-spec-r3.md`. Verdict: revision required. r2 #4, #7–#12, #15–#19 confirmed resolved; #1, #2, #3 (J1),
  #5, #6, #13, #14 partial; 12 findings (3 High, 9 Medium). SPEC v2 preserved as `reviews/SPEC-v2-reviewed.md`.

### Disposition of review r3 findings (SPEC v3, 2026-10-06)

All 12 accepted and fixed (none rejected):
1 server attempt fencing + leases (30 s request / 45 s lease) → FR-004/005/006, BR-004/007, AC-041, AC-045.
2 degraded mode when IndexedDB fails (composer kept until confirmed, notice, leave-page warning) → FR-001, FR-033, AC-039.
3 notification re-authorized at emission, discarded on switch/removal → FR-025, BR-011, AC-049.
4 late create/fence responses after switch/logout discarded → FR-011, AC-047.
5 conversation-wide serialization across tabs (oldest unresolved only) → FR-004, BR-003, AC-005.
6 key-based correlation via clientMessageId everywhere → FR-034, AC-050.
7 metrics size/batch/in-flight/abort bounds restored → FR-027/028, AC-028/029.
8 winning-insert quota charge + separate replay/fence budget → FR-008, §12, AC-009.
9 replay compared to original composition, no recipient re-validation → FR-024, AC-046.
10 per-stream banner/polling + stale-poll non-degradation → FR-014/016, AC-014/016/048.
11 5 s targets conditioned on healthy connectivity; J1 carries D1 → §3, J1, FR-021/022.
12 outcome-class, plain @name, lookup-auth, leave-while-typing coverage → AC-017, AC-024, AC-044, AC-046.
Timing/size parameters set under D4 delegation and listed in §10 as owner-adjustable.
- Re-review r4 (2026-10-06): direct CLI, model gpt-6.1-sol / reasoning effort max confirmed; exit 0; `reviews/sol-review-spec-r4.md`.
  Verdict: revision required (3 High, 7 Medium, 1 Low). SPEC v3 preserved as `reviews/SPEC-v3-reviewed.md`.

## Owner decisions after SPEC review r4 (native question UI, 2026-10-06)

- D5 (r4 #1): "Bloquear envio" — if the outbox cannot be written (site storage blocked), nothing is dispatched; the text
  stays in the composer with "Este navegador não permite guardar mensagens; libere o armazenamento do site". Replaces
  v3's degraded send mode.
- D6 (r4 #3, #5): "Aceito os dois" — accepted residual risks: (1) a removal racing the final pre-display check may still
  let one last mention notification show; (2) a tampered client of a removed member may also SEND fake typing signals
  until its access token expires (~1 h), extending D3. The normal app re-checks right before display and leaves the
  typing topic within 5 s of a removal.

### Disposition of review r4 findings (SPEC v4, 2026-10-06)

All 11 accepted and fixed (none rejected): 1 → FR-033/AC-039 per D5. 2 attempt generations, stale requests/fences, same-identity
stale completions → FR-006/011, AC-045/047. 3 final check without awaits + D6 residual → FR-025, BR-011, AC-049. 4 hung holder
superseded on connectivity return → FR-004, AC-041. 5 removal detection ≤ 5 s independent of access + D6 send residual →
FR-019, BR-009, AC-019. 6 polling covers receipt summaries and open reader details → FR-016, AC-016. 7 request budget for all
create attempts → FR-008, §12, AC-009. 8 manual retry of expired item starts a new 24 h window → FR-009, BR-006, AC-010.
9 lookup-auth negatives, mention-only 409, metrics abort/buffer, 422 removed → AC-024/029/044/046, BR-005. 10 old-build and
Phase 4 build compatibility smoke against migrated local DB → §10, AC-034. 11 §2 baseline corrected.

## Owner decision D7 — SPEC review gate closed (2026-10-06)

Owner, verbatim: "chega de revisão 4 já está de bom tamanho ok? vamos terminar a spec, esta mais que revisada".
The owner waives a fifth adversarial review of the SPEC: r4 findings are applied in v4 without re-review. The AGENTS.md SPEC
review point is closed by this explicit owner decision (not by an approving review verdict). The PLAN, per-task, and final
review gates are unaffected.

## SPEC approval (owner, 2026-10-06)

SPEC.md Final v4 (34 FRs, 50 ACs) presented via native question UI; owner answered "Aprovada" and asked to stop here and
resume in a new session by invoking only the spec-to-done skill. Next stage: Plan (`references/plan.md`) — no PLAN.md yet.

## Plan stage (2026-10-06)

- PLAN.md v1 written (23 tasks T1–T23; mechanical check: every FR-001..034 and AC-001..050 in ≥ 1 Covers, all Covers IDs exist, dependencies acyclic).
- PLAN adversarial review gate (AGENTS.md point 2): r1 launched via direct Codex CLI (gpt-6.1-sol, effort max, read-only),
  prompt `reviews/review-prompt-plan-r1.txt`, output `reviews/sol-review-plan-r1.md`. Execution of T1 waits for an accepted review.
- PLAN review r1 (2026-10-06): model gpt-6.1-sol / reasoning effort max confirmed in stderr; exit 0; `reviews/sol-review-plan-r1.md`.
  Verdict: revision required (16 findings: 5 High, 10 Medium, 1 Low). All 16 accepted, none rejected; claims spot-checked
  (Playwright allowlist/Chromium-only, notification spec channel override, unused header sign-out handler, stale join route).
  PLAN v1 preserved as `reviews/PLAN-v1-reviewed.md`; PLAN v2 written (26 tasks; new T24 runner/fixtures, T25 per-stream
  fault harness, T27 fenced recovery split from T8; T9 after T10; fail-closed budgets and Phase 4 keyed compatibility as
  D4 planning decisions; final whole-diff review in T22; rollback order in T23).
- PLAN re-review r2 launched (same direct CLI), prompt `reviews/review-prompt-plan-r2.txt`, output `reviews/sol-review-plan-r2.md`.
- PLAN re-review r2 (2026-10-07): gpt-6.1-sol / effort max confirmed; exit 0; `reviews/sol-review-plan-r2.md`. Verdict: revision required (R1–R16: 13 resolved, R1/R8/R12 partial; new N1 High, N2 High, N3 Medium, N4 Medium). All accepted, none rejected; PLAN v2 preserved as `reviews/PLAN-v2-reviewed.md`; PLAN v3 written (T1–T6 regression via existing runner; generation-less commit-time exclusion; Phoenix single-stream frame shaping as D4 planning decision; T25 3×3 matrix; T27 transitions; T19 expired-retry latency). Re-review r3 launched.
- PLAN re-review r3 (2026-10-07): gpt-6.1-sol / effort max confirmed; exit 0; `reviews/sol-review-plan-r3.md`. Verdict: **approve** (R1, R8, R12, N1–N4 resolved; one new Low on T19 latency assertion → fixed in PLAN v3 Verify by, exact difference within 1 s). PLAN review gate (AGENTS.md point 2) passed for PLAN v3. Next: Execute T1.

## Owner decision D8 — T1 review finding 1 (2026-10-07)

Asked (native question UI, pt-BR) for the deployed git ref and a read-only online count of participants without a
conversation_members row. Owner, verbatim: "O aplicativo nao tem acesso por ninguem online, somente eu e uns amigos
acessamos no momento, então nao se preocupe". Recorded as accepted risk: an older hosted build that authorizes via
conversations.participants may get an error marking read for a participant whose member row was deleted, until the
Phase 5 app is deployed. No online read performed. AC-034's hosted-build smoke (T21) still needs the owner's git ref.

## Owner decision D9 — conversation_members self-enrollment gap (2026-10-07)

Discovered by the T4 performer and verified by the orchestrator on LOCAL: baseline policies on `public.conversation_members`
("Users can insert their own conversation preferences" WITH CHECK only user_id = caller; "Users can update their own
conversation preferences" with no WITH CHECK) plus INSERT/UPDATE grants to anon/authenticated let an authenticated user
add themselves to any conversation, or move their own row to another conversation, through the Data API. That defeats every
members-only rule (messages, attachments, receipts, mentions, roster, typing topic). App code does not need these client
writes: memberships come from the SECURITY DEFINER trigger `sync_conversation_members`, and the preferences/archive routes
write with the service-role client after `requireConversationParticipant`.
Asked (native question UI, pt-BR) whether to fix it in this phase. Owner chose: "Corrigir nesta fase (Recomendado)" — a new
task with a migration removing client creation/move of memberships, applied online with the others at T23, under the PLAN
and task review gates. To be planned as a replan (new task ID T28) after T4 closes.

## Replan to PLAN v4 (2026-10-07, after D9)

- PLAN v4 (T28 added after T4; T21 depends on T28) reviewed: r4 via direct Codex CLI (gpt-6.1-sol / effort max confirmed in stderr; exit 0), prompt `reviews/review-prompt-plan-r4.txt`, output `reviews/sol-review-plan-r4.md`. Verdict: revision required (2 High, 3 Medium). All accepted, none rejected; first v4 draft preserved as `reviews/PLAN-v4-r4-reviewed.md` (v3 as `reviews/PLAN-v3-reviewed.md`).
  - High 1 room sync restores removed members (sync inserts every NEW.participants id) → T28 now requires a removed membership to stay removed under unrelated writes, restored only by an authorized rejoin; tests removal → other user's join → still denied → authorized rejoin.
  - High 2 preference/archive service-role UPSERT recreates a membership removed after authorization → T28 requires update-only writes, vanished row → not a participant, with held-request integration tests.
  - Medium 3 hostile matrix incomplete → T28 Verify by covers actors and affected subjects (member granting an outsider, cross-company/arbitrary participants at creation, private-room creation, room_id/type retargeting + resolver/join) and asserts the full membership delta.
  - Medium 4 old-build compatibility → T28 keeps hosted/Phase 4 creation/join/preferences/archive/read (incl. user-scoped upserts of existing rows); T21 smokes extended (plus conditional Knock log check); T23 rollback in reverse order and notes undoing T28 restores the D9 gap.
  - Medium 5 fence 403 during unknown recovery → T27/T9 make it a BR-005 definitive failure, never "not stored" (no expiry/cancel); retry fences first; E2E for committed-response-lost and not-yet-stored items with removal before fencing.
- Re-review r5 launched (prompt `reviews/review-prompt-plan-r5.txt`, output `reviews/sol-review-plan-r5.md`). T28 and later tasks wait for an accepted review; T4 (unchanged by the replan) continues its own gate.
- PLAN re-review r5 (2026-10-07): gpt-6.1-sol / effort max confirmed; exit 0; `reviews/sol-review-plan-r5.md`. Verdict: revision required (r4 #1–#5 resolved; new High 1 grant racing a committed revocation; Medium 2 client DELETE outcome not enforced/verified). Both accepted: T28 now requires authorization to hold when the membership is written (held creation/join/rejoin vs committed revocation tests, current and legacy writes) and an enforced, verified client DELETE meaning (refused, or leave distinct from revocation; other users' memberships never deletable). Draft preserved as `reviews/PLAN-v4-r5-reviewed.md`. Re-review r6 launched.
- PLAN re-review r6 (2026-10-07): gpt-6.1-sol / effort max confirmed; exit 0; `reviews/sol-review-plan-r6.md`. Verdict: **approve**, no findings. PLAN review gate passed for PLAN v4 (TRACK "Replan — plan version 4").

## T28 note (2026-10-07)

T28 done (TRACK T28). Inherited compatibility limitation recorded for T21: hosted build e27dd10 cannot create conversations (INSERT … RETURNING, users.id ≠ supabase_uid → 403/42501) on the pre-T28 database already; D8 covers only missing-member read errors, so the T21 hosted-build smoke needs this exception confirmed with the owner's git ref.

## Owner decision D10 — execution pace (2026-10-08)
Owner asked to speed up the phase ("esta demorando muito") and chose, via the native question UI, "Menos rodadas" and "Regressão só no fim" (declined "Adiar menções" and "Manter como está").
- Review rounds: a task's adversarial review that returns only Low findings (or approve with Lows) closes the gate; Lows are fixed or rejected and recorded in TRACK without a further review round. A High or Medium (including one the orchestrator rejects) still requires another round. Final whole-diff review (T22) unchanged.
- Regression cadence: per task, the Phase 4 regression E2E runs in Chrome only (`npx playwright test -c playwright.messaging-phase5.config.ts --project=regression-chrome`), plus the messaging DB suite when server code changes; the full Chrome + Edge regression runs at phase end (T22) and whenever a task touches the runner or shared fixtures. New specs still need 3 consecutive passing runs in Chrome and in Edge (AC-036, SPEC unchanged).
- Scope unchanged (no SPEC change); PLAN tasks, dependencies and acceptance unchanged, so no replan; the PLAN Standing rule "Regression" is annotated with D10.

## Owner decision D11 — review and test cadence per block (2026-10-08)
Owner, verbatim: "ta tudo muito demorado, esse workflow talvez de testes a cada tarefa nao esta funcionando, nao temos dinheiro e tempo pra perder com pequenas melhorias assim". Chose, via the native question UI, all four recommended options: "Por bloco + final", "Só falha real", "Leve por tarefa", "Fechar já" (T8).
- Adversarial review per block, not per task (AGENTS.md "Adversarial review gate" point 3 rewritten accordingly): block A outbox = T8, T27, T10, T9, T11, T12; block B Realtime = T13, T14, T15, T16; block C = T17, T18, T19, T20, T21; final whole-diff review in T22 unchanged.
- Another round only for a High/Medium that a real user or a realistic failure (network, browser, crash, concurrency) can trigger; findings that need the application's own server broken or tampered with become recorded follow-ups. At most one fix round per block; anything left is recorded in TRACK and carried to the final review.
- Per task: type-check, lint, one Chrome pass of the task's new specs (plus its non-vacuity break). Per block, after its last task: 3 consecutive runs in Chrome and Edge over all of the block's new specs (AC-036 still satisfied), regression E2E in Chrome, messaging DB suite when server code changed. Full Chrome + Edge regression at T22 (D10).
- Migration, Supabase/RLS reviewer and presence-safety gates unchanged. Scope and acceptance unchanged (no SPEC change, no replan); PLAN Standing rules annotated with D11.
- T8 closes after the in-flight review-r4 fixes (one Chrome pass), without a fifth review; block A review covers T8 again.

## Owner decision D12 — one Chrome+Edge run per block, 3 runs at the end (2026-10-09)
Owner, verbatim: "Onde estamos faz 3 dias que estamos nessa fase!, a ultima fase foi meio dia de desenvolvimento, porque essa fase é tao demorada?". Chose, via the native question UI, "1 passada por bloco (Recomendado)" and "Fazer as 5 tarefas" (block C keeps T17–T21; scope unchanged).
- Per block, after its last task: one run of the block's new specs in Chrome and Edge with zero retries (replaces D11's 3 consecutive runs per block), regression E2E in Chrome, messaging DB suite when server code changed.
- AC-036's 3 consecutive Chrome and Edge runs of every new spec run once, at T22, on the final tree (all phase 5 specs), together with the full Chrome + Edge regression.
- Block B closes on blockB-run-1 (94/94 Chrome+Edge) plus its Chrome regression; the stopped second run is recorded as superseded.
- AGENTS.md Verification and PLAN Standing rules updated; review cadence (D11) unchanged; no SPEC change, no replan.

## Owner decision D13 — AC-036 one final run (2026-10-09)
Owner, verbatim: "essa coisa dos 3 testa j'a tinhamos decidido, porque n~ao foi atualizaod no agents.md? esses testes estao acabando com nosso prazo". Orchestrator's account: AGENTS.md matched D11 as chosen ("Leve por tarefa" said 3 runs at the end of each block), but the option did not state its wall-clock cost (~3 h per block); the D12 text left AC-036's 3 runs (~6 h) for T22. Chose, via the native question UI, "1 passada no fim (Recomendado)".
- SPEC AC-036 amended in place (marked D13): one run of every new spec in Chrome and in Edge on the final tree with zero retries; a failing test is analysed and rerun alone. Firefox check and the unit-test clauses unchanged.
- T22 runs every new spec and the full regression once in Chrome and Edge; AGENTS.md Verification "Final" and PLAN Standing rules/T22 updated. Per-block cadence stays as D12.

## Owner decision D14 — no old-build smoke; deploy the app right after the migrations (2026-10-09)
Asked (native question UI, pt-BR) whether T21 should run the hosted build against the migrated local database (hosted ref to confirm; last record e27dd10) or skip it and publish database and app together. Chose "Publicar tudo junto (Recomendado)": with only the owner and friends using the app, a few minutes in which the old app may error are accepted.
- SPEC AC-034 amended in place (marked D14): old-build smoke (hosted and Phase 4 builds) waived. T21 reduces to the migration list vs MIGRATIONS-PENDENTES.md and rollback check.
- T23 order: owner authorization → apply all phase migrations to `vhabpcoyypobgasacsko` → catalog readback → owner deploys the Phase 5 app immediately → runtime smoke. Known effects in the window on the hosted pre-Phase-4 build: reads may error for participants without a member row (D8), conversation creation already fails (TRACK T28), and keyed/legacy sends depend on the T3 budgets contract. Rollback stays app first, then SQL.

## Owner decision D15 — E2E only at the end (2026-10-10)
Asked (native question UI, pt-BR) how to close the phase without more test rounds. Owner, verbatim: "corrija o que tiver que corrigir, mas testes e2e só no final, nossa experiencia da ultima vez derrubou a maquina".
- Block C fix round (F1, F2, F4, F6, F7, F8, F9) is finished and verified by type-check, lint and diff check only; the edited/new specs are written but not run now. The block C Chrome+Edge gate run, its Chrome regression and the per-fix non-vacuity break are waived; block C closes on review r1 + fix round + static checks, the specs' first run happens at T22.
- E2E runs only once, at T22 (D13 content unchanged: every new spec + full regression, Chrome and Edge, zero retries, a failing test rerun alone), one Playwright process at a time, nothing heavy (Codex review, agents running tests) in parallel.
- AGENTS.md Verification and PLAN Standing rules updated; no SPEC change (AC-036 already one final run), no replan.

## Owner decision D16 — one browser only (2026-10-10)
Owner, verbatim: "eu nao quero em chrome e no edge, guarde isso apenas em 1 dos dois, tanto faz, não existe mais esse negocio de incompatibilidade hoje em dia ... entao nada de rodar nos 2 , apenas em 1".
- T22's single E2E run (every new spec + full regression) runs in Chrome only, zero retries; no Edge run and no Firefox verification. SPEC (§ flows, browsers, AC-036, environments, DoD) amended in place, marked D16; PLAN T22 and AGENTS.md Verification "Final" updated. No replan.
