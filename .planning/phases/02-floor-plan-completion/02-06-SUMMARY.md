---
phase: 02-floor-plan-completion
plan: 06
subsystem: api
tags: [nextjs, app-router, supabase, company-settings, floor-plan, settings-merge]
requires:
  - phase: 02-03
    provides: "Default-space admin UI and settings JSONB schema for company configuration"
provides:
  - "Working App Router PATCH handler for /api/companies/update with authentication"
  - "Broadened space filter showing active, available, and in_use spaces in admin dropdown"
  - "Safe settings merge that preserves existing settings JSONB when caller omits settings key"
affects: [company-settings, floor-plan, admin-ui, default-spaces]
tech-stack:
  added: []
  patterns:
    - "App Router route handlers use getUser() for server-side auth validation before mutation"
    - "Settings merge uses explicit undefined guard to prevent JSONB column wipe on partial updates"
key-files:
  created:
    - src/app/api/companies/update/route.ts
  modified:
    - src/components/dashboard/company-settings.tsx
    - src/contexts/CompanyContext.tsx
key-decisions:
  - "Imported SupabaseCompanyRepository from specific file path (matching existing get/route.ts pattern) rather than barrel index"
  - "Used explicit undefined guard for settings merge instead of falsy check to correctly handle empty-object settings payloads"
patterns-established:
  - "Company update API route follows same structure as companies/get and companies/create route handlers"
  - "Settings-carrying save handlers spread company.settings before their own fields; name-only saves omit settings entirely"
requirements-completed: [FLOR-03]
duration: 4m
completed: 2026-03-19
---

# Phase 02 Plan 06: Admin Spaces Tab API Route, Space Filter, and Settings Merge Summary

**App Router PATCH handler for company updates with broadened space filter and safe settings-merge guard preventing JSONB wipe**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-19T20:13:50Z
- **Completed:** 2026-03-19T20:18:17Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments
- Replaced Pages Router companies/update.ts with proper App Router route.ts that returns JSON instead of HTML 404
- Broadened space dropdown filter from active-only to active, available, and in_use -- showing all usable spaces
- Fixed settings merge in CompanyContext to use undefined guard, preventing settings JSONB column from being wiped on name-only saves
- Applied matching undefined guard to optimistic state update for consistency

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert companies/update to App Router format and fix space filter + settings merge** - `3793b21` (fix)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `src/app/api/companies/update/route.ts` - New App Router PATCH handler with auth via getUser()
- `src/app/api/companies/update.ts` - DELETED: old Pages Router handler that caused JSON parse errors
- `src/components/dashboard/company-settings.tsx` - Broadened space filter from active-only to active/available/in_use
- `src/contexts/CompanyContext.tsx` - Fixed settings merge and optimistic update with undefined guard

## Decisions Made
- Imported SupabaseCompanyRepository from specific file (matching sibling routes) rather than barrel index
- Used `data.settings !== undefined` guard instead of truthy check so that empty settings objects `{}` still merge correctly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Next.js 16 + Turbopack build fails with middleware-manifest.json error (pre-existing infra issue, not caused by changes). Build succeeds with webpack mode. TypeScript type-check passes cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- UAT Test 5 (Admin Spaces tab save) root cause is fixed -- API returns JSON and dropdown shows all usable spaces
- UAT Test 7 (default space placement) unblocked -- admin can now configure default spaces without save errors
- Plan 02-07 (reload disappearance and grace-rejoin race) can proceed independently

## Self-Check: PASSED

- FOUND: src/app/api/companies/update/route.ts
- CONFIRMED DELETED: src/app/api/companies/update.ts
- FOUND: src/components/dashboard/company-settings.tsx
- FOUND: src/contexts/CompanyContext.tsx
- FOUND: 02-06-SUMMARY.md
- FOUND: commit 3793b21

---
*Phase: 02-floor-plan-completion*
*Completed: 2026-03-19*
