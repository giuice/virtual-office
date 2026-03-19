---
phase: 02-floor-plan-completion
verified: 2026-03-19T12:19:16Z
status: human_needed
score: 4/4 must-haves satisfied, 3 human checks pending
human_verification:
  - test: "Crash or tab-kill offline cleanup timing"
    expected: "Avatar fades for about 3 seconds and is gone from the card within 5 seconds total."
    why_human: "Supabase Presence leave timing and browser unload behavior cannot be proven statically."
  - test: "First-login placement"
    expected: "A new user with no `vo-first-login-done` marker lands in the configured company default space, or the first active workspace if none is configured."
    why_human: "Requires a real authenticated browser session plus localStorage state."
  - test: "Grace-period reconnection"
    expected: "Reloading within 5 minutes rejoins the last space; after 5 minutes the user falls back to home/default/workspace placement."
    why_human: "Depends on persisted localStorage timestamps plus live API responses."
---

# Phase 02: Floor Plan Completion Verification Report

**Phase Goal:** Users experience a complete spatial floor plan with access control, automatic presence cleanup, and smart space assignment.
**Verified:** 2026-03-19T12:19:16Z
**Status:** human_needed
**Re-verification:** Yes — after plan `02-04`
**Status Note:** Pending user confirmation

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | User can knock on a restricted space and receive approval or denial from an occupant in real-time | ✓ VERIFIED | `src/app/api/spaces/knock/request/route.ts` and `src/app/api/spaces/knock/respond/route.ts` remain the approval source, while `src/app/api/users/location/route.ts:87-118,138-180,183-268,303-366` now authenticates with `auth.getUser()`, resolves the app user through `findBySupabaseUid`, enforces private-space authorization, records `authorized_by`, and consumes approved knock rows. Route coverage in `__tests__/api/users-location-route.test.ts:202-287` exercises unauthenticated, mismatch, denied, approved, grace-rejoin, and knock-consumption cases. |
| 2 | When a user goes offline, their avatar disappears from the space display within 5 seconds with a fade-out animation | ✓ VERIFIED | `src/components/floor-plan/modern/AvatarGroup.tsx` still handles the 3-second fade path, `src/hooks/useUserPresence.ts` still triggers unload/presence cleanup, and `src/app/api/users/location/route.ts:48-85,347-379` preserves the presence-log/offline update flow. Human timing confirmation is still required in a live browser. |
| 3 | First-time users land in their company default space; admin can configure default space assignments | ✓ VERIFIED | `src/components/dashboard/company-settings.tsx:236-337` provides the admin default/home-space controls, and `src/hooks/useLastSpace.ts:39-103,129-133` resolves first-time placement through company default or workspace fallback. |
| 4 | User who reconnects within 5 minutes automatically rejoins their last occupied space | ✓ VERIFIED | `src/hooks/useLastSpace.ts:9-18,105-133,161-218` keeps the grace-window rules in one resolver, and `__tests__/reconnection-grace.test.tsx:111-144` now asserts `grace-rejoin`, expiry fallback, and standard placement behavior directly. |

**Score:** 4/4 truths satisfied in code and automated checks

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/app/api/users/location/route.ts` | Authenticated, server-authorized location updates for restricted spaces | ✓ VERIFIED | Contains `auth.getUser()`, `findBySupabaseUid(authData.user.id)`, `SPACE_ACCESS_DENIED`, `authorized_by`, and approved-knock deletion (`:87-118,138-180,183-268,303-366`). |
| `__tests__/api/users-location-route.test.ts` | Route-level auth and restricted-space regression coverage | ✓ VERIFIED | Exercises the exact `02-04` cases from unauthorized through grace rejoin (`:196-287`). |
| `__tests__/reconnection-grace.test.tsx` | Executable 5-minute grace-window coverage | ✓ VERIFIED | No longer todo-only; asserts grace rejoin, expired fallback, and no-timestamp placement (`:103-144`). |
| `src/components/dashboard/company-settings.tsx` | Admin UI for company default and per-user home space assignment | ✓ VERIFIED | Default-space and home-space selectors remain wired in the Spaces tab (`:236-337`). |
| `src/hooks/useLastSpace.ts` | Shared placement resolver and grace-window client flow | ✓ VERIFIED | Exports the resolver and applies it to reconnect placement (`:9-18,105-133,167-218`). |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `useKnockSignaling.ts` | `/api/spaces/knock/request` | Knock request creation | WIRED | Existing Phase 2 knock workflow still writes approved/denied request rows. |
| `/api/spaces/knock/respond` | `/api/users/location` | Approved knock authorizes restricted entry | WIRED | `src/app/api/users/location/route.ts:138-158,252-257,358-366` reads approved rows, records `authorized_by`, then deletes the consumed approval. |
| `useLastSpace.ts` | `/api/users/location` | 5-minute grace rejoin through the same location endpoint | WIRED | `src/hooks/useLastSpace.ts:105-133,193-204` resolves grace rejoin and sends the location update through the hardened route. |
| `company-settings.tsx` | `useLastSpace.ts` | Default/home space settings affect login placement | WIRED | `src/components/dashboard/company-settings.tsx:236-337` writes the settings that `src/hooks/useLastSpace.ts:39-103` reads. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `FLOR-01` | `02-00`, `02-01`, `02-04` | Restricted-space access requires realtime approval and is enforced at the server boundary | ✓ SATISFIED | Knock request/response APIs plus `src/app/api/users/location/route.ts:87-118,138-180,183-268,303-366`; regression coverage in `__tests__/api/users-location-route.test.ts:202-287`. |
| `FLOR-02` | `02-00`, `02-02` | Offline users fade out and are removed quickly with presence cleanup | ✓ SATISFIED | Existing offline cleanup path remains in place; live timing still needs human confirmation. |
| `FLOR-03` | `02-00`, `02-03` | Admin can assign default spaces and first-time users land predictably | ✓ SATISFIED | `src/components/dashboard/company-settings.tsx:236-337`; `src/hooks/useLastSpace.ts:39-103`. |
| `FLOR-04` | `02-00`, `02-03`, `02-04` | Reconnect within 5 minutes rejoins the prior space; later reconnects fall back correctly | ✓ SATISFIED | `src/hooks/useLastSpace.ts:105-133`; `__tests__/reconnection-grace.test.tsx:111-144`; private-space rejoin path also covered at the route level in `__tests__/api/users-location-route.test.ts:261-287`. |

Orphaned requirements: none.

### Automated Checks

- `npx vitest run __tests__/api/users-location-route.test.ts __tests__/reconnection-grace.test.tsx` — passed
- `npm run type-check` — passed

### Residual Risks

- `__tests__/knock-banner.test.tsx`, `__tests__/knock-auto-join.test.tsx`, `__tests__/default-space-assignment.test.tsx`, and `__tests__/company-settings-default-space.test.tsx` are still scaffold-heavy and leave parts of the Phase 02 UX unasserted.
- Live browser timing for presence fade-out and the authenticated placement flows still needs human confirmation.

## Human Verification Required

### 1. Crash Cleanup Timing

**Test:** Open two sessions, place one user in a space, then hard-close the tab or kill the browser process.
**Expected:** The avatar begins the offline fade promptly and disappears from the space within 5 seconds.
**Why human:** Presence leave timing and unload behavior are browser/runtime dependent.

### 2. First-Time Placement

**Test:** Use a user with no `vo-first-login-done` localStorage key and no current space, then load the floor plan.
**Expected:** The user lands in the configured company default space, or the first active workspace if no default is set.
**Why human:** Requires a real authenticated session plus localStorage state.

### 3. Grace Rejoin Expiry

**Test:** Leave a space, reload within 5 minutes, then repeat after waiting longer than 5 minutes.
**Expected:** Within 5 minutes the user rejoins the prior space; after expiry they follow the home/default/workspace fallback chain.
**Why human:** Needs real time passing, persisted browser state, and live route responses.

## Verification Summary

Phase 02’s server-side access-control gap is now closed: the location route authenticates the caller, validates private-space access using approved knocks or recent occupancy, records the approver in `space_presence_log`, and consumes approvals after use. The targeted automated checks for the new route boundary and reconnection logic pass, and the compile surface is clean.

The remaining work is human verification, not a code gap. Offline fade timing, first-login placement, and live grace-rejoin behavior still need browser validation before anyone should treat the phase as fully confirmed.

---

_Verified: 2026-03-19T12:19:16Z_  
_Verifier: Codex inline re-verification after stalled verifier agent_  
_Status: Pending user confirmation_
