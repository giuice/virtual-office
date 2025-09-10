# Virtual Office — Reference (Tech, Rules, Structure)

## Product Context
Virtual Office is a digital workspace with floor plans, rooms, presence, messaging, and company management. Built with Next.js 15.3.0, React 19.1.0, Supabase, and TypeScript.

## Immutable Rules
- Do not guess. Verify. If unknown, say “I don’t know.”
- Do not assume code behavior. Ask for or provide tests.
- Prefer edits to existing code over new files.
- Run the Anti-Duplication Protocol before proposing changes.
- Completion is user-gated. Never state or imply "done", "fixed", or "resolved". Only the user can confirm completion. Until then mark **Status: Pending user confirmation**.

## Architecture Snapshot (single source)
- Framework: Next.js 15.3.0 (App Router, Server Components, Route Handlers, Server Actions)
- Runtime: React 19.1.0 / React DOM 19.1.0
- Lang: TypeScript 5, strict mode
- Data: Supabase Postgres + Realtime, RLS enabled
- Auth: Supabase Auth with SSR (@supabase/ssr v0.6.1)
- UI: TailwindCSS 4.1.3, shadcn/ui, Radix
- State: TanStack Query v5 + React Context
- Tests: Vitest 3, Playwright, Testing Library

## Supabase & RLS (critical)
- Never use the browser Supabase client in API routes.
- Use `src/lib/supabase/server-client.ts` in server code and API routes.
- Use `src/lib/supabase/browser-client.ts` only in Client Components.
- In API routes call `createSupabaseServerClient()` and pass that instance to repositories.
- Reason: `auth.uid()` requires server context; otherwise RLS fails.

## Type Registry & Change Control
- Canonical types live in `src/types/`. Examples: `auth.ts`, `common.ts`, `database.ts`, `messaging.ts`, `ui.ts`.
- **Do not create new types** if a semantic equivalent exists. Extend existing ones.
- Allowed user roles: `type UserRole = 'admin' | 'member'`. Do not add roles.
- To change a type, edit the existing file and include a brief “Change Note” in the PR description:
  - Why the existing type was insufficient
  - What fields changed
  - Impacted modules

## Anti-Duplication Protocol (execute before coding)
1. Search the codebase for existing components/hooks/types that match the intent.
2. If found, reuse or extend. Do not create a new file.
3. If extending, specify the exact file and exported name you will modify.
4. Output must include:
   - **Paths touched** (exact)
   - **Exports used** (exact names)
   - **Reasoning** (“reuse/extend” and why)
   - **Deprecations** if replacing prior duplicates
5. Creating new files is allowed only when no suitable target exists.

## Code Rules
- Strict TypeScript. Provide explicit types for props, state, params, and returns.
- Prefer interfaces for object shapes; `type` for unions and function signatures.
- Keep files under ~500 lines. Split with cohesive subcomponents or hooks.
- Business logic in utilities/services. UI in components. Data access via repositories.
- Use composition over monoliths. Extract hooks for complex effects or data flows.
- Verify if functionality exists before implementing. Reuse shared libs and APIs.
- Even if all tests pass, keep **Status: Pending user confirmation**.

## Naming Conventions
- PascalCase: exported React components and their filenames.
- kebab-case: directories and non-component filenames.
- camelCase: variables, functions, methods, hooks.
- Hooks filenames: `use-*.ts`.
- UPPER_SNAKE_CASE: env vars and global constants.
- Prefix patterns: `handle*` for handlers; `is/has/can` for booleans; `use*` for hooks.
- Prefer full words; allowed abbrev: `err`, `req`, `res`, `props`, `ref`.

## Repository & Data Access
- Repository pattern in `src/repositories/`. Keep interfaces and implementations separate.
- In API routes, construct repositories with the **server** Supabase client instance.
- Query hooks in `src/hooks/queries/`. Mutation hooks in `src/hooks/mutations/`. Realtime in `src/hooks/realtime/`.

## Features — Status (concise)
- Auth: Implemented, pending verification. `src/contexts/AuthContext.tsx`, `src/lib/auth/`
- Company Mgmt: Partial. `src/contexts/CompanyContext.tsx`, `src/repositories/`
- Dashboard: Partial. `src/app/(dashboard)/dashboard/`
- Messaging: Partial realtime integration. `src/components/messaging/`, `src/hooks/realtime/`
- Presence: Implemented, verify. `src/contexts/PresenceContext.tsx`, `src/hooks/useUserPresence.ts`
- Invitations: Strong architecture. Acceptance flow needs restoration. `src/components/invitation/`, `src/app/admin/invitations/`
- Floor Plan: Base structure. `src/components/floor-plan/`

## Avatars — Canonical & Deprecations
- Canonical display: `EnhancedAvatarV2`
- Canonical upload: `UploadableAvatar`
- All other avatar components are **deprecated**. Replace calls with the canonical components as you touch files.

## Workflows (concise)
- Auth & Onboarding: Register → Email/Google → Profile → Company. `src/app/(auth)/`
- Dashboard: Login → Dashboard → Quick links. `src/app/(dashboard)/dashboard/`
- Messaging: Join room → Send → Realtime updates → Presence.
- Invitations (admin): Create → Send → Accept (restore flow).

## Project Structure (scoped)
- `src/app/`: App Router routes and layouts  
- `src/components/`: UI by feature (auth, dashboard, floor-plan, invitation, messaging, profile, ui)  
- `src/contexts/`: global state (Auth, Company, Presence)  
- `src/hooks/`: queries, mutations, realtime, shared hooks  
- `src/lib/`: auth, services, supabase, uploads, utilities  
- `src/providers/`: app-level providers  
- `src/repositories/`: interfaces, implementations, factory  
- `src/types/`: **canonical types**  
- `migrations/`, `middleware.ts`, `__tests__/`

**New files must live in the existing feature folders. Do not add new top-level directories.**

## Build & Lint
- Dev: `npm run dev`, Build: `npm run build`, Start: `npm run start`
- Lint: `npm run lint`
- Find errors: `npm run type-check`

## Response Format (required)
When proposing changes, output only:
1. **Duplication Check:** summary of what you reused or extended.
2. **Patch Plan:** list of files to touch with exact paths.
3. **Type Usage:** existing types and exports referenced.
4. **Diffs or code blocks** limited to changed sections only.
5. **Deprecations:** if you remove or replace a duplicate, list it.
6. **Confirmation Request:** one concrete check the user can run to validate the change in their environment, then end with: `Status: Pending user confirmation`.
# Example Response
When asked to optimize prompts, give answers from your own perspective—explain what specific phrases could be added to, or deleted from, this prompt to more consistently elicit the desired behavior or prevent the undesired behavior.
The desired behavior from this prompt is for the agent to require explicit user confirmation before declaring completion, but instead it declares work “done” after tests pass. While keeping as much of the existing prompt intact as possible, add a user-gated completion rule and a response-format confirmation step so the agent always ends with Status: Pending user confirmation until the user confirms.