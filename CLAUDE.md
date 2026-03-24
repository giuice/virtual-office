# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Context
Virtual Office is a digital workspace with floor plans, rooms, presence, messaging, and company management. Built with Next.js 15.3.0, React 19.1.0, Supabase, and TypeScript.

## Core Principles

### Planning & Execution
- Enter **plan mode** for any non-trivial task (3+ steps or architectural decisions). Write a plan before coding.
- If something goes wrong, **STOP and re-plan immediately** — don't keep pushing failed approaches.
- Use **subagents** frequently for research, exploration, and parallel analysis — keep the main context clean.

### Quality Standards
- Do not guess. Verify. If unknown, say "I don't know."
- Do not assume code behavior — ask for or provide tests.
- Find **root causes**. Avoid temporary fixes. Maintain senior-level standards.
- For non-trivial changes, ask: *"Is there a more elegant solution?"* — but don't over-engineer simple fixes.
- Never mark a task complete without proving it works. Run tests, check logs, demonstrate correctness.
- Completion is **user-gated**. Never state "done" or "fixed". Mark **Status: Pending user confirmation**.

### Bug Fixing Protocol
- When given a bug report: **DEBUG FIRST** with real runtime evidence (console logs, network requests, DB state).
- Never edit production code until root cause is confirmed with evidence.
- "I think the bug is X" is not enough — prove it with runtime data before proposing fixes.
- Fix failing CI tests autonomously. Require zero context switching from the user.

### Anti-Duplication (execute before coding)
- **CRITICAL**: Before ANY plan or implementation, verify if feature already exists or partially exists. Do NOT duplicate features or functionality.
- Search codebase for existing components/hooks/types that match intent. If found, reuse or extend.
- Prefer edits to existing code over new files. New files only when no suitable target exists.

## Skill Usage — IMPORTANT

Installed skills provide specialized capabilities. **Invoke the relevant skill when the situation matches:**

| Skill | When to Use |
|-------|-------------|
| `/refactor-method-complexity-reduce` | **Hooks refactoring**, reducing method complexity, untangling interdependent hooks, simplifying deeply nested logic |
| `/codebase-cleanup-refactor-clean` | Large-scale cleanup, dead code removal, structural refactoring across multiple files |
| `/supabase-realtime` | Writing or debugging **realtime subscriptions**, presence channels, broadcast, Supabase Realtime patterns |
| `/react-best-practices` | After editing multiple TSX components — runs quality checklist for hooks, accessibility, performance |
| `/vercel-react-best-practices` | React/Next.js performance optimization, bundle size, data fetching patterns |
| `/nextjs-app-router-patterns` | Server Components, streaming, parallel routes, advanced App Router patterns |
| `/nextjs-supabase-auth` | Auth middleware, protected routes, Supabase Auth + Next.js integration |
| `/supabase-postgres-best-practices` | Writing/optimizing SQL queries, schema design, RLS policies |
| `/code-quality` | General correctness rules, avoiding over-engineering, comment quality |
| `/code-review-quality` | Conducting thorough code reviews with confidence-based filtering |
| `/simplify` | After completing changes — review for reuse, quality, and efficiency |
| `/web-design-guidelines` | UI accessibility audit, UX review, design best practices |

**Proactive skill usage**: Don't wait for the user to ask. If you're refactoring a complex hook, invoke `/refactor-method-complexity-reduce`. If you're writing realtime code, invoke `/supabase-realtime`. If you just edited multiple components, run `/react-best-practices`.

## Architecture
- Framework: Next.js 15.3.0 (App Router, Server Components, Route Handlers, Server Actions)
- Runtime: React 19.1.0 / React DOM 19.1.0
- Lang: TypeScript 5, strict mode
- Data: Supabase Postgres + Realtime, RLS enabled
- Auth: Supabase Auth with SSR (@supabase/ssr ^0.8.0)
- UI: TailwindCSS 4.1.3, shadcn/ui, Radix
- State: TanStack Query v5 + React Context
- Tests: Vitest 4, Playwright, Testing Library

## Supabase & RLS (critical)
- Never use the browser Supabase client in API routes.
- Server code/API routes: `createSupabaseServerClient()` from `src/lib/supabase/server-client.ts`
- Client Components only: `createSupabaseBrowserClient()` from `src/lib/supabase/browser-client.ts`
- `auth.uid()` requires server context; otherwise RLS fails.
- **NEVER** expose `SUPABASE_SERVICE_ROLE_KEY` to the client. Only Server Actions/API Routes.

### getSession() vs getUser()
| Context | Method | Why |
|---------|--------|-----|
| Server (API/Actions) | `getUser()` | Validates JWT on Auth server — **REQUIRED** |
| Client (Browser) | `getSession()` | Fast, from local storage |
| Middleware | `getSession()` | OK for token refresh only |

## Database — CRITICAL

> **Authoritative source: `migrations/database-structure.md`** — ALWAYS verify table/column names before writing SQL. If outdated, use `mcp_supabase_list_tables` to refresh.

### User ID vs Supabase UID — #1 Source of Bugs

The `users` table has TWO ID fields:

| Field | Type | Use For |
|-------|------|---------|
| `users.id` | UUID | Foreign keys between app tables (messages.sender_id, spaces.created_by) |
| `users.supabase_uid` | TEXT | Matching `auth.uid()`, session user identification |

**Rules:**
- `users.supabase_uid = auth.uid()::text` — For RLS policies
- `userRepository.findBySupabaseUid(authUser.id)` — For API routes
- `WHERE supabase_uid = $supabaseAuthId` — For raw SQL
- `users.id = auth.uid()` — **ALWAYS WRONG. NEVER DO THIS.**

### Common Schema Mistakes
- `profiles` table does NOT exist — use `users`
- `messages.room_id` does NOT exist — messages link via `conversations.room_id`

### Enums
- `user_status`: online, away, busy, offline
- `user_role`: admin, member
- `space_type`: workspace, conference, social, breakout, private_office, open_space, lounge, lab
- `space_status`: active, available, maintenance, locked, reserved, in_use
- `conversation_type`: direct, group, room
- `message_type`: text, image, file, system, announcement
- `message_status`: sending, sent, delivered, read, failed

## Type Registry
- Canonical types in `src/types/`: `auth.ts`, `common.ts`, `database.ts`, `messaging.ts`, `ui.ts`
- Do not create new types if a semantic equivalent exists. Extend existing ones.
- Allowed user roles: `'admin' | 'member'` only. Do not add roles.

## Code Rules
- Strict TypeScript with explicit types for props, state, params, returns.
- Interfaces for object shapes; `type` for unions and function signatures.
- Files under ~500 lines. Business logic in utilities/services, UI in components, data in repositories.
- PascalCase: components/filenames. kebab-case: directories. camelCase: variables/functions. Hooks: `use-*.ts`.
- Prefix: `handle*` handlers, `is/has/can` booleans, `use*` hooks, `UPPER_SNAKE` env/constants.
- Repository pattern in `src/repositories/`. Construct with **server** Supabase client in API routes.
- Query hooks in `src/hooks/queries/`, mutations in `src/hooks/mutations/`, realtime in `src/hooks/realtime/`.

## Avatars
- Canonical display: `EnhancedAvatarV2`. Canonical upload: `UploadableAvatar`.
- All other avatar components are **deprecated**. Replace as you touch files.

## UI Interaction — Click-Stop Standard
- Add `data-avatar-interactive` to interactive children (avatars, dropdown triggers, buttons in cards).
- Parent clickable containers must early-return if target `closest('[data-avatar-interactive]')` or `closest('a, button, [role="button"], [data-space-action]')`.
- Portal menus (Radix/shadcn): stop propagation on `onPointerDown`, `onClick`, `onKeyDown` on DropdownMenuContent.
- Avatar/menu wrappers must stop propagation to prevent space navigation on messaging interactions.

## Build & Lint
- Dev: `npm run dev` | Build: `npm run build` | Lint: `npm run lint` | Types: `npm run type-check`
- New files must live in existing feature folders. Do not add new top-level directories.
