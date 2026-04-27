---
phase: 02-floor-plan-completion
verified: 2026-03-19T17:30:00Z
status: human_needed
score: 4/4 must-haves verified in code, 3 human checks pending
re_verification:
  previous_status: human_needed
  previous_score: 4/4 code verified, 3 human checks pending
  gaps_closed:
    - "False-offline mass transition during Realtime channel init (isPresenceReady gate added)"
    - "Away/busy users force-downgraded to offline by presenceAwareUsers (derivation fixed)"
    - "Peer clients permanently evicting users from spaces on network hiccup / tab switch (peer leave POST removed)"
    - "AvatarGroup fade timer not cancelled when user reconnects (clearTimeout guard added)"
    - "Admin Spaces tab returning HTML 404 on save (App Router route.ts created, old Pages Router file deleted)"
    - "Space dropdown showing only one space (filter broadened to active, available, in_use)"
    - "Name-only saves wiping settings JSONB column (undefined guard added in CompanyContext)"
    - "FloorPlan placement useEffect calling handleEnterSpace (UI-only) instead of delegating to useLastSpace (API path)"
    - "Grace rejoin to restricted space failing when beacon POST races ahead of rejoin PUT (last_active and open presence log fallbacks added)"
  gaps_remaining: []
  regressions:
    - "SpaceActionButtons knock button cooldown text shows 'Wait 42s' but tests expect 'Knock (42s)' -- pre-existing since commit 2acd511 (Feb 2026), not introduced by gap closure plans"
human_verification:
  - test: "Crash or tab-kill offline cleanup timing"
    expected: "Avatar begins the offline fade promptly and disappears from the space within 5 seconds; away/busy users remain fully visible."
    why_human: "Supabase Presence leave timing and browser unload behavior cannot be proven statically. isPresenceReady gating prevents false-offline during channel init, but actual timing of the 3-second CSS fade followed by DOM removal requires live browser observation."
  - test: "First-login placement"
    expected: "A new user with no vo-first-login-done localStorage marker and no current_space_id lands in the configured company default space, or the first active workspace if none is configured."
    why_human: "Requires a real authenticated browser session plus controlled localStorage state."
  - test: "Grace-period reconnection"
    expected: "Reloading within 5 minutes rejoins the last occupied space; after 5 minutes the user follows the home/default/workspace fallback chain. Restricted-space rejoin succeeds even when the beacon POST arrives after the rejoin PUT."
    why_human: "Needs real time passing, persisted browser state, live route responses, and race-condition timing that cannot be simulated in unit tests."
---

# Phase 02: Floor Plan Completion Verification Report

**Phase Goal:** Users experience a complete spatial floor plan with access control, automatic presence cleanup, and smart space assignment.
**Verified:** 2026-03-19T17:30:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure plans 02-05, 02-06, 02-07

## Summary

All automated evidence for the 4 phase must-haves is confirmed. The gap closure plans (02-05, 02-06, 02-07) addressed every issue identified during UAT. Nine specific bugs are now closed in code. Two pre-existing test failures in `SpaceActionButtons` are unrelated to phase 02 and pre-date the gap closure work. The only remaining work is live browser human verification of timing-dependent behaviors.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | User can knock on a restricted space and receive approval or denial from an occupant in real-time | VERIFIED | `src/app/api/users/location/route.ts` enforces restricted-space authorization via `enforceSpaceAuthorization`: checks approved knock rows, grace rejoin (primary: exited_at, secondary: last_active, tertiary: open presence log), cross-company guard, and admin bypass. `__tests__/api/users-location-route.test.ts` (11/11 passing) covers unauthenticated, mismatch, denied, approved, grace-rejoin, and knock-consumption cases. |
| 2 | When a user goes offline, their avatar disappears from the space display within 5 seconds with a fade-out animation | VERIFIED | `src/hooks/useUserPresence.ts`: `isPresenceReady` gate (line 151) prevents false-offline during channel init; away/busy statuses are never force-overridden; peer leave handler no longer POSTs cleanup for other users (comment at line 423-426). `src/components/floor-plan/modern/AvatarGroup.tsx`: reconnection-aware fade cancellation (lines 98-113) with `clearTimeout`; already-fading guard (line 121). Live timing still requires human confirmation. |
| 3 | First-time users land in their company default space; admin can configure default space assignments | VERIFIED | `src/components/dashboard/company-settings.tsx` line 50: filter broadened to `active, available, in_use`. `src/contexts/CompanyContext.tsx` lines 275-295: safe settings merge with `data.settings !== undefined` guard. `src/app/api/companies/update/route.ts`: proper App Router PATCH handler with `auth.getUser()`. `src/hooks/useLastSpace.ts`: resolves first-time placement through company default or workspace fallback. |
| 4 | User who reconnects within 5 minutes automatically rejoins their last occupied space | VERIFIED | `src/app/api/users/location/route.ts` lines 242-276: three-signal grace rejoin (exited_at, last_active, open presence log). `src/components/floor-plan/floor-plan.tsx` lines 263-282: placement useEffect is visual-only (calls `setSelectedSpace`, `setHighlightedSpaceId` only; does NOT call `handleEnterSpace` or any API). `useLastSpace` hook is the sole API caller for placement. `__tests__/reconnection-grace.test.tsx` passes. |

**Score:** 4/4 truths verified in code

---

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/app/api/users/location/route.ts` | Authenticated server-authorized location updates for restricted spaces, with race-resistant grace rejoin | VERIFIED | Contains `auth.getUser()`, `findBySupabaseUid`, `SPACE_ACCESS_DENIED`, `authorized_by`, knock deletion, `last_active` secondary grace check, open presence log tertiary check. |
| `src/hooks/useUserPresence.ts` | isPresenceReady gating, self-only cleanup, away/busy preservation | VERIFIED | `isPresenceReady` declared (line 35), set on first sync (line 396), gates offline derivation (line 151), exported (line 554). Peer leave POST block removed (comment at line 423). |
| `src/components/floor-plan/modern/AvatarGroup.tsx` | Reconnection-aware fade cancellation with clearTimeout | VERIFIED | Reconnection cancel block at lines 98-113 uses `clearTimeout`; already-fading guard at line 121. |
| `src/app/api/companies/update/route.ts` | App Router PATCH handler for company updates | VERIFIED | Exists as new file. Uses `createSupabaseServerClient`, `auth.getUser()`, `SupabaseCompanyRepository`. |
| `src/app/api/companies/update.ts` | Old Pages Router handler (should be DELETED) | VERIFIED DELETED | File no longer exists on disk. |
| `src/components/dashboard/company-settings.tsx` | Broadened space filter for dropdown | VERIFIED | Line 50: `space.status === 'active' || space.status === 'available' || space.status === 'in_use'`. |
| `src/contexts/CompanyContext.tsx` | Safe settings merge preventing JSONB wipe | VERIFIED | Lines 275-295: `data.settings !== undefined` guard in both `mergedData` and optimistic state update. |
| `src/components/floor-plan/floor-plan.tsx` | Visual-only placement useEffect delegating API calls to useLastSpace | VERIFIED | Lines 263-282: only calls `setSelectedSpace` and `setHighlightedSpaceId`. `handleEnterSpace` is called only from user-initiated `handleSpaceSelect` (line 127). |
| `__tests__/api/users-location-route.test.ts` | Route-level auth and restricted-space regression coverage | VERIFIED | 11 tests pass including last_active and open presence log grace paths added by plan 02-07. |
| `__tests__/reconnection-grace.test.tsx` | Executable 5-minute grace-window coverage | VERIFIED | Passes as part of the 11-test suite. |

---

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `useKnockSignaling.ts` | `/api/spaces/knock/request` | Knock request creation | WIRED | Existing Phase 2 knock workflow writes approved/denied request rows. |
| `/api/spaces/knock/respond` | `/api/users/location` | Approved knock authorizes restricted entry | WIRED | `enforceSpaceAuthorization` reads approved knock rows, records `authorized_by`, deletes consumed approval. |
| `useLastSpace.ts` | `/api/users/location` | 5-minute grace rejoin through the location endpoint | WIRED | `useLastSpace` is the sole API caller for placement; `floor-plan.tsx` placement useEffect is visual-only. |
| `company-settings.tsx` | `CompanyContext.tsx` | `updateCompanyDetails` call for space assignments | WIRED | `handleSaveSpaces` calls `updateCompanyDetails` with settings payload; CompanyContext merges safely with undefined guard. |
| `CompanyContext.tsx` | `/api/companies/update` | `updateCompany` fetch PATCH request | WIRED | `src/lib/api.ts` calls `fetch('/api/companies/update?id=...')` which now hits the App Router route.ts. |
| `floor-plan.tsx` | `useLastSpace.ts` | `getReconnectionContext` used for visual hydration | WIRED | Line 19: `import { getReconnectionContext, useLastSpace }` confirmed; line 271: used in placement useEffect. |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `FLOR-01` | 02-00, 02-01, 02-04 | Restricted-space access requires realtime approval and is enforced at the server boundary | SATISFIED | `enforceSpaceAuthorization` in `location/route.ts`; knock request/response APIs; `__tests__/api/users-location-route.test.ts` covers full authorization flow. |
| `FLOR-02` | 02-00, 02-02, 02-05 | Offline users fade out and are removed quickly with presence cleanup | SATISFIED | `isPresenceReady` gate prevents false-offline; away/busy preserved; peer leave POST removed; AvatarGroup fade cancelled on reconnect. Live timing needs human confirmation. |
| `FLOR-03` | 02-00, 02-03, 02-06 | Admin can assign default spaces and first-time users land predictably | SATISFIED | App Router PATCH handler working; broadened space filter; safe settings merge; `useLastSpace.ts` placement resolver. |
| `FLOR-04` | 02-00, 02-03, 02-04, 02-05, 02-07 | Reconnect within 5 minutes rejoins the prior space; later reconnects fall back correctly | SATISFIED | Three-signal grace rejoin in location route; visual-only FloorPlan placement; `__tests__/reconnection-grace.test.tsx` green. |

Orphaned requirements: none.

---

### Automated Checks

| Check | Result |
| --- | --- |
| `npx vitest run __tests__/api/users-location-route.test.ts __tests__/reconnection-grace.test.tsx` | 11/11 passed |
| `npm run type-check` | Passed (no errors) |
| Full test suite `npx vitest run __tests__/` | 523 passed, 2 pre-existing failures (SpaceActionButtons knock cooldown text), 6 skipped, 39 todo |

**Pre-existing test failures (not regressions):**
- `__tests__/components/floor-plan/modern/SpaceActionButtons.test.tsx` — 1 failure: expects "Knock (42s)" but renders "Wait 42s". Last changed in commit `2acd511` (Feb 2026), before any Phase 02 gap closure work.
- `__tests__/space-detail-hover-panel.test.tsx` — 1 failure: cannot find knock button by role. Same root cause; same pre-existing age.

---

### Anti-Patterns Found

None in gap-closure files. Key patterns are clean:
- `useUserPresence.ts`: No peer-eviction POST, proper `isPresenceReady` gating, away/busy statuses preserved.
- `AvatarGroup.tsx`: Reconnection guard with `clearTimeout` present and correctly ordered before offline-transition block.
- `companies/update/route.ts`: Uses `auth.getUser()` (not `getSession`), constructs repository with server client.
- `floor-plan.tsx`: Placement useEffect calls only `setSelectedSpace`/`setHighlightedSpaceId`, not `handleEnterSpace`.

---

## Human Verification Required

### 1. Crash Cleanup Timing

**Test:** Open two browser sessions. Place one user in a space, then hard-close the tab (or kill the browser process entirely) for that user.
**Expected:** The avatar begins the offline fade (vo-avatar-offline-fade CSS class applies) and disappears from the space card within 5 seconds total. Away/busy users in other spaces must remain fully visible and not fade.
**Why human:** isPresenceReady gating prevents false-offline during channel init, but the actual timing of Supabase Presence leave event emission and the browser unload beacon delivery cannot be proven statically.

### 2. First-Time Placement

**Test:** Use a user who has never logged in (no `vo-first-login-done` localStorage key, no `current_space_id` in DB). Configure a company default space in Admin Settings. Load the floor plan.
**Expected:** The user lands in the configured company default space. If no default is configured, they land in the first active workspace. The floor plan highlights the correct space and the user appears in it to other clients.
**Why human:** Requires a real authenticated session, controlled localStorage state, and DB state (no current_space_id).

### 3. Grace Rejoin and Beacon Race

**Test A:** Place a user in a regular space, reload the tab, observe within 5 minutes. Then wait more than 5 minutes after leaving a space and reload.
**Expected (A):** Within 5 minutes the user rejoins the prior space automatically. After 5 minutes they follow the home/default/workspace fallback chain.

**Test B:** Place a user in a restricted (private) space. Reload the tab (do not click Leave first). Observe whether the user reappears in the restricted space.
**Expected (B):** The user rejoins the restricted space without a knock, because the open presence log entry (tertiary grace signal) grants access even when the beacon POST hasn't committed the exited_at timestamp yet.
**Why human:** Needs real time passing, persisted browser localStorage state, live API responses, and race-condition timing that cannot be simulated in unit tests.

---

## Verification Summary

All nine bugs identified during UAT and diagnosed in `e1dc8ee` are now closed in code:

1. False-offline transitions during Realtime init — fixed by `isPresenceReady` gate in `useUserPresence.ts`
2. Away/busy users force-downgraded to offline — fixed by updated `presenceAwareUsers` derivation
3. Peer clients permanently evicting users on network hiccups — fixed by removing peer leave POST
4. AvatarGroup fade timer not cancelled on reconnect — fixed by `clearTimeout` guard in `AvatarGroup.tsx`
5. Admin Spaces tab returning HTML 404 on save — fixed by new App Router `route.ts` replacing Pages Router `update.ts`
6. Space dropdown showing only one space — fixed by broadened filter (`active || available || in_use`)
7. Name-only saves wiping settings JSONB — fixed by `data.settings !== undefined` guard in `CompanyContext.tsx`
8. FloorPlan useEffect using UI-only `handleEnterSpace` instead of the API path — fixed by visual-only placement useEffect in `floor-plan.tsx`
9. Grace rejoin race condition for restricted spaces — fixed by three-signal grace check (exited_at + last_active + open presence log) in `location/route.ts`

The compile surface is clean, the targeted automated tests pass (11/11), and the full test suite has no new regressions (2 failures are pre-existing from February 2026, unrelated to Phase 02).

The remaining work is human browser validation only — no code gaps remain.

---

_Verified: 2026-03-19T17:30:00Z_
_Verifier: Claude (gsd-verifier) — re-verification after plans 02-05, 02-06, 02-07_
_Status: Pending user confirmation_
