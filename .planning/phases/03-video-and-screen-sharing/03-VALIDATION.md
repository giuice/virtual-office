---
phase: 03
slug: video-and-screen-sharing
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-22
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10, Testing Library, Playwright 1.61.1, and real Postgres/Supabase DB tests |
| **Config file** | `vitest.config.mts`, `vitest.presence-db.config.mts`, `playwright.config.ts` |
| **Quick run command** | `npm test -- __tests__/audio-context.test.tsx __tests__/audio-signaling.test.tsx` |
| **Full suite command** | `npm test && npm run type-check && npm run lint && npm run build` |
| **Estimated runtime** | Establish during Wave 0; quick baseline is 5 focused tests |

---

## Sampling Rate

- **After every task commit:** Run the focused Vitest files named in that task plus `npm run type-check`
- **After every plan wave:** Run `npm test && npm run lint`; also run `npm run test:presence:db` after migration/RLS/API work
- **Before `/gsd-verify-work`:** Full suite, Presence gates, target database readback, and multi-user browser UAT must be green
- **Max feedback latency:** 120 seconds for focused unit/component checks; database and browser gates are separately timed

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-10-01 | 03-10 | 3 | VID-01 | T-03-07 / T-03-10 | Perfect negotiation handles offer collision and add/remove display tracks without breaking audio | unit | `npm test -- __tests__/webrtc-manager.test.ts` | ❌ planned in 03-10 | ⬜ pending |
| 03-10-02 | 03-10 | 3 | VID-01 | T-03-07 / T-03-08 / T-03-09 | Private signaling validates payloads, waits for subscribe, reconciles authority, and fences old scope | unit | `npm test -- __tests__/audio-signaling.test.tsx` | ✅ baseline; expanded in 03-10/03-03 | ⬜ pending |
| 03-02-01 | 03-02 | 5 | VID-04 | T-03-05 / T-03-08 | Exactly one authorized occupant wins a concurrent claim; owner/session/share fences and TTL release abandoned claims | real DB/concurrency | `npm run test:presence:db -- __tests__/presence-db/screen-share-lease.test.ts` | ❌ planned in 03-02 | ⬜ pending |
| 03-02-02 | 03-02 | 5 | VID-01 | T-03-06 / T-03-07 | Private Realtime topic rejects cross-company/cross-space access with mapped Auth identity | real DB/RLS | `npm run test:presence:db -- __tests__/presence-db/screen-share-realtime-policy.test.ts` | ❌ planned in 03-02 | ⬜ pending |
| 03-11-01 | 03-11 | 7 | VID-02, VID-04 | T-03-18 / T-03-19 / T-03-20 | Capture never mutates microphone; permission/cancel/conflict/ended/departure/scope exits clean exact media | unit/component | `npm test -- __tests__/screen-share-context.test.tsx __tests__/audio-context.test.tsx __tests__/space-audio-controls.test.tsx` | ⚠️ baseline partial; completed in 03-11 | ⬜ pending |
| 03-05-01 | 03-05 | 8 | VID-04 | T-03-17 / T-03-18 | Canonical expanded/collapsed stage satisfies approved UI-SPEC states and restores stable layout | component | `npm test -- __tests__/floor-plan-presentation-stage.test.tsx` | ❌ planned in 03-05 | ⬜ pending |
| 03-06-01 | 03-06 | 9 | VID-01, VID-02, VID-04 | Two-context deterministic Chromium exercises integrated UI/lifecycle while keeping simulated-media claims bounded | browser UI | `npm test -- __tests__/floor-plan-presentation-stage.test.tsx __tests__/screen-share-context.test.tsx && npx playwright test --project=screen-sharing --grep "@smoke" --workers=1` | ❌ planned in 03-06 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Planned Test Artifacts and Owners

- [ ] `__tests__/webrtc-manager.test.ts` — 03-10 creates the production-path fake peer suite; 03-03 expands glare, ignored-offer ICE, display sender lifecycle, late peer join, and cleanup.
- [ ] `__tests__/screen-share-context.test.tsx` — 03-11 owns capture/claim/publish ordering, browser errors, conflict, ended, release, scope fences, and no microphone side effects.
- [ ] `__tests__/floor-plan-presentation-stage.test.tsx` — 03-05 owns canonical media rendering, viewer-local expansion, stable-layout restoration, and the complete approved UI contract.
- [ ] `__tests__/space-audio-controls.test.tsx` — 03-05 owns explicit microphone enable/mute/unmute and speaker indication regressions.
- [ ] `__tests__/presence-db/screen-share-lease.test.ts` — 03-02 owns real Postgres claim races, identity/session/occupancy fences, idempotent release, and expiry.
- [ ] `__tests__/presence-db/screen-share-realtime-policy.test.ts` — 03-02 owns real private Broadcast/Presence policies scoped by company, space, application user, and session.
- [ ] `__tests__/api/playwright/screen-sharing.spec.ts` — 03-06 owns deterministic two-context UI lifecycle only; 03-12 runs the complete project, and 03-13 separately proves real media.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two authenticated occupants hear room audio while each microphone remains off until explicitly enabled | VID-02 | Mocks cannot prove real browser permissions, peer delivery, or multi-user isolation | Use two separate authenticated browser identities in one space; verify listen-only entry, then enable/mute/unmute one microphone and observe remote audio plus speaking indication |
| One real display track reaches the other occupant and ends cleanly | VID-01, VID-04 | Browser screen picker and end-to-end WebRTC/TURN behavior require real identities and media devices | Share a tab/window/screen from one identity; expand/collapse on the viewer; stop from browser chrome, leave the space, and close the presenter tab; verify audio survives and the stage resets |
| Concurrent presenter attempt has exactly one winner | VID-04 | Real client timing plus database serialization cannot be proven by component mocks | Trigger sharing from two identities as concurrently as practical; verify one canonical presenter, visible conflict for the loser, and immediate local-track cleanup for the loser |
| P2P connectivity works across restrictive networks using configured TURN | VID-01 | Local tests cannot prove NAT traversal or deployed TURN credentials | Place the two identities on different real networks, record redacted ICE connection state/candidate type, and verify audio plus screen delivery; treat missing/invalid TURN as a rollout blocker |
| Supported-browser matrix handles picker availability and cancellation | VID-04 | `getDisplayMedia` behavior differs by browser and platform | Run the acceptance flow in company-supported Chrome, Firefox, and Safari versions; where unsupported, verify the CTA is disabled with a clear explanation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Every planned missing test artifact has an owning plan and executable command
- [ ] No watch-mode flags
- [ ] Focused-test feedback latency is below 120s
- [ ] Real database tests run from a clean disposable local reset; Docker unavailability is reported as a blocker, never a skip
- [ ] Target migration/policy catalog readback and smoke check are recorded before private-channel application rollout
- [ ] Multi-user browser/TURN UAT is completed before claiming VID-01 or VID-04 reliability
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
