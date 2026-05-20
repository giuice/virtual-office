---
phase: 01-stabilization
plan: 02
subsystem: auth, ui
tags: [auth, knock-sound, audio, redirect, inline-errors, login, signup, oauth]

# Dependency graph
requires:
  - "01-01: Clean codebase free of deprecated avatar components"
provides:
  - "Realistic knock sound via Audio API instead of oscillator synthesis"
  - "Auth login redirect to /floor-plan (with company) or /onboarding (without)"
  - "OAuth callback redirect to /floor-plan instead of /dashboard"
  - "Inline-only auth error display (zero toast notifications)"
affects: [02-floor-plan, auth]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Audio API playback via new Audio() for sound effects instead of AudioContext oscillator synthesis"
    - "Inline-only error display on auth pages using formError state + role=alert div"

key-files:
  created:
    - "public/sounds/knock.mp3"
  modified:
    - "src/components/floor-plan/modern/ModernFloorPlan.tsx"
    - "src/app/(auth)/login/page.tsx"
    - "src/app/(auth)/signup/page.tsx"
    - "src/app/api/auth/callback/route.ts"

key-decisions:
  - "Used WAV data in .mp3 file for knock sound (browsers detect actual format from headers, Audio API handles both)"
  - "Login page redirect checks company context: /floor-plan if company exists, /onboarding otherwise"
  - "Removed all toast notifications from login and signup, replaced with inline state-driven feedback"
  - "Signup Google OAuth redirect handled entirely by callback route (no client-side router.push needed)"

patterns-established:
  - "Auth error display: Use setFormError() for inline errors with role=alert div, never toast notifications"
  - "Sound effects: Use new Audio('/sounds/filename.mp3') with volume and catch for autoplay policy"

requirements-completed: [STAB-03, STAB-02]

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 1 Plan 02: Knock Sound Fix & Auth Flow Stabilization Summary

**Realistic triple-tap knock sound via Audio API replacing oscillator synthesis, auth redirects to /floor-plan with company-aware routing, and inline-only error display on login/signup**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T21:28:25Z
- **Completed:** 2026-02-24T21:33:25Z
- **Tasks:** 3 of 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- Replaced AudioContext oscillator synthesis with realistic triple-tap knock sound file via `new Audio('/sounds/knock.mp3')`
- Removed audioContextRef, warmUpAudioContext, and onClickCapture pre-warm handler from ModernFloorPlan
- Verified knock timeout flow: 30-second timeout correctly clears activeKnockRequestIdRef, shows warning toast, resets to idle
- Login page redirects to /floor-plan (with company) or /onboarding (without company)
- OAuth callback route redirects to /floor-plan instead of /dashboard for users with company
- Removed all showError/showSuccess toast notifications from login and signup pages
- Added inline resend email status feedback on login page
- `npm run build` passes with zero errors
- Human verification completed: login/signup redirects, Google OAuth redirect, and knock sound/timeout all confirmed working

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace knock sound with realistic audio file** - `141fb4b` (fix)
2. **Task 2: Fix auth redirects and switch to inline-only errors** - `44a5885` (fix)
3. **Task 3: Human verification checkpoint** - Completed by user confirmation

**Plan metadata:** finalized after human verification

## Files Created/Modified
- `public/sounds/knock.mp3` - CREATED: Realistic triple-tap wooden door knock sound (WAV data, ~26KB)
- `src/components/floor-plan/modern/ModernFloorPlan.tsx` - Replaced AudioContext oscillator with new Audio(), removed warmUpAudioContext
- `src/app/(auth)/login/page.tsx` - Redirect to /floor-plan with company check, removed all toast notifications
- `src/app/(auth)/signup/page.tsx` - Removed all toast notifications, removed unused router/useNotification imports
- `src/app/api/auth/callback/route.ts` - Changed redirect from /dashboard to /floor-plan for users with company

## Decisions Made
- Used WAV audio data saved as .mp3 extension -- browsers detect the actual format from file headers, and the Audio API handles both formats transparently
- Login redirect uses company context check (`company ? '/floor-plan' : '/onboarding'`) so users without a company still go to onboarding
- Removed `useRouter` and `router.push('/onboarding')` from signup page because Google OAuth redirect is handled entirely by the callback route (browser navigates away)
- Kept the `createSupabaseBrowserClient` import on login page for the email resend functionality, but replaced toast feedback with inline `resendStatus` state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed unused router import from signup page**
- **Found during:** Task 2 (signup page cleanup)
- **Issue:** After removing `router.push('/onboarding')` from Google OAuth handler, `router` and `useRouter` became unused imports
- **Fix:** Removed `useRouter` import and `const router = useRouter()` declaration
- **Files modified:** src/app/(auth)/signup/page.tsx
- **Verification:** `npm run build` passes with no warnings
- **Committed in:** 44a5885 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking unused import)
**Impact on plan:** Cleanup of unused import after planned change. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Knock sound and auth flows are implemented and human-verified
- Phase 01 Stabilization is complete
- Ready for downstream phases that depend on stabilized auth, floor plan sizing, knock sound, and avatar cleanup

## Self-Check: PASSED

- Login/signup flows were human-verified and redirect correctly
- Google OAuth flow was human-verified and redirects correctly
- Knock sound plays and timeout expires correctly when nobody responds
- `npm run build` passed with zero errors during implementation

---
*Phase: 01-stabilization*
*Completed: 2026-05-17 after Task 3 human verification*
