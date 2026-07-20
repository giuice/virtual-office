# Access and capacity

## Private-space access

Authorization is evaluated inside the atomic transition after locks and again
after any wait that could make a lease, membership, ACL, status, or revision
stale. Current authoritative inputs include:

- viewer user/company/role and user access revision;
- space company, status, ACL, capacity, and space access revision;
- exact auth-session lease and current placement version;
- an approved, unexpired, unconsumed Knock tied to the requester, space,
  company, request version, and access revisions when direct access is absent.

Recent `last_active`, `users.status`, local storage, an old/open presence log,
Realtime metadata, or stale `current_space_id` never grants private access.
Same-target transitions still execute this authorization.

## Knock

Knock is a server-owned social request available for another occupied
same-company room, public or private. Direct Enter permission does not hide the
Knock action.

Browser clients call authenticated request/respond routes and never mutate
`knock_requests` directly. The request route derives requester identity, rejects
self-approval, requires a current exact lease, captures location/access
revisions, applies cooldown/expiry, and reports success only when the intended
row is created. Responders are authoritative current occupants, not users whose
status or old placement looks online.

Approve/deny requires a locked pending row and an authorized current responder;
zero-row update is failure. Approved entry is single-use and is consumed in the
same movement transaction only after confirming the requester has not moved or
lost membership/access in another tab. Events accelerate UI; polling and
authoritative reads preserve correctness when an event is missed.

## Capacity

Capacity counts distinct authoritative occupants from active qualifying leases
and matching placement/access revisions. It excludes disconnected users,
expired/retired/revoked leases, revision mismatches, and the moving user when
appropriate. `users.status`, `last_active`, Realtime membership, cached arrays,
and persisted placement alone are not capacity inputs.

The database serializes competing entries with the documented space/user lock
order and checks capacity under lock. A client pre-check is only UX and cannot
authorize entry. Concurrency proof requires real Postgres with competing
transactions and repeated runs; mocked routes are insufficient.

## Revision invalidation

User company/role changes advance the user access revision. Space company,
status, ACL, and other access-affecting changes advance the space access
revision. Old leases and Knock approvals cannot preserve occupancy, rejoin, or
entry across a mismatch. Role and membership writers also retire active
placement sessions and close logs atomically.

## Service-role boundary

Service-role credentials exist only in server code. A service-only security-
definer function has fixed `search_path`, a narrow owner/grant surface, FORCE
RLS-compatible owner policies, deterministic lock order, and locked
reauthorization. Never run a service-role mutation against production as a
diagnostic probe; use disposable local Postgres or explicitly approved staging.
