# WP4 — Floor-plan cleanup and sign-off report

## 1. Outcome

The floor plan now runs without the unrendered beacon/agenda/activity/transcript UI components or the obsolete Orbit/Analyst/Cinema axis. The live density, NowBoard, card, detail, placement, occupancy, audio, and Knock paths remain intact. The application change was locally verified and approved by the owner in the final UAT on 2026-07-22; it has not been deployed.

## 2. What changed

### Application

- Deleted five unconsumed UI components: `AttentionBeacon`, `AgendaPhaseDisplay`, `ActivityLogPreview`, `TranscriptSnippet`, and `BeaconQueue` (646 production lines), plus their barrel exports.
- Removed only legacy tests/blocks and provably inert mocks for those deleted components (435 test lines). Tests for NowBoard slim, `NowBoardMetrics`, search, filters, detail surfaces, roster, actions, card interaction, and Knock remain.
- Removed both legacy layout type aliases, the `variant` prop, the hardcoded `orbit` value, the dead `analyst` branch, and stale implementation-document references. Production behavior is unchanged because only `orbit` was passed and the removed suppression flag was always false.
- Kept `useAttentionBeacon`, `useBeaconAggregator`, and their tests dormant for the future admin dashboard.
- Kept `NowBoardMetrics` because `NowBoard` still renders it.
- Kept `useSpaceDetails` and its mock because `src/app/api/spaces/[id]/details/route.ts` exists. Only its `ActivityLogEntry` interface moved into the hook, with the same shape and no runtime effect.
- Added four authenticated browser screenshots under this directory.

### Database

No database change. No migration, schema, RLS, policy, data, RPC, channel, or online-database operation was created or applied.

### Deployment

No deployment, restart, environment-variable change, stage, commit, push, or PR was performed.

## 3. What you need to do now

Nothing

## 4. Verification

1. `npm.cmd run type-check` — passed cleanly.
2. `npm.cmd run lint` — 0 errors / 504 warnings; baseline was 508, so warnings decreased by 4.
3. `npm.cmd test` — 99 test files and 1,047 tests passed. The only failed suite is the known pre-existing load failure in `__tests__/guards/presence-movement-gate.test.mjs` (Rolldown parses the imported script shebang after transformed imports). The baseline reduction from 100 files / 1,081 tests is exactly the intentional deletion of 1 legacy file / 34 legacy component tests.
4. `npm.cmd run build` — production build passed; 47 pages generated. The route manifest includes `/api/spaces/[id]/details`, which is why `useSpaceDetails` was retained.
5. Authenticated Chromium smoke — the temporary focused spec completed login, `/floor-plan` load, authoritative snapshot, auto-placement, loading-overlay disappearance, four screenshots, page close, and server-side session disconnect. Evidence: `floor-plan-dark-1280x600.png`, `floor-plan-light-1280x600.png`, `floor-plan-dark-390x844.png`, and `floor-plan-light-390x844.png`. The Playwright process itself hung during Windows runner/web-server teardown and was ended by the external timeout, so this command is not reported as a green exit despite the completed assertions and artifacts.
6. `git diff --check` — clean.
7. BR-001 proof — `git diff --name-only` and the untracked-path audit contain zero protected Presence, Realtime, AudioContext, Knock-orchestration, or presence-test paths. The presence movement gate passed, and the mandatory read-only Presence reviewer reported no blockers or risks.
8. Final tracked diff — predominantly deletions: 16 files, 61 insertions, and 1,119 deletions. The touched implementation/test/document paths are:
   - `__tests__/attention-beacon.test.tsx`
   - `__tests__/knock-banner.test.tsx`
   - `__tests__/now-board.test.tsx`
   - `__tests__/space-detail-hover-panel.test.tsx`
   - `docs/sprint-artifacts/3-9-space-grouping-and-neighborhoods.context.xml`
   - `docs/sprint-artifacts/3-9-space-grouping-and-neighborhoods.md`
   - `src/components/floor-plan/modern/ActivityLogPreview.tsx`
   - `src/components/floor-plan/modern/AgendaPhaseDisplay.tsx`
   - `src/components/floor-plan/modern/AttentionBeacon.tsx`
   - `src/components/floor-plan/modern/BeaconQueue.tsx`
   - `src/components/floor-plan/modern/ModernFloorPlan.tsx`
   - `src/components/floor-plan/modern/ModernSpaceCard.tsx`
   - `src/components/floor-plan/modern/TranscriptSnippet.tsx`
   - `src/components/floor-plan/modern/index.ts`
   - `src/hooks/useSpaceDetails.ts`
   - `spec-interview/spaces-visualization-redesign/TRACKER.md`
   - `spec-interview/spaces-visualization-redesign/evidence/phase-4/*`

## 5. Remaining risks

- Final product acceptance was granted by the owner after UAT on 2026-07-22.
- The Playwright test body and screenshots completed, but its Windows runner/web-server teardown did not return a green exit. Investigate the runner lifecycle separately if a clean smoke command exit is a release gate.
- D0-1 remains open by instruction: four persisted theme names still map to two visual palettes and the old previews remain. Estimated fix, including compatibility decision, tests, and UAT: 4–8 hours.
- `useAttentionBeacon`/`useBeaconAggregator` remain dormant intentionally. `useSpaceDetails` also remains unconsumed by the current panel because its real API route exists; deleting that API/hook contract needs a separate product/API decision. `NowBoardMetrics` is live, not residual code.
- R4 is closed, not residual: the Phase 3 close-out proved mobile background `inert` behavior in real Chromium at 390×844.

## 6. Status

Status: Complete — user confirmed
