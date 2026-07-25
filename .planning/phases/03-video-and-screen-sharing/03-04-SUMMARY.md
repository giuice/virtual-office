---
phase: 03-video-and-screen-sharing
plan: 04
subsystem: api
tags: [nextjs, supabase, screen-sharing, presence, zod]

requires:
  - phase: 03-02
    provides: "Locally proven atomic presenter lease, RPC, RLS, and concurrency contract"
  - phase: 03-09
    provides: "Verified screen-share claim, release, and active route scaffold"
provides:
  - "Authenticated claim, renew, release, and active HTTP lifecycle over the observed presenter lease RPCs"
  - "Strict retryability, compatibility, ownership, and public-response contracts"
  - "Bounded compensating release for exact legacy claim-success envelopes during mixed-version rollout"
  - "Adversarial four-route HTTP matrix without promoting mocks to database proof"
affects: [screen-share-provider, media-heartbeat, presentation-teardown]

tech-stack:
  added: []
  patterns:
    - "Server-verified Auth identity mapped to application user before service-role RPC execution"
    - "Strict Zod request/RPC/public schemas with terminal compatibility classification"
    - "Redacted structural route events containing no authority identifiers"
    - "Fail-safe compensation reuses the observed release RPC only after a strict committed-success proof"

key-files:
  created:
    - src/app/api/spaces/[id]/screen-share/renew/route.ts
  modified:
    - src/lib/webrtc/screen-share-contract.ts
    - src/app/api/spaces/[id]/screen-share/claim/route.ts
    - src/app/api/spaces/[id]/screen-share/release/route.ts
    - src/app/api/spaces/[id]/screen-share/active/route.ts
    - __tests__/api/screen-share-routes.test.ts
    - src/lib/webrtc/observed-screen-share-rpc.ts

key-decisions:
  - "Only RETRY_LOCK_SET-derived SERVICE_UNAVAILABLE and sanitized INTERNAL_ERROR are retryable; compatibility, ownership, membership, and stale-session outcomes are terminal."
  - "Release stopReason is strict observability metadata and is never forwarded to the authorization RPC."
  - "AUTH_SESSION_REVOKED maps to SESSION_INVALID while an unmapped app user maps to MEMBERSHIP_SCOPE_INVALID across all four routes."
  - "An exact legacy CLAIMED result without presenterName is compensated through release before returning 426; ambiguous envelopes never trigger cleanup."

patterns-established:
  - "Successful route responses are parsed from the committed observed RPC result before exposure."
  - "Correlation events allowlist operation, outcome, retryability, and optional stop reason only."

requirements-completed: [VID-01, VID-04]

coverage:
  - id: D1
    description: "Complete authenticated screen-share claim and active public contracts"
    requirement: VID-01
    verification:
      - kind: unit
        ref: "__tests__/api/screen-share-routes.test.ts"
        status: pass
      - kind: other
        ref: "npm run type-check"
        status: pass
    human_judgment: false
  - id: D2
    description: "Exact server-owned renewal and idempotent release HTTP contracts"
    requirement: VID-04
    verification:
      - kind: unit
        ref: "__tests__/api/screen-share-routes.test.ts"
        status: pass
      - kind: other
        ref: "npm run build"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-07-25
status: complete
---

# Phase 03 Plan 04: Authenticated Screen-Share Lease HTTP Lifecycle Summary

**Four authenticated Next.js routes now expose the locally proven presenter lease through strict, sanitized, identity-derived HTTP contracts with server-owned renewal and exact release fencing.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-25T12:08:41Z
- **Completed:** 2026-07-25T12:19:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Completed claim and active response classification with explicit retryability, terminal database incompatibility, canonical public share projection, and redacted correlation events.
- Added the authenticated renew route with exact auth-session, presence-session, space, and share fencing; client-selected expiry is rejected and a mismatched success result fails closed.
- Completed release with strict observational stop reasons, idempotent committed-result exposure, and no ability for the reason or request body to grant authority.
- Expanded the focused HTTP matrix to 107 passing cases covering authentication, invalid/mismatched inputs, presenter conflicts, renew/release ownership, expiry/stale scope, zero-row/malformed outcomes, compatibility, sanitization, retry bounds, strict response shapes, and mixed-version compensation.
- Closed the mixed-version rollout lease leak: a strict legacy committed claim is released through the existing observed RPC before the route preserves its terminal 426 response; ambiguous payloads never trigger compensation.

## Task Commits

1. **Task 1 RED: Require screen-share retry classification** - `2d130e8` (test)
2. **Task 1 GREEN: Classify screen-share route failures** - `fac32d1` (feat)
3. **Task 2 RED: Add failing lease lifecycle routes** - `70d7c43` (test)
4. **Task 2 GREEN: Complete screen-share lease lifecycle** - `b0b5931` (feat)
5. **Final security correction: Preserve verified auth failure semantics** - `8b5f75a` (fix)
6. **Presence review RED: Expose mixed-version claim lease leak** - `7009dc8` (test)
7. **Presence review GREEN: Compensate incompatible legacy claims** - `da65f17` (fix)

## Files Created/Modified

- `src/app/api/spaces/[id]/screen-share/renew/route.ts` - Exact owner/session/share-scoped heartbeat route with server-owned expiry.
- `src/lib/webrtc/screen-share-contract.ts` - Strict renew, release reason, RPC, public response, and retryability schemas.
- `src/app/api/spaces/[id]/screen-share/claim/route.ts` - Typed verified-auth mapping and sanitized structural correlation.
- `src/app/api/spaces/[id]/screen-share/release/route.ts` - Idempotent exact-scope release with observational stop reason.
- `src/app/api/spaces/[id]/screen-share/active/route.ts` - Authorized canonical reconciliation with typed failures.
- `__tests__/api/screen-share-routes.test.ts` - Complete mocked four-route HTTP contract matrix.
- `src/lib/webrtc/observed-screen-share-rpc.ts` - Retains malformed server values for server-only strict compatibility classification.

## Decisions Made

- Automatic retry is limited to the database's strict bounded lock-set escape; database incompatibility, stale ownership, revoked sessions, and membership failures never masquerade as generic retryable failures.
- Renew returns only the committed `shareId` and server-owned `expiresAt`; it does not expose revisions, auth sessions, presence sessions, SQL detail, or provider detail.
- The existing observed RPC boundary remains the sole writer. No check-then-write route logic, second lease writer, service-role authorization bypass, or client-selected company/presenter authority was introduced.
- Migration `20260723224547` remains mandatory before application rollout. Compensation is fail-safe cleanup for a known old success envelope, not a synthesized compatibility path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Applied retryability to release during Task 1**
- **Found during:** Task 1
- **Issue:** A strict shared public error schema would leave release emitting an incompatible shape until Task 2.
- **Fix:** Applied the same sanitized retryability contract to the existing release route while preserving its RPC behavior.
- **Files modified:** `src/app/api/spaces/[id]/screen-share/release/route.ts`
- **Verification:** Focused route matrix and type-check passed.
- **Committed in:** `fac32d1`

**2. [Rule 1 - Bug] Preserved verified authentication failure semantics**
- **Found during:** Final security review
- **Issue:** All `requireVerifiedPresenceAuth` failures were labeled `UNAUTHORIZED` even when the verified auth session was revoked or no mapped application user existed.
- **Fix:** Mapped revoked sessions to `SESSION_INVALID` (409), missing app-user mappings to `MEMBERSHIP_SCOPE_INVALID` (403), and token failures to `UNAUTHORIZED` (401) across all four routes.
- **Files modified:** Four route handlers, shared contract, and focused tests.
- **Verification:** 101/101 focused tests, type-check, focused ESLint, build, and Presence gates passed.
- **Committed in:** `8b5f75a`

**3. [Rule 1 - Bug] Compensated the mixed-version legacy claim lease**
- **Found during:** Formal Presence Safety review after plan completion
- **Issue:** Migration `20260723104902` can commit a 30-second lease and return `CLAIMED` without `presenterName`; the new route returned 426 after mutation and temporarily caused false `PRESENTER_BUSY`.
- **Fix:** Strictly recognize only the exact legacy committed-success envelope with the requested share fence, invoke one bounded observed release using verified server identity/session plus exact presence/space/share fences, then preserve the original terminal 426 regardless of cleanup outcome.
- **Files modified:** Claim route, observed RPC helper, shared contract, and focused route tests.
- **Verification:** 107/107 focused tests, type-check, focused ESLint, build, Presence movement gate, and Presence skill validation passed.
- **Committed in:** `7009dc8` (RED), `da65f17` (GREEN)

---

**Total deviations:** 3 auto-fixed (1 missing critical consistency fix, 2 correctness/security bugs).
**Impact on plan:** All changes close correctness/security gaps within the planned HTTP boundary; database schema and RPC authority remain unchanged.

## TDD Gate Compliance

- Task 1 has a failing RED commit (`2d130e8`) followed by GREEN (`fac32d1`).
- Task 2 has a failing RED commit (`70d7c43`) followed by GREEN (`b0b5931`).
- The mixed-version Presence finding has a failing RED commit (`7009dc8`) followed by GREEN (`da65f17`).

## Verification

- `npm test -- __tests__/api/screen-share-routes.test.ts`: 107/107 passed.
- `npm run type-check`: passed.
- Focused ESLint for all six plan-owned TypeScript files: passed.
- `npm run build`: passed; all four screen-share routes are dynamic server routes.
- `npm run presence:gate`: passed.
- `npm run presence:skill:validate`: passed.
- `supabase migration list --local`: both screen-share migrations `20260723104902` and `20260723224547` present; no mismatch found.
- Stub/skip scan and `git diff --check`: passed.

## Database and Deployment State

- **Written locally:** Application routes, shared HTTP contracts, and focused mocked route tests.
- **Applied to local database:** No new change. The already-running disposable local Supabase retained both previously applied screen-share migrations.
- **Applied to an online database:** No online database was linked, queried, mutated, or migrated.
- **Application deployed:** No.
- **Database proof boundary:** HTTP mocks prove route wiring only; real lease/RLS/concurrency proof remains the independent green 03-02 evidence.
- **Mixed-version rollout:** The old RPC is fail-safe cleaned up when its exact committed-success envelope is observed, but it is still incompatible. Apply and read back `20260723224547` on the named target before deploying this application.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Provider heartbeat can call the exact renew route and teardown can call idempotent release without gaining authority from client metadata.
- Online rollout remains a separate authorized operation: apply/read back both screen-share migrations on the named target first, smoke-test the RPC contract, and only then deploy the application.

## Self-Check: PASSED

- All six plan-owned implementation/test files and this summary exist.
- Commits `2d130e8`, `fac32d1`, `70d7c43`, `b0b5931`, `8b5f75a`, `7009dc8`, and `da65f17` exist in repository history.
- Summary declares `status: complete`; no plan-owned stubs or skipped tests remain.

---
*Phase: 03-video-and-screen-sharing*
*Completed: 2026-07-25*
