# CLAUDE.md

Guidance for Claude Code working in this repo.

## Product Context
Digital workspace: floor plans, rooms, presence, messaging, company mgmt. Next.js 15.3.0, React 19.1.0, Supabase, TypeScript.

## Core Principles

### Delegation to Codex — CRITICAL (when model is Fable or Opus)
You are the **orchestrator & architect**: plan, design, decide, review. Do NOT burn premium tokens on execution.
- **Delegate execution to Codex**:
	- `GPT-5.3-Codex-Spark` (extremely fast): mechanical/multi-file edits, doc updates, test writing, boilerplate, repetitive refactors.
	- **GPT-5.6 family (Luna / Terra / Sol)** — Luna is cheapest, Sol most expensive; effort ladder is `medium < high < xhigh < extra-high < max < ultra`.
	- Legacy `GPT-5.5 medium/high/xhigh` still available; prefer the 5.6 family below.
- **Cost-efficiency rule (from AA Coding Agent Index v1.1): raise EFFORT on the cheaper model before switching to a pricier model.** Effort drives score more than tier in this band. Concrete frontier points: **Luna extra-high (~68) > Terra high (~65)** and **Terra xhigh (~70) > Sol medium (~67)**, each at *lower* cost. So a higher effort on the cheaper model usually wins on value.
	- **Luna** = default workhorse. Climb Luna's effort (up to ultra ≈ index 75) before considering Terra/Sol. Covers most execution.
	- **Terra** = only when you need the ~76–78 band or when Luna at equal score costs more.
	- **Sol** = reserve for the top ~79–80 band on the hardest reasoning tasks; expensive — justify it.
	- **Adversarial reviews / second opinions: medium effort is ideal** (user standing guidance). Do NOT burn xhigh/ultra/Sol on reviews.
	- Sol/Terra and high-effort runs are **expensive for the user** — use only when the task genuinely needs Fable-tier reasoning.
- **How**: `codex:codex-rescue` subagent (plugin), or parallel `tmux` sessions running the `codex` CLI — one per independent task.
- **Codex prompts must be precise**: exact files, expected changes, acceptance checks. Codex executes; it doesn't decide architecture.
- **Keep in main thread**: architecture decisions, root-cause debugging, security-sensitive changes, and final review of every Codex result.
- **Commits are the USER's job** — never auto-commit; the user reviews all diffs. Stage/leave changes and report what changed; commit only when explicitly asked.

### Token Economy — CRITICAL
- Always save tokens intelligently: `rtk` on every shell command, targeted reads (grep/offset/limit before full-file reads), never re-read unchanged files, no redundant verification runs.
- Delegate bulk exploration/reading to Codex subagents when raw output would flood the main context.
- Concise replies — substance over narration.

### Planning & Execution
- **Plan mode** for non-trivial tasks (3+ steps, arch decisions). Plan before code.
- Failed approach? **STOP, re-plan.** No pushing dead ends.
- **Subagents** for research, exploration, parallel analysis. Keep main context clean.

### Quality Standards
- Don't guess. Verify. Unknown = say "I don't know."
- Don't assume behavior — ask/provide tests.
- **Root causes** only. No temp fixes. Senior-level standards.
- Non-trivial changes: ask *"more elegant solution?"* — but don't over-engineer simple fixes.
- Never mark complete without proof. Run tests, check logs, demonstrate.
- Completion **user-gated**. Never say "done"/"fixed". Mark **Status: Pending user confirmation**.

### Bug Fixing Protocol
- Bug report? **DEBUG FIRST** — runtime evidence (logs, network, DB state).
- No prod code edits until root cause confirmed with evidence.
- "I think bug is X" ≠ proof. Prove with runtime data before fixes.
- Fix CI failures autonomously. Zero user context switching.

### Anti-Duplication (execute before coding)
- **CRITICAL**: Before ANY plan/implementation, verify feature doesn't already exist. No duplication.
- Search for existing components/hooks/types. Reuse or extend if found.
- Edit existing code > new files. New files only when no target exists.

## Skill Usage — IMPORTANT

Skills provide specialized capabilities. **Invoke when situation matches:**

| Skill | When to Use |
|-------|-------------|
| `/presence-safety` | Mandatory safety: presence, realtime, space placement |
| `/refactor-method-complexity-reduce` | **Hooks refactoring**, reduce complexity, untangle interdependent hooks, simplify nested logic |
| `/codebase-cleanup-refactor-clean` | Large-scale cleanup, dead code removal, structural refactor across files |
| `/supabase-realtime` | Writing/debugging **realtime subscriptions**, presence channels, broadcast, Supabase Realtime patterns |
| `/react-best-practices` | After editing multiple TSX components — quality checklist: hooks, a11y, perf |
| `/vercel-react-best-practices` | React/Next.js perf optimization, bundle size, data fetching |
| `/nextjs-app-router-patterns` | Server Components, streaming, parallel routes, advanced App Router |
| `/nextjs-supabase-auth` | Auth middleware, protected routes, Supabase Auth + Next.js |
| `/supabase-postgres-best-practices` | SQL queries, schema design, RLS policies |
| `/code-quality` | Correctness, avoid over-engineering, comment quality |
| `/code-review-quality` | Thorough code reviews with confidence-based filtering |
| `/simplify` | After changes — review reuse, quality, efficiency |
| `/playwright-cli` | Browser automation: E2E tests, form filling, screenshots, web UI interaction |
| `/web-design-guidelines` | UI a11y audit, UX review, design best practices |

**Proactive**: Don't wait. Refactoring hook → `/refactor-method-complexity-reduce`. Realtime code → `/supabase-realtime`. Edited components → `/react-best-practices`. Test UI flows → `/playwright-cli`.

## Architecture
- Framework: Next.js 15.3.0 (App Router, Server Components, Route Handlers, Server Actions)
- Runtime: React 19.1.0 / React DOM 19.1.0
- Lang: TypeScript 5, strict
- Data: Supabase Postgres + Realtime, RLS
- Auth: Supabase Auth SSR (`@supabase/ssr` ^0.8.0)
- UI: TailwindCSS 4.1.3, shadcn/ui, Radix
- State: TanStack Query v5 + React Context
- Tests: Vitest 4, Playwright, Testing Library

## Supabase & RLS (critical)
- No browser Supabase client in API routes.
- Server code/API routes: `createSupabaseServerClient()` from `src/lib/supabase/server-client.ts`
- Client Components only: `createSupabaseBrowserClient()` from `src/lib/supabase/browser-client.ts`
- `auth.uid()` needs server context or RLS fails.
- **NEVER** expose `SUPABASE_SERVICE_ROLE_KEY` to client. Server Actions/API Routes only.

### getSession() vs getUser()
| Context | Method | Why |
|---------|--------|-----|
| Server (API/Actions) | `getUser()` | Validates JWT on Auth server — **REQUIRED** |
| Client (Browser) | `getSession()` | Fast, local storage |
| Middleware | `getSession()` | Token refresh only |

## Database — CRITICAL

> **Source: `migrations/database-structure.md`** — ALWAYS verify table/column names before SQL. If outdated, `mcp_supabase_list_tables`.

### User ID vs Supabase UID — #1 Source of Bugs

`users` table has TWO ID fields:

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
- Types in `src/types/`: `auth.ts`, `common.ts`, `database.ts`, `messaging.ts`, `ui.ts`
- No new types if semantic equivalent exists. Extend existing.
- Roles: `'admin' | 'member'` only. No additions.

## Code Rules
- Strict TypeScript. Explicit types for props, state, params, returns.
- Interfaces for object shapes. `type` for unions, function signatures.
- Files < ~500 lines. Business logic → utilities/services, UI → components, data → repositories.
- PascalCase: components/filenames. kebab-case: directories. camelCase: vars/functions. Hooks: `use-*.ts`.
- Prefixes: `handle*` handlers, `is/has/can` booleans, `use*` hooks, `UPPER_SNAKE` env/constants.
- Repository pattern: `src/repositories/`. Construct with **server** Supabase client in API routes.
- Query hooks: `src/hooks/queries/`. Mutations: `src/hooks/mutations/`. Realtime: `src/hooks/realtime/`.

## Avatars
- Canonical display: `EnhancedAvatarV2`. Canonical upload: `UploadableAvatar`.
- All other avatar components are **deprecated**. Replace as you touch files.

## UI Interaction — Click-Stop Standard
- `data-avatar-interactive` on interactive children (avatars, dropdown triggers, buttons in cards).
- Parent click handlers: early-return if target `closest('[data-avatar-interactive]')` or `closest('a, button, [role="button"], [data-space-action]')`.
- Portal menus (Radix/shadcn): stop propagation on `onPointerDown`, `onClick`, `onKeyDown` on DropdownMenuContent.
- Avatar/menu wrappers: stop propagation to prevent space navigation during messaging interactions.

## Build & Lint
- Dev: `npm run dev` | Build: `npm run build` | Lint: `npm run lint` | Types: `npm run type-check`
- New files must live in existing feature folders. No new top-level directories.

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Prefix all commands with `rtk`**. Dedicated filter if available, passthrough if not. Always safe.

**Important**: Command chains with `&&` need `rtk` on each:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Git passthrough works for ALL subcommands, even unlisted ones.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall: **60-90% token reduction** on dev operations.
<!-- /rtk-instructions -->