# WP3 close-out report — 2026-07-22

## 1. Outcome per item

- **R3 — fixed.** `KnockBanner` keeps the server-authoritative expiry as a visual signal (`Expired` plus a progress bar at zero), but only `responding` disables Approve and Deny. An expired banner therefore still sends either response to the server; the existing HTTP 410 / `KNOCK_EXPIRED` toast remains the user-visible final word. The fake-timer regression test now proves that both handlers still run after visual expiry, while the existing responding-state assertion still proves the in-flight lock.
- **R4 — fixed.** `ModernFloorPlan` now tracks both the open space and its actual detail surface (`panel` or `sheet`). Only an open mobile sheet applies `inert` to the existing floor-plan background container; a desktop panel never does. `KnockBannerHost` remains structurally outside that subtree. Unit tests assert the observable attribute contract only. A real Chromium run at 390×844 additionally proved that 20 consecutive Tab presses never focused a card behind the scrim and that the close button, Escape, and backdrop click all close the sheet and remove `inert`.
- **AC-005 — fixed and verified.** The first real run exposed a fixture defect: when the named room was absent, the spec selected an empty private room and waited for a request that the legitimate client precheck rejected. The spec now uses two distinct public direct-entry rooms, without weakening the real-toast precondition or any `elementFromPoint` assertion. The isolated acceptance scenario passed with approve, deny, and MessagingTrigger unobstructed; approve moved the requester (`data-user-in-space="true"`) and deny surfaced the denial toast.

Fact check: the handoff's migration citation is incorrect. `20260716175515_phase4_knock_delivery_and_retention.sql` does not contain the claimed line. The latest authoritative `create_knock_request` definition is in `20260719140658_presence_concurrency_contract.sql`, where `expires_at = v_op + interval '30 seconds'` and `created_at = v_op`; `useKnockSignaling.ts` maps that server `createdAt` to `payload.timestamp`. The handoff's conclusion that the countdown mirrors the authoritative TTL is correct despite the bad citation.

## 2. What changed — application only

- `KnockBanner.tsx`: local visual expiry no longer blocks response controls.
- `ModernSpaceCard.tsx` and `ModernFloorPlan.tsx`: the lifted single-open-detail state records the rendered surface, and the existing floor-plan background is inert only for a mobile sheet.
- Tests: expired-banner interaction coverage, sheet/panel inert-attribute contract coverage, corrected AC-005 fixture selection, and a real-browser R4 focus/close regression scenario.
- Evidence: `r4-mobile-sheet-focus-390x844.png`.

There are **zero database changes**, **zero migration/API/Realtime changes**, and **zero deployment changes**. Mudança online no banco: **não**. No protected BR-001 file was changed. No commit, staging, push, or PR was performed. `playwright-report/index.html` was not edited or restored during this close-out; its pre-existing generated dirt remains for the owner.

## 3. Owner actions

- Perform product UAT for **D3-5** (card-body click opens details) and **D3-6** (no hover/focus reveal), including the preferred interaction feel on desktop and mobile.
- Review the captured mobile sheet appearance at 390×844. Browser-level keyboard containment itself is proven by the automated run; final visual/product acceptance remains an owner decision.
- Decide how to handle the pre-existing tracked churn in `playwright-report/index.html` when preparing the eventual commit.

## 4. Verification

- `npm run type-check`: **passed** (`tsc --noEmit`, exit 0).
- `npm run lint`: **passed with 0 errors and 508 warnings**, the accepted baseline.
- Full `npm test`: **100 passed test files / 1 known failed suite / 101 total; 1,081 passed tests / 1,081 executed**. The only failure is the explicitly excluded pre-existing loader failure in `__tests__/guards/presence-movement-gate.test.mjs`: Rolldown reports `Invalid Character '!'` at `/scripts/presence-movement-gate.mjs:1:478` while parsing its shebang. Neither file was touched.
- AC-005 isolated real-browser result: `ok 1 [presence] … keeps approve and deny operable with a real toast and delivers both outcomes (55.3s)` and `1 passed (1.3m)`.
- R4 isolated real-browser result: `ok 1 [presence] … keeps keyboard focus out of the inert mobile floor-plan background (22.7s)` and `1 passed (47.5s)`.
- Mandatory post-edit `presence-safety-reviewer`: **passed with zero blockers, zero risks, and zero notes**. It independently confirmed server authority, sheet-only inert behavior, the global host boundary, and the real AC-005 assertions.
- Chromium was already installed; no browser installation was required. Supabase HTTPS was reachable.
- `git diff --check`: **clean**.
- Tracked plus untracked path audit: **zero BR-001 paths**.

## 5. Residual risks

- The visually expired banner may remain mounted until the hook's existing delivery-relative cleanup completes. It remains clickable by design, and the database is the final authority; this can produce the existing explanatory 410 toast rather than a silent client dead end.
- AC-005 depends on the two configured E2E accounts and at least two public direct-entry spaces in the live fixture. The current environment satisfied that contract, but future fixture drift can fail setup independently of the obstruction behavior.
- D3-5 and D3-6 have automated regression coverage but still require the owner's interaction-design UAT.
- The full Vitest command is not fully green until the known Rolldown/shebang loader issue is addressed in separate authorized work.

## 6. Status

**Pending user confirmation.**
