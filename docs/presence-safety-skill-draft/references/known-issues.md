# Active evidence blockers

This file contains only active blockers or residual evidence needs. Remove an
entry when its evidence gate is satisfied; do not preserve resolved historical
bugs as rules.

- Disposable local Postgres execution is required for the pending migration,
  RLS, grant, locking, and concurrency gates. If the container runtime is not
  available, static SQL review does not close those gates.
- Separate admin/member/external browser identities are required for the full
  multi-user, cross-company, account-switch, and Knock runtime matrix. Missing
  credentials block those scenarios rather than permitting skips.
- Staging and production rollout require explicit user authorization, catalog
  readback, rollback boundaries, and runtime smoke evidence.
- Legacy cutover and adapter removal each require their own complete immutable
  observation window and locked live assertion. Source code or elapsed wall
  time alone is not evidence.
- The semantic skill evaluation requires a clean commit plus an approved pinned
  JSONL runner, at least two candidate model IDs, and a judge from a distinct
  approved family. Static validation cannot substitute for it.
- Canonical skill promotion, symlink consolidation, final guard/reviewer
  replacement, and archival of the legacy guide remain blocked until rollout,
  semantic evaluation, and user confirmation succeed.

Status: Pending user confirmation
