---
status: testing
phase: 01-stabilization
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md
started: 2026-02-25T12:00:00Z
updated: 2026-02-25T12:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Floor Plan Grid Layout
expected: |
  Navigate to /floor-plan. Spaces (rooms) should display in a fluid responsive grid that auto-fills based on available width. Resizing the browser should cause cards to reflow smoothly (not jump between fixed column counts).
awaiting: user response

## Tests

### 1. Floor Plan Grid Layout
expected: Navigate to /floor-plan. Spaces display in a fluid responsive grid that auto-fills based on available width. Resizing the browser causes cards to reflow smoothly.
result: [pending]

### 2. Knock Sound Effect
expected: On the floor plan, click to knock on a space (door). A realistic wooden door knock sound should play (triple-tap knock). No harsh buzzer or synthesized tone.
result: [pending]

### 3. Login Redirect
expected: Log out and log back in with valid credentials (user that has a company). After login, you should land on /floor-plan (not /dashboard).
result: [pending]

### 4. Auth Inline Errors
expected: On the login page, enter a wrong password and submit. An error message should appear inline on the form (red text below the form fields). No toast/popup notification should appear.
result: [pending]

### 5. User Menu Links
expected: Click the user avatar/menu in the top navigation. All menu items should work (no broken links, no "avatar demo" link present).
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0

## Gaps

[none yet]
