# Testing

## Match evidence to the claim

- Pure derivation: table-driven unit tests for connection, occupancy,
  availability, malformed/boundary time, multiple sessions, exact-session
  revocation, and revision mismatches.
- Client ordering: deterministic deferred-promise tests for manual versus auto,
  same-target renewal, stale success, query coalescing, rotation, membership
  changes, logout, Strict Mode, and aborted renders.
- API contracts: authenticated identity derivation, strict bodies, sanitized
  errors, typed conflicts, zero-row failures, and no client-selected authority.
- Database: reset from committed migrations; real RLS/ACL/grants, FORCE RLS,
  security-definer ownership/config, lock ordering, after-wait revalidation,
  capacity races, idempotency, logout fences, session expiry, membership
  cleanup, audit immutability, and migration readback.
- Browser: two users, two tabs, account switch, refresh/blind window, degraded
  Realtime, separate auth sessions, remote membership removal, Knock
  request/approve/deny/entry, and exact avatar/occupancy behavior.
- Rollout: named environment, migration history, catalog readback, structured
  logs, rollback rehearsal, user smoke, and required observation artifacts.

Mocks can validate branching but cannot prove database authorization,
concurrency, browser isolation, or deployed state.

## Select checks by the affected layer

Combine applicable rows when a change crosses layers. Inspect the package
scripts and test configuration before running them; a local command name does
not prove that its target is disposable or that it has no production access.

| Change | Required evidence |
| --- | --- |
| Instructions or documentation only | Inspect the diff, metadata, links, host forwarding entries, and preserved invariants. Run `npm run presence:skill:validate` when the Presence skill changes. Exercise representative scenarios when authority, authorization, routing, or verification instructions change. Application suites are needed only if runtime files also change. |
| Pure derivation or client ordering | Run the affected tests through `npm run test:presence`, plus `npm run type-check`, lint for touched TypeScript, and `npm run presence:gate`. |
| API, RPC, schema, authorization, leases, or database locks | Run affected Presence/API tests, `npm run test:presence:db` against a disposable Postgres target, and `npm run presence:gate`. Add typecheck/lint for touched TypeScript and real concurrency cases for affected ordering, locking, capacity, or lifecycle behavior. |
| User-visible presence, movement, Realtime, or Knock workflow | Run the affected `npm run test:presence:e2e` scenarios with the distinct authenticated users/tabs needed to prove the workflow, plus the relevant client/API/database checks above. |
| Framework boundaries or production output | Run `npm run build` in addition to the affected-layer checks. |
| Deployment, live contract compatibility, or legacy cutover | Verify the named target's migrations/catalog and runtime behavior, following CLAUDE.md and the active-limitations reference. Local tests do not establish deployed readiness. |

Inspect the final diff and run `git diff --check` for every change. Select checks
before claiming completion, retain exact results, and rerun affected checks
after corrections. Broaden coverage when shared contracts change, a failure
reveals wider impact, or an unresolved risk warrants it; do not repeat a full
suite solely because another review pass finished.

The critical Presence suite must contain zero skipped or TODO tests. The DB
suite must run from a clean disposable reset and important concurrency cases run
repeatedly. Missing Docker/Postgres, browser identities, or target authorization
blocks the checks that require them. Record those checks as unverified and
continue independent work; do not silently skip or report them as passing.

## Review gates

After changing runtime behavior in Presence, Realtime, placement, Knock,
membership lifecycle, or a related migration/route:

1. Run the mandatory read-only Presence reviewer.
2. Run the Supabase/RLS reviewer for every database or service-role boundary.
3. Resolve blocker/risk findings with a correction or evidence, then request
   re-review of affected findings and paths.
4. Rerun checks affected by the corrections using the layer table above; retain
   zero-skip enforcement for the critical Presence suite. Real Postgres and
   browser gates remain required for behavior that depends on those layers.

For instruction-only changes, verify preserved contracts and scenario routing.
Use an independent read-only pass when changes to authority, authorization, or
verification rules warrant behavioral validation. Do not run application or
database review gates solely because a documentation file mentions Presence.

## Evidence reporting

Static validation proves document structure only. Scenario evaluation can help
test whether agents follow the skill, but it is internal quality evidence and
does not prove that the application or online database works.

Keep evaluator files, model comparisons, and raw runner output in the tracker.
In the human report, translate them to one sentence such as: “We tested whether
another agent follows the safety rules; this does not replace an application
smoke test.”

Never mark runtime completion from a phrase score, skipped critical scenarios,
a single green concurrency run, or mocked tests alone.
