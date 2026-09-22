# CLAUDE.md

Repository-wide instructions for every coding agent. Domain-specific rules live
in skills; do not duplicate them here.

## Product context

Virtual Office is a digital workspace with floor plans, rooms, presence,
messaging, and company management.

- Next.js App Router, React, TypeScript strict
- Supabase Postgres, Auth, Realtime, and RLS
- TanStack Query, React Context, Tailwind, shadcn/ui, and Radix
- Vitest, Testing Library, and Playwright

Use package.json and the lockfile for declared and resolved dependency versions.

## Working principles

- Inspect the implementation relevant to the task. Establish behavior from
  source and evidence at the affected layer; reproduce or characterize reported
  failures before editing.
- Fix the root cause and complete the requested workflow, including relevant
  verification and corrections caused by the change.
- Search for existing components, hooks, types, RPCs, and migrations first.
  Reuse or extend them instead of creating parallel implementations.
- Keep changes scoped. Do not add unrelated refactors, weaken tests, suppress
  errors, bypass type safety, or auto-commit.
- If an approach fails, use the evidence to adjust it rather than repeat it.
- Continue local implementation and verification within the authorized scope
  without asking for approval at each step. Infer routine details from context.
- Technical completion requires the requested work and proportionate evidence.
  Report any pending product acceptance separately; do not make every handoff
  wait for user confirmation.
- When a prerequisite is missing, stop only the dependent action or claim and
  continue independent work. State the limitation and the exact next action.

## Database and deployment operations

When work changes or depends on schema, data, RPCs, RLS, grants, runtime modes,
environment variables, secrets, jobs, or deployment order, explain that impact
early. State whether an online database change is required, the named target,
what depends on it, and the compatible rollout order. If impact is uncertain,
say it is being checked and update the user when it is known.

Distinguish these states whenever reporting migration or deployment progress:

1. written locally;
2. applied to a local database;
3. applied to the named online database;
4. application deployed against that database.

Report every migration created or edited and whether it was applied. Do not
claim the application is ready against a target whose required database
contract is missing or unverified.

Before changing an online database, name the target and obtain explicit
authorization unless the conversation already authorizes that action and
target. Explain backup, rollback, maintenance, and destructive-test implications
when relevant. After the change, read back the migration/catalog state from the
same target and run a small runtime smoke check.

## Long-running work

For long-running remediation or work requiring a handoff across phases or
sessions, maintain a concise tracker in the existing documentation area. Record
completed work and evidence, database/deployment state, decisions, failed
approaches that affect the next step, blockers, and next actions.

When using codex-companion background jobs, read
[the companion operations reference](docs/codex-companion.md). Other delegation
mechanisms use their own tool contract.

## Handoff

Lead with the outcome, then summarize changes, verification, and real remaining
limitations or user actions. Small changes need only a short report.

For work involving database or deployment state, report in this order:

1. Outcome: which affected workflows are usable and which remain unverified.
2. Changes: distinguish application changes, migration/data state on the named
   database, and deployment compatibility.
3. Required user actions, if any.
4. Verification: evidence and limits of the checks performed.
5. Unresolved user-visible, database, or rollout risks, if any.

Keep raw logs and orchestration details in the tracker or an optional technical
note. Use a pending status only for a specific outstanding step or acceptance.

## Skills

Use the smallest matching set of available skills. Read each selected SKILL.md
and follow its applicable workflow, loading supporting references only when
needed. The request determines scope and deliverables; a skill's examples or
optional patterns do not authorize extra features, dependencies, or operations.

- Presence, its Realtime/session lifecycle, placement, movement, occupancy,
  private access, Knock, or their database/rollout contracts: presence-safety is
  mandatory.
- Any Supabase task: supabase is mandatory.
- SQL, schema, RLS, or Postgres performance: also use the applicable database
  best-practice skill.
- Browser workflow verification: use the available browser or Playwright skill.
- React/Next.js implementation or refactor: use the applicable Vercel skill.

Preserve third-party skills. Apply their relevant guidance through this
project's contracts: users.id/supabase_uid identity, canonical Presence
authority, and existing TanStack Query/repository boundaries. Generic examples
do not replace those contracts. Keep Presence architecture in its canonical
skill and host entries as forwarding files.

## Supabase, authentication, and RLS

- API routes and server code use createSupabaseServerClient from
  src/lib/supabase/server-client.ts.
- Client Components use createSupabaseBrowserClient from
  src/lib/supabase/browser-client.ts.
- Server authorization uses auth.getUser(), which validates the JWT.
- Browser session reads may use auth.getSession().
- Never expose SUPABASE_SERVICE_ROLE_KEY to client code.
- Service-role access never replaces application authorization checks.
- Ground SQL in schema and policy evidence. Local drafts may use source and
  migrations with assumptions recorded; verify the actual schema and policies
  on the named target before applying SQL or claiming compatibility. Repository
  documentation may lag behind that target.
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

- documentation-only changes: check affected instructions, links, metadata,
  and any applicable document/skill validator;
- focused tests for the changed behavior;
- regression tests for the reported failure;
- typecheck and lint for touched TypeScript;
- build when framework boundaries or production output can be affected;
- database/RLS checks against the named target when database behavior is claimed;
- browser smoke tests for user-visible workflows;
- final diff inspection and diff check.

Use meaningful regression coverage for changed behavior; do not add tests that
only mirror trivial edits. After checks pass, rerun or broaden them only for
new changes, failures, or unresolved risk. A required runtime check without its
prerequisites remains unverified; it does not block unrelated local checks.

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
