# Active limitations

Keep only reusable, unresolved limitations here. Put run-specific progress,
phase numbers, model evaluations, and historical incidents in the remediation
tracker, not in this skill.

- Real multi-user Realtime, private-space, cross-company, account-switch, and
  Knock claims require separate authenticated browser identities. Unit mocks do
  not close those runtime gates.
- The staging concurrency runner changes global runtime mode and indexes. Never
  run it against an activated shared target; use a disposable database clone
  until the runner is redesigned to restore state safely.
- Staging and production rollout require explicit target authorization,
  migration/catalog readback, a rollback boundary, and runtime smoke evidence.
- Legacy cutover and adapter removal require their own observation window and
  live assertion. Source code and elapsed time alone are not proof.
- Unknown session-registration failures are currently exposed as generic
  retryable PRESENCE_SESSION_ERROR responses, and the client continues retrying
  with a capped delay. Until contract errors are classified as terminal and
  actionable, an application/database mismatch can produce repeated 500s.

When one of these blocks completion, explain the user-visible consequence and
the exact human action needed. Do not expose internal evaluation machinery as
the headline of the final report.
