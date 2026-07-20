---
name: presence-safety
description: >
  Mandatory safety guide for every Virtual Office change involving presence,
  sessions, realtime, space placement, movement, occupancy, private-space
  access, Knock, presence database contracts, migrations, rollout, or
  production incidents. Use before editing or diagnosing any of these areas.
---

# Presence Safety

Presence is a distributed, concurrency-sensitive subsystem. Database state and
locked database functions are authoritative. Browser state, Realtime payloads,
and local storage are hints or invalidation signals only.

## Read before acting

Read the references relevant to the task:

- [State model and ownership](references/state-model.md)
- [Movement and session transitions](references/transitions.md)
- [Access and capacity](references/access-capacity.md)
- [Realtime and debugging](references/realtime-debugging.md)
- [Testing and evidence](references/testing.md)
- [Active limitations](references/known-issues.md)

## Current implementation map

- PresenceContext composes the subsystem; it is not a second state machine.
- usePresenceSession registers, heartbeats, and disconnects leases through
  /api/presence/sessions.
- usePresenceSnapshot and useUserPresence expose the authoritative,
  company-scoped snapshot.
- usePresenceRealtime listens on a private company topic and only invalidates or
  refetches the snapshot. Realtime payloads do not directly become authority.
- useLocationTransition and the transition coordinator own movement requests.
- useLastSpace may request automatic placement only through that coordinator
  and uses company-and-user-scoped hints.
- /api/presence/location calls the observed atomic location transition.
- /api/users/location remains a gated legacy writer. Never call or extend it;
  new feature movement uses /api/presence/location.
- Browser storage keys must use the vo:presence:<company>:<user>:... namespace.

Inspect the current source before relying on this map. If implementation and
skill disagree, stop and reconcile the discrepancy instead of guessing.

## Non-negotiable invariants

1. The database is the authority for leases, placement, access, and capacity.
2. Connection is derived from live leases. Space occupancy additionally needs
   matching active placement and session/version state.
3. Availability status is not connection truth.
4. All movement goes through one client coordinator and one atomic database
   transition. Never add a parallel writer or check-then-write path.
5. Automatic placement cannot override a newer manual action.
6. Private access, membership revision, capacity, placement, and Knock
   consumption are decided under the same database locks.
7. Realtime is an invalidation mechanism. Reconcile from the authoritative
   snapshot after subscribe, reconnect, drift, or ambiguous events.
8. Every cache, storage key, channel, mutation, and invalidation is scoped by
   both company and application user identity.
9. A successful HTTP response means the committed transition result, not merely
   that a request was accepted.
10. Retries have a capped delay, cancellation, and explicit classification.
    Missing database contracts, permission failures, and invalid state surface as
    actionable incompatibilities instead of generic retryable errors.

## Presence database compatibility

Follow the repository-wide communication and operational handoff contract in
CLAUDE.md. Do not repeat or weaken it here.

For Presence specifically, verify before implementation and again on the named
target:

- session, heartbeat, disconnect, transition, snapshot, reconciliation, and
  Knock RPC names, signatures, grants, and result shapes;
- runtime-control mode, required indexes, triggers, RLS, cron, lease timing, and
  migration order;
- a rollout order that never points new application code at a missing database
  contract.

Do not classify a missing RPC, incompatible signature, disabled runtime mode, or
permission contract as a generic transient failure. Surface the incompatibility,
stop the affected workflow, and report the application as not ready until the
named database and deployment are compatible.

Online changes, authorization, readback, rollback, and the four rollout states
are governed by CLAUDE.md.

## Safe workflow

1. Map readers, writers, authority boundaries, identities, and target database.
2. State the database/rollout impact immediately.
3. Reproduce or characterize the failure before editing.
4. Preserve the invariants and reuse the existing coordinator and RPC boundary.
5. Add adversarial tests for stale state, duplicate requests, account/company
   switches, retries, reconnects, multi-tab behavior, and real concurrency.
6. Run focused tests, typecheck, relevant gates, and target health checks.
7. Request both Presence Safety and Supabase RLS review after implementation.
8. Resolve findings, rerun evidence, and produce the human handoff below.

## Required human handoff

Use the exact final-report order from CLAUDE.md. For Presence:

- Outcome states whether session registration, movement, avatars, Realtime, and
  private-room entry are usable now.
- Database names the target, required migration/RPC/runtime contract, and whether
  direct readback proved it online.
- Deployment states whether the running application is compatible with that
  target.
- What you need to do now is Nothing or a numbered, plain-language action list.

Do not lead with phase numbers, runner names, manifests, candidate models,
judges, raw logs, or internal test machinery. If technically relevant, place
them in an optional technical note and explain each term in one sentence.

## Stop conditions

Stop and investigate before proceeding when:

- the online database contract is unknown or incompatible;
- a second movement writer or check-then-write flow is being introduced;
- a target-scoped cache, channel, or mutation lacks company and user identity;
- a production or shared-test action is destructive or changes global mode;
- tests prove mocks but not the concurrency or Realtime behavior being claimed;
- code and database cannot be rolled out in a compatible order.
