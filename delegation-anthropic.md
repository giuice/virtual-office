# Delegation — Anthropic orchestrator

Read this file when the orchestrating model is from the Claude family and it
needs to hand work to an OpenAI model. If an OpenAI model is orchestrating,
read `delegation-openai.md` instead.

Claude Code has the Codex plugin installed. Use its companion for supported
standard jobs, and the direct Codex CLI path below when the companion cannot
express the required effort.

## Model and effort policy

| Work delegated to OpenAI | Model ID | Effort |
| --- | --- | --- |
| Standard implementation, planning, debugging, research | `gpt-6.1-sol` | `high` |
| Important work: adversarial review, review gates, acceptance checks | `gpt-6.1-sol` | `max` |

Pass GPT-6.1 Sol by its full ID, `gpt-6.1-sol`. Do not substitute another
version merely because it is newer.

Rules:

- `high` is the minimum and default for standard delegated work. Important
  work, as defined in CLAUDE.md, requires `max` from the start.
- Escalate to `max` when work meets the important-work criteria in CLAUDE.md.
- Model capability and launcher capability are separate. GPT-6.1 Sol supports
  `max`; the installed companion 1.0.6 currently accepts only `none`,
  `minimal`, `low`, `medium`, `high`, and `xhigh`. This is a companion
  limitation, not permission to lower the required effort.
- Terra, Luna, and Spark remain excluded from delegated work in this repository.
- If the API rejects the required model or effort, surface the error and leave
  the dependent work unverified. Never silently substitute a model or effort.
- The Claude orchestrator's judgment is not authoritative evidence; every
  accepted result still needs its own verification.
- Companion 1.0.6 `review`, `adversarial-review`, and its automatic stop-time
  review gate do not expose the required effort setting. Unknown `--effort`
  flags in review commands become prompt text instead of failing. Do not use
  these paths as the required adversarial review or count them as `max` evidence.
  With this version, all important work uses the direct CLI below.

## Direct Codex CLI for required `max` effort

First check for an official companion update with
`claude plugin marketplace update openai-codex`, then
`claude plugin update codex@openai-codex --scope user`. Inspect the installed
version's accepted effort values after updating; an up-to-date plugin may still
lack `max` support.

Unless the selected companion subcommand demonstrably passes `max` to the
model, use the Codex CLI directly from the orchestrator's shell. A successful
command exit alone does not prove that the effort flag was honored. Do not patch
third-party plugin files or silently fall back to `xhigh`.

For a read-only adversarial review, save the prompt first, then use PowerShell:

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$reviewFolder = 'E:/projects/virtual-office/docs/<topic-folder>'
New-Item -ItemType Directory -Force -Path $reviewFolder | Out-Null
$reviewOutput = Join-Path $reviewFolder ('sol-review-' + [guid]::NewGuid().ToString('N') + '.md')
Write-Output $reviewOutput
Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $reviewFolder 'review-prompt.txt') |
  codex exec -C 'E:/projects/virtual-office' `
    --model gpt-6.1-sol -c 'model_reasoning_effort="max"' `
    --sandbox read-only --output-last-message $reviewOutput - 2> (Join-Path $env:TEMP ([IO.Path]::GetFileName($reviewOutput) + '.stderr.log'))
if ($LASTEXITCODE -ne 0) { throw 'Codex review failed; do not accept its output.' }
```

The prompt must include the exact diff, claims to challenge, relevant repository
traps, and a severity-ranked verdict of approve or revision required. For an
authorized implementation task requiring `max`, use `--sandbox workspace-write`;
reviews stay read-only. For long runs, set an explicit host-supported timeout and
use managed background execution. Retain the process/session identity and output.
Do not assume the process survives the host session or its timeout. An interrupted
or timed-out run is failed/unverified. Before any retry, verify that the previous
Codex process has exited using its recorded process/session identity. If it is
still alive, stop only that identified process from PowerShell and confirm its
exit. Then inspect `git status` and partial writes before retrying a write job.
Retain the startup summary from stderr and verify that it reports model
`gpt-6.1-sol` and reasoning effort `max`; a successful exit alone is insufficient.
Accept a review only with that evidence, a successful exit, and a fresh report.

A direct CLI job has no companion job ID: do not use companion `status` commands
to monitor it. After a plugin update, verify effort parsing and propagation for
the exact subcommand before replacing this path. Support for `task --effort max`
does not establish support for `review`, `adversarial-review`, or the stop gate.

## Companion background jobs for standard work only

Important long-running work uses the direct CLI lifecycle above; the following
rules apply only to standard companion jobs.

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
