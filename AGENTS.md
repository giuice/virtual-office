# AGENTS.md

Repository-wide instructions for every coding agent (Claude Code, Codex, and
others). This is the single project instruction file: do not create a root
`CLAUDE.md` or `CLAUDE.local.md`, because Claude Code then stops reading this
file. Domain-specific rules live in skills; do not duplicate them here.

## Product context

Virtual Office is a digital workspace with floor plans, rooms, presence,
messaging, and company management.

- Next.js App Router, React, TypeScript strict
- Supabase Postgres, Auth, Realtime, and RLS
- TanStack Query, React Context, Tailwind, shadcn/ui, and Radix
- Vitest (DB integration) and Playwright (E2E)

Use package.json and the lockfile for declared and resolved dependency versions.

## Delivery workflow

Use `spec-to-done` for new substantial development and its Specify → Plan → Execute/Replan → Report lifecycle. Its approved Ready SPEC is the contract for execution.

GSD is retired in this repository. Never invoke or execute GSD skills, workflows, scripts, or automation, including progress, planning, verification, updates, or reinstallation. GSD skills, `.planning/`, and their old plans/state are historical reference only; consult them for context or clarification. Their phase status, gates, config, and model profiles do not control new work or establish SPEC readiness. Start new work under `spec-interview/<slug>/` according to `spec-to-done`; preserve the historical material. This user instruction supersedes older GSD guidance and saved memories.

### Adversarial review gate

Every spec-to-done work item gets an adversarial review at each of these
points, and the point does not pass until the review is accepted:

1. SPEC: before asking the user to approve it.
2. PLAN: before executing the first task, and after every replan.
3. Each task: its diff, before the task is recorded as done.
4. Final: the whole work-item diff, before the REPORT.

The review is important work under Cross-model delegation: a Claude
orchestrator runs it through `delegation-anthropic.md`, and an OpenAI
orchestrator through `delegation-openai.md`. The review attacks the artifact,
not only its conformance to the SPEC: it tries to bypass guards, probes edge
and failure inputs, and checks every claim in comments and summaries. Save each
prompt and result under `spec-interview/<slug>/reviews/`. Fix or explicitly
reject each finding with a reason, and record the verdict and the disposition
of every finding in TRACK. A review that fails, times out, or runs with a
lower model or effort is unverified, and the gate stays open.

## Working principles

- Search for existing components, hooks, types, RPCs, and migrations first;
  reuse or extend them instead of creating parallel implementations.
- Reproduce reported failures before editing, and fix the root cause rather
  than the symptom.
- Do not suppress errors, bypass type safety, or add unrelated refactors.

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

## Handoff

Inside spec-to-done, its REPORT format governs the final report. For work
outside it, lead with the outcome, then summarize changes, verification, and
real remaining limitations or user actions. Small changes need only a short
report.

For work involving database or deployment state, report in this order:

1. Outcome: which affected workflows are usable and which remain unverified.
2. Changes: distinguish application changes, migration/data state on the named
   database, and deployment compatibility.
3. Required user actions, if any.
4. Verification: evidence and limits of the checks performed.
5. Unresolved user-visible, database, or rollout risks, if any.

Keep raw logs and orchestration details in TRACK or an optional technical
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

## Test policy

Write only integration and E2E tests. Unit tests are forbidden.

- Integration tests run against real local infrastructure: the local Supabase
  database, RLS, Storage, and Realtime, or the real API route against it.
- E2E tests drive the real UI with Playwright, using two accounts when the
  behavior involves more than one user.
- A test that mocks Supabase, a repository, or the code under test is a unit
  test and is not allowed, even when it is called integration.
- No new unit tests. When a change touches an existing unit test, replace its
  behavior with integration or E2E coverage and then delete it. Record the
  removal and its replacement in TRACK, or in the handoff outside spec-to-done.
- A spec-to-done SPEC's test strategy uses integration and E2E levels only.

## Verification

Choose evidence proportional to risk:

- documentation-only changes: check affected instructions, links, metadata,
  and any applicable document/skill validator;
- focused integration or E2E tests for the changed behavior;
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
- npm run test:messaging:db and npm run test:presence:db (DB integration)
- npm run test:messaging:local:e2e and npm run test:presence:e2e (E2E)
- npm test runs the legacy unit suite while it still exists

## Cross-model delegation

Use the following policy for cross-provider delegation (OpenAI to Anthropic or
Anthropic to OpenAI). Same-provider specialist agents retain their own contracts.
Pass the full model ID and an explicit effort level; do not rely on runtime defaults or
moving aliases.

| Provider | Model ID | Standard work | Important work |
| --- | --- | --- | --- |
| OpenAI | `gpt-6.1-sol` (GPT-6.1 Sol) | `high` | `max` |
| Anthropic | `claude-opus-5-5` (Claude Opus 5.5) | `high` | `xhigh` |

Important work includes adversarial reviews, review gates, acceptance checks,
security-critical changes, and difficult investigations where the first fix
failed or the root cause remains uncertain. Use the important-work effort from
the start for these tasks. This policy selects model and effort; it does not
expand which tasks may be delegated, except that the Adversarial review gate
above is mandatory. This policy supersedes older model and effort
recommendations in saved memories or historical task notes.

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
