---
phase: 03-video-and-screen-sharing
reviewed: 2026-07-28T12:21:43Z
depth: standard
files_reviewed: 35
files_reviewed_list:
  - .gitignore
  - __tests__/api/playwright/screen-sharing.spec.ts
  - __tests__/api/screen-share-routes.test.ts
  - __tests__/api/verified-presence-session.test.ts
  - __tests__/audio-context.test.tsx
  - __tests__/audio-signaling.test.tsx
  - __tests__/floor-plan-presentation-stage.test.tsx
  - __tests__/presence-db/presence-concurrency-contract.test.ts
  - __tests__/presence-db/screen-share-lease.test.ts
  - __tests__/presence-db/screen-share-realtime-policy.test.ts
  - __tests__/screen-share-context.test.tsx
  - __tests__/screen-share-tracer.test.tsx
  - __tests__/space-audio-controls.test.tsx
  - __tests__/webrtc-manager.test.ts
  - eslint.config.mjs
  - package.json
  - playwright.config.ts
  - src/app/api/spaces/[id]/screen-share/active/route.ts
  - src/app/api/spaces/[id]/screen-share/claim/route.ts
  - src/app/api/spaces/[id]/screen-share/release/route.ts
  - src/app/api/spaces/[id]/screen-share/renew/route.ts
  - src/components/floor-plan/floor-plan.tsx
  - src/components/floor-plan/FloorPlanPresentationStage.tsx
  - src/components/floor-plan/FloorPlanToolbar.tsx
  - src/components/floor-plan/modern/SpaceDetailPanel.tsx
  - src/components/floor-plan/ScreenShareControls.tsx
  - src/components/floor-plan/SpaceAudioControls.tsx
  - src/contexts/AudioContext.tsx
  - src/hooks/realtime/useAudioSignaling.ts
  - src/lib/presence/verified-session.ts
  - src/lib/webrtc/observed-screen-share-rpc.ts
  - src/lib/webrtc/screen-share-contract.ts
  - src/lib/webrtc/WebRTCManager.ts
  - supabase/migrations/20260723104902_screen_share_lease_and_media_realtime.sql
  - supabase/migrations/20260727123730_fix_presence_cutover_coverage_first_observation.sql
findings:
  critical: 2
  warning: 1
  info: 0
  total: 3
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-07-28T12:21:43Z
**Depth:** standard
**Files Reviewed:** 35
**Status:** issues_found

## Summary

The screen-share flow correctly derives application identity from the verified server session and keeps the service-role client server-only. However, its client reconciliation treats a presenter-profile data error as a terminal authorization failure for every viewer, and it can keep an expired local capture running when the authoritative lease disappears. These are user-visible media/privacy failures and block release.

## Critical Issues

### CR-01: An invalid remote presenter profile tears down every viewer's media session

**File:** `E:/projects/virtual-office/src/hooks/realtime/useAudioSignaling.ts:81-85,357`
**Issue:** `isTerminalAuthorizationResponse` returns true for every HTTP 409 and also explicitly includes `PRESENTER_PROFILE_INVALID`. The active-share RPC returns that code when the *presenter's* locked display name is invalid. A valid viewer then calls `retireForAuthorization()`, which invokes `onTerminalAuthorizationDenied`; the provider cleans up the viewer's WebRTC manager and audio channel. Thus one presenter's malformed/changed name disconnects all other occupants from room audio, even though their own JWT, company membership, and presence lease remain valid.

**Fix:** Parse the public error before deciding terminality. Retire the full media scope only for verified viewer-scope failures (`UNAUTHORIZED`, `ACCESS_DENIED`, `SESSION_INVALID`, `MEMBERSHIP_SCOPE_INVALID`, and an unavailable/missing current space). Treat `PRESENTER_PROFILE_INVALID` as an invalid active-share result: clear/reconcile the presentation state and stop only a matching local share, while retaining the viewer's audio manager and Realtime channel. Add a hook test where the active route returns this code for a remote presenter and assert that `onTerminalAuthorizationDenied` and `manager.cleanup()` are not called.

### CR-02: Lease expiry can leave a local display stream broadcasting after authority has been revoked

**File:** `E:/projects/virtual-office/src/contexts/AudioContext.tsx:681-705`
**Issue:** Once a local share is attached, the reconciliation effect stops it only when `signalingActiveShare` is non-null and does not exactly match the lifecycle. If the authoritative active RPC returns `null` (for example, a throttled/backgrounded tab misses the 30-second renewal deadline, or the lease is invalidated), the condition at line 685 is false and lines 697-698 preserve the local stream. Existing WebRTC peers can therefore continue receiving the capture until a delayed renewal timer eventually runs and fails. The database lease is supposed to be the authority, so this leaves screen content available after the authority has expired.

**Fix:** Preserve the initial pre-reconciliation window, but once an attached local lifecycle has observed canonical state, stop it when the canonical share becomes null or no longer exactly matches `{ companyId, spaceId, presenterUserId, shareId }`. For example, keep a per-lifecycle `hasObservedCanonicalShare` fence and call `stopScreenShare('error-cleanup')` on its subsequent null/mismatch transition. Add a deferred-timer test that expires/revokes the local lease, resolves the active read with `null`, and asserts that the display track is stopped and the manager removes its display sender.

## Warnings

### WR-01: Page teardown does not make the release request survivable

**File:** `E:/projects/virtual-office/src/contexts/AudioContext.tsx:392-400`
**Issue:** Release is sent with an ordinary `fetch`. During a page close, reload, or cross-origin navigation, browsers commonly cancel such requests; the catch then silently falls back to the 30-second lease timeout. Users can consequently remain shown as presenting after their capture has ended, and other clients retain the stale canonical state until expiry/reconciliation.

**Fix:** Send the small JSON release with `fetch(..., { keepalive: true })` where supported, or provide a same-origin beacon-compatible release path. Keep the lease TTL as the final fence, but add a pagehide/unload-oriented test confirming that the immediate release request is made with a transport that survives teardown.

---

_Reviewed: 2026-07-28T12:21:43Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
