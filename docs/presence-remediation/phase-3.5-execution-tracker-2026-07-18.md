# Phase 3.5 execution tracker — 2026-07-18

Scope: execute `phase-3.5-stabilization-plan.md`, then continue the remaining gates from the historical full presence remediation handoff. The handoff's load-bearing contracts remain authoritative for later phases even though the supplied relocated file is empty.

## Status

- Overall: local implementation and evidence complete; external rollout and user confirmation pending
- WP0: local inventory/preflight complete; user-authorized historical cleanup and named staging evidence pending
- WP1-WP3: verified
- WP4: implemented and adversarially reviewed
- WP5: implemented and presence-safety reviewed
- WP6: implemented and adversarially reviewed
- WP7: local bootstrap/reload/account-switch and three-identity product smoke green; user/staging drills pending
- Completion remains user-gated

### Full remediation checkpoint recovered from repository history

| Phase | Current evidence-backed state |
|---|---|
| 0-3 | Exit gates recorded as met, pending user confirmation; must survive the terminating regression gates. |
| 3.5 | WP1-WP6 implemented; WP7 local bootstrap, reload, account-switch, and three-identity product smoke green. User/staging drills remain. |
| 4 | Implemented; disposable three-identity cross-company Realtime isolation and terminating full suite are green. |
| 5 | Local exit gates met, pending external two-user smoke and user confirmation. |
| 6 | Locally implemented; clean-reset catalog, ACL, fingerprint, lock, receipt-race, and Realtime tests pass on real local Postgres. Final mandatory Presence and Supabase/RLS reviews are clear. |
| 7 | Locally implemented; atomic membership/company/invitation RPCs pass on repeated clean local resets. Final mandatory Presence and Supabase/RLS reviews are clear. |
| 8 | Local safety system implemented: explicit manifest, zero-critical-skip guard, CI lanes, full suite/lint/type/build, DB lane, and multi-identity E2E are green. |
| 9 | Draft skill/references/replacements, 28-scenario tree, validator, and fail-closed evaluator implemented. Semantic eval is blocked by the required clean commit and approved runner/models. |
| 10 | Operator runbook and fail-closed SQL drafts prepared locally. Remote rollout is not started; it requires explicit approval plus two separate seven-complete-day observation windows. |
| 11 | Blocked by confirmed Phase 10 evidence by design. |

## Progress log

| Time (America/Sao_Paulo) | Area | Result |
|---|---|---|
| 2026-07-18 | Intake | Read repository rules, the full `presence-safety` guide, and the Phase 3.5 plan. |
| 2026-07-18 | Source integrity | The supplied `presence-safety-remediation-handoff.md` is tracked but empty (0 bytes); the Phase 3.5 plan is the available executable specification. |
| 2026-07-18 | Safety | Confirmed the out-of-scope boundary around `useUserPresence`, `useLastSpace`, `presence-utils`, `/api/users/location`, and Knock routes. |
| 2026-07-18 | Workspace | Initial worktree has one unrelated untracked user file: `.claude/settings.local.json`; it will not be modified. |
| 2026-07-18 | Handoff recovery | Located the 2,113-line historical handoff in Git at `909266e^`; recovered the remaining Phase 5-11 gates for execution planning. |
| 2026-07-18 | Phase 4 evidence | Confirmed the linked migrations and admin/member smoke are recorded; the formal cross-company probe and terminating full-suite result are still open. |
| 2026-07-18 | WP0 audit | Project is recorded as legacy HS256/empty JWKS; the page-only proxy fallback to `getUser()` is therefore intentional. |
| 2026-07-18 | Runtime prerequisites | `.env.local` lacks the required separate `AUTH_E2E_MEMBER_*` pair; existing messaging fixture credentials are not a safe substitute. |
| 2026-07-18 | Test safety | The nominal unit suite includes `messaging/pin_star_integration.test.ts`, which loads `.env.local` and mutates the linked project; local gates must exclude it until the harness is isolated. |
| 2026-07-18 | WP1-WP3 verification | Focused suite passed 44/44; presence smoke passed 57 with 3 pre-existing TODOs; type-check passed. |
| 2026-07-18 | WP4 implementation | Added split client/server error contracts, redacted structural Supabase logs, status-based Auth 429 handling, correlation IDs, safe scoped route envelopes, and client `ApiError` parsing. |
| 2026-07-18 | WP4 verification | Focused suite passed 56/56; type-check, scoped lint, and `git diff --check` passed. Full Vitest again failed to terminate within its bound without reporting a test failure. |
| 2026-07-18 | WP4 review | No actionable findings. Additional messaging/Knock/location/presence compatibility sweep passed 100 tests with 3 pre-existing TODOs. |
| 2026-07-18 | WP5 implementation | Added typed bootstrap failures, transient same-UID retention, 401/non-transient teardown, retry/sign-in/error UI states, and customizable grid empty state. |
| 2026-07-18 | WP5 review correction | Presence reviewer found a network `TypeError` was lost by the profile fallback and could unsubscribe Presence; preserved the original error and added mounted-provider regressions for 429/503/network retention. Re-review found no remaining actionable issue. |
| 2026-07-18 | WP5 verification | Focused and mandatory presence guards passed 48 tests with 3 pre-existing TODOs; type-check and diff check passed; scoped lint had zero errors. |
| 2026-07-18 | WP6 implementation | Added env-gated correlated auth metrics, sync-profile auth-only instrumentation, sanitized NDJSON collection, and bootstrap Playwright coverage for initial/reload/account-switch budgets. |
| 2026-07-18 | WP6 review corrections | Closed phase-attribution/late-duplicate races, strict raw/persisted redaction, and process-tree/stream-drain shutdown defects; final bounded re-review found no actionable residual. |
| 2026-07-18 | WP6 verification | Focused suite passed 59/59; type-check, Node script checks, Playwright list/compile, scoped lint, and diff check passed. No browser or live service was used. |
| 2026-07-18 | WP7 harness root cause | `onboarding-page.test.tsx` returned a fresh mocked user object per render, causing an infinite effect/state loop. A stable fixture makes workers and the suite terminate normally. |
| 2026-07-18 | WP7 test isolation | Remote `pin_star_integration` no longer loads `.env.local`; it is excluded from local Vitest and requires an explicit flag, dedicated `REMOTE_MESSAGING_*` credentials, and corrected Auth/app-user cleanup. |
| 2026-07-18 | WP7 safe full suite | Exact `npm test` terminated in 26.2s wall time: 79 files, 838 passed, 6 skipped visual placeholders, 3 superseded TODOs, zero failures. Type-check, scoped lint, classification guard, and diff check passed. |
| 2026-07-18 | WP7 browser prerequisite | Installed Playwright Chromium 1223 / Chrome for Testing 148.0.7778.96 plus pinned FFmpeg and headless shell. |
| 2026-07-18 | WP7 admin smoke | Updated stale bilingual login locators; password admin login reached the floor plan with spaces visible and no console/request failures. |
| 2026-07-18 | WP7 metrics isolation | Preserved the user-owned port-3000 server; the metrics run owns port 3100, an ignored webpack build, a dedicated tsconfig, sanitized NDJSON, and an explicit cross-platform shutdown signal. |
| 2026-07-18 | WP7 runtime correction | A render-time login redirect caused duplicate page Auth validations under Strict Mode. Replaced it with a cleanup-safe scheduled `router.replace`; focused Strict Mode regression passes. |
| 2026-07-18 | WP7 admin budgets | Cold admin + reload passed: each phase issued exactly one sync-profile/companies/users/spaces bootstrap request and one `/floor-plan` proxy validation; zero 401/429/5xx/rate-limit, zero refresh events, and zero persisted secret-pattern matches. |
| 2026-07-18 | Linked migration history | Read-only `migration list --linked` confirms all seven Presence migrations from 20260710120000 through 20260716175515 are present remotely. Broader drift remains: 4 remote-only historical versions and 9 local-only pre-Presence versions. |
| 2026-07-18 | WP7 adversarial correction | Added browser/server correlation IDs, exact route budgets/status checks, refresh attribution, shutdown acknowledgement, and harness-owned generated-file restoration. Admin cold+reload passed with zero refresh/auth/status failures. |
| 2026-07-18 | Phase 5 foundation | Added strict snapshot contracts, scoped query/storage keys, visible polling, central movement coordinator, guarded 426 handling, and a Windows-safe movement inventory gate. |
| 2026-07-18 | Phase 5 caller migration | Floor-plan enter/leave, teleport, automatic placement, logout, and approved Knock movement now use atomic Presence endpoints/coordinator; legacy location transport has zero client callers. |
| 2026-07-18 | Phase 5 adversarial correction | Fixed same-target lease rejoin, stale success after reconcile, pre-commit query coalescing, duplicate init during session rotation, late session responses, Leave snap-back/audio state, identity-stale hint hydration, scoped Knock cooldown, logout isolation, and cross-tab manual-vs-fallback ordering. |
| 2026-07-18 | Phase 5 focused verification | Mandatory Presence and concurrency re-reviews found no remaining blocker/risk after corrections. Final local suite: 85 files, 904 passed, 6 skipped visual placeholders, 3 superseded TODOs; type-check, movement gate, scoped lint (zero errors), and diff check pass. |
| 2026-07-18 | Phase 6 Realtime foundation | Added one private company-scoped channel whose Presence meta is version-only; Presence and retained `users`/`spaces` Postgres events only invalidate the scoped authoritative snapshot. Exposed degraded state and added immediate plus two-second subscribe/reconnect reconciliation. |
| 2026-07-18 | Phase 6 polling correction | Changed snapshot polling from the Phase 5 temporary 15-second interval to the required 30-second interval while visible, retaining focus and online reconnect reconciliation. |
| 2026-07-18 | Phase 6 focused verification | Realtime/client foundation suite passes 21/21 and type-check passes. Database authorization/publication and writer-cutover work remains in progress. |
| 2026-07-18 | Phase 6 writer hardening | Profile/status, avatar upload/remove, profile sync, and OAuth callback now authenticate first and mutate `users` through schema-scoped service-role paths. Persisted `offline` is rejected/removed from UI, OAuth avatar input is derived from verified Auth metadata, avatar DB failure removes the new object, removals store SQL null, and generic updates no longer stamp `last_active`. |
| 2026-07-18 | Phase 6 legacy receipts | Both legacy groups are fail-closed: every users-location request records before auth/schema/mode handling, and parsed offline status attempts record before auth or mutation. Recorder failure returns `503 LEGACY_AUDIT_UNAVAILABLE`. |
| 2026-07-18 | Phase 6 consumer cutover | Replaced the orphaned public global Presence hook with the snapshot/private-Realtime facade, deleted its superseded derivation/direct-DML tests, centralized the strict non-null occupancy selector, and removed status-based responder/capacity filtering. |
| 2026-07-18 | Phase 6 database work | Added the private company Presence authorization/publication migration locally; the full additive immutable cutover-audit migration and non-applied Phase 10 draft are in progress. Nothing was applied remotely. |
| 2026-07-18 | Phase 6 cutover audit | Added four FORCE-RLS aggregate/coverage tables, statement-level authenticated writer counters, service-only legacy route receipts, immutable metadata/hourly coverage, catalog fingerprinting, exact Cron health, locked seven-day assertion, and the reconciliation marker. Added the operator evidence query and kept the breaking Phase 10 SQL outside the active migration chain. |
| 2026-07-18 | Phase 6 DB regression harness | Classified privileged fixture SQL as `service_role` and added real-Postgres cases for catalogs, ownership, statement counting, service exclusion, unverified-role rejection, marker rules, route groups, immutability, no-repair coverage, fingerprint drift, and the Phase 10 lock precondition. |
| 2026-07-18 | Phase 6 static verification | Type-check, scoped audit-test lint, movement boundary gate, and diff check pass. Mandatory Presence and Supabase/RLS reviews are running. No remote state was touched. |
| 2026-07-18 | Phase 6 mandatory review corrections | Removed the impossible maintenance-owner dependency on `auth.jwt()`, pinned every marker-authorized writer in the fingerprint, moved gating receipts after verified auth, changed server Presence auth to `getUser()` plus exact-session claims, delayed Realtime track until lease commit, added post-register reconciliation, and made auth-session revocation stop leases/cache/channel even when local sign-out fails. |
| 2026-07-18 | Phase 6 writer boundary correction | Generic user updates now reject placement and persisted offline, the unused direct current-space repository writer was removed, and the source gate permits legacy `updateLocation` only in its tombstone adapter/repository pair. |
| 2026-07-18 | Phase 7 membership transaction | Added service-only, maintenance-owner functions with user→company lock order for company creation, invitation acceptance, role/adminIds updates, and removal. Removal additionally locks target space→sessions→logs and atomically clears placement, retires all target leases, closes logs, removes adminIds, clears company, resets role, and increments revisions once. |
| 2026-07-18 | Phase 7 route/client cutover | Company create, invitation accept, role update, and member removal now derive identity/company server-side and call typed atomic RPCs. Client code no longer performs a second adminIds mutation; generic company settings update rejects membership fields. |
| 2026-07-18 | Phase 7 focused verification | Membership/Realtime/revocation/bootstrap suites pass 64/64; expanded lifecycle set passes 117/117; type-check, movement gate, scoped lint, and diff check pass. Real-Postgres and two-browser gates remain pending. |
| 2026-07-18 | Phase 8 critical-test closure | Replaced six avatar skips with executable assertions, removed three obsolete capacity TODOs already covered at API/DB layers, and added a classification guard that fails on any skipped/TODO critical Presence test. |
| 2026-07-18 | Phase 8 CI and manifest | Added an explicit Phase 1-7 Vitest manifest, independent movement/unit/DB/E2E CI lanes, reset-plus-repeat DB execution, and mandatory browser secrets instead of conditional skips. |
| 2026-07-18 | Phase 8 local gates | Presence manifest passed 52 files/461 tests; terminating safe suite passed 89 files/934 tests with zero skips/TODOs; full lint passed with 0 errors, type-check passed, and production build passed with 47 pages. |
| 2026-07-18 | Review correction: membership scope | Companyless registration is gated/terminal, A→B snapshot mismatch invalidates the old lifecycle, CompanyContext fences delayed bootstrap, and session registration now compares/echoes expected company under the locked DB user row. Mandatory Presence re-review is clear. |
| 2026-07-18 | Review correction: atomic invitations | Replaced direct invitation insertion/reuse with a service-only locked RPC that reauthorizes the actor, serializes capacity, rejects existing members, and returns authoritative identity/counts. Route TOCTOU regression passes. |
| 2026-07-18 | Review correction: membership entry | Rollout preflight plus company-create/invitation-accept RPCs retire legacy active sessions, close open logs, clear companyless placement, and preserve location/access revision semantics before assigning the new company. |
| 2026-07-18 | Review correction: legacy capacity | Migration rejects companies already above ten members, expires stale/excess newest reservations deterministically, and acceptance rechecks members plus live reservations under lock. Direct service-role invitation INSERT and membership UPDATE are DB-blocked so an old release fails closed during cutover. |
| 2026-07-18 | Phase 9 draft | Added replacement `SKILL.md`, six references, reviewer/guard/pitfalls drafts, and all 28 adversarial semantic scenarios without changing canonical skill copies. |
| 2026-07-18 | Phase 9 evidence system | Added repository-owned structural validation and a clean-commit/hash-bound JSONL evaluator with pinned runner/model manifests, allowlisted environment, fresh per-call processes, family-separated judge, fixed caps/timeouts, exact prompt/report hashes, and fail-closed verdict handling. |
| 2026-07-18 | Phase 9 verification | Draft validation passes; evaluator syntax/lint pass; exact gate correctly refuses the dirty checkout and rejects any trial count other than three. Semantic execution remains blocked until the user-owned commit and approved runner/model inputs exist. |
| 2026-07-18 | Final mandatory reviews | Presence review and Supabase/RLS review both report no remaining blocker or risk after the membership, invitation, platform-admin, fingerprint, and scope-fencing corrections. Real-Postgres execution remains a separate required gate. |
| 2026-07-18 | Atomic profile compatibility | Found and removed an over-broad legacy gate from ordinary profile/role updates. Only the verified persisted-offline legacy attempt now records and enters that gate; a regression proves normal profile writes remain available after atomic activation. |
| 2026-07-18 | Phase 10 preparation | Added a target/approval/readback/rollback runbook, postgres-only adapter-disable and final-removal gates, a disable transaction draft, and the second seven-day read-only audit. Nothing was applied to staging or production. |
| 2026-07-18 | Phase 10 review correction | The audit-start health check now rejects wrong adapter-gate signatures and any PUBLIC/browser/service execution grant before accepting the baseline. Added a two-connection DB regression that holds a receipt writer, proves disable waits, then requires a nonzero-receipt abort with the adapter unchanged. |
| 2026-07-18 | Final Phase 10 reviews | Mandatory Presence and Supabase/RLS re-reviews are clear with no remaining blocker/risk in the local increment. Both explicitly retain real-Postgres execution as unproven while Docker is stopped. |
| 2026-07-18 | Local Postgres activation | Started Docker Desktop and the local Supabase stack only; no linked/staging/production state was changed. |
| 2026-07-18 | Clean migration resets | Applied the full migration chain from scratch twice with the final Phase 6/7 SQL. Fixed migration-time function ACL ordering, the intended invoker contract for `transition_user_location`, and impossible caller-side locks on FORCE-RLS audit tables. |
| 2026-07-18 | Real-DB ACL corrections | Added the minimal `platform_admins.user_id` row-lock privilege/policy, `users.display_name` read needed by null-preserving acceptance, and the maintenance-owner `EXECUTE` edge required for adapter-disable to invoke the private cutover gate. Audit health/fingerprint now cover these boundaries. |
| 2026-07-18 | Real-DB race verification | The two-connection route-receipt race proves adapter disable waits for the receipt writer, observes the committed receipt, aborts with `PRESENCE_LEGACY_CUTOVER_RECEIPTS_NONZERO`, and leaves the adapter enabled. |
| 2026-07-18 | DB harness isolation | Removed accidental cross-file reliance on granting `service_role` to `postgres`: service RPCs use the local service endpoint and the concurrent receipt writer uses a dedicated ephemeral login role. Global repair metrics assert exact deltas from a captured baseline. |
| 2026-07-18 | Final local DB gates | Repeated clean resets plus stabilized Auth/Kong gateway completed; full Presence DB suite passed 11 files/89 tests before the final audit-coverage review. |
| 2026-07-18 | Final local gates | Presence manifest 53/474, full unit 90/947, type-check, build (47 pages), movement gate, skill validation, diff check, and full lint (0 errors/522 historical warnings) pass. |
| 2026-07-18 | Final audit-coverage correction | Mandatory RLS review found two evidence gaps: `platform_admins` RLS state and the scoped session-registration writer were not fingerprinted. Added table-state fingerprint/health plus exact registration signature/owner/ACL coverage. Transactional drift probes pass. |
| 2026-07-18 | Final corrected DB gate | Restored audit-start calls, completed another clean reset, passed the focused Phase 6/7 set 26/26 and the complete DB suite 11 files/91 tests. Type-check, scoped lint, movement gate, and diff check pass. |
| 2026-07-18 | Complete policy fingerprint | Expanded the fingerprint from the two PMO policies to every `platform_admins` policy. A transactional authenticated `USING (true)` probe now forces fingerprint drift and `healthy=false`, then proves rollback restores both. |
| 2026-07-18 | Final mandatory re-reviews | Presence and Supabase/RLS reviewers report no remaining actionable blocker or risk. Final clean-reset DB suite passes 11 files/92 tests; type-check, scoped lint, and diff check pass. |
| 2026-07-18 | Local E2E fixture | Added disposable local admin/member/external identities, two same-company public rooms, one shared private room, and an isolated external-company room. Fixture provisioning stays local and updates all layout/access fields deterministically. |
| 2026-07-18 | Browser movement correction | A detached native `window.fetch` loses its required receiver in Chromium (`Illegal invocation`), so the coordinator now stores a bound native fetch. Added a regression plus initial-session recovery coalescing for superseding A→B intents. |
| 2026-07-18 | UI movement correction | Space-card click and Join no longer open chat before the authoritative location transition confirms. The smoke selects a room different from automatic placement so every asserted movement is a real POST rather than a same-target no-op. |
| 2026-07-18 | Knock operability correction | Network/ledger checkpoints proved both Knock directions were delivered. The responder banner was underneath menus/detail panels and submitted on both pointerdown and click; raised its layer, made click the single decision event, and added a double-submit regression. |
| 2026-07-18 | Three-identity product smoke | Local Playwright passed with admin/member/external in isolated contexts: same-tenant rooms and avatars exactly once, real movement, zero external-tenant snapshot invalidation, private approval/auto-entry, and reverse denial. |
| 2026-07-18 | Audio lifecycle correction | The product smoke exposed a stale async audio subscription handshaking after its manager was cleaned up. Added channel ownership/cancellation fencing, caught track/handshake rejection, and covered current vs retired subscriptions. |
| 2026-07-18 | Account-switch UI correction | The menu trigger exposed avatar edit buttons inside its own button because `showUploadButton` was unused, producing invalid nested buttons/hydration warnings. The avatar now honors explicit read-only mode while remaining editable when a change handler is supplied. |
| 2026-07-18 | Logout navigation correction | Client-router navigation raced Auth/RSC teardown in Next dev, issuing three `/login` navigations and crashing the internal Router hook list. Successful logout now performs a history-replacing full-document navigation, the strongest browser identity boundary. |
| 2026-07-18 | Auth-route Presence fence | Account-switch evidence caught an authoritative snapshot starting on `/login` and being aborted by the document transition. Presence now receives null identity/company and no spaces on auth/onboarding routes, then initializes on the protected destination. |
| 2026-07-18 | Login evidence correction | The complete browser matrix caught a cold Fast Refresh while `/login` was transitioning. The harness now precompiles every post-login Presence route and arms navigation before submit. A document-replace attempt duplicated `sync-profile`, so it was reverted. |

## Decisions and invariants

- Preserve the presence truth hierarchy: database position, Realtime connectivity, query-cache mirror, advisory local storage.
- Preserve identity teardown on 401; retain confirmed state only for transient failures while the authenticated UID is unchanged.
- Keep client error modules free of `next/server`; never return Supabase `details` or `hint` to clients.
- Keep the legacy `/api/users/location` adapter non-mutating; all feature movement uses `/api/presence/location`.
- No commits: the user reviews and commits.

## Learnings and errors

- `rtk` is required by repository guidance but is not installed in this shell; use focused native commands and keep output small.
- A combined initial file read truncated the safety guide; corrected by rereading each required source independently before editing code.
- Goal creation was already handled by `/goal`; a second creation attempt was rejected, and the existing goal remains active.
- The existing runtime report proves the rate-limit symptom but not the exact Auth endpoint/code/refresh path; that evidence requires a sanitized controlled reproduction or platform Auth logs.
- Playwright Chromium is installed; live multi-user verification still requires the missing member credentials.
- The old movement gate could false-pass on Windows because GNU `grep` was absent; it was replaced with a pure-Node traversal and now fails closed.
- A scoped last-space hint is never placement authority. Null server placement follows first-placement/home/default/workspace precedence; non-null placement performs one same-target lease rejoin.
- TanStack `fetchQuery` can coalesce post-mutation reconcile with a pre-commit poll, but canceling that active query aborts a legitimate reload snapshot. Await the exact query's in-flight promise, then fetch, validate, and install the authoritative post-transition snapshot.
- Re-check intent generation after every awaited reconcile; otherwise stale A may select/open after B arrives.
- Session rotation needs request/session fencing plus initializer ownership across the full automatic fallback chain.
- StrictMode effect cleanup cannot permanently dispose a memoized coordinator; delayed disposal must be canceled by the second committed setup.
- Refs that select sessions, registrations, coordinators, or exact-session Knock responders are promoted only after commit; render-aborted identities must not mutate live authority.
- Logout invalidates the Presence client lifecycle only after both atomic server logout and local Auth sign-out succeed, then removes scoped cache/storage so late reconciles cannot repopulate it.
- Realtime is acceleration, not state authority: callbacks never patch users/spaces from payloads and a channel payload must not carry status, placement, avatar, ACL, or activity data.
- Subscription dependencies are identity scope only. Snapshot/movement/status changes invalidate/refetch without recreating the channel.
- The seven-day audit clock must start before the release that removes the final legitimate authenticated writer. Local source ordering is not deployment evidence; rollout must install/start the additive audit migration first.
- `last_active` is not a connectivity credential. Generic profile/avatar/admin writes must not stamp it; only reviewed coarse server telemetry paths may own it.
- A Next/Turbopack Windows manifest rename race produced a harness-only 500; the isolated metrics server now uses webpack. Reload navigation may abort only the old heartbeat/disconnect/knock polling while bootstrap failures remain fatal.
- The Playwright web-server wrapper did not terminate on Windows signals alone; a global teardown sentinel now stops its owned process tree and drains metrics deterministically.
- Supabase CLI help attempted to write telemetry under the read-only user profile and failed with EPERM; the linked migration read itself succeeded and no remote state was changed.
- Docker Desktop is not running, so `supabase db reset` cannot execute the new migrations or DB integration suite yet. Static checks remain green, but this is a real Phase 6 acceptance blocker—not evidence to waive the disposable-Postgres gate.
- The Phase 6 catch-all audit intentionally rejects unclassified `users` updates. The privileged DB fixture connection must identify itself as `service_role`; individual adversarial tests override the claim transactionally so test setup does not become false audit traffic.
- Schema-qualifying PostgreSQL's special `COALESCE` expression as `pg_catalog.coalesce` is invalid. A static audit incorrectly claimed full removal while one runtime function still contained it; an authenticated real-Postgres function-call regression now prevents recurrence.
- Recording unauthenticated legacy-route probes in the global zero-call gate creates an eight-day denial-of-cutover primitive. Receipts now count only requests that passed server Auth validation, still before parsing/mode/mutation decisions that could hide a verified legacy client.
- Membership state cannot be split between `users.role/company_id` and `companies.admin_ids`. Role, invitation, creation, and removal writers now share one database transaction and one user→company lock order.
- A route-time company comparison is not a lease fence. The expected company must be checked again while holding the same user lock that serializes membership writers, and the RPC must echo the locked company identity.
- Invitation capacity is a reservation invariant (`members + live pending <= 10`), not only a create-time UX check. Legacy excess must be reconciled and acceptance must recheck under the company lock.
- A migration/app deployment race can recreate repaired state unless obsolete service-role DML is made database-impossible. The Phase 7 triggers make old create/accept code fail closed while RPC writers run as the narrow maintenance owner.
- Mock helpers must echo the requested scope explicitly. A default company-A response in an A→B test correctly triggered the production fail-closed behavior; the fixture, not the guard, was wrong.
- Phase 9 static validation proves structure only. The semantic gate deliberately refuses a dirty checkout and cannot run until a clean commit, approved length-delimited runner bundle, two candidate models, and distinct-family judge are supplied.
- A legacy gate attached to an entire generic profile route becomes a latent atomic-mode outage. Gate only the retired presence-writing branch; verified profile/role writes must remain on their hardened server paths.
- Adapter deletion is a separate cutover, not cleanup attached to the first seven-day gate. Disable it atomically, retain the receipt-counting 426 tombstone, and require a second immutable 168-hour zero-receipt window plus a final live lock.
- A fingerprint prevents later drift but cannot make an unsafe initial baseline safe. Audit start must independently validate exact signatures and effective ACLs before capturing the expected fingerprint.
- `SELECT ... FOR UPDATE` needs an update-capable ACL/RLS path even when the function only reads the locked row; grant the smallest inert column update and audit the exact policy rather than broad table rights.
- A SECURITY DEFINER function calling another revoked function still needs an explicit executable call edge for its effective owner. Nested private gate ACLs are part of the cutover contract.
- A local Supabase reset can recreate Auth without restarting Kong; Kong may retain the old upstream address while both containers look healthy. Refreshing the local gateway DNS fixed empty Auth responses without changing database state.
- DB integration fixtures must not depend on a role grant made by another test. Use the service endpoint or a dedicated ephemeral login role so file ordering cannot create false greens.
- Browser methods can require their native receiver even when their TypeScript type looks like a plain function. Store `globalThis.fetch.bind(globalThis)`, not a detached `globalThis.fetch` reference.
- Automatic default placement can make a nominal movement scenario a no-op. Read the authoritative current space first and choose a distinct target when the gate intends to exercise mutation.
- An in-card alert must sit above every sibling menu/detail layer, and a decision belongs to one semantic event. Binding the same async action to pointerdown and click risks duplicate writes and makes the target disappear mid-click.
- Realtime subscribe callbacks outlive React effects. After every awaited setup step, recheck channel ownership/cancellation before using a manager that cleanup may have retired.
- A cold Next development compile can take over 30 seconds across several first-use API routes and can commit `/floor-plan` before global `load`. E2E login gives that cold navigation 60 seconds, waits only for URL commit, then uses visible floor-plan state as the actual readiness gate; request/Auth budgets remain unchanged.
- Chrome may evict a successful response body during document navigation (`Network.getResponseBody: No data found`). The metrics harness ignores only that exact DevTools artifact for 2xx responses; non-2xx, aborts, and every other capture error still fail closed.
- First-use Next dev compilation may trigger HMR and a second proxy navigation that cannot occur in a precompiled production release. An isolated warmup compiles the page plus late logout/disconnect/detail routes before evidence boundaries; the measured browser still starts with fresh context, cookies, and session and keeps the one-validation budget.
- Boolean capability props must actually fence their interactive subtree. A visually hidden hover button still creates invalid nested controls when its parent is itself a trigger.
- Auth logout is an identity/document boundary, not an ordinary in-app link. A full `location.replace` avoids concurrent App Router state during cookie/context teardown and prevents history from reviving the authenticated tree.
- Do not initialize Presence merely because Auth/Company bootstrap completed; route eligibility is also part of client lifecycle ownership. Auth/setup pages must pass null scope so authoritative snapshot work begins only on its durable destination.
- A successful RSC response does not prove an App Router transition committed during a cold dev compile. Prewarm every late dynamic route outside evidence boundaries; keep login client-side to avoid a second company bootstrap, while logout remains a document identity boundary.

## External confirmations still required

- [ ] Admin sessions affected by the historical credential log were revoked in Supabase.
- [ ] Any historical local dev log containing credentials/tokens was scrubbed or deleted.
- [ ] Production rollout/maintenance windows in Phase 10 are explicitly approved when reached.
- [ ] Phase 9 JSONL runner/model manifests and provider environment are approved after the draft input tree is committed cleanly.
- [x] Docker Desktop/local Supabase ran the final migrations and real-Postgres races after repeated clean resets.
- [x] Disposable local admin/member/external E2E identities are provisioned without reusing unrelated messaging credentials.
- [ ] Dedicated staging/CI admin/member/external E2E credentials are provisioned as protected secrets.

## Final closure update

| Date | Item | Result |
|---|---|---|
| 2026-07-18 | Lease ownership | Removed snapshot-driven lease rotation, made disconnect one-shot per session, and retire successful registrations that resolve after their scope became stale. Route-ineligible pages, including `/join`, tear down Presence scope. |
| 2026-07-18 | Realtime and Knock async fences | Muting no longer recreates the audio channel; retired handlers and awaited setup are ownership-fenced. Knock responses are single-flight and late completion after unmount cannot update UI or toast. |
| 2026-07-18 | Browser response contracts | E2E now requires exact request counts plus 2xx status and valid JSON contracts for registration, placement, snapshot, and atomic logout. The three-spec local matrix passed in 3.3m. |
| 2026-07-18 | Audio scope ownership | WebRTC manager state carries room/user ownership. Room changes reset mute/enabled/speaking/peer state and every callback from a retired manager is ignored. |
| 2026-07-18 | Mandatory review closure | Final Presence re-review reported no actionable findings after the lease, route, Realtime, Knock, E2E, and WebRTC corrections. |
| 2026-07-19 | True Realtime operability | The browser smoke now refuses degraded channels, waits for `subscribed`, rechecks subscription after movement, and proves zero cross-tenant invalidations before movement plus Knock in both directions. |
| 2026-07-19 | Realtime runtime repair | Corrected invalid `pg_catalog.coalesce` and added the narrowly scoped Broadcast SELECT needed for Supabase Realtime's synthetic private Presence join. No Broadcast INSERT was granted. |
| 2026-07-19 | Snapshot stabilization | Reconnect/subscribe signals coalesce without a request storm; location reconciliation awaits the exact in-flight query instead of aborting it; bootstrap quietness covers the required two-second reconciliation. |
| 2026-07-19 | Final local browser matrix | One shared disposable local run passed initial bootstrap, reload, admin-to-member switch, tenant isolation, movement, and bidirectional Knock: final rerun 3/3 in 3.0m. |
| 2026-07-19 | Final review risks closed | Real RLS negatives cover other tenant, absent/malformed/revoked SID, Presence/Broadcast write boundaries, and Knock. Auto-placement waits for an eligible candidate, while cold snapshot failure blocks the empty-avatar floor plan with explicit retry. Presence and Supabase/RLS re-reviews report no findings. |
| 2026-07-19 | Normative completion audit | Recovered the complete historical handoff from `c4fa624`, mapped Phases 0–11 and every Phase 3.5 gate to local/external evidence, and recorded the ordered external execution queue in `presence-remediation-completion-audit-2026-07-19.md`. |
| 2026-07-19 | Presence observability closure | Added the missing sole allowlisted one-line formatter and wired location/logout, lease, snapshot, and Knock server boundaries without raw errors, Auth-session IDs, emails, names, tokens, or service credentials. |
| 2026-07-19 | Health-check closure | Added and real-Postgres-tested the missing read-only health artifact, separating database invariants from counters that require retained structured logs. Phase 10 now requires pre/post results and treats a missing log query as missing evidence. |
| 2026-07-19 | Failure-injection correction | Replaced the log permission-revoke simulation with same-connection `pg_temp` triggers and added the missing Knock-consumption fault; both prove full atomic rollback. |
| 2026-07-19 | Distinct-ID concurrency soak | Added a configurable same-user transition-pair soak. The default 50-pair gate and the explicit 200-pair local run pass without deadlock; all concurrency families still require the final 200-iteration staging soak. |
| 2026-07-19 | Realtime project-setting gate | Phase 10 now requires target readback that Realtime **Allow public access** is disabled plus own-company success and anonymous/other-company denial; `private: true` alone is not accepted. |
| 2026-07-19 | Exact observability contract | Added service-only additive RPC wrappers plus transaction-local triggers for exact previous/result versions, authorization mode, active unfenced-session count, and Knock revision/expiry/consume evidence. Route responses strip internal evidence fields; DB and formatter tests prove the contract. |
| 2026-07-19 | Health fault matrix | Made a missing/duplicate runtime singleton fail closed, split retention sources, and transactionally injected every database health abort family without leaking fixtures. |
| 2026-07-19 | Realtime cached-access residual | Recorded that an open private channel caches authorization until a reauthorization boundary. Rollout now requires a held-open raw-socket removal/fence probe, measured token/refresh bound, and named security-owner acceptance. |
| 2026-07-19 | Evidence-store boundary | Declared UUID-bearing raw rollout artifacts external to the app worktree, required ACL/retention readbacks, and added a defensive ignore rule. |
| 2026-07-19 | Local reset recovery | Docker/Supabase had stopped and Auth/PostgREST produced warm-up false failures. After health recovery, the standard reset hit an internal analytics migration collision; the explicit local DB URL reset applied every project migration cleanly with no seed. |
| 2026-07-19 | Fixture leak correction | A cleanup `catch` masked one health-test retention fixture. Removed only the exact local test rows and converted fault/retention probes to rollback-only transactions. |
| 2026-07-19 | Final Knock review corrections | Pre-authorization/missing-request results no longer receive internal metadata, nullable responder revisions are omitted, public bodies strip server-only requester identity, and status enrichment authorizes first, locks the own-request row, then re-reads status so concurrent response cannot mix generations. |
| 2026-07-19 | Cross-company health authority | Added a zero-gate spanning canonical placement, active leases, spaces, live Knocks, and responders. The rollback-only fault matrix includes a cross-company canonical placement with a matching open log and no lease, so legacy-mode tolerance cannot hide it. |
| 2026-07-19 | Local gateway recovery | The final reset changed the Auth container IP while Kong retained its old upstream address, producing deterministic 502s. Restarting only the local gateway restored Auth health 200; the full DB lane then passed 13/108. |
| 2026-07-19 | Final local verification | Clean migration reset, Presence 60/509, full Vitest 97/983, DB 13/108, E2E 3/3 in 2.2m, 200-iteration soak, type-check, 47-page build, movement/skill gates, atomic-mode health SQL and diff integrity are green. Lint has 0 errors/512 historical warnings. |
| 2026-07-19 | Completion-audit continuation | Started independent Thermos correctness/security and maintainability reviews over the complete remediation diff. Reconciled the Phase 3.5 WP0-WP7 requirements against the completion audit; staging, production, semantic-eval, elapsed-window, and approval gates remain explicitly external. |
| 2026-07-19 | Handoff pointer repair | Replaced the supplied zero-byte handoff placeholder with a non-normative pointer to the immutable 2,113-line handoff at `c4fa624` and the current tracker/audit/evidence/runbook. No historical requirements were copied or reinterpreted. |
| 2026-07-19 | Linked target preflight | Performed read-only migration/catalog/Cron checks on the already linked healthy project. It is current only through Phase 4: the final Phase 6/7/observability migrations and seven observed wrappers are absent. Maintenance-owner, publication, Realtime RLS, and three `postgres` Cron boundaries match the pre-candidate contract. The generic target remains unnamed/unapproved for rollout. |
| 2026-07-19 | Concurrency audit correction | Reopened local Phases 3/8 after mapping every normative race. Only register-vs-Logout and distinct-ID transitions meet the 50× CI count; only distinct-ID has a 200× local run. Concurrent Knock create/respond, pair/global limiting, and different-ID Logout are missing; case 52 lacks the required responder lock-set retry; case 59 lacks the required atomic runtime-control gate/recheck. The earlier “local complete” wording is superseded. |
| 2026-07-19 | Thermos bug/security audit | Reopened local Phases 7/8: pull-request CI exposed remote service-role credentials and shared mutable identities; Presence API paths did not trigger the workflow; Presence failure could prevent local sign-out/cleanup; and a late profile mutation could expose account-A data after switching to B. All five are merge blockers under correction. |
| 2026-07-19 | PR CI credential boundary | Removed reusable remote Supabase/service-role credentials and shared remote identities from pull-request execution. The browser lane now provisions a disposable local stack and local identities; Presence API and supporting auth/repository paths trigger the workflow. The repeated whole-DB-suite step remains provisional until the exact 50x concurrency lane replaces it. |
| 2026-07-19 | Logout and account-switch fencing | Presence logout now uses a typed bounded idempotent fence, but local Supabase sign-out and Presence lifecycle/query/storage cleanup always run even when either boundary fails. Company mutations capture auth generation and ownership, suppressing both late success and late failure from account A after switching to B. Parent rerun: 2 files, 36 tests passed. Independent Presence review is pending. |
| 2026-07-19 | Presence lifecycle re-review corrections | The reviewer found three non-blocking risks and all were corrected: membership invalidation now clears the old profile/owner even if reload fails; mutations assert the auth generation before their first remote side effect; and revocation-triggered cache cleanup/local sign-out isolate synchronous and rejected failures. Ordinary logout clears the old tenant generation before Supabase emits `SIGNED_OUT`. |
| 2026-07-19 | Case 52 HTTP retry boundary | The Knock request route retries only the internal uncached `RETRY_LOCK_SET`, reusing identical RPC arguments/request ID for at most four transactions. Exhaustion returns sanitized retryable 503 with `Retry-After: 1`, no intermediate broadcast/log/body leak. Parent verification: lifecycle + route subset 3 files/46 tests and type-check passed. SQL proof remains in progress. |
| 2026-07-19 | Membership contract canonicalization | Consolidated six company/invitation/member RPC boundaries into strict Zod request/result/identity/error contracts, removing repeated ad-hoc parsers while preserving service-role and public response boundaries. Parent rerun: 7 files/48 tests and type-check passed; independent Supabase/RLS review is pending. |
| 2026-07-19 | Membership RLS review closure | The first RLS review found a cross-tenant removal oracle, raw Auth-provider email errors, an unbounded privileged `planType`, and a stale schema snapshot. Non-admin removal now stops before service-role construction; missing/outside-company targets share one opaque 403; delivery exposes only `DELIVERY_FAILED`; input/result lengths are bounded; and the old catalog file is labeled historical. Follow-up review found no actionable findings; parent subset 3 files/26 tests, type-check, and scoped lint passed. |
| 2026-07-19 | Cases 52/59 SQL closure | Added the canonical responder lock-set recheck plus uncached retry sentinel, and a terminal shared runtime-control gate for atomic transitions. Approved Knock replay now also revalidates responder tenant. A clean local reset and the 5-test corrective contract pass, including real PID/lock proof that a transition holds the gate through its mutation. |
| 2026-07-19 | Immutable audit expansion | Runtime control, all observed wrappers, both observability helpers/triggers, exact ACL/RLS/constraints, and current-hour coverage serialization are now fingerprinted/health-checked. Transactional drift injections prove runtime-constraint and observed-wrapper ACL changes fail closed and roll back cleanly. |
| 2026-07-19 | Normative race manifest | Implemented one tagged assertion for each required case 13, 15, 16, 29, 33, 37, 45, 48, 49, 50, 52, 57, 58, and 59. Case 57 proves the breaking gate waits for in-flight direct-write and route receipts before rejecting them. One isolated harness iteration passes 14/14. |
| 2026-07-19 | Exact 50x CI concurrency gate | The fail-closed runner forces one fork/worker and no file parallelism, retries only internal Knock lock-set sentinels, and validates exact iteration indices per tag. The fresh re-reviewed tree passed 14 cases x 50 iterations (700 records) in 762 seconds. |
| 2026-07-19 | Final catalog-review corrections | The immutable audit now covers the movement gate, both revision guards, and all five load-bearing movement/revision triggers with exact catalog health counts. Transactional trigger drift changes the fingerprint and fails health closed. |
| 2026-07-19 | Phase 7 atomic compatibility | Both member-removal and role-update RPCs set the transaction-local `atomic-reconciliation` writer marker before movement-gated writes in atomic mode. A real-DB rollback test passes both RPCs without changing durable member state. |
| 2026-07-19 | Staging runner target binding | Destructive staging concurrency execution now requires an approved protected hostname and derives the actual project ref from direct/pooler connection metadata; the derived ref must equal the declared target ref. Local/CI modes remain loopback-only. |
| 2026-07-19 | Normative collection isolation | Vitest cross-file execution overlapped global PMO/audit fixtures despite worker limits. The lane now has one collection authority importing all tagged suites; one iteration passes one file with 14/14 tagged cases and 34 non-normative tests skipped. |
| 2026-07-19 | Test membership cleanup correction | An atomic-mode DB test granted `service_role` transactionally but revoked it after rollback, deleting the local baseline membership and contaminating later RPC tests. Removing the out-of-transaction revoke preserves the exact before/after membership tuple (`service_role=true`, PMO=false); the test passes 12/12. |
| 2026-07-19 | Final mandatory re-reviews | Presence and Supabase/RLS reaudits found no remaining findings. They verified the full gate/trigger fingerprint, atomic-reconciliation marker scope, rollback privilege hygiene, staging host/ref binding, and single-authority runner. |
| 2026-07-19 | Exact 200x concurrency soak | The final local-only soak passed all 14 normative cases at every index from 0 through 199: 2,800 complete records in 2,705 seconds. No partial run or earlier superseded soak is counted. |
| 2026-07-19 | Final clean-tree verification | A fresh local database reset applied the complete migration chain. Final gates passed: DB 14 files/115 tests, Presence 60/536, full Vitest 98/1,017, type-check, movement gate, skill validation, runner syntax, production build with 47 pages, and full lint with 0 errors/529 historical warnings. |
| 2026-07-19 | Final local browser smoke | An initial invocation correctly failed preflight because metrics/local-fixture flags and disposable credentials were absent; its teardown timed out and the run was rejected. Re-running with credentials read in-memory from local Supabase passed all 3 scenarios in 2.1 minutes; no secret was printed or persisted. |
| 2026-07-19 | Rollout runbook completion audit | Corrected stale final DB counts, made the load-bearing `20260719140658` migration mandatory in Stage A, added final gate/trigger/fingerprint readbacks, and documented the protected 14-case/200-iteration staging command plus external evidence retention. |
| 2026-07-19 | Current Supabase platform preflight | Official changelog review identified explicit Data API grants for new objects and newer PostgreSQL-major defaults as target-readback concerns. The runbook now records target engine/extensions/exposure settings and requires DB/RLS/concurrency gates on the actual target engine. |
| 2026-07-19 | Operational SQL audit | Executed the health and both 168-hour audit scripts on real local Postgres. The historical gates failed closed on missing buckets/current receipts while the live fingerprint stayed healthy. A final clean reset applied every migration in 126.9s; the repeated health check then reported zero for every database invariant and left log-only evidence explicitly pending review. |
| 2026-07-19 | Formal external-blocker audit | Third consecutive goal turn confirmed the same external dependency set. The checkout has 207 changed entries; every Phase 9 runner/model/manifest variable and every staging target/credential/approval variable is absent. No further local action can create the required user-owned clean commit, external provider authority, named target, protected identities, production approval, or elapsed 168-hour evidence. |
| 2026-07-20 | Runtime incident: room entry unavailable | User-provided logs showed every session registration returning 500. Read-only target proof confirmed the app points to linked `giuice's Project`, whose migration history stops at Phase 4: `register_presence_session_observed` and the company-scoped register function are absent. Runtime is still `legacy`, the unique open-log index is absent, and live data has one duplicate-open-log user plus three placement/log mismatches. The new client was therefore run before its database deployment/cutover; no remote mutation was performed. |
| 2026-07-20 | Authorized test-project recovery | After the user identified the linked project as test and authorized its update, retained private schema/data backups outside the repository, entered maintenance with cutover `f4e696fc-6ef1-460c-a0fb-2c60e1a4b122`, ran the reviewed open-log repair, and applied the six missing migrations through `20260720131318`. Direct readback confirmed all six history versions, the exact partial unique index, and the observed session/location RPCs. |
| 2026-07-20 | Atomic cutover and live recovery | Activated atomic mode at `2026-07-20T13:48:30.199952Z`, reconciled five stale placements, and scheduled `presence-reconcile-placement-v1` every minute as `postgres`. The remaining active legacy-browser placement was preserved until its bounded lease expired, then the scheduled reconciler cleared it. The final post-cutover database monitor reports zero for every database invariant, including the exact permanent index, duplicate/open-log mismatch, stale placement, capacity, revision, cross-company, and retention gates. |
| 2026-07-20 | Runtime proof and local gates | The already-open real application registered and renewed one Presence session after deployment, proving the former `/api/presence/sessions` 500 boundary recovered. Clean local migration reset, 14-file/115-test Presence DB lane, and the exact 14-case x 50-iteration concurrency gate all passed. Tests that temporarily remove the Phase 10 index now restore the migrated invariant. |
| 2026-07-20 | Mandatory post-cutover reviews | Supabase/RLS review found no blocker or risk in the corrective helper, owner/ACL boundary, RLS, Data API exposure, or unique index. Presence review prohibited the current destructive staging runner from the activated shared target, required fail-safe index restoration plus an explicit health check for the index, and kept target Realtime join/revocation evidence pending. Both follow-up reviews found no blocker for the current recovery after those corrections. No remote concurrency soak was executed. |

Concise learnings and errors:

- Exact request counts are insufficient: a 403/409 can satisfy a numeric budget. Evidence must also require success status and parse the response contract.
- A snapshot from an older lease generation cannot authorize rotation of a newly registered lease.
- An async registration can create server state after its React scope disappears; retire any lease ID returned by that stale success.
- Realtime ownership checks belong inside every event callback and after every awaited setup step.
- A manager reference without its room/user owner tuple can be a valid object but invalid authority.
- Running the Presence and full Vitest suites concurrently caused resource-contention timeouts. Sequential reruns passed cleanly and are the recorded result.
- A `SUBSCRIBED`-agnostic smoke can false-pass tenant isolation while the channel is degraded. Assert the live channel state before and after the operation under test.
- Supabase private Presence joins authorize synthetic `broadcast` and `presence` rows; Presence read alone is insufficient even when the client never broadcasts.
- Catalog-shape tests cannot prove a function body executes. Exercise security-definer helpers with realistic JWT claims and reproduce Realtime's transaction against real Postgres.
- A quiet window shorter than a scheduled reconciliation misattributes old-document work to reload. Test phase boundaries must cover the product's longest intentional bootstrap timer.
- One-shot session state must be claimed only when actionable work exists; otherwise an initially ineligible office can permanently lose same-session auto-placement.
- An empty occupant map is not a valid substitute for a failed initial authoritative snapshot. Without retained data, surface a blocking error and an explicit refetch action.
- A historical handoff can be removed from the current tree while still remaining the normative source referenced by phase specs. Audit Git history before treating an empty replacement file as authority.
- PostgreSQL `coalesce` is syntax, not a callable `pg_catalog.coalesce` function. Execute operational SQL against real Postgres even when it appears to be a read-only report.
- A same-target manual transition may return `LOCATION_UNCHANGED` while still incrementing the location version to supersede stale automatic work. Concurrency tests must assert both the stable result code set and the exact version delta.
- Database health and event counters have different authorities. Emit DB invariants from read-only SQL, mark log-only counters explicitly, and never convert missing log evidence into a synthetic zero.
- Client `private: true` scopes a channel request but does not prove the target project rejects public channels; the Realtime project setting and negative joins are separate rollout evidence.
- Realtime RLS is not a per-message revocation mechanism for an already-authorized socket. Test the held-open connection and make the accepted token/refresh bound explicit.
- Exact transition/session/Knock evidence must be captured inside the mutation transaction; reconstructing it later in a route is ambiguous and can mislabel replays or multi-session state.
- Raw stable UUID evidence is operationally sensitive even when credentials and direct identity fields are redacted; keep it out of the application repository.
- Failure-injection fixtures should roll back on the same connection. Best-effort cleanup can hide leaked evidence and contaminate later health gates.
- A reset can restart an upstream container with a new bridge IP while a gateway keeps stale DNS. Probe the public local health endpoint and refresh only the gateway before treating Auth creation failures as product regressions.
- Do not label a clock-sensitive read `STABLE` merely to share a snapshot. Keep its volatility truthful; for coherent enrichment, authorize first, lock only the authorized row, and re-read while the lock is held.
- Cross-company authority must include canonical placement and open-log-consistent corruption, not only active leases; legacy stale-placement tolerance is not a tenant-isolation waiver.
- A zero-byte current handoff should not force future agents to rediscover history. Preserve the immutable commit as authority and make the current path an explicit pointer, not a copied competing specification.
- The repository requests `rtk`, but this Windows environment has no `rtk` executable. The audit used `rg` after the wrapper failed with `CommandNotFoundException`; absence of a convenience wrapper is not a product gate.
- A linked-project readback is not automatically staging evidence. Confirm the target's name/authority and exact candidate migration set; a healthy pre-candidate catalog must remain classified as partial.
- Supabase CLI read-only commands may still write local telemetry metadata. The sandbox denied that profile write; rerunning with explicit filesystem approval changed no remote state and allowed the catalog preflight to proceed.
- Repeating a whole DB suite twice is not a concurrency soak. Each named race family needs an explicit case ID, real simultaneous transactions, an internal iteration count, and a fail-closed manifest proving 50×/200× coverage.
- Server-side Presence fencing and local credential/cache teardown are separate obligations. Sign-out must attempt both and clear local tenant state even when either network boundary fails.
- Ownership masking is not enough when ownership is `null`; async mutations require the same auth-generation fence as bootstrap so stale identity data is never committed.
- A PR job must never execute contributor-controlled dependency/application code with a reusable remote service-role key. Use a disposable local stack and per-run fixtures.
- Logout error handling needs deterministic precedence without sacrificing evidence: local credential-removal failure is primary, while the Presence fence failure remains attached as a cause in the aggregate.
- On Windows PowerShell, `npx.ps1` can be blocked by the execution policy even when Node dependencies are healthy. Invoke the checked-in `node_modules\\.bin\\*.cmd` shim for reproducible local verification.
- A generation check only after `await` prevents stale commits but not stale remote writes. Assert ownership again immediately before the first network/database side effect, especially during React's render-to-passive-effect account-switch window.
- Membership invalidation keeps the Auth UID but revokes company authority; retaining an old same-UID profile can therefore leak a stale `companyId` indefinitely on a transient reload failure.
- An internal database retry code is control flow, not a public API contract. Retry it at the server route with identical idempotency inputs, one bounded transaction per attempt, and expose only a sanitized exhaustion response.
- A SECURITY DEFINER function can be race-safe yet still create an existence oracle if it resolves the target before actor authorization and the route publishes distinct errors. Reject obviously unauthorized actors before service-role construction and collapse cross-tenant/missing target outcomes while keeping locked reauthorization in SQL.
- Provider delivery errors belong in correlated server logs, not invitation response envelopes. Public clients need only a stable opaque delivery status and the manual fallback link.
- Generated schema snapshots age immediately. Label historical dumps explicitly and use the ordered migration chain plus target catalog readback as the RLS/ACL authority.
- A diagnostic string replacement must be anchored to a complete SQL statement. Replacing the first textual occurrence can silently rewrite the same command inside a quoted catalog predicate and fabricate a health failure.
- `has_table_privilege` includes owner rights and cannot describe an explicit ACL by itself. Inspect `relacl`/`aclexplode` for exact grants and use role-specific negative checks for exposed callers.
- A test-name regex anchored at `^` sees the full Vitest name, including ancestor suites; tagged tests were all skipped until the anchor was removed. The runner must also pass one-worker/no-file-parallelism on the CLI, not rely only on config.
- PostgreSQL does not promise fairness between multiple tuple-lock waiters. A normative race must order the event with an observed blocking primitive, then release it, rather than infer winner order from request start time.
- A terminal process timeout is not a test failure but it invalidates the run. Repetition gates need an execution timeout long enough for the full fixed iteration count and must truncate partial evidence on restart.
- A transactional privilege fixture must restore the state it found, not assume the role lacked a preexisting membership. If `GRANT` occurs inside a rollback transaction, a later unconditional `REVOKE` is destructive cleanup, not cleanup.
- One collected test file is necessary but not sufficient evidence of isolation when imported suites mutate global roles/catalogs. Verify the database's global privilege tuple before and after the lane, and keep all repetition records under one explicit collection authority.
- A fail-closed E2E precondition that rejects at 0 ms is not a product regression, and a teardown timeout does not convert it into one. Read the Playwright error artifact, supply the explicit local-fixture/metrics contract, and count only the clean rerun.
- A rollout runbook must name the last corrective migration, not only the feature migration it amends. Omitting a late gate/fingerprint migration can make application and migration history look current while restoring an audited race.
- Local database green on one PostgreSQL major is necessary but not target parity. Record the real target engine, extension versions, Data API exposure setting, and explicit grants, then rerun the database/concurrency gates there.
- E2E fixtures can leave valid placements without live leases after the browser closes. Treat that as contaminated test state, require the health check to expose it, then reset the disposable database before recording the final baseline.
- A seven-day audit script is proven safer when it is executed before the window exists and returns `gate_pass = false`: missing buckets and current-day receipts must remain visible failures even when the live catalog fingerprint is healthy.
- A clean-commit/hash-bound semantic gate cannot be approximated from a dirty working tree: manufacturing a temporary commit or unapproved runner would defeat the evidence boundary it is meant to prove.
- Goal blocking should be evidence-backed, not inferred from inconvenience. Recheck the worktree, required environment names, target authority, and any newly available platform path before declaring the same impasse on its third consecutive turn.
- A passing local stack does not make a working-tree client compatible with an older linked database. Before a human opens the app, compare the client-required RPCs/runtime mode with the actual target and stop with a clear schema-outdated message instead of allowing repeated generic 500 retries.
- A test that deliberately removes a newly permanent invariant must restore it in teardown; otherwise a green suite can silently leave the shared local database unlike a clean migration reset.
- The Stage B ordering text conflicted with the write gate: `reconcile_stale_presence_placements()` is blocked in maintenance even though the runbook asks for stale placements to be zero before atomic activation. The safe executable order was repair open logs in maintenance, install/read back the index, activate atomically, then reconcile immediately; the runbook must be corrected before another target rollout.
- A failed post-push catalog-cache refresh is not proof that deployment failed or succeeded. Treat it as a CLI warning and read back migration history and critical catalog objects directly from the target before proceeding.
- Hourly audit evidence is first-observation-wins. A test must not expect a later healthy writer to overwrite an unhealthy row from the same hour; preserve the alert and investigate it.

Final verification:

- `npm run test:presence`: 60 files, 536 tests passed.
- `npm test`: 98 files, 1,017 tests passed.
- `npm run test:presence:db`: 14 files, 115 tests passed after the final clean reset and local gateway health recovery.
- `npm run test:presence:e2e`: 3/3 passed together in 2.1m on the final tree with real subscribed channels, admin/member/external isolation, bootstrap/reload/account-switch, exact movement, and bidirectional Knock.
- Focused audio lifecycle: 2 files, 5 tests passed.
- Type-check, production build (47 pages), movement gate, skill validation, and `git diff --check` passed.
- Lint: 0 errors, 529 historical warnings.
- Final operational baseline: a new clean reset applied the complete migration chain in 126.9s; `presence-health-check.sql` then reported zero for every database invariant. Both 168-hour audit scripts parsed and ran read-only, returning `gate_pass = false` as required without historical coverage.
- Remote-state note (supersedes the earlier preflight-only record): on 2026-07-20 the user identified the linked project as test and explicitly authorized its update. The six recorded migrations, repair, atomic activation, and reconciler job changed that test project; no production target was changed.

## 2026-07-20 — agent communication and skill remediation

Database state for this documentation change: no online database mutation.

Completed:

- Promoted the current atomic Presence architecture into the canonical .agents
  skill and added focused references.
- Replaced the .claude, .codex, and .pi copies with forwarding entries so hosts
  read one maintained source.
- Added a mandatory compatibility gate: the first progress update must say
  whether an online database change is required, name the target, and explain
  what breaks until it is applied.
- Added a human handoff that separates application, database, and deployment
  state and always says what the user needs to do next.
- Rewrote CLAUDE.md to remove model-specific delegation policy, the large RTK
  command catalog, stale skill listings, and duplicated Presence architecture.

Concise learnings and errors:

- The active skill still described the legacy /api/users/location,
  safeUpdateLocation, global channel, and unscoped local-storage design after
  the implementation had moved to leases, snapshots, a transition coordinator,
  and atomic RPCs.
- A local migration and a green local suite were reported without making the
  linked online database dependency understandable. Written locally, applied
  online, and deployed must never be collapsed into done.
- Internal evaluator vocabulary (runner, manifests, candidate models, judge)
  belongs in technical evidence, not as the headline of a user handoff.
- Multiple physical skill copies drift silently. Forwarding entries plus
  validation are safer than manually synchronizing four long documents.
- Independent forward-test caught an inaccurate claim that the legacy route was
  non-mutating. It is now documented as a gated legacy writer that must not be
  called or extended.
- The same review found that generic session failures still retry indefinitely
  at a capped delay. This runtime gap is recorded as active and was not falsely
  presented as fixed by a documentation-only change.

Verification: promoted and archived-draft validators pass, the movement gate
passes, diff integrity passes, and the fresh-agent compatibility scenario
produced the required plain-language database warning and handoff.

## Verification record

- WP7 admin runtime: `auth-flow.spec.ts` passed; correlated initial+reload bootstrap passed in 1.9m; per-phase route budgets 1/1/1/1, proxy `/floor-plan` 1, refreshed 0; sanitized log secret audit 0 matches; owned port 3100 closed after run.

To be populated with exact commands and results as each work package closes.

- WP1-WP3: `vitest` focused — 44 passed; presence smoke — 57 passed, 3 todo; `npm.cmd run type-check` — pass.
- WP4: `vitest` focused — 10 files, 56 passed; `npm.cmd run type-check` — pass; scoped ESLint — pass; `git diff --check` — pass.
- WP5: focused + presence guards — 48 passed, 3 existing todo; `npm.cmd run type-check` — pass; scoped ESLint — 0 errors; `git diff --check` — pass.
- WP6: focused — 10 files, 59 passed; `npm.cmd run type-check` — pass; both `.mjs` syntax checks — pass; Playwright Presence list/compile — 1 test discovered; scoped ESLint — 0 errors; `git diff --check` — pass.
- WP7 local: exact `npm test` — 79 files, 838 passed, 6 skipped, 3 todo, 0 failed, 26.2s wall; unsafe files in local discovery — 0; `npm.cmd run type-check` — pass; scoped ESLint — pass; `git diff --check` — pass.
- Phase 6 current: `npm.cmd run type-check` — pass; `npm.cmd run presence:gate` — pass; scoped audit-fixture ESLint — pass; `git diff --check` — pass; disposable DB reset — blocked because Docker Desktop is stopped.
- Phase 6/7 review corrections: focused Vitest — 117 passed; membership/bootstrap subset — 64 passed; `npm.cmd run type-check` — pass; `npm.cmd run presence:gate` — pass; changed-file ESLint — zero errors; `git diff --check` — pass.
- Phase 8 local: `npm.cmd run test:presence` — 52 files/461 passed; terminating safe suite — 89 files/934 passed, 0 skipped, 0 TODO; `npm.cmd run lint` — 0 errors (530 historical warnings); type-check/build/movement gate/diff check — pass.
- Latest scope/invitation corrections: focused Vitest — 62 passed; type-check, movement gate, changed-file ESLint — pass. New real-Postgres races are compiled but not executed because Docker is stopped.
- Phase 9: `npm.cmd run presence:skill:validate` — pass; both Node scripts parse and changed-file ESLint passes; correct eval command refuses dirty checkout; `--trials 2` refuses before any runner use.
- Atomic profile compatibility: `users-update-route.test.ts` — 8/8 passed. Final full gates pending after the Phase 10 draft/review loop.
- Final local rerun: Presence manifest — 53 files/474 passed; terminating safe suite — 90 files/947 passed with zero skipped/TODO; type-check/build/movement gate/skill validation/diff check — pass; full lint — 0 errors and 522 historical warnings.
- Phase 10 DB additions: exact-ACL, RLS-drift, writer-boundary, and two-connection receipt-race regressions execute successfully on the disposable local database; remote rollout remains intentionally untouched.
- Final real-Postgres gate: full migration chain repeatedly reset from scratch; final focused Phase 6/7 suite 26/26 and complete Presence DB suite 11 files/92 tests pass, including table/policy RLS-drift rejection, writer ACL pinning, 50-iteration exit races, and adapter-disable receipt serialization.
- Focused browser corrections: coordinator + card + Knock + audio lifecycle suites pass 75 tests; type-check passes; scoped lint has zero errors.
- Local product smoke: `playwright ... operability-smoke.spec.ts --project=presence --workers=1` — 1/1 passed in 2.3m with three isolated browser identities and bidirectional Knock.
