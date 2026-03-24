# Quick Task 260324-k7r: Fix Enter-Space — Summary

**Date:** 2026-03-24
**Status:** Pending user confirmation

---

## Root Cause Analysis

Three interlocking bugs prevented entering spaces from working:

### Bug 1: Double updateLocation call
`ModernFloorPlan.handleEnterSpace` called `await updateLocation(spaceId)`, then on success called `onSpaceSelect` → `FloorPlan.handleSpaceSelect` → `FloorPlan.handleEnterSpace` → `updateLocation(spaceId)` AGAIN. The second call was mostly deduplicated by a ref guard in useUserPresence, but it added unnecessary complexity and could race in edge cases.

### Bug 2: useLastSpace effect hijacking manual clicks
`saveLastSpace(spaceId)` (called from FloorPlan.handleEnterSpace) updated `lastSpaceId` in localStorage, which triggered the `useLastSpace` auto-placement effect. The effect called `getReconnectionContext()` which — outside a grace period — returns the HOME or DEFAULT space, NOT the user's clicked space. If the `lastUpdateRef` guard didn't match (which happens when home ≠ default, or on remount), the effect would call `updateUserLocation(homeSpaceId)`, overwriting the manual click. This caused the "fade-back" behavior: avatar appears briefly, then snaps back.

### Bug 3: Stale currentUserProfile.currentSpaceId
`CompanyContext.currentUserProfile` is loaded once at page init and never updated when the presence API changes the user's space. The `useLastSpace` effect uses this stale value for its guards, causing incorrect decisions about whether the user is "already in a space."

## What Was Fixed

### 1. Added `manualChangeRef` guard to useLastSpace (useLastSpace.ts)
- New ref `manualChangeRef` — set to `true` by `saveLastSpace()` before updating localStorage
- Auto-placement effect checks this ref at the very top — if `true`, skips and resets
- This prevents the effect from ever overwriting a manual space click

### 2. Simplified FloorPlan.handleSpaceSelect (floor-plan.tsx)
- `handleSpaceSelect` now calls `saveLastSpace(space.id)` directly instead of `handleEnterSpace`
- Removed `FloorPlan.handleEnterSpace` function entirely (was the source of the duplicate `updateLocation` call)
- Removed unused `updateLocation` from `usePresence()` destructuring

### Files Changed
| File | Change |
|------|--------|
| `src/hooks/useLastSpace.ts` | Added `manualChangeRef`, updated `saveLastSpace` and effect |
| `src/components/floor-plan/floor-plan.tsx` | Simplified `handleSpaceSelect`, removed `handleEnterSpace` |

## New Click Flow (clean)
1. User clicks space card → `ModernFloorPlan.handleEnterSpace(spaceId)`
2. Validates (capacity, access, status) → `await updateLocation(spaceId)` → **one API call**
3. On success → `onSpaceSelect(space)` = `FloorPlan.handleSpaceSelect`
4. Sets UI state (`selectedSpace`, `highlightedSpaceId`) + `saveLastSpace(space.id)`
5. `saveLastSpace` sets `manualChangeRef = true` → updates localStorage
6. `useLastSpace` effect fires → sees `manualChangeRef = true` → **skips** → resets ref

## Verification Checklist
- [x] `manualChangeRef` guard present in useLastSpace effect
- [x] `saveLastSpace` sets `manualChangeRef.current = true`
- [x] `FloorPlan.handleEnterSpace` removed (no duplicate updateLocation)
- [x] TypeScript compiles without errors
- [ ] **Manual test:** Click space → avatar stays (pending user confirmation)
- [ ] **Manual test:** Refresh → still in clicked space (pending user confirmation)
- [ ] **Manual test:** Auto-placement works on fresh login (pending user confirmation)
