# Phase 03 Remediation Tracker

## 2026-07-23 — Screen-share lease review remediation

- Completed: rewrote the local-only screen-share lease migration to use scalar/narrow reads, explicit lookup flags, claim-time placement/access fences, deterministic Presence-compatible locking, stale-owner release, and strict foreign-release denial. Added disposable real-Postgres lease and media-topic RLS regressions.
- Evidence: local reset replayed `20260723104902`; focused lease suite passed (4 tests), required Realtime catalog suite passed (3 tests), Presence gate and TypeScript check passed.
- Database state: migration is written in the repository and applied/read back only on disposable local loopback Supabase (`127.0.0.1:54322`). No online database was changed.
- Deployment state: no application deployment occurred.
- Decision: the user explicitly authorized destructive reset/rebuild of local Supabase only; no linked, staging, or production commands were run.
- Reviewer findings resolved: removed wildcard row expansion under narrow grants; isolated `FOUND` state; revalidated stored owners and persisted revision fences; corrected release idempotency; added real behavior and RLS evidence.
- Environment note: Windows local Supabase works at loopback after Docker is available. Full-stack health can be affected by excluded ports; this remediation used only the local database contract.
- Current blocker / next action: the full existing Presence DB suite has one reproducible, unrelated failure in `presence-concurrency-contract.test.ts` (`healthy: true` where its current-hour assertion expects `false`). The focused remediation evidence is green; investigate that pre-existing concurrency-contract test separately before treating the complete legacy DB suite as green.

## 2026-07-23 — Release absence re-review correction

- Risk corrected: `screen_share_context_observed` encoded an absent lease as JSONB `null`, while `release_screen_share_observed` checked SQL `NULL`; a valid no-lease release could therefore fall through to `LEASE_NOT_OWNER`.
- Correction: the helper now emits an explicit lease object with `found: false` when absent, and release branches on that flag. Stored foreign ownership remains `LEASE_NOT_OWNER`; repeated exact-owner release remains `RELEASED` with `alreadyReleased: true`.
- Evidence: Docker was reachable; local Supabase target was confirmed as `127.0.0.1:54322`; authorized `npx supabase db reset --local --no-seed` replayed `20260723104902`; local push/history/catalog readback passed. Real Postgres lease tests passed 5/5 (including strict no-lease, foreign-owner, and exact-owner repeated-release assertions); exact Phase 6 Realtime catalog tests passed 3/3; Presence gate, focused lint, TypeScript check, and diff check passed.
- Database/deployment state: correction is written and committed locally, and applied/read back only on disposable local loopback Supabase. No linked, staging, or production database action and no deployment occurred.
- Local Supabase security advisor completed with no errors. Its five mutable-search-path warnings name unrelated existing functions (`increment_unread_counts`, `is_platform_admin`, `set_participants_fingerprint`, `update_neighborhoods_updated_at`, and `update_space_agendas_updated_at`); this scoped release fix did not change them.

## 2026-07-23 — Screen-share API contract compatibility remediation

- Review risks fixed: claim, release, and active now reject a verified identity without a company scope as terminal `MEMBERSHIP_SCOPE_INVALID` (403) before any RPC. A stale membership-switch response cannot issue a privileged call.
- RPC compatibility fixed: a shared strict classifier maps PostgREST missing/signature codes (`PGRST202`, `PGRST203`) and PostgreSQL missing-function/grant codes (`42883`, `42501`) to the same terminal sanitized `DATABASE_CONTRACT_INCOMPATIBLE` (426) response. Raw provider messages, hints, details, and codes remain absent; unknown failures remain generic `INTERNAL_ERROR`.
- Evidence: focused mocked route suite passed 29/29, including table-driven coverage across all routes; TypeScript, focused ESLint, Presence movement gate, and diff check passed.
- Database/deployment state: application code and tests were committed locally only. No schema, data, function, grant, RLS, online target, or deployment was changed or queried.
- Next action: after merge, run the primary-checkout full test and build gates with its ignored local environment available.

## 2026-07-23 — Final screen-share Presence Safety correction

- Risk corrected: strict observed-RPC decode and invariant-shape failures in claim, release, and active now map to the same terminal sanitized `DATABASE_CONTRACT_INCOMPATIBLE` (426) contract as missing RPCs, incompatible signatures, and grant failures. Unknown provider/transport failures remain sanitized generic `INTERNAL_ERROR` (500); no response exposes raw RPC values, codes, hints, or details.
- Race corrected: the verified Presence identity now carries the repository's canonical `displayName`. Claim uses that verified snapshot only after `CLAIMED`; it no longer performs a service-role presenter lookup before the observed RPC. The 03-08 RPC remains the sole authority for membership, company, space, lease, and session at commit.
- Evidence: 42 focused route and verified-session tests passed, including malformed/unknown/mismatched RPC result coverage across routes, pre-RPC presenter-lookup absence, and terminal membership/compatibility contracts. TypeScript, focused ESLint, Presence gate, and diff check passed.
- Database/deployment state: application code and tests were committed locally only. No migration, schema, data, function, grant, RLS, online target, or deployment was changed or queried.
- Next action: after merge, run the primary-checkout full test and build gates with its ignored local environment available.

## 2026-07-23 — Adversarial screen-share application-boundary correction

- Findings corrected: the verified identity now retains the original validated Auth subject; claim/release/active pass it directly to observed RPCs without a second route `auth.getUser()` call. Claim validates and trims the stored presenter name before any mutation, returning sanitized `PRESENTER_PROFILE_INVALID` (409) with zero RPCs when it is missing/invalid.
- Active correction: presenter lookup occurs only after the first authorized active read and is followed by exactly one final authorized active read. Final typed denial/null wins; changed presenter/share/space fails closed with bounded sanitized `SERVICE_UNAVAILABLE` (503); final lease expiry is canonical. Lookup infrastructure errors remain sanitized 500, and missing/invalid profile returns its terminal typed contract only after final authorization.
- Contract correction: claim/release/active use their migration-defined strict error domains. Impossible cross-operation codes decode to `DATABASE_CONTRACT_INCOMPATIBLE` (426); observed `AUTH_INVALID` after verified app-profile resolution maps to `MEMBERSHIP_SCOPE_INVALID` (403). `RETRY_LOCK_SET` remains a typed 503 with no automatic route retry; Wave 5 decides real-Postgres simultaneous-claim behavior.
- Evidence: 55 focused mocked route and verified-session tests plus TypeScript passed. These prove application branching and ordering only, not database concurrency/RLS.
- Database/deployment state: application code and documentation changed locally only. No migration, local database, online target, schema, data, RLS, grant, environment, or deployment action occurred.
- Wave 5 deferral: 03-02 owns two-connection real-Postgres races against membership/company removal, auth-session revocation, presenter departure, and private ACL/access-revision change; mocked evidence does not close that gate.
- Next action: orchestrator adds primary-checkout full-test and build evidence after merge.

## 2026-07-23 — Atomic presenter-name and bounded lock-set correction

- Sol findings resolved: the previous application-only correction was insufficient because it treated the verified identity `displayName` as authoritative after an unlocked read and used active-route service-role profile enrichment plus a second RPC. A new imperative local migration makes observed claim/active RPC results the sole presenter-name authority.
- Database correction: claim builds the safe ordered user lock set, canonicalizes the current name with the exact ECMAScript trim whitespace set, rejects empty/over-100 names as sanitized `PRESENTER_PROFILE_INVALID` before `screen_share_context_observed` can mutate a lease, and returns `presenterName` on success. Active returns the locked owner's canonical name in its one observed result. No public `users` display-name grant or lease-table/RLS broadening was added.
- Retry correction: claim/release/active share a strict helper that opens at most one fresh RPC transaction only for exact `{ok:false,code:'RETRY_LOCK_SET'}`. A second structural result remains sanitized `SERVICE_UNAVAILABLE` (503); malformed/extra payloads and provider errors are not retried. The 03-02 plan now distinguishes raw structural escapes from operation-canonical convergence.
- Membership semantics corrected: `companyId:null` is static pre-RPC `MEMBERSHIP_SCOPE_INVALID` (403) with zero RPC; a company/session change after verified snapshot may return locked `SESSION_INVALID` (409). Removed the unsupported claim that every membership race has no privileged call or maps to 403.
- Local evidence: generated `20260723224547_screen_share_atomic_presenter_contract.sql` with the Supabase CLI, reset/replayed disposable local loopback Supabase, read back migration/catalog grants/owner/search_path, and passed focused HTTP (28), real Postgres (9), TypeScript, focused ESLint, and Presence gate checks. The first reset exposed a missing transient owner-membership grant; the migration was corrected and the authorized local reset then passed.
- Database/deployment state: migration written locally and applied/read back only on disposable local Supabase. No online database was queried or changed. No deployment occurred; do not deploy application code until both screen-share migrations are applied to the intended target.
- Remaining Wave 5 proof: retain/expand repeated barrier evidence for raw `RETRY_LOCK_SET` convergence versus bounded unavailable under sustained structural churn; mocked routes do not prove that database concurrency claim.

## 2026-07-23 — Screen-share route coverage restoration

- Coverage correction: the first atomic-presenter test rewrite had reduced the accepted mocked HTTP suite to 28 tests. Restored the full pre-rewrite route foundation from `69695e1` (the last route-test revision after base `d0491ee`, which predates this test file) and adapted each legacy assertion to the atomic RPC presenter-name and bounded-retry contract instead of retaining obsolete profile lookup/second-read mechanics.
- Matrix preserved or strengthened: request/auth fences, exact RPC arguments, release ownership outcomes, null/active public responses, result domains, malformed/unknown/impossible results, provider compatibility/sanitization, static and locked membership boundaries, and stale-response suppression remain covered. New rows cover missing/invalid/extra RPC `presenterName`, sole locked name authority/no `users` query, exact-one `RETRY_LOCK_SET` retry, exhaustion, and non-retry malformed/provider results.
- Intentional renames/consolidations: the former tests named `uses the verified display-name snapshot`, `returns an active share only as canonical public data`, profile pre-RPC rejection, final active reauthorization, and held enrichment race handling now assert their stronger replacements: locked claim/active RPC name authority, one active RPC with zero `users` query, and terminal locked SQL profile/session/membership outcomes. No scenario was removed; assertions tied only to the deliberately deleted lookup/second-read mechanism were converted to assertions that the mechanism is absent.
- Evidence: final route suite passed 75 tests; route plus verified-session focused command passed 76 tests, up from the prior 55 focused tests. The affected Presence API selection passed 153 tests. TypeScript, focused ESLint, Presence gate, and diff check passed. Whole-repository lint remains blocked only by pre-existing generated `.claude/gsd-core` files referencing unavailable ESLint rules; the changed route test passes focused lint.
- Database/deployment state: no SQL changed, so no reset was run. No online database was queried or changed; no deployment occurred.

## 2026-07-23 — Final Presence/Sol evidence correction

- Corrected Unicode lockstep: `screenSharePresenterNameSchema` now trims, rejects empty names, and counts `Array.from(name)` Unicode code points, matching PostgreSQL `char_length`. Direct schema and HTTP coverage includes 51, 100, and 101 astral emoji plus whitespace and ASCII boundaries. Local real Postgres proves a 100-emoji claim returns its canonical name and a 101-emoji claim returns `PRESENTER_PROFILE_INVALID` without a live lease.
- Corrected route invariants: mismatched `shareId` and `spaceId` fixtures now include `presenterName`, first pass their exported operation schemas, then reach the explicit route invariants and return `DATABASE_CONTRACT_INCOMPATIBLE` (426). Existing coverage was retained.
- Corrected lock evidence: held-rename tests use dedicated RPC backend PIDs and bounded `pg_stat_activity`/`pg_locks` readiness polling. Before commit, the probe proves the RPC backend waits on the locker transaction while that locker holds the intended `public.users` write lock; fixed 25 ms delays are removed.
- Corrected 03-02 contract language: raw first attempts may return `RETRY_LOCK_SET`; with stable ownership one fresh bounded retry converges to `PRESENTER_BUSY`; repeated structural churn may return bounded `SERVICE_UNAVAILABLE`; exactly one lease winner and no deadlock remain invariant. Repeated two-claim barrier/fresh-transaction convergence evidence remains Wave 5 work and is not claimed by current tests.
- Documentation correction: migration `20260723224547_screen_share_atomic_presenter_contract.sql` was written and applied/read back only on disposable local Supabase, so local migration history changed. No online target was queried or changed and no deployment occurred. Application rollout must wait for both screen-share migrations on the target. Claim/active names come from one locked observed RPC; no service-role route lookup or final double-RPC enrichment remains. The bounded retry utility is now documented.
- Membership fact retained: static no-company verified identity is 403 with no RPC; a post-snapshot locked invalidation is `SESSION_INVALID` (409).
- Evidence: focused route plus verified-session tests passed 81/81, affected Presence API tests passed 158/158, the local real-Postgres lease suite passed 9/9, and TypeScript, focused ESLint, Presence gate, and diff check passed.
- Database/deployment state: code, tests, plans, summary, and tracker changed locally only. No SQL/migration edit, online database action, environment change, package change, or deployment occurred.

## 2026-07-23 — Wave 5 dependency correction

- Final Sol review found the 03-02 preconditions still named only the 03-08 lease/media migration even though its atomic presenter-name and lock-order tests require `20260723224547_screen_share_atomic_presenter_contract.sql` as well.
- Corrected 03-02 to depend on 03-09, require/read both screen-share migrations, and verify both history entries exactly once. Both migrations are immutable inputs; 03-02 still creates no migration or production symbol.
- Database/deployment state: documentation changed locally only. Local migration state was already read back; no SQL, online database, environment, or deployment action occurred.

## 2026-07-24 — Wave 2 closure evidence

- Primary gates passed on the merged checkout: Next.js production build succeeded and the full Vitest suite passed 103 files / 1,133 tests.
- Final review state: Presence Safety, Supabase/RLS, and Sol adversarial reviews returned no material findings after the Unicode and Wave 5 dependency corrections.
- Capability gates: schema drift and UI safety did not block. Codebase drift reported a non-blocking advisory for 1,654 structural elements without a current mapping baseline; its directive was `warn` with no mapper spawn.
- Database/deployment state: both screen-share migrations remain applied/read back only on disposable local Supabase. No online database was queried or changed and no application deployment occurred. Any rollout must apply/read back both migrations on the explicitly authorized target before application deployment.

## 2026-07-24 — Wave 3 media lifecycle closure

- Completed: corrected the strict broadcast handshake fixture and extended signaling envelopes with source Presence-session/connection identity plus exact targeted destination identity. Pending ICE is keyed to the complete remote instance, stale candidates cannot drain into a replacement peer, and null-share video cannot emit a remote display event.
- Completed: added bounded per-peer signaling queues, canonical active-share reconciliation, deterministic scope teardown, mute-state cleanup, and application-user-only manager ownership without Supabase Auth UUID fallback.
- Scope decision: Plan 03-10 retains its planned private browser Broadcast signaling and existing P2P mesh. Trusted relay, connection registries, negotiation registries, and a third migration are not part of this plan.
- Evidence: focused Plan 03-10 suites passed 4 files / 99 tests; TypeScript passed; the primary full suite passed 104 files / 1,147 tests; the Next.js production build passed.
- Database/deployment state: no SQL, migration, RLS, local or online database action occurred during closure. No deployment, push, or pull request occurred.
- Next action: Wave 4 / Plan 03-01 may consume the completed manager and signaling foundation. Real browser, permission, TURN, and multi-user delivery remain assigned to later Phase 3 UAT.

## 2026-07-24 — Wave 4 canonical screen-share tracer closure

- Completed: Plan 03-01 added explicit current-occupant display capture, canonical claim/presenter matching, publication through the existing P2P `WebRTCManager`, and a React-owned integrated stage that attaches only the exact live canonical display stream.
- Scope retained: the tracer reuses `AudioProvider`, the completed private browser signaling path, and the existing peer registry. No relay, connection registry, negotiation registry, migration, later-wave lifecycle provider, or final Wave 8 presentation polish was introduced.
- Regression correction: the full suite exposed one legacy floor-plan test mock without the new `useAudio` export. The mock-only correction was authorized by the user, passed its focused 9-test file, and was committed separately as `91161b0`.
- Evidence: Plan 03-01 focused coverage passed 19 tests; TypeScript, focused ESLint, Presence gate, and diff checks passed. The post-wave Next.js production build passed, and the full Vitest suite passed 105 files / 1,153 tests.
- Capability gates: schema drift and UI safety passed. Codebase drift emitted a non-blocking baseline advisory with `directive: warn` and `spawn_mapper: false`; no mapper or additional work was started.
- Database state: no SQL, migration, RLS, local database, online target, schema, data, grant, or database read occurred in Wave 4.
- Deployment state: all commits remain local on `feature/sharing-screen`; no deployment, push, or pull request occurred.
- Decision: the user chose to retain commit `4e6b142`, which repaired the malformed local GSD config and recorded an intermediate state update on the same feature branch.
- Next action: stop before Wave 5. Plan 03-02 real local Postgres/RLS proof and Plan 03-03 signaling hardening require a separate explicit Wave 5 authorization.

## 2026-07-24 — Wave 5 glare ICE blocker correction

- Presence Safety blocker corrected: the impolite peer no longer drops every candidate while `ignoreOffer` is true. Generation-identifiable ICE is quarantined until the winning answer is accepted; candidates whose `usernameFragment` does not match that answer's `a=ice-ufrag` are discarded, while the winning answer candidate is delivered.
- Deterministic evidence: RED commit `eb721a7` failed exactly 1/9 because valid answer ICE arriving before the answer was lost; GREEN commit `3348f48` passed 9/9 while preserving the existing ignored-offer isolation case.
- Regression evidence: Wave 5 transport passed 21/21; critical Presence passed 61 files / 558 tests; TypeScript, focused ESLint, Presence movement gate, and Presence skill validation passed.
- Known repository gate: whole-repository lint remains blocked by the same 3,230 pre-existing vendored rule-resolution and unrelated legacy findings; the two touched files pass focused ESLint.
- Database state: no schema, migration, data, function, grant, RLS, local database, or online database was queried or changed.
- Deployment state: commits remain local on `feature/sharing-screen`; no deployment, push, or pull request occurred.
- Next action: the orchestrator must run the formal read-only Presence re-review. No formal reviewer was run by this executor.

## 2026-07-24 — Wave 5 optional-ufrag interoperability correction

- Remaining Presence Safety risk corrected: `usernameFragment` omitted/null no longer causes unconditional ICE loss during glare. Such candidates stay quarantined in the existing bounded, exact-instance queue until the accepted answer is installed.
- Generation safety: explicit or raw ufrags are normalized and matched against the answer SDP; known mismatches and malformed generation data are discarded. Unclassified candidates are browser-validated after the answer, and only an `OperationError` explicitly identifying ufrag/username-fragment/ICE-generation mismatch is suppressed. Unrelated ICE errors propagate.
- Deterministic evidence: RED `5184a69` failed 3/13 for omitted/null loss and error classification; GREEN `3eaf134` passed 13/13. Raw ufrag fallback, malformed explicit/raw metadata, ignored-generation isolation, unrelated-error propagation, peer replacement, bounded queues, peer cleanup, and manager cleanup remain covered.
- Regression evidence: Wave 5 transport passed 25/25; critical Presence passed 61 files / 558 tests; TypeScript, focused ESLint, Presence movement gate, and Presence skill validation passed.
- Database/deployment state: no local or online database action and no deployment, push, or pull request occurred.
- Next action: the orchestrator owns the formal read-only Presence re-review; this executor did not run it.

## 2026-07-24 — Wave 5 full ICE queue drain correction

- Final Presence Safety blocker corrected: one rejected quarantined candidate can no longer abort the remainder of the accepted-answer ICE queue.
- Exact-once semantics: the exact instance queue is retired before iteration and never replayed. Every eligible candidate is attempted in queue order; successful additions remain applied. A single failure is rethrown unchanged after drain, while multiple failures become an ordered `AggregateError`.
- Removed brittle behavior: browser-specific error-message matching and silent suppression were deleted. Known generation mismatches are still filtered before browser mutation; unrelated candidate errors remain visible after all candidates are attempted.
- Deterministic evidence: RED `a52a1d3` failed 2/15 because later valid ICE was skipped and multiple failures were not aggregated; GREEN `3728dee` passed 15/15, including no replay after error and stable signaling after successful later ICE.
- Regression evidence: Wave 5 transport passed 27/27; critical Presence passed 61 files / 558 tests; TypeScript, focused ESLint, Presence movement gate, and Presence skill validation passed.
- Database/deployment state: no local or online database action and no deployment, push, or pull request occurred.
- Next action: formal read-only Presence re-review remains orchestrator-owned.

## 2026-07-25 — Plan 03-04 mixed-version claim compensation

- Formal Presence Safety finding: when the application requiring atomic `presenterName` runs against only migration `20260723104902`, the legacy claim RPC can commit a 30-second lease and return a success envelope without `presenterName`. The route correctly returns terminal 426, but without cleanup that committed row can produce a temporary false `PRESENTER_BUSY`.
- Root-cause mitigation: the claim route recognizes only the strict legacy committed-success envelope (`ok:true`, `code:CLAIMED`, exact requested share UUID, valid server expiry, no extra fields). It then performs one bounded best-effort compensation through the existing observed release RPC using server-verified Auth subject/session and the exact validated presence-session/space/returned-share fences. No table mutation, second writer, check-then-write path, synthesized presenter name, or client authority was added.
- Fail-safe behavior: ambiguous/malformed/unknown envelopes, extra fields, and mismatched/missing share fences never trigger compensation. Cleanup provider/malformed/typed failures preserve the original terminal `DATABASE_CONTRACT_INCOMPATIBLE` response. Observability records only correlation ID, operation, terminal outcome, retryability, and allowlisted compensation outcome.
- Rollout order remains database-first: migration `20260723224547_screen_share_atomic_presenter_contract.sql` is still required. On a separately authorized named target, apply and read back both screen-share migrations/functions/grants first, smoke-test the exact RPC response, then deploy the application. Compensation only limits stale-lease harm during accidental skew; it does not make the old database compatible.
- Deterministic evidence: RED `7009dc8` failed only the two missing-compensation cases while 105 existing cases stayed green. GREEN `da65f17` passed 107/107 route cases; type-check, focused ESLint, Next production build, Presence movement gate, Presence skill validation, and diff check passed.
- Database/deployment state: no migration/schema/data/RLS/grant change, no local or online database access, and no deployment occurred. Formal Presence and Supabase/RLS re-reviews remain orchestrator-owned.

## 2026-07-25 — Plan 03-04 post-merge presenter-busy tracer correction

- Full-suite regression: the screen-share tracer mocked the pre-03-04 `PRESENTER_BUSY` body without the now-required `retryable:false`. The real claim route already emitted the strict sanitized shape, but the client correctly rejected the stale fixture and therefore selected generic feedback.
- Test-boundary correction only: the shared tracer fixture is now parsed by `screenSharePublicErrorSchema` and includes terminal retryability. No production parser, route, user-facing copy, authority decision, or provider-error handling changed.
- Workflow proof: the losing display track is stopped exactly once before busy feedback, and `manager.startScreenShare` remains uncalled. RED `8ba5d5a` failed the schema-alignment and feedback cases; GREEN `ef15859` passed the tracer 7/7.
- Regression evidence: related tracer/route/context/signaling suites passed 129/129; full Vitest passed 105 files / 1,192 tests; type-check, focused ESLint, Next production build, Presence movement gate, Presence skill validation, and diff check passed.
- Database/deployment state: no migration, local/online database action, environment change, production boundary change, or deployment occurred. Formal Presence/Supabase re-reviews remain orchestrator-owned for the earlier production correction, not this test-fixture-only update.

## 2026-07-27 — Production cutover-audit correction follow-up

- Authorization and target: the user explicitly authorized immediate production application; `.env.local` and the Supabase link both resolved to project `vhabpcoyypobgasacsko`.
- Preflight: production contained Presence migrations `20260718203921`, `20260719140658`, and `20260720131318`; runtime was `atomic`, the legacy adapter remained enabled, the audit was active since `2026-07-20T13:45:09.615151Z`, the hourly cron was active/healthy, and the old `ON CONFLICT DO NOTHING` writer was live.
- History boundary: production also had four old remote-only migration versions, while several unrelated local migrations were absent remotely. Normal `db push --dry-run` stopped. No `--include-all` or broad/fictitious history repair was used.
- Backup: captured a pre-change logical dump of schema `private` at `C:\tmp\virtual-office-production-private-schema-pre-20260727123730.sql`; SHA-256 `b81e0f9d2a682d2527068d89438da8d613473c23464ef5a007c4e167299a51e2`. Migration SHA-256 was `5c72f79fdfea0b9ec1b210e662db8aff71dfce9f5820a64b2bc2042990b5812c`.
- Application: executed only the reviewed transaction in `20260727123730_fix_presence_cutover_coverage_first_observation.sql`, then recorded only version `20260727123730` as applied. No other pending migration was executed.
- Same-target readback: migration name/version and 25 statements are recorded; the old writer contract is absent; earliest-observation and exact-tie unhealthy behavior are present; both narrow FORCE-RLS maintenance policies match; fingerprint/catalog health are true; cron remains `5 * * * *`; temporary role/schema authority is removed; the immutable trigger is enabled.
- Observation consequence: production observation restarted at `2026-07-27T17:06:23.560672Z` with one healthy matching current-hour row. Evidence before that timestamp cannot authorize cutover. Runtime remains `atomic`, the legacy adapter remains enabled, and no application deployment occurred.
- Transient external issue: one post-apply readback received a Supabase Management API/Cloudflare 502; the required backoff was respected and the repeated same-target readback passed.
- Next waves: 03-13 must treat this audit correction as already applied and must not reapply it. No legacy disable/removal may proceed until seven complete UTC days after the new baseline and a fresh live gate/readback pass.

## 2026-07-28 — Phase 3 zero-cost acceptance correction

- User impact correction: the prior 03-13 plan incorrectly converted optional TURN infrastructure, two devices/profiles, two networks, and a Chrome/Firefox/Safari matrix into blocking user prerequisites without first explaining their cost or purpose.
- Planning decision: Phase 3 now closes with existing focused automated/local evidence. TURN remains optional, the free STUN fallback remains the configured baseline, and restrictive-network/cross-browser guarantees are explicitly unverified rather than imposed on the user.
- Cost boundary: no purchase, paid service, new credential, extra device, extra network, additional browser profile, or browser installation is required.
- Rollout decision: local-only/no-spend. No online database action or deployment is authorized by this correction.

## 2026-08-01 - Production screen-share database rollout

- Authorization and target: the user explicitly authorized production correction. `.env.local` and the Supabase link both resolved to project `vhabpcoyypobgasacsko`.
- Backup and rollback boundary: Supabase reported a completed physical backup from `2026-08-01T10:56:30.708Z`. Both migration files use transactions. The preflight proved that the lease table, RPCs, and four Realtime policies were absent.
- Database application: executed only `20260723104902_screen_share_lease_and_media_realtime.sql`, followed by `20260723224547_screen_share_atomic_presenter_contract.sql`. Both completed successfully.
- Migration history: recorded only versions `20260723104902` and `20260723224547` after catalog validation. Both now appear in local and remote history.
- Same-target readback: the lease table has forced RLS. Four media policies exist. The observed RPCs have the expected signatures, isolated owner, fixed search path, and service-role-only public execution.
- Contract readback: claim and active-read definitions include `presenterName`. An invalid request returns the expected typed result. Focused screen-share tests passed 142 of 142.
- Runtime limit: no matching active Presence session existed for space `72681540-6bc7-4e4c-ba4d-0293c5007e65`, so a real authenticated claim and release still require user confirmation.
- Remaining history concern: nine June migrations remain local-only and four older versions remain remote-only. Do not run a broad push or fictitious repair. Reconcile their exact provenance separately.

## 2026-08-01 - Production screen-share signaling security correction

- Root cause: the original private Realtime channel authorized browser Broadcast at join time. Because Realtime caches that authorization and does not validate sender fields inside each payload, an authorized occupant could forge screen-share signaling identity.
- Application correction: browser signaling now posts strict intent to the authenticated server route. The server derives user/company/space authority, checks the exact Presence session and active presenter/share, rate-limits sends, and publishes through the private Realtime HTTP endpoint with a two-second timeout.
- Database correction: applied only `20260801155137_require_server_media_broadcast.sql` to production project `vhabpcoyypobgasacsko`, then recorded only version `20260801155137` as applied. The transaction changed the helper to `media:v2` and removed authenticated browser Broadcast INSERT.
- Same-target readback: browser Broadcast INSERT policies are zero; one Broadcast receive and two Presence policies remain; the helper is owned by `presence_maintenance_owner`, is `SECURITY DEFINER`, and fixes `search_path=pg_catalog`. Rate-limit execution is service-role-only (`service_role=true`, `authenticated=false`, `anon=false`).
- Runtime evidence: the production Realtime HTTP endpoint accepted a private `media:v2` smoke event with HTTP 202. Focused application coverage passed 198/198; TypeScript and diff checks passed. Presence Safety and Supabase/RLS reviews found no blockers.
- Rollout boundary: the database cutover is complete. The corrected application code is present in this workspace but was not deployed to a hosted application. Existing browser tabs must reload so they join `media:v2`; old `media` clients cannot communicate with corrected clients.
- History concern remains unchanged: nine June migrations are local-only and four older versions are remote-only. Do not use broad push, `--include-all`, or fictitious history repair.

## 2026-08-04 - Multi-user screen delivery timeout correction

- Reported behavior: two different users occupied the same Virtual Office space from separate Windows virtual desktops. The share claim showed no error, but the viewer received no presentation.
- Real reproduction: the claim returned HTTP 200, then the first media description signal returned HTTP 500. The two-second server-to-Realtime timeout expired before the offer reached the viewer. The existing browser suite only proved the presentation shell and intentionally held signaling, so it did not cover live remote delivery.
- Application correction: the private Realtime HTTP send now uses the Realtime client's ten-second default window. Screen-share signaling failures now show an actionable message. A later acknowledged signal or a received live remote track clears that message.
- Stop-path correction: the successful release response no longer waits for the best-effort Realtime invalidation. Next.js schedules that notification after the response, while the existing authoritative reconciliation remains the fallback if delivery fails.
- Regression correction: the deterministic browser harness now intercepts the server-mediated signal route instead of obsolete direct WebSocket sends. A new two-user scenario requires both peer connections to exist and the viewer video to own a live track.
- Runtime evidence: after the correction, claim, handshake, description, ICE, active read, and renewal returned HTTP 200. Both peers reached `connected`; the viewer received a live video track. The diagnostic restored both users to their original spaces and removed its temporary server, script, and log.
- Verification: focused coverage passed 219/219, including a five-second acknowledgement, non-blocking release, and failure-to-success recovery; TypeScript, focused ESLint, the production build, Presence movement gate, Presence skill validation, and diff check passed. Final Presence Safety and Supabase/RLS reviews found no blockers and require no additional migration.
- Database/deployment state: no schema, migration, RLS, grant, data contract, or migration history changed. A fresh linked production migration-list readback shows `20260723104902`, `20260723224547`, and `20260801155137` present both locally and remotely. The production database remains compatible. No hosted application deployment occurred.

## 2026-08-04 - Messaging Realtime retry containment and same-host confirmation

- Reported behavior: `useMessageSubscription` emitted an unbounded stream of `CLOSED` retries with attempts repeatedly returning to zero or one. Restarting the development server stopped the accumulated timers but did not remove the retry race.
- Root cause: retry cleanup called both `channel.unsubscribe()` and `supabase.removeChannel()`. The intentional close reached the old status callback, while repeated failure callbacks could overwrite the single timer reference. Supabase also reuses an existing channel topic until removal completes.
- Application correction: each effect and retry owns a unique company/user-scoped topic. Channel-identity and generation fences ignore retired status callbacks and database events. Only one retry timer can exist, unstable channels back off to five seconds, and the retry attempt resets only after 30 stable seconds. Cleanup uses `removeChannel()` once and forces local teardown when removal fails.
- Identity correction: changing or removing company/user scope immediately clears the reported Realtime status. The new account cannot inherit a stale `SUBSCRIBED` readiness marker from the previous account.
- Regression evidence: eight deterministic tests cover repeated failures, unstable-channel backoff, a late retired-channel close, unmount, effect replacement during asynchronous removal, an old database event after an account switch, non-`ok` removal teardown, and missing identity scope. The final full unit suite passed 111 files and 1,284 tests. The Presence suite passed 61 files and 577 tests. TypeScript, the production build, Presence movement gate, Presence skill validation, focused lint, and full lint completed with zero errors. Full lint retains 495 existing warnings.
- Review evidence: the mandatory Presence Safety reviewer first found unfenced database handlers, failed-removal cleanup, identity scope, and stale-status gaps. All were corrected and the final review approved with no blocker or risk.
- Browser evidence: a linked production smoke used two configured accounts in two isolated Chromium contexts on this computer. Both users entered one space. The viewer received a live display track. The test stopped the share and closed both contexts. The temporary remote-test opt-in was removed immediately after the single scenario.
- Failed approach: Vitest does not support Jest's `--runInBand` flag. The first full-suite command failed before tests started. The standard `npm test` command then passed.
- Database/deployment state: the smoke created ordinary presence sessions and one temporary screen-share lease in production project `vhabpcoyypobgasacsko`. It changed no schema, migration, RLS, grant, or migration history. A final read-only production catalog check confirmed conversation-member SELECT policies and `supabase_realtime` publication membership for `messages`, `message_read_receipts`, and `message_reactions`. The Supabase/RLS reviewer approved the lifecycle diff and confirmed that it requires no migration. No application deployment occurred.
