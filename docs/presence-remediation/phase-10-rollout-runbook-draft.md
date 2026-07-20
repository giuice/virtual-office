# Phase 10 rollout runbook (draft)

Status: prepared locally; no staging or production mutation has been authorized or performed.

This runbook turns the recovered Phase 10 handoff into an operator sequence. Every SQL result, application deployment, maintenance window, target project reference, and UTC timestamp must be retained unedited in the rollout artifact. A timed wait is never evidence that a writer drained.

## Hard prerequisites

- The complete working tree is reviewed and committed; the commit SHA and pinned Supabase CLI version are recorded.
- A disposable local Supabase reset passes twice from committed migrations, followed by the full Presence DB suite. Repeated working-tree resets and the final 14-file/115-test DB lane are green; the same proof must be repeated from the reviewed commit.
- Staging migration history is reconciled explicitly. Do not use `migration repair` merely to make histories look equal.
- Capture `server_version_num`, required extension versions, the Data API schema/exposure setting, and explicit table/function grants on each target. The reviewed local baseline currently runs PostgreSQL 15.8; a target on another major version is not rejected merely for differing, but every DB/RLS/concurrency gate must run on that actual engine before promotion. Never infer Data API reachability from project defaults: current Supabase projects may require explicit grants for new objects.
- Realtime project settings are captured for each target and **Allow public access is disabled** before treating private-channel RLS as enforced. Preserve the dashboard/Management API readback together with the `realtime.messages` policy readback; a client-side `private: true` flag alone is not evidence.
- The admin/member/external browser identities are distinct and provisioned. Disposable local identities are green; dedicated staging/CI protected credentials remain pending.
- Phase 9 draft evaluation passes from the clean candidate commit with the approved runner, two candidate models, and a distinct-family judge.
- The user approves each named staging/production target and every production maintenance window.
- A cutover UUID, operator, start time, rollback owner, and exact rollback boundary are recorded before entry into maintenance.
- `scripts/presence-health-check.sql` is executed as `postgres` through the approved privileged connection. Its `monitor_authority_is_postgres` row must pass; a partially visible RLS monitor is not accepted.
- Rollout SQL/log artifacts contain stable application/resource UUIDs. The paths under `artifacts/presence-rollout/...` refer to an approved access-controlled evidence repository **outside this application worktree**. Grant access only to rollout/review operators, record the ACL and retention-policy readback, and never copy the raw artifact into this repository (the local path is ignored defensively). They are redacted of credentials and direct identity fields, not anonymous telemetry.
- Private Realtime authorization is evaluated on join and cached by the open connection. Capture the target access-token TTL and refresh behavior, then obtain explicit security-owner acceptance for the maximum residual-access bound. Immediate revocation on an already-open socket is not an accepted or claimed property.

## Structured counter query contract

For every pre/post window, retain the exact UTC start/end, release identifier, target project, query text, result, and log-source identifier. Use the following `presence-observability-v1` mappings; do not substitute message-text searches:

- `session_heartbeat_failures`: `category = session`, `action = heartbeat`, `resultCode != SESSION_HEARTBEAT`.
- `invalid_or_replayed_knock_attempts`: `category = knock` and `resultCode` in `KNOCK_INVALID`, `KNOCK_ALREADY_CONSUMED`, `KNOCK_ALREADY_RESOLVED`, `KNOCK_SUPERSEDED`, `KNOCK_EXPIRED`, `KNOCK_NOT_FOUND`, `IDEMPOTENCY_CONFLICT`, or `KNOCK_INTERNAL_ERROR`.
- `realtime_reconnect_and_reconciliation`: browser/runtime events with `category = realtime`, `action` in `subscription` or `reconcile`; group by `resultCode` (`SUBSCRIBED`, `RECONNECTED`, degraded statuses, `RECONCILE_INVALIDATED`, `RECONCILE_REUSED_INFLIGHT`). The staging/browser evidence collector must retain these one-line events when no centralized client telemetry provider exists.
- `scoped_presence_query_errors`: browser/runtime events with `category = snapshot`, `action = query-error`; group by `resultCode` and `retryable`. Intentional aborted requests emit no error event.

The SQL rows marked `structured-log` are routing instructions, not zero values. A window without the corresponding retained query result fails the evidence gate.

## Stage A — additive staging deployment

1. Confirm the linked project reference and capture migration history before making changes.
2. Apply every reviewed additive/corrective migration through `20260719140658_presence_concurrency_contract.sql`, in order. This explicitly includes Phase 6, Phase 7, `20260719115759_presence_observability_rpc_contract.sql`, and the final concurrency-contract migration; do not deploy an endpoint that calls an `_observed` RPC before both final migrations are present. Read back the observability column, both observability triggers, all seven service-only wrapper signatures/owners/ACLs/search paths, both private trigger helpers, the terminal runtime gate, the two revision guards, all five movement/revision triggers, and the final immutable-audit fingerprint/health counts. Do not yet add the unique open-log index, revoke browser `users` UPDATE, persist the availability CHECK, disable the adapter, or remove audit objects.
3. Read back policies, table/column/function grants, FORCE RLS, function owner/search paths, constraints, indexes, Realtime publication, runtime control, Cron jobs, and cutover-audit metadata/fingerprint.
4. Read back the target's Realtime settings and require **Allow public access = disabled**. Exercise an own-company join plus anonymous/other-company denial against the actual target. Also run a held-open-socket revocation probe: member A joins the private company Presence channel with a raw instrumented client; on a separate connection remove/fence A atomically without cooperative channel cleanup; member B emits track/untrack; record whether A can receive or publish before and after JWT refresh, token expiry, and reconnect. The gate requires denial after the first configured reauthorization boundary, a measured upper bound no greater than the captured token/refresh policy plus the approved reconnect allowance, and the named security owner's written acceptance. Any unbounded or post-boundary access aborts rollout.
5. Require `presence-audit-legacy-cutover-v1` to be active at minute 5 UTC as `postgres`, with the observation start and expected fingerprint immutable.
6. Run `scripts/presence-health-check.sql` unchanged and retain the complete pre-deploy baseline plus the associated `presence-observability-v1` log counters. Capacity, duplicate/open-log mismatch, partial transition, cross-company authority, revision-invalid active authority, invalid live Knock, and retention-backlog failures abort Stage A. A `pending`/`approved` Knock is considered stale only after the one-minute expiry worker plus the explicit two-minute health grace; synchronize/read back `presence-expire-knocks-v1` before treating a younger expiry as corruption. `placement_without_valid_evidence_beyond_grace` may expose the known pre-reconciler backlog, but every row must be enumerated and Stage B must repair it to zero before atomic activation. Every `structured-log` row needs a captured log query/result rather than an assumed zero.
7. Deploy compatibility client A: hard reload on 426 is active, but the legacy writer remains available while runtime mode is `legacy`. Record adoption. Never enable the atomic client writer concurrently with a mutating legacy writer.
8. Run the complete admin/member/external bootstrap and two-user movement/Knock smoke. Capture redacted network/log/DB evidence, then repeat and retain the health-check/log-counter result.

Rollback boundary: application client A may be rolled back while the additive schema remains. Security hardening and immutable audit evidence are never rolled back.

## Stage B — staging atomic cutover rehearsal

During the approved placement maintenance window:

1. Run the SELECT-only section of `scripts/presence-open-log-repair.sql` and retain every proposed repair row.
2. Record the maintenance reason in the rollout artifact, then call postgres-only `enter_presence_maintenance(cutover_id)` (the legacy-to-maintenance signature accepts only the cutover UUID; `reason` belongs to the later atomic-maintenance function). Save the returned control state, the positive shared-lock drain, and the complete legacy ledger readback. Require zero unfinished, non-expired entries.
3. Call `repair_presence_logs_for_cutover(cutover_id)`. Require its returned `after_duplicate_users` and directional `after_mismatched_rows` counters to be zero. Retain the broader bidirectional health-check backlog for the post-activation reconciliation step; the movement gate intentionally rejects that reconciler while mode is `maintenance`.
4. Create the final CLI-generated cutover migration from the reviewed repair plus:

   ```sql
   create unique index ux_space_presence_log_one_open_per_user
   on public.space_presence_log (user_id)
   where exited_at is null;
   ```

5. Apply and read back the exact unique index definition while still in maintenance.
6. Deploy client B/new Presence endpoints while maintenance remains active. Old tabs must fail closed and require refresh.
7. Call `activate_atomic_presence_writer(cutover_id)` and read back mode `atomic`, the same cutover UUID, and the unique-log invariant.
8. Schedule `presence-reconcile-placement-v1` every minute as `postgres` with the constant command `select public.reconcile_stale_presence_placements();`; read back its exact name, schedule, command, database, username, and active state. Invoke it immediately after atomic activation and rerun the health check. If a stale placement is protected by a still-active lease, exercise the client-B placement path or allow that bounded lease to retire before reconciling again; never bypass the gate or manually clear an active session. Require the broader bidirectional placement/log and stale-placement counters to reach zero before leaving the rehearsal gate.
9. Run all runtime acceptance scenarios, including two-user, two-tab, account-switch, Realtime-loss, capacity, Knock, logout/revocation, and stale automatic-transition races. Run required concurrency cases for at least 200 iterations. **Do not point the current staging concurrency runner at this activated target:** its normative fixtures deliberately switch the global runtime back to `legacy` and remove the permanent index. Until that runner is redesigned to preserve an atomic target under abnormal termination, it is authorized only on a disposable isolated clone with no shared users/sessions, and that clone must be discarded after evidence capture. A 200-iteration proof against the actual activated target remains pending a non-destructive runner.
10. Run `scripts/presence-health-check.sql` again and retain all database and structured-log counters. Every database invariant marked `zero`, including stale placement beyond grace, must now pass. A missing log query is a missing gate, not a zero.

The staging concurrency command below is permitted only for the approved disposable isolated clone described above. It is not permitted against the activated shared staging/test project. Inject the following values through protected configuration; never echo or persist `PRESENCE_TEST_DB_URL`:

```text
PRESENCE_TEST_DB_URL=<protected direct-or-pooler staging URL>
PRESENCE_CONCURRENCY_TARGET_CLASS=staging
PRESENCE_CONCURRENCY_TARGET_REF=<approved project ref>
PRESENCE_CONCURRENCY_STAGING_DB_HOST=<approved hostname encoded by the URL>
PRESENCE_CONCURRENCY_APPROVAL_ACK=I_APPROVE_STAGING_SOAK
npm run test:presence:concurrency:staging
```

The runner rejects loopback/prod-class targets, requires the hostname and URL-derived project ref to match the protected values, and executes exactly the 14 normative cases for 200 iterations. Retain its complete NDJSON report in the approved external evidence store with ACL/retention readback; a partial report or stdout summary is not evidence.

Rollback boundary after atomic activation: use only postgres-only `enter_atomic_presence_maintenance`, repair in maintenance, then roll forward with `activate_atomic_presence_writer`. Never change `atomic` back to `legacy` and never restore a mutating old movement path.

## Stage C — production additive deployment and atomic cutover

Repeat Stages A and B only after explicit production approval. Record the exact application/database release unit and rollback boundary. Require all readbacks and runtime smoke before leaving the maintenance window. The first seven-day clock is valid only when:

- the additive audit was installed and started before the first required hour;
- every pre-receipt server instance was drained before the first required hour, with deployment/platform evidence retained; service-role writes from obsolete code cannot be inferred from zero browser counters;
- its expected fingerprint matches every one of the 168 hourly buckets;
- runtime is operable in atomic mode;
- no legitimate authenticated direct writer or legacy route caller remains.
- the pre/post `presence-health-check.sql` results have zero database invariant failures and complete structured-log counter evidence.

## Stage D — first seven-complete-day gate and breaking availability migration

After seven complete consecutive production UTC days:

1. Run `scripts/presence-legacy-cutover-audit.sql` unchanged through the approved privileged connection.
2. Require exactly 168 healthy hourly buckets, all four direct-write groups zero, both route groups zero across the seven complete days and current partial day, a healthy live fingerprint, and `gate_pass = true`.
3. Store the complete output at `artifacts/presence-rollout/<cutover-date>/legacy-cutover-audit.json` in the external approved evidence repository without editing it; preserve ACL and retention readbacks beside it, not in the app repository.
4. In a separately approved transaction, execute the reviewed contents of `scripts/phase10-presence-users-update-revocation-draft.sql` as a CLI-generated migration. The operator locks `public.users`; the maintenance-owner assertion locks both private counter tables on that same backend, reruns `private.assert_presence_legacy_cutover_gate()`, revokes table and column UPDATE from browser roles, normalizes legacy `offline`, installs the default/CHECK, and emits transaction-local readback.
5. Preserve the locked assertion/readback with the artifact. Rerun profile, theme, avatar, OAuth, role, logout, and Presence suites; ordinary profile updates must remain available while persisted `offline` and placement writes remain forbidden.

Any missing/unhealthy bucket, fingerprint drift, direct-write count, route receipt, or current-day count resets the evidence window. Do not repair, overwrite, or synthesize evidence.

## Stage E — disable the legacy adapter and retain the 426 tombstone

1. Remove obsolete offline bodies/direct fetches/deprecated status behavior, but retain the receipt-counting non-mutating route tombstone.
2. Run `scripts/phase10-presence-legacy-adapter-disable-draft.sql` with the active cutover UUID in an approved transaction. The function serializes route receipts, reruns the live cutover assertion, and changes the adapter flag atomically.
3. Require mode `atomic`, the same cutover UUID, `legacy_adapter_enabled = false`, and a server-set `legacy_adapter_disabled_at`.
4. Deploy the disabled 426 tombstone for at least one complete production release. Any old instance records first and can only return 426; it must never reach a legacy writer.

## Stage F — second seven-complete-day gate and adapter deletion

After the disabled tombstone has existed for seven complete consecutive UTC days:

1. Run `scripts/presence-legacy-adapter-removal-audit.sql` unchanged.
2. Require disable time no later than the first required UTC hour, exactly 168 healthy buckets with the expected fingerprint, both route groups zero for the seven complete days and current partial day, healthy live catalog, and `gate_pass = true`.
3. Store the output at `artifacts/presence-rollout/<removal-date>/legacy-adapter-removal-audit.json` in the external approved evidence repository without editing it; preserve ACL and retention readbacks beside it, not in the app repository.
4. Immediately before adapter-code removal, begin the deployment transaction and call postgres-only `private.assert_presence_legacy_adapter_removal_gate()`. Preserve its result. Any receipt before its lock aborts the gate; any later old instance remains DB-fenced and counted.
5. Deploy deletion of the tombstone, drain every old server instance, and read back zero new route receipts after the final assertion. If a receipt appears, keep the audit installed and restart the second window.

## Stage G — audit retirement and documentation

Only after code deletion, old-instance drain, a still-clean final readback, runtime acceptance, and user confirmation:

1. Create a new reviewed migration that unschedules and verifies removal of `presence-audit-legacy-cutover-v1`, marks audit metadata disabled through its reserved marker, and removes temporary audit triggers/functions/tables in dependency order.
2. Never delete or rewrite either accepted artifact or the disable/final-assertion readbacks.
3. Update `migrations/database-structure.md` from verified live schema.
4. Complete the Phase 10 evidence record and request user confirmation. Phase 11 canonical skill promotion remains blocked until that confirmation.

## Abort conditions

- Wrong or ambiguous project reference, unreconciled migration history, or unexpected live schema.
- Any failed local/staging DB reset, RLS test, concurrency soak, browser smoke, advisor, or readback.
- Missing 168-hour coverage, nonzero legacy receipt/direct-write counter, unhealthy fingerprint, or mutable/missing audit metadata.
- Missing held-open Realtime revocation evidence, an unapproved/unbounded cached-access interval, or access surviving the accepted reauthorization boundary.
- Raw rollout evidence placed in the application repository or an evidence store without verified ACL/retention controls.
- Maintenance drain not proven by locks and ledger state.
- Customer-testable movement/Knock disabled after the window.
- Need to re-enable permissive RLS, direct browser writes, a mutating legacy adapter, or `atomic -> legacy`.

On abort, preserve all evidence, keep hardening/audit objects, enter the appropriate maintenance mode if placement must be stopped, and roll forward or roll the compatible application release unit back. Do not improvise database state changes.
