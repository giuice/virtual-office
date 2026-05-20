---
phase: 2
slug: floor-plan-completion
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-18
updated: 2026-05-13T10:27:26Z
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 + @testing-library/react |
| **Config file** | `vitest.config.mts` |
| **Quick run command** | `npm test` |
| **Targeted Nyquist command** | `npx vitest run __tests__/knock-banner.test.tsx __tests__/knock-auto-join.test.tsx __tests__/default-space-assignment.test.tsx __tests__/company-settings-default-space.test.tsx __tests__/components/floor-plan/modern/SpaceActionButtons.test.tsx __tests__/hooks/useKnock.test.ts __tests__/reconnection-grace.test.tsx __tests__/presence-animation.test.tsx __tests__/api/users-location-route.test.ts --reporter=verbose` |
| **Type check** | `npm run type-check` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated targeted runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's targeted Vitest command.
- **After every plan wave:** Run the Phase 2 targeted Nyquist command above.
- **Before `/gsd-verify-work`:** Run targeted Nyquist command + `npm run type-check`; optionally run full suite for broader regression sweep.
- **Max feedback latency:** Targeted suite completes well under 30 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-00-01 | 00 | 0 | FLOR-01 | scaffold/coverage seed | `npx vitest run __tests__/knock-banner.test.tsx __tests__/knock-auto-join.test.tsx --reporter=verbose` | ✅ exists | ✅ green |
| 02-00-02 | 00 | 0 | FLOR-03, FLOR-04 | scaffold/coverage seed | `npx vitest run __tests__/default-space-assignment.test.tsx __tests__/company-settings-default-space.test.tsx __tests__/reconnection-grace.test.tsx --reporter=verbose` | ✅ exists | ✅ green |
| 02-01-01 | 01 | 1 | FLOR-01 | component | `npx vitest run __tests__/knock-banner.test.tsx __tests__/components/floor-plan/modern/SpaceActionButtons.test.tsx --reporter=verbose` | ✅ exists | ✅ green |
| 02-01-02 | 01 | 1 | FLOR-01 | integration-ish component/hook | `npx vitest run __tests__/knock-auto-join.test.tsx __tests__/hooks/useKnock.test.ts --reporter=verbose` | ✅ exists | ✅ green |
| 02-02-01 | 02 | 1 | FLOR-02 | component | `npx vitest run __tests__/presence-animation.test.tsx --reporter=verbose` | ✅ exists | ✅ green |
| 02-03-01 | 03 | 2 | FLOR-03 | hook/unit | `npx vitest run __tests__/default-space-assignment.test.tsx --reporter=verbose` | ✅ exists | ✅ green |
| 02-03-02 | 03 | 2 | FLOR-03 | component | `npx vitest run __tests__/company-settings-default-space.test.tsx --reporter=verbose` | ✅ exists | ✅ green |
| 02-03-03 | 03 | 2 | FLOR-04 | hook/unit | `npx vitest run __tests__/reconnection-grace.test.tsx --reporter=verbose` | ✅ exists | ✅ green |
| 02-04-01 | 04 | 3 | FLOR-01, FLOR-04 | API route | `npx vitest run __tests__/api/users-location-route.test.ts --reporter=verbose` | ✅ exists | ✅ green |
| 02-05-01 | 05 | 4 | FLOR-02, FLOR-04 | presence regression | `npx vitest run __tests__/presence-animation.test.tsx __tests__/api/users-location-route.test.ts --reporter=verbose` | ✅ exists | ✅ green |
| 02-06-01 | 06 | 4 | FLOR-03 | settings regression | `npx vitest run __tests__/company-settings-default-space.test.tsx --reporter=verbose` | ✅ exists | ✅ green |
| 02-07-01 | 07 | 4 | FLOR-04 | reconnection/API regression | `npx vitest run __tests__/reconnection-grace.test.tsx __tests__/api/users-location-route.test.ts --reporter=verbose` | ✅ exists | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Requirement Coverage

| Requirement | Automated Coverage | Status |
|-------------|--------------------|--------|
| FLOR-01 — Knock-to-enter approval/denial workflow | `knock-banner`, `knock-auto-join`, `SpaceActionButtons`, `useKnock`, `users-location-route` | ✅ covered |
| FLOR-02 — Offline removal with fade behavior | `presence-animation`, route regression coverage for cleanup-sensitive grace paths | ✅ covered |
| FLOR-03 — Default/home spaces and settings preservation | `default-space-assignment`, `company-settings-default-space` | ✅ covered |
| FLOR-04 — 5-minute grace rejoin | `reconnection-grace`, `users-location-route` | ✅ covered |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Knock sound plays on notification | FLOR-01 | Audio playback requires real browser/autoplay policy behavior | Open two browser tabs, knock from one, verify knock.mp3 plays on the occupant tab when browser policy permits playback |
| 3-second fade-out is visually smooth | FLOR-02 | Animation smoothness is perceptual, even though CSS class hooks are automated | Go offline in one tab, observe avatar fade in another tab; fade should be smooth and GPU-friendly |
| Realtime knock notification across tabs | FLOR-01 | End-to-end Supabase Realtime timing requires live browser sessions | Two browser sessions: knock from one, verify banner appears in the occupant's space card within ~2 seconds |
| Browser reload race timing | FLOR-04 | True beacon/reload ordering depends on browser and network timing | Join a restricted space, reload within 5 minutes, confirm automatic rejoin without a new knock |

Manual-only items are UX/environment checks; every requirement has automated behavioral coverage.

---

## Validation Audit 2026-05-13

| Metric | Count |
| ------ | ----- |
| Gaps found | 4 |
| Resolved | 4 |
| Escalated | 0 |

Resolved gaps:

1. FLOR-01 TODO-only `knock-banner` and `knock-auto-join` stubs replaced with executable tests.
2. FLOR-01 stale `SpaceActionButtons` cooldown expectation updated to match implemented/spec copy: `Wait 42s`.
3. FLOR-03 TODO-only default-space resolver tests replaced with executable `getReconnectionContext` cases.
4. FLOR-03 TODO-only company settings tests replaced with executable settings merge/render/admin-guard coverage.

Targeted audit result:

```text
Test Files  9 passed (9)
Tests       76 passed (76)
```

Type-check result:

```text
npm run type-check  # passed
```

---

## Validation Sign-Off

- [x] All tasks have automated verification or documented manual-only UX checks
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 scaffold references are now executable tests
- [x] No watch-mode flags in validation commands
- [x] Feedback latency < 30s for targeted suite
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** passed
