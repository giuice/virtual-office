# WP3 fix round report

## 1. Outcome per finding

- **F1 — Fixed.** Sonner remains bottom-right, opposite the top-center Knock banner, with desktop and mobile offsets of `{ bottom: 88, right: 24 }`. The Presence Playwright regression now checks the Messaging trigger center with `elementFromPoint` during the same active-toast window used for the Knock controls.
- **F2 / D3-6 — Fixed.** `ModernFloorPlan` owns one `openDetailSpaceId`; cards receive controlled open state and an open/close callback. Opening space B replaces space A on desktop and mobile, and closing B leaves no stale panel. Desktop hover/focus reveal and all 300 ms/100 ms timer and pinned-ref machinery were removed. Details now open only by click, Enter, or Space and close by Escape, the close control, or selecting another card.
- **F3 — Fixed as the requested UI-only mitigation.** A request at or below zero remaining time displays **Expired** and both approve/deny controls are disabled, visually dimmed, and expose `aria-disabled`. The host still uses only its existing 250 ms tick and leaves entry cleanup to the protected Knock hook.
- **F4 — Fixed.** The non-modal mobile sheet now renders a token-based, pointer-active backdrop inside its portal at `z-[49]`, immediately below sheet content and far below the global banner. A backdrop click is swallowed and closes only the sheet; tests prove it does not invoke background Enter, Knock, or another sheet-open action. The global Knock banner remains clickable above the backdrop.

Session registration, authoritative movement, avatars, Realtime reconciliation, occupancy, and private-space entry logic are unchanged. The existing coordinator and server-owned Knock/placement boundaries remain the only movement authority.

## 2. What changed

### Application

- Offset the bottom-right Sonner toaster clear of the fixed Messaging trigger.
- Lifted desktop/mobile detail selection into `ModernFloorPlan` and converted `ModernSpaceCard` to controlled detail state.
- Removed desktop hover/focus panel reveal and its dead timer/ref state.
- Added expired presentation/disabled behavior to `KnockBanner`.
- Added the non-modal sheet backdrop and kept the global Knock banner above it.
- Extended unit/integration and Presence Playwright regressions for F1–F4.

### Database

Zero database changes. No schema, data, migration, RPC, RLS, grant, storage, Realtime, or server/API contract was changed or applied.

### Deployment

Zero deployment changes. Nothing was staged, committed, pushed, deployed, restarted, or applied to an online environment.

## 3. Owner actions

1. Provide the missing Presence E2E credentials and run `npx playwright test __tests__/api/playwright/presence/knock-banner-obstruction.spec.ts --project=presence`. This environment is missing `AUTH_E2E_MEMBER_EMAIL`, `AUTH_E2E_MEMBER_PASSWORD`, `AUTH_E2E_EXTERNAL_EMAIL`, and `AUTH_E2E_EXTERNAL_PASSWORD`.
2. Perform two-account visual UAT for the active-toast/Messaging-trigger hit target, expired Knock presentation, and the mobile backdrop with a live global Knock banner.
3. Confirm or veto D3-5 (card-body click opens details) and D3-6 (no desktop hover/focus reveal). Also confirm the accepted residual that keyboard focus is not trapped in the non-modal mobile sheet.

## 4. Verification

- `npm run type-check`: passed. This also compiles the extended Playwright spec.
- `npm run lint`: passed with 0 errors and 508 existing warnings.
- Focused regressions: 4 files and 145 tests passed.
- Full `npm test`: 100 test files and 1,080 tests passed. The only failed suite is the known pre-existing `__tests__/guards/presence-movement-gate.test.mjs` load failure, where Rolldown parses the imported script shebang after generated imports (`Invalid Character !`). The guard was not edited.
- Presence-safety review: passed for this UI-only change; no second movement writer, authority change, unscoped cache/channel, protected hook edit, or database dependency was introduced.
- Playwright runtime: not run because the four required member/external credentials above are absent; the spec remains present and type-checked.
- `git diff --check`: clean apart from informational LF-to-CRLF conversion warnings.
- Protected-boundary scan: zero BR-001/forbidden paths in tracked or untracked working-tree changes.
- Component sizes remain below the requested ~500-line ceiling.

## 5. Residual risks

- Keyboard focus is not trapped in the non-modal mobile sheet. Pointer tap-through is fixed, but keyboard behavior remains an explicit UAT item.
- Countdown/server-expiry skew is mitigated at the UI boundary, not synchronized exactly. Exact server expiry would require adding authoritative expiry data through BR-001-protected Knock signaling/hooks and therefore needs a separate escalation.
- The real two-browser obstruction and approve/deny flow remains unverified until the missing E2E credentials are supplied.

## 6. Status

**Pending user confirmation.**
