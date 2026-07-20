---
name: presence-safety
description: >
  Mandatory safety guide for Virtual Office presence, Realtime, placement,
  membership lifecycle, capacity, private-space access, and Knock changes.
  Consult it before changing any Presence client, server route, database
  function, policy, migration, cache key, storage hint, or space UI that can
  affect connection, occupancy, movement, logout, reconnection, or access.
---

# Archived Presence safety candidate

This directory is retained only as historical Phase 9 evaluation input. It is
not the active agent instruction and may contain superseded rollout blockers.
Use the canonical skill at .agents/skills/presence-safety/SKILL.md instead.

## Required reading

Read all references relevant to the change before editing:

- [State model](references/state-model.md) for authority, identity, connection,
  placement, occupancy, and availability.
- [Transitions](references/transitions.md) for movement, session, membership,
  logout, reconciliation, and multi-tab ordering.
- [Access and capacity](references/access-capacity.md) for private rooms,
  Knock, revisions, locking, and authoritative counts.
- [Realtime and debugging](references/realtime-debugging.md) for invalidation,
  polling, reconnects, cache scope, and evidence collection.
- [Testing](references/testing.md) for the required test layer and exit gates.
- [Known issues](references/known-issues.md) for active evidence blockers only.

## Non-negotiable invariants

1. The database owns placement and every security decision. Browser state,
   local storage, Realtime payloads, client time, `users.status`, and
   `last_active` are never authorization facts.
2. Connection requires an active, unexpired, exact-auth-session lease that is
   not revoked. Occupancy additionally requires matching placement, location
   version, session space, user access revision, and space access revision.
3. Availability (`online`, `away`, `busy`) is preference, not connectivity.
   A disconnected user displays offline and never consumes capacity or appears
   as an occupant, including the current user.
4. All movement goes through the central transition coordinator and the atomic
   server/database transition. A UI callback never adds a second transport.
   A skipped, deduplicated, stale, or zero-row result is not success.
5. A same-target move still reauthorizes access and capacity and renews or
   replaces the exact lease before reporting success.
6. Manual intent supersedes delayed automatic intent across tabs through
   server-owned monotonic versions and compare-and-set preconditions. A React
   ref or per-tab generation alone is insufficient.
7. Private access is decided after locks from current membership, role, space
   ACL/status/revision, exact lease state, and a valid single-use Knock approval
   when required. Old logs, recent activity, or stale placement grant nothing.
8. Browser clients never mutate Presence sessions, placement logs, or Knock
   rows directly. Service-role code stays server-only and reauthorizes inside a
   narrowly granted, locked database function.
9. Realtime is acceleration only. One private company channel carries only
   version/invalidation metadata; every event and every subscribe/reconnect
   causes an authoritative scoped refetch. A 30-second visible poll is the
   degraded fallback.
10. Cache, storage, channel, registration, and in-flight work are scoped by
    company plus app-user identity. Logout, account switch, membership change,
    verified session revocation, and snapshot identity mismatch fence old work
    before a new scope can commit.
11. Membership, role/admin lists, invitations, placement cleanup, sessions,
    logs, and access revisions change atomically with one documented lock order.
12. Security claims require evidence at the correct layer. Mocked route tests
    cannot prove RLS, grants, locking, concurrency, browser lifecycle, or
    deployment readback.

## Workflow

1. Inspect the current source, migrations, diff, and active evidence. Do not
   rely on approximate line numbers or historical live-infrastructure claims.
2. Identify the authority and transition being changed, then read the matching
   references above.
3. Add a regression test at the layer where the invariant can fail.
4. Preserve the source-of-truth hierarchy and lock order. If existing code or a
   test conflicts with it, treat that conflict as a defect to investigate.
5. Run the movement guard, focused tests, real-Postgres tests for database
   claims, browser tests for lifecycle claims, type-check, lint, build, and the
   zero-critical-skip guard as applicable.
6. After any Presence or Supabase change, request the mandatory read-only
   Presence and RLS reviews. Resolve every blocker/risk or document a user-
   accepted residual.
7. Never probe production with service-role mutation. Use disposable local
   Postgres or an explicitly approved staging environment and retain readback.
8. Completion is user-gated. Report `Status: Pending user confirmation` until
   runtime and rollout evidence is confirmed by the user.

## Stop conditions

Stop and report the blocker when required local Postgres, browser identities,
approved staging/production authority, evaluator runner/models, migration
readback, or observation-window evidence is unavailable. Never replace a
missing required layer with mocks, skips, static phrase matching, or an
assumption.
