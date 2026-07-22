# WP3 — Phase 3 report

## 1. Outcome

The Knock request UI now renders once from `ModernFloorPlan` in a `document.body` portal, fixed at the viewport's top center above app overlays. Multiple requests stack oldest-to-newest so the newest is below, each request keeps its own approve/deny routing and responding state, and each banner shows a presentation-only countdown derived from `timestamp + 30_000`. The visible request map is fenced to the responder's authoritative occupied space, so leaving that space immediately hides stale requests without changing the protected Knock hook.

Toasts now render bottom-right. The mobile detail sheet is non-modal so the global banner remains pointer- and keyboard-operable above it. The detail panel and sheet now use real data only: space metadata, capacity/status, the full roster, speaking/muted state, audio controls only while the viewer is in the space, and shared Enter/Knock/unavailable rules. Agenda, transcript, and activity placeholders are no longer consumed or rendered. Desktop card-body click opens the panel; footer/context-menu movement actions remain separate. Mobile tap still opens the sheet. Final-layout skeletons and designed empty states are present.

AC-005 automated verification is **pending environment**, not verified. The Playwright spec was launched twice but stopped in fixture setup because `AUTH_E2E_MEMBER_EMAIL` is missing, before either browser context could open.

## 2. What changed

Application only:

- Added the global Knock banner host, stacking, countdown, portal, current-space visibility fence, and obstruction-focused tests.
- Removed the per-card banner render and its four dead props while preserving card Knock status/cooldown behavior.
- Moved the single Sonner toaster from top-right to bottom-right; repository grep confirms no second `Toaster` mount.
- Restyled the desktop detail panel and mobile sheet with real roster/audio/action data and removed `useSpaceDetails` consumption from `ModernSpaceCard`.
- Shared the status-entry predicate with NowBoard and kept Knock available whenever existing responder logic supplies it.
- Changed desktop card-body click to open details, with footer Enter unchanged; updated the existing presence operability helper accordingly.
- Added final-footprint skeletons plus empty-office/empty-result styling.
- Added/updated Vitest and Playwright coverage for the Phase 3 behaviors.

Database changes: **none**. Deployment changes: **none**. No API route, migration, RLS policy, Realtime channel, protected presence/Knock hook, AudioContext, package, commit, staging, or push change was made. The pre-existing `TRACKER.md` and `.claude/settings.local.json` worktree state was preserved.

## 3. What the owner needs to do now

1. Supply the Presence E2E environment and run:

   `npx playwright test __tests__/api/playwright/presence/knock-banner-obstruction.spec.ts --project=presence`

   Use either `PRESENCE_E2E_PROVISION_LOCAL=1` with the disposable loopback fixture prerequisites, or set all fixture credentials: `AUTH_E2E_EMAIL`, `AUTH_E2E_PASSWORD`, `AUTH_E2E_MEMBER_EMAIL`, `AUTH_E2E_MEMBER_PASSWORD`, `AUTH_E2E_EXTERNAL_EMAIL`, and `AUTH_E2E_EXTERNAL_PASSWORD`.
2. Perform visual UAT with two real accounts: banner + active toast, approve/deny and resulting placement, stale-banner disappearance after the responder moves, and banner operability while the mobile sheet is open. Capture the missing combined banner screenshots during this run.
3. Decide the D3-5 veto: keep desktop card-body click opening the detail panel, or revert that desktop branch so movement returns to card-body click. Also confirm the intentional non-modal mobile-sheet tradeoff: the global banner is accessible, and the page behind the sheet remains interactive.

## 4. Verification

- `npm run type-check` (executed as `cmd /c npm.cmd run type-check` because of the Windows PowerShell script policy): passed.
- `npm run lint`: passed with 0 errors and 508 known warnings.
- Full `npm test`: 100 test files and 1,075 tests passed. The only failed suite was the known pre-existing `__tests__/guards/presence-movement-gate.test.mjs` load failure: Rolldown parsed the script shebang after generated imports and reported `Invalid Character !`. The guard and its script were not edited.
- Focused Phase 3 component command: `npx vitest run __tests__/knock-banner.test.tsx __tests__/modern-space-card.test.tsx __tests__/space-detail-hover-panel.test.tsx __tests__/components/floor-plan-bootstrap-states.test.tsx __tests__/knock-auto-join.test.tsx` — 5 files, 138 tests passed.
- Mandatory Presence safety review: passed after fixes for current-space fencing, bottom-sheet accessibility, and concurrent toast/hit-test sampling; BR-001 remained untouched.
- AC-005 Playwright command: launched, failed before browser setup with `Error: AUTH_E2E_MEMBER_EMAIL is required for the Presence E2E suite.` Therefore AC-005 is not marked verified.
- The shipped obstruction assertion uses one atomic `page.evaluate`: it first requires a visible, non-zero-size `[data-sonner-toast]`, then runs `document.elementFromPoint` at the center of both the approve and deny buttons and requires each hit to be that button or a descendant. This prevents the assertion from passing after the toast auto-dismisses.
- Live local smoke at 1280×600 confirmed desktop detail rendering in both themes. A real Knock flow measured its active Sonner toast at the bottom-right (`x≈885`, `y≈533`, `356×73` in a `1280×600` viewport). Mobile smoke confirmed the real bottom sheet at `390×600` in both themes. Evidence:
  - `detail-panel-dark-1280x600.png`
  - `detail-panel-light-1280x600.png`
  - `bottom-sheet-dark-390x600.png`
  - `bottom-sheet-light-390x600.png`
- The controllable browser exposed only the member session, so a responder-side banner could not be produced there. Loading completed too quickly to truthfully capture the skeleton. No banner/skeleton screenshot was fabricated.
- `git diff --check`: clean. The final start-commit plus untracked-file boundary scan found 0 BR-001/forbidden paths. The Playwright-generated tracked HTML report was restored to its pre-run content.

## 5. Remaining risks / known pre-existing issues

- AC-005's two-context approve/deny path remains pending until the missing E2E credentials or local fixture are available.
- `/api/spaces/knock/pending` may intermittently return the known pre-existing 409 under repeated test-account logins; the new spec deliberately does not assert zero console errors for that route.
- The pre-existing `presence-movement-gate` Rolldown/shebang load failure remains unchanged.
- `modal={false}` is required so a body-level Knock portal remains accessible and operable with the sheet open; it also intentionally leaves the page behind the sheet interactive. Mobile UAT should confirm this interaction.
- The browser smoke used one controllable signed-in session even though two users were online, so it is supporting visual evidence rather than AC-005 verification.

## 6. Status

**Pending user confirmation.**
