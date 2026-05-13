---
status: diagnosed
phase: 02-floor-plan-completion
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md
started: 2026-03-19T12:30:00Z
updated: 2026-05-12T21:05:21-03:00
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Knock Button on Restricted Space Card
expected: Navigate to the floor plan. Find a restricted (private) space. The space card should show an inline "Knock" button (or similar CTA). Clicking it should send a knock request to the occupants — you should see some feedback (button state change, cooldown indicator, or a brief status message).
result: pass

### 2. Knock Banner Appears for Occupants
expected: While inside a restricted space (as an occupant), have another user knock. A banner should appear inside YOUR space card on the floor plan — not a floating toast — with Approve and Deny buttons showing the requester's name/avatar.
result: pass

### 3. Auto-Join After Knock Approval
expected: As the requester: knock on a restricted space and have an occupant approve. You should be automatically moved into the space without having to click anything else — the floor plan updates to show you as an occupant.
result: pass

### 4. Offline Avatar Fade-Out
expected: While watching the floor plan, have a user go offline (close their tab or disconnect). Their avatar should fade out gradually (~3 seconds) instead of instantly disappearing from the space card.
result: issue
reported: "Yes, but all other users fade, and back again too, so the effect is applying on all users. 2. Users are disappearing even online, for example now: user A, admin on admin space is online (avatar on menu is online), but not showing on admin space. User B cannot see user A on admin space too. we need a expert review on these new features."
severity: blocker

### 5. Admin Spaces Tab in Company Settings
expected: As an admin, open company settings. There should be a "Spaces" tab. Inside it you should see: a dropdown to pick a default space for the company, and a list of team members where you can assign each one a personal home space.
result: issue
reported: "there is a spaces tab, but: 1. the dropdown just shows one space, 2. when I change to the only space listed and try to save: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"
severity: major

### 6. Grace Period Rejoin
expected: Join a space (regular or restricted), then close the app/tab and reopen within 5 minutes. You should automatically land back in the same space you were in — no manual navigation needed. A toast notification may confirm the grace rejoin.
result: issue
reported: "it passes, but if I reload the window my user disappears and no more online, even that I'm online"
severity: major

### 7. First-Time / Default Space Placement
expected: Log in as a user who has no recent space history (or clear localStorage). If a company default space is configured, the floor plan should auto-select or place you in that space. If a personal home space is assigned, that should take priority over the default.
result: pass
confirmed: "User cleared localStorage keys (vo-first-login-done, lastSpaceId, vo-disconnect-timestamp), retested first-time/default placement, and confirmed it worked."

### 8. Restricted Space Server Authorization
expected: Attempt to navigate directly to a restricted space without having an approved knock (e.g., via URL or direct API). The server should reject the join — you should NOT appear as an occupant in that space. Only approved knock recipients should be able to enter.
result: pass
confirmed: "User confirmed restricted-space server authorization check passed."

## Summary

total: 8
passed: 5
issues: 3
pending: 0
skipped: 0

## Gaps

- truth: "Offline avatar fade applies only to offline users; online users remain fully visible and static in their spaces"
  status: failed
  reason: "User reported: all other users fade and back again too, so the effect is applying on all users. Also: online users are disappearing from their space on the floor plan (user A is online per the menu avatar but not visible in admin space; other users cannot see them either)"
  severity: blocker
  test: 4
  root_cause: |
    Two compounding bugs in useUserPresence.ts:
    1. presenceAwareUsers derives status:'offline' for ALL users not in the Realtime snapshot,
       including away/busy users and EVERYONE during the channel-init gap (before first sync event).
       This causes mass false-offline transitions, which AvatarGroup detects and adds to exitingUserIds,
       triggering vo-avatar-offline-fade on non-offline users.
    2. The Realtime presence 'leave' handler unconditionally POSTs {spaceId:null, offline:true} to
       /api/users/location, permanently clearing current_space_id in the DB on any disconnect
       (tab switch, network hiccup). postgres_changes UPDATE then sets currentSpaceId:null in cache,
       removing the user from usersInSpaces and making them invisible in all space cards.
  artifacts:
    - path: "src/hooks/useUserPresence.ts"
      issue: "presenceAwareUsers offline override fires before first Realtime sync, force-marking away/busy users and all users as offline during channel-init gap"
    - path: "src/hooks/useUserPresence.ts"
      issue: "leave event handler POSTs spaceId:null to location API, permanently evicting user from DB on any Realtime disconnect"
    - path: "src/components/floor-plan/modern/AvatarGroup.tsx"
      issue: "exitingUserIds populated on false-offline cycles; no guard against re-adding already-fading users or cancelling on reconnect"
  missing:
    - "Add isPresenceReady flag — only apply offline override in presenceAwareUsers after first Realtime sync event"
    - "Remove the fire-and-forget location POST from the presence leave handler; only mark status offline in query cache, not in DB"
    - "Do not force away/busy users to offline when absent from Realtime snapshot — trust DB status for non-online statuses"
    - "Guard AvatarGroup exitingUserIds against re-adding already-present users; cancel timeout if user comes back online"
  debug_session: ""
- truth: "Admin Spaces tab shows all company spaces in the default-space dropdown and saves successfully"
  status: failed
  reason: "User reported: dropdown only shows one space; saving after selecting that space returns: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON (server returning HTML error page instead of JSON)"
  severity: major
  test: 5
  root_cause: |
    Two independent bugs:
    1. company-settings.tsx filters spaces with status==='active' only. The space_status enum has 6 values
       (active, available, maintenance, locked, reserved, in_use). Spaces with status 'available' or
       'in_use' are silently excluded, leaving only 'active' spaces in the dropdown.
    2. src/app/api/companies/update.ts uses Pages Router format (export default handler) inside the
       App Router directory. Next.js cannot register it as a route, so PATCH /api/companies/update
       returns a 404 HTML page. The client then calls response.json() on the HTML body, throwing
       "Unexpected token '<', <!DOCTYPE..."
    Secondary: CompanyContext.tsx settings merge passes settings:undefined when caller omits settings key,
    risking a NULL overwrite of the settings column on name-only saves.
  artifacts:
    - path: "src/components/dashboard/company-settings.tsx"
      issue: "spaces.filter(s => s.status === 'active') excludes available, in_use, reserved spaces from default-space dropdown"
    - path: "src/app/api/companies/update.ts"
      issue: "Pages Router export default handler in App Router directory — Next.js never registers the route, returns 404 HTML"
    - path: "src/contexts/CompanyContext.tsx"
      issue: "settings merge falsy branch passes settings:undefined, could NULL-wipe settings column on name-only saves"
  missing:
    - "Broaden space filter in company-settings.tsx to include available/in_use spaces (exclude only maintenance/locked)"
    - "Convert src/app/api/companies/update.ts to App Router format: move to update/route.ts with named PATCH export using NextResponse"
    - "Fix CompanyContext settings merge: use data.settings !== undefined ? merge : company.settings to preserve existing settings when caller omits the key"
  debug_session: ""
- truth: "Page reload preserves user online status and space occupancy — user remains visible in their space"
  status: failed
  reason: "User reported: if I reload the window my user disappears and no more online, even that I'm online"
  severity: major
  test: 6
  root_cause: |
    Four compounding bugs:
    1. Race (restricted spaces): beacon POST writes exited_at to space_presence_log; if the rejoin PUT
       arrives before beacon POST commits, hasGraceRejoin=false → 403 SPACE_ACCESS_DENIED.
    2. UI/DB divergence: FloorPlan's placement useEffect calls handleEnterSpace (UI state only),
       not the presence API. User appears "in" a space locally but DB still has currentSpaceId=null,
       so other clients' usersInSpaces maps never show them.
    3. Peer leave handlers: all other connected clients receive a presence.leave event and each
       independently POST {spaceId:null, offline:true} to /api/users/location with no guard.
       Any peer POST arriving after a successful rejoin overwrites current_space_id back to null.
    4. FloorPlan has a duplicate placement system (useEffect + handleEnterSpace) separate from
       useLastSpace's API-calling placement effect — structural duplication causes the UI-only path
       to win in some cases.
  artifacts:
    - path: "src/hooks/useUserPresence.ts"
      issue: "Peer presence.leave handler POSTs offline status to API with no guard against overwriting a completed rejoin"
    - path: "src/app/api/users/location/route.ts"
      issue: "enforceSpaceAuthorization checks exited_at from space_presence_log which requires beacon POST to have committed first — race condition on rejoin for restricted spaces"
    - path: "src/components/floor-plan/floor-plan.tsx"
      issue: "Placement useEffect calls handleEnterSpace (UI only) instead of updateLocation (API), diverging local UI from DB state"
    - path: "src/hooks/useLastSpace.ts"
      issue: "Sole path calling the presence API after reload; structurally correct but blocked by peer-overwrite race (artifact 1 above)"
  missing:
    - "Add timestamp guard to location API POST handler: reject offline-marking if target user's last_active is newer than beacon timestamp"
    - "Use last_active timestamp as grace-rejoin signal in enforceSpaceAuthorization instead of depending solely on exited_at"
    - "Remove or unify FloorPlan's placement useEffect with useLastSpace — the UI-only handleEnterSpace path must not win over the API-calling path"
    - "Peer leave handler should not POST cleanup for a user who has already re-established presence (add a staleness check)"
  debug_session: ""
