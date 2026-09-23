---
name: presence-safety
description: >
  Use when changing or diagnosing Virtual Office presence, its sessions,
  Realtime, movement, occupancy, or Knock, including private access and
  related database contracts or rollout.
---

# Presence Safety

Presence is a distributed, concurrency-sensitive subsystem. Database state and
locked database functions are authoritative. Browser state, Realtime payloads,
and local storage are hints or invalidation signals only.

## Read before acting

Select references by the behavior or contract affected. Read the state model
before changing runtime behavior; documentation edits need only the references
whose instructions they affect.

| Task concerns | Read |
| --- | --- |
| Authority, identity, connection, occupancy, or finding owners | [State model and ownership](references/state-model.md) |
| Movement, leases, logout, or account/company lifecycle | [Movement and session transitions](references/transitions.md) |
| Private access, membership revisions, capacity, or Knock | [Access and capacity](references/access-capacity.md) |
| Subscriptions, reconnects, caches, or runtime diagnosis | [Realtime and debugging](references/realtime-debugging.md) |
| Selecting checks, reviewing changes, or editing these instructions | [Testing and evidence](references/testing.md) |
| Live verification, incidents, cutover, or rollout | [Active limitations](references/known-issues.md) |

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

For changes that depend on database behavior, establish the affected contract
from source and migrations before implementation. Verify it on the named
target before applying changes or claiming runtime compatibility:

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

Online changes, authorization, readback, rollback, rollout states, and reporting
are governed by [CLAUDE.md](../../../CLAUDE.md).

## Implementation and verification

Map the affected readers, writers, identities, and authority boundaries, using
the implementation map in the state-model reference. Reproduce or characterize
reported failures before editing. Preserve the invariants and reuse the
existing coordinator and RPC boundary.

Select adversarial coverage for the behavior being changed: stale state,
duplicate requests, account/company switches, retries, reconnects, multi-tab
ordering, and real concurrency where affected. Use the testing reference for
required checks and review gates; document-only edits use its instruction checks.

For runtime work, report which affected workflows are usable or still
unverified. For database/rollout work, include the named target, required
migration/RPC/runtime contract, readback evidence, and deployment compatibility.

## Conditions that block dependent work

Stop the affected action and investigate when:

- a required database contract is unknown or incompatible on the target;
- a second movement writer or check-then-write flow is being introduced;
- a target-scoped cache, channel, or mutation lacks company and user identity;
- a production or shared-test action is destructive or changes global mode;
- tests prove mocks but not the concurrency or Realtime behavior being claimed;
- code and database cannot be rolled out in a compatible order.

Continue source analysis, local preparation, and independent checks that do not
rely on the missing prerequisite. Keep the dependent runtime check, operation,
or readiness claim explicitly blocked until the prerequisite is established.
If source and these instructions disagree, reconcile the affected contract
before changing that behavior; do not invent a second authority.
