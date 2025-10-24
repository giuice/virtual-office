# Implementation Plan: Playwright E2E — Messaging Drawer Interactions

**Branch**: `001-drawer-e2e-tests` | **Date**: 2025-10-24 | **Spec**: /home/giuice/apps/virtual-office/specs/001-drawer-e2e-tests/spec.md
**Input**: Feature specification from `/specs/001-drawer-e2e-tests/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement Playwright E2E tests for Messaging Drawer interactions in the Virtual Office Next.js app, validating open/select DM/send/verify realtime delivery, filter by pinned, switch tabs, persist drawer on navigation, archive/unarchive flows. Use dual browser contexts for realtime verification, seed test data via API fixtures, and ensure deterministic CI runs with bounded waits.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode)  
**Primary Dependencies**: Next.js 15.3.0, React 19.1.0, Supabase (@supabase/ssr v0.6.1), Playwright, Vitest 3, Testing Library  
**Storage**: Supabase Postgres + Realtime, RLS enabled  
**Testing**: Playwright (E2E), Vitest (unit/integration), Testing Library (React components)  
**Target Platform**: Web browser (Chrome/Firefox via Playwright)  
**Project Type**: Web application  
**Performance Goals**: E2E suite run time under 3 minutes on CI standard runners  
**Constraints**: Tests must be deterministic (no flake >2% over 10 runs), realtime message delivery assertions within 3 seconds, use seeded test data for CI safety  
**Scale/Scope**: 5 user flows (send, pinned filter, tab switch, navigation persistence, archive/unarchive), 100% pass rate on main branch

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Project-specific gates derived from the Constitution (must be evidenced in this plan):

1) Anti-Duplication Protocol
  - Paths touched: New test files in `__tests__/e2e/` or similar; reuse existing Playwright config and test utilities from `playwright.config.ts` and `__tests__/` patterns.
  - Exports used: Existing test helpers if any (e.g., from `__tests__/mocks/`).
  - Reasoning (reuse/extend): Extend existing test structure; no duplication of test setup.
  - Deprecations: None.

2) Supabase RLS Enforcement
  - E2E tests use browser Supabase client for UI interactions; no server code involved.
  - No API routes or repositories in tests; authentication via UI login flow.

3) Type Registry & Change Control
  - No type changes required; tests use existing types from `src/types/*`.
  - Change Note: N/A

4) Code Structure & Naming
  - Test files in `__tests__/` with kebab-case filenames; use camelCase for test functions.
  - Repository pattern not applicable; tests interact via UI.

5) UI Interaction — Click-Stop Standard
  - Tests will simulate user clicks; ensure test selectors account for `data-avatar-interactive` and click-stop behavior.
  - No new UI code; tests validate existing interactions.

6) Test & Quality Gates
  - Planned tests: Playwright E2E for the 5 flows.
  - CI gates: `npm run type-check`, `npm run lint`, `npm run test` (existing), plus new E2E tests.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
__tests__/
├── e2e/
│   ├── messaging-drawer-interactions.spec.ts  # New E2E test file
│   └── fixtures/                               # Test data seeding scripts
└── [existing test files]

playwright.config.ts  # Existing, may need updates for new tests
```

**Structure Decision**: Web application with E2E tests added to existing `__tests__/` directory under new `e2e/` subfolder for organization. Reuses existing Playwright config and test patterns.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
