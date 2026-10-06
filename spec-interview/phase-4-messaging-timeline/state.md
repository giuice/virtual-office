Status: closed

# Spec Interview State — phase-4-messaging-timeline

## Scope restatement

Phase 4 — Messaging Timeline: complete the production messaging drawer
(MessagingDrawer → MessageFeed → MessageComposer/MessageItem) with read-receipt
details (who read and when), usable file attachments (drag/drop, progress,
previews), voice notes (record, waveform, playback), and star/unstar with a
starred-message filter — reusing the existing APIs, repositories, hooks, and
TanStack Query cache. One SPEC per roadmap phase was requested by the user
(2026-10-03); this is the Phase 4 SPEC. Phase 5 (Messaging Resilience) will get
its own spec-interview folder later.

## Context inputs (not answers)

The user did NOT authorize using supplied documents as interview answers. These
inform questions only:

- `.planning/ROADMAP.md` Phase 4 (historical; MSG-01..04 and success criteria).
- `docs/messaging/phase-4-source-baseline.md` (source inventory 2026-10-03).
- Source facts verified this session:
  - `message_read_receipts(id, message_id, user_id, read_at, conversation_id)`
    exists; RLS policy `read_receipts_in_own_conversations` lets any
    conversation member read all receipts of that conversation
    (migration 20260612130141); table is in the Realtime publication.
    Paginated repository selects only `message_id`, so identities/times
    never reach the feed.
  - Membership = `conversation_members` (`private.is_conversation_member`),
    for direct, group, and room conversations alike.
  - Upload route `src/app/api/messages/upload/route.ts`: 10 MB max; MIME
    allowlist = jpeg/png/gif/webp, pdf, txt, doc/docx, xls/xlsx. No audio
    types → voice notes need allowlist + bucket changes. Private
    `attachments` bucket with signed reads.
  - `getStarredMessages(userId, conversationId?)` exists in the repository,
    but no API route lists starred messages (only
    `api/messages/[messageId]/star`). MessageItem already renders a
    Star/Unstar menu entry; MessageFeed passes no callbacks.
  - Conversation types: `direct | group | room`.
  - No message-deletion feature exists in repository/routes/MessageItem.
  - Phase 3 spatial audio uses the same microphone (voice-note interaction).

## Rounds

- Round 1: `round-1.html` — answered 2026-10-03 (pasted JSON).
- Round 2: `round-2.html` — sent 2026-10-03, awaiting answers.

## Answers by domain (round 1, user answers)

### Problem, goals, scope
- R1-q1 = A: one SPEC with all 4 items (read receipts, attachments, voice
  notes, starred), delivered in ordered slices (e.g. receipts+starred →
  attachments → voice).
- R1-q2 = A,B,C,D: all features in direct, group, and room conversations;
  production drawer only (debug/messaging-comparison page out).
- R1-q20 = A: success = two people, in the production drawer, without bugs:
  see who read and when, send/see files, send/hear voice, find an old
  starred message — each flow covered by E2E.

### Read receipts
- R1-q3 = A: summary indicator on the message (e.g. "Lida por 3"); opening/
  hover shows readers with name, avatar, and time.
- R1-q4 = A: "read" = the message appeared on the recipient's screen with the
  drawer open on that conversation and the browser tab focused.
- R1-q5 = A: always on; only the message's sender can see the details
  (current RLS lets every member read all receipts → restrict in UI and/or
  API).

### Attachments
- R1-q6 = A: keep server limits — 10 MB; jpeg/png/gif/webp, PDF, txt, Word,
  Excel (+ audio formats only for voice notes).
- R1-q7 = A: up to 5 files per message, optional text; attachment-only
  messages allowed.
- R1-q8 = A,B: images inline thumbnail + lightbox; PDF/Office/txt card with
  icon, name, size, download. (No inline PDF render; GIF autoplay not chosen.)
- R1-q9 = A: per-file progress in composer; remove/cancel each file; message
  sent only after ALL uploads finish; failure shows error + retry; orphan
  files never visible to anyone.

### Voice notes
- R1-q10 = A: click mic → live waveform + timer → stop → preview listen →
  send or discard.
- R1-q11 = A: max 2 minutes; auto-stop at limit with warning in last 10 s.
- R1-q12 = A: Chrome + Edge desktop mandatory; Firefox/Safari best effort
  (a Chrome-recorded note must play in Safari or show a clear error).

### Starred
- R1-q13 = A: header button switches feed to "only my starred in this
  conversation"; clicking a result returns to normal feed scrolled to the
  message with highlight.
- R1-q14 = A: load history until the message is reached (with loading
  indicator), scroll and highlight; if deleted or access lost, show notice
  and keep feed stable.

### Out of scope (R1-q15)
- Selected out: B (Realtime reconnect/polling, typing, multi-device sync —
  Phase 5; existing behavior must keep working), F (voice transcription).
- NOT selected (open → round 2): A offline queue, C desktop notifications +
  metrics, D message text search / auto infinite scroll / "New messages"
  affordance, E edit/delete attachments after send.
- User note (verbatim): "Podemos conversar melhor sobre deixar por exemplo
  fila offline e REconexão? , as notifica;çoes desktop eu acho essenciais."

### Must-not-happen (R1-q16 = A,B,C,D,E)
- No attachment/voice note reachable by public URL or by non-members
  (private bucket + signed URL).
- Sender never generates a read receipt for their own message.
- Nothing that works in the drawer breaks: text, replies/threads, reactions,
  typing, history, real-time send.
- No new paid service (storage, transcoding, media SaaS).
- Never compare users.id with auth.uid(); identity via supabase_uid.

### Database and rollout (R1-q17 = A + note)
- Local database first; online target `vhabpcoyypobgasacsko`.
- User note (verbatim): "Aplica-se local, mas nunca, nunca mesmo avança pra
  proxima tarefa sem aplicar online depois de testado, isso tem que ser
  regra para nao se esquecer de migraçoes como foram no passado, uma
  bagunça".
- → Hard rule: a task with a migration is not done, and the next task does
  not start, until the migration is tested locally AND applied to the online
  target with readback. This overrides option A's "only at the end".
  Authorization model per migration → round 2.

### Acceptance / test strategy (R1-q18 = A + note)
- Tests from acceptance criteria; integration for repository/routes/RLS on
  local Postgres; Playwright with two real accounts per flow; then owner UAT.
- User note (verbatim): "Eu gostaria de evitar testes inuteis unitarios como
  fizemos até agora, tem testes que fora apenas feitos pra se acomodar ao
  código, isso é má pratica. Testes tem que ser E2E e integração. unitário
  somente se extremamente necessario, se vc perceber nossos testes viraram um
  monstro".
- → Rule: new tests are E2E + integration; unit tests only when strictly
  necessary (justify); no tests that mirror implementation. Treatment of
  existing tests → round 2.

### Accessibility (R1-q19 = A)
- Keyboard operable; screen-reader labels (record, play, star, readers list);
  works at current drawer width including narrow screens.

## Answers by domain (round 2, user answers)

- R2-q1 = A: offline queue → Phase 5. Phase 4 only guarantees a failed
  send/upload is not lost: text and files stay in the composer with error and
  "try again".
- R2-q2 = A: reconnection recovery/polling → Phase 5. Phase 4 must not
  regress current reconnect; new features (receipts, starred, attachments)
  must refresh when the existing reconnect happens.
- R2-q3 = A: Must in Phase 4 — desktop notification for a new message in DM
  and group when the tab is in background (or the drawer is not open on that
  conversation), with explicit permission request. @mentions and fine rules
  (mute, rooms) → Phase 5.
- R2-q4 = D: message text search, automatic infinite scroll, "New messages"
  affordance → out of Phase 4 (backlog).
- R2-q5 = A: no deleting messages or editing attachments after send;
  cancelled/failed upload files are cleaned up.
- R2-q6 = A + note (verbatim): "Temos que ser avisado para aplicar, nao se
  pode passar pra proxima fase" → conflicts with A's "apply immediately
  without pausing"; clarification asked in round 3.
- R2-q7 = A: every migration must be backward compatible with the published
  app (additive). App deploy stays with the user; phase ends with the app
  ready and verified locally against the online database.
- R2-q8 = A: only messaging tests touched by this phase: implementation-
  mirroring tests are replaced by equivalent integration/E2E coverage and
  removed, each removal listed with reason in TRACK; never remove without
  equivalent coverage.
- R2-q9 = A: while recording a voice note, the spatial-audio room mic is
  auto-muted (visible notice) and restored to its prior state when recording
  ends or is discarded.
- R2-q10 = A: mic denied / missing / unsupported → clear composer message
  with reason and how to enable; text and attachments keep working;
  unsupported → record button disabled with explanation.
- R2-q11 = A: "Lida por 3" + list of the 3 readers with time (most recent
  first); no denominator, no "not read" list.
- R2-q12 = A only: sender's indicator/reader list updates in real time while
  the conversation is open. B (unread counter decreases only as messages are
  seen) and C (open at first unread) NOT selected → unread-counter semantics
  asked in round 3.
- R2-q13 = A: clipboard image paste (Ctrl+V) = Should.
- R2-q14 = A: starred list ordered by message date, newest first; stars are
  personal and apply across all of the user's devices.

## Answers (round 3, native question UI, 2026-10-03)

- R3-a (q6 clarification) = "Eu paro e peço OK": after local tests pass, the
  agent stops, notifies the user with migration name, target
  (`vhabpcoyypobgasacsko`), and rollback, and waits for OK. With OK, the agent
  applies, reads back, and smoke-checks. Without OK, the next task does not
  start. (Replaces R2-q6 pre-authorization.)
- R3-b (q12 clarification) = "Segue a regra da leitura": the conversation-list
  unread counter decreases as messages actually appear on screen (same rule as
  receipts). Example: open a conversation with 20 unread, see only the last
  5 → counter shows 15 until the user scrolls.

## Current understanding

| Area | Status | Notes |
|---|---|---|
| Goals | Clear | R1-q1, R1-q20 |
| Users | Clear | R1-q2: members of direct/group/room; sender vs recipient roles (R1-q5) |
| Requirements | Clear | R1-q3..q14, R2-q1, q3, q9..q14, R3-b |
| Constraints | Clear | R1-q6, q12, q16, q17; R2-q7; R3-a |
| Edge cases | Clear | R1-q9, q14; R2-q1, q9, q10, q11; R3-b example |
| Business rules | Clear | R1-q4, q5, q7, q11; R2-q11, q14; R3-b |
| Acceptance criteria | Clear | R1-q20 success signal + per-flow choices; ACs derived in SPEC |
| Test strategy (code only) | Clear | R1-q18 + note; R2-q8 |

## Remaining unknowns

- None blocking.

## User confirmation

- 2026-10-03: the full current-understanding summary (Must items 1–6, out of
  scope, must-not-happen rules, database rule, test policy) was presented in
  chat; the additions/corrections question was answered "Confirmo, pode
  escrever" ("the understanding is right; write the SPEC and proceed to the
  plan"). Recorded as user approval.

## SPEC readiness check

- Goals are specific and measurable: Pass — R1-q1, R1-q20 (two-user flows, each E2E-covered).
- Users and stakeholders are identified: Pass — R1-q2 (members of direct/group/room), R1-q5 (sender vs recipient), owner UAT R1-q18.
- In-scope and out-of-scope boundaries are explicit: Pass — R1-q1, q2, q15; R2-q1..q5.
- Functional requirements are testable: Pass — R1-q3..q14, R2-q3, q9..q14, R3-b each define observable behavior.
- Business rules are explicit: Pass — R1-q4, q5, q7, q11; R2-q11, q14; R3-b (20 unread/5 seen → 15 example).
- Constraints are explicit: Pass — R1-q6, q12, q16, q17 note; R2-q7; R3-a.
- Edge cases and failure modes are covered: Pass — R1-q9, q14; R2-q1, q9, q10; R3-b.
- Acceptance criteria are observable: Pass — derived one-to-one from the cited answers in SPEC §14.
- Every Must-priority functional requirement has at least one acceptance criterion: Pass — SPEC §14 traceability.
- Every mandatory business rule, hard constraint, and must-not-happen condition is validated by at least one acceptance criterion: Pass — SPEC §14 traceability (R1-q16 A..E, R3-a, R2-q7, R2-q8).
- Test strategy is defined (code projects only): Pass — R1-q18 + note, R2-q8.
- Open questions are non-blocking or intentionally deferred: Pass — only implementation-level choices remain (audio codec selection within Chrome/Edge floor; exact UI copy).
- The user confirmed the current understanding after the additions/corrections question: Pass — "User confirmation" above.

Verdict: Ready

## Contract amendments

- 2026-10-04 (owner, chat, verbatim): "EU ACHO QUE COMETI UM ERRO PEDINDO PRA APLICAR MIGRAÇOES TODA HORA ONLINE, VAMOS FAZER ISSO QUANDO TODA A FASE ESTIVER FINALIZADA." → BR-012, AC-032, and §10 constraint amended in SPEC.md: migrations stay local during the phase; all are applied online together at phase end after the owner's OK, with readback and smoke. Same message: owner approved fixing the pre-existing anon EXECUTE grant on `mark_conversation_read` ("2. SIM").
