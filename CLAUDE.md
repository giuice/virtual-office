# CLAUDE.md

Repository-wide instructions for every coding agent. Domain-specific rules live
in skills; do not duplicate them here.

## Product context

Virtual Office is a digital workspace with floor plans, rooms, presence,
messaging, and company management.

- Next.js 16 App Router, React 19, TypeScript strict
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

## Operational impact: say it early

A code change, an applied database change, and a deployed application are three
different facts. Never let the user discover a missing one at the end.

Before starting, inventory whether the task changes or depends on:

- application code;
- database schema, data, functions, indexes, RLS, grants, or migrations;
- environment variables, secrets, scheduled jobs, or runtime modes;
- deployment order, restart, maintenance, backfill, or destructive operations.

State in the first progress update whether the task needs a change applied to an
online database. If it does, say in plain language which target (local, test,
staging, production), why it is required, what stays broken until it is applied,
whether the user already authorized that target, and whether the application can
roll out before the database or must wait. If the impact is still unknown, say it
is being checked and follow up as soon as it is known.

Always distinguish these four states, and never blur them:

1. written locally;
2. applied to a local database;
3. applied to the named online database;
4. application deployed against that database.

A migration file in the repository is not an applied migration. Report every
created or edited migration even when you cannot apply it. Never say the
application is ready or safe to open while its required online database contract
is missing.

Project owner rule: never finish a task with a new migration only in the
repository or only in a local database. Name the production target and obtain
authorization before local application. After local validation, apply the exact
migration to that production target in the same task. Then record its version
and read back its catalog contract. If production access or authorization is
missing, stop before local application and report the blocker immediately. Do
not use `--include-all` or broad migration-history repair to bypass divergence.

Before changing an online database, name the target and get explicit
authorization unless the current request already grants it. Cover backup,
rollback, maintenance, and destructive-test implications when they apply. After
the change, read the migration and catalog state back from that same target and
run a small runtime smoke check.

Report blockers the moment they appear. If credentials, authorization, or a
human-only step is missing, say what is blocked, why it matters, and the exact
next action.

## Long-running goal tracker

For remediation work or any task spanning multiple phases, keep a tracker in the
topic folder that owns the work (for example `docs/presence-remediation/` or the
task's `.planning/` phase folder). Never create a new top-level folder for it.
Update it during development, not at the end:

- completed change and evidence;
- database and deployment state;
- decision or assumption;
- error or failed approach;
- learning that should affect later work;
- current blocker and next action.

The tracker holds the technical detail and the internal machinery. It is an
input to the final report, never a substitute for it and never pasted into it.

## Reporting to the user

The person reading the report did not watch the work, does not know the internal
vocabulary, and needs three things in under a minute: does it work, what do I
have to do, what can still break. Write in English.



### Reporting Format (applies to every report you produce)

Write all reports, summaries, status updates, and explanations for humans in **ASD-STE100 Simplified Technical English**:

- One idea per sentence. Maximum 20 words for a procedural sentence, 25 for a descriptive one.
- One topic per paragraph. Maximum 6 sentences.
- Use the active voice. Write "The service returns the data", not "The data is returned by the service".
- Use the imperative for instructions. Write "Open the file", not "You should open the file".
- Use only one meaning per word, and the same word for the same thing every time. Do not use synonyms for variety.
- Use articles (`the`, `a`) and the full form of verbs. Do not drop words to make text short.
- Do not use noun clusters of more than 3 words.
- Avoid idioms, metaphors, jargon, and hedging words.
- Use vertical lists and tables for steps, conditions, and results.
- Give facts, not impressions. State clearly what is done, what is not done, and what failed.

End every implementation handoff applying ASD-STE100 with exactly these blocks, in this order:

**What changed** — three labelled one-line entries. Write `None` where nothing
changed.
- Application: what behavior is different.
- Database: what was written locally versus applied to which target.
- Deployment: what is running where, or that nothing was deployed.

**What you need to do now** — a numbered list of actions only the user can take,
each with the exact command, URL, or click path. If there is nothing, write
exactly `Nothing.`

**Verification** — at most five lines: what was checked and what the result was.
Name the check, not the runner. State plainly what was not checked.

**Remaining risks** — only unresolved risks that are user-visible, touch the
database, or affect rollout. Write `None known.` when there are none.

**Status: Pending user confirmation** — completion is user-gated. Keep this line
until the user confirms the real workflow.

Hard rules for that report:

- Fit it on one screen. Length signals confusion, not effort. Hours of work do
  not earn extra paragraphs.
- Never open with internal machinery: phase or work-package numbers, agent,
  runner, or model names, job ids, manifests, judges, raw logs, or test file
  lists. If one genuinely matters, add a single `Technical note:` line at the
  end and define the term in that same sentence.
- Summarize evidence. Do not paste test output, SQL, or logs; reference the file
  path instead.
- Never report partial work as done. Say which part of the scope was not
  finished and why, in the Outcome block.
- Never claim success without verification proportionate to the risk.

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

- API routes and ordinary server modules use createSupabaseServerClient from
  src/lib/supabase/server-client.ts. `src/proxy.ts` is the exception: it creates
  the SSR client directly because it owns the proxy request/response cookie
  adapter.
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

- RLS that starts from an Auth identity must map `auth.uid()` through
  `users.supabase_uid` before comparing application foreign keys. The baseline
  public-conversation policy still compares `space_members.user_id` directly to
  `auth.uid()`; treat that as a known migration defect, not a pattern to copy.
- API routes resolve the application user by supabase_uid.
- Application foreign keys use users.id.
- Comparing users.id directly with auth.uid() is incorrect.

Known schema traps:

- profiles does not exist; use users.
- messages links to rooms through conversations.room_id, not messages.room_id.
- Company user roles are `admin` or `member`. `space_members.role` uses the
  separate `member_role_type` enum, which also contains `director`.

## Code and architecture rules

- Use strict TypeScript. Prefer explicit public boundaries and avoid any.
- Reuse semantic types from src/types before creating new ones.
- Interfaces describe object shapes; type aliases describe unions and function
  signatures.
- Keep business logic in utilities/services, data access in repositories, and
  view concerns in components.
- Dedicated query hooks live in src/hooks/queries, dedicated mutations in
  src/hooks/mutations, and feature hooks that combine concerns in src/hooks.
- Dedicated Realtime hooks live in src/hooks/realtime; subsystem-owned Realtime
  hooks may live directly in src/hooks.
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

## Cross-model delegation

Delegation mechanics depend on which model family is orchestrating, because each
family drives the other one through a different runtime. Read the file that
matches the model you are running as, and follow it completely:

- Anthropic model (Claude family) orchestrating: read `delegation-anthropic.md`.
- OpenAI model (GPT/Codex family) orchestrating: read `delegation-openai.md`.

Both files are at the repository root. Do not improvise a delegation path that
is not described there; both were written after real incidents. Correctness and
regression prevention take priority over cost: never silently downgrade the
model or effort level a delegation file mandates.

## Git and files

- Preserve unrelated user changes in a dirty worktree.
- Do not use destructive Git commands unless explicitly requested.
- Do not commit, stage, push, or open a pull request unless requested.
- Put new files in an existing feature or documentation folder; avoid new
  top-level directories.
- Use rg and rg --files for search. Use rtk for noisy commands when available,
  but never let an optional wrapper block verification.
- Keep secrets and raw credentials out of source, logs, trackers, and reports.
