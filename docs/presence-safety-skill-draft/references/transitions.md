# Transitions

## Movement ownership

Manual, automatic, Knock-approved, teleport, and leave placement changes enter
the central location-transition coordinator. Logout bypasses that client
coordinator and calls `/api/presence/logout` directly. The coordinator
calls the atomic Presence route; the database function performs locked
authorization, capacity, version checks, session/log updates, and the placement
write in one transaction.

Selection callbacks update UI and advisory hints only. They do not call another
movement transport. The users-location endpoint remains a gated legacy writer:
atomic runtime rejects it, but legacy code still contains status, placement,
presence-log, and Knock mutation behavior.

## Result discipline

Callers act only on a typed committed result for their current intent and
identity. These are not success:

- deduplication or an in-flight skip;
- stale intent/session/identity generation;
- zero affected rows;
- a request accepted before post-lock revalidation;
- an optimistic cache mutation;
- a same-target placement without renewed authorization;
- a 426 compatibility response.

After commit, await any scoped snapshot query that is already fetching, then
fetch an authoritative snapshot, validate its identity, and replace the scoped
cache. Re-check intent after each awaited coordinator step before selecting UI,
opening chat, persisting a hint, or showing success. The `useUserCalling`
acceptance flow currently lacks an additional intent or identity fence after
`updateLocation`; it can await conversation creation and message delivery before
marking the call accepted.

## Manual versus automatic ordering

Every accepted placement command advances a server-owned location version.
Automatic and Knock follow-up commands carry the version they observed. A later
manual command makes delayed work stale in every tab. Per-tab refs, timers,
debounce keys, and React generations are useful local fences but cannot replace
the database compare-and-set.

Explicit Leave suppresses automatic placement until a later, defined recovery
event. Automatic fallback follows home/default/workspace policy and never
overwrites a different committed placement.

## Sessions and tabs

One login's tabs share an auth-session identity but own independent registration
leases. Closing one tab retires or lets only that tab's lease expire; another
active tab keeps the user connected. Registration IDs are idempotency keys, not
authority to choose a server session ID. An expired or retired session ID is
never reactivated by refreshing timestamps; create a new server session.

Registration requires current app-user and company identities. `NO_COMPANY`,
verified auth-session revocation, or company-scope mismatch is terminal for that
lifecycle and triggers scoped teardown instead of retrying indefinitely.

## Logout and auth/membership lifecycle

Server logout serializes on the user, records the exact-auth-session fence,
retires matching leases, closes qualifying logs, and clears final placement only
when no valid session remains. Client sign-out then clears cache, storage,
channel, session state, timers, and in-flight ownership for the old scope.

Auth identity changes and membership-scope invalidation advance
`authGeneration` before reload. A confirmed role update instead mirrors state
under its captured mutation scope without advancing `authGeneration` or
invalidating the Presence lifecycle. Old bootstrap responses
cannot commit after the fence. Membership entry atomically removes any legacy
companyless placement, active lease, or open log before assigning a new company.

## Membership writer lock order

Overlapping writers use ordered user rows, company, invitations, target space,
sessions, then logs. They reauthorize after acquiring the relevant locks.
Company membership, role, `admin_ids`, invitations, placement cleanup, session
retirement, log closure, and access revisions commit or roll back together.
