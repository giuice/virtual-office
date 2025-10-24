<!--
Sync Impact Report
- Version change: 0.0.0 → 1.0.0
- Modified principles: N/A (initial ratification)
- Added sections: Core Principles; Additional Constraints & Stack Invariants; Development Workflow, Review Process, Quality Gates; Governance
- Removed sections: None
- Templates requiring updates:
	- ✅ .specify/templates/plan-template.md (Constitution Check gates aligned)
	- ⚠ .specify/templates/spec-template.md (review alignment with new principles) 
	- ⚠ .specify/templates/tasks-template.md (review examples vs. independence requirement)
	- ⚠ README.md (outdated DB/auth references; update to Supabase + RLS)
- Follow-ups / TODOs:
	- TODO(README_UPDATE): Replace DynamoDB/Firebase mentions with Supabase Postgres + Auth and RLS guidance.
	- TODO(TEMPLATE_AUDIT): If command templates are added under .specify/templates/commands/, ensure no agent-specific references (e.g., CLAUDE) remain.
-->

# Virtual Office Constitution
<!-- Example: Spec Constitution, TaskFlow Constitution, etc. -->

## Core Principles

### I. Reuse-First and Anti-Duplication (NON-NEGOTIABLE)
<!-- Example: I. Library-First -->
- Execute the Anti-Duplication Protocol before coding: search, reuse or extend, never duplicate.
- Prefer edits to existing code over adding new files; if creating new files, justify why no suitable target exists.
- Any extension must list: Paths touched, Exports used, Reasoning (reuse/extend), and Deprecations if replacing prior duplicates.
- Keep files under ~500 lines; extract cohesive subcomponents/hooks.
Rationale: Minimizes divergence, reduces maintenance cost, and preserves shared contracts.

### II. Supabase RLS & Server Context Enforcement (NON-NEGOTIABLE)
<!-- Example: II. CLI Interface -->
- Never use the browser Supabase client in API routes or server code.
- In API routes and server logic, call `createSupabaseServerClient()` from `src/lib/supabase/server-client.ts` and pass that instance to repositories.
- Use `src/lib/supabase/browser-client.ts` only in Client Components.
- Reason: `auth.uid()` requires server context; otherwise Row Level Security (RLS) policies fail.
Rationale: Preserves data security and ensures RLS correctness by construction.

### III. Type Registry & Change Control
<!-- Example: III. Test-First (NON-NEGOTIABLE) -->
- Canonical types live in `src/types/` (e.g., `auth.ts`, `common.ts`, `database.ts`, `messaging.ts`, `ui.ts`).
- Do not create new types if a semantic equivalent exists; extend existing ones.
- Allowed roles are strictly `type UserRole = 'admin' | 'member'` — do not add roles.
- Type changes require a brief “Change Note” in the PR: why insufficient, what changed, impacted modules.
Rationale: Centralized types safeguard contracts across features and reduce regressions.

### IV. Test Discipline & Quality Gates
<!-- Example: IV. Integration Testing -->
- Tests are required: Vitest (unit/integration), Testing Library (React), Playwright (e2e as applicable).
- CI gates: `npm run type-check`, `npm run lint`, `npm run test` must pass prior to merge.
- Prefer TDD for complex behavior; follow Red-Green-Refactor when feasible.
- Add or update tests with every contract or behavior change; include acceptance scenarios.
Rationale: Prevents regressions and encodes user intent as executable checks.

### V. Code Structure, Naming, and Interaction Contracts
<!-- Example: V. Observability, VI. Versioning & Breaking Changes, VII. Simplicity -->
- Repository pattern lives under `src/repositories/`; construct repositories with the server Supabase client in API routes.
- Business logic in utilities/services; UI in components; state via TanStack Query v5 + React Context.
- Naming conventions: PascalCase for exported React components and filenames; kebab-case for directories and non-component files; camelCase for vars/functions; `use-*` for hook filenames; `handle*`, `is/has/can` prefixes for clarity.
- UI Interaction — Click-Stop Standard: mark interactive children with `data-avatar-interactive`; guard parent click handlers to avoid portal-bubbled events; stop propagation in Radix/shadcn dropdown content and items as specified.
- Avatars: Canonical components are `EnhancedAvatarV2` (display) and `UploadableAvatar` (upload). Replace deprecated avatar components as files are touched.
Rationale: Consistent structure and interaction contracts simplify composition and prevent accidental navigation/UX bugs.

## Additional Constraints & Stack Invariants
<!-- Example: Additional Constraints, Security Requirements, Performance Standards, etc. -->

- Framework: Next.js 15.3.0 (App Router, Server Components, Route Handlers, Server Actions)
- Runtime: React 19.1.0 / React DOM 19.1.0
- Language: TypeScript 5 (strict mode)
- Data: Supabase Postgres + Realtime, RLS enabled
- Auth: Supabase Auth with SSR (@supabase/ssr v0.6.1)
- UI: TailwindCSS 4.1.3, shadcn/ui, Radix
- State: TanStack Query v5 + React Context
- Tests: Vitest 3, Playwright, Testing Library
- New files must live within existing feature folders; do not add new top-level directories.
- Do not guess; if unknown, state “I don’t know.” Do not assume code behavior — provide tests.
Rationale: These invariants are required for consistency, security (RLS), and maintainability across the codebase.

## Development Workflow, Review Process, Quality Gates
<!-- Example: Development Workflow, Review Process, Quality Gates, etc. -->

- Every PR must include: Anti-Duplication report (Paths touched, Exports used, Reasoning, Deprecations) and any Type Registry “Change Note”.
- Verify Supabase usage: server client in API routes; no browser client in server code; pass server client to repositories.
- Enforce naming conventions and repository pattern boundaries.
- UI changes must uphold the Click-Stop Standard and use canonical avatar components.
- Pre-merge checks: type-check, lint, unit/integration tests; add Playwright e2e if user journey is impacted.
- Manual verification steps should include: routes to open, role used (`admin` or `member`), expected UI/DB outcomes.
- All changes remain under **Status: Pending user confirmation** until verified by the requestor.
Rationale: Establishes consistent review expectations and traceable compliance with principles.

## Governance
<!-- Example: Constitution supersedes all other practices; Amendments require documentation, approval, migration plan -->

- This Constitution supersedes other practices where conflicting; local deviations MUST be justified in the PR and time-bounded.
- Amendments require a PR that: explains the change, includes migration/consistency steps, and updates dependent templates/docs.
- Versioning policy (semantic):
	- MAJOR: Backward-incompatible rewrites of principles or removals.
	- MINOR: New principle/section added or materially expanded guidance.
	- PATCH: Clarifications and non-semantic wording fixes.
- Compliance reviews are part of code review; periodic audits ensure adherence (RLS usage, Type Registry, Anti-Duplication, UI contracts).
- Guidance docs (e.g., README, quickstarts) must not contradict these principles; discrepancies MUST be corrected.

**Version**: 1.0.0 | **Ratified**: 2025-10-24 | **Last Amended**: 2025-10-24
<!-- Example: Version: 2.1.1 | Ratified: 2025-06-13 | Last Amended: 2025-07-16 -->
