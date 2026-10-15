Status: active

# Spec Interview State — phase-6-meeting-notes

## Scope restatement

Phase 6 — Meeting Notes: let users capture meeting notes per space (title,
date, participants, rich text), track action items, view/edit/delete with
version history, upload transcripts (.txt/.vtt/.srt) for an AI-generated
summary and extracted action items, search across notes, and export notes
(MEET-01..07 + Markdown export; MEET-08 notifications deferred). User request
2026-10-12: "vamos dar inicio a fase 6 do projeto. para acompanhamento
@.planning/ROADMAP.md".

## Context inputs (not answers)

The user did NOT authorize using supplied documents as interview answers. These
inform questions only:

- `.planning/ROADMAP.md` Phase 6 (goal + 5 success criteria) and
  `.planning/REQUIREMENTS.md` MEET-01..08 — historical GSD reference.
- Existing schema (baseline migration `20260610183000`): `meeting_notes`
  (room_id → spaces ON DELETE CASCADE, title, meeting_date, transcript,
  summary NOT NULL, generated_by enum ai|user, edited_by, timestamps; no
  content/participants/versions columns) and `meeting_note_action_items`
  (note_id cascade, description, assignee_id → users.id, due_date, completed).
  RLS enabled; authenticated has SELECT only; no write path.
- Code: `IMeetingNoteRepository` + `SupabaseMeetingNoteRepository` (unused by
  UI), dashboard QuickLinks card "AI Meeting Notes" (placeholder).
- No AI provider key or e-mail provider in `.env.local`; pg_cron already used
  by earlier migrations; desktop notifications exist from Phase 4/5 messaging.
- Owner memory: a design/usability refresh was planned as the next spec
  (investor presentation); the owner now explicitly chose Phase 6.
- Policy evidence (fetched 2026-10-12, code.claude.com/docs/en/legal-and-compliance):
  "Anthropic does not permit third-party developers to offer Claude.ai login
  into their own applications, or to route requests through Free, Pro, or Max
  plan credentials on behalf of their users. … developers may not collect,
  store, or intermediate Claude.ai credentials or session tokens." Developers
  must use API keys (Console or a cloud provider). OpenAI/Codex subscription
  sign-in for third-party web apps: no supported route verified.

## Rounds

- Round 1: `round-1.html` — answered 2026-10-12 (below).
- Round 2: `round-2.html` — sent 2026-10-12, awaiting answers.

## Answers — Round 1 (2026-10-12)

| Q | Answer | Read as |
|---|---|---|
| q1 scope | M1–M7; M8 not selected | MEET-01..07 mandatory; MEET-08 (notifications/reminders) deferred — confirm in round 2 |
| q2 goal | A | Real daily team use, also presentable to investors (production quality, polished AI flow) |
| q3 UI | A | "Notas" tab in space detail + "Reuniões" page with list + global search; dashboard card links there |
| q4 view | A | All company members see all notes |
| q5 edit/delete | A | Edit: author + participants. Delete: author + admins (admin edit: round 2) |
| q6 participants | A | Manual picker of company members |
| q7 rich text | A | Visual editor (bold, italic, headings, lists, checklists, links); new dependency allowed; sanitized |
| q8 versions | A | List versions (who/when), open old version, restore (restore = new version) |
| q9 delete | A | Hard delete with confirmation (note, versions, action items) |
| q10 AI provider | A + note: "conexao por auth codex e claude pra quem já assina, com opção de escolher o modelo e o resoning" | Claude server-side; owner wants users who already subscribe (Claude/Codex) to connect their own account, with model and reasoning choice. Subscription login is NOT permitted by Anthropic policy (see context) → round 2 asks for the compliant connection model |
| q11 limits | A | Per-company daily cap (e.g. 20 processings) + transcript ≤ ~1 MB |
| q12 AI review | A | AI produces draft; user reviews/edits summary and confirms each suggested action item before save |
| q13 transcript | A | Store transcript text with the note (visible to note viewers) + notice that text goes to the AI provider |
| q14 language | A | Summary in transcript language; UI in the app's current language |
| q15 search | A | Postgres full-text, accent-insensitive, only visible notes, shows where it matched |
| q16 channels | N1, N2 | In-app + desktop — applies only if/when MEET-08 is in scope |
| q17 reminders | A | 24 h before + due day if open, never for completed — applies only if MEET-08 in scope |
| q18 concurrency | A | Second saver gets conflict warning; no silent overwrite |
| q19 space deleted | A | Notes survive, marked "espaço removido", visible on Reuniões page (needs FK change) |
| q20 rollout | A | Migrations local during phase; online at the end with explicit authorization |
| q21 out of scope | X1, X2, X3, X5 + note on X4: "exportar para markdown é bem simples … sem exportar perdemos uma feature necessaria" | Out: auto recording/transcription of calls, calendar integration, external sharing, templates. IN: Markdown export (PDF not mentioned → confirm out) |
| q22 acceptance | A | Integration + 2-account E2E (single final Chrome run) + owner test against online DB |
| q23 test data | A | Fictional transcripts (.txt/.vtt/.srt, PT and EN); no real data |

## Answers — Round 2 (2026-10-12)

| Q | Answer | Read as |
|---|---|---|
| q1 connection | A + note: "Contanto que tenha auth codex, isso é importante pois eu assino openai e vou testar com isso. mas cahve de api serira interessante pra openai, claude e alguns outros tipo kimi e glm" | Company-owned API keys (admin, encrypted server-side, billed to the company); owner also wants ChatGPT/Codex subscription sign-in and providers Kimi + GLM → round 3 |
| q2 providers | A | Anthropic + OpenAI at launch (note in q1 adds Kimi, GLM → round 3) |
| q3 model/effort | B | Admin only sets model + reasoning for the whole company |
| q4 daily cap | A | Always applies; admin adjusts 1–200 |
| q5 no AI configured | A | Manual notes work; AI button disabled with "admin must configure"; admin sees config link |
| q6 M8 | none + note "me explica o que é m8" | Unresolved → round 3 with explanation |
| q7 export | A | .md with title, date, space, participants, content, summary, action items; transcript only if opted in; PDF out |
| q8 action-item perms | A | Create/edit/delete: note editors; complete: note editors + assignee |
| q9 action-item fields | A | Description required; 1 optional assignee (company member); optional due date, date only |
| q10 versions | A | Each save versions title/date/participants/content/summary; action items current-state only |
| q11 create/admin | A | Any company member creates in any company space; admins edit any note |
| q12 transcript flow | A | New note from transcript OR attach to existing; 1 transcript per note (replace); reprocess = new draft, counts toward cap |
| q13 failures | F1–F5 (F6 not selected) | F1 reject invalid before AI, not saved/counted; F2 strip VTT/SRT cues keep speakers; F3 AI failure keeps note+transcript, retry, not counted; F4 unmatched/ambiguous assignee → unassigned; F5 departed members shown as "ex-membro", lose access. No background processing: leaving the page cancels, not counted |
| q14 sizes | A | Title ≤200; content ≤~100k chars; ≤50 participants; ≤100 action items/note; transcript ≤1 MB |
| q15 metrics | A | 1 h transcript draft ≤60 s; search ≤1 s at 1,000 notes; zero cross-company leakage |
| q16 search filters | A | Text + space + period filters; relevance then date; pagination |
| q17 AI testing | A | Automated tests use a local API-compatible fake AI server (env-configured); real call verified in owner's final test |

External evidence for round 3 (2026-10-12 web search): OpenAI "Sign in with ChatGPT"
lets subscribers spend plan usage in third-party apps, but as a limited
preview with selected partners; no public developer access or docs found.
Sources: thenewstack.io/sign-in-with-chatgpt/, xenospectrum.com/en/chatgpt-sign-in-subscription-apps/,
help.openai.com/en/articles/20001410.

## Answers — Round 3 (2026-10-12, native question UI)

| Q | Answer | Read as |
|---|---|---|
| ChatGPT sign-in | "Chave de API agora (Recomendado)" | This phase: API keys only. "Sign in with ChatGPT" is a future item contingent on OpenAI granting access; owner tests OpenAI with a platform API key |
| Providers | "Claude+OpenAI+Kimi+GLM (Recomendado)" | Anthropic + OpenAI native; Kimi + GLM as presets on an OpenAI-compatible connector; admin picks one; processing notice names the provider |
| M8 | asked "se a gente adiar onde vai ficar isso no roadmap?" → then "Juntar à Fase 7 (Recomendado)" | MEET-08 moves to Phase 7 (Announcements), sharing a notification center + scheduler; record in ROADMAP |

## SPEC adversarial review r1 (2026-10-12)

Prompt `reviews/review-prompt-spec.txt`; result `reviews/sol-review-spec-r1.md`
(gpt-6.1-sol, reasoning effort max per stderr startup summary, exit 0).
Verdict: REVISION REQUIRED — H1–H4, M1–M9, L1–L2. Reviewed text preserved at
`reviews/SPEC-v1-reviewed.md`. Owner decisions needed for H1, M2, M5, L1 → round 4.

## Answers — Round 4 (2026-10-12, native question UI, from review r1)

| Q | Answer | Read as |
|---|---|---|
| Limit counting (H1) | "Conta se chegou ao provedor (Recomendado)" | Every dispatched processing counts (success, page left, timeout, malformed output). Not counted: rejected file, invalid key, provider refusing before processing (unavailable/auth), errors before dispatch. Supersedes r1/r2 "failure/leaving not counted" for post-dispatch cases |
| Upload persistence (M2) | "Salva no upload (Recomendado)" | New-from-transcript creates the note at upload (title = file name, date = today, editable) with transcript; attaching replaces the stored transcript immediately; AI only produces a draft |
| Reprocess items (M5) | "Acrescenta (Recomendado)" | Existing items untouched; accepted suggestions appended; duplicates of existing descriptions come unchecked with "already exists"; save blocked if total > 100 |
| Default/day (L1) | "20/dia, zera 00:00 Brasília (Recomendado)" | Default limit 20; day boundary midnight America/Sao_Paulo |

### Review r1 dispositions (SPEC v2)

| Finding | Disposition |
|---|---|
| H1 cancellation bypasses limit | Fixed — owner r4: count at dispatch (FR-022, BR-008, AC-016) |
| H2 quota admission/settlement | Fixed — atomic reservation, idempotency key, crash stays counted, day = America/Sao_Paulo (FR-022/023, AC-028) |
| H3 durable company/author | Fixed — immutable company_id/created_by, room_id SET NULL, company delete cascades, legacy preflight (FR-028/029, §9) |
| H4 stale provider notice | Fixed — settings revision bound to start, snapshot, no fallback (FR-015/016, BR-013, AC-025) |
| M1 mutation authorization | Fixed — pre-change auth at API + DB, completion-only path, immutable parent ids, participants/restore rule (BR-003/004/005, AC-004/008) |
| M2 persistence contradiction | Fixed — owner r4: note/transcript saved at upload (FR-012, AC-010) |
| M3 concurrency/atomicity | Fixed — note revision covers all changes incl. restore/attach/Apply; per-item revision; atomic Apply (FR-007/018, AC-005) |
| M4 membership semantics | Fixed — membership = users.company_id; name snapshots; rejoin; former members retained (BR-001, FR-030, AC-021) |
| M5 reprocess merge | Fixed — owner r4: append, duplicates unchecked, >100 refused (FR-018/019, AC-027) |
| M6 key isolation | Fixed — server-only encrypted storage, not companies.settings, canary checks (BR-009, FR-024, AC-017) |
| M7 size/capabilities/latency | Fixed — capability matrix, context preflight, bounded output, SM-1 fixture/interval (FR-020, SM-1, AC-026) |
| M8 AC coverage | Fixed — AC-001..AC-028 expanded |
| M9 migration contracts | Fixed — §9 database contracts, date-only due date, preflight/readback/rollback |
| L1 default 20 | Fixed — owner r4 confirmed 20 + Brasília reset |
| L2 AC-001 ordering | Fixed — AC-001 adds backdated note |

Rule change recorded: r2 F3 "AI failure not counted" is superseded by r4 for failures after the provider processed.

### Review r2 (2026-10-12) and dispositions (SPEC v3)

Prompt `reviews/review-prompt-spec-r2.txt`; result `reviews/sol-review-spec-r2.md`
(gpt-6.1-sol, effort max, exit 0). Verdict: REVISION REQUIRED. Round-1 status:
11 Resolved, 4 Partially (H2, M3, M4, M8 → N1–N5, N9). v2 preserved at `reviews/SPEC-v2-reviewed.md`.

| Finding | Disposition |
|---|---|
| N1 High SDK retries escape reservation | Fixed — no automatic SDK/transport retries; one reservation = one dispatch (FR-016, FR-022, AC-029) |
| N2 Med refund classification | Fixed — documented pre-processing signals per adapter only; ambiguous stays counted; server-only settlement (FR-022, AC-028/029) |
| N3 Med idempotency scope | Fixed — FR-031 (user/company/operation scope, binding, 48 h retention, Try again = new key) |
| N4 Med removal during generation | Fixed — membership recheck at return and in Apply (FR-018, FR-021, AC-030) |
| N5 Med draft source revision | Fixed — draft carries source revision; Apply compares against it (FR-018, AC-030) |
| N6 Med roster export | Fixed — only transcript sent; names resolved locally (FR-016/017, AC-013). No owner decision needed: narrows data sent |
| N7 Med author/editor deletion | Fixed — id SET NULL + name snapshots for author and version editors (FR-029, §9, AC-031) |
| N8 Low navigation cancellation | Fixed — browser cancel + best-effort outbound abort; counting unchanged (FR-021) |
| N9 Low AC-009 masking | Fixed — below-capacity fixture for validators (AC-009) |

### Review r3 (2026-10-12) and dispositions (SPEC v4)

Prompt `reviews/review-prompt-spec-r3.txt`; result `reviews/sol-review-spec-r3.md`
(gpt-6.1-sol, effort max, exit 0). Verdict: REVISION REQUIRED. Prior status:
8 Resolved, 5 Partially (N3, N4, N7, H2, M4 → R3-1..R3-5). v3 preserved at `reviews/SPEC-v3-reviewed.md`.

| Finding | Disposition |
|---|---|
| R3-1 Med replay vs discard | Fixed — discarded ops keep no content; replay returns "discarded"; deletions never replenish usage (FR-021, FR-031, AC-034) |
| R3-2 Med expiry/crash | Fixed — 24 h replay window then "expired", 30-day records, 10-min stale → "failed" counted (FR-031, AC-034) |
| R3-3 Med browser fencing | Fixed — client scope by user+company; clear/cancel/drop late responses (FR-021, AC-033) |
| R3-4 Med capacity race | Fixed — atomic capacity for all insertion paths (FR-011, AC-032) |
| R3-5 Low historical identity | Fixed — historical id/name snapshots separate from live FK (FR-029, §9, AC-031) |
| R3-6 Low refund fixtures | Fixed — initial non-2xx listed per adapter; in-stream/unknown counted (FR-022, AC-029) |

### Review r4 (2026-10-12) and dispositions (SPEC v5)

Prompt `reviews/review-prompt-spec-r4.txt`; result `reviews/sol-review-spec-r4.md`
(gpt-6.1-sol, effort max, exit 0). Verdict: REVISION REQUIRED. Prior: 7 Resolved, 4 Partially (all traced to R4-1/R4-2). v4 preserved at `reviews/SPEC-v4-reviewed.md`.

| Finding | Disposition |
|---|---|
| R4-1 Med expired-key after cleanup | Fixed — signed server-issued ticket valid 24 h, verifiable without records (FR-031, AC-034) |
| R4-2 Low AC-032 fixture | Fixed — 99-item add race + 98-item add vs two-item Apply (AC-032) |

### Review r5 (2026-10-12) — SPEC gate passed

Prompt `reviews/review-prompt-spec-r5.txt`; result `reviews/sol-review-spec-r5.md`
(gpt-6.1-sol, effort max, exit 0). Verdict: APPROVE. R4-1, R4-2 Resolved; no new findings.
SPEC adversarial review gate: closed on SPEC v5.

## Owner approval of SPEC

2026-10-13: owner answered "Aprovo" to "Aprova a SPEC v5 da Fase 6 como contrato para o planejamento?". SPEC v5 is the approved Ready contract.

## Current understanding

| Area | Status | Notes |
|---|---|---|
| Goals | Clear | daily team use + investor-presentable (r1 q2); metrics r2 q15 |
| Users | Clear | company members as author/participant/viewer/assignee; admins (r1 q4-q6, r2 q11) |
| Requirements | Clear | MEET-01..07 + Markdown export; AI via company API key, 4 providers, admin-only model/effort (r1 q1,q7,q8,q12-q15; r2 q1-q3,q5,q7,q12,q16; r3) |
| Constraints | Clear | sizes r2 q14; cap r1 q11 + r2 q4; rollout r1 q20; keys server-only; Anthropic subscription-login prohibition |
| Edge cases | Clear | concurrency r1 q18; space deletion r1 q19; failures r2 q13 F1-F5; no background processing |
| Business rules | Clear | view/edit/delete r1 q4,q5,q9 + r2 q11; action items r2 q8,q9; versions r1 q8 + r2 q10; transcript r2 q12 |
| Acceptance criteria | Clear | r1 q22 + r2 q15 thresholds |
| Test strategy (code only) | Clear | integration + 2-account E2E, single final Chrome run (AGENTS.md); fictional transcripts r1 q23; local fake AI server r2 q17; real call in owner test |

## Remaining unknowns

- None blocking. Pending: user confirmation of the consolidated understanding (additions/corrections round).
- Non-blocking (plan-level): exact model list per provider; editor library choice; key encryption mechanism.

## Confirmation (2026-10-12)

Consolidated understanding presented in chat (notes/permissions, versions +
conflict, action items, AI via company API key with Claude/OpenAI/Kimi/GLM and
admin-only model/effort + cap 1–200, transcript flow with review + provider
notice, search + .md export, failure behaviors, out-of-scope incl. MEET-08 →
Phase 7 and ChatGPT sign-in, acceptance thresholds, rollout). User answer:
"Confirmo, pode escrever". Recorded as user approval of the current understanding.

## SPEC readiness check

- Goals are specific and measurable: Pass — r1 q2 + r2 q15 (≤60 s draft, ≤1 s search at 1,000 notes, zero cross-company leakage)
- Users and stakeholders are identified: Pass — r1 q4–q6, r2 q11 (members, participants, assignees, admins; owner as stakeholder)
- In-scope and out-of-scope boundaries are explicit: Pass — r1 q1, q21 (+note), r3 (M8 → Phase 7, API keys only)
- Functional requirements are testable: Pass — r1 q3–q15, r2 q1–q16, r3
- Business rules are explicit: Pass — r1 q4,q5,q8,q9,q11; r2 q4,q8–q12
- Constraints are explicit: Pass — r1 q11,q20; r2 q14; policy evidence (subscription login prohibited); AGENTS.md test/rollout rules
- Edge cases and failure modes are covered: Pass — r1 q18,q19; r2 q5,q13 (F1–F5, F6 rejected)
- Acceptance criteria are observable: Pass — r1 q22; r2 q15; SPEC §14
- Every Must-priority functional requirement has at least one acceptance criterion: Pass — SPEC §7/§14 traceability
- Every mandatory business rule, hard constraint, and must-not-happen condition is validated by at least one acceptance criterion: Pass — SPEC §14 traceability
- Test strategy is defined (code projects only): Pass — r1 q22,q23; r2 q17; AGENTS.md
- Open questions are non-blocking or intentionally deferred: Pass — model list, editor library, encryption mechanism are plan-level
- The user confirmed the current understanding after the additions/corrections question: Pass — "Confirmo, pode escrever" (2026-10-12)

Verdict: Ready

## Stop point (2026-10-13)

Owner asked to stop after the PLAN was written (context reset). PLAN v1 written
(`PLAN.md`, T1–T15, blocks A/B/C + final; plan quality gate Ready). NOT yet done:
the mandatory adversarial PLAN review (direct Codex CLI, gpt-6.1-sol, effort max)
before executing T1. No TRACK yet; no code, migration, or database change made.
Repo edits so far: `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md`
(Phase 6 in progress, MEET-08 moved to Phase 7). Nothing committed.

## PLAN adversarial review r1 (2026-10-13) and dispositions (PLAN v2)

Prompt `reviews/review-prompt-plan.txt`; result `reviews/sol-review-plan-r1.md`
(gpt-6.1-sol, reasoning effort max per stderr startup summary, exit 0).
Verdict: REVISION REQUIRED. v1 preserved at `reviews/PLAN-v1-reviewed.md`. All findings checked against the repo (baseline default privileges `20260610183000:2131-2133` confirmed).

| Finding | Disposition |
|---|---|
| P1 High RPC execution boundary | Fixed — standing function privilege rule (owner, search_path, revoke PUBLIC/anon/authenticated, explicit grants; server-only RPCs service_role-only after route authorization); direct-RPC denial tests in T8/T9 |
| P2 High authorization before dispatch | Fixed — ticket issue, admission, and replay recheck membership + editor rights; T12 test: removal/demotion before start → zero dispatch, usage unchanged |
| P3 High settings/admission race | Fixed — atomic settings+key save RPC (T8); one locked admission transaction validating revision, reserving, snapshotting, returning key (T9); race test |
| P4 Med replay vs settings guard | Fixed — existing operation resolved before the settings check; replay-after-settings-change test (T12) |
| P5 Med checks before prerequisites | Fixed — T9 keeps DB-observable checks; dispatch-dependent AC-012/016/026/029/034 evidence moved to T12; killable child process for crash; fake server split to T16 |
| P6 Med AC-017/AC-023 evidence | Fixed — Realtime canary in T8, bundle/log scan in T14, full cross-company matrix in T12 |
| P7 Med AC-009 timezone display | Fixed — T7 E2E in America/Los_Angeles and Asia/Tokyo contexts |
| P8 Med ticket secret | Fixed — `MEETING_NOTES_TICKET_SECRET` required, no fallback, `_PREVIOUS` for rotation; local in T9, online in T15; restart check in T12 |
| P9 Med late backfill | Fixed — row counts read in T8; T15 divergence → stop/replan/local test/review before authorization |
| P10 Med deployment not a completion condition | Fixed — T15 Done when requires deployed smoke, grants/cron readback, successful cron run |
| P11 Low tasks too broad | Fixed — T1 split into T1 (schema/read) + T17 (mutations); T11 split into T16 (fake server) + T11 (adapters); blocks A(5) B(4) C(4) D(2) |

### PLAN review r2 (2026-10-13) and dispositions (PLAN v3)

Prompt `reviews/review-prompt-plan-r2.txt`; result `reviews/sol-review-plan-r2.md`
(gpt-6.1-sol, effort max, exit 0). Verdict: REVISION REQUIRED. Prior: P1–P4, P6–P11 Resolved; P5 Partially. v2 preserved at `reviews/PLAN-v2-reviewed.md`.

| Finding | Disposition |
|---|---|
| P5 partial crash timing | Fixed — after the kill, dispatch time set 11 min in the past locally, then the stale job runs; no real wait (T12) |
| R2-1 Med no release for never-dispatched | Fixed — idempotent settlement releases reservations that never sent (preflight refusal, cancel before send, pre-dispatch error) (T9/T12); route test zero requests + usage unchanged |
| R2-2 Med stale admin authorization on settings save | Fixed — save RPC takes server-derived actor id and re-verifies admin inside the transaction with the actor row locked; removal/demotion race test (T8) |
| R2-3 Med new admission ignores source binding | Fixed — note row locked, revision + transcript identity must equal the ticket's, transcript captured in the same snapshot; replacement-before-admission test (T9/T12) |
| R2-4 Med key outlives ticket | Fixed — server-generated key embedded in the signed ticket, expires with it, checked before lookup; fresh-ticket/old-key and client-key-mismatch tests (T9/T12) |
| R2-5 Med AC-021 mutation evidence | Fixed — retained-former-participant save and rejoin edit in T17; assignee completion loss/restore in T2; Covers + coverage table updated |
| R2-6 Low service_role on user RPCs (follow-up class) | Fixed anyway — revoke includes service_role; catalog EXECUTE matrix checked |

### PLAN review r3 (2026-10-13) and dispositions (PLAN v4)

Prompt `reviews/review-prompt-plan-r3.txt`; result `reviews/sol-review-plan-r3.md`
(gpt-6.1-sol, effort max, exit 0). Verdict: REVISION REQUIRED. P5, R2-1..R2-6 Resolved. v3 preserved at `reviews/PLAN-v3-reviewed.md`.

| Finding | Disposition |
|---|---|
| R3-1 Med lock modes allow a three-way deadlock | Fixed — standing lock order rule (actor users row FOR SHARE → AI settings row → note row FOR UPDATE as the single per-note lock → items); T8 save uses FOR SHARE then re-verifies; tests: save vs removal/role change, and save + admission + Apply concurrently without deadlock (T8/T2/T12) |

### PLAN review r4 (2026-10-13) — PLAN gate passed

Prompt `reviews/review-prompt-plan-r4.txt`; result `reviews/sol-review-plan-r4.md`
(gpt-6.1-sol, effort max, exit 0). Verdict: APPROVE. R3-1 Resolved; no new findings.
PLAN adversarial review gate: closed on PLAN v4. Next: execute T1.
