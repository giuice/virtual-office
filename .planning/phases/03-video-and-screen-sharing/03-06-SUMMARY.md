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
  - room-wide invalidation after a verified authoritative release, including pre-handshake viewers
affects: [03-12, screen-sharing, playwright, realtime]

tech-stack:
  added: []
  patterns:
    - deterministic browser media doubles with an explicit evidence boundary
    - invalidation-only Realtime messages followed by authoritative route reads
    - same-user session generations distinguished by the complete presence-session and connection pair

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
  - "Presenter teardown sends one room-scoped invalidation only after a parsed successful release; exact canonical viewers re-read the authorized active route before clearing state."
  - "The invalidation-only path accepts a fully distinct same-user session generation, while mixed session/connection generations and generic same-user WebRTC signaling remain rejected."

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
        ref: "focused screen-share component/signaling suite (60 tests)"
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
- Fixed remote stale-stage behavior for all same-room canonical viewers, including viewers whose signaling handshake has not reached the presenter, while preserving the server route as the source of truth.
- Restricted invalidation to parsed successful release responses; failed, rejected, forbidden, and aborted release attempts never publish success invalidation.
- Reconciled a second live presence session for the presenter app identity without weakening offer, answer, ICE, or mixed-generation fencing.

## Task Commits

1. **Task 1 RED: failing dedicated browser contract** - `a3499b7` (test)
2. **Task 1 GREEN: deterministic lifecycle and teardown fix** - `b13cc93` (feat)
3. **Presence Safety correction: pre-handshake invalidation and success-only release** - `68723b8` (fix)
4. **Presence Safety correction: same-user multi-session reconciliation** - `9b2e210` (fix)

## Files Created/Modified

- `__tests__/api/playwright/screen-sharing.spec.ts` - two-context deterministic UI/lifecycle scenarios and local fixture setup.
- `playwright.config.ts` - dedicated Chromium project and isolated loopback development server.
- `src/lib/webrtc/screen-share-contract.ts` - strict room-scoped invalidation contract with no canonical state.
- `src/lib/webrtc/WebRTCManager.ts` - one private room invalidation independent of peer registration.
- `src/hooks/realtime/useAudioSignaling.ts` - exact canonical share/source/session fences and authoritative route reconciliation.
- `src/contexts/AudioContext.tsx` - broadcasts invalidation only after a parsed successful authoritative release.
- `__tests__/screen-share-context.test.tsx`, `__tests__/audio-signaling.test.tsx`, `__tests__/webrtc-manager.test.ts` - failed-release, pre-handshake, self-generation, and zero-peer regressions.
- `.gitignore` - excludes the dedicated generated Next.js build directory.

## Decisions Made

- The suite hard-fails unless it uses the disposable local fixture; it cannot silently mutate or assert against the online project.
- Browser media doubles are intentionally limited to UI and lifecycle evidence.
- Realtime carries no canonical presenter state: the invalidation prompts an authenticated active-route read.
- Room fanout is required because canonical active state may exist before any presenter-side peer registration; exact canonical share/source matching and private room authorization bound who may act on it.
- A same-user invalidation is eligible only when it is the exact self echo or both its presence session and connection differ from the receiver; a mixed pair is a stale generation and is rejected.

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

**4. [Rule 1 - Bug] Reached canonical viewers before presenter peer registration**
- **Found during:** Mandatory Presence Safety review
- **Issue:** Targeting only presenter-known peer connections omitted viewers that had already read canonical active state but had not completed signaling.
- **Fix:** Broadcast one invalidation on the private room channel, require an exact canonical share and presenter match, then re-read the authenticated active route. Self-delivery is additionally fenced by exact user, presence session, connection, company, and space.
- **Files modified:** `src/lib/webrtc/screen-share-contract.ts`, `src/lib/webrtc/WebRTCManager.ts`, `src/hooks/realtime/useAudioSignaling.ts`, related unit and Playwright tests
- **Verification:** Zero-peer unit coverage and the local browser smoke both prove teardown before presenter peer registration.
- **Committed in:** `68723b8`

**5. [Rule 1 - Bug] Suppressed invalidation for unsuccessful release attempts**
- **Found during:** Mandatory Presence Safety review
- **Issue:** A `finally` broadcast could advertise success after rejected, forbidden, failed, or aborted release requests.
- **Fix:** Parse the strict release response and broadcast only when HTTP and domain success both hold; local media cleanup remains best-effort.
- **Files modified:** `src/contexts/AudioContext.tsx`, `__tests__/screen-share-context.test.tsx`
- **Verification:** Table-driven 403, 500, and rejected-abort regressions assert zero invalidation.
- **Committed in:** `68723b8`

**6. [Rule 1 - Bug] Reconciled distinct same-user presence sessions**
- **Found during:** Second mandatory Presence Safety review
- **Issue:** Generic same-user rejection also discarded the presenter invalidation in another live tab for the same app user, leaving that tab's canonical presentation stage stale.
- **Fix:** Added an invalidation-only exception for a fully distinct presence-session/connection pair. Exact self echo remains supported for local canonical cleanup, mixed generations are rejected, and generic handshake/description/ICE same-user fencing is unchanged.
- **Files modified:** `src/hooks/realtime/useAudioSignaling.ts`, `__tests__/audio-signaling.test.tsx`, `__tests__/api/playwright/screen-sharing.spec.ts`
- **Verification:** Focused unit coverage proves exact self, mixed-generation rejection, foreign-scope rejection, and distinct same-user acceptance. The local browser scenario uses two live sessions for one identity and verifies A2 clears after A1 stops with unchanged placement flags and avatar counts.
- **Committed in:** `9b2e210`

---

**Total deviations:** 6 auto-fixed (4 Rule 1, 2 Rule 3)
**Impact on plan:** All fixes were required for correct, isolated lifecycle evidence; no product scope was added.

## Verification

- `npm.cmd run type-check` - passed.
- Focused ESLint over all changed TypeScript/TSX files - passed with zero warnings.
- Focused Vitest suite - 4 files, 60 tests passed.
- `npm.cmd run presence:gate` - passed.
- `npm.cmd run presence:skill:validate` - passed.
- Playwright `screen-sharing` project filtered to `@smoke`, one worker - 1 test passed in 37.2 seconds; outbound viewer signaling was held and presenter peer count remained zero through stop.
- Playwright `screen-sharing` project filtered to `@same-identity`, one worker - 1 test passed in 38.4 seconds; two live sessions shared one app identity, A2 cleared after A1 stopped, and placement/avatar evidence was unchanged.
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
| threat_flag: realtime-invalidation | `src/hooks/realtime/useAudioSignaling.ts` | Adds a private room invalidation across the existing Realtime boundary; it carries no canonical state, requires exact canonical identity/share and complete session-generation fences, and triggers an authoritative server read. Generic offer/answer/ICE fencing is unchanged. |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 03-12 can run the complete dedicated Chromium project as the final integrated gate.
- Real browser permission prompts, real P2P/TURN delivery, RLS, and database concurrency remain distinct evidence gates.

## Self-Check: PASSED

- All eight correction implementation/test files exist.
- TDD commits `a3499b7` and `b13cc93`, plus correction commits `68723b8` and `9b2e210`, exist.
- No generated artifacts or known blocking stubs are included.

---
*Phase: 03-video-and-screen-sharing*
*Completed: 2026-07-25*
