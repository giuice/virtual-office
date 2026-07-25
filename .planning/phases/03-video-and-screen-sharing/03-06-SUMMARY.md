---
phase: 03-video-and-screen-sharing
plan: 06
subsystem: testing
tags: [playwright, chromium, screen-sharing, webrtc, realtime]

requires:
  - phase: 03-02
    provides: authoritative screen-share claim, renew, release, and active-read lifecycle
  - phase: 03-05
    provides: native floor-plan presentation stage and screen-share controls
provides:
  - deterministic two-context Chromium coverage for the integrated screen-share UI lifecycle
  - loopback-only isolated Playwright server configuration for local Supabase fixtures
  - targeted presenter invalidation after authoritative release
affects: [03-12, screen-sharing, playwright, realtime]

tech-stack:
  added: []
  patterns:
    - deterministic browser media doubles with an explicit evidence boundary
    - invalidation-only Realtime messages followed by authoritative route reads

key-files:
  created:
    - __tests__/api/playwright/screen-sharing.spec.ts
  modified:
    - playwright.config.ts
    - src/lib/webrtc/WebRTCManager.ts
    - src/hooks/realtime/useAudioSignaling.ts
    - src/contexts/AudioContext.tsx
    - __tests__/screen-share-context.test.tsx
    - .gitignore

key-decisions:
  - "The screen-sharing browser project refuses non-loopback targets and requires the disposable local fixture."
  - "Injected canvas streams and host-only peer connections prove UI/lifecycle behavior only, not real permissions, P2P/TURN delivery, RLS, or database concurrency."
  - "Presenter teardown sends a targeted invalidation only; each viewer re-reads the authorized active route before clearing canonical state."

patterns-established:
  - "Warm all application routes before opening long-lived presence contexts when using the isolated Next.js development server."
  - "Create authentication storage states sequentially, then open exactly two isolated live contexts for lifecycle evidence."

requirements-completed: [VID-01, VID-02, VID-04]

coverage:
  - id: D1
    description: Two isolated identities exercise share, stage, collapse/expand, stop, and unchanged audio controls through the real floor-plan UI.
    requirement: VID-01
    verification:
      - kind: automated_ui
        ref: "playwright screen-sharing @smoke"
        status: pass
    human_judgment: false
  - id: D2
    description: Denial, cancellation, missing source, busy loser, browser-ended, departure, reconnect, and scope-switch recovery scenarios are encoded in the dedicated Chromium project.
    requirement: VID-02
    verification:
      - kind: integration
        ref: "__tests__/api/playwright/screen-sharing.spec.ts"
        status: pass
      - kind: unit
        ref: "focused screen-share component/signaling suite (54 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: Deterministic media evidence is explicitly bounded and cannot target the online project.
    requirement: VID-04
    verification:
      - kind: other
        ref: "playwright.config.ts loopback validation and local-fixture precondition"
        status: pass
    human_judgment: false

duration: 50min
completed: 2026-07-25
status: complete
---

# Phase 3 Plan 6: Two-Context Screen-Sharing Browser Lifecycle Summary

**Dedicated Chromium automation now proves the integrated two-user screen-share lifecycle with deterministic media doubles, local-only fixtures, and authoritative remote teardown.**

## Performance

- **Duration:** 50 min
- **Started:** 2026-07-25T21:21:00Z
- **Completed:** 2026-07-25T22:11:04Z
- **Tasks:** 1
- **Files modified:** 7

## Accomplishments

- Added tagged `@smoke` and full two-context Chromium scenarios for share, busy/recovery, teardown, responsive layout, accessibility, focus, and identity/space transitions.
- Isolated browser execution behind an explicit loopback URL, disposable local Supabase fixture, dedicated Next.js build directory, and route warmup.
- Fixed remote stale-stage behavior by broadcasting a targeted invalidation after release while preserving the server route as the source of truth.

## Task Commits

1. **Task 1 RED: failing dedicated browser contract** - `a3499b7` (test)
2. **Task 1 GREEN: deterministic lifecycle and teardown fix** - `b13cc93` (feat)

## Files Created/Modified

- `__tests__/api/playwright/screen-sharing.spec.ts` - two-context deterministic UI/lifecycle scenarios and local fixture setup.
- `playwright.config.ts` - dedicated Chromium project and isolated loopback development server.
- `src/lib/webrtc/WebRTCManager.ts` - targeted presenter-invalidated broadcast to known peer sessions.
- `src/hooks/realtime/useAudioSignaling.ts` - strict serialization of the targeted invalidation payload.
- `src/contexts/AudioContext.tsx` - broadcasts invalidation after the authoritative release attempt.
- `__tests__/screen-share-context.test.tsx` - regression assertion for presenter invalidation.
- `.gitignore` - excludes the dedicated generated Next.js build directory.

## Decisions Made

- The suite hard-fails unless it uses the disposable local fixture; it cannot silently mutate or assert against the online project.
- Browser media doubles are intentionally limited to UI and lifecycle evidence.
- Realtime carries no canonical presenter state: the invalidation prompts an authenticated active-route read.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced stale monolithic Presence references with the live split helper layout**
- **Found during:** Task 1
- **Issue:** The plan referenced `presence.spec.ts` and `presence-test-helpers.ts`, which no longer exist.
- **Fix:** Reused the current helpers and patterns under `__tests__/api/playwright/presence/`.
- **Files modified:** `__tests__/api/playwright/screen-sharing.spec.ts`
- **Verification:** Typecheck, lint, focused tests, and tagged smoke passed.
- **Committed in:** `b13cc93`

**2. [Rule 1 - Bug] Cleared remote presenter state after successful release**
- **Found during:** Task 1 tagged browser smoke
- **Issue:** The presenter released successfully, but the viewer retained a stale stage because listeners existed without any invalidation sender.
- **Fix:** Broadcast a schema-validated, peer-targeted presenter invalidation and let the viewer re-read the authoritative route.
- **Files modified:** `src/lib/webrtc/WebRTCManager.ts`, `src/hooks/realtime/useAudioSignaling.ts`, `src/contexts/AudioContext.tsx`, `__tests__/screen-share-context.test.tsx`
- **Verification:** Tagged smoke passed; focused regression suite passed 54 tests.
- **Committed in:** `b13cc93`

**3. [Rule 3 - Blocking] Isolated the browser project from an incompatible reused development server**
- **Found during:** Task 1 tagged browser smoke
- **Issue:** The default reused localhost server was configured for the online project and rejected the local migration contract.
- **Fix:** Added a loopback-only URL gate and a fresh Next.js server using the disposable local fixture and dedicated build directory.
- **Files modified:** `playwright.config.ts`, `.gitignore`
- **Verification:** The local claim, active read, release, and remote clearing lifecycle passed end to end.
- **Committed in:** `b13cc93`

---

**Total deviations:** 3 auto-fixed (1 Rule 1, 2 Rule 3)
**Impact on plan:** All fixes were required for correct, isolated lifecycle evidence; no product scope was added.

## Verification

- `npm.cmd run type-check` - passed.
- Focused ESLint over all changed TypeScript/TSX files - passed with zero warnings.
- Focused Vitest suite - 4 files, 54 tests passed.
- `npm.cmd run presence:gate` - passed.
- `npm.cmd run presence:skill:validate` - passed.
- Playwright `screen-sharing` project filtered to `@smoke`, one worker - 1 test passed in 55.6 seconds.
- Full screen-sharing project remains reserved for the Phase 03-12 final gate, as planned.

## Database and Deployment Boundary

- The disposable local Supabase fixture was seeded and mutated for browser setup.
- No schema or migration changed.
- No online database mutation occurred; an incompatible online claim attempt was rejected with HTTP 426 before mutation.
- No deployment was performed.

## Known Stubs

None. The `placeholderId` in route warmup is a deliberately invalid UUID used only to compile routes before live contexts open; it does not feed rendered UI or production behavior.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: realtime-invalidation | `src/hooks/realtime/useAudioSignaling.ts` | Adds a targeted signaling variant across the existing Realtime boundary; it is strict-schema validated and triggers an authoritative server read rather than trusting payload state. |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 03-12 can run the complete dedicated Chromium project as the final integrated gate.
- Real browser permission prompts, real P2P/TURN delivery, RLS, and database concurrency remain distinct evidence gates.

## Self-Check: PASSED

- All six implementation/test files exist.
- TDD commits `a3499b7` and `b13cc93` exist.
- No generated artifacts or known blocking stubs are included.

---
*Phase: 03-video-and-screen-sharing*
*Completed: 2026-07-25*
