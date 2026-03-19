---
phase: 02-floor-plan-completion
plan: 01
subsystem: ui
tags: [react, nextjs, floor-plan, realtime, sonner]
requires:
  - phase: 01-stabilization
    provides: stable floor-plan card foundation and existing knock sound behavior
provides:
  - occupant-facing KnockBanner rendered inside ModernSpaceCard
  - inline restricted-room knock CTA reusing SpaceActionButtons state handling
  - ModernFloorPlan routing of incoming knocks to specific space cards with requester auto-join on approval
affects: [phase-02-floor-plan-completion, floor-plan, knock-to-enter, presence]
tech-stack:
  added: []
  patterns:
    - per-space UI routing via Map state keyed by spaceId
    - reusable action component branching with panel and inline-card layouts
key-files:
  created:
    - src/components/floor-plan/modern/KnockBanner.tsx
  modified:
    - src/components/floor-plan/modern/SpaceActionButtons.tsx
    - src/components/floor-plan/modern/ModernSpaceCard.tsx
    - src/components/floor-plan/modern/ModernFloorPlan.tsx
key-decisions:
  - "Extended SpaceActionButtons with an inline-card layout instead of building a second knock CTA component."
  - "Replaced ModernFloorPlan's toast.custom occupant alert with per-space banner state keyed by spaceId."
  - "Kept useKnock and useKnockSignaling as the single knock state path, adding only UI routing and timeout presentation on top."
patterns-established:
  - "Restricted-space card CTAs should reuse shared action components and mark wrappers with click-stop attributes."
  - "Incoming realtime room alerts can be routed to their owning card via spaceId-indexed Map state."
requirements-completed: [FLOR-01]
duration: 11m
completed: 2026-03-19
---

# Phase 2 Plan 1: Knock-to-enter UX Summary

**In-card knock banners with shared restricted-room CTAs and requester auto-join routed through ModernFloorPlan**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-19T10:52:00Z
- **Completed:** 2026-03-19T11:03:28Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `KnockBanner` as the occupant-facing alert inside space cards with approve and deny controls, accessible live-region markup, and click-stop protection.
- Reused `SpaceActionButtons` for a visible inline restricted-room CTA so card-level knock state stays consistent with the existing panel and bottom-sheet flows.
- Rewired `ModernFloorPlan` to route incoming knocks to the correct card, remove the `KnockToast` dependency from that flow, and preserve requester auto-join plus updated status toasts.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create KnockBanner and surface a card-level knock CTA by reusing SpaceActionButtons** - `7b3ac7a` (feat)
2. **Task 2: Wire knock flow through ModernFloorPlan -- replace toast with per-card banner routing** - `68a5837` (feat)

## Files Created/Modified
- `src/components/floor-plan/modern/KnockBanner.tsx` - New banner component for incoming knock alerts inside the space card.
- `src/components/floor-plan/modern/SpaceActionButtons.tsx` - Added `layout` branching and inline-card knock button states without replacing panel behavior.
- `src/components/floor-plan/modern/ModernSpaceCard.tsx` - Accepts pending knock request props, renders `KnockBanner`, and shows the always-visible restricted-space CTA.
- `src/components/floor-plan/modern/ModernFloorPlan.tsx` - Tracks pending knock requests per space, handles banner approve/deny actions, and updates requester toast/timeout behavior.

## Decisions Made
- Reused `SpaceActionButtons` instead of introducing another card-specific knock button component so the knock state labels and cooldown behavior remain centralized.
- Scoped incoming knock alerts to the owning card via `Map<string, KnockRequestPayload>` in `ModernFloorPlan`, which removed the need for global toast UI while keeping realtime signaling unchanged.
- Added a short-lived `timeoutSpaceId` presentation state in `ModernFloorPlan` so the inline card CTA can briefly show the `No response` state before the shared `useKnock` hook resets.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The plan's Vitest commands used `-x`, which this repo's `vitest` CLI does not support. I reran the same targeted files without `-x`; both files currently exist but are fully skipped/todo, so build verification was the effective automated check.
- A transient `.next/lock` contention occurred when two build processes overlapped during verification. Re-running a single build completed cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Floor plan knock UX now renders occupant notifications in-card and keeps requester state on the owning restricted-space card.
- Follow-up phase work can build on the same `ModernFloorPlan` per-space routing pattern for other floor-plan realtime UI without reintroducing global toast ownership.

## Self-Check: PASSED

- Verified `.planning/phases/02-floor-plan-completion/02-01-SUMMARY.md` exists.
- Verified task commits `7b3ac7a` and `68a5837` exist in git history.
- Verified `KnockBanner` is referenced from the modern floor-plan components and click-stop attributes are present in the new banner/card flow.

---
*Phase: 02-floor-plan-completion*
*Completed: 2026-03-19*
