---
phase: 2
reviewers: [codex]
reviewed_at: 2026-05-13T15:32:44Z
plans_reviewed:
  - 02-00-PLAN.md
  - 02-01-PLAN.md
  - 02-02-PLAN.md
  - 02-03-PLAN.md
  - 02-04-PLAN.md
  - 02-05-PLAN.md
  - 02-06-PLAN.md
  - 02-07-PLAN.md
cli_status:
  gemini: missing
  claude: unavailable_subscription_disabled
  codex: success
---

# Cross-AI Plan Review - Phase 2

## Codex Review

I’ll review this as a plan-quality and regression-risk pass, with the presence/offline bug as the main lens. I’m using the `presence-safety` and `supabase` skills because the plans touch realtime presence, location APIs, and Supabase state boundaries.

## Summary

The plans are directionally strong and show good awareness of the major Phase 2 failure modes, especially after the gap-closure plans. The main weakness is that the plan set contains conflicting presence rules: early plans clear `current_space_id` on offline cleanup, while later reload-recovery logic depends on preserving it. That conflict, combined with insufficient explicit filtering of `status === 'offline'` users from `usersInSpaces`, is the most likely path to the observed ghost/offline users regression.

## Strengths

- The later gap-closure plans correctly identify several real root causes: premature offline derivation before Realtime sync, peer clients mutating other users’ location, duplicate placement paths, and stale reload behavior.
- Server-side authorization in `02-04` is a necessary hardening step; location updates should not trust the client.
- The plans mostly reuse existing architecture: `useUserPresence`, `useLastSpace`, `PresenceContext`, `companies.settings`, and `/api/users/location`.
- The explicit attention to `users.id` vs `supabase_uid` is good and prevents a common Supabase/Auth bug.
- `02-05` is especially relevant to the regression class: presence readiness gating and removal of peer cleanup POSTs are important.

## Concerns

- **HIGH: Offline users with preserved `current_space_id` are not explicitly filtered everywhere.**  
  If offline users keep `current_space_id` for reload recovery, `usersInSpaces` must exclude them, except possibly the current user during hydration. The observed ghost users strongly suggests offline DB rows with non-null `current_space_id` are leaking into floor-plan rendering.

- **HIGH: `02-02` conflicts with the safer reload model.**  
  It says offline cleanup should clear `users.current_space_id`. Later plans depend on preserving space occupancy for reload/grace recovery. This needs one canonical rule. The safer rule is: offline beacon sets `status: offline` only; it must not clear `current_space_id`.

- **HIGH: `02-07` last-active fallback is overbroad.**  
  Allowing restricted-space rejoin based only on recent `last_active` can authorize entry to the wrong restricted space. It must also prove same-space prior occupancy, current-space match, or an open presence log for that exact space.

- **HIGH: `authenticatedUser.currentSpaceId === spaceId` as a restricted-space bypass can become permanent access.**  
  If `current_space_id` is preserved while offline, this bypass may allow private-room re-entry after the 5-minute grace period. Bound it by status, recent activity, or an explicit prior occupancy rule.

- **HIGH: The plans do not add a direct regression test for “offline users with non-null `current_space_id` must not render.”**  
  This is the exact shape of the reported ghost/offline issue.

- **MEDIUM: `useLastSpace` and `floor-plan.tsx` risk using stale `CompanyContext.currentUserProfile`.**  
  Placement guards that depend on `currentSpaceId` should use query-derived/live presence data, not the profile loaded once at startup.

- **MEDIUM: Plan `02-01` stores only one pending knock per space and timeout cleanup can delete a newer knock.**  
  The timeout should check `requestId` before deleting the pending request.

- **MEDIUM: Many Wave 0 tests are `it.todo`, so early verification gives false confidence.**  
  Later plans improve this, but the critical presence regression still needs executable tests.

## Plan-by-Plan Notes

| Plan | Assessment |
|---|---|
| `02-00` | Useful scaffold, but low validation value because `it.todo` tests do not prove behavior. Risk: **LOW** by itself. |
| `02-01` | Good UX wiring for knock-to-enter. Add request-id-safe banner timeout cleanup and test multiple knocks. Risk: **MEDIUM**. |
| `02-02` | Implements the right feature area but creates the biggest conflict by clearing `current_space_id` on offline. This can cause reload races and later ghost-state confusion. Risk: **HIGH**. |
| `02-03` | Good default/home-space model, but first-login via global localStorage is fragile and placement must preserve manual-click guards. Risk: **MEDIUM**. |
| `02-04` | Strong security direction, but restricted-space bypass rules need tightening around preserved `current_space_id` and grace. Risk: **MEDIUM-HIGH**. |
| `02-05` | Strongest regression-focused plan. It fixes premature offline derivation and peer eviction, but must also require `usersInSpaces` offline filtering. Risk after amendment: **MEDIUM**. |
| `02-06` | Sensible admin-settings gap closure. Add explicit admin/company authorization check if RLS does not guarantee it. Risk: **MEDIUM**. |
| `02-07` | Correctly removes duplicate UI-only placement path, but the `last_active` authorization fallback is unsafe unless tied to same-space evidence. Risk: **HIGH**. |

## Suggestions

- Make one canonical presence invariant explicit in the plans: DB keeps `current_space_id` for reload recovery, UI filters offline users out of spaces.
- Add executable tests for:
  - offline user with non-null `currentSpaceId` does not appear in `usersInSpaces`;
  - current user may hydrate without ghosting other offline users;
  - peer entering/leaving another room does not reintroduce offline users;
  - capacity counts exclude `status = offline`;
  - restricted grace rejoin requires same-space prior occupancy.
- Amend `/api/users/location` offline beacon handling so `offline: true` ignores `spaceId: null` for location and only updates status.
- Replace broad `last_active` restricted-space rejoin with exact-space evidence: open log, recent exited log for same `space_id`, or current live DB occupancy.
- Ensure `useLastSpace` receives the live current user from presence/query cache, not stale company profile state.

## Risk Assessment

**Overall risk: HIGH** until the presence invariants are reconciled.

The plans contain enough fixes to address parts of the observed regression, but the current set still leaves a direct path for ghost users: offline users retain or regain `current_space_id`, a Realtime or query refresh rebuilds space buckets, and offline filtering is either missing, inconsistent, or tested only indirectly. The next plan should be a narrow regression fix around `usersInSpaces` filtering, beacon semantics, and same-space grace authorization.

---

## Consensus Summary

Only Codex completed successfully. Gemini was not installed, and Claude Code is installed but unavailable because organization subscription access is disabled. Therefore this section records single-reviewer consensus rather than true multi-reviewer agreement.

### Agreed Strengths

- Later Phase 2 gap-closure plans target real presence/reload failure modes.
- Server-side `/api/users/location` authorization is a necessary hardening point.
- The plan set mostly works with existing architecture instead of inventing a parallel presence system.

### Agreed Concerns

1. **Offline users retaining `current_space_id` can render as ghost avatars unless `usersInSpaces` filters them out.**
2. **The plans conflict on whether offline cleanup should clear or preserve `current_space_id`; preserve it for reload recovery, and filter offline users in rendering/capacity logic.**
3. **Restricted-space grace rejoin based on broad `last_active` or preserved `current_space_id` can become unsafe without same-space evidence and time bounds.**

### Divergent Views

No divergent reviewer views were available because only Codex completed.
