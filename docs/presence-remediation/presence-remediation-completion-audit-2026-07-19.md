# Presence remediation completion audit — 2026-07-19

Status: Pending user confirmation

## Authority and scope

The user-supplied `docs/presence-remediation/presence-safety-remediation-handoff.md` is tracked but empty. This audit therefore uses the last complete normative handoff, recovered from commit `c4fa624` at `docs/presence-safety-remediation-handoff-2026-07-09.md`, plus revision 3 of `phase-3.5-stabilization-plan.md`.

This is a completion audit, not a deployment claim. It distinguishes four states:

- **Local proven** — implementation exists and has automated evidence on the disposable local stack.
- **Local partial** — useful evidence exists, but the exact named runtime/soak gate is not fully reproduced.
- **External pending** — requires a clean user-owned commit, protected credentials, a named staging/production target, elapsed production time, or explicit user approval.
- **Blocked by predecessor** — must not execute before an earlier gate completes.

No staging or production state was changed during this remediation run.

## Phase 0–11 audit

| Phase | Local state | Evidence | Exact remaining gate |
|---|---|---|---|
| 0 — contract freeze | Local proven; current linked preflight exists | Phase 0 catalog/inventory/mapping artifacts; pinned Supabase CLI 2.109.1; repeated clean local resets; read-only linked history/catalog/Cron preflight on 2026-07-19 | Name/approve the final staging target, apply the reviewed release candidate, then re-read history, catalog, Realtime/Auth settings, advisors, and maintenance boundaries. The currently linked project is healthy but stops at Phase 4 and is not accepted as the candidate readback. |
| 1 — private-space closure | Local proven | Real-Postgres RLS negatives, private-entry tests, zero Knock browser DML/SELECT, restrictive FKs | Apply/read back on the final named target and rerun advisors. Historical Phase 1 staging follow-up cannot substitute for final-schema readback. |
| 2 — per-tab leases | Local proven | Session lease, expiry, rotation, fence, two-tab, cleanup/Cron catalog tests | Final staging readback and runtime multi-tab/multi-auth-session acceptance. |
| 3 — atomic transition | Local proven | Atomic/capacity/idempotency/logout/maintenance races; terminal runtime-control gate; responder lock-set retry; exact 14-case manifest; final 50× CI and 200× local soak | External: repeat 200× on the named staging target and capture maintenance/runtime acceptance. |
| 3.5 — bootstrap stabilization | Local proven with named external exceptions | 90 focused route/observability tests; final local admin/member/external browser matrix; exact bootstrap budgets | Historical session/log actions, exact Auth 429 provenance, Google OAuth/expired-token browser drills, current staging catalog readback, and protected staging identities. Detailed mapping below. |
| 4 — Knock server contract | Local proven | Server-only RPCs/routes, 10-second/five-per-minute limits, polling, Broadcast acceleration, expiry/retention Cron, bidirectional browser smoke | Final staging catalog/setting readback and two-user runtime acceptance against the release candidate. |
| 5 — movement/client unification | Local proven | One coordinator, movement source gate, scoped keys, once-per-session placement, manual-over-auto/version fencing, 426 compatibility | Staging adoption observation for compatibility client A, then atomic client B cutover; pre-compatibility bundles must be observed failing closed. |
| 6 — status/cache/Realtime | Local proven; target residual explicit | Scoped authoritative snapshot, private company topic, exact Realtime policies, real synthetic Broadcast+Presence authorization transaction, reconciliation/degraded state | On each target, disable/read back Realtime **Allow public access**, prove own-company join and anonymous/other-company denial, and run the held-open-socket removal/fence probe. Private-channel authorization is cached until a reauthorization boundary; capture token TTL/refresh behavior, measure the bound, and obtain named security-owner acceptance. Apply/read back the final audit migration/publication/Cron state. |
| 7 — account/logout/membership | Local proven | Atomic membership writers/removal, account/company cache fences, auth-session logout, fail-safe local teardown, auth-generation-fenced mutations, audio/session ownership | External: staging multi-auth-session/device and membership-overlap drills. |
| 8 — safety test system | Local proven | Explicit unit/DB/E2E manifests; zero critical skips/TODOs; disposable PR stack/identities; complete Presence path triggers; exact case-ID-complete 50× CI and 200× soak lane | Run every lane from the user-reviewed clean commit, then repeat the protected staging lane on the named candidate. |
| 9 — replacement skill draft | Local structure proven | Draft skill/references/replacements, 28 scenarios, repository-owned validator/evaluator; validator green | External pending: user-owned clean candidate commit, approved length-delimited runner/provider environment, two candidate model IDs, distinct-family judge, exactly three fresh trials/scenario, then immutable hash-bound report commit. |
| 10 — rollout/cutover | Local machinery proven only | Runtime controls, immutable audit/fingerprint/coverage objects, locked assertions, disable/removal audits, health-check SQL, operator runbook | External pending: named targets and authority; Stages A–G; staging rehearsal; production approval; two distinct immutable 168-hour windows; live locks/readbacks/artifacts; runtime acceptance; user confirmation. |
| 11 — canonical skill promotion | Blocked by predecessor | Promotion inputs are drafted but canonical copies were intentionally not changed | Only after Phase 10 user confirmation: canonical `.agents` tree, three relative symlinks, final guard/reviewer/guide, clean promoted eval, report commit, user confirmation. |

## Phase 3.5 work-package audit

| Requirement | State | Evidence / residual |
|---|---|---|
| WP0.1 revoke historically exposed admin session | External pending | Requires Supabase administrative action/confirmation by the user or authorized operator. |
| WP0.2 scrub/delete contaminated historical dev log | External pending | The current sanitized log audit is clean; deletion of historical user-owned material was not inferred or performed. |
| WP0.3 identify exact rate-limited Auth endpoint/code/refresh path | External pending | Runtime report proves the symptom only. Code correctly keys on HTTP 429, but exact `/user` vs `/token`, Auth code, and refresh behavior require sanitized reproduction or Auth platform logs. |
| WP0.4 staging history/catalog readback | Local partial | A fresh read-only linked preflight on 2026-07-19 shows PostgreSQL 15.8, the maintenance role boundary intact, three expected Presence jobs active as `postgres`, `users`/`spaces` published, and RLS on `realtime.messages`. History stops at `20260716175515`; Phase 6, Phase 7, and the observability migration are absent, so the seven observed wrappers correctly read back as zero. The project has a generic name and is not accepted as a named/approved release candidate. |
| WP0.5 signing-key type | Proven | Legacy HS256/empty JWKS recorded; page proxy keeps the page-only `getUser()` path while API routes self-validate. |
| WP0.6 distinct member credentials | Local proven / external pending | Disposable local admin/member/external identities are green; protected staging/CI credentials are absent. |
| WP1–WP6 code/test packages | Local proven | Credential guard, page-only proxy, in-flight bootstrap dedupe, auth-generation fence, safe error contract, transient retention/401 teardown, structured Auth metrics, and tests are green. |
| WP7.1 type-check + full tests | Local proven | Final commands are recorded below. |
| WP7.2 cold admin Google OAuth | Local partial | Cold admin password login is green with exact budgets; the specifically named staging Google OAuth drill remains pending. |
| WP7.3 reload | Local proven | One fresh sync, authoritative snapshot, real private subscription, and reconciliation are covered. |
| WP7.4–6 member/simultaneous/account switch | Local proven | Shared local three-identity run covers member, simultaneous tenant isolation, and admin→logout→member in one browser. |
| WP7.7 devtools 401/500 drills | Local partial | Deterministic route/context tests prove teardown/retention/UI states; the exact staging browser fault-injection capture is pending. |
| WP7.8 expired JWT + concurrent API calls | Local partial | Proxy/route/auth tests cover expiry and refresh boundaries; the named browser drill with correlated live events is pending. |
| WP7.9 secret log audit | Local proven | Sanitized NDJSON has zero token/JWT/bearer/service-role/email matches. |
| WP7.10 staging catalog review | External pending | Must use final target and final migration set. |
| WP7.11 shared product smoke | Local proven / staging pending | Local admin/member/external movement and bidirectional Knock pass; repeat on the candidate staging release. |
| WP7.12 named-environment migration history/catalog | Local proven / external pending | Local reset/readback is green; final staging/production application and readback are intentionally absent. |
| WP7.13 status wording | Proven | All evidence remains `Status: Pending user confirmation`. |

## Final-definition audit

The following final-definition clauses are locally satisfied:

- target source-of-truth separation is implemented;
- security/correctness invariants have unit, route, real-Postgres, and browser coverage at their applicable local layers;
- real Postgres proves RLS, atomic rollback, observed lock/race invariants, and the complete 14-case normative concurrency repetition gate at 50× and 200×;
- the pinned committed migration chain repeatedly bootstraps a disposable local Supabase stack;
- local browser evidence covers reload, account switch, three identities, movement, private Realtime isolation, and bidirectional Knock;
- critical Presence manifests contain no TODO/conditional skip;
- structured redacted `presence-observability-v1` events and read-only `scripts/presence-health-check.sql` now exist;
- local movement guard, draft skill validation, type-check, build, lint error gate, and diff integrity pass.

The exact concurrency/Thermos audit's local blockers are closed. Cases 52/59, the missing Knock/rate-limit/Logout races, observed lock proofs, the manifest-complete 50×/200× lane, fail-safe sign-out, CompanyContext generation fencing, and disposable PR CI boundaries are implemented, reviewed, and green. Local completion here means implementation/evidence readiness only; it is not a deployment or cutover claim.

After those local blockers close, the following final-definition clauses remain inherently external or time-based:

1. current staging runtime evidence and final-schema readback;
2. production migration application/readback;
3. Phase 9 semantic evaluation from immutable clean commits;
4. compatibility-client adoption and atomic cutover under approved maintenance;
5. first immutable 168-hour zero-write/zero-receipt window plus locked live assertion;
6. breaking availability/direct-UPDATE migration and regression rerun;
7. disabled 426 tombstone production release;
8. second independent immutable 168-hour zero-receipt window plus final locked assertion;
9. audit retirement and verified schema documentation;
10. Phase 11 canonical skill promotion/evaluation;
11. explicit user acceptance.

The absence of an external alert provider remains a user-gated observability residual. The SQL health artifact and structured logs are implemented; rollout must retain the corresponding queries/results and must not interpret a missing log query as zero. Raw UUID-bearing results belong in the approved access-controlled evidence repository outside this application worktree, with ACL and retention readbacks. The target-specific cached Realtime authorization interval likewise remains an explicit rollout acceptance gate rather than an immediate-revocation claim.

## Local gaps closed during this audit

- Added the missing sole Presence event formatter with a strict runtime allowlist and no raw error/credential fields.
- Wired transition/logout, lease register/heartbeat/disconnect, snapshot, and Knock request/respond/status/pending server boundaries to one-line structured events.
- Added the missing read-only health-check artifact with database invariants plus explicit structured-log-only counters.
- Added a real-Postgres execution regression for the health-check artifact.
- Replaced permission-revoke rollback simulation with same-connection `pg_temp` failure injection for presence-log insertion.
- Added same-connection `pg_temp` failure injection for Knock consumption and proved placement/log/session/idempotency/grant rollback.
- Added a configurable same-user distinct-transition concurrency soak; 50 and 200 pair runs pass.
- Added the target Realtime **Allow public access = disabled** readback/denial gate to the Phase 10 runbook.
- Added the held-open-socket removal/fence probe and explicit cached-authorization acceptance bound; an open Realtime connection is not assumed to re-evaluate RLS immediately.
- Kept UUID-bearing rollout artifacts out of the application worktree and required an external evidence-store ACL/retention readback.
- Added transaction-authoritative observed RPCs for location/session/Knock and negative proofs that missing or cross-tenant Knock IDs expose no internal metadata.
- Kept the clock-sensitive Knock status core truthfully `VOLATILE`; the observed wrapper authorizes before locking the own-request row and re-reads status under that lock so state and revisions stay coherent.
- Expanded the health zero-gates to runtime-control cardinality, per-source retention and cross-company canonical placement/lease/Knock authority, including open-log-consistent corruption in legacy mode.
- Closed cases 52/59, every missing normative race, the immutable gate/revision-trigger audit surface, Phase 7 atomic writer compatibility, fail-safe logout/account fencing, and disposable PR CI boundaries; mandatory Presence and Supabase/RLS re-reviews report no findings.
- Reapplied the complete migration history from a clean local database and passed the final DB lane (14 files/115 tests), browser lane (3/3 in 2.1m), Presence lane (60/536), full lane (98/1,017), 14-case 50-iteration CI gate, 14-case 200-iteration soak, type-check, build, movement/skill gates, lint with zero errors, and diff integrity.

## External execution queue

Execute in this order; later items must not bypass earlier evidence:

1. User reviews and creates the clean candidate commit (no agent commit was made).
2. Run Phase 9 draft semantic evaluation with approved runner/models/judge and commit the immutable report separately.
3. Provision protected staging admin/member/external identities; name/approve the staging project; capture history, Auth, Realtime settings, catalog, advisors, and pre-rollout health/log evidence.
4. Execute runbook Stages A and B in staging, including all runtime acceptance scenarios and every concurrency family at 200 iterations.
5. Obtain explicit production authority; execute Stages C–E with exact release/rollback boundaries.
6. Accumulate and pass the first complete 168-hour gate; apply the breaking migration under its live locks.
7. Retain the disabled 426 tombstone for a complete production release, then accumulate and pass the second independent 168-hour gate before deletion.
8. Retire temporary audit objects only after final drain/readback; update verified schema documentation.
9. Obtain Phase 10 user confirmation, promote Phase 11 canonical skill/guard/reviewer/guide, run the promoted semantic eval, and request final confirmation.

## Platform watch item (not a Presence gate)

Current Supabase guidance deprecates legacy `anon`/`service_role` API keys by the end of 2026 in favor of publishable/secret keys. The project still uses legacy environment variable names. Plan that platform migration separately; do not mix it into the Presence cutover or weaken current role/RLS tests.

Status: Pending user confirmation
