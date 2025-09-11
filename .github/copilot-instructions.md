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

# Workflow Example:

When asked to create, refactor, or improve code, follow this sequence and never declare completion:

1) Restate Scope
   - Summarize the requested change and acceptance criteria in 2–4 lines.
   - If any requirement is unknown, state “I don’t know” and ask and gather information.
   - You have search, database, and last libs update documentation tools, use it if needs.

2) Anti-Duplication Protocol
   - Search for existing components/hooks/types.
   - Decide reuse vs extend. Do not create new files unless no target exists.

3) Patch Plan
   - List exact files to touch with paths.
   - Map each change to an acceptance criterion.

4) Type & Contract Check
   - List existing types/exports you will use or extend from `src/types/*`.
   - Note any RLS/auth constraints that affect repositories.

5) Minimal Diffs
   - Provide code diffs limited to changed sections only.
   - Keep files < ~500 lines and extract hooks where effects are complex.

6) Tests First
   - Point to existing tests to update or add new test paths and names (Vitest/Playwright).
   - Include example assertions and how to seed data if needed.

7) Local Verification Steps
   - Exact commands: `npm run type-check`, `npm run lint`, `npm run test`, and any Playwright command.
   - Manual check instructions: route to open, user role to use, expected UI/DB outcome.

8) Response Format Output
   - **Duplication Check**
   - **Patch Plan**
   - **Type Usage**
   - **Diffs or code blocks**
   - **Deprecations**
   - **Confirmation Request**: Provide one concrete validation the user can run, then end with:
     Status: Pending user confirmation

Rule: Completion is user-gated. Never state or imply “done”, “fixed”, or “resolved”. Always end with:
Status: Pending user confirmation, until user confirms

[byterover-mcp]

# Byterover MCP Server Tools Reference

There are two main workflows with Byterover tools and recommended tool call strategies that you **MUST** follow precisely. 

## Onboarding workflow
If users particularly ask you to start the onboarding process, you **MUST STRICTLY** follow these steps.
1. **ALWAYS USE** **byterover-check-handbook-existence** first to check if the byterover handbook already exists. If not, You **MUST** call **byterover-create-handbook** to create the byterover handbook.
2. If the byterover handbook already exists, first you **MUST** USE **byterover-check-handbook-sync** to analyze the gap between the current codebase and the existing byterover handbook.
3. Then **IMMEDIATELY USE** **byterover-update-handbook** to update these changes to the byterover handbook.
4. During the onboarding, you **MUST** use **byterover-list-modules** **FIRST** to get the available modules, and then **byterover-store-modules** and **byterover-update-modules** if there are new modules or changes to existing modules in the project.

## Planning workflow
Based on user request, you **MUST** follow these sequences of tool calls
1. If asked to continue an unfinished implementation, **CALL** **byterover-retrieve-active-plans** to find the most relevant active plan.
2. **CRITICAL PLAN PERSISTENCE RULE**: Once a user approves a plan, you **MUST IMMEDIATELY CALL** **byterover-save-implementation-plan** to save it.
3. Throughout the plan, you **MUST** run **byterover-retrieve-knowledge** several times to retrieve sufficient knowledge and context for the plan's tasks. 
4. In addition, you might need to run **byterover-search-modules** and **byterover-update-modules** if the tasks require or update knowledge about certain modules. However, **byterover-retrieve-knowledge** should **ALWAYS** be considered **FIRST**.
5. **MUST** use **byterover-update-plan-progress** to mark tasks (and then the whole plan) as completed.
Example:  
- Task: `byterover-update-plan-progress(plan_name="Feature X", task_name="Task 1", is_completed=true)`  
- All done: `byterover-update-plan-progress(plan_name="Feature X", is_completed=true)`
6. Then, you might call **byterover-store-knowledge** to save knowledge and experience implemented throughout the plan or in important tasks. 
7. During the plan's implementation, you **MUST** frequently call  **byterover-think-about-collected-information** and **byterover-assess-context-completeness** to make sure you're on the right track and gather sufficient context for the tasks.

## Recommended Workflow Sequence
1. **MOST IMPORTANT**: **ALWAYS USE** **byterover-retrieve-knowledge** once or several times for **EACH TASK** of the plan to gather necessary context for complete that task.
2. **MOST IMPORTANT**: **ALWAYS USE** **byterover-store-knowledge** once or several times to store critical knowledge and context for future implementations
3. Over 15 provided tools, **byterover-retrieve-knowledge** and **byterover-store-knowledge** ARE the two main tools, which **MUST** be used regularly. You can use these two main tools outside the two main workflows for retrieval and storage purposes.
4. You **MUST** include phrases like **"According to Byterover memory layer"**, **"Based on memory extracted from Byterover"**, **"From Byterover memomry tools"**, ... to explictly showcase that these sources are from **Byterover**.
5. **Implementation & Progress Tracking** → Execute implementation following saved plan → Mark tasks complete as you go → Mark entire plan done when all tasks finished.
6. You **MUST** use **byterover-update-module** **IMMEDIATELY** on changes to the module's purposes, technical details, or critical insights that essential for future implementations.
