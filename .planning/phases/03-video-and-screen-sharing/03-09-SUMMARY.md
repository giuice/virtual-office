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
    - authorize through observed lease RPCs before narrowly enriching canonical presenter display data
key-files:
  created:
    - src/lib/webrtc/screen-share-contract.ts
    - src/app/api/spaces/[spaceId]/screen-share/claim/route.ts
    - src/app/api/spaces/[spaceId]/screen-share/release/route.ts
    - src/app/api/spaces/[spaceId]/screen-share/active/route.ts
    - __tests__/api/screen-share-routes.test.ts
  modified:
    - package.json
    - package-lock.json
key-decisions:
  - Preserve the 03-08 RPC as lease authority; routes do not accept client-selected presenter or company fields.
  - Revalidate the authenticated Auth subject before each privileged observed RPC because the shared verified-Presence result exposes only the application ID and Auth session fence.
  - Enrich canonical presenter names only after the authorized RPC and scope the lookup to the verified company.
  - Treat companyless verified identities and known RPC contract incompatibilities as terminal typed public errors before callers can retry generic failures.
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
- Added 21 focused mocked HTTP-boundary tests for parsing, identity derivation, busy/stale outcomes, null/active reconciliation, and error sanitization. These tests do not claim RLS, concurrency, Realtime delivery, or P2P media proof.

## Safety Remediation

- Claim, release, and active now reject a verified no-company identity with terminal `MEMBERSHIP_SCOPE_INVALID` (403) before user lookups or RPC calls, including a stale membership-switch response.
- A reusable strict RPC classifier maps missing-function, signature/schema-cache, and insufficient-EXECUTE codes (`PGRST202`, `PGRST203`, `42883`, `42501`) to terminal `DATABASE_CONTRACT_INCOMPATIBLE` (426) responses across all routes.
- The compatibility response has one sanitized public message; focused table-driven tests prove raw provider messages, hints, details, and codes are absent. Unknown provider failures remain sanitized `INTERNAL_ERROR`.
- Remediation commit: `1d160ba` — `fix(03-09): classify screen-share compatibility failures`.

## Task Commits

1. **Task 1: Define pinned validated screen-share contracts**
   - `4d3ef67` — `test(03-09): add failing screen-share contract tests`
   - `73c6682` — `feat(03-09): add strict screen-share contracts`
2. **Task 2: Wire verified claim, release, and active route boundaries**
   - `910efb1` — `test(03-09): add failing screen-share route tests`
   - `7c6577e` — `feat(03-09): add verified screen-share routes`

## Files Created/Modified

- `src/lib/webrtc/screen-share-contract.ts` — strict external contracts, canonical response filtering, and stable error mapping.
- `src/app/api/spaces/[spaceId]/screen-share/claim/route.ts` — verified presenter lease claim boundary.
- `src/app/api/spaces/[spaceId]/screen-share/release/route.ts` — exact-owner, idempotent release boundary.
- `src/app/api/spaces/[spaceId]/screen-share/active/route.ts` — authorized canonical active-share reconciliation read.
- `__tests__/api/screen-share-routes.test.ts` — focused mocked route-contract coverage.
- `package.json` and `package-lock.json` — direct, exact `zod@4.4.3` dependency and lockfile evidence.

## Decisions Made

- Used the already verified `requireVerifiedPresenceAuth` boundary and a fresh server `auth.getUser()` result as the RPC Auth subject; application IDs remain separate and are never substituted for Supabase UIDs.
- Kept lease authorization in the 03-08 observed RPC. The service-role user display-name lookup occurs only after that authorization and filters the verified company before producing the required public canonical response.

## Database and Deployment State

- **Application written locally:** contracts, routes, dependency pin, and focused tests are committed locally.
- **Local database:** this plan did not change migration history or database state; it consumes the existing locally applied/read-back 03-08 lease/RLS contract.
- **Online database:** no online target was queried or changed.
- **Deployment:** no deployment occurred.

## Verification

Passed:

- `npm ls zod --depth=0` — direct `zod@4.4.3` resolved.
- `npm test -- __tests__/api/screen-share-routes.test.ts` — 29 tests passed, including no-company/stale membership scope and table-driven RPC-contract incompatibility sanitization across claim, release, and active.
- `npm run type-check` — passed.
- `npx eslint` over all touched TypeScript files — passed.
- `npm run presence:gate` — passed.
- `git diff --check` — passed.

Build status (inconclusive):

- The isolated-worktree `npm run build` compiled the new screen-share routes and completed its TypeScript stage, but could not finish prerendering because ignored local Supabase environment values are not copied into isolated worktrees.
- This is inconclusive verification evidence, not a product or deferred issue; no screen-share route failure was reported.
- The orchestrator must rerun `npm run build` after merge in the primary checkout. No user action is required unless that primary-checkout rerun fails.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added safe canonical presenter-name enrichment after lease authorization.**
- **Found during:** Task 2
- **Issue:** The observed 03-08 active-share RPC returns presenter ID, share ID, and expiry but not the public `presenterName` required by the plan's canonical response.
- **Fix:** After an authorized observed RPC, routes read only `display_name` for the returned/verified presenter scoped to the verified company, then filter the response through the canonical public schema.
- **Files modified:** `src/app/api/spaces/[spaceId]/screen-share/claim/route.ts`, `src/app/api/spaces/[spaceId]/screen-share/active/route.ts`, `src/lib/webrtc/screen-share-contract.ts`
- **Verification:** Focused route tests verify canonical public output and absence of server session details.
- **Committed in:** `7c6577e`

**Total deviations:** 1 auto-fixed (Rule 2).

## Known Stubs

None.

## Next Phase Readiness

- Screen-share clients can now use strict claim/release/active contracts and validate scoped Realtime signaling before WebRTC use.
- Real local Postgres/RLS/concurrency proof remains owned by 03-08; browser media and private-channel delivery require their respective later integration tests.

## Self-Check: PASSED

- Confirmed all shared contract, route, and focused-test files exist.
- Confirmed TDD RED/GREEN commits `4d3ef67`, `73c6682`, `910efb1`, and `7c6577e` exist.
- Confirmed task commits contain no tracked-file deletions.
