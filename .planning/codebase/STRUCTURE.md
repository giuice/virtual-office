# Codebase Structure

**Analysis Date:** 2026-07-22

## Directory Layout

```text
virtual-office/
├── src/
│   ├── app/                 # Next.js App Router pages, layouts, and APIs
│   ├── components/          # Feature and shared UI
│   ├── contexts/            # Session-wide client state
│   ├── hooks/               # Queries, mutations, Realtime, and orchestration
│   ├── lib/                 # Domain services, API clients, infrastructure
│   ├── providers/           # Cross-cutting React providers
│   ├── repositories/        # Interfaces and Supabase implementations
│   ├── styles/              # Additional styles
│   ├── types/               # Shared semantic types
│   └── utils/               # Small shared utilities/logging
├── __tests__/               # Unit, component, API, DB, and Playwright tests
├── supabase/
│   ├── migrations/          # Canonical ordered database changes
│   └── config.toml          # Local Supabase configuration
├── scripts/                 # Test gates, concurrency, auth metrics, utilities
├── docs/                    # Architecture, product, remediation, and legacy docs
├── public/                  # Static assets
├── .github/workflows/       # CI pipelines
├── .agents/ and .codex/     # Agent rules, skills, hooks, and GSD runtime
└── .planning/               # GSD roadmap, phases, state, and codebase map
```

## Directory Purposes

**`src/app/`:**
- Route groups `(auth)` and `(dashboard)` organize authenticated experiences without changing URLs.
- `src/app/api/` contains roughly fifty App Router route handlers.
- `src/app/platform-admin/`, `src/app/admin/`, `src/app/onboarding/`, and `src/app/join/` are specialized flows.
- `src/app/debug/` and `src/app/tools/` contain diagnostic/maintenance pages and require explicit production-access review.

**`src/components/`:**
- Feature folders include `floor-plan/`, `messaging/`, `dashboard/`, `presence/`, `profile/`, `auth/`, and `shell/`.
- Shared shadcn/Radix primitives live in `src/components/ui/`.
- Canonical avatars are `src/components/ui/enhanced-avatar-v2.tsx` and `src/components/profile/UploadableAvatar.tsx`.

**`src/hooks/`:**
- General feature hooks remain directly under `src/hooks/`.
- Query-only hooks belong in `src/hooks/queries/`.
- Mutations belong in `src/hooks/mutations/`.
- Realtime subscriptions/signaling belong in `src/hooks/realtime/`.

**`src/lib/`:**
- `src/lib/presence/` contains contracts, verified sessions, transition coordination, topic builders, and rollout gates.
- `src/lib/auth/` contains validated session/authorization and rate-limit helpers.
- `src/lib/supabase/` contains server/browser client factories.
- `src/lib/webrtc/` contains the current P2P audio engine and ICE configuration.
- `src/lib/api.ts` and `src/lib/messaging-api.ts` are browser-facing same-origin clients.

**`src/repositories/`:**
- Interfaces under `src/repositories/interfaces/` define persistence boundaries.
- Implementations under `src/repositories/implementations/supabase/` receive a Supabase client.
- `src/repositories/getSupabaseRepositories.ts` constructs a repository set.

**`__tests__/`:**
- `__tests__/api/` covers route handlers.
- `__tests__/api/playwright/` contains browser/API E2E projects.
- `__tests__/presence-db/` runs against local Postgres/Supabase.
- Domain/component tests follow source feature names.

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: global React composition.
- `src/proxy.ts`: page session validation and cookie refresh.
- `src/app/(dashboard)/floor-plan/page.tsx`: principal spatial-office experience.
- `src/app/api/**/route.ts`: HTTP API handlers.

**Configuration:**
- `package.json`: commands and dependencies.
- `tsconfig.json`: TypeScript strict mode and `@/*` alias.
- `next.config.ts`: isolated build output overrides.
- `eslint.config.mjs`: ESLint flat config.
- `vitest.config.mts`, `vitest.*.config.mts`: test suite boundaries.
- `playwright.config.ts`: E2E projects and local server lifecycle.
- `supabase/config.toml`: local Supabase stack.

**Core Logic:**
- `src/lib/presence/`: Presence contracts and server-authoritative transition logic.
- `src/contexts/CompanyContext.tsx`: tenant bootstrap and company state.
- `src/repositories/implementations/supabase/`: persisted domain behavior.
- `src/lib/webrtc/WebRTCManager.ts`: audio peer connections.
- `src/lib/messaging-api.ts`: messaging HTTP client.

**Testing:**
- `vitest.setup.ts`: global DOM/Supabase mocks.
- `__tests__/guards/`: architecture/safety guard tests.
- `scripts/presence-movement-gate.mjs`: static Presence writer/caller gate.
- `.github/workflows/presence-remediation.yml`: complete Presence CI contract.

## Naming Conventions

**Files:**
- React components: PascalCase, for example `ModernFloorPlan.tsx` and `MessagingDrawer.tsx`.
- Hooks: `useX.ts` / `useX.tsx`, for example `usePresenceSession.ts`.
- App Router handlers: `route.ts`; pages/layouts: `page.tsx`, `layout.tsx`.
- Repository interfaces: `I<Name>Repository.ts`; implementations: `Supabase<Name>Repository.ts`.
- Tests: `<behavior>.test.ts[x]` and Playwright `<flow>.spec.ts`.
- SQL migrations: `YYYYMMDDHHMMSS_description.sql`.

**Directories:**
- Feature directories use lowercase or kebab-case (`floor-plan`, `platform-admin`).
- Dynamic App Router segments use brackets (`[id]`, `[sessionId]`).
- Route groups use parentheses (`(auth)`, `(dashboard)`).

## Where to Add New Code

**New UI feature:**
- Page/screen: `src/app/<route>/page.tsx`.
- Feature components: `src/components/<feature>/`.
- Shared primitive: `src/components/ui/` only when reusable across features.
- Tests: matching feature path under `__tests__/`.

**New server/API feature:**
- Handler: `src/app/api/<resource>/route.ts`.
- Validation/domain contracts: `src/lib/<domain>/`.
- Repository interface and Supabase implementation: `src/repositories/interfaces/` and `src/repositories/implementations/supabase/`.
- Route tests: `__tests__/api/`.

**New query/mutation/realtime behavior:**
- Query: `src/hooks/queries/`.
- Mutation: `src/hooks/mutations/`.
- Subscription: `src/hooks/realtime/`.
- Complex pure coordination: `src/lib/<domain>/`, not a component.

**Database change:**
- Migration: `supabase/migrations/<timestamp>_<description>.sql`.
- Add RLS/grants and tests in the same work package.
- Follow `.agents/skills/supabase/SKILL.md` and the Supabase/RLS review gate.

**Presence/space/knock change:**
- Read `.agents/skills/presence-safety/SKILL.md` first.
- Reuse `src/lib/presence/`, `/api/presence/location`, and scoped query keys.
- Add the required Presence unit, DB, concurrency, and/or E2E evidence.

## Special Directories

**`.planning/`:**
- Purpose: GSD project state and generated reference artifacts.
- Generated: Partly.
- Committed: Controlled by `.planning/config.json`; currently configured to commit docs.

**`.next*`, `test-results/`, `playwright-report/`:**
- Purpose: Generated build/test output.
- Generated: Yes.
- Committed: No; ignored by `.gitignore`.

**`docs/presence-remediation/`:**
- Purpose: Historical evidence, implementation specs, rollout, and audit records.
- Generated: Mixed.
- Committed: Yes; treat as evidence, not necessarily current source-of-truth architecture.

**`.agents/`, `.codex/`:**
- Purpose: Repository-specific agent skills, hooks, and GSD runtime.
- Generated: Mixed installation and project-owned content.
- Committed: Project-dependent; preserve user changes and do not hand-edit generated runtime files casually.

---

*Structure analysis: 2026-07-22*
