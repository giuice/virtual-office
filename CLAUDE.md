# CLAUDE.md

Repository-wide instructions for every coding agent. Domain-specific rules live
in skills; do not duplicate them here.

## Product context

Virtual Office is a digital workspace with floor plans, rooms, presence,
messaging, and company management.

- Next.js 15 App Router, React 19, TypeScript strict
- Supabase Postgres, Auth, Realtime, and RLS
- TanStack Query, React Context, Tailwind, shadcn/ui, and Radix
- Vitest, Testing Library, and Playwright

## Working principles

- Inspect the current implementation before planning or editing.
- Do not guess. Establish behavior from source, runtime evidence, tests, logs,
  network responses, and actual database state.
- Debug reported failures before changing production code.
- Fix the root cause and the complete user workflow, not only the first symptom.
- Search for existing components, hooks, types, RPCs, and migrations first.
  Reuse or extend them instead of creating parallel implementations.
- Keep changes scoped. Do not add unrelated refactors, weaken tests, suppress
  errors, bypass type safety, or auto-commit.
- If an approach fails, stop, record why, and re-plan.
- Never claim success without proportionate verification.
- Completion is user-gated. End implementation handoffs with
  Status: Pending user confirmation until the user confirms the real workflow.

## Human communication and operational handoff — critical

Agents must communicate application, database, and deployment state as separate
facts. A code change is not the same as an applied database change or a deployed
application.

### Before and during work

Inventory whether the task changes or depends on:

- application code;
- database schema, data, functions, indexes, RLS, grants, or migrations;
- environment variables, secrets, scheduled jobs, or runtime modes;
- deployment order, restart, maintenance, backfill, or destructive operations.

In the first progress update, state exactly one of:

- Mudança online no banco: não.
- Mudança online no banco: sim — <target and required change>.

When the answer is yes, also explain in plain language:

- why the database change is required;
- what stops working until it is applied;
- which target is affected: local, test, staging, or production;
- whether the user has already authorized that target;
- whether the application must wait for the database or can roll out compatibly.

If the impact is initially uncertain, say it is being checked and update the user
as soon as it becomes known. Never hide this information until the final report.

Always distinguish these states:

1. written locally;
2. applied to a local database;
3. applied to the named online database;
4. application deployed against that database.

A migration file in the repository is not an applied migration. Creating or
editing any migration must be reported even when the agent cannot apply it.
Never say the application is ready or safe to open when its required online
database contract is missing.

Before changing an online database, name the target and obtain explicit
authorization unless the current request already grants it. Explain backup,
rollback, maintenance, and destructive-test implications when relevant. After
the change, read back the migration/catalog state from the same target and run a
small runtime smoke check.

Report blockers immediately. If credentials, authorization, or a human-only
step is missing, say what is blocked, why it matters, and the exact next action.

### Long-running goal tracker

For remediation work or any task spanning multiple phases, maintain a tracker in
the task's documentation area. Keep it concise and update it during development:

- completed change and evidence;
- database and deployment state;
- decision or assumption;
- error or failed approach;
- learning that should affect later work;
- current blocker and next action.

The tracker holds technical detail and internal machinery. The final report is a
human summary, not a dump of the tracker.

### Required final report

Use this order for every implementation handoff:

1. Outcome — what the person can or cannot do now.
2. What changed — separate Application, Database, and Deployment.
3. What you need to do now — numbered actions, or exactly Nothing.
4. Verification — concise checks and results.
5. Remaining risks — only unresolved user-visible, database, or rollout risks.
6. Status: Pending user confirmation.

Write for a human who did not watch the task. Do not lead with phase numbers,
runner names, manifests, candidate models, judges, raw logs, test file lists, or
internal orchestration. If one is relevant, put it in an optional technical note
and define it in one sentence. Summarize noisy evidence instead of pasting it.

## Skills

Use the smallest matching set of available skills and follow each selected
SKILL.md completely.

- Presence, Realtime, sessions, placement, movement, occupancy, private access,
  Knock, or related rollout: presence-safety is mandatory.
- Any Supabase task: supabase is mandatory.
- SQL, schema, RLS, or Postgres performance: also use the applicable database
  best-practice skill.
- Browser workflow verification: use the available browser or Playwright skill.
- React/Next.js implementation or refactor: use the applicable Vercel skill.

Domain architecture belongs in those skills. This file keeps only
repository-wide rules.

## Supabase, authentication, and RLS

- API routes and server code use createSupabaseServerClient from
  src/lib/supabase/server-client.ts.
- Client Components use createSupabaseBrowserClient from
  src/lib/supabase/browser-client.ts.
- Server authorization uses auth.getUser(), which validates the JWT.
- Browser session reads may use auth.getSession().
- Never expose SUPABASE_SERVICE_ROLE_KEY to client code.
- Service-role access never replaces application authorization checks.
- Verify the actual schema and policies before writing SQL. Repository
  documentation may lag behind an online target.
- Every migration, RLS policy, repository, or database API change requires the
  Supabase/RLS review gate.

### Application user ID versus Supabase UID

The users table has two distinct identifiers:

- users.id is the application UUID used by foreign keys.
- users.supabase_uid maps the row to auth.uid().

Therefore:

- RLS compares users.supabase_uid with auth.uid()::text.
- API routes resolve the application user by supabase_uid.
- Application foreign keys use users.id.
- Comparing users.id directly with auth.uid() is incorrect.

Known schema traps:

- profiles does not exist; use users.
- messages links to rooms through conversations.room_id, not messages.room_id.
- Roles are admin or member; do not invent new role values.

## Code and architecture rules

- Use strict TypeScript. Prefer explicit public boundaries and avoid any.
- Reuse semantic types from src/types before creating new ones.
- Interfaces describe object shapes; type aliases describe unions and function
  signatures.
- Keep business logic in utilities/services, data access in repositories, and
  view concerns in components.
- Query hooks live in src/hooks/queries, mutations in src/hooks/mutations, and
  Realtime hooks in src/hooks/realtime.
- Construct repositories with the server Supabase client in API routes.
- Avoid giant files and condition growth; extract cohesive behavior, not thin
  wrappers.
- Canonical avatar display is EnhancedAvatarV2; upload is UploadableAvatar.

## UI interaction

Interactive children inside clickable cards use data-avatar-interactive where
applicable. Parent handlers must ignore interactive descendants such as links,
buttons, role=button, and data-space-action. Portal menu content must stop
pointer, click, and keyboard propagation when needed to prevent accidental room
navigation.

## Verification

Choose evidence proportional to risk:

- focused tests for the changed behavior;
- regression tests for the reported failure;
- typecheck and lint for touched TypeScript;
- build when framework boundaries or production output can be affected;
- database/RLS checks against the named target when database behavior is claimed;
- browser smoke tests for user-visible workflows;
- final diff inspection and diff check.

Do not weaken assertions or treat skipped critical tests as passing. Mocks do not
prove database concurrency, RLS, Realtime delivery, or multi-user behavior.

Common commands:

- npm run dev
- npm run type-check
- npm run lint
- npm run build
- npm test

## Git and files

- Preserve unrelated user changes in a dirty worktree.
- Do not use destructive Git commands unless explicitly requested.
- Do not commit, stage, push, or open a pull request unless requested.
- Put new files in an existing feature or documentation folder; avoid new
  top-level directories.
- Use rg and rg --files for search. Use rtk for noisy commands when available,
  but never let an optional wrapper block verification.
- Keep secrets and raw credentials out of source, logs, trackers, and reports.
