---
phase: 2
slug: floor-plan-completion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
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
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm run test:coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | FLOR-01 | unit | `npx vitest run __tests__/knock-banner.test.tsx -x` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | FLOR-01 | unit | `npx vitest run __tests__/knock-auto-join.test.tsx -x` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | FLOR-02 | unit | `npx vitest run __tests__/presence-animation.test.tsx -x` | ✅ extend | ⬜ pending |
| 02-03-01 | 03 | 2 | FLOR-03 | unit | `npx vitest run __tests__/default-space-assignment.test.tsx -x` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | FLOR-03 | unit | `npx vitest run __tests__/company-settings-default-space.test.tsx -x` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 2 | FLOR-04 | unit | `npx vitest run __tests__/reconnection-grace.test.tsx -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `__tests__/knock-banner.test.tsx` — stubs for FLOR-01 knock button & banner
- [ ] `__tests__/knock-auto-join.test.tsx` — stubs for FLOR-01 auto-join flow
- [ ] `__tests__/default-space-assignment.test.tsx` — stubs for FLOR-03 default space
- [ ] `__tests__/company-settings-default-space.test.tsx` — stubs for FLOR-03 admin UI
- [ ] `__tests__/reconnection-grace.test.tsx` — stubs for FLOR-04 grace period

*Existing `__tests__/presence-animation.test.tsx` needs extension for fade-out behavior.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Knock sound plays on notification | FLOR-01 | Audio playback requires real browser | Open two browser tabs, knock from one, verify knock.mp3 plays on other |
| 3-second fade-out is visually smooth | FLOR-02 | Animation smoothness is perceptual | Go offline in one tab, observe avatar fade in other tab — should be GPU-accelerated |
| Realtime knock notification across tabs | FLOR-01 | End-to-end Supabase Realtime | Two browser sessions: knock from one, verify banner appears in other within 2s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
