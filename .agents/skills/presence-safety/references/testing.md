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

## Required local commands

Run the subset appropriate to the change and retain exact results:

```text
npm run presence:gate
npm run test:presence
npm run test:presence:db
npm run test:presence:e2e
npm run type-check
npm run lint
npm run build
npm run presence:skill:validate
```

The critical Presence suite must contain zero skipped or TODO tests. The DB
suite must run from a clean disposable reset and important concurrency cases run
repeatedly. A missing Docker/Postgres runtime, browser identity, or staging
authority is a blocker, not a reason to skip.

## Review gates

After editing Presence, Realtime, placement, Knock, membership lifecycle, or a
related migration/route:

1. Run the mandatory read-only Presence reviewer.
2. Run the Supabase/RLS reviewer for every database or service-role boundary.
3. Resolve all blocker/risk findings and request re-review.
4. Run the full safe local suite, type-check, lint, build, movement gate, diff
   check, and zero-skip guard after the last correction.
5. Run real Postgres and browser gates when they are required; record blockers
   verbatim if prerequisites are unavailable.

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
