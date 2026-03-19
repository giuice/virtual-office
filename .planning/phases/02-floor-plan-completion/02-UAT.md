---
status: complete
phase: 02-floor-plan-completion
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md
started: 2026-03-19T12:30:00Z
updated: 2026-03-19T12:31:00Z
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
result: skipped
reason: Cannot test — the admin Spaces settings UI (Test 5) is broken and cannot save a default space. No default or home space can be configured to validate placement behavior.

### 8. Restricted Space Server Authorization
expected: Attempt to navigate directly to a restricted space without having an approved knock (e.g., via URL or direct API). The server should reject the join — you should NOT appear as an occupant in that space. Only approved knock recipients should be able to enter.
result: skipped
reason: UI enforces knock-only access — no way to attempt a direct unauthorized join through normal user flow without API tooling.

## Summary

total: 8
passed: 3
issues: 3
pending: 0
skipped: 2
skipped: 0

## Gaps

- truth: "Offline avatar fade applies only to offline users; online users remain fully visible and static in their spaces"
  status: failed
  reason: "User reported: all other users fade and back again too, so the effect is applying on all users. Also: online users are disappearing from their space on the floor plan (user A is online per the menu avatar but not visible in admin space; other users cannot see them either)"
  severity: blocker
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
- truth: "Admin Spaces tab shows all company spaces in the default-space dropdown and saves successfully"
  status: failed
  reason: "User reported: dropdown only shows one space; saving after selecting that space returns: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON (server returning HTML error page instead of JSON)"
  severity: major
  test: 5
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
- truth: "Page reload preserves user online status and space occupancy — user remains visible in their space"
  status: failed
  reason: "User reported: if I reload the window my user disappears and no more online, even that I'm online"
  severity: major
  test: 6
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
