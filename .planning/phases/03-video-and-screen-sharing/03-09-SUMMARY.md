---
phase: 03-video-and-screen-sharing
plan: 09
subsystem: api
tags: [nextjs, supabase, presence, webrtc, zod, screen-sharing]

requires:
  - phase: 03-video-and-screen-sharing
    plan: 08
    provides: locally applied authoritative screen-share lease RPCs and private media RLS contract
provides:
  - strict Zod validation for screen-share HTTP, RPC, and Realtime signaling boundaries
  - authenticated claim, release, and active screen-share API routes over observed lease RPCs
  - sanitized canonical presenter responses with stable conflict and error contracts
affects: [screen-share-client, realtime-signaling, floor-plan-stage]
tech-stack:
  added: [zod@4.4.3]
  patterns:
    - validate path, body, query, RPC result, and signaling payloads at each untrusted boundary
    - derive Auth subject, application user, company, and session fencing from verified server state
    - make the locked observed RPC the sole presenter-name authority for claim and active responses
    - retry only one exact strict RETRY_LOCK_SET result in a fresh PostgREST transaction
key-files:
  created:
    - src/lib/webrtc/screen-share-contract.ts
    - src/app/api/spaces/[spaceId]/screen-share/claim/route.ts
    - src/app/api/spaces/[spaceId]/screen-share/release/route.ts
    - src/app/api/spaces/[spaceId]/screen-share/active/route.ts
    - __tests__/api/screen-share-routes.test.ts
    - __tests__/api/verified-presence-session.test.ts
  modified:
    - src/lib/presence/verified-session.ts
    - package.json
    - package-lock.json
key-decisions:
  - Preserve observed RPCs as the lease and locked presenter-name authority; routes do not accept client-selected presenter or company fields.
  - Use the original verified Auth subject from the getUser-plus-claims boundary for observed RPCs; static companyId:null is pre-RPC MEMBERSHIP_SCOPE_INVALID (403), while a later locked membership/session change may return SESSION_INVALID (409).
  - Decode canonical presenterName only from claim/active RPC success and make malformed, missing, invalid, or extra fields terminal compatibility errors.
  - Retry exactly one fully strict RETRY_LOCK_SET structural result; provider errors and malformed payloads are never retried.
patterns-established:
  - Screen-share route results expose only canonical public fields and stable public error codes.
requirements-completed: [VID-01, VID-04]
coverage:
  - id: D1
    description: Strict screen-share contracts reject malformed authority and scoped signaling payloads.
    requirement: VID-01
    verification:
      - kind: unit
        ref: __tests__/api/screen-share-routes.test.ts#screen-share contract boundaries
        status: pass
    human_judgment: false
  - id: D2
    description: Authenticated claim, release, and active HTTP boundaries derive identity and sanitize lease results.
    requirement: VID-04
    verification:
      - kind: integration
        ref: __tests__/api/screen-share-routes.test.ts#screen-share routes (mocked HTTP boundary evidence only)
        status: pass
    human_judgment: false
metrics:
  duration: 25m
  completed: 2026-07-23
status: complete
---

# Phase 03 Plan 09: Validated Screen-share API Boundary Summary

**Strict Zod contracts and authenticated Next.js routes now fence screen-share lease RPCs while exposing only canonical presenter state.**

## Performance

- **Duration:** 25m
- **Completed:** 2026-07-23T16:47:29Z
- **Tasks:** 2/2
- **Application files modified:** 7

## Accomplishments

- Added the exact direct production dependency `zod@4.4.3` with an audited lockfile integrity entry and no lifecycle install scripts.
- Defined strict request, RPC, public-result, and scoped handshake/description/ICE/presenter signaling contracts that reject unknown authority fields.
- Added independently authenticated claim, release, and active routes that pass the verified Auth subject, application-session fence, and validated Presence session IDs to the local 03-08 observed RPC contract.
- Added focused mocked HTTP-boundary and verified-session coverage for parsing, identity derivation, display-name snapshot propagation, busy/stale outcomes, null/active reconciliation, RPC shape incompatibility, and error sanitization. These tests do not claim RLS, concurrency, Realtime delivery, or P2P media proof.

## Contract Correction (2026-07-23)

- The prior application-only correction was insufficient: validated identity `displayName` was an unlocked pre-RPC snapshot, and active used a service-role `users` lookup plus a second active RPC. The new local migration makes the locked observed RPC the sole authority for canonical presenter names.
- Claim locks and canonicalizes the current presenter name before any lease mutation; invalid names return only sanitized `PRESENTER_PROFILE_INVALID` (409), without a raw name or lease insert/update. Active returns the locked owner's canonical name in its one RPC result; routes never query `users` for presenter enrichment.
- The name invariant matches `String.prototype.trim()` whitespace (including the explicit Unicode code points) and validates 1–100 Unicode code points after canonicalization. The database rejects invalid values rather than truncating them.
- Claim, release, and active retry at most once only when the fully strict result is exactly `{ok:false,code:'RETRY_LOCK_SET'}`. A second structural result maps to sanitized `SERVICE_UNAVAILABLE` (503); malformed payloads and provider errors do not retry.
- A static verified `companyId:null` remains pre-RPC `MEMBERSHIP_SCOPE_INVALID` (403) with zero RPC. If company/session membership changes after that verified snapshot, locked SQL may correctly produce terminal `SESSION_INVALID` (409); this correction does not claim that every membership race is pre-RPC or 403.
- Strict decode failures, unknown result codes, and claim/active invariant mismatches use terminal sanitized `DATABASE_CONTRACT_INCOMPATIBLE` (426). Missing-function, signature/schema-cache, and insufficient-EXECUTE provider errors use the same sanitized contract; unknown provider failures remain generic sanitized `INTERNAL_ERROR` (500).
- Local Postgres migration/catalog and concurrency regressions prove the SQL contract; mocked route tests prove only HTTP boundary behavior. Online database state and deployment remain unchanged.


## Task Commits

1. **Task 1: Define pinned validated screen-share contracts**
   - `4d3ef67` — `test(03-09): add failing screen-share contract tests`
   - `73c6682` — `feat(03-09): add strict screen-share contracts`
2. **Task 2: Wire verified claim, release, and active route boundaries**
   - `910efb1` — `test(03-09): add failing screen-share route tests`
   - `7c6577e` — `feat(03-09): add verified screen-share routes`

## Files Created/Modified

- `src/lib/presence/verified-session.ts` — verified identity retains the original Auth subject alongside the application identity and canonical display name.
- `src/lib/webrtc/screen-share-contract.ts` — strict external contracts, per-operation RPC domains, canonical response filtering, and stable error mapping.
- `src/app/api/spaces/[spaceId]/screen-share/claim/route.ts` — validated presenter profile and verified-subject claim boundary.
- `src/app/api/spaces/[spaceId]/screen-share/release/route.ts` — exact-owner, idempotent release boundary using the original verified subject.
- `src/app/api/spaces/[spaceId]/screen-share/active/route.ts` — final-reauthorized canonical active-share reconciliation.
- `__tests__/api/screen-share-routes.test.ts` and `__tests__/api/verified-presence-session.test.ts` — focused route and verified-identity regression coverage.
- `package.json` and `package-lock.json` — direct, exact `zod@4.4.3` dependency and lockfile evidence.

## Decisions Made

- Used the original server-verified Auth subject from the `getUser()` and matching claims boundary for every observed RPC; application IDs remain separate and are never substituted for Supabase UIDs.
- Validated the claim profile before mutation and final-reauthorized active enrichment; the observed 03-08 RPC remains authority for membership, company, space, session, and lease authorization.

## Database and Deployment State

- **Application written locally:** contracts, routes, dependency pin, and focused tests are committed locally.
- **Local database:** this plan did not change migration history or database state; it consumes the existing locally applied/read-back 03-08 lease/RLS contract.
- **Online database:** no online target was queried or changed.
- **Deployment:** no deployment occurred.

## Verification

Passed:

- `npm ls zod --depth=0` — direct `zod@4.4.3` resolved.
- `npm test -- __tests__/api/screen-share-routes.test.ts __tests__/api/verified-presence-session.test.ts` — 55 focused tests passed, including invalid claimant profiles with zero mutation RPCs, no second route auth lookup, operation-specific result domains, membership races, and held-lookup final-reauthorization races.
- `npm run type-check` — passed.
- `npx eslint` over all touched TypeScript files — passed.
- `npm run presence:gate` — passed.
- `git diff --check` — passed.

Primary-checkout verification is pending:

- The orchestrator will add primary-checkout full-test and build evidence after merge. This worktree does not claim build evidence because ignored local environment values are unavailable here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Finalized safe presenter-profile handling and active enrichment.**
- **Found during:** Adversarial application-boundary remediation.
- **Issue:** Historical claim presenter lookup had been removed, but the claim profile still needed validation before mutation and active lookup data could be emitted from a stale authorization point.
- **Fix:** Reused one trimmed presenter-name schema before claim; active now final-reauthorizes after lookup, uses only final lease fields, and fails closed on changes. It also decodes strict operation-specific RPC code domains and maps raced `AUTH_INVALID` to membership scope invalid.
- **Files modified:** `src/lib/presence/verified-session.ts`, `src/lib/webrtc/screen-share-contract.ts`, and screen-share routes/tests.
- **Verification:** Focused route tests hold lookup/reauthorization ordering and prove invalid names, denial, ownership change, and sanitized compatibility contracts.
- **Committed in:** This remediation commit.

**Total deviations:** 1 auto-fixed (Rule 2).

## Known Stubs

None.

## Next Phase Readiness

- Screen-share clients can now use strict claim/release/active contracts and validate scoped Realtime signaling before WebRTC use.
- Real local Postgres/RLS/concurrency proof remains Wave 5 ownership in 03-02; browser media and private-channel delivery require their respective later integration tests.

## Self-Check: PASSED

- Confirmed all shared contract, route, and focused-test files exist.
- Confirmed TDD RED/GREEN commits `4d3ef67`, `73c6682`, `910efb1`, and `7c6577e` exist.
- Confirmed final application-boundary remediation commit `69695e1` exists.
- Confirmed task commits contain no tracked-file deletions.
