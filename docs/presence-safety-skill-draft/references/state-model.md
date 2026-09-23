# State model

## Authority hierarchy

The authoritative snapshot is produced by one database operation at one server
time. It returns the verified viewer identity, company scope, server time,
initial-placement state, and per-user profile, placement, connection, occupancy,
and display-status fields. Do not merge independent client queries into an
authoritative snapshot; their read points can differ.

Authority, from strongest to weakest:

1. Locked database rows and security-invoker transition results.
2. A validated server snapshot scoped to company ID plus app-user ID.
3. Query-cache mirrors of that exact snapshot.
4. Private Realtime invalidations that request a refetch.
5. Company/user-scoped local-storage hints used only to propose recovery.

Realtime payloads, `users.status`, `last_active`, open/closed logs, toasts, and
local clocks never authorize a transition.

## Identity

- App user ID is `public.users.id` and owns application foreign keys.
- Auth user ID is `auth.users.id`, mapped through `users.supabase_uid`.
- Auth session ID is the exact server-verified JWT `session_id` claim.
- Company scope is the current locked `users.company_id`, not a body parameter.

Every cache, channel, lease-registration request, storage key, and asynchronous
commit is fenced by company ID plus app-user ID. Server registration also
requires the client's expected company and echoes the authoritative company;
any mismatch invalidates the membership scope.

## Placement, connection, and occupancy

Placement is persisted intent in `users.current_space_id`. It can survive a
transient disconnect, but it does not prove connection or access.

A user is connected only when at least one lease:

- belongs to the user;
- has not been retired and is unexpired at snapshot server time; and
- has a user/auth-session pair that is not recorded as revoked.

A user occupies a space only when connected and a qualifying lease also:

- matches `users.current_space_id` and the lease `space_id`;
- matches `users.location_version` through `placement_version`; and
- matches the current user and space access revisions.

Revision mismatch may leave `isConnected=true` while occupancy is false. Never
force the current user into occupancy or capacity when these predicates fail.

## Availability

`users.status` stores the preference `online`, `away`, or `busy`. Legacy
`offline` values normalize to `online` for connected users. Display status is:

- disconnected: `offline`;
- connected plus `away`: `away`;
- connected plus `busy`: `busy`;
- otherwise connected: `online`.

Availability does not create a lease and is not used for authorization,
occupancy, capacity, or responder eligibility.

## Logs and time

`space_presence_log` is historical/audit state updated inside atomic movement;
it is not a lease or grace credential. A delayed reconciliation closes open logs
at its operation time after its five-minute qualifying-lease grace check; it does
not backdate them to lease disconnect or expiry. Lease comparisons use
snapshot/database time, never browser time.
