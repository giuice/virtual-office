# Delegation — Anthropic orchestrator

Read this file when the orchestrating model is from the Claude family and it
needs to hand work to an OpenAI model. If an OpenAI model is orchestrating,
read `delegation-openai.md` instead.

Claude Code has the Codex plugin installed, so delegation runs through that
plugin and its companion script. There is no need for a terminal multiplexer on
this side.

## Model and effort policy

| Work being delegated | Model | Effort |
| --- | --- | --- |
| Implementation, planning, debugging, research | Sol | `medium` |
| Adversarial review, review gates, acceptance checks | Sol | `high` |

The model id used in this repository is `gpt-5.6-sol`. Only `spark` is aliased by
the companion, so pass Sol by its full id.

Rules:

- Sol `medium` is the default for delegated work. Sol `high` is reserved for
  adversarial review, where the job is to attack a diff rather than produce one.
- Escalate above the default when the root cause is uncertain, the first fix
  failed, or the change spans multiple layers: `medium` → `high` → `xhigh`.
  Escalating is always allowed; downgrading below the table is not.
- Valid effort values accepted by the companion are `none`, `minimal`, `low`,
  `medium`, `high`, `xhigh`. There is no `max`. `ultra` is a multi-agent mode,
  not an effort level.
- Terra, Luna, and Spark are banned in this repository. They shipped incomplete
  implementations that later review had to repair.
- If the API rejects the Sol model id, stop and surface the error. Never
  silently substitute another model.
- Fable and Opus is an orchestrator and architect only. Its judgment is not authoritative
  evidence; every accepted result still needs its own verification.

## Background job mechanics — non-negotiable

Launching background Codex jobs through the plugin's `codex-companion.mjs` has
burned two work packages already. Load the `codex:codex-cli-runtime` skill for
the current invocation contract, and treat the following as fixed:

- A long-lived job is `task --background --write [--fresh|--resume]
  --model <model> --effort <effort> "<prompt>"`.
- There is no `--detached` flag. Passing it silently turns it into prompt text.
- There is no `task --help`. It becomes a job whose prompt is `--help`.
- Without `--write` the job is read-only and cannot edit any file.
- Launch the companion from the orchestrator's own shell, never from inside a
  subagent. A subagent's process tree dies when the subagent finishes and takes
  the job with it.
- Immediately after launch, confirm `status <job-id> --json` reports
  `"write": true`, its own `pid`, and `"status": "running"`.
- Then wait for a terminal state with a background watcher. Do not poll in the
  foreground.
- A job record can go stale: `"running"` with a dead pid. Verify the pid before
  trusting the status.
- Cancel a zombie job from PowerShell, not Git Bash. MSYS mangles `/PID` into a
  path.

## Division of labor

- The worker executes the manual work — Playwright runs, smoke checks, log
  collection — and saves the artifacts to the task's topic folder.
- The orchestrator reviews those artifacts. It does not repeat the manual work
  itself, and it does not paste raw artifact contents into the user's report.
- Spec conformance plus green tests is not acceptance. Every delegated diff gets
  an adversarial review that attacks the change and independently verifies the
  claims made in its comments and summary.

## Reporting back

Delegated work does not change the reporting contract in `CLAUDE.md`. Job ids,
model names, and effort levels are internal machinery: keep them out of the
user's report unless one is genuinely needed, and then confine it to the single
`Technical note:` line.
