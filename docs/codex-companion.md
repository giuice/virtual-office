# Codex companion background jobs

Read this reference only when launching or managing long-lived jobs through
codex-companion. Use the current host's native tool contract for other agents.

- Long-lived jobs are `task --background --write [--fresh|--resume]
  --model <model> --effort <effort> "<prompt>"`. There is no `--detached` flag
  (it silently becomes prompt text) and no `task --help` (it becomes a job with
  prompt "--help"). Without `--write` the job is read-only and cannot edit files.
- Launch the companion directly from the orchestrator's own shell, never from
  inside a subagent: the subagent's process tree dies when it finishes and kills
  the job with it.
- Immediately after launching a write job, verify `status <job-id> --json`
  shows `"write": true`, its own `pid`, and `"status": "running"`. Wait for a
  terminal state through a background watcher instead of foreground polling.
- A job record can stay "running" after its process dies. Verify the PID before
  trusting status. On Windows, cancel zombie jobs from PowerShell, not Git Bash:
  MSYS can turn `/PID` into a path. On other hosts, use the available process
  controls and verify that the PID belongs to the job before terminating it.
- Companion delegation floor: Sol at effort high minimum; no silent downgrade.
