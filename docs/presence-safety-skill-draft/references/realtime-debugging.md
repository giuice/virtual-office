# Realtime and debugging

## Realtime contract

Use one private channel per company and app-user scope. Presence metadata is
version/invalidation-only and must not carry authoritative status, placement,
avatar, ACL, capacity, role, company, or activity data. Channel callbacks only
invalidate the exact scoped snapshot; they never patch authoritative rows from
payloads.

Subscription dependencies are identity scope only. Mutable snapshot values do
not recreate the channel. Cleanup removes the exact channel and fences callbacks
from the old identity.

`SUBSCRIBED` does not prove that no event was missed. Reconcile immediately on
subscribe/reconnect, reconcile again after the blind window, and invalidate on
focus/online. While visible, poll the authoritative snapshot every 30 seconds so
correctness survives degraded Realtime.

## Cache and storage

Snapshot query keys contain company ID and app-user ID. Never reuse a global
Presence query across logout/account switch. A membership or auth invalidation
cancels and removes old-scope queries before loading the new scope.

Local-storage keys are equally scoped and advisory. A stored last-space hint is
read from its scoped key and exposed to callers, but automatic placement does
not currently use it to choose a recovery target. It cannot authorize, prove
recency, or override a committed server version.

## Debugging protocol

Collect evidence in this order:

1. Record verified app user, auth session, company scope, and correlation ID.
2. Read the authoritative snapshot server time, placement/version, access
   revisions, active/retired leases, exact-session revocation fence, and open
   logs. Redact tokens and credentials.
3. Inspect transition results and structured server logs for command ID,
   observed version, lock-time decision, idempotent-replay status, and error code.
4. Inspect the scoped query key and confirm old-scope cache/storage removal.
5. Inspect channel lifecycle, invalidation count, immediate/delayed reconciliation,
   and 30-second fallback polling. Do not infer delivery from `SUBSCRIBED`.
6. Reproduce multi-tab or multi-account ordering in a real browser when that is
   the claim. Reproduce locking/RLS in disposable real Postgres.

Never paste service-role keys, cookies, JWTs, invitation tokens, or raw provider
errors into logs or evidence. Structural error codes and redacted correlation
IDs are sufficient.

## Common diagnoses

- Avatar disappears on reload: compare lease lifetime and snapshot identity;
  do not preserve occupancy by force-including placement.
- Ghost occupant: inspect expiry/revision/space/version predicates, not status.
- Snap-back: inspect observed server version and intent ordering across tabs.
- Stuck offline: distinguish display availability from connection and verify
  session registration/reconciliation.
- Duplicate calls: trace coordinator ownership and UI callbacks; do not add a
  second transport as a local patch.
- Cross-account leak: inspect scoped keys, generation fences, channel cleanup,
  and late query/bootstrap commits.
