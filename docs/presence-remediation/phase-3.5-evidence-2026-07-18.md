# Phase 3.5 evidence — authenticated bootstrap stabilization

Date: 2026-07-18  
Branch baseline: `staging` at `685d388`  
Status: Pending user confirmation

## Scope

This artifact records implementation and verification of WP1-WP7 from `phase-3.5-stabilization-plan.md`. It distinguishes local automated proof from gates that require linked-environment credentials, runtime access, or user confirmation.

## Implemented work packages

| Package | Evidence-backed result |
|---|---|
| WP1 | Credential-bearing auth-state logging removed; AST credential-log guard passes. |
| WP2 | Static proxy matcher excludes `/api`, `/api/**`, and public file assets; legacy HS256 project intentionally keeps page-only `getUser()` fallback. |
| WP3 | In-flight-only profile sync dedupe, auth-generation guard, stale-response suppression, and A→B account isolation are implemented. |
| WP4 | Client/server error contract split, structural Supabase error logging, correlation IDs, status-based 429 classification, safe scoped route envelopes, and client `ApiError` parsing are implemented. |
| WP5 | Typed bootstrap errors retain confirmed state only for same-UID 429/5xx/network failures; 401 and non-transient 4xx tear down identity. Floor plan exposes retryable/sign-in/full/retained-data states. |
| WP6 | Dev-only structured auth validation events, strict redaction, sanitized collection, and deterministic Playwright bootstrap budgets are implemented. |
| WP7 | Safe full local suite and correlated admin cold-login/reload gates are green and terminating. The final local browser matrix also covers member, account switch, three-identity tenant isolation, movement, and bidirectional Knock. |

## Automated verification completed

| Gate | Result |
|---|---|
| WP1-WP3 focused | 44 passed |
| Presence smoke before WP4-WP6 | 57 passed, 3 pre-existing TODOs |
| WP4 focused | 56 passed |
| WP4 compatibility review sweep | 100 passed, 3 pre-existing TODOs |
| WP5 focused + mandatory presence guards | 48 passed, 3 pre-existing TODOs |
| WP6 focused | 59 passed |
| TypeScript | Passed after WP4, WP5, and WP6 |
| Scoped ESLint | Zero errors for WP4-WP6 scopes |
| Playwright Presence discovery/compile | One bootstrap spec discovered; no browser or service started |
| Diff integrity | `git diff --check` passed after each package |
| Safe full local Vitest | Final Phase-5 working tree: 85 files, 904 passed, 6 skipped visual placeholders, 3 superseded TODOs, zero failures; 40.1s wall time. |
| Test classification guard | 79 local files; zero remote DB, Presence DB, or Playwright files in `npm test` |
| Presence safety review | WP5 network-fallback blocker corrected; bounded re-review found no remaining actionable issue |
| WP4/WP6 adversarial reviews | No remaining actionable findings after corrections |
| Admin password smoke | Passed; floor-plan spaces visible with no console/request failures |
| Correlated admin cold login + reload | Passed in 1.9m; exact bootstrap budgets and clean shutdown |

## Security and privacy properties verified

- HTTP error responses never expose Supabase `details` or `hint`; those fields remain in redacted server logs only.
- Auth 429 detection keys on HTTP status, not error-message text.
- Auth metric logs contain only validated machine fields; unsafe pathname/code values are redacted or omitted.
- The metrics collector persists only strict allowlisted `auth_validation` events, never general dev-server output.
- Production remains dormant even if `VO_AUTH_METRICS=1` is accidentally configured.
- API routes do not pass through the page proxy; bootstrap routes perform one authoritative in-route Auth validation.
- Transient bootstrap failures preserve the unchanged presence identity; 401 tears it down.
- Public assets never enter the page Auth proxy. Strict Mode login navigation produces one protected-page validation, not duplicate `/floor-plan` validations.

## Empirical admin bootstrap budgets

| Phase | sync-profile | companies/get | users/by-company | spaces | `/floor-plan` proxy | refreshes | 401/429/5xx/rate-limit |
|---|---:|---:|---:|---:|---:|---:|---:|
| Cold admin | 1 | 1 | 1 | 1 | 1 | 0 | 0 |
| Reload | 1 | 1 | 1 | 1 | 1 | 0 | 0 |

The persisted sanitized NDJSON contained zero matches for token markers, JWT prefixes, bearer values, service-role markers, or email addresses. Reload may cancel only the previous page's heartbeat/disconnect/knock-poll requests with `net::ERR_ABORTED`; bootstrap request failures remain fatal.

## Runtime and external gates pending

- [ ] Confirm historical admin-session revocation.
- [ ] Confirm historical contaminated-log deletion/scrub.
- [ ] Capture the exact rate-limited Supabase Auth endpoint, Auth error code, and refresh behavior through a sanitized reproduction or Auth platform logs.
- [ ] Provision `AUTH_E2E_MEMBER_EMAIL` and `AUTH_E2E_MEMBER_PASSWORD` for a distinct staging member.
- [x] Install the pinned Playwright Chromium runtime (Chromium 1223 / Chrome for Testing 148.0.7778.96).
- [x] Run `VO_AUTH_METRICS=1` admin bootstrap stability E2E and record empirical route/proxy/refresh budgets.
- [x] Run member and A→logout→B browser drills; 401/500/expired-JWT boundaries are covered locally by focused route/context tests rather than remote browser fault injection.
- [x] Prove Presence health from authoritative snapshot contracts and exact current-user cardinality, not merely `SUBSCRIBED`.
- [x] Run disposable local cross-company private-Realtime isolation/denial coverage.
- [x] Re-run shared admin/member rooms, avatars, movement, Knock approve/deny, and Enter/Knock independence smoke after Phase 3.5.
- [x] Read back the currently linked migration history and a catalog/Cron preflight without mutation. It is a healthy pre-candidate target through Phase 4, not the final-schema staging readback.
- [x] Obtain a terminating safe full local Vitest result.
- [ ] Obtain final explicit user confirmation.

### Linked preflight readback — 2026-07-19

The pinned Supabase CLI 2.109.1 performed read-only history and catalog queries against the already linked project. The project is `ACTIVE_HEALTHY` in `sa-east-1`, but its generic name does not establish staging/production authority. Remote Presence history ends at `20260716175515`; local migrations `20260718203921`, `20260718204506`, `20260718210827`, and `20260719115759` are absent. Broader pre-Presence drift remains four remote-only and nine local-only versions.

The catalog reports PostgreSQL 15.8; `presence_maintenance_owner` exists with `NOLOGIN`, `NOINHERIT`, and `NOBYPASSRLS`; pg_cron is installed; the three Phase 2/4 Presence jobs are active as `postgres` with their exact constant wrapper calls; `users` and `spaces` are in `supabase_realtime`; and `realtime.messages` has RLS. The seven `_observed` wrappers read back as zero because their migration is not applied. This evidence is a current preflight only. Stage A must apply/read back the complete candidate on a named, approved staging target before any observed endpoint deploys.

## Remediation-wide local closure

The final Presence manifest passed 60 files/509 tests; the safe full suite passed 97 files/983 tests; the local Presence database suite passed 13 files/108 tests after the final clean reset; and the shared local browser matrix passed 3/3 specs in 2.2m on the final tree. The explicit same-user concurrency soak passed at 200 iterations. Type-check, the 47-page production build, movement gate, skill validation, atomic-mode read-only health SQL (all database zero-gates passed), diff integrity, and lint (0 errors/512 historical warnings) are green.

Browser budgets now require both exact cardinality and successful response contracts. Session registration, placement, snapshots, and atomic logout must be 2xx and return the expected JSON shape, so authorization or conflict responses cannot satisfy a numeric-only budget.

The final audio lifecycle is room/user owned. A room transition exposes no old manager, resets mute/enabled/speaking/peer state, removes the old channel, and ignores every late callback from the retired manager. The transition regression begins with room A enabled/unmuted and a speaking peer, then proves room B receives no stale state or callback effects.

The browser matrix now requires the private company channel to be truly `subscribed` before it accepts tenant-isolation evidence. Runtime database tests call the private company helper under authenticated JWT claims and reproduce Supabase Realtime's synthetic Broadcast+Presence authorization transaction. These caught an invalid `pg_catalog.coalesce` call and the missing narrow Broadcast SELECT policy that catalog-only checks and the earlier degraded-channel smoke missed.

Snapshot invalidations are coalesced during subscribe/reconnect, an exact in-flight snapshot promise is awaited rather than canceled before post-transition reconciliation, and the bootstrap evidence window spans the deliberate two-second post-subscribe reconcile. The final shared run completed initial login, reload, account switch, tenant isolation, movement, and bidirectional Knock without snapshot aborts or cross-company invalidations.

The final RLS regressions fail closed for another company topic and absent, malformed, or revoked session IDs; they prove own-topic Presence INSERT, denied Broadcast INSERT, and the same fence behavior for Knock. The exact set of `realtime.messages` policies is pinned so a later permissive policy cannot hide outside a name-filtered catalog assertion.

Transaction-authoritative observability is now part of the database contract: exact previous/result location versions and authorization mode, active unfenced-session counts, and Knock versions/revisions are returned only to service-role wrappers. Missing or pre-authorization Knock results are not enriched and internal fields are removed from HTTP bodies. Status enrichment keeps the clock-sensitive core truthfully `VOLATILE`, authorizes before locking, then re-reads status while holding a share lock on the own-request row so state and revisions cannot mix generations.

The health artifact fails closed for a missing/duplicate runtime singleton and for cross-company canonical placement, open-log-consistent placement, active lease, space, requester, Knock, or responder authority. Its fault matrix runs in rollback-only transactions. Expired live Knock detection has an explicit two-minute grace beyond the one-minute expiry worker schedule, preventing healthy between-tick rows from aborting rollout.

Auto-placement no longer consumes its per-session claim before an eligible space exists, so maintenance-to-active recovery works without reload and still performs exactly one transition. A failed cold Presence snapshot can no longer masquerade as a valid empty office: without retained users the floor plan is blocked by an explicit live-presence error and authoritative retry.

The mandatory Presence re-review reported no actionable findings. All implementation and destructive database verification remained local: no staging/production migration, adapter cutover, session revocation, contaminated-log deletion, or maintenance-window action was performed.

## Known harness/residual items

- The historical full suite included `messaging/pin_star_integration.test.ts`, which loaded `.env.local` and mutated the linked project. It now runs only through an explicit remote config/flag with dedicated credentials and corrected cleanup.
- The movement gate now uses a pure-Node traversal and verifies one atomic transport owner with no legacy client location calls on Windows.
- Automatic placement accepts only `active`/`available`; scoped last-space state is advisory and never recreates a null server placement.
- The Playwright account-menu selector uses `button:has(img)` because the existing trigger has no accessible name; this is testability/accessibility debt.
- Metrics E2E uses its own port, webpack dist directory, tsconfig, and teardown sentinel so it can coexist with a developer server and terminate reliably on Windows.

Status: Pending user confirmation
